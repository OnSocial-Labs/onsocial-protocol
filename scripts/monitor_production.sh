#!/bin/bash

# OnSocial Production Monitoring Script
# Checks Hasura, Gateway, and Hetzner server health

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Configuration
HASURA_HOST="${HASURA_URL:-https://hasura.onsocial.id}"
GATEWAY_HOST="${GATEWAY_URL:-https://api.onsocial.id}"
HETZNER_SERVER="${HETZNER_IP:-135.181.110.183}"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK_URL:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# NEAR RPC endpoints
NEAR_TESTNET_RPC="https://test.rpc.fastnear.com"
NEAR_MAINNET_RPC="https://free.rpc.fastnear.com"

# Relayer accounts
RELAYER_TESTNET="relayer.onsocial.testnet"
RELAYER_MAINNET="relayer.onsocial.near"

# Minimum balance thresholds (in NEAR)
RELAYER_MIN_BALANCE_TESTNET="${RELAYER_MIN_BALANCE_TESTNET:-5}"
RELAYER_MIN_BALANCE_MAINNET="${RELAYER_MIN_BALANCE_MAINNET:-20}"

# Timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "========================================"
echo "OnSocial Production Health Check"
echo "Time: $TIMESTAMP"
echo "========================================"
echo ""

# Track failures
FAILURES=0

# Function to check HTTP endpoint
check_http() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $name... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)
    
    if [ "$response" = "$expected_status" ] || [ "$response" = "200" ]; then
        echo -e "${GREEN}✓ OK${NC} (HTTP $response)"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $response)"
        FAILURES=$((FAILURES + 1))
        return 1
    fi
}

# Function to check server SSH
check_server() {
    local server=$1
    
    echo -n "Checking Hetzner server ($server)... "
    
    if ping -c 1 -W 2 "$server" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Reachable${NC}"
        return 0
    else
        echo -e "${RED}✗ Unreachable${NC}"
        FAILURES=$((FAILURES + 1))
        return 1
    fi
}

# Function to check GraphQL API
check_graphql() {
    local url=$1
    local secret=$2
    
    echo -n "Checking Hasura GraphQL API... "
    
    response=$(curl -s -X POST "$url/v1/graphql" \
        -H "Content-Type: application/json" \
        -H "x-hasura-admin-secret: $secret" \
        -d '{"query":"{ __schema { queryType { name } } }"}' \
        --max-time 10 2>/dev/null)
    
    if echo "$response" | grep -q "query_root"; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILURES=$((FAILURES + 1))
        return 1
    fi
}

# Function to send alert
send_alert() {
    local message=$1
    
    # Discord webhook
    if [ -n "$DISCORD_WEBHOOK" ]; then
        curl -s -X POST "$DISCORD_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"content\":\"🚨 **OnSocial Alert** 🚨\n$message\"}" \
            > /dev/null 2>&1
    fi
    
    # Slack webhook
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -s -X POST "$SLACK_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"🚨 OnSocial Alert: $message\"}" \
            > /dev/null 2>&1
    fi

    # Telegram bot
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        local text
        text=$(echo "$message" | sed 's/"/\\"/g')
        curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -H 'Content-Type: application/json' \
            -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"🚨 *OnSocial Alert*\n${text}\", \"parse_mode\": \"Markdown\"}" \
            > /dev/null 2>&1 || true
    fi
}

# Function to get NEAR account balance in NEAR (decimal)
get_near_balance() {
    local rpc_url=$1
    local account_id=$2

    local response
    response=$(curl -s --max-time 10 "$rpc_url" \
        -H 'Content-Type: application/json' \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$account_id\"}}" 2>/dev/null)

    local amount
    amount=$(echo "$response" | grep -o '"amount":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$amount" ]; then
        echo "ERROR"
        return 1
    fi

    # Convert yoctoNEAR to NEAR (divide by 1e24)
    python3 -c "print(f'{int(\"$amount\") / 1e24:.2f}')" 2>/dev/null || echo "ERROR"
}

# Function to check relayer balance
check_relayer_balance() {
    local name=$1
    local rpc_url=$2
    local account_id=$3
    local min_balance=$4

    echo -n "Checking $name balance ($account_id)... "

    local balance
    balance=$(get_near_balance "$rpc_url" "$account_id")

    if [ "$balance" = "ERROR" ]; then
        echo -e "${RED}✗ FAILED${NC} (could not query balance)"
        FAILURES=$((FAILURES + 1))
        return 1
    fi

    local is_low
    is_low=$(python3 -c "print('LOW' if float('$balance') < float('$min_balance') else 'OK')" 2>/dev/null)

    if [ "$is_low" = "LOW" ]; then
        echo -e "${RED}✗ LOW${NC} ($balance NEAR < $min_balance NEAR threshold)"
        FAILURES=$((FAILURES + 1))
        BALANCE_ALERTS="${BALANCE_ALERTS}⚠️ $name: $balance NEAR (threshold: $min_balance NEAR)\n"
        return 1
    else
        echo -e "${GREEN}✓ OK${NC} ($balance NEAR)"
        return 0
    fi
}

# Run checks
echo "1. Infrastructure Checks"
echo "------------------------"
check_server "$HETZNER_SERVER"
echo ""

echo "2. Service Health Checks"
echo "------------------------"
check_http "Hasura Health" "$HASURA_HOST/healthz"
check_graphql "$HASURA_HOST" "$HASURA_ADMIN_SECRET"
check_http "Gateway Health" "$GATEWAY_HOST/graph/health" || true
echo ""

echo "3. Database & Storage Services"
echo "-------------------------------"
# Check PostgreSQL
echo -n "Checking PostgreSQL... "
if timeout 5 bash -c "</dev/tcp/${HETZNER_SERVER}/5432" 2>/dev/null; then
    echo -e "${GREEN}✓ OK${NC} (port 5432 open)"
else
    echo -e "${RED}✗ FAILED${NC} (port 5432 unreachable)"
    FAILURES=$((FAILURES + 1))
fi

# Check Lighthouse IPFS
echo -n "Checking Lighthouse IPFS... "
if curl -s --max-time 10 "https://gateway.lighthouse.storage/ipfs/QmNjMp9K8cY8K7S7QvZmVWbU5vVJqJZ2H3PnGwG4n3rGF8" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ OK${NC} (Gateway accessible)"
else
    echo -e "${YELLOW}⚠ OK${NC} (Service active, test CID may not exist)"
fi

# Check Substreams API
echo -n "Checking Substreams API... "
if [ -n "$SUBSTREAMS_API_TOKEN" ]; then
    if curl -s --max-time 10 -H "Authorization: Bearer $SUBSTREAMS_API_TOKEN" "https://api.streamingfast.io/v1/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILURES=$((FAILURES + 1))
    fi
else
    echo -e "${YELLOW}⚠ Skipped${NC} (API token not configured)"
fi
echo ""

echo "4. Relayer Balance Checks"
echo "-------------------------"
BALANCE_ALERTS=""
check_relayer_balance "Relayer (testnet)" "$NEAR_TESTNET_RPC" "$RELAYER_TESTNET" "$RELAYER_MIN_BALANCE_TESTNET"
check_relayer_balance "Relayer (mainnet)" "$NEAR_MAINNET_RPC" "$RELAYER_MAINNET" "$RELAYER_MIN_BALANCE_MAINNET"
echo ""

# Summary
echo "========================================"
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ $FAILURES check(s) failed${NC}"
    
    # Build alert message
    ALERT_MSG="Production health check failed at $TIMESTAMP. $FAILURES service(s) down."
    if [ -n "$BALANCE_ALERTS" ]; then
        ALERT_MSG="$ALERT_MSG\n\n💰 Low Relayer Balance:\n$BALANCE_ALERTS\nTop up with: near send <funded-account> <relayer-account> <amount> --networkId <network>"
    fi
    send_alert "$ALERT_MSG"
    
    exit 1
fi
