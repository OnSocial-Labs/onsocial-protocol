#!/usr/bin/env bash
# Grant secretAccessor on SEASON_SETTLEMENT_ADMIN_KEY to deploy service accounts.
set -euo pipefail

PROJECT="${GCP_PROJECT:-onsocial-protocol}"
SECRET="${SECRET_NAME:-SEASON_SETTLEMENT_ADMIN_KEY}"
ROLE="roles/secretmanager.secretAccessor"

MEMBERS=(
  "serviceAccount:github-ci-deploy@${PROJECT}.iam.gserviceaccount.com"
)

for member in "${MEMBERS[@]}"; do
  echo "Granting ${ROLE} on ${SECRET} to ${member}..."
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --project="$PROJECT" \
    --member="$member" \
    --role="$ROLE" >/dev/null
done

echo "Current IAM policy for ${SECRET}:"
gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT"
