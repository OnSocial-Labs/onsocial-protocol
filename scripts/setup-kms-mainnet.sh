#!/bin/bash
# =============================================================================
# Create GCP KMS keyrings for NEAR mainnet relayer
# =============================================================================
# Creates two keyrings (one per relayer instance) with:
#   - 1 admin key (FullAccess, used for add/delete key TXs)
#   - N pool keys (signed client transactions)
#
# Usage:
#   # Dry run (shows what would be created):
#   ./setup-kms-mainnet.sh --dry-run
#
#   # Create keyrings + keys:
#   ./setup-kms-mainnet.sh
#
# Prerequisites:
#   - gcloud CLI authenticated: gcloud auth login
#   - Project: gcloud config set project onsocial-protocol
#   - Cloud KMS API enabled: gcloud services enable cloudkms.googleapis.com

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

PROJECT="${GCP_KMS_PROJECT:-onsocial-protocol}"
LOCATION="${GCP_KMS_LOCATION:-global}"
POOL_SIZE="${GCP_KMS_POOL_SIZE:-3}"
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  echo -e "${YELLOW}DRY RUN — showing what would be created${NC}"
  echo ""
fi

KEYRINGS=(
  "relayer-keys-mainnet"
  "relayer-keys-mainnet-inst-1"
)

echo "============================================"
echo " GCP KMS Mainnet Setup"
echo " Project:  $PROJECT"
echo " Location: $LOCATION"
echo " Pool:     $POOL_SIZE keys per keyring"
echo "============================================"
echo ""

for KEYRING in "${KEYRINGS[@]}"; do
  echo -e "${GREEN}Keyring: $KEYRING${NC}"

  if $DRY_RUN; then
    echo "  [dry-run] gcloud kms keyrings create $KEYRING --location=$LOCATION"
  else
    if gcloud kms keyrings describe "$KEYRING" \
        --location="$LOCATION" --project="$PROJECT" &>/dev/null; then
      echo "  ⚠ Keyring already exists"
    else
      gcloud kms keyrings create "$KEYRING" \
        --location="$LOCATION" --project="$PROJECT"
      echo "  ✅ Keyring created"
    fi
  fi

  # Admin key
  KEY_NAME="admin-key"
  if $DRY_RUN; then
    echo "  [dry-run] Create key: $KEY_NAME (ED25519, SIGN_VERIFY, SOFTWARE)"
  else
    if gcloud kms keys describe "$KEY_NAME" \
        --keyring="$KEYRING" --location="$LOCATION" --project="$PROJECT" &>/dev/null; then
      echo "  ⚠ $KEY_NAME already exists"
    else
      gcloud kms keys create "$KEY_NAME" \
        --keyring="$KEYRING" \
        --location="$LOCATION" \
        --project="$PROJECT" \
        --purpose="asymmetric-signing" \
        --default-algorithm="ec-sign-ed25519"
      echo "  ✅ $KEY_NAME created"
    fi
  fi

  # Pool keys
  for i in $(seq 0 $((POOL_SIZE - 1))); do
    KEY_NAME="pool-key-$i"
    if $DRY_RUN; then
      echo "  [dry-run] Create key: $KEY_NAME (ED25519, SIGN_VERIFY, SOFTWARE)"
    else
      if gcloud kms keys describe "$KEY_NAME" \
          --keyring="$KEYRING" --location="$LOCATION" --project="$PROJECT" &>/dev/null; then
        echo "  ⚠ $KEY_NAME already exists"
      else
        gcloud kms keys create "$KEY_NAME" \
          --keyring="$KEYRING" \
          --location="$LOCATION" \
          --project="$PROJECT" \
          --purpose="asymmetric-signing" \
          --default-algorithm="ec-sign-ed25519"
        echo "  ✅ $KEY_NAME created"
      fi
    fi
  done

  echo ""
done

if ! $DRY_RUN; then
  echo "============================================"
  echo -e "${GREEN}✅ KMS setup complete${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Create missing NEAR mainnet account:"
  echo "     - core.onsocial.near  (not yet created)"
  echo ""
  echo "  Existing accounts (verified):"
  echo "     ✅ onsocial.near"
  echo "     ✅ relayer.onsocial.near"
  echo "     ✅ token.onsocial.near"
  echo "     ✅ staking.onsocial.near"
  echo "     ✅ marketplace.onsocial.near"
  echo ""
  echo "  2. Get admin key public keys:"
  echo "     for kr in ${KEYRINGS[*]}; do"
  echo "       gcloud kms keys versions get-public-key 1 \\"
  echo "         --key=admin-key --keyring=\$kr \\"
  echo "         --location=$LOCATION --project=$PROJECT"
  echo "     done"
  echo ""
  echo "  3. Add admin keys as FullAccess on relayer.onsocial.near"
  echo ""
  echo "  4. Register pool keys:"
  echo "     NEAR_NETWORK=mainnet node scripts/register_kms_keys.mjs"
  echo ""
  echo "  5. Generate production env:"
  echo "     scripts/generate-env.sh mainnet"
  echo ""
  echo "  6. Deploy:"
  echo "     deployment/deploy-production.sh <server-ip>"
fi
