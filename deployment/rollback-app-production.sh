#!/bin/bash
set -euo pipefail

DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_SSH_KNOWN_HOSTS="${DEPLOY_SSH_KNOWN_HOSTS:-}"
SSH_OPTIONS=()

error() {
  echo "❌ $1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  deployment/rollback-app-production.sh <server-ip> \
    --target <backend|gateway|all> \
    --backend-slot <blue|green> \
    --gateway-slot <blue|green> \
    [--image-tag <tag>]

Environment:
  DEPLOY_SSH_KEY          Optional SSH private key path
  DEPLOY_SSH_KNOWN_HOSTS  Optional known_hosts path
EOF
}

if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  [[ -f "$DEPLOY_SSH_KEY" ]] || error "DEPLOY_SSH_KEY does not exist: $DEPLOY_SSH_KEY"
  SSH_OPTIONS+=( -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes )
fi

if [[ -n "$DEPLOY_SSH_KNOWN_HOSTS" ]]; then
  [[ -f "$DEPLOY_SSH_KNOWN_HOSTS" ]] || error "DEPLOY_SSH_KNOWN_HOSTS does not exist: $DEPLOY_SSH_KNOWN_HOSTS"
  SSH_OPTIONS+=( -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$DEPLOY_SSH_KNOWN_HOSTS" )
else
  SSH_OPTIONS+=( -o StrictHostKeyChecking=accept-new )
fi

SERVER_IP="${1:-}"
shift || true

DEPLOY_TARGET=""
BACKEND_SLOT=""
GATEWAY_SLOT=""
IMAGE_TAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      DEPLOY_TARGET="$2"
      shift 2
      ;;
    --backend-slot)
      BACKEND_SLOT="$2"
      shift 2
      ;;
    --gateway-slot)
      GATEWAY_SLOT="$2"
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="$2"
      shift 2
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

[[ -n "$SERVER_IP" ]] || { usage; exit 1; }

case "$DEPLOY_TARGET" in
  backend|gateway|all)
    ;;
  *)
    error "--target must be backend, gateway, or all"
    ;;
esac

case "$BACKEND_SLOT" in
  blue|green)
    ;;
  *)
    error "--backend-slot must be blue or green"
    ;;
esac

case "$GATEWAY_SLOT" in
  blue|green)
    ;;
  *)
    error "--gateway-slot must be blue or green"
    ;;
esac

ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" bash -s -- "$DEPLOY_TARGET" "$BACKEND_SLOT" "$GATEWAY_SLOT" "$IMAGE_TAG" <<'REMOTE_SCRIPT'
set -euo pipefail

DEPLOY_TARGET="$1"
PREVIOUS_BACKEND_SLOT="$2"
PREVIOUS_GATEWAY_SLOT="$3"
PREVIOUS_IMAGE_TAG="$4"

cd /opt/onsocial

[[ -f docker-compose.app.yml ]] || { echo "Missing docker-compose.app.yml" >&2; exit 1; }
[[ -f Caddyfile.template ]] || { echo "Missing Caddyfile.template" >&2; exit 1; }
[[ -f .env.production ]] || { echo "Missing .env.production" >&2; exit 1; }

set -a
source .env.production
[[ -f .env.image ]] && source .env.image
set +a

if [[ -n "$PREVIOUS_IMAGE_TAG" ]]; then
  echo "IMAGE_TAG=$PREVIOUS_IMAGE_TAG" > .env.image
  set -a
  source .env.production
  source .env.image
  set +a
fi

BACKEND_SLOT_FILE=".backend-slot"
GATEWAY_SLOT_FILE=".gateway-slot"
CADDY_TEMPLATE_FILE="Caddyfile.template"
CADDY_RENDERED_FILE="Caddyfile.rendered"
CADDY_ACTIVE_FILE="Caddyfile"

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

server_names_value() {
  if [[ "$PUBLIC_DOMAIN" = "testnet.onsocial.id" ]]; then
    echo "testnet.onsocial.id"
  else
    echo "api.onsocial.id, mainnet.onsocial.id"
  fi
}

pages_host_patterns_value() {
  if [[ "$PUBLIC_DOMAIN" = "testnet.onsocial.id" ]]; then
    echo "*.testnet.onsocial.id"
  else
    echo "*.onsocial.id"
  fi
}

render_caddyfile() {
  local backend_slot="$1"
  local gateway_slot="$2"
  local cdn_domain="cdn.onsocial.id"
  if [[ "$PUBLIC_DOMAIN" = "testnet.onsocial.id" ]]; then
    cdn_domain="cdn.testnet.onsocial.id"
  fi
  local cdn_upstream="${LIGHTHOUSE_CDN_UPSTREAM:-statistical-barnacle-3ny44.lighthouseweb3.xyz}"
  sed \
    -e "s/__SERVER_NAMES__/$(server_names_value)/g" \
    -e "s/__PAGES_HOST_PATTERNS__/$(pages_host_patterns_value)/g" \
    -e "s|__CDN_DOMAIN__|${cdn_domain}|g" \
    -e "s|__CDN_UPSTREAM__|${cdn_upstream}|g" \
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
}

check_health() {
  local name="$1"
  local url="$2"
  local retries="${3:-20}"
  local delay="${4:-3}"
  local attempt

  for attempt in $(seq 1 "$retries"); do
    if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
      echo "✅ $name healthy (attempt $attempt/$retries)"
      return 0
    fi
    sleep "$delay"
  done

  echo "❌ $name failed health check" >&2
  return 1
}

ensure_previous_service() {
  local service_prefix="$1"
  local previous_slot="$2"
  local previous_service
  previous_service="$(slot_service_name "$service_prefix" "$previous_slot")"

  if docker inspect "$previous_service" >/dev/null 2>&1; then
    docker start "$previous_service" >/dev/null 2>&1 || true
    return 0
  fi

  if [[ -z "$PREVIOUS_IMAGE_TAG" ]]; then
    echo "Missing prior image tag and previous service $previous_service does not exist" >&2
    return 1
  fi

  docker compose -f docker-compose.app.yml up -d "$previous_service"
}

current_backend_slot="$(read_slot_file "$BACKEND_SLOT_FILE" blue)"
current_gateway_slot="$(read_slot_file "$GATEWAY_SLOT_FILE" blue)"

if [[ "$DEPLOY_TARGET" = "backend" || "$DEPLOY_TARGET" = "all" ]]; then
  if [[ "$current_backend_slot" != "$PREVIOUS_BACKEND_SLOT" ]]; then
    ensure_previous_service backend "$PREVIOUS_BACKEND_SLOT"
    check_health "backend-$PREVIOUS_BACKEND_SLOT" "$(slot_health_url backend "$PREVIOUS_BACKEND_SLOT")" 25 4
  fi
fi

if [[ "$DEPLOY_TARGET" = "gateway" || "$DEPLOY_TARGET" = "all" ]]; then
  if [[ "$current_gateway_slot" != "$PREVIOUS_GATEWAY_SLOT" ]]; then
    ensure_previous_service gateway "$PREVIOUS_GATEWAY_SLOT"
    check_health "gateway-$PREVIOUS_GATEWAY_SLOT" "$(slot_health_url gateway "$PREVIOUS_GATEWAY_SLOT")" 25 4
  fi
fi

render_caddyfile "$PREVIOUS_BACKEND_SLOT" "$PREVIOUS_GATEWAY_SLOT"
mv -f "$CADDY_RENDERED_FILE" "$CADDY_ACTIVE_FILE"
reload_caddy "$PREVIOUS_BACKEND_SLOT" "$PREVIOUS_GATEWAY_SLOT"

echo "$PREVIOUS_BACKEND_SLOT" > "$BACKEND_SLOT_FILE"
echo "$PREVIOUS_GATEWAY_SLOT" > "$GATEWAY_SLOT_FILE"

if [[ "$DEPLOY_TARGET" = "backend" || "$DEPLOY_TARGET" = "all" ]]; then
  if [[ "$current_backend_slot" != "$PREVIOUS_BACKEND_SLOT" ]]; then
    docker stop "$(slot_service_name backend "$current_backend_slot")" >/dev/null 2>&1 || true
  fi
fi

if [[ "$DEPLOY_TARGET" = "gateway" || "$DEPLOY_TARGET" = "all" ]]; then
  if [[ "$current_gateway_slot" != "$PREVIOUS_GATEWAY_SLOT" ]]; then
    docker stop "$(slot_service_name gateway "$current_gateway_slot")" >/dev/null 2>&1 || true
  fi
fi

echo "Rollback complete"
echo "Backend slot: $PREVIOUS_BACKEND_SLOT"
echo "Gateway slot: $PREVIOUS_GATEWAY_SLOT"
REMOTE_SCRIPT