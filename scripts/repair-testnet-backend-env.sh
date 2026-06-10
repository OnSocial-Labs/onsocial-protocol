#!/usr/bin/env bash
# Merge GSM secrets into testnet .env.production, sync portal rewards partner key,
# and recreate the backend with a fully sourced environment.
#
# Usage:
#   bash scripts/repair-testnet-backend-env.sh
#   SERVER=root@135.181.110.183 bash scripts/repair-testnet-backend-env.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="${SERVER:-root@135.181.110.183}"
REMOTE_DIR="${REMOTE_DIR:-/opt/onsocial}"
NEAR_NETWORK="${NEAR_NETWORK:-testnet}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-testnet.onsocial.id}"

TMP_GSM="$(mktemp)"
trap 'rm -f "$TMP_GSM"' EXIT

echo "Pulling GSM secrets for ${NEAR_NETWORK}..."
NEAR_NETWORK="$NEAR_NETWORK" PUBLIC_DOMAIN="$PUBLIC_DOMAIN" \
  bash "$ROOT/scripts/pull-secrets.sh" > "$TMP_GSM"

echo "Uploading secrets bundle to ${SERVER}:${REMOTE_DIR}/restore_gsm.env"
scp "$TMP_GSM" "${SERVER}:${REMOTE_DIR}/restore_gsm.env"

echo "Merging env, syncing partner key, recreating backend..."
ssh "$SERVER" bash -s "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
cd "$REMOTE_DIR"

merge_env_file() {
  local src="$1"
  local dest="$2"
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    case "$line" in
      \#*) continue ;;
    esac
    local key="${line%%=*}"
    local val="${line#*=}"
    if grep -q "^${key}=" "$dest" 2>/dev/null; then
      sed -i "s|^${key}=.*|${key}=${val}|" "$dest"
    else
      printf '%s\n' "$line" >> "$dest"
    fi
  done < "$src"
}

touch .env.production
merge_env_file restore_gsm.env .env.production
rm -f restore_gsm.env

grep -q '^PUBLIC_DOMAIN=' .env.production || echo "PUBLIC_DOMAIN=testnet.onsocial.id" >> .env.production
grep -q '^NEAR_NETWORK=' .env.production || echo "NEAR_NETWORK=testnet" >> .env.production
grep -q '^WEBHOOK_URL=' .env.production || echo "WEBHOOK_URL=https://testnet.onsocial.id/webhooks/telegram" >> .env.production

set -a
# shellcheck disable=SC1091
source .env.production
if [ -f .env.image ]; then
  # shellcheck disable=SC1091
  source .env.image
fi
set +a

missing=0
for required in TELEGRAM_BOT_TOKEN ADMIN_SECRET ONSOCIAL_PORTAL_REWARDS_API_KEY SEASON_SETTLEMENT_ADMIN_KEY; do
  if [ -z "${!required:-}" ]; then
    echo "missing:${required}"
    missing=1
  else
    echo "ok:${required}"
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "Refusing to recreate backend with incomplete .env.production" >&2
  exit 1
fi

PORTAL_KEY="$(printf '%s' "$ONSOCIAL_PORTAL_REWARDS_API_KEY" | tr -d '\r\n' | sed 's/[[:space:]]*$//')"
sed -i "s|^ONSOCIAL_PORTAL_REWARDS_API_KEY=.*|ONSOCIAL_PORTAL_REWARDS_API_KEY=${PORTAL_KEY}|" .env.production

docker exec postgres psql -U onsocial -d onsocial_backend -v ON_ERROR_STOP=1 <<SQL
INSERT INTO partner_keys (
  api_key,
  app_id,
  label,
  active,
  status,
  description,
  expected_users,
  contact,
  admin_notes,
  reviewed_at
) VALUES (
  '${PORTAL_KEY}',
  'onsocial_portal',
  'OnSocial Portal rewards',
  true,
  'approved',
  'Portal rewards',
  'internal',
  'protocol',
  'Synced by repair-testnet-backend-env.sh',
  now()
)
ON CONFLICT (app_id) DO UPDATE
SET api_key = EXCLUDED.api_key,
    active = true,
    status = 'approved',
    reviewed_at = now();
SQL

set -a
# shellcheck disable=SC1091
source .env.production
if [ -f .env.image ]; then
  # shellcheck disable=SC1091
  source .env.image
fi
set +a

docker compose --env-file .env.production pull backend
docker compose --env-file .env.production up -d --force-recreate --no-deps backend

healthy=0
for attempt in $(seq 1 15); do
  status="$(docker ps --filter name=^backend$ --format '{{.Status}}' 2>/dev/null || true)"
  if echo "$status" | grep -q healthy; then
    healthy=1
    echo "backend:healthy (attempt ${attempt})"
    break
  fi
  if curl -sf --max-time 3 http://127.0.0.1:4001/health >/dev/null 2>&1; then
    healthy=1
    echo "backend:healthy-via-http (attempt ${attempt})"
    break
  fi
  echo "backend:waiting (${attempt}/15) status=${status:-unknown}"
  sleep 3
done

if [ "$healthy" -ne 1 ]; then
  echo "backend:not-healthy-yet"
  docker logs backend --tail 40 || true
fi
REMOTE

LOCAL_KEY="$(grep '^ONSOCIAL_PORTAL_REWARDS_API_KEY=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r\n')"
echo "Verifying portal rewards auth on https://${PUBLIC_DOMAIN}..."
verify_body="$(mktemp)"
http_code="$(
  curl -sS "https://${PUBLIC_DOMAIN}/v1/portal/reward-action" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ${LOCAL_KEY}" \
    -d '{"account_id":"voter2.onsocial.testnet","action":"stand_given","target_account_id":"test01greenghost.testnet"}' \
    -w "%{http_code}" \
    -o "$verify_body"
)"
echo "HTTP:${http_code}"
cat "$verify_body"
echo
rm -f "$verify_body"

if [ "$http_code" = "502" ]; then
  echo "Backend still unreachable (502). Check docker logs on the server." >&2
  exit 1
fi

if [ "$http_code" = "404" ]; then
  echo "Portal rewards route is missing from the deployed backend image." >&2
  echo "Deploy a backend build that includes packages/onsocial-backend/src/routes/portal-rewards.ts:" >&2
  echo "  gh workflow run deploy-testnet" >&2
  echo "Then on the server: docker compose pull backend && docker compose up -d --force-recreate --no-deps backend" >&2
  exit 1
fi

echo "Done. Expected: HTTP:401 with \"Invalid reward signature\" (API key accepted)."
