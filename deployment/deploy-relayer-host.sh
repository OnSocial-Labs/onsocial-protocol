#!/bin/bash
set -euo pipefail

info() {
  echo "[relayer-deploy] $1"
}

error() {
  echo "[relayer-deploy] ERROR: $1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  bash deployment/deploy-relayer-host.sh \
    --host <private-host-or-ip> \
    --instance-name <relayer-0|relayer-1> \
    --keyring <gcp-kms-keyring> \
    --signer-file <path-to-relayer-signer.json> \
    [--image-tag <tag>] \
    [--network <mainnet|testnet>] \
    [--allowed-contracts <csv>] \
    [--relayer-account-id <account>] \
    [--deploy-user <ssh-user>] \
    [--remote-dir <remote-dir>] \
    [--bind-ip <bind-ip>] \
    [--dry-run]

Examples:
  bash deployment/deploy-relayer-host.sh \
    --host <mainnet-relayer-private-host> \
    --instance-name relayer-0 \
    --keyring relayer-keys-mainnet \
    --signer-file /tmp/relayer-signer.json \
    --image-tag abc1234
EOF
}

HOST=""
INSTANCE_NAME=""
KEYRING=""
SIGNER_FILE=""
IMAGE_TAG="mainnet-relayer-latest"
NETWORK="mainnet"
ALLOWED_CONTRACTS="rewards.onsocial.near"
RELAYER_ACCOUNT_ID="relayer.onsocial.near"
DEPLOY_USER="root"
REMOTE_DIR="/opt/onsocial-relayer"
RELAYER_BIND_IP="0.0.0.0"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_SSH_KNOWN_HOSTS="${DEPLOY_SSH_KNOWN_HOSTS:-}"
DRY_RUN="false"

SSH_OPTIONS=()
SCP_OPTIONS=()

if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  [[ -f "$DEPLOY_SSH_KEY" ]] || error "DEPLOY_SSH_KEY does not exist: $DEPLOY_SSH_KEY"
  SSH_OPTIONS+=( -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes )
  SCP_OPTIONS+=( -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes )
fi

if [[ -n "$DEPLOY_SSH_KNOWN_HOSTS" ]]; then
  [[ -f "$DEPLOY_SSH_KNOWN_HOSTS" ]] || error "DEPLOY_SSH_KNOWN_HOSTS does not exist: $DEPLOY_SSH_KNOWN_HOSTS"
  SSH_OPTIONS+=( -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$DEPLOY_SSH_KNOWN_HOSTS" )
  SCP_OPTIONS+=( -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$DEPLOY_SSH_KNOWN_HOSTS" )
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"
      shift 2
      ;;
    --instance-name)
      INSTANCE_NAME="$2"
      shift 2
      ;;
    --keyring)
      KEYRING="$2"
      shift 2
      ;;
    --signer-file)
      SIGNER_FILE="$2"
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --allowed-contracts)
      ALLOWED_CONTRACTS="$2"
      shift 2
      ;;
    --relayer-account-id)
      RELAYER_ACCOUNT_ID="$2"
      shift 2
      ;;
    --deploy-user)
      DEPLOY_USER="$2"
      shift 2
      ;;
    --remote-dir)
      REMOTE_DIR="$2"
      shift 2
      ;;
    --bind-ip)
      RELAYER_BIND_IP="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
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

[[ -n "$HOST" ]] || error "--host is required"
[[ -n "$INSTANCE_NAME" ]] || error "--instance-name is required"
[[ -n "$KEYRING" ]] || error "--keyring is required"
[[ -n "$SIGNER_FILE" ]] || error "--signer-file is required"
[[ -f "$SIGNER_FILE" ]] || error "Signer file not found: $SIGNER_FILE"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.relayer.yml"
PULL_SECRETS_SCRIPT="$ROOT_DIR/scripts/pull-secrets.sh"

[[ -f "$COMPOSE_FILE" ]] || error "Missing compose file: $COMPOSE_FILE"
[[ -f "$PULL_SECRETS_SCRIPT" ]] || error "Missing script: $PULL_SECRETS_SCRIPT"
command -v gcloud >/dev/null 2>&1 || error "gcloud is required in the deploy environment"
command -v ssh >/dev/null 2>&1 || error "ssh is required in the deploy environment"
command -v scp >/dev/null 2>&1 || error "scp is required in the deploy environment"

TEMP_DIR="$(mktemp -d)"
RAW_ENV="$TEMP_DIR/relayer.raw.env"
DEPLOY_ENV="$TEMP_DIR/.env.relayer"
trap 'rm -rf "$TEMP_DIR"' EXIT

info "Pulling relayer secrets for $NETWORK"
NEAR_NETWORK="$NETWORK" "$PULL_SECRETS_SCRIPT" > "$RAW_ENV"

grep -E '^(RELAYER_API_KEY|LAVA_API_KEY|NEARBLOCKS_API_KEY|GCP_KMS_PROJECT|GCP_KMS_LOCATION|GCP_KMS_POOL_SIZE|GCP_KMS_ADMIN_KEY|RELAYER_MIN_KEYS|RELAYER_MAX_KEYS|RELAYER_WARM_BUFFER|RELAYER_MAX_KEY_AGE)=' "$RAW_ENV" > "$DEPLOY_ENV"

cat >> "$DEPLOY_ENV" <<EOF
IMAGE_TAG=$IMAGE_TAG
RELAYER_INSTANCE_NAME=$INSTANCE_NAME
RELAYER_BIND_IP=$RELAYER_BIND_IP
RELAYER_PORT=3040
NEAR_NETWORK=$NETWORK
RELAYER_ACCOUNT_ID=$RELAYER_ACCOUNT_ID
RELAYER_ALLOWED_CONTRACTS=$ALLOWED_CONTRACTS
GCP_KMS_KEYRING=$KEYRING
EOF

chmod 600 "$DEPLOY_ENV"

REMOTE="$DEPLOY_USER@$HOST"

info "Preparing remote directory on $REMOTE"
ssh "${SSH_OPTIONS[@]}" "$REMOTE" "mkdir -p '$REMOTE_DIR/secrets'"

if [[ "$DRY_RUN" = "true" ]]; then
  info "Running dry-run preflight on $REMOTE"
  ssh "${SSH_OPTIONS[@]}" "$REMOTE" bash -s -- "$REMOTE_DIR" <<'REMOTE_DRY_RUN'
set -euo pipefail

REMOTE_DIR="$1"

command -v docker >/dev/null 2>&1 || { echo "Docker is required on target host" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin is required on target host" >&2; exit 1; }

if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  echo "curl or wget is required on target host" >&2
  exit 1
fi

if [[ ! -d "$REMOTE_DIR" ]]; then
  echo "Remote directory missing after preflight prepare: $REMOTE_DIR" >&2
  exit 1
fi

echo "Dry-run preflight passed on $(hostname)"
REMOTE_DRY_RUN

  info "Dry-run completed for $INSTANCE_NAME on $HOST"
  exit 0
fi

info "Syncing relayer assets to $REMOTE"
scp "${SCP_OPTIONS[@]}" "$COMPOSE_FILE" "$DEPLOY_ENV" "$REMOTE:$REMOTE_DIR/"
scp "${SCP_OPTIONS[@]}" "$SIGNER_FILE" "$REMOTE:$REMOTE_DIR/secrets/relayer-signer.json"

info "Deploying $INSTANCE_NAME on $REMOTE"
ssh "${SSH_OPTIONS[@]}" "$REMOTE" bash -s -- "$REMOTE_DIR" <<'REMOTE_SCRIPT'
set -euo pipefail

REMOTE_DIR="$1"
cd "$REMOTE_DIR"

[[ -f docker-compose.relayer.yml ]] || { echo "Missing docker-compose.relayer.yml" >&2; exit 1; }
[[ -f .env.relayer ]] || { echo "Missing .env.relayer" >&2; exit 1; }
[[ -f secrets/relayer-signer.json ]] || { echo "Missing signer json" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required on target host" >&2; exit 1; }

PREV_ENV=""
if [[ -f .env.relayer.current ]]; then
  PREV_ENV=".env.relayer.current"
  cp .env.relayer.current .env.relayer.previous
else
  cp .env.relayer .env.relayer.previous
fi

mv .env.relayer .env.relayer.current
chmod 600 .env.relayer.current secrets/relayer-signer.json

rollback() {
  if [[ -f .env.relayer.previous ]]; then
    cp .env.relayer.previous .env.relayer.current
    docker compose -f docker-compose.relayer.yml --env-file .env.relayer.current up -d relayer >/dev/null 2>&1 || true
  fi
}

check_ready() {
  local retries="${1:-30}"
  local delay="${2:-5}"
  local attempt

  for attempt in $(seq 1 "$retries"); do
    if curl -sf --max-time 5 http://127.0.0.1:3040/ready >/dev/null 2>&1; then
      echo "Relayer ready on attempt $attempt/$retries"
      return 0
    fi

    if wget -qO- --timeout=5 http://127.0.0.1:3040/ready >/dev/null 2>&1; then
      echo "Relayer ready on attempt $attempt/$retries"
      return 0
    fi

    echo "Waiting for relayer readiness ($attempt/$retries)..."
    sleep "$delay"
  done

  return 1
}

docker compose -f docker-compose.relayer.yml --env-file .env.relayer.current pull relayer
docker compose -f docker-compose.relayer.yml --env-file .env.relayer.current up -d relayer

if ! check_ready 36 5; then
  echo "Relayer failed readiness check; rolling back" >&2
  rollback
  exit 1
fi

curl -sf http://127.0.0.1:3040/health || wget -qO- http://127.0.0.1:3040/health
REMOTE_SCRIPT

info "Deployment finished for $INSTANCE_NAME on $HOST"
