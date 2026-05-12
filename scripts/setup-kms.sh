#!/bin/bash
# =============================================================================
# Create GCP KMS keyrings for the NEP-366 NEAR relayer (testnet or mainnet)
# =============================================================================
# Creates keyrings (one per relayer instance) with one admin key.
#
# Delegate signer lanes can be pre-created with:
#   scripts/ensure_delegate_kms_keys.sh --network "$NEAR_NETWORK" --pool-size 50
# They are registered on-chain by the relayer at startup as FullAccess keys.
# Do not create/register legacy `pool-key-*` FunctionCall keys for `/execute_delegate`.
#
# Network-aware: set NEAR_NETWORK=mainnet to target mainnet keyrings.
#
# Usage:
#   # Dry run (shows what would be created):
#   ./scripts/setup-kms-mainnet.sh --dry-run
#
#   # Create keyrings + keys (testnet, default):
#   ./scripts/setup-kms-mainnet.sh
#
#   # Mainnet:
#   NEAR_NETWORK=mainnet ./scripts/setup-kms-mainnet.sh
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

NETWORK="${NEAR_NETWORK:-testnet}"
PROJECT="${GCP_KMS_PROJECT:-onsocial-protocol}"
LOCATION="${GCP_KMS_LOCATION:-global}"
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  echo -e "${YELLOW}DRY RUN — showing what would be created${NC}"
  echo ""
fi

if [ "$NETWORK" = "mainnet" ]; then
  KEYRINGS=(
    "relayer-keys-mainnet"
    "relayer-keys-mainnet-1"
  )
else
  KEYRINGS=(
    "relayer-keys-testnet"
    "relayer-keys-inst-1"
  )
fi

echo "============================================"
echo " GCP KMS Setup ($NETWORK)"
echo " Project:  $PROJECT"
echo " Location: $LOCATION"
echo " Model:    NEP-366 delegate relayer"
echo " Keyrings: ${KEYRINGS[*]}"
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

  echo ""
done

if ! $DRY_RUN; then
  echo "============================================"
  echo -e "${GREEN}✅ KMS setup complete ($NETWORK)${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Get admin key public keys:"
  echo "     for kr in ${KEYRINGS[*]}; do"
  echo "       gcloud kms keys versions get-public-key 1 \\"
  echo "         --key=admin-key --keyring=\$kr \\"
  echo "         --location=$LOCATION --project=$PROJECT"
  echo "     done"
  echo ""
  echo "  2. Ensure admin keys have FullAccess on the relayer account"
  echo ""
  echo "  3. Optional pre-create delegate signer keys:"
  echo "     scripts/ensure_delegate_kms_keys.sh --network $NETWORK --pool-size 50"
  echo ""
  echo "  4. Deploy/start each relayer with a stable RELAYER_INSTANCE_NAME"
  echo "     The relayer registers delegate-{instance}-key-* FullAccess lanes on-chain."
  echo ""
  echo "  5. Verify /ready and /health show active delegate keys on each instance"
fi
