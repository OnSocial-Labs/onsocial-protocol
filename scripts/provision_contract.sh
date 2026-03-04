#!/usr/bin/env bash
# =============================================================================
# Provision a new contract for relayer routing
# =============================================================================
#
# Automates the 3 manual steps required BEFORE pushing code changes:
#   1. Create KMS pool keys in GCP (one per keyring per contract)
#   2. Register those keys on-chain as FunctionCall access keys
#   3. Register the relayer as an intents executor on the contract
#
# After running this script, update docker-compose.yml:
#   - Bump GCP_KMS_POOL_SIZE (shown at the end)
#   - Add contract to RELAYER_ALLOWED_CONTRACTS if using env-var override
# Then `git push` — the CI will deploy automatically.
#
# Usage:
#   ./scripts/provision_contract.sh <contract_account> [options]
#
# Examples:
#   ./scripts/provision_contract.sh scarces.onsocial.testnet
#   ./scripts/provision_contract.sh rewards.onsocial.testnet --keys-per-instance 3
#   ./scripts/provision_contract.sh scarces.onsocial.near --network mainnet
#   ./scripts/provision_contract.sh scarces.onsocial.testnet --dry-run
#
# Options:
#   --network <testnet|mainnet>   Network (auto-detected from contract name)
#   --keys-per-instance <N>       Keys per relayer instance (default: 3)
#   --dry-run                     Show what would be done without executing
#   --skip-kms                    Skip KMS key creation (keys already exist)
#   --skip-register               Skip on-chain key registration
#   --skip-executor               Skip intents executor registration
#
# Prerequisites:
#   - gcloud CLI authenticated (`gcloud auth login`)
#   - NEAR CLI (`near-cli-rs` or `near-cli`)
#   - Contract owner credentials in ~/.near-credentials/
#   - Node.js (for register_kms_keys.mjs)
#
# Environment:
#   GCP_KMS_PROJECT    GCP project (default: onsocial-protocol)
#   GCP_KMS_LOCATION   KMS location (default: global)
#   CONTRACT_OWNER     Contract owner account (default: onsocial.testnet)
#   RELAYER_ACCOUNT    Relayer account (default: relayer.onsocial.testnet)
# =============================================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
step()  { echo -e "\n${BLUE}${BOLD}── $1 ──${NC}"; }
dry()   { echo -e "${YELLOW}  [dry-run] $1${NC}"; }

# ── Parse arguments ────────────────────────────────────────────────
CONTRACT_ACCOUNT="${1:-}"
KEYS_PER_INSTANCE=3
DRY_RUN=false
SKIP_KMS=false
SKIP_REGISTER=false
SKIP_EXECUTOR=false
NETWORK=""

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)        NETWORK="$2"; shift 2 ;;
    --keys-per-instance) KEYS_PER_INSTANCE="$2"; shift 2 ;;
    --dry-run)        DRY_RUN=true; shift ;;
    --skip-kms)       SKIP_KMS=true; shift ;;
    --skip-register)  SKIP_REGISTER=true; shift ;;
    --skip-executor)  SKIP_EXECUTOR=true; shift ;;
    *)                error "Unknown option: $1" ;;
  esac
done

if [[ -z "$CONTRACT_ACCOUNT" ]]; then
  echo "Usage: $0 <contract_account> [options]"
  echo ""
  echo "Examples:"
  echo "  $0 scarces.onsocial.testnet"
  echo "  $0 rewards.onsocial.testnet --keys-per-instance 3"
  echo "  $0 scarces.onsocial.near --network mainnet"
  echo "  $0 scarces.onsocial.testnet --dry-run"
  exit 1
fi

# ── Auto-detect network ────────────────────────────────────────────
if [[ -z "$NETWORK" ]]; then
  if [[ "$CONTRACT_ACCOUNT" == *.near ]]; then
    NETWORK="mainnet"
  else
    NETWORK="testnet"
  fi
fi

IS_MAINNET=$([[ "$NETWORK" == "mainnet" ]] && echo true || echo false)

# ── Defaults based on network ─────────────────────────────────────
NEAR_SUFFIX=$($IS_MAINNET && echo "onsocial.near" || echo "onsocial.testnet")
CONTRACT_OWNER="${CONTRACT_OWNER:-$NEAR_SUFFIX}"
RELAYER_ACCOUNT="${RELAYER_ACCOUNT:-relayer.$NEAR_SUFFIX}"
RPC_URL=$($IS_MAINNET && echo "https://free.rpc.fastnear.com" || echo "https://test.rpc.fastnear.com")

GCP_KMS_PROJECT="${GCP_KMS_PROJECT:-onsocial-protocol}"
GCP_KMS_LOCATION="${GCP_KMS_LOCATION:-global}"

# Keyrings per instance
if $IS_MAINNET; then
  KEYRINGS=("relayer-keys-mainnet" "relayer-keys-mainnet-inst-1")
else
  KEYRINGS=("relayer-keys-testnet" "relayer-keys-inst-1")
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Print plan ─────────────────────────────────────────────────────
echo ""
echo "======================================================================"
echo "  Provision Contract for Relayer Routing"
echo "======================================================================"
echo ""
echo "  Contract:          $CONTRACT_ACCOUNT"
echo "  Network:           $NETWORK"
echo "  Relayer:           $RELAYER_ACCOUNT"
echo "  Contract Owner:    $CONTRACT_OWNER"
echo "  Keys/Instance:     $KEYS_PER_INSTANCE"
echo "  Keyrings:          ${KEYRINGS[*]}"
echo "  GCP Project:       $GCP_KMS_PROJECT"
echo "  Dry Run:           $DRY_RUN"
echo ""

# ── Prerequisite checks ───────────────────────────────────────────
step "Checking prerequisites"

if ! command -v gcloud &>/dev/null; then
  # Try common install locations
  for p in "$HOME/google-cloud-sdk/bin/gcloud" "/usr/lib/google-cloud-sdk/bin/gcloud" "/snap/bin/gcloud"; do
    if [[ -x "$p" ]]; then
      export PATH="$(dirname "$p"):$PATH"
      break
    fi
  done
fi
command -v gcloud &>/dev/null || error "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
info "gcloud CLI found"

command -v node &>/dev/null || error "Node.js not found"
info "Node.js found"

# Verify gcloud auth
GCLOUD_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)
if [[ -z "$GCLOUD_ACCOUNT" ]]; then
  error "Not authenticated with gcloud. Run: gcloud auth login"
fi
info "Authenticated as: $GCLOUD_ACCOUNT"

# ── Step 1: Discover existing pool keys ────────────────────────────
step "Step 1: Discovering existing KMS pool keys"

# Find the highest existing pool-key-N across all keyrings to determine starting index
MAX_KEY_INDEX=-1
for KEYRING in "${KEYRINGS[@]}"; do
  EXISTING_KEYS=$(gcloud kms keys list \
    --project="$GCP_KMS_PROJECT" \
    --location="$GCP_KMS_LOCATION" \
    --keyring="$KEYRING" \
    --format="value(name)" 2>/dev/null | grep -oP 'pool-key-\K\d+' | sort -n || true)
  
  if [[ -n "$EXISTING_KEYS" ]]; then
    LAST=$(echo "$EXISTING_KEYS" | tail -1)
    if (( LAST > MAX_KEY_INDEX )); then
      MAX_KEY_INDEX=$LAST
    fi
    echo "  $KEYRING: pool-key-{$(echo "$EXISTING_KEYS" | head -1)..$(echo "$EXISTING_KEYS" | tail -1)}"
  else
    echo "  $KEYRING: no pool keys found"
  fi
done

START_INDEX=$((MAX_KEY_INDEX + 1))
END_INDEX=$((START_INDEX + KEYS_PER_INSTANCE - 1))
NEW_POOL_SIZE=$((END_INDEX + 1))

echo ""
info "Will create pool-key-$START_INDEX through pool-key-$END_INDEX in each keyring"
info "New GCP_KMS_POOL_SIZE will be: $NEW_POOL_SIZE"

# ── Step 2: Create KMS keys ───────────────────────────────────────
if ! $SKIP_KMS; then
  step "Step 2: Creating KMS keys in GCP"
  
  CREATED=0
  EXISTED=0

  for KEYRING in "${KEYRINGS[@]}"; do
    echo ""
    echo "  Keyring: $KEYRING"
    for IDX in $(seq "$START_INDEX" "$END_INDEX"); do
      KEY_NAME="pool-key-$IDX"
      
      # Check if key already exists
      if gcloud kms keys describe "$KEY_NAME" \
        --project="$GCP_KMS_PROJECT" \
        --location="$GCP_KMS_LOCATION" \
        --keyring="$KEYRING" &>/dev/null; then
        echo "    $KEY_NAME — already exists"
        ((EXISTED++))
        continue
      fi

      if $DRY_RUN; then
        dry "gcloud kms keys create $KEY_NAME --keyring=$KEYRING --purpose=asymmetric-signing --default-algorithm=ec-sign-ed25519"
      else
        gcloud kms keys create "$KEY_NAME" \
          --project="$GCP_KMS_PROJECT" \
          --location="$GCP_KMS_LOCATION" \
          --keyring="$KEYRING" \
          --purpose=asymmetric-signing \
          --default-algorithm=ec-sign-ed25519 \
          --protection-level=hsm
        echo "    $KEY_NAME — created ✓"
        ((CREATED++))
      fi
    done
  done

  echo ""
  info "KMS keys: $CREATED created, $EXISTED already existed"
else
  warn "Skipping KMS key creation (--skip-kms)"
fi

# ── Step 3: Get public keys from KMS ──────────────────────────────
step "Step 3: Collecting public keys from KMS"

declare -A PUBKEYS  # PUBKEYS["keyring:pool-key-N"] = "ed25519:..."
ALL_PUBKEYS=()

if $DRY_RUN; then
  dry "Would collect public keys for pool-key-{$START_INDEX..$END_INDEX} from each keyring"
else
  for KEYRING in "${KEYRINGS[@]}"; do
    echo ""
    echo "  Keyring: $KEYRING"
    for IDX in $(seq "$START_INDEX" "$END_INDEX"); do
      KEY_NAME="pool-key-$IDX"
      
      # Get PEM public key
      PEM=$(gcloud kms keys versions get-public-key 1 \
        --project="$GCP_KMS_PROJECT" \
        --location="$GCP_KMS_LOCATION" \
        --keyring="$KEYRING" \
        --key="$KEY_NAME" 2>/dev/null)
      
      if [[ -z "$PEM" ]]; then
        error "Failed to get public key for $KEYRING/$KEY_NAME"
      fi
      
      # PEM → raw 32-byte Ed25519 → base58 → ed25519:...
      RAW_B64=$(echo "$PEM" | grep -v '^-----' | tr -d '\n')
      # DER-encoded Ed25519 public key: 12-byte header + 32-byte key
      NEAR_PUBKEY=$(node -e "
        const der = Buffer.from('$RAW_B64', 'base64');
        const raw = der.subarray(der.length - 32);
        const bs58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        function toBase58(bytes) {
          let num = BigInt(0);
          for (const b of bytes) num = num * 256n + BigInt(b);
          let s = '';
          while (num > 0n) { s = bs58[Number(num % 58n)] + s; num /= 58n; }
          for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
          return s;
        }
        console.log('ed25519:' + toBase58(raw));
      ")
      
      PUBKEYS["$KEYRING:$KEY_NAME"]="$NEAR_PUBKEY"
      ALL_PUBKEYS+=("$NEAR_PUBKEY")
      echo "    $KEY_NAME → $NEAR_PUBKEY"
    done
  done

  # Deduplicate (same key might exist in both keyrings — shouldn't, but check)
  UNIQUE_PUBKEYS=($(printf '%s\n' "${ALL_PUBKEYS[@]}" | sort -u))
  info "${#UNIQUE_PUBKEYS[@]} unique public keys collected"
fi

# ── Step 4: Register keys on-chain ────────────────────────────────
if ! $SKIP_REGISTER; then
  step "Step 4: Registering FunctionCall access keys on-chain"
  echo "  Contract: $CONTRACT_ACCOUNT"
  echo "  Relayer:  $RELAYER_ACCOUNT"
  echo ""

  REGISTERED=0
  ALREADY=0
  FAILED=0

  if $DRY_RUN; then
    dry "Would register ${KEYS_PER_INSTANCE} keys × ${#KEYRINGS[@]} keyrings for $CONTRACT_ACCOUNT on $RELAYER_ACCOUNT"
  else
  for KEYRING in "${KEYRINGS[@]}"; do
    echo "  Keyring: $KEYRING"
    for IDX in $(seq "$START_INDEX" "$END_INDEX"); do
      KEY_NAME="pool-key-$IDX"
      PUBKEY="${PUBKEYS["$KEYRING:$KEY_NAME"]}"
      
      echo -n "    $KEY_NAME ($PUBKEY) → "

      # Use the KMS admin signer via register_kms_keys.mjs for the actual registration
      # But since that script registers all keys at once, we'll use near CLI directly
      # with the admin key signing via KMS
      RESULT=$(node -e "
        import { Account, JsonRpcProvider } from 'near-api-js';
        import { KmsSigner } from './scripts/lib/kms-signer.mjs';

        const signer = await KmsSigner.create({
          project:  '$GCP_KMS_PROJECT',
          location: '$GCP_KMS_LOCATION',
          keyring:  '$KEYRING',
          keyName:  'admin-key',
        });
        const provider = new JsonRpcProvider({ url: '$RPC_URL' });
        const account = new Account('$RELAYER_ACCOUNT', provider, signer);
        
        try {
          const result = await account.addFunctionCallAccessKey({
            publicKey: '$PUBKEY',
            contractId: '$CONTRACT_ACCOUNT',
            methodNames: ['execute'],
            allowance: BigInt('1000000000000000000000000'),
          });
          console.log('OK:' + result.transaction.hash);
        } catch (err) {
          if (err.message?.includes('already exists')) {
            console.log('EXISTS');
          } else {
            console.log('FAIL:' + err.message);
          }
        }
      " 2>/dev/null || echo "FAIL:node error")
      
      if [[ "$RESULT" == OK:* ]]; then
        echo "registered ✓ (TX: ${RESULT#OK:})"
        ((REGISTERED++))
      elif [[ "$RESULT" == "EXISTS" ]]; then
        echo "already registered"
        ((ALREADY++))
      else
        echo "FAILED: ${RESULT#FAIL:}"
        ((FAILED++))
      fi
    done
    echo ""
  done

  info "On-chain keys: $REGISTERED registered, $ALREADY existed, $FAILED failed"
  if (( FAILED > 0 )); then
    warn "Some keys failed to register — check output above"
  fi
  fi  # end dry-run else
else
  warn "Skipping on-chain key registration (--skip-register)"
fi

# ── Step 5: Register relayer as intents executor ──────────────────
if ! $SKIP_EXECUTOR; then
  step "Step 5: Registering relayer as intents executor on $CONTRACT_ACCOUNT"
  
  if $DRY_RUN; then
    dry "Would call $CONTRACT_ACCOUNT.add_intents_executor({executor: '$RELAYER_ACCOUNT'})"
  else
    # Check if already an executor by querying contract info  
    IS_EXECUTOR=$(node -e "
      const resp = await fetch('$RPC_URL', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'query',
          params: {
            request_type: 'call_function',
            finality: 'final',
            account_id: '$CONTRACT_ACCOUNT',
            method_name: 'get_contract_info',
            args_base64: Buffer.from('{}').toString('base64')
          }
        })
      });
      const data = await resp.json();
      if (data.result?.result) {
        const info = JSON.parse(Buffer.from(data.result.result).toString());
        const executors = info.intents_executors || [];
        console.log(executors.includes('$RELAYER_ACCOUNT') ? 'YES' : 'NO');
      } else {
        console.log('UNKNOWN');
      }
    " 2>/dev/null || echo "UNKNOWN")
    
    if [[ "$IS_EXECUTOR" == "YES" ]]; then
      info "$RELAYER_ACCOUNT is already an intents executor on $CONTRACT_ACCOUNT"
    elif [[ "$IS_EXECUTOR" == "NO" || "$IS_EXECUTOR" == "UNKNOWN" ]]; then
      echo "  Calling add_intents_executor..."
      
      # Find contract owner credentials
      CREDS_FILE="$HOME/.near-credentials/$NETWORK/$CONTRACT_OWNER.json"
      if [[ ! -f "$CREDS_FILE" ]]; then
        CREDS_FILE="$HOME/.near-credentials/$NETWORK/$CONTRACT_ACCOUNT.json"
      fi
      if [[ ! -f "$CREDS_FILE" ]]; then
        warn "No credentials found for $CONTRACT_OWNER or $CONTRACT_ACCOUNT"
        warn "Manually run: near call $CONTRACT_ACCOUNT add_intents_executor '{\"executor\": \"$RELAYER_ACCOUNT\"}' --accountId $CONTRACT_OWNER --networkId $NETWORK"
      else
        RESULT=$(node -e "
          import { readFileSync } from 'fs';
          import { Account, JsonRpcProvider, InMemorySigner, KeyStore } from 'near-api-js';
          import { InMemoryKeyStore } from 'near-api-js/lib/key_stores/index.js';
          import { KeyPair } from 'near-api-js/lib/utils/key_pair.js';
          
          const creds = JSON.parse(readFileSync('$CREDS_FILE', 'utf8'));
          const keyStore = new InMemoryKeyStore();
          await keyStore.setKey('$NETWORK', '$CONTRACT_OWNER', KeyPair.fromString(creds.private_key));
          
          const provider = new JsonRpcProvider({ url: '$RPC_URL' });
          const signer = new InMemorySigner(keyStore);
          const account = new Account('$CONTRACT_OWNER', provider, signer);
          
          try {
            const result = await account.functionCall({
              contractId: '$CONTRACT_ACCOUNT',
              methodName: 'add_intents_executor',
              args: { executor: '$RELAYER_ACCOUNT' },
              gas: BigInt('30000000000000'),
            });
            console.log('OK:' + result.transaction.hash);
          } catch (err) {
            if (err.message?.includes('already') || err.message?.includes('Already')) {
              console.log('EXISTS');
            } else {
              console.log('FAIL:' + err.message);
            }
          }
        " 2>/dev/null || echo "FAIL:node error")
        
        if [[ "$RESULT" == OK:* ]]; then
          info "Registered as executor (TX: ${RESULT#OK:})"
        elif [[ "$RESULT" == "EXISTS" ]]; then
          info "Already registered as executor"
        else
          warn "Executor registration failed: ${RESULT#FAIL:}"
          warn "Manually run: near call $CONTRACT_ACCOUNT add_intents_executor '{\"executor\": \"$RELAYER_ACCOUNT\"}' --accountId $CONTRACT_OWNER --networkId $NETWORK"
        fi
      fi
    fi
  fi
else
  warn "Skipping executor registration (--skip-executor)"
fi

# ── Step 6: Verify on-chain state ─────────────────────────────────
step "Step 6: Verifying on-chain access keys"

if ! $DRY_RUN; then
  node -e "
    const resp = await fetch('$RPC_URL', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'query',
        params: {
          request_type: 'view_access_key_list',
          finality: 'final',
          account_id: '$RELAYER_ACCOUNT'
        }
      })
    });
    const data = await resp.json();
    const keys = data.result?.keys || [];
    const fcKeys = keys.filter(k => k.access_key?.permission?.FunctionCall);
    
    // Group by receiver_id
    const byContract = {};
    for (const k of fcKeys) {
      const receiver = k.access_key.permission.FunctionCall.receiver_id;
      if (!byContract[receiver]) byContract[receiver] = [];
      byContract[receiver].push(k.public_key);
    }
    
    console.log('');
    console.log('  On-chain FunctionCall keys for $RELAYER_ACCOUNT:');
    for (const [contract, pks] of Object.entries(byContract).sort()) {
      const marker = contract === '$CONTRACT_ACCOUNT' ? ' ← target' : '';
      console.log('    ' + contract + ': ' + pks.length + ' keys' + marker);
    }
    console.log('    Total: ' + fcKeys.length + ' FunctionCall + ' + (keys.length - fcKeys.length) + ' FullAccess');
  " 2>/dev/null || warn "Could not verify on-chain state"
fi

# ── Summary ────────────────────────────────────────────────────────
step "Summary — Next Steps"

echo ""
echo "  The on-chain provisioning is complete. Now update code and push:"
echo ""
echo "  1. Update deployment/docker-compose.yml:"
echo -e "     ${BOLD}GCP_KMS_POOL_SIZE: \${GCP_KMS_POOL_SIZE:-$NEW_POOL_SIZE}${NC}"
echo ""
echo "  2. If using RELAYER_ALLOWED_CONTRACTS env var, add $CONTRACT_ACCOUNT"
echo "     (If not set, check defaults in packages/onsocial-relayer/src/config.rs)"
echo ""
echo "  3. Update register_kms_keys.mjs TARGET_CONTRACTS if needed"
echo ""
echo "  4. Push:"
echo -e "     ${BOLD}git add -A && git commit -m 'feat: add $CONTRACT_ACCOUNT to relayer [no-post]' && git push${NC}"
echo ""
echo "  The CI will build, sync config, and rolling-restart the relayers."
echo "  After deploy, verify with: curl -s https://api.onsocial.id/relay/health | jq .key_pool.per_contract"
echo ""
