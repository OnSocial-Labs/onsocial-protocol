#!/bin/bash
# =============================================================================
# OnSocial App-Only Production Deployment Script
# =============================================================================
# Deploys the dedicated app host only:
#   - caddy
#   - gateway
#   - backend
#   - relayer-lb (proxying to remote private relayer hosts)
#
# This script intentionally does not deploy postgres, hasura, or relayer
# containers on the app host. Backend and gateway run as same-host blue/green
# pairs so traffic can switch after the inactive slot passes health checks.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_SSH_KNOWN_HOSTS="${DEPLOY_SSH_KNOWN_HOSTS:-}"
SKIP_REMOTE_SECRET_PULL="${SKIP_REMOTE_SECRET_PULL:-false}"
REMOTE_GCP_PROJECT="${REMOTE_GCP_PROJECT:-onsocial-protocol}"
REMOTE_GCLOUD_KEY_FILE="${REMOTE_GCLOUD_KEY_FILE:-}"
SSH_OPTIONS=()
SCP_OPTIONS=()
RSYNC_RSH="ssh"

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

RSYNC_RSH+=" ${SSH_OPTIONS[*]}"

usage() {
  cat <<'EOF'
Usage:
  deployment/deploy-app-production.sh <testnet|mainnet> <server-ip> \
    --hasura-url <private-hasura-url> \
    --postgres-host <private-postgres-host> \
    [--postgres-port <5432>] \
    [--backend-db-name <onsocial_backend>] \
    [--relayer0-url <http://10.1.0.2:3040>] \
    [--relayer1-url <http://10.1.0.3:3040>] \
    [--target <backend|gateway|all>] \
    [--tag <sha>] \
    [--init]

Examples:
  deployment/deploy-app-production.sh mainnet 204.168.165.39 \
    --hasura-url http://10.1.0.6:8080/v1/graphql \
    --postgres-host 10.1.0.6 \
    --target backend

  deployment/deploy-app-production.sh mainnet 204.168.165.39 \
    --hasura-url http://10.1.0.6:8080/v1/graphql \
    --postgres-host 10.1.0.6 \
    --target all \
    --tag <sha>

Environment:
  REMOTE_GCP_PROJECT       Default: onsocial-protocol
  REMOTE_GCLOUD_KEY_FILE   Optional path on the remote host to a service-account
                           key with Secret Manager access. If unset, the script
                           falls back to /root/onsocial-gcp-key.json when present.
EOF
}

NETWORK="${1:-}"
SERVER_IP="${2:-}"
shift 2 || true

HASURA_URL=""
POSTGRES_HOST=""
POSTGRES_PORT="5432"
BACKEND_DB_NAME="onsocial_backend"
RELAYER0_URL="http://10.1.0.2:3040"
RELAYER1_URL="http://10.1.0.3:3040"
DEPLOY_TARGET="backend"
IMAGE_TAG="latest"
RUN_INIT="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hasura-url)
      HASURA_URL="$2"
      shift 2
      ;;
    --postgres-host)
      POSTGRES_HOST="$2"
      shift 2
      ;;
    --postgres-port)
      POSTGRES_PORT="$2"
      shift 2
      ;;
    --backend-db-name)
      BACKEND_DB_NAME="$2"
      shift 2
      ;;
    --relayer0-url)
      RELAYER0_URL="$2"
      shift 2
      ;;
    --relayer1-url)
      RELAYER1_URL="$2"
      shift 2
      ;;
    --target)
      DEPLOY_TARGET="$2"
      shift 2
      ;;
    --tag)
      IMAGE_TAG="$2"
      shift 2
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

if [[ -z "$NETWORK" || -z "$SERVER_IP" || -z "$HASURA_URL" || -z "$POSTGRES_HOST" ]]; then
  usage
  exit 1
fi

case "$DEPLOY_TARGET" in
  backend|gateway|all)
    ;;
  *)
    error "--target must be backend, gateway, or all"
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_DIR="/opt/onsocial"

case "$NETWORK" in
  testnet)
    NEAR_SUFFIX="onsocial.testnet"
    PUBLIC_DOMAIN="testnet.onsocial.id"
    SERVER_NAMES="testnet.onsocial.id"
    CORS_ORIGINS="https://testnet.onsocial.id,http://localhost:3000,http://localhost:4000"
    ;;
  mainnet)
    NEAR_SUFFIX="onsocial.near"
    PUBLIC_DOMAIN="api.onsocial.id"
    SERVER_NAMES="api.onsocial.id, mainnet.onsocial.id"
    CORS_ORIGINS="https://onsocial.id,https://app.onsocial.id,https://api.onsocial.id"
    ;;
  *)
    error "Unknown network: $NETWORK (expected testnet or mainnet)"
    ;;
esac

echo "============================================"
echo " OnSocial App-Only Deploy"
echo " Network:        $NETWORK"
echo " Server:         $SERVER_IP"
echo " Deploy Target:  $DEPLOY_TARGET"
echo " Image Tag:      $IMAGE_TAG"
echo " Public Domain:  $PUBLIC_DOMAIN"
echo " Hasura URL:     $HASURA_URL"
echo " Postgres Host:  $POSTGRES_HOST:$POSTGRES_PORT"
echo " Relayer 0 URL:  $RELAYER0_URL"
echo " Relayer 1 URL:  $RELAYER1_URL"
echo "============================================"
echo ""

if [[ "$RUN_INIT" = "true" ]]; then
  info "Running first-time server setup..."
  ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" bash <<'INIT_SCRIPT'
    set -euo pipefail
    if ! command -v docker >/dev/null 2>&1; then
      curl -fsSL https://get.docker.com | sh
      systemctl enable --now docker
    fi
    if ! command -v gcloud >/dev/null 2>&1; then
      curl -fsSL https://sdk.cloud.google.com | bash -s -- --disable-prompts --install-dir=/opt
      ln -sf /opt/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud
    fi
    mkdir -p /opt/onsocial
INIT_SCRIPT
fi

info "Preparing Caddyfile template for $PUBLIC_DOMAIN..."

info "Syncing app-tier deployment files..."
rsync -avz --progress -e "$RSYNC_RSH" \
  "$SCRIPT_DIR/docker-compose.app.yml" \
  "$SCRIPT_DIR/Caddyfile.relayer.remote" \
  "$ROOT_DIR/scripts/pull-secrets.sh" \
  "root@$SERVER_IP:$REMOTE_DIR/"

scp "${SCP_OPTIONS[@]}" "$SCRIPT_DIR/Caddyfile" "root@$SERVER_IP:$REMOTE_DIR/Caddyfile.template"

ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" "cd $REMOTE_DIR && chmod +x pull-secrets.sh"

if [[ "$SKIP_REMOTE_SECRET_PULL" != "true" ]]; then
info "Generating app-tier env file on server..."
ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" bash -s \
  "$NETWORK" "$NEAR_SUFFIX" "$PUBLIC_DOMAIN" "$CORS_ORIGINS" \
  "$HASURA_URL" "$POSTGRES_HOST" "$POSTGRES_PORT" "$BACKEND_DB_NAME" \
  "$RELAYER0_URL" "$RELAYER1_URL" "$DEPLOY_TARGET" "$REMOTE_GCP_PROJECT" "$REMOTE_GCLOUD_KEY_FILE" <<'GSM_SCRIPT'
  set -euo pipefail
  cd /opt/onsocial

  NETWORK="$1"
  NEAR_SUFFIX="$2"
  PUBLIC_DOMAIN="$3"
  CORS_ORIGINS="$4"
  HASURA_URL="$5"
  POSTGRES_HOST="$6"
  POSTGRES_PORT="$7"
  BACKEND_DB_NAME="$8"
  RELAYER0_URL="$9"
  RELAYER1_URL="${10}"
  DEPLOY_TARGET="${11}"
  GCP_PROJECT="${12:-onsocial-protocol}"
  GCLOUD_KEY_FILE="${13:-}"

  if ! command -v gcloud >/dev/null 2>&1; then
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
    echo "❌ gcloud not authenticated on server."
    exit 1
  fi
  echo "Using gcloud account: $ACTIVE_ACCOUNT"

  fetch_secret() {
    local name="$1"
    gcloud secrets versions access latest --secret="$name" --project="$GCP_PROJECT"
  }

  TELEGRAM_BOT_SECRET_NAME="TELEGRAM_BOT_TOKEN_TESTNET"
  if [[ "$NETWORK" = "mainnet" ]]; then
    TELEGRAM_BOT_SECRET_NAME="TELEGRAM_BOT_TOKEN_MAINNET"
  fi

  POSTGRES_PASSWORD="$(fetch_secret POSTGRES_PASSWORD)"
  HASURA_ADMIN_SECRET="$(fetch_secret HASURA_ADMIN_SECRET)"
  RELAYER_API_KEY="$(fetch_secret RELAYER_API_KEY)"
  TELEGRAM_BOT_TOKEN="$(fetch_secret "$TELEGRAM_BOT_SECRET_NAME")"
  ADMIN_SECRET="$(fetch_secret ADMIN_SECRET)"

  JWT_SECRET="$(fetch_secret JWT_SECRET)"
  LIGHTHOUSE_API_KEY="$(fetch_secret LIGHTHOUSE_API_KEY)"

  cat > .env.production <<ENVEOF
# Auto-generated at $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# App tier only — secrets from Google Secret Manager

NEAR_NETWORK=$NETWORK
SOCIAL_TOKEN_CONTRACT=token.$NEAR_SUFFIX
STAKING_CONTRACT=staking.$NEAR_SUFFIX
PUBLIC_DOMAIN=$PUBLIC_DOMAIN
WEBHOOK_URL=https://$PUBLIC_DOMAIN/webhooks/telegram
CORS_ORIGINS=$CORS_ORIGINS
HASURA_URL=$HASURA_URL
POSTGRES_HOST=$POSTGRES_HOST
POSTGRES_PORT=$POSTGRES_PORT
BACKEND_DB_NAME=$BACKEND_DB_NAME
RELAYER0_URL=$RELAYER0_URL
RELAYER1_URL=$RELAYER1_URL
RELAYER_URL=http://relayer-lb:3040
POSTGRES_USER=onsocial
POSTGRES_DB=onsocial_indexer
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
HASURA_ADMIN_SECRET=$HASURA_ADMIN_SECRET
RELAYER_API_KEY=$RELAYER_API_KEY
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
ADMIN_SECRET=$ADMIN_SECRET
ENVEOF

  {
    printf 'JWT_SECRET=%s\n' "$JWT_SECRET"
    printf 'LIGHTHOUSE_API_KEY=%s\n' "$LIGHTHOUSE_API_KEY"
  } >> .env.production

  printf 'BACKEND_DATABASE_URL=postgres://%s:%s@%s:%s/%s\n' \
    "onsocial" "$POSTGRES_PASSWORD" "$POSTGRES_HOST" "$POSTGRES_PORT" "$BACKEND_DB_NAME" \
    >> .env.production

  if grep -q 'CHANGE_ME' .env.production; then
    echo "❌ .env.production has CHANGE_ME placeholders"
    exit 1
  fi

  chmod 600 .env.production
  echo "✅ .env.production generated on server"
GSM_SCRIPT
else
  warn "Skipping remote secret pull; expecting /opt/onsocial/.env.production to already exist on the server"
fi

info "Deploying app tier..."
ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" bash -s "$IMAGE_TAG" "$DEPLOY_TARGET" <<'REMOTE_SCRIPT'
  set -euo pipefail
  cd /opt/onsocial
  IMAGE_TAG="$1"
  DEPLOY_TARGET="$2"

  BACKEND_SLOT_FILE=".backend-slot"
  GATEWAY_SLOT_FILE=".gateway-slot"
  CADDY_TEMPLATE_FILE="Caddyfile.template"
  CADDY_RENDERED_FILE="Caddyfile.rendered"
  CADDY_ACTIVE_FILE="Caddyfile"
  CADDY_BACKUP_FILE="Caddyfile.rollback"

  echo "IMAGE_TAG=$IMAGE_TAG" > .env.image
  set -a && source .env.production && source .env.image && set +a

  check_health() {
    local name="$1"
    local url="$2"
    local retries="${3:-20}"
    local delay="${4:-3}"
    local attempt

    for attempt in $(seq 1 "$retries"); do
      if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
        echo "  ✅ $name healthy (attempt $attempt/$retries)"
        return 0
      fi
      echo "  ⏳ $name not ready ($attempt/$retries)..."
      sleep "$delay"
    done
    echo "  ❌ $name failed after $retries attempts"
    return 1
  }

  slot_service_name() {
    local service_prefix="$1"
    local slot="$2"
    echo "${service_prefix}-${slot}"
  }

  slot_health_url() {
    local service_prefix="$1"
    local slot="$2"
    if [[ "$service_prefix" = "backend" ]]; then
      if [[ "$slot" = "blue" ]]; then
        echo "http://127.0.0.1:14001/health"
      else
        echo "http://127.0.0.1:24001/health"
      fi
    else
      if [[ "$slot" = "blue" ]]; then
        echo "http://127.0.0.1:18080/health"
      else
        echo "http://127.0.0.1:28080/health"
      fi
    fi
  }

  next_slot() {
    local current="$1"
    if [[ "$current" = "blue" ]]; then
      echo "green"
    else
      echo "blue"
    fi
  }

  read_slot_file() {
    local path="$1"
    local default_value="$2"
    if [[ -f "$path" ]]; then
      local value
      value="$(cat "$path")"
      if [[ "$value" = "blue" || "$value" = "green" ]]; then
        echo "$value"
        return
      fi
    fi
    echo "$default_value"
  }

  is_service_running() {
    local service_name="$1"
    docker ps --format '{{.Names}}' | grep -qx "$service_name"
  }

  server_names_value() {
    if [[ "$PUBLIC_DOMAIN" = "testnet.onsocial.id" ]]; then
      echo "testnet.onsocial.id"
    else
      echo "api.onsocial.id, mainnet.onsocial.id"
    fi
  }

  render_caddyfile() {
    local backend_slot="$1"
    local gateway_slot="$2"
    sed \
      -e "s/__SERVER_NAMES__/$(server_names_value)/g" \
      -e "s/__BACKEND_UPSTREAM__/$(slot_service_name backend "$backend_slot"):4001/g" \
      -e "s/__GATEWAY_UPSTREAM__/$(slot_service_name gateway "$gateway_slot"):8080/g" \
      "$CADDY_TEMPLATE_FILE" > "$CADDY_RENDERED_FILE"
  }

  caddy_config_matches() {
    local backend_slot="$1"
    local gateway_slot="$2"

    docker exec app-caddy sh -lc "grep -q 'reverse_proxy backend-${backend_slot}:4001' /etc/caddy/Caddyfile && grep -q 'reverse_proxy gateway-${gateway_slot}:8080' /etc/caddy/Caddyfile"
  }

  reload_caddy() {
    local backend_slot="$1"
    local gateway_slot="$2"

    if docker ps --format '{{.Names}}' | grep -qx 'app-caddy'; then
      docker exec app-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null || true
      if ! caddy_config_matches "$backend_slot" "$gateway_slot"; then
        docker restart app-caddy >/dev/null
      fi
    else
      docker compose -f docker-compose.app.yml up -d caddy
    fi
    check_health caddy http://127.0.0.1/health 25 4
  }

  report_active_state() {
    local backend_slot="$1"
    local gateway_slot="$2"
    echo ""
    echo "Active backend slot: $backend_slot"
    echo "Active gateway slot: $gateway_slot"
  }

  current_backend_slot="$(read_slot_file "$BACKEND_SLOT_FILE" blue)"
  current_gateway_slot="$(read_slot_file "$GATEWAY_SLOT_FILE" blue)"
  next_backend_slot="$(next_slot "$current_backend_slot")"
  next_gateway_slot="$(next_slot "$current_gateway_slot")"
  pending_backend_slot=""
  pending_gateway_slot=""

  rollback_deploy() {
    local exit_code="$1"

    trap - ERR
    echo ""
    echo "⚠️  Deployment failed. Restoring previous live state..."

    if [[ -f "$CADDY_BACKUP_FILE" ]]; then
      cp -f "$CADDY_BACKUP_FILE" "$CADDY_ACTIVE_FILE" >/dev/null 2>&1 || true
      if docker ps --format '{{.Names}}' | grep -qx 'app-caddy'; then
        docker exec app-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
        if ! caddy_config_matches "$current_backend_slot" "$current_gateway_slot"; then
          docker restart app-caddy >/dev/null 2>&1 || true
        fi
      fi
    fi

    if [[ -n "$pending_backend_slot" && "$pending_backend_slot" != "$current_backend_slot" ]]; then
      docker compose -f docker-compose.app.yml stop "$(slot_service_name backend "$pending_backend_slot")" >/dev/null 2>&1 || true
    fi

    if [[ -n "$pending_gateway_slot" && "$pending_gateway_slot" != "$current_gateway_slot" ]]; then
      docker compose -f docker-compose.app.yml stop "$(slot_service_name gateway "$pending_gateway_slot")" >/dev/null 2>&1 || true
    fi

    echo "$current_backend_slot" > "$BACKEND_SLOT_FILE"
    echo "$current_gateway_slot" > "$GATEWAY_SLOT_FILE"
    report_active_state "$current_backend_slot" "$current_gateway_slot"
    exit "$exit_code"
  }

  trap 'rollback_deploy $?' ERR

  if [[ -f "$CADDY_ACTIVE_FILE" ]]; then
    cp -f "$CADDY_ACTIVE_FILE" "$CADDY_BACKUP_FILE"
  fi

  docker compose -f docker-compose.app.yml pull relayer-lb caddy
  docker compose -f docker-compose.app.yml up -d relayer-lb

  if [[ "$DEPLOY_TARGET" = "backend" ]]; then
    pending_backend_slot="$next_backend_slot"
    docker compose -f docker-compose.app.yml pull "$(slot_service_name backend "$next_backend_slot")"
    docker compose -f docker-compose.app.yml up -d "$(slot_service_name backend "$next_backend_slot")"
    check_health "backend-$next_backend_slot" "$(slot_health_url backend "$next_backend_slot")" 25 4

    if ! is_service_running "$(slot_service_name gateway "$current_gateway_slot")"; then
      pending_gateway_slot="$current_gateway_slot"
      docker compose -f docker-compose.app.yml pull "$(slot_service_name gateway "$current_gateway_slot")"
      docker compose -f docker-compose.app.yml up -d "$(slot_service_name gateway "$current_gateway_slot")"
      check_health "gateway-$current_gateway_slot" "$(slot_health_url gateway "$current_gateway_slot")" 25 4
    fi

    render_caddyfile "$next_backend_slot" "$current_gateway_slot"
    mv -f "$CADDY_RENDERED_FILE" "$CADDY_ACTIVE_FILE"
    reload_caddy "$next_backend_slot" "$current_gateway_slot"

    echo "$next_backend_slot" > "$BACKEND_SLOT_FILE"
    echo "$current_gateway_slot" > "$GATEWAY_SLOT_FILE"
    docker compose -f docker-compose.app.yml stop "$(slot_service_name backend "$current_backend_slot")" >/dev/null 2>&1 || true
    report_active_state "$next_backend_slot" "$current_gateway_slot"
  elif [[ "$DEPLOY_TARGET" = "gateway" ]]; then
    pending_gateway_slot="$next_gateway_slot"
    docker compose -f docker-compose.app.yml pull "$(slot_service_name gateway "$next_gateway_slot")"
    docker compose -f docker-compose.app.yml up -d "$(slot_service_name gateway "$next_gateway_slot")"
    check_health "gateway-$next_gateway_slot" "$(slot_health_url gateway "$next_gateway_slot")" 25 4

    if ! is_service_running "$(slot_service_name backend "$current_backend_slot")"; then
      pending_backend_slot="$current_backend_slot"
      docker compose -f docker-compose.app.yml pull "$(slot_service_name backend "$current_backend_slot")"
      docker compose -f docker-compose.app.yml up -d "$(slot_service_name backend "$current_backend_slot")"
      check_health "backend-$current_backend_slot" "$(slot_health_url backend "$current_backend_slot")" 25 4
    fi

    render_caddyfile "$current_backend_slot" "$next_gateway_slot"
    mv -f "$CADDY_RENDERED_FILE" "$CADDY_ACTIVE_FILE"
    reload_caddy "$current_backend_slot" "$next_gateway_slot"

    echo "$current_backend_slot" > "$BACKEND_SLOT_FILE"
    echo "$next_gateway_slot" > "$GATEWAY_SLOT_FILE"
    docker compose -f docker-compose.app.yml stop "$(slot_service_name gateway "$current_gateway_slot")" >/dev/null 2>&1 || true
    report_active_state "$current_backend_slot" "$next_gateway_slot"
  else
    pending_backend_slot="$next_backend_slot"
    pending_gateway_slot="$next_gateway_slot"
    docker compose -f docker-compose.app.yml pull \
      "$(slot_service_name backend "$next_backend_slot")" \
      "$(slot_service_name gateway "$next_gateway_slot")"
    docker compose -f docker-compose.app.yml up -d "$(slot_service_name backend "$next_backend_slot")"
    check_health "backend-$next_backend_slot" "$(slot_health_url backend "$next_backend_slot")" 25 4

    docker compose -f docker-compose.app.yml up -d "$(slot_service_name gateway "$next_gateway_slot")"
    check_health "gateway-$next_gateway_slot" "$(slot_health_url gateway "$next_gateway_slot")" 25 4

    render_caddyfile "$next_backend_slot" "$next_gateway_slot"
    mv -f "$CADDY_RENDERED_FILE" "$CADDY_ACTIVE_FILE"
    reload_caddy "$next_backend_slot" "$next_gateway_slot"

    echo "$next_backend_slot" > "$BACKEND_SLOT_FILE"
    echo "$next_gateway_slot" > "$GATEWAY_SLOT_FILE"

    docker compose -f docker-compose.app.yml stop "$(slot_service_name backend "$current_backend_slot")" >/dev/null 2>&1 || true
    docker compose -f docker-compose.app.yml stop "$(slot_service_name gateway "$current_gateway_slot")" >/dev/null 2>&1 || true
    report_active_state "$next_backend_slot" "$next_gateway_slot"
  fi

  trap - ERR

  docker rm -f backend gateway >/dev/null 2>&1 || true

  echo ""
  docker compose -f docker-compose.app.yml ps --format 'table {{.Name}}\t{{.Status}}'
REMOTE_SCRIPT

echo ""
info "App-tier deployment complete!"
echo ""
echo "  Network:       $NETWORK"
echo "  Server:        $SERVER_IP"
echo "  Deploy Target: $DEPLOY_TARGET"
echo "  Domain:        https://$PUBLIC_DOMAIN"
echo "  Image Tag:     $IMAGE_TAG"
echo ""
echo "Backend-only access:"
echo "  ssh -L 4001:localhost:4001 root@$SERVER_IP"
echo ""
echo "Logs:"
echo "  ssh root@$SERVER_IP 'cd /opt/onsocial && docker compose -f docker-compose.app.yml logs -f'"