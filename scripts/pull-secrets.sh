#!/bin/bash
# =============================================================================
# Pull secrets from Google Secret Manager → stdout as KEY=VALUE pairs
# =============================================================================
# Outputs env vars to stdout. Pipe into a file or eval as needed.
#
# Usage:
#   scripts/pull-secrets.sh                  # print KEY=VALUE pairs
#   scripts/pull-secrets.sh > .env.secrets   # save to file (not recommended)
#   eval "$(scripts/pull-secrets.sh)"        # load into current shell
#
# Used by: scripts/generate-env.sh (when --gsm flag is passed)

set -euo pipefail

PROJECT="${GCP_PROJECT:-onsocial-protocol}"
NEAR_NETWORK="${NEAR_NETWORK:-testnet}"
DEFAULT_KMS_POOL_SIZE="30"

if [ "$NEAR_NETWORK" = "mainnet" ]; then
  DEFAULT_KMS_POOL_SIZE="50"
fi

# Secrets stored in GSM
SECRETS=(
  POSTGRES_PASSWORD
  HASURA_ADMIN_SECRET
  JWT_SECRET
  LIGHTHOUSE_API_KEY
  RELAYER_API_KEY
  LAVA_API_KEY
  GRAPH_API_KEY
  GRAPH_DEPLOY_KEY
  SUBSTREAMS_API_TOKEN
  TELEGRAM_BOT_TOKEN
  ADMIN_SECRET
)

OPTIONAL_SECRETS=(
  NEARBLOCKS_API_KEY
)

fetch_secret() {
  local name="$1"
  local err_file
  local value
  local err

  err_file="$(mktemp)"
  if value="$(gcloud secrets versions access latest --secret="$name" --project="$PROJECT" 2>"$err_file")"; then
    rm -f "$err_file"
    printf '%s' "$value"
    return 0
  fi

  err="$(tr '\n' ' ' < "$err_file" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//')"
  rm -f "$err_file"

  if [ -n "$err" ]; then
    echo "# WARNING: $name — $err" >&2
  else
    echo "# WARNING: $name — not found or empty in GSM" >&2
  fi

  return 1
}

for name in "${SECRETS[@]}"; do
  value="$(fetch_secret "$name" || true)"
  if [ -n "$value" ]; then
    echo "$name=$value"
  fi
done

for name in "${OPTIONAL_SECRETS[@]}"; do
  value="$(fetch_secret "$name" || true)"
  if [ -n "$value" ]; then
    echo "$name=$value"
  fi
done

# Non-secret config that lives alongside secrets
echo "POSTGRES_USER=onsocial"
echo "POSTGRES_DB=onsocial_indexer"
echo "GCP_KMS_PROJECT=${PROJECT:-onsocial-protocol}"
echo "GCP_KMS_LOCATION=global"
echo "GCP_KMS_POOL_SIZE=${GCP_KMS_POOL_SIZE:-$DEFAULT_KMS_POOL_SIZE}"
echo "GCP_KMS_ADMIN_KEY=${GCP_KMS_ADMIN_KEY:-admin-key}"
echo "RELAYER_MIN_KEYS=${RELAYER_MIN_KEYS:-$DEFAULT_KMS_POOL_SIZE}"
echo "RELAYER_MAX_KEYS=${RELAYER_MAX_KEYS:-200}"
echo "RELAYER_WARM_BUFFER=${RELAYER_WARM_BUFFER:-2}"
echo "PUBLIC_DOMAIN=${PUBLIC_DOMAIN:-testnet.onsocial.id}"
echo "NEARBLOCKS_API_URL=${NEARBLOCKS_API_URL:-$([ \"$NEAR_NETWORK\" = \"mainnet\" ] && echo https://api.nearblocks.io || echo https://api-testnet.nearblocks.io)}"
echo "RELAYER_MAX_KEY_AGE=${RELAYER_MAX_KEY_AGE:-86400}"
