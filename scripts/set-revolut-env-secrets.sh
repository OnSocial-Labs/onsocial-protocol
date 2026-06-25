#!/bin/bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <sandbox|production>"
  exit 1
fi

ENVIRONMENT="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
case "$ENVIRONMENT" in
  sandbox|production) ;;
  *)
    echo "Error: environment must be 'sandbox' or 'production'"
    exit 1
    ;;
esac

PROJECT="${GCP_PROJECT:-onsocial-protocol}"
GCLOUD="${GCLOUD_PATH:-$HOME/google-cloud-sdk/bin/gcloud}"
SUFFIX="$(printf '%s' "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')"
SET_ACTIVE_ENVIRONMENT="${SET_ACTIVE_REVOLUT_ENVIRONMENT:-0}"

required_vars=(
  "REVOLUT_SECRET_KEY_${SUFFIX}"
  "REVOLUT_PUBLIC_KEY_${SUFFIX}"
)

optional_vars=(
  "REVOLUT_WEBHOOK_SIGNING_SECRET_${SUFFIX}"
  "REVOLUT_PRO_VARIATION_ID_${SUFFIX}"
  "REVOLUT_SCALE_VARIATION_ID_${SUFFIX}"
  "REVOLUT_API_URL_${SUFFIX}"
  "REVOLUT_API_VERSION_${SUFFIX}"
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Error: missing required environment variable $name"
    exit 1
  fi
done

upsert_secret() {
  local name="$1"
  local value="$2"

  if [[ -z "$value" ]]; then
    return 0
  fi

  if ! "$GCLOUD" secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    printf 'CHANGE_ME' | "$GCLOUD" secrets create "$name" \
      --project="$PROJECT" \
      --replication-policy=automatic \
      --labels="app=onsocial" \
      --data-file=- >/dev/null
  fi

  printf '%s' "$value" | "$GCLOUD" secrets versions add "$name" \
    --data-file=- \
    --project="$PROJECT" >/dev/null

  echo "updated $name"
}

if [[ "$SET_ACTIVE_ENVIRONMENT" == "1" ]]; then
  upsert_secret "REVOLUT_ENVIRONMENT" "$ENVIRONMENT"
else
  echo "skipped REVOLUT_ENVIRONMENT"
fi

for name in "${required_vars[@]}" "${optional_vars[@]}"; do
  upsert_secret "$name" "${!name:-}"
done

echo "Done. Revolut $ENVIRONMENT secrets updated in project $PROJECT."