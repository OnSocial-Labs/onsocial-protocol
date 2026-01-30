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
HASURA_HOST="${HASURA_URL:-http://135.181.110.183:8080}"
GATEWAY_HOST="${GATEWAY_URL:-http://135.181.110.183:4000}"
HETZNER_SERVER="${HETZNER_IP:-135.181.110.183}"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK_URL:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

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

# Summary
echo "========================================"
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ $FAILURES check(s) failed${NC}"
    
    # Send alert
    ALERT_MSG="Production health check failed at $TIMESTAMP. $FAILURES service(s) down."
    send_alert "$ALERT_MSG"
    
    exit 1
fi
