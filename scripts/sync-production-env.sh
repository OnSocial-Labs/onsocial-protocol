#!/usr/bin/env bash
# =============================================================================
# Sync Google Secret Manager secrets into .env.production on deploy hosts.
# =============================================================================
# Docker Compose reads .env.production only. GSM is the source of truth; this
# script merges a GSM bundle (from CI) or live server GSM into that file and
# applies network-specific non-secret config.
#
# Usage (on server, during CI deploy):
#   ./sync-production-env.sh --network testnet --gsm-bundle deploy_gsm.env
#   rm -f deploy_gsm.env
#
# Usage (repair / manual, bundle already on server):
#   ./sync-production-env.sh --network testnet --gsm-bundle restore_gsm.env
#
# Usage (server pulls GSM directly — no CI bundle):
#   ./sync-production-env.sh --network testnet --pull-gsm
#
# Environment:
#   DEPLOY_DIR  — deploy root (default: /opt/onsocial or current directory)

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
DEPLOY_ENV_FILE="${DEPLOY_DIR}/.env.production"
NETWORK=""
GSM_BUNDLE=""
PULL_GSM=0

usage() {
  cat <<'EOF'
Usage: sync-production-env.sh --network <testnet|mainnet> [options]

Options:
  --gsm-bundle <file>   Merge KEY=VALUE secrets from a CI bundle (then delete it yourself)
  --pull-gsm            Fetch secrets from GSM on this server (requires gcloud auth)
  --dir <path>          Deploy directory (default: current directory or DEPLOY_DIR)

Writes: <dir>/.env.production (merge — existing keys not in GSM are preserved)
EOF
}

env_trim() {
  printf '%s' "$1" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

env_upsert() {
  local key="$1" value="$2"
  local dest="$DEPLOY_ENV_FILE"
  local tmp

  if [ -z "$key" ]; then
    echo "env_upsert: empty key" >&2
    return 1
  fi

  tmp="$(mktemp)"
  if [ -f "$dest" ]; then
    grep -v "^${key}=" "$dest" > "$tmp" || true
  fi
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$dest"
}

env_read_value_from_file() {
  local file="$1" key="$2"
  local line value last=""

  [ -f "$file" ] || return 1

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "${key}"=*) ;;
      *) continue ;;
    esac
    value="${line#*=}"
    value="$(env_trim "$value")"
    if [ -n "$value" ]; then
      last="$value"
    fi
  done < "$file"

  if [ -n "$last" ]; then
    printf '%s' "$last"
    return 0
  fi
  return 1
}

env_read_value() {
  env_read_value_from_file "$DEPLOY_ENV_FILE" "$1" || true
}

env_merge_file() {
  local src="$1"
  local line key val

  [ -f "$src" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    line="$(env_trim "$line")"
    [ -z "$line" ] && continue
    case "$line" in
      \#*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    key="$(env_trim "$key")"
    val="$(env_trim "$val")"
    [ -z "$key" ] && continue
    env_upsert "$key" "$val"
  done < "$src"
}

activate_gcloud() {
  if [ -f /root/onsocial-gcp-key.json ]; then
    gcloud auth activate-service-account --key-file=/root/onsocial-gcp-key.json >/dev/null 2>&1 || true
  fi
  gcloud config set project onsocial-protocol >/dev/null 2>&1 || true
}

fetch_gsm_secret() {
  local secret_name="$1"
  gcloud secrets versions access latest \
    --secret="$secret_name" \
    --project=onsocial-protocol 2>/dev/null \
    | tr -d '\r\n' \
    | sed 's/[[:space:]]*$//' \
    || true
}

telegram_gsm_secret() {
  if [ "$NETWORK" = "mainnet" ]; then
    echo "TELEGRAM_BOT_TOKEN_MAINNET"
  else
    echo "TELEGRAM_BOT_TOKEN_TESTNET"
  fi
}

ensure_key_from_gsm() {
  local env_key="$1" secret_name="$2"
  local value bundled

  if [ -n "$(env_read_value "$env_key")" ]; then
    return 0
  fi

  if [ -n "$GSM_BUNDLE" ] && [ -f "$GSM_BUNDLE" ]; then
    bundled="$(env_read_value_from_file "$GSM_BUNDLE" "$env_key" || true)"
    if [ -n "$bundled" ]; then
      echo "Applying ${env_key} from GSM bundle..."
      env_upsert "$env_key" "$bundled"
      return 0
    fi
  fi

  echo "Fetching ${env_key} from GSM on server (${secret_name})..."
  activate_gcloud
  value="$(fetch_gsm_secret "$secret_name")"
  if [ -z "$value" ]; then
    echo "❌ ${env_key} missing in .env.production, GSM bundle, and server GSM (${secret_name})"
    exit 1
  fi
  env_upsert "$env_key" "$value"
}

ensure_required_secrets() {
  local required

  ensure_key_from_gsm "TELEGRAM_BOT_TOKEN" "$(telegram_gsm_secret)"
  ensure_key_from_gsm "ADMIN_SECRET" "ADMIN_SECRET"
  ensure_key_from_gsm "ADMIN_WALLETS" "ADMIN_WALLETS"
  ensure_key_from_gsm "SEASON_SETTLEMENT_ADMIN_KEY" "SEASON_SETTLEMENT_ADMIN_KEY"
  ensure_key_from_gsm "ONSOCIAL_PORTAL_REWARDS_API_KEY" "ONSOCIAL_PORTAL_REWARDS_API_KEY"

  for required in \
    TELEGRAM_BOT_TOKEN \
    ADMIN_SECRET \
    ADMIN_WALLETS \
    SEASON_SETTLEMENT_ADMIN_KEY \
    ONSOCIAL_PORTAL_REWARDS_API_KEY; do
    if [ -z "$(env_read_value "$required")" ]; then
      if [ -n "$GSM_BUNDLE" ] && [ -f "$GSM_BUNDLE" ] && grep -q "^${required}=" "$GSM_BUNDLE"; then
        echo "❌ ${required} missing or empty in .env.production after GSM sync (bundle had the key but merge failed)"
      else
        echo "❌ ${required} missing or empty in .env.production after GSM sync"
      fi
      exit 1
    fi
  done
}

apply_network_config() {
  local near_suffix public_domain cors hasura_cors kms0 kms1 nearblocks

  case "$NETWORK" in
    testnet)
      near_suffix="onsocial.testnet"
      public_domain="testnet.onsocial.id"
      cors="https://testnet.onsocial.id,http://localhost:3000,http://localhost:4000"
      hasura_cors="https://testnet.onsocial.id,http://localhost:3000"
      kms0="relayer-keys-testnet"
      kms1="relayer-keys-inst-1"
      nearblocks="https://api-testnet.nearblocks.io"
      ;;
    mainnet)
      near_suffix="onsocial.near"
      public_domain="api.onsocial.id"
      cors="https://onsocial.id,https://app.onsocial.id"
      hasura_cors="https://onsocial.id,https://app.onsocial.id"
      kms0="relayer-keys-mainnet"
      kms1="relayer-keys-mainnet-inst-1"
      nearblocks="https://api.nearblocks.io"
      ;;
    *)
      echo "❌ Unknown network: $NETWORK (expected testnet or mainnet)" >&2
      exit 1
      ;;
  esac

  env_upsert "NEAR_NETWORK" "$NETWORK"
  env_upsert "RELAYER_ACCOUNT_ID" "relayer.${near_suffix}"
  env_upsert "RELAYER_ALLOWED_CONTRACTS" "core.${near_suffix},scarces.${near_suffix},rewards.${near_suffix}"
  env_upsert "RELAYER_CONTRACT_ID" "core.${near_suffix}"
  env_upsert "SOCIAL_TOKEN_CONTRACT" "token.${near_suffix}"
  env_upsert "STAKING_CONTRACT" "staking.${near_suffix}"
  env_upsert "MARKETPLACE_CONTRACT" "marketplace.${near_suffix}"
  env_upsert "GCP_KMS_KEYRING_0" "$kms0"
  env_upsert "GCP_KMS_KEYRING_1" "$kms1"
  env_upsert "PUBLIC_DOMAIN" "$public_domain"
  env_upsert "PUBLIC_API_URL" "https://${public_domain}"
  env_upsert "PUBLIC_PAGE_BASE_DOMAIN" "$([ "$NETWORK" = mainnet ] && echo onsocial.id || echo "$public_domain")"
  env_upsert "WEBHOOK_URL" "https://${public_domain}/webhooks/telegram"
  env_upsert "CORS_ORIGINS" "$cors"
  env_upsert "HASURA_GRAPHQL_CORS_DOMAIN" "$hasura_cors"
  env_upsert "NEARBLOCKS_API_URL" "$nearblocks"
  env_upsert "ONSOCIAL_PORTAL_REWARDS_APP_ID" "onsocial_portal"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --network)
      NETWORK="${2:-}"
      shift 2
      ;;
    --gsm-bundle)
      GSM_BUNDLE="${2:-}"
      shift 2
      ;;
    --pull-gsm)
      PULL_GSM=1
      shift
      ;;
    --dir)
      DEPLOY_DIR="${2:-}"
      DEPLOY_ENV_FILE="${DEPLOY_DIR}/.env.production"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$NETWORK" ]; then
  echo "❌ --network is required" >&2
  usage >&2
  exit 1
fi

if [ -n "$GSM_BUNDLE" ]; then
  if [[ "$GSM_BUNDLE" != /* ]]; then
    GSM_BUNDLE="$(cd "$(dirname "$GSM_BUNDLE")" && pwd)/$(basename "$GSM_BUNDLE")"
  fi
  if [ ! -f "$GSM_BUNDLE" ]; then
    echo "❌ GSM bundle not found: $GSM_BUNDLE" >&2
    exit 1
  fi
fi

if [ ! -d "$DEPLOY_DIR" ]; then
  echo "❌ Deploy directory not found: $DEPLOY_DIR" >&2
  exit 1
fi

DEPLOY_DIR="$(cd "$DEPLOY_DIR" && pwd)"
DEPLOY_ENV_FILE="${DEPLOY_DIR}/.env.production"

cd "$DEPLOY_DIR"
touch "$DEPLOY_ENV_FILE"

if [ -n "$GSM_BUNDLE" ]; then
  echo "Merging GSM bundle into .env.production..."
  env_merge_file "$GSM_BUNDLE"
elif [ "$PULL_GSM" -eq 1 ]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  pull_script="${script_dir}/pull-secrets.sh"
  if [ ! -x "$pull_script" ] && [ ! -f "$pull_script" ]; then
    pull_script="${DEPLOY_DIR}/pull-secrets.sh"
  fi
  if [ ! -f "$pull_script" ]; then
    echo "❌ pull-secrets.sh not found (expected next to this script or in ${DEPLOY_DIR})" >&2
    exit 1
  fi
  tmp_gsm="$(mktemp)"
  NEAR_NETWORK="$NETWORK" PUBLIC_DOMAIN="$(env_read_value PUBLIC_DOMAIN)" \
    bash "$pull_script" > "$tmp_gsm"
  env_merge_file "$tmp_gsm"
  rm -f "$tmp_gsm"
else
  echo "⚠️  No GSM bundle — refreshing network config and filling missing secrets from server GSM"
fi

apply_network_config
ensure_required_secrets

echo "✅ .env.production synced for ${NETWORK} (${DEPLOY_ENV_FILE})"
