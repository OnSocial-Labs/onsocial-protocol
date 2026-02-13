#!/bin/bash
# Create GCP Uptime Checks for OnSocial production endpoints.
# Free tier: 10 checks. Alerts via email on failure.
#
# Usage: ./setup-monitoring.sh <email>
# Requires: gcloud auth, Monitoring API enabled

set -euo pipefail

EMAIL="${1:-}"
PROJECT="${GCP_PROJECT:-onsocial-protocol}"

if [ -z "$EMAIL" ]; then
  echo "Usage: $0 <alert-email>"
  exit 1
fi

# Enable Monitoring API
gcloud services enable monitoring.googleapis.com --project="$PROJECT" 2>/dev/null

# Create notification channel (email)
CHANNEL_ID=$(gcloud alpha monitoring channels create \
  --project="$PROJECT" \
  --type=email \
  --display-name="OnSocial Alerts" \
  --channel-labels="email_address=$EMAIL" \
  --format="value(name)" 2>/dev/null) || true

if [ -z "$CHANNEL_ID" ]; then
  echo "Note: Notification channel may already exist. Continuing..."
  CHANNEL_ID=$(gcloud alpha monitoring channels list \
    --project="$PROJECT" \
    --filter="displayName='OnSocial Alerts'" \
    --format="value(name)" 2>/dev/null | head -1)
fi

echo "Notification channel: $CHANNEL_ID"

# Uptime check: Gateway health
gcloud monitoring uptime create \
  --project="$PROJECT" \
  --display-name="OnSocial Gateway Health" \
  --resource-type="uptime-url" \
  --hostname="api.onsocial.id" \
  --path="/health" \
  --protocol="https" \
  --check-every="60s" \
  --timeout="10s" 2>/dev/null && echo "✅ Gateway uptime check created" || echo "⚠ May already exist"

echo ""
echo "Done. View at: https://console.cloud.google.com/monitoring/uptime?project=$PROJECT"
echo ""
echo "To add alert policy (triggers on 2 consecutive failures):"
echo "  Go to: Monitoring → Alerting → Create Policy"
echo "  Condition: Uptime check 'OnSocial Gateway Health' failing"
echo "  Notification: $EMAIL"
