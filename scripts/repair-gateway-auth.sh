#!/usr/bin/env bash
# Reconcile gateway auth tables after a substreams clean deploy wiped api_keys.
# Safe to re-run: uses CREATE IF NOT EXISTS and upserts the service API key.
set -euo pipefail

PSQL="${PSQL:-docker exec -i postgres psql -U onsocial -d onsocial_indexer}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIGRATIONS_DIR="${REPO_ROOT}/packages/onsocial-gateway/migrations"
HASURA_URL="${HASURA_URL:-http://127.0.0.1:8080/v1/graphql}"
HASURA_METADATA_URL="${HASURA_METADATA_URL:-${HASURA_URL%/v1/graphql}/v1/metadata}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌ Gateway migrations not found at $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "=== Repair gateway auth (api_keys) ==="

echo "📝 Applying gateway SQL migrations..."
for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$migration" ] || continue
  echo "  $(basename "$migration")"
  $PSQL < "$migration"
done

if ! $PSQL -tAc "SELECT to_regclass('public.api_keys')" | grep -q api_keys; then
  echo "❌ api_keys table still missing after migrations" >&2
  exit 1
fi
echo "✓ api_keys table present"

# GSM canonical: ONSOCIAL_SERVICE_ONAPI_KEY (testnet) / ONSOCIAL_MAINNET_SERVICE_ONAPI_KEY (mainnet)
SERVICE_KEY="${ONSOCIAL_API_KEY:-}"
if [ -z "$SERVICE_KEY" ] && command -v gcloud >/dev/null 2>&1; then
  for secret_name in ONSOCIAL_SERVICE_ONAPI_KEY ONSOCIAL_MAINNET_SERVICE_ONAPI_KEY ONSOCIAL_API_KEY GATEWAY_SERVICE_KEY; do
    SERVICE_KEY="$(
      gcloud secrets versions access latest \
        --secret="$secret_name" \
        --project="${GCP_PROJECT:-onsocial-protocol}" 2>/dev/null \
        | tr -d '\r\n' || true
    )"
    [ -n "$SERVICE_KEY" ] && break
  done
fi

if [ -z "$SERVICE_KEY" ]; then
  echo "⚠️  ONSOCIAL_API_KEY not set — table restored but no key seeded"
  echo "   Export ONSOCIAL_API_KEY or run scripts/sync-portal-env-from-gsm.sh"
else
  # Must match an ADMIN_WALLETS entry on the gateway (service tier via getTierInfo).
  ACCOUNT_ID="${GATEWAY_SERVICE_ACCOUNT_ID:-greenghost.onsocial.testnet}"
  KEY_HASH="$(printf '%s' "$SERVICE_KEY" | sha256sum | awk '{print $1}')"
  KEY_PREFIX="${SERVICE_KEY:0:20}"

  echo "🔑 Upserting service API key (${KEY_PREFIX}…, account=${ACCOUNT_ID})"
  $PSQL <<SQLEOF
INSERT INTO api_keys (key_hash, key_prefix, account_id, label, tier, revoked_at)
VALUES ('${KEY_HASH}', '${KEY_PREFIX}', '${ACCOUNT_ID}', 'portal-service', 'service', NULL)
ON CONFLICT (key_hash) DO UPDATE SET
  key_prefix = EXCLUDED.key_prefix,
  account_id = EXCLUDED.account_id,
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  revoked_at = NULL;
SQLEOF
  echo "✓ Service API key upserted"
fi

if [ -n "${HASURA_ADMIN_SECRET:-}" ]; then
  echo "🧩 Tracking api_keys in Hasura (if needed)..."
  payload='{"type":"pg_track_table","args":{"source":"default","table":{"schema":"public","name":"api_keys"}}}'
  status="$(curl -sS -o /tmp/hasura-track-api-keys.json -w '%{http_code}' "$HASURA_METADATA_URL" \
    -H 'Content-Type: application/json' \
    -H "x-hasura-admin-secret: ${HASURA_ADMIN_SECRET}" \
    -d "$payload")"
  if [[ "$status" =~ ^2 ]] || grep -Eqi 'already|exists|tracked' /tmp/hasura-track-api-keys.json; then
    echo "✓ api_keys tracked in Hasura"
  else
    echo "⚠️  Hasura track api_keys returned HTTP $status" >&2
    cat /tmp/hasura-track-api-keys.json >&2 || true
  fi

  curl -fsS "$HASURA_METADATA_URL" \
    -H 'Content-Type: application/json' \
    -H "x-hasura-admin-secret: ${HASURA_ADMIN_SECRET}" \
    -d '{"type":"reload_metadata","args":{"reload_remote_schemas":true,"reload_sources":true}}' \
    >/dev/null
  echo "✓ Hasura metadata reloaded"
else
  echo "ℹ️  HASURA_ADMIN_SECRET not set — skip Hasura track (run apply-hasura-permissions sync)"
fi

if [ -d /opt/onsocial ] && [ -f /opt/onsocial/docker-compose.yml ]; then
  echo "🔐 Syncing gateway permissions + restarting gateway..."
  (
    cd /opt/onsocial
    if [ -f .env.production ]; then set -a && . ./.env.production && set +a; fi
    if [ -f deploy_gsm.env ]; then set -a && . ./deploy_gsm.env && set +a; fi
    export HASURA_ADMIN_SECRET="${HASURA_ADMIN_SECRET:-${ADMIN_SECRET:-}}"
    if docker compose ps gateway >/dev/null 2>&1; then
      POSTGRES_USER="${POSTGRES_USER:-onsocial}"
      POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}"
      POSTGRES_DB="${POSTGRES_DB:-onsocial_indexer}"
      DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
      docker compose exec -T -e DATABASE_URL="$DATABASE_URL" gateway \
        node packages/onsocial-gateway/dist/scripts/apply-migrations.js </dev/null || true
      docker compose exec -T \
        -e HASURA_BACKUP_DIR=/tmp \
        -e HASURA_ADMIN_SECRET="${HASURA_ADMIN_SECRET}" \
        gateway \
        node packages/onsocial-gateway/dist/scripts/apply-hasura-permissions.js sync </dev/null
      docker compose restart gateway
      echo "✓ Gateway restarted"
    fi
  )
fi

echo "✅ Gateway auth repair complete"
