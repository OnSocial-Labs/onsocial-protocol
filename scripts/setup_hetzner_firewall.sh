#!/usr/bin/env bash
# =============================================================================
# Hetzner Cloud Firewall Setup for OnSocial (FREE)
# =============================================================================
#
# Two options:
#   1. CLI (this script) — requires `hcloud` CLI tool
#   2. Manual (Cloud Console) — see instructions at bottom
#
# Rules:
#   ✅ TCP 80   (HTTP → Caddy redirect)
#   ✅ TCP 443  (HTTPS)
#   ✅ UDP 443  (HTTP/3 / QUIC)
#   ✅ TCP 22   (SSH — restrict to your IPs if possible)
#   ✅ ICMP     (ping / diagnostics)
#   ❌ All other inbound traffic is DROPPED
#
# This is applied at the Hetzner network level, BEFORE packets reach the
# server. It's free and adds defense-in-depth on top of the 127.0.0.1
# port bindings in docker-compose.yml.
#
# Usage:
#   # Install hcloud CLI first:  brew install hcloud  (or snap install hcloud)
#   # Authenticate:              hcloud context create onsocial
#   ./scripts/setup_hetzner_firewall.sh [--apply]
#
# Without --apply, this is a dry run that prints the commands.
# =============================================================================

set -euo pipefail

FIREWALL_NAME="onsocial-production"
SERVER_NAME="${HETZNER_SERVER_NAME:-}"  # Set to your server name to auto-apply

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DRY_RUN=true
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=false
fi

run_cmd() {
  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY RUN]${NC} $*"
  else
    echo -e "${GREEN}[RUN]${NC} $*"
    eval "$@"
  fi
}

# Check hcloud CLI
if ! command -v hcloud &>/dev/null; then
  echo -e "${RED}Error: hcloud CLI not found.${NC}"
  echo ""
  echo "Install it:"
  echo "  macOS:  brew install hcloud"
  echo "  Linux:  snap install hcloud  (or download from https://github.com/hetznercloud/cli/releases)"
  echo ""
  echo "Then authenticate:"
  echo "  hcloud context create onsocial"
  echo "  # Paste your API token from https://console.hetzner.cloud → Security → API Tokens"
  echo ""
  echo "Or apply the rules manually — see instructions at the bottom of this script."
  exit 1
fi

echo "================================================"
echo "  Hetzner Cloud Firewall: ${FIREWALL_NAME}"
echo "================================================"
echo ""

# Delete existing firewall if it exists (idempotent)
if hcloud firewall describe "$FIREWALL_NAME" &>/dev/null; then
  echo "Firewall '$FIREWALL_NAME' already exists. Deleting to recreate..."
  run_cmd "hcloud firewall delete '$FIREWALL_NAME'"
fi

# Create firewall
run_cmd "hcloud firewall create --name '$FIREWALL_NAME'"

echo ""
echo "Adding inbound rules..."
echo ""

# Rule 1: HTTP (Caddy redirect to HTTPS)
run_cmd "hcloud firewall add-rule '$FIREWALL_NAME' \
  --direction in \
  --protocol tcp \
  --port 80 \
  --source-ips 0.0.0.0/0 \
  --source-ips ::/0 \
  --description 'HTTP (Caddy redirect to HTTPS)'"

# Rule 2: HTTPS
run_cmd "hcloud firewall add-rule '$FIREWALL_NAME' \
  --direction in \
  --protocol tcp \
  --port 443 \
  --source-ips 0.0.0.0/0 \
  --source-ips ::/0 \
  --description 'HTTPS (Caddy TLS termination)'"

# Rule 3: HTTP/3 (QUIC)
run_cmd "hcloud firewall add-rule '$FIREWALL_NAME' \
  --direction in \
  --protocol udp \
  --port 443 \
  --source-ips 0.0.0.0/0 \
  --source-ips ::/0 \
  --description 'HTTP/3 QUIC (Caddy)'"

# Rule 4: SSH
# NOTE: For maximum security, replace 0.0.0.0/0 with your static IP(s):
#   --source-ips YOUR_IP/32
# GitHub Actions deploy needs SSH too, so you may need to allow GitHub's
# IP ranges or keep 0.0.0.0/0 and rely on SSH key auth + fail2ban.
run_cmd "hcloud firewall add-rule '$FIREWALL_NAME' \
  --direction in \
  --protocol tcp \
  --port 22 \
  --source-ips 0.0.0.0/0 \
  --source-ips ::/0 \
  --description 'SSH (key-auth only — consider restricting to your IP)'"

# Rule 5: ICMP (ping)
run_cmd "hcloud firewall add-rule '$FIREWALL_NAME' \
  --direction in \
  --protocol icmp \
  --source-ips 0.0.0.0/0 \
  --source-ips ::/0 \
  --description 'ICMP ping (diagnostics)'"

echo ""

# Apply to server if name is set
if [[ -n "$SERVER_NAME" ]]; then
  echo "Applying firewall to server: $SERVER_NAME"
  run_cmd "hcloud firewall apply-to-resource '$FIREWALL_NAME' \
    --type server \
    --server '$SERVER_NAME'"
else
  echo -e "${YELLOW}To apply to your server, run:${NC}"
  echo "  hcloud firewall apply-to-resource '$FIREWALL_NAME' --type server --server YOUR_SERVER_NAME"
  echo ""
  echo "Or set HETZNER_SERVER_NAME and re-run:"
  echo "  HETZNER_SERVER_NAME=my-server ./scripts/setup_hetzner_firewall.sh --apply"
fi

echo ""
echo "================================================"
echo "  Summary"
echo "================================================"
echo ""
echo "  Inbound rules:"
echo "    ✅ TCP 80    HTTP (redirect)"
echo "    ✅ TCP 443   HTTPS"
echo "    ✅ UDP 443   HTTP/3"
echo "    ✅ TCP 22    SSH"
echo "    ✅ ICMP      Ping"
echo "    ❌ *         Everything else DROPPED"
echo ""
echo "  Outbound: All allowed (default)"
echo ""

if $DRY_RUN; then
  echo -e "${YELLOW}This was a dry run. Add --apply to execute.${NC}"
fi

echo ""
echo "================================================"
echo "  MANUAL SETUP (Hetzner Cloud Console)"
echo "================================================"
echo ""
echo "  If you prefer the web UI:"
echo ""
echo "  1. Go to https://console.hetzner.cloud"
echo "  2. Select your project"
echo "  3. Left sidebar → Security → Firewalls → Create Firewall"
echo "  4. Name: $FIREWALL_NAME"
echo "  5. Add these inbound rules:"
echo ""
echo "     | Protocol | Port | Source    | Description          |"
echo "     |----------|------|----------|----------------------|"
echo "     | TCP      | 80   | Any IPv4/6 | HTTP redirect      |"
echo "     | TCP      | 443  | Any IPv4/6 | HTTPS              |"
echo "     | UDP      | 443  | Any IPv4/6 | HTTP/3 QUIC        |"
echo "     | TCP      | 22   | Any IPv4/6 | SSH                |"
echo "     | ICMP     | —    | Any IPv4/6 | Ping               |"
echo ""
echo "  6. Apply To → select your server"
echo "  7. Create Firewall"
echo ""
echo "  Done! All other inbound traffic is blocked at network level."
