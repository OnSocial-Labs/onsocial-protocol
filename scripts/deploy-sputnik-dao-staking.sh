#!/usr/bin/env bash
#
# Deploy a Sputnik DAO staking contract (sputnik_staking.wasm) for governance or treasury.
#
# Example (treasury testnet):
#   ./scripts/deploy-sputnik-dao-staking.sh \
#     --network testnet \
#     --staking-account staking-treasury.onsocial.testnet \
#     --owner-id treasury.onsocial.testnet \
#     --master-account onsocial.testnet \
#     --init-file deployment/governance-dao/staking-treasury.init.testnet.json \
#     --token-account token.onsocial.testnet \
#     --funding-account onsocial.testnet
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

NETWORK="testnet"
STAKING_ACCOUNT=""
OWNER_ID=""
MASTER_ACCOUNT=""
INIT_FILE=""
TOKEN_ACCOUNT=""
FUNDING_ACCOUNT=""
CREATE_BALANCE="5"
SKIP_CREATE=0
SKIP_TOKEN_REGISTER=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/deploy-sputnik-dao-staking.sh [options]

Required:
  --staking-account <id>   Staking contract account (e.g. staking-treasury.onsocial.testnet)
  --owner-id <id>          DAO owner_id for staking new() (treasury or governance DAO)
  --master-account <id>    Parent account used to create the subaccount if missing
  --init-file <path>       JSON init args (owner_id, token_id, unstake_period)

Optional:
  --network testnet|mainnet   Default: testnet
  --token-account <id>        FT contract for storage_deposit on staking account
  --funding-account <id>      Pays create/deploy/register (default: master-account)
  --create-balance <near>     NEAR for new subaccount (default: 5)
  --skip-create               Do not attempt subaccount creation
  --skip-token-register       Skip token storage_deposit for staking account
  --dry-run                   Print commands without executing
  -h, --help

Credentials:
  Uses ~/.near-credentials/<network>/ via NEAR CLI legacy keychain (same as deploy.sh).

After deploy, submit DAO proposals from deployment/governance-dao/:
  1. set-staking-contract.treasury.<network>.proposal.json
  2. delegated-proposers.treasury-transfer-only.<network>.proposal.json
EOF
}

log() {
  printf '%s\n' "$*"
}

run_cmd() {
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] $*"
    return 0
  fi
  log "+ $*"
  "$@"
}

account_exists() {
  local account_id="$1"
  near account view-account-summary "$account_id" "network-config" "$NETWORK" >/dev/null 2>&1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --staking-account)
      STAKING_ACCOUNT="$2"
      shift 2
      ;;
    --owner-id)
      OWNER_ID="$2"
      shift 2
      ;;
    --master-account)
      MASTER_ACCOUNT="$2"
      shift 2
      ;;
    --init-file)
      INIT_FILE="$2"
      shift 2
      ;;
    --token-account)
      TOKEN_ACCOUNT="$2"
      shift 2
      ;;
    --funding-account)
      FUNDING_ACCOUNT="$2"
      shift 2
      ;;
    --create-balance)
      CREATE_BALANCE="$2"
      shift 2
      ;;
    --skip-create)
      SKIP_CREATE=1
      shift
      ;;
    --skip-token-register)
      SKIP_TOKEN_REGISTER=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$STAKING_ACCOUNT" ] || [ -z "$OWNER_ID" ] || [ -z "$MASTER_ACCOUNT" ] || [ -z "$INIT_FILE" ]; then
  usage >&2
  exit 1
fi

if [ ! -f "$INIT_FILE" ]; then
  INIT_FILE="$REPO_ROOT/$INIT_FILE"
fi
if [ ! -f "$INIT_FILE" ]; then
  echo "Init file not found: $INIT_FILE" >&2
  exit 1
fi

FUNDING_ACCOUNT="${FUNDING_ACCOUNT:-$MASTER_ACCOUNT}"
if [ -z "$TOKEN_ACCOUNT" ]; then
  if [ "$NETWORK" = "mainnet" ]; then
    TOKEN_ACCOUNT="token.onsocial.near"
  else
    TOKEN_ACCOUNT="token.onsocial.testnet"
  fi
fi

command -v near >/dev/null 2>&1 || {
  echo "near CLI is required" >&2
  exit 1
}

ARTIFACTS_DIR="$REPO_ROOT/deployment/governance-dao/artifacts"
STAKING_WASM="$ARTIFACTS_DIR/sputnik_staking.wasm"

if [ ! -f "$STAKING_WASM" ]; then
  log "Sputnik staking WASM missing; building artifacts..."
  run_cmd "$REPO_ROOT/scripts/prepare_sputnik_dao_artifacts.sh"
fi

if [ ! -f "$STAKING_WASM" ]; then
  echo "Expected WASM not found: $STAKING_WASM" >&2
  exit 1
fi

CREDS_FILE="$HOME/.near-credentials/$NETWORK/$STAKING_ACCOUNT.json"
if [ "$SKIP_CREATE" = "0" ] && ! account_exists "$STAKING_ACCOUNT"; then
  log "Creating subaccount $STAKING_ACCOUNT (key saved to ~/.near-credentials/$NETWORK/)"
  run_cmd near account create-account "$STAKING_ACCOUNT" use-auto-generated-key save-to-legacy-keychain \
    fund-myself "$CREATE_BALANCE" NEAR sign-as "$MASTER_ACCOUNT" network-config "$NETWORK"
  if [ "$DRY_RUN" = "0" ] && [ -f "$CREDS_FILE" ]; then
    log "Credentials: $CREDS_FILE"
  fi
elif account_exists "$STAKING_ACCOUNT"; then
  log "Account already exists: $STAKING_ACCOUNT"
else
  log "Skipping account creation (--skip-create)"
fi

log "Deploying sputnik_staking.wasm to $STAKING_ACCOUNT (owner_id=$OWNER_ID)"
run_cmd near contract deploy "$STAKING_ACCOUNT" use-file "$STAKING_WASM" \
  with-init-call new file-args "$INIT_FILE" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  network-config "$NETWORK" sign-with-legacy-keychain send

if [ "$SKIP_TOKEN_REGISTER" = "0" ]; then
  log "Registering $STAKING_ACCOUNT on $TOKEN_ACCOUNT (storage)"
  run_cmd near contract call-function as-transaction "$TOKEN_ACCOUNT" storage_deposit \
    json-args "{\"account_id\":\"$STAKING_ACCOUNT\",\"registration_only\":true}" \
    prepaid-gas '30 Tgas' attached-deposit '0.125 NEAR' \
    sign-as "$FUNDING_ACCOUNT" network-config "$NETWORK" sign-with-legacy-keychain send
fi

log ""
log "Staking contract deployed."
log "Verify owner:"
log "  near contract call-function as-read-only $STAKING_ACCOUNT get_owner json-args '{}' network-config $NETWORK now"
log ""
log "Next: council proposals on $OWNER_ID (SetStakingContract is one-time):"
log "  NETWORK=$NETWORK node scripts/dao-proposal.mjs add --dao $OWNER_ID --signer <council> \\"
log "    --file deployment/governance-dao/set-staking-contract.treasury.$NETWORK.proposal.json"
log "  NETWORK=$NETWORK node scripts/dao-proposal.mjs vote-approve --dao $OWNER_ID --signer <council> \\"
log "    --file deployment/governance-dao/set-staking-contract.treasury.$NETWORK.proposal.json --id <ID>"
log ""
log "Then delegated proposers (500 SOCIAL, transfer-only):"
log "  NETWORK=$NETWORK node scripts/dao-proposal.mjs add --dao $OWNER_ID --signer <council> \\"
log "    --file deployment/governance-dao/delegated-proposers.treasury-transfer-only.$NETWORK.proposal.json"
log ""
log "Portal delegation UI: /governance/manage?dao=treasury"
