#!/usr/bin/env bash
# Validate that a GSM bundle pulled by pull-secrets.sh has required deploy keys.
# Used in CI before secrets are copied to the server.

set -euo pipefail

bundle="${1:?usage: validate-gsm-secrets.sh <gsm-bundle-file>}"

required_keys=(
  TELEGRAM_BOT_TOKEN
  ADMIN_SECRET
  ADMIN_WALLETS
  SEASON_SETTLEMENT_ADMIN_KEY
  ONSOCIAL_PORTAL_REWARDS_API_KEY
)

for key in "${required_keys[@]}"; do
  if ! grep -q "^${key}=.\\+" "$bundle"; then
    echo "❌ ${key} missing or empty in GSM output" >&2
    exit 1
  fi
done

echo "✅ GSM bundle has all required deploy secrets"
