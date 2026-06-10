#!/usr/bin/env bash
# =============================================================================
# Provision the server-only Portal rewards partner key.
# =============================================================================
#
# Creates or reuses ONSOCIAL_PORTAL_REWARDS_API_KEY in Google Secret Manager and
# upserts the matching partner_keys row. The secret value is never printed.
#
# Usage:
#   BACKEND_DATABASE_URL='postgres://...' scripts/provision-portal-rewards-key.sh
#   GCP_PROJECT=onsocial-protocol scripts/provision-portal-rewards-key.sh --skip-db
#
# Requirements:
#   - gcloud auth with Secret Manager access, unless --skip-gsm
#   - psql with BACKEND_DATABASE_URL or DATABASE_URL, unless --skip-db

set -euo pipefail

PROJECT="${GCP_PROJECT:-onsocial-protocol}"
SECRET_NAME="${SECRET_NAME:-ONSOCIAL_PORTAL_REWARDS_API_KEY}"
APP_ID="${ONSOCIAL_PORTAL_REWARDS_APP_ID:-onsocial_portal}"
LABEL="${ONSOCIAL_PORTAL_REWARDS_LABEL:-OnSocial Portal rewards}"
DATABASE_URL="${BACKEND_DATABASE_URL:-${DATABASE_URL:-}}"
GCLOUD_BIN="${GCLOUD_BIN:-gcloud}"
SKIP_GSM=0
SKIP_DB=0

for arg in "$@"; do
  case "$arg" in
    --skip-gsm) SKIP_GSM=1 ;;
    --skip-db) SKIP_DB=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate the API key" >&2
  exit 1
fi

generate_api_key() {
  printf 'os_live_%s' "$(openssl rand -hex 32)"
}

fetch_secret() {
  "$GCLOUD_BIN" secrets versions access latest \
    --secret="$SECRET_NAME" \
    --project="$PROJECT" 2>/dev/null || true
}

ensure_secret_exists() {
  if "$GCLOUD_BIN" secrets describe "$SECRET_NAME" --project="$PROJECT" >/dev/null 2>&1; then
    return 0
  fi

  printf '%s' "$1" | "$GCLOUD_BIN" secrets create "$SECRET_NAME" \
    --project="$PROJECT" \
    --replication-policy="automatic" \
    --labels="app=onsocial,scope=portal-rewards" \
    --data-file=- >/dev/null
}

add_secret_version() {
  printf '%s' "$1" | "$GCLOUD_BIN" secrets versions add "$SECRET_NAME" \
    --project="$PROJECT" \
    --data-file=- >/dev/null
}

ensure_secret_access() {
  local role="roles/secretmanager.secretAccessor"
  local members=(
    "serviceAccount:github-ci-deploy@${PROJECT}.iam.gserviceaccount.com"
    "serviceAccount:relayer-signer@${PROJECT}.iam.gserviceaccount.com"
  )
  local member
  for member in "${members[@]}"; do
    "$GCLOUD_BIN" secrets add-iam-policy-binding "$SECRET_NAME" \
      --project="$PROJECT" \
      --member="$member" \
      --role="$role" >/dev/null 2>&1 || true
  done
}

if [[ "$SKIP_GSM" -eq 0 ]]; then
  if ! command -v "$GCLOUD_BIN" >/dev/null 2>&1; then
    echo "gcloud is required. Run: gcloud auth login && gcloud config set project $PROJECT" >&2
    exit 1
  fi

  API_KEY="$(fetch_secret)"
  if [[ -z "$API_KEY" || "$API_KEY" == "CHANGE_ME" ]]; then
    API_KEY="$(generate_api_key)"
    ensure_secret_exists "$API_KEY"
    current="$(fetch_secret)"
    if [[ "$current" == "CHANGE_ME" ]]; then
      add_secret_version "$API_KEY"
    fi
    echo "GSM secret $SECRET_NAME is provisioned for project $PROJECT."
  else
    echo "GSM secret $SECRET_NAME already exists for project $PROJECT."
  fi
  ensure_secret_access
else
  API_KEY="${ONSOCIAL_PORTAL_REWARDS_API_KEY:-}"
  if [[ -z "$API_KEY" ]]; then
    echo "Set ONSOCIAL_PORTAL_REWARDS_API_KEY when using --skip-gsm." >&2
    exit 1
  fi
fi

if [[ "$SKIP_DB" -eq 0 ]]; then
  if [[ -z "$DATABASE_URL" ]]; then
    echo "Set BACKEND_DATABASE_URL or DATABASE_URL, or pass --skip-db." >&2
    exit 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql is required for the partner_keys upsert." >&2
    exit 1
  fi

  psql "$DATABASE_URL" \
    -v ON_ERROR_STOP=1 \
    -v api_key="$API_KEY" \
    -v app_id="$APP_ID" \
    -v label="$LABEL" <<'SQL'
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
  :'api_key',
  :'app_id',
  :'label',
  true,
  'approved',
  'Internal key used by the OnSocial Portal server to credit verified onboarding and social rewards.',
  'Internal portal traffic',
  'protocol',
  'Provisioned by scripts/provision-portal-rewards-key.sh',
  now()
)
ON CONFLICT (app_id) DO UPDATE
SET api_key = EXCLUDED.api_key,
    label = EXCLUDED.label,
    active = true,
    status = 'approved',
    admin_notes = EXCLUDED.admin_notes,
    reviewed_at = now();
SQL

  echo "partner_keys row is approved for app_id=$APP_ID."
fi

echo "Done. Secret value was not printed."
