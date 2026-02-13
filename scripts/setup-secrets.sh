#!/bin/bash
# =============================================================================
# Create Google Secret Manager secrets for OnSocial
# =============================================================================
# Stores actual secrets in GSM. Non-secret config stays in networks/*.env.
#
# Usage:
#   # First time — create secrets with placeholder values:
#   ./setup-secrets.sh
#
#   # Set a real value:
#   echo -n "my-real-password" | gcloud secrets versions add POSTGRES_PASSWORD --data-file=- --project=onsocial-protocol
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project onsocial-protocol
#   Secret Manager API enabled (gcloud services enable secretmanager.googleapis.com)

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

PROJECT="${GCP_PROJECT:-onsocial-protocol}"

# Secrets to create — only actual sensitive values
# Format: SECRET_NAME:DESCRIPTION
SECRETS=(
  "POSTGRES_PASSWORD:PostgreSQL database password"
  "HASURA_ADMIN_SECRET:Hasura GraphQL admin secret"
  "JWT_SECRET:Gateway JWT signing secret (min 32 chars)"
  "LIGHTHOUSE_API_KEY:Lighthouse storage API key"
  "RELAYER_API_KEY:Relayer authentication key (min 32 chars)"
  "LAVA_API_KEY:Lava RPC private endpoint key"
)

echo "============================================"
echo " Google Secret Manager Setup"
echo " Project: $PROJECT"
echo " Secrets: ${#SECRETS[@]}"
echo "============================================"
echo ""

created=0
existing=0

for entry in "${SECRETS[@]}"; do
  name="${entry%%:*}"
  desc="${entry#*:}"

  if gcloud secrets describe "$name" --project="$PROJECT" &>/dev/null; then
    echo -e "  ${YELLOW}⚠ $name — already exists${NC}"
    existing=$((existing + 1))
  else
    echo -n "CHANGE_ME" | gcloud secrets create "$name" \
      --project="$PROJECT" \
      --replication-policy="automatic" \
      --labels="app=onsocial" \
      --data-file=- 2>/dev/null
    echo -e "  ${GREEN}✅ $name — created${NC} ($desc)"
    created=$((created + 1))
  fi
done

echo ""
echo "============================================"
echo -e "${GREEN}Done: $created created, $existing already existed${NC}"
echo ""
echo "Next: set real values for each secret:"
echo ""

for entry in "${SECRETS[@]}"; do
  name="${entry%%:*}"
  echo "  echo -n 'VALUE' | gcloud secrets versions add $name --data-file=- --project=$PROJECT"
done

echo ""
echo "Verify:"
echo "  gcloud secrets list --project=$PROJECT"
echo "  scripts/pull-secrets.sh   # test pulling"
