#!/usr/bin/env bash
# =============================================================================
# Ensure GCP KMS keys for the NEP-366 relayer delegate signer pool
# =============================================================================
#
# Creates one keyring/admin key per relayer instance and N delegate keys named:
#   delegate-{RELAYER_INSTANCE_NAME}-key-{i}
#
# This script only prepares KMS keys. The relayer registers missing delegate
# public keys on-chain as FullAccess keys at startup using its admin signer.
#
# Examples:
#   scripts/ensure_delegate_kms_keys.sh --network testnet --dry-run
#   scripts/ensure_delegate_kms_keys.sh --network mainnet --pool-size 50
#   scripts/ensure_delegate_kms_keys.sh \
#     --instances relayer-0:relayer-keys-mainnet,relayer-1:relayer-keys-mainnet-1 \
#     --pool-size 50
#
# For a future third instance, add another instance:keyring pair:
#   --instances relayer-0:relayer-keys-mainnet,relayer-1:relayer-keys-mainnet-1,relayer-2:relayer-keys-mainnet-2

set -euo pipefail

info() {
  echo "[delegate-kms] $1"
}

error() {
  echo "[delegate-kms] ERROR: $1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  scripts/ensure_delegate_kms_keys.sh [options]

Options:
  --network <testnet|mainnet>       Network, defaults to NEAR_NETWORK or testnet
  --pool-size <N>                   Delegate keys per instance, defaults to RELAYER_DELEGATE_POOL_SIZE or 50
  --instances <instance:keyring,..>  Instance/keyring pairs
  --project <project>               GCP project, defaults to GCP_KMS_PROJECT or onsocial-protocol
  --location <location>             GCP KMS location, defaults to GCP_KMS_LOCATION or global
  --admin-key <name>                Admin key name, defaults to GCP_KMS_ADMIN_KEY or admin-key
  --dry-run                         Print actions without creating keys
  -h, --help                        Show this help
EOF
}

resolve_gcloud() {
  if [[ -n "${GCLOUD_BIN:-}" ]]; then
    [[ -x "$GCLOUD_BIN" ]] || error "GCLOUD_BIN is not executable: $GCLOUD_BIN"
    echo "$GCLOUD_BIN"
    return
  fi

  if command -v gcloud >/dev/null 2>&1; then
    command -v gcloud
    return
  fi

  if [[ -x "$HOME/google-cloud-sdk/bin/gcloud" ]]; then
    echo "$HOME/google-cloud-sdk/bin/gcloud"
    return
  fi

  error "gcloud not found. Set GCLOUD_BIN or install/source the Google Cloud SDK."
}

sanitize_instance_name() {
  local raw="$1"
  local sanitized=""
  local ch

  for ((i = 0; i < ${#raw}; i++)); do
    ch="${raw:i:1}"
    if [[ "$ch" =~ [A-Za-z0-9_-] ]]; then
      sanitized+="$ch"
    else
      sanitized+="-"
    fi
  done

  sanitized="$(printf '%s' "$sanitized" | sed 's/^-*//; s/-*$//')"
  if [[ -z "$sanitized" ]]; then
    sanitized="relayer"
  fi

  printf 'delegate-%s' "$sanitized"
}

NETWORK="${NEAR_NETWORK:-testnet}"
PROJECT="${GCP_KMS_PROJECT:-onsocial-protocol}"
LOCATION="${GCP_KMS_LOCATION:-global}"
ADMIN_KEY="${GCP_KMS_ADMIN_KEY:-admin-key}"
POOL_SIZE="${RELAYER_DELEGATE_POOL_SIZE:-50}"
INSTANCES=""
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --pool-size)
      POOL_SIZE="$2"
      shift 2
      ;;
    --instances)
      INSTANCES="$2"
      shift 2
      ;;
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --location)
      LOCATION="$2"
      shift 2
      ;;
    --admin-key)
      ADMIN_KEY="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      ;;
  esac
done

[[ "$NETWORK" == "testnet" || "$NETWORK" == "mainnet" ]] || error "--network must be testnet or mainnet"
[[ "$POOL_SIZE" =~ ^[0-9]+$ ]] || error "--pool-size must be a positive integer"
[[ "$POOL_SIZE" -gt 0 ]] || error "--pool-size must be greater than 0"

if [[ -z "$INSTANCES" ]]; then
  if [[ "$NETWORK" == "mainnet" ]]; then
    INSTANCES="relayer-0:relayer-keys-mainnet,relayer-1:relayer-keys-mainnet-1"
  else
    INSTANCES="relayer-0:relayer-keys-testnet,relayer-1:relayer-keys-inst-1"
  fi
fi

GCLOUD="$(resolve_gcloud)"

ensure_keyring() {
  local keyring="$1"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] ensure keyring $keyring"
    return
  fi

  if "$GCLOUD" kms keyrings describe "$keyring" \
      --location="$LOCATION" --project="$PROJECT" >/dev/null 2>&1; then
    echo "  keyring exists: $keyring"
  else
    "$GCLOUD" kms keyrings create "$keyring" \
      --location="$LOCATION" --project="$PROJECT"
    echo "  keyring created: $keyring"
  fi
}

ensure_key() {
  local keyring="$1"
  local key_name="$2"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "    [dry-run] ensure key $keyring/$key_name"
    return
  fi

  if "$GCLOUD" kms keys describe "$key_name" \
      --keyring="$keyring" --location="$LOCATION" --project="$PROJECT" >/dev/null 2>&1; then
    echo "    exists: $keyring/$key_name"
  else
    "$GCLOUD" kms keys create "$key_name" \
      --keyring="$keyring" \
      --location="$LOCATION" \
      --project="$PROJECT" \
      --purpose="asymmetric-signing" \
      --default-algorithm="ec-sign-ed25519"
    echo "    created: $keyring/$key_name"
  fi
}

IFS=',' read -r -a INSTANCE_SPECS <<< "$INSTANCES"

info "Network: $NETWORK"
info "Project: $PROJECT"
info "Location: $LOCATION"
info "Pool size per instance: $POOL_SIZE"
info "Instances: $INSTANCES"
if [[ "$DRY_RUN" == "true" ]]; then
  info "Dry run: no keys will be created"
fi

total_delegate_keys=$(( ${#INSTANCE_SPECS[@]} * POOL_SIZE ))
info "Target delegate KMS keys: $total_delegate_keys"

for spec in "${INSTANCE_SPECS[@]}"; do
  [[ "$spec" == *:* ]] || error "Invalid --instances entry '$spec'; expected instance:keyring"

  instance_name="${spec%%:*}"
  keyring="${spec#*:}"
  [[ -n "$instance_name" ]] || error "Empty instance name in --instances"
  [[ -n "$keyring" ]] || error "Empty keyring in --instances"

  prefix="$(sanitize_instance_name "$instance_name")"
  info "Ensuring $POOL_SIZE delegate keys for $instance_name in $keyring ($prefix-key-0..$prefix-key-$((POOL_SIZE - 1)))"

  ensure_keyring "$keyring"
  ensure_key "$keyring" "$ADMIN_KEY"

  for ((idx = 0; idx < POOL_SIZE; idx++)); do
    ensure_key "$keyring" "$prefix-key-$idx"
  done
done

info "Done. Start/restart each relayer so it registers missing delegate keys on-chain as FullAccess keys."
