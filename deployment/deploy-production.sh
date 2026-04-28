#!/bin/bash
# =============================================================================
# OnSocial Production Deployment Script
# =============================================================================
# Deploys the full stack to Hetzner using pre-built GHCR images.
# Images are built and pushed by GitHub Actions (deploy-testnet / deploy-mainnet).
#
# Secrets are pulled DIRECTLY from Google Secret Manager on the server.
# Network config is derived from the NETWORK argument — no extra files needed.
#
# Usage:
#   ./deploy-production.sh <testnet|mainnet> <server-ip>                   # Deploy latest
#   ./deploy-production.sh <testnet|mainnet> <server-ip> --tag <sha>       # Deploy specific version
#   ./deploy-production.sh <testnet|mainnet> <server-ip> --init            # First-time setup
#
# Prerequisites:
#   - SSH access to server (ssh root@<ip>)
#   - Docker + Docker Compose on server
#   - gcloud CLI on server, authenticated with a service account that has
#     roles/secretmanager.secretAccessor on project onsocial-protocol
#   - Optional: set REMOTE_GCLOUD_KEY_FILE to a service-account key path on the
#     remote host. If unset, the script falls back to /root/onsocial-gcp-key.json
#     when present.
#   - DNS A records pointing to server IP

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'
REMOTE_GCP_PROJECT="${REMOTE_GCP_PROJECT:-onsocial-protocol}"
REMOTE_GCLOUD_KEY_FILE="${REMOTE_GCLOUD_KEY_FILE:-}"

info()  { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

NETWORK="${1:-}"
SERVER_IP="${2:-}"
FLAG="${3:-}"
TAG_VALUE="${4:-latest}"

if [ -z "$NETWORK" ] || [ -z "$SERVER_IP" ]; then
  echo "Usage: $0 <testnet|mainnet> <server-ip> [--tag <sha>] [--init]"
  echo ""
  echo "Examples:"
  echo "  $0 testnet 135.181.110.183                  # Deploy latest"
  echo "  $0 testnet 135.181.110.183 --tag abc1234    # Deploy specific version"
  echo "  $0 mainnet 135.181.110.183 --init           # First-time setup"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_DIR="/opt/onsocial"

# --- Derive all network config from NETWORK (no extra files) ---
case "$NETWORK" in
  testnet)
    NEAR_SUFFIX="onsocial.testnet"
    PUBLIC_DOMAIN="testnet.onsocial.id"
    SERVER_NAMES="testnet.onsocial.id"
    PAGES_HOST_PATTERNS="*.testnet.onsocial.id"
    PUBLIC_API_URL="https://testnet.onsocial.id"
    PUBLIC_PAGE_BASE_DOMAIN="testnet.onsocial.id"
    CORS_ORIGINS="https://testnet.onsocial.id,http://localhost:3000,http://localhost:4000"
    HASURA_CORS="https://testnet.onsocial.id,http://localhost:3000"
    KMS_KEYRING_0="relayer-keys-testnet"
    KMS_KEYRING_1="relayer-keys-inst-1"
    ;;
  mainnet)
    NEAR_SUFFIX="onsocial.near"
    PUBLIC_DOMAIN="api.onsocial.id"
    SERVER_NAMES="api.onsocial.id, mainnet.onsocial.id"
    PAGES_HOST_PATTERNS="*.onsocial.id"
    PUBLIC_API_URL="https://api.onsocial.id"
    PUBLIC_PAGE_BASE_DOMAIN="onsocial.id"
    CORS_ORIGINS="https://onsocial.id,https://app.onsocial.id"
    HASURA_CORS="https://onsocial.id,https://app.onsocial.id"
    KMS_KEYRING_0="relayer-keys-mainnet"
    KMS_KEYRING_1="relayer-keys-mainnet-inst-1"
    ;;
  *)
    error "Unknown network: $NETWORK (expected testnet or mainnet)"
    ;;
esac

# Parse --tag flag
IMAGE_TAG="latest"
if [ "$FLAG" = "--tag" ]; then
  IMAGE_TAG="$TAG_VALUE"
fi

echo "============================================"
echo " OnSocial Production Deploy"
echo " Network:   $NETWORK"
echo " Domain:    $PUBLIC_DOMAIN"
echo " Server:    $SERVER_IP"
echo " Image Tag: $IMAGE_TAG"
echo " Secrets:   Google Secret Manager (live)"
echo "============================================"
echo ""

# --- First-time init: install Docker, gcloud, create dirs ---
if [ "$FLAG" = "--init" ]; then
  info "Running first-time server setup..."
  ssh "root@$SERVER_IP" bash << 'INIT_SCRIPT'
    set -euo pipefail
    # Install Docker if missing
    if ! command -v docker &>/dev/null; then
      curl -fsSL https://get.docker.com | sh
      systemctl enable --now docker
    fi
    # Install gcloud CLI if missing
    if ! command -v gcloud &>/dev/null; then
      echo "Installing Google Cloud SDK..."
      curl -fsSL https://sdk.cloud.google.com | bash -s -- --disable-prompts --install-dir=/opt
      ln -sf /opt/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud
    fi
    mkdir -p /opt/onsocial
    echo "✅ Server initialized"
    echo ""
    echo "Next steps (one-time):"
    echo "  1. Authenticate: gcloud auth login"
    echo "  2. Or use a service account key:"
    echo "     gcloud auth activate-service-account --key-file=key.json"
    echo "  3. Set project: gcloud config set project onsocial-protocol"
INIT_SCRIPT
fi

# --- Generate Caddyfile with correct domain ---
info "Generating Caddyfile for $PUBLIC_DOMAIN..."
CDN_DOMAIN="cdn.onsocial.id"
if [[ "$PUBLIC_DOMAIN" = "testnet.onsocial.id" ]]; then
  CDN_DOMAIN="cdn.testnet.onsocial.id"
fi
CDN_UPSTREAM="${LIGHTHOUSE_CDN_UPSTREAM:-statistical-barnacle-3ny44.lighthouseweb3.xyz}"
sed \
  -e "s/__SERVER_NAMES__/$SERVER_NAMES/g" \
  -e "s/__PAGES_HOST_PATTERNS__/$PAGES_HOST_PATTERNS/g" \
  -e "s|__CDN_DOMAIN__|$CDN_DOMAIN|g" \
  -e "s|__CDN_UPSTREAM__|$CDN_UPSTREAM|g" \
  -e 's/__BACKEND_UPSTREAM__/backend:4001/g' \
  -e 's/__GATEWAY_UPSTREAM__/gateway:8080/g' \
  "$SCRIPT_DIR/Caddyfile" > "$SCRIPT_DIR/.Caddyfile.generated"

# --- Sync config files (NO secrets, NO network env files) ---
info "Syncing configuration files (no secrets)..."
rsync -avz --progress \
  "$SCRIPT_DIR/docker-compose.yml" \
  "$SCRIPT_DIR/.Caddyfile.generated" \
  "$SCRIPT_DIR/Caddyfile.relayer" \
  "$SCRIPT_DIR/init-extra-dbs.sh" \
  "$ROOT_DIR/scripts/pull-secrets.sh" \
  "root@$SERVER_IP:$REMOTE_DIR/"

# Rename Caddyfile and set permissions
ssh "root@$SERVER_IP" "cd $REMOTE_DIR && mv -f .Caddyfile.generated Caddyfile && chmod +x pull-secrets.sh init-extra-dbs.sh"

# --- Generate network.env + pull secrets from GSM on the server ---
info "Generating network config + pulling secrets from GSM on server..."
ssh "root@$SERVER_IP" bash -s \
  "$NETWORK" "$NEAR_SUFFIX" "$PUBLIC_DOMAIN" "$CORS_ORIGINS" "$HASURA_CORS" \
  "$KMS_KEYRING_0" "$KMS_KEYRING_1" "$REMOTE_GCP_PROJECT" "$REMOTE_GCLOUD_KEY_FILE" << 'GSM_SCRIPT'
  set -euo pipefail
  cd /opt/onsocial

  NETWORK="$1"
  NEAR_SUFFIX="$2"
  PUBLIC_DOMAIN="$3"
  CORS_ORIGINS="$4"
  HASURA_CORS="$5"
  KMS_KEYRING_0="$6"
  KMS_KEYRING_1="$7"
  GCP_PROJECT="${8:-onsocial-protocol}"
  GCLOUD_KEY_FILE="${9:-}"

  # Verify gcloud is available and authenticated
  if ! command -v gcloud &>/dev/null; then
    echo "❌ gcloud CLI not found on server. Run with --init first."
    exit 1
  fi

  if [[ -n "$GCLOUD_KEY_FILE" ]]; then
    if [[ ! -f "$GCLOUD_KEY_FILE" ]]; then
      echo "❌ configured gcloud key file not found: $GCLOUD_KEY_FILE"
      exit 1
    fi
    gcloud auth activate-service-account --key-file="$GCLOUD_KEY_FILE" >/dev/null
  elif [[ -f /root/onsocial-gcp-key.json ]]; then
    gcloud auth activate-service-account --key-file=/root/onsocial-gcp-key.json >/dev/null
  fi

  gcloud config set project "$GCP_PROJECT" >/dev/null

  ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)"
  if [[ -z "$ACTIVE_ACCOUNT" ]]; then
    echo "❌ gcloud not authenticated. Run: gcloud auth login"
    exit 1
  fi
  echo "Using gcloud account: $ACTIVE_ACCOUNT"

  # Build .env.production entirely on the server
  cat > .env.production << ENVEOF
# Auto-generated at $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# Network: $NETWORK — secrets from Google Secret Manager
# DO NOT EDIT — re-deploy to refresh

# --- Network config (derived from NETWORK=$NETWORK) ---
NEAR_NETWORK=$NETWORK
RELAYER_ACCOUNT_ID=relayer.$NEAR_SUFFIX
RELAYER_ALLOWED_CONTRACTS=core.$NEAR_SUFFIX,scarces.$NEAR_SUFFIX,rewards.$NEAR_SUFFIX
SOCIAL_TOKEN_CONTRACT=token.$NEAR_SUFFIX
STAKING_CONTRACT=staking.$NEAR_SUFFIX
MARKETPLACE_CONTRACT=marketplace.$NEAR_SUFFIX
GCP_KMS_KEYRING_0=$KMS_KEYRING_0
GCP_KMS_KEYRING_1=$KMS_KEYRING_1
PUBLIC_DOMAIN=$PUBLIC_DOMAIN
CORS_ORIGINS=$CORS_ORIGINS
HASURA_GRAPHQL_CORS_DOMAIN=$HASURA_CORS

ENVEOF

  # Append secrets from GSM
  echo "# --- Secrets (from Google Secret Manager) ---" >> .env.production
  GCP_PROJECT="$GCP_PROJECT" NEAR_NETWORK="$NETWORK" ./pull-secrets.sh >> .env.production

  # Verify no placeholders
  if grep -q "CHANGE_ME" .env.production; then
    echo "❌ .env.production has CHANGE_ME placeholders — some GSM secrets are missing"
    exit 1
  fi

  echo "✅ .env.production generated on server from GSM"
GSM_SCRIPT

# --- Deploy ---
info "Deploying (image tag: $IMAGE_TAG)..."
ssh "root@$SERVER_IP" bash -s "$IMAGE_TAG" << 'REMOTE_SCRIPT'
  set -euo pipefail
  cd /opt/onsocial
  IMAGE_TAG="$1"

  # Save previous tag for rollback
  PREV_TAG="unknown"
  [ -f .env.image ] && PREV_TAG=$(grep IMAGE_TAG .env.image | cut -d= -f2)
  echo "Previous tag: $PREV_TAG → New tag: $IMAGE_TAG"

  # Write image tag for docker compose
  echo "IMAGE_TAG=$IMAGE_TAG" > .env.image

  # Pull new images
  echo "Pulling images (tag: $IMAGE_TAG)..."
  set -a && source .env.production && source .env.image && set +a
  docker compose pull caddy gateway notification-worker relayer-0 relayer-1 backend

  # Health check helper
  check_health() {
    local name="$1" url="$2" retries="${3:-20}" delay="${4:-3}"
    for i in $(seq 1 "$retries"); do
      if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
        echo "  ✅ $name healthy (attempt $i/$retries)"
        return 0
      fi
      echo "  ⏳ $name not ready ($i/$retries)..."
      sleep "$delay"
    done
    echo "  ❌ $name failed after $retries attempts"
    return 1
  }

  check_service_health() {
    local service_name="$1" retries="${2:-20}" delay="${3:-3}"
    local status
    for i in $(seq 1 "$retries"); do
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$service_name" 2>/dev/null || true)"
      if [[ "$status" = "healthy" || "$status" = "running" ]]; then
        echo "  ✅ $service_name healthy (attempt $i/$retries)"
        return 0
      fi
      echo "  ⏳ $service_name not ready ($i/$retries)..."
      sleep "$delay"
    done
    echo "  ❌ $service_name failed after $retries attempts"
    return 1
  }

  run_gateway_schema_sync() {
    local database_url="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"

    echo "Ensuring postgres and hasura are up before migrations..."
    docker compose up -d postgres hasura
    check_health "hasura" "http://localhost:8080/healthz" 25 4

    echo "Applying gateway SQL migrations..."
    docker compose run --rm --no-deps -e DATABASE_URL="$database_url" --entrypoint node gateway \
      packages/onsocial-gateway/dist/scripts/apply-migrations.js

    echo "Applying Hasura tracking and permissions..."
    docker compose run --rm --no-deps --entrypoint node gateway \
      packages/onsocial-gateway/dist/scripts/apply-hasura-permissions.js create
  }

  # Rolling restart with health verification
  echo "Rolling relayer-1..."
  docker compose up -d --no-deps relayer-1
  check_health "relayer-1" "http://localhost:3040/ready" 20 3 || {
    echo "❌ relayer-1 failed — rolling back to $PREV_TAG"
    echo "IMAGE_TAG=$PREV_TAG" > .env.image
    set -a && source .env.production && source .env.image && set +a
    docker compose up -d --no-deps relayer-1
    exit 1
  }

  echo "Rolling relayer-0..."
  docker compose up -d --no-deps relayer-0
  sleep 10

  run_gateway_schema_sync

  echo "Restarting notification worker..."
  docker compose up -d --no-deps notification-worker
  check_service_health notification-worker 20 3 || {
    echo "❌ notification-worker failed — rolling back to $PREV_TAG"
    echo "IMAGE_TAG=$PREV_TAG" > .env.image
    set -a && source .env.production && source .env.image && set +a
    docker compose up -d --no-deps notification-worker gateway relayer-0 relayer-1
    exit 1
  }

  echo "Rolling gateway..."
  docker compose up -d --no-deps gateway
  check_health "gateway" "http://localhost:8080/health" 20 3 || {
    echo "❌ Gateway failed — rolling back to $PREV_TAG"
    echo "IMAGE_TAG=$PREV_TAG" > .env.image
    set -a && source .env.production && source .env.image && set +a
    docker compose up -d --no-deps gateway relayer-0 relayer-1
    exit 1
  }

  echo "Reloading caddy..."
  docker compose up -d --no-deps caddy

  echo "Rolling backend..."
  docker compose up -d --no-deps backend

  # Bring up any remaining services (postgres, hasura, relayer-lb, monitoring, backup)
  docker compose up -d

  echo ""
  echo "Waiting for all services..."
  sleep 5

  echo ""
  echo "Service status:"
  docker compose ps --format "table {{.Name}}\t{{.Status}}"
REMOTE_SCRIPT

echo ""
info "Deployment complete!"
echo ""
echo "  Network:   $NETWORK"
echo "  Domain:    https://$PUBLIC_DOMAIN"
echo "  Image Tag: $IMAGE_TAG"
echo "  Secrets:   Pulled live from GSM on server"
echo ""
echo "Rollback to previous version:"
echo "  $0 $NETWORK $SERVER_IP --tag <previous-sha>"
echo ""
echo "Server access:"
echo "  ssh root@$SERVER_IP"
echo "  cd /opt/onsocial && docker compose logs -f"
