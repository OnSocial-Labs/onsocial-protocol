#!/bin/bash
# =============================================================================
# OnSocial Pages Production Deployment Script
# =============================================================================
# Deploys the pages renderer service for *.onsocial.id subdomains.
# Pulls pre-built image from GHCR (built by build-and-publish-main.yml).
#
# For testnet: pages runs as a service in the main docker-compose.yml.
# For standalone pages host: uses docker-compose.pages.yml + Caddyfile.pages.
#
# Prerequisites:
#   - DNS: *.onsocial.id → server IP (A record in Namecheap)
#   - Docker installed on server (use --init for first-time setup)
#   - GHCR image already built (via CI or manual docker build+push)

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_SSH_KNOWN_HOSTS="${DEPLOY_SSH_KNOWN_HOSTS:-}"
SSH_OPTIONS=()
SCP_OPTIONS=()

info()  { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  [[ -f "$DEPLOY_SSH_KEY" ]] || error "DEPLOY_SSH_KEY does not exist: $DEPLOY_SSH_KEY"
  SSH_OPTIONS+=( -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes )
  SCP_OPTIONS+=( -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes )
fi

if [[ -n "$DEPLOY_SSH_KNOWN_HOSTS" ]]; then
  [[ -f "$DEPLOY_SSH_KNOWN_HOSTS" ]] || error "DEPLOY_SSH_KNOWN_HOSTS does not exist: $DEPLOY_SSH_KNOWN_HOSTS"
  SSH_OPTIONS+=( -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$DEPLOY_SSH_KNOWN_HOSTS" )
  SCP_OPTIONS+=( -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$DEPLOY_SSH_KNOWN_HOSTS" )
else
  SSH_OPTIONS+=( -o StrictHostKeyChecking=accept-new )
  SCP_OPTIONS+=( -o StrictHostKeyChecking=accept-new )
fi

usage() {
  cat <<'EOF'
Usage:
  deployment/deploy-pages-production.sh <testnet|mainnet> <server-ip> [options]

Options:
  --tag <sha>        Docker image tag (default: latest)
  --standalone       Deploy as standalone stack (docker-compose.pages.yml + own Caddy)
                     Default: deploy as service in existing docker-compose.yml
  --init             First-time server setup (install Docker, create dirs)
  -h, --help         Show this help

Examples:
  # Deploy pages into existing testnet stack
  deployment/deploy-pages-production.sh testnet 135.181.110.183 --tag abc1234

  # Deploy pages as standalone stack on dedicated host
  deployment/deploy-pages-production.sh mainnet 203.0.113.10 --standalone --tag abc1234

  # First-time setup
  deployment/deploy-pages-production.sh testnet 135.181.110.183 --init

Environment:
  DEPLOY_SSH_KEY          Path to SSH key file
  DEPLOY_SSH_KNOWN_HOSTS  Path to known_hosts file
EOF
}

NETWORK="${1:-}"
SERVER_IP="${2:-}"
shift 2 || true

IMAGE_TAG="latest"
RUN_INIT="false"
STANDALONE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --standalone)
      STANDALONE="true"
      shift 1
      ;;
    --init)
      RUN_INIT="true"
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      ;;
  esac
done

if [[ -z "$NETWORK" || -z "$SERVER_IP" ]]; then
  usage
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_PREFIX="ghcr.io/onsocial-labs/onsocial-protocol"

case "$NETWORK" in
  testnet)
    NEAR_RPC_URL="https://rpc.testnet.near.org"
    CORE_CONTRACT="core.onsocial.testnet"
    NEAR_NETWORK="testnet"
    REMOTE_DIR="/opt/onsocial"
    ;;
  mainnet)
    NEAR_RPC_URL="https://rpc.mainnet.near.org"
    CORE_CONTRACT="core.onsocial.near"
    NEAR_NETWORK="mainnet"
    REMOTE_DIR="/opt/onsocial"
    ;;
  *)
    error "Unknown network: $NETWORK (expected testnet or mainnet)"
    ;;
esac

if [[ "$STANDALONE" = "true" ]]; then
  REMOTE_DIR="/opt/onsocial-pages"
fi

echo "============================================"
echo " OnSocial Pages Deploy"
echo " Network:        $NETWORK"
echo " Server:         $SERVER_IP"
echo " Image Tag:      $IMAGE_TAG"
echo " Mode:           $([ "$STANDALONE" = "true" ] && echo "standalone" || echo "integrated")"
echo " NEAR RPC:       $NEAR_RPC_URL"
echo " Core Contract:  $CORE_CONTRACT"
echo "============================================"
echo ""

# ── First-time setup ────────────────────────────────────────────────────────
if [[ "$RUN_INIT" = "true" ]]; then
  info "Running first-time server setup..."
  ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" bash -s "$REMOTE_DIR" <<'INIT_SCRIPT'
    set -euo pipefail
    if ! command -v docker >/dev/null 2>&1; then
      curl -fsSL https://get.docker.com | sh
      systemctl enable --now docker
    fi
    mkdir -p "$1"
INIT_SCRIPT
fi

# ── Standalone mode: sync compose + Caddy files ─────────────────────────────
if [[ "$STANDALONE" = "true" ]]; then
  info "Syncing standalone deployment files..."
  ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" "mkdir -p $REMOTE_DIR"
  scp "${SCP_OPTIONS[@]}" \
    "$SCRIPT_DIR/docker-compose.pages.yml" \
    "$SCRIPT_DIR/Caddyfile.pages" \
    "root@$SERVER_IP:$REMOTE_DIR/"
  COMPOSE_FILE="docker-compose.pages.yml"
else
  COMPOSE_FILE="docker-compose.yml"
fi

# ── Deploy ──────────────────────────────────────────────────────────────────
info "Deploying pages (image tag: $IMAGE_TAG)..."
ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" bash -s \
  "$REMOTE_DIR" "$IMAGE_PREFIX" "$IMAGE_TAG" "$COMPOSE_FILE" \
  "$NEAR_RPC_URL" "$CORE_CONTRACT" "$NEAR_NETWORK" <<'DEPLOY_SCRIPT'
  set -euo pipefail
  REMOTE_DIR="$1"
  IMAGE_PREFIX="$2"
  IMAGE_TAG="$3"
  COMPOSE_FILE="$4"
  NEAR_RPC_URL="$5"
  CORE_CONTRACT="$6"
  NEAR_NETWORK="$7"

  cd "$REMOTE_DIR"

  # Pull image from GHCR
  echo "Pulling ${IMAGE_PREFIX}/pages:${IMAGE_TAG}..."
  docker pull "${IMAGE_PREFIX}/pages:${IMAGE_TAG}"

  # Update env
  if [[ -f .env.image ]]; then
    sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env.image
  else
    echo "IMAGE_TAG=${IMAGE_TAG}" > .env.image
  fi

  # Ensure NEAR config in env
  for envfile in .env .env.production; do
    if [[ -f "$envfile" ]]; then
      grep -q '^NEAR_RPC_URL=' "$envfile" || echo "NEAR_RPC_URL=${NEAR_RPC_URL}" >> "$envfile"
      grep -q '^CORE_CONTRACT=' "$envfile" || echo "CORE_CONTRACT=${CORE_CONTRACT}" >> "$envfile"
      grep -q '^NEAR_NETWORK='  "$envfile" || echo "NEAR_NETWORK=${NEAR_NETWORK}"  >> "$envfile"
    fi
  done

  # Load env
  [[ -f .env.production ]] && { set -a && source .env.production && set +a; }
  [[ -f .env ]] && { set -a && source .env && set +a; }
  set -a && source .env.image && set +a

  echo "Rolling pages..."
  docker compose -f "$COMPOSE_FILE" up -d --no-deps pages

  # Health check
  for i in $(seq 1 15); do
    if docker compose -f "$COMPOSE_FILE" exec -T pages \
        wget -q --spider http://localhost:3456/health 2>/dev/null; then
      echo "  ✅ Pages healthy (attempt $i/15)"
      echo ""
      docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}" pages
      exit 0
    fi
    echo "  ⏳ Pages not ready ($i/15)..."
    sleep 3
  done
  echo "❌ Pages health check failed"
  docker compose -f "$COMPOSE_FILE" logs --tail=50 pages
  exit 1
DEPLOY_SCRIPT

info "Pages deployment complete!"
echo ""
echo "  *.onsocial.id → $SERVER_IP (ensure DNS is configured)"
echo ""
