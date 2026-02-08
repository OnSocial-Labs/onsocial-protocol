#!/bin/bash
# =============================================================================
# OnSocial Production Deployment Script
# =============================================================================
# Deploys the full stack to Hetzner (or any server with Docker)
#
# Usage: ./deploy-production.sh <server-ip> [--build]
#
# Prerequisites:
#   - SSH access to server (ssh root@<ip>)
#   - Docker + Docker Compose on server
#   - DNS A records pointing to server IP:
#       api.onsocial.id, hasura.onsocial.id, relay.onsocial.id
#   - .env.production filled with real secrets

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

SERVER_IP="${1:-}"
BUILD_FLAG="${2:-}"

if [ -z "$SERVER_IP" ]; then
  echo "Usage: $0 <server-ip> [--build]"
  echo ""
  echo "Examples:"
  echo "  $0 135.181.110.183           # Deploy with pre-built images"
  echo "  $0 135.181.110.183 --build   # Build images on server"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_DIR="/opt/onsocial"

# Validate .env.production exists
if [ ! -f "$SCRIPT_DIR/.env.production" ]; then
  error "Missing deployment/.env.production — copy from .env.production.example and fill in secrets"
fi

# Check for CHANGE_ME values
if grep -q "CHANGE_ME" "$SCRIPT_DIR/.env.production"; then
  error "deployment/.env.production still has CHANGE_ME placeholders — fill in real values"
fi

echo "============================================"
echo " OnSocial Production Deploy"
echo " Server: $SERVER_IP"
echo " Remote: $REMOTE_DIR"
echo "============================================"
echo ""

# --- Step 1: Ensure remote directory structure ---
info "Setting up remote directories..."
ssh "root@$SERVER_IP" "mkdir -p $REMOTE_DIR"

# --- Step 2: Sync deployment files ---
info "Syncing deployment files..."
rsync -avz --progress \
  "$SCRIPT_DIR/docker-compose.yml" \
  "$SCRIPT_DIR/Caddyfile" \
  "$SCRIPT_DIR/.env.production" \
  "root@$SERVER_IP:$REMOTE_DIR/"

# --- Step 3: Sync Docker build contexts (gateway + relayer) ---
info "Syncing Docker build contexts..."
rsync -avz --progress \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='target' \
  --exclude='near-data' \
  --exclude='*.spkg' \
  "$REPO_DIR/docker/Dockerfile.gateway" \
  "$REPO_DIR/docker/Dockerfile.relayer" \
  "root@$SERVER_IP:$REMOTE_DIR/docker/"

rsync -avz --progress \
  --exclude='node_modules' \
  "$REPO_DIR/packages/onsocial-gateway/" \
  "root@$SERVER_IP:$REMOTE_DIR/packages/onsocial-gateway/"

rsync -avz --progress \
  --exclude='node_modules' \
  --exclude='dist' \
  "$REPO_DIR/packages/onsocial-rpc/" \
  "root@$SERVER_IP:$REMOTE_DIR/packages/onsocial-rpc/"

rsync -avz --progress \
  --exclude='target' \
  "$REPO_DIR/packages/relayer/" \
  "root@$SERVER_IP:$REMOTE_DIR/packages/relayer/"

# Sync root files needed for builds
rsync -avz --progress \
  "$REPO_DIR/package.json" \
  "$REPO_DIR/pnpm-workspace.yaml" \
  "$REPO_DIR/pnpm-lock.yaml" \
  "$REPO_DIR/tsconfig.json" \
  "root@$SERVER_IP:$REMOTE_DIR/"

rsync -avz --progress \
  "$REPO_DIR/scripts/sync-deps.js" \
  "root@$SERVER_IP:$REMOTE_DIR/scripts/"

# --- Step 4: Deploy ---
info "Deploying on server..."
ssh "root@$SERVER_IP" bash -s "$BUILD_FLAG" << 'REMOTE_SCRIPT'
  set -euo pipefail
  cd /opt/onsocial
  BUILD_FLAG="$1"

  # Rename compose file for convenience
  # docker-compose.yml is already the production file

  if [ "$BUILD_FLAG" = "--build" ]; then
    echo "Building images on server..."
    docker compose --env-file .env.production build --no-cache
  fi

  echo "Starting services..."
  docker compose --env-file .env.production up -d --build

  echo ""
  echo "Waiting for services to start..."
  sleep 10

  echo ""
  echo "Service status:"
  docker compose ps

  echo ""
  echo "Health checks:"
  docker compose --env-file .env.production ps --format "table {{.Name}}\t{{.Status}}"
REMOTE_SCRIPT

echo ""
info "Deployment complete!"
echo ""
echo "Services:"
echo "  Gateway:  https://api.onsocial.id"
echo "  Hasura:   https://hasura.onsocial.id"
echo "  Relayer:  https://relay.onsocial.id"
echo ""
echo "Useful commands (on server):"
echo "  ssh root@$SERVER_IP"
echo "  cd /opt/onsocial"
echo "  docker compose logs -f gateway     # Gateway logs"
echo "  docker compose logs -f caddy       # TLS/proxy logs"
echo "  docker compose restart gateway     # Restart one service"
echo "  docker compose down && docker compose up -d  # Full restart"
