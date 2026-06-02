#!/usr/bin/env bash
# Merge Google Secret Manager values into packages/onsocial-portal/.env.local
# for local portal dev aligned with testnet/mainnet gateway credentials.
#
# Usage:
#   NEAR_NETWORK=testnet ./scripts/sync-portal-env-from-gsm.sh
#   NEAR_NETWORK=mainnet ./scripts/sync-portal-env-from-gsm.sh
#
# Requires: gcloud auth with access to project onsocial-protocol
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${PORTAL_ENV_FILE:-$ROOT/packages/onsocial-portal/.env.local}"
NETWORK="${NEAR_NETWORK:-testnet}"
GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"

if ! command -v "$GCLOUD_BIN" >/dev/null 2>&1; then
  if [ -x "$HOME/google-cloud-sdk/bin/gcloud" ]; then
    GCLOUD_BIN="$HOME/google-cloud-sdk/bin/gcloud"
  fi
fi

if ! command -v "$GCLOUD_BIN" >/dev/null 2>&1; then
  echo "❌ gcloud not found — install Google Cloud SDK and run: gcloud auth login" >&2
  exit 1
fi

case "$NETWORK" in
  testnet)
    PUBLIC_API="https://testnet.onsocial.id"
    ;;
  mainnet)
    PUBLIC_API="https://api.onsocial.id"
    ;;
  *)
    echo "❌ NEAR_NETWORK must be testnet or mainnet (got: $NETWORK)" >&2
    exit 1
    ;;
esac

upsert_env() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" '
      BEGIN { done = 0 }
      $0 ~ "^" k "=" { print k "=" v; done = 1; next }
      { print }
      END { if (!done) print k "=" v }
    ' "$file" > "$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

echo "Pulling portal secrets from GSM (NEAR_NETWORK=$NETWORK)..."
TMP_GSM="$(mktemp)"
NEAR_NETWORK="$NETWORK" "$ROOT/scripts/pull-secrets.sh" > "$TMP_GSM" 2>"$TMP_GSM.warnings" || true

if [ -s "$TMP_GSM.warnings" ]; then
  cat "$TMP_GSM.warnings" >&2
fi

get_pulled() {
  local name="$1"
  grep -m1 "^${name}=" "$TMP_GSM" 2>/dev/null | cut -d= -f2- || true
}

ONAPI_KEY="$(get_pulled ONSOCIAL_API_KEY)"
REWARDS_KEY="$(get_pulled ONSOCIAL_PORTAL_REWARDS_API_KEY)"
REWARDS_APP="$(get_pulled ONSOCIAL_PORTAL_REWARDS_APP_ID)"

rm -f "$TMP_GSM" "$TMP_GSM.warnings"

if [ -z "$ONAPI_KEY" ]; then
  echo "❌ ONSOCIAL_API_KEY not returned from GSM." >&2
  echo "   Ensure secret ONSOCIAL_SERVICE_ONAPI_KEY exists (testnet) or" >&2
  echo "   ONSOCIAL_MAINNET_SERVICE_ONAPI_KEY (mainnet)." >&2
  exit 1
fi

echo "Updating $ENV_FILE ..."
upsert_env "$ENV_FILE" "NEXT_PUBLIC_NEAR_NETWORK" "$NETWORK"
upsert_env "$ENV_FILE" "NEXT_PUBLIC_API_URL" "$PUBLIC_API"
upsert_env "$ENV_FILE" "NEXT_PUBLIC_BACKEND_URL" "$PUBLIC_API"
upsert_env "$ENV_FILE" "ONSOCIAL_API_KEY" "$ONAPI_KEY"
# Remove deprecated alias if present from older syncs.
if grep -q '^GATEWAY_SERVICE_KEY=' "$ENV_FILE" 2>/dev/null; then
  tmp="$(mktemp)"
  grep -v '^GATEWAY_SERVICE_KEY=' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
fi
if [ -n "$REWARDS_KEY" ]; then
  upsert_env "$ENV_FILE" "ONSOCIAL_PORTAL_REWARDS_API_KEY" "$REWARDS_KEY"
fi
if [ -n "$REWARDS_APP" ]; then
  upsert_env "$ENV_FILE" "ONSOCIAL_PORTAL_REWARDS_APP_ID" "$REWARDS_APP"
else
  upsert_env "$ENV_FILE" "ONSOCIAL_PORTAL_REWARDS_APP_ID" "onsocial_portal"
fi

chmod 600 "$ENV_FILE" 2>/dev/null || true

PREFIX="${ONAPI_KEY:0:20}"
echo "✅ Portal .env.local aligned with GSM"
echo "   ONSOCIAL_API_KEY prefix: ${PREFIX}… (GATEWAY_SERVICE_KEY removed if present)"
echo "   API URL: $PUBLIC_API"
echo ""
echo "Restart the portal dev server: pnpm --filter @onsocial/portal dev"
