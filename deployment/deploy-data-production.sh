#!/bin/bash
# =============================================================================
# OnSocial Data-Only Production Deployment Script
# =============================================================================
# Deploys the dedicated data host only:
#   - postgres
#   - hasura
#   - postgres-backup
#
# This script intentionally does not deploy gateway, backend, or relayers.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_SSH_KNOWN_HOSTS="${DEPLOY_SSH_KNOWN_HOSTS:-}"
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
  deployment/deploy-data-production.sh <testnet|mainnet> <server-ip> \
    --private-bind-ip <10.x.x.x> \
    [--target <postgres|all>] \
    [--init]

Examples:
  deployment/deploy-data-production.sh mainnet 203.0.113.10 \
    --private-bind-ip 10.1.0.6 \
    --target postgres

  deployment/deploy-data-production.sh mainnet 203.0.113.10 \
    --private-bind-ip 10.1.0.6 \
    --target all

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

PRIVATE_BIND_IP=""
DEPLOY_TARGET="postgres"
RUN_INIT="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --private-bind-ip)
      PRIVATE_BIND_IP="$2"
      shift 2
      ;;
    --target)
      DEPLOY_TARGET="$2"
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

if [[ -z "$NETWORK" || -z "$SERVER_IP" || -z "$PRIVATE_BIND_IP" ]]; then
  usage
  exit 1
fi

case "$DEPLOY_TARGET" in
  postgres|all)
    ;;
  *)
    error "--target must be postgres or all"
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_DIR="/opt/onsocial-data"

case "$NETWORK" in
  testnet)
    PUBLIC_DOMAIN="testnet.onsocial.id"
    HASURA_CORS="https://testnet.onsocial.id,http://localhost:3000"
    ;;
  mainnet)
    PUBLIC_DOMAIN="api.onsocial.id"
    HASURA_CORS="https://onsocial.id,https://app.onsocial.id,https://api.onsocial.id"
    ;;
  *)
    error "Unknown network: $NETWORK (expected testnet or mainnet)"
    ;;
esac

echo "============================================"
echo " OnSocial Data-Only Deploy"
echo " Network:         $NETWORK"
echo " Server:          $SERVER_IP"
echo " Private Bind IP: $PRIVATE_BIND_IP"
echo " Deploy Target:   $DEPLOY_TARGET"
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
    mkdir -p /opt/onsocial-data
INIT_SCRIPT
fi

info "Syncing data-tier deployment files..."
rsync -avz --progress -e "$RSYNC_RSH" \
  "$SCRIPT_DIR/docker-compose.data.yml" \
  "$SCRIPT_DIR/init-extra-dbs.sh" \
  "$ROOT_DIR/scripts/pull-secrets.sh" \
  "root@$SERVER_IP:$REMOTE_DIR/"

ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" "cd $REMOTE_DIR && chmod +x pull-secrets.sh init-extra-dbs.sh"

info "Generating data-tier env file on server..."
ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" bash -s \
  "$NETWORK" "$PRIVATE_BIND_IP" "$HASURA_CORS" "$REMOTE_GCP_PROJECT" "$REMOTE_GCLOUD_KEY_FILE" <<'GSM_SCRIPT'
  set -euo pipefail
  cd /opt/onsocial-data

  NETWORK="$1"
  PRIVATE_BIND_IP="$2"
  HASURA_CORS="$3"
  GCP_PROJECT="${4:-onsocial-protocol}"
  GCLOUD_KEY_FILE="${5:-}"

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

  POSTGRES_PASSWORD="$(fetch_secret POSTGRES_PASSWORD)"
  HASURA_ADMIN_SECRET="$(fetch_secret HASURA_ADMIN_SECRET)"

  cat > .env.production <<ENVEOF
# Auto-generated at $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# Data tier only — secrets from Google Secret Manager

NEAR_NETWORK=$NETWORK
PRIVATE_BIND_IP=$PRIVATE_BIND_IP
HASURA_GRAPHQL_CORS_DOMAIN=$HASURA_CORS
HASURA_ENABLE_CONSOLE=false
HASURA_GRAPHQL_PG_CONNECTIONS=50
POSTGRES_USER=onsocial
POSTGRES_DB=onsocial_indexer
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
HASURA_ADMIN_SECRET=$HASURA_ADMIN_SECRET
ENVEOF

  if grep -q 'CHANGE_ME' .env.production; then
    echo "❌ .env.production has CHANGE_ME placeholders"
    exit 1
  fi

  chmod 600 .env.production
  echo "✅ .env.production generated on server"
GSM_SCRIPT

info "Deploying data tier..."
ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" bash -s "$DEPLOY_TARGET" <<'REMOTE_SCRIPT'
  set -euo pipefail
  cd /opt/onsocial-data
  DEPLOY_TARGET="$1"

  set -a && source .env.production && set +a

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

  check_postgres() {
    local retries="${1:-20}"
    local delay="${2:-3}"
    local attempt

    for attempt in $(seq 1 "$retries"); do
      if docker exec postgres pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
        echo "  ✅ postgres healthy (attempt $attempt/$retries)"
        return 0
      fi
      echo "  ⏳ postgres not ready ($attempt/$retries)..."
      sleep "$delay"
    done
    echo "  ❌ postgres failed after $retries attempts"
    return 1
  }

  docker compose -f docker-compose.data.yml pull postgres hasura postgres-backup

  docker compose -f docker-compose.data.yml up -d postgres
  check_postgres 25 4

  if [[ "$DEPLOY_TARGET" = "all" ]]; then
    docker compose -f docker-compose.data.yml up -d hasura postgres-backup
    check_health hasura http://127.0.0.1:8080/healthz 25 4
  fi

  echo ""
  docker compose -f docker-compose.data.yml ps --format 'table {{.Name}}\t{{.Status}}'
REMOTE_SCRIPT

echo ""
info "Data-tier deployment complete!"
echo ""
echo "  Network:         $NETWORK"
echo "  Server:          $SERVER_IP"
echo "  Private Bind IP: $PRIVATE_BIND_IP"
echo "  Postgres:        $PRIVATE_BIND_IP:5432"
echo "  Hasura:          $PRIVATE_BIND_IP:8080"
echo ""
echo "Admin access:"
echo "  ssh -L 5432:localhost:5432 root@$SERVER_IP"
echo "  ssh -L 8080:localhost:8080 root@$SERVER_IP"