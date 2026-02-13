#!/bin/bash
# =============================================================================
# OnSocial Zero-Downtime Relayer Deploy
# =============================================================================
# Rolls out relayer updates one instance at a time. While one instance is
# rebuilding, the other continues serving traffic through the Caddy LB.
#
# Usage: ./deploy-relayer-rolling.sh <server-ip>
#
# Flow:
#   1. Build new relayer image
#   2. Stop relayer-1 → LB routes all traffic to relayer-0
#   3. Recreate relayer-1 with new image → wait for /ready
#   4. Stop relayer-0 → LB routes all traffic to relayer-1
#   5. Recreate relayer-0 with new image → wait for /ready
#   6. Both instances serving — done
#
# Total downtime: 0 seconds (one instance always healthy).

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}✅ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

SERVER_IP="${1:-}"
if [ -z "$SERVER_IP" ]; then
  echo "Usage: $0 <server-ip>"
  echo ""
  echo "Performs a zero-downtime rolling deploy of relay instances."
  echo "Both relayer-0 and relayer-1 are updated one at a time."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_DIR="/opt/onsocial"

READY_TIMEOUT=120  # seconds to wait for /ready
DRAIN_WAIT=5       # seconds to let in-flight TXs drain after SIGTERM

wait_ready() {
  local container="$1"
  local elapsed=0

  echo "  Waiting for $container /ready ..."
  while [ $elapsed -lt $READY_TIMEOUT ]; do
    # Check if the container's /ready endpoint returns 200
    local status
    status=$(ssh "root@$SERVER_IP" \
      "docker exec $container curl -sf -o /dev/null -w '%{http_code}' http://localhost:3040/ready 2>/dev/null || echo 503")
    if [ "$status" = "200" ]; then
      info "$container is ready (${elapsed}s)"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  error "$container failed to become ready within ${READY_TIMEOUT}s"
}

# --- Step 1: Sync relayer source ---
info "Syncing relayer source to server..."
rsync -avz --progress \
  --exclude='target' \
  "$REPO_DIR/packages/relayer/" \
  "root@$SERVER_IP:$REMOTE_DIR/packages/relayer/"

rsync -avz --progress \
  "$REPO_DIR/docker/Dockerfile.relayer" \
  "root@$SERVER_IP:$REMOTE_DIR/docker/"

# Also sync the Caddyfile for the relayer LB
rsync -avz --progress \
  "$SCRIPT_DIR/Caddyfile.relayer" \
  "root@$SERVER_IP:$REMOTE_DIR/"

# --- Step 2: Build new image (shared by both instances) ---
info "Building new relayer image on server..."
ssh "root@$SERVER_IP" "cd $REMOTE_DIR && docker compose --env-file .env.production build relayer-0"

# --- Step 3: Roll relayer-1 first ---
echo ""
echo "=========================================="
echo " Rolling relayer-1"
echo "=========================================="

info "Stopping relayer-1 (LB drains to relayer-0)..."
ssh "root@$SERVER_IP" "cd $REMOTE_DIR && docker compose --env-file .env.production stop relayer-1"
sleep $DRAIN_WAIT

info "Recreating relayer-1 with new image..."
ssh "root@$SERVER_IP" "cd $REMOTE_DIR && docker compose --env-file .env.production up -d --no-deps relayer-1"

wait_ready "relayer-1"

# --- Step 4: Roll relayer-0 ---
echo ""
echo "=========================================="
echo " Rolling relayer-0"
echo "=========================================="

info "Stopping relayer-0 (LB drains to relayer-1)..."
ssh "root@$SERVER_IP" "cd $REMOTE_DIR && docker compose --env-file .env.production stop relayer-0"
sleep $DRAIN_WAIT

info "Recreating relayer-0 with new image..."
ssh "root@$SERVER_IP" "cd $REMOTE_DIR && docker compose --env-file .env.production up -d --no-deps relayer-0"

wait_ready "relayer-0"

# --- Step 5: Verify both healthy ---
echo ""
echo "=========================================="
echo " Verification"
echo "=========================================="

info "Both instances deployed. Checking status..."
ssh "root@$SERVER_IP" "cd $REMOTE_DIR && docker compose ps relayer-0 relayer-1 relayer-lb"

echo ""
info "Zero-downtime deploy complete!"
echo ""
echo "  relayer-0: $(ssh "root@$SERVER_IP" "docker exec relayer-0 curl -sf http://localhost:3040/health 2>/dev/null | head -1 || echo 'checking...'")"
echo "  relayer-1: $(ssh "root@$SERVER_IP" "docker exec relayer-1 curl -sf http://localhost:3040/health 2>/dev/null | head -1 || echo 'checking...'")"
