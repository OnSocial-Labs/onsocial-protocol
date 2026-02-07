#!/bin/bash
# =============================================================================
# Common utilities for Hasura/PostgreSQL indexer testing
# Mirror of subgraph tests but for Substreams → PostgreSQL → Hasura stack
# =============================================================================

# Configuration
export CONTRACT="${CONTRACT:-core.onsocial.testnet}"
export SIGNER="${SIGNER:-onsocial.testnet}"
export HASURA_URL="${HASURA_URL:-https://hasura.onsocial.id}"
export HASURA_ADMIN_SECRET="${HASURA_ADMIN_SECRET:?HASURA_ADMIN_SECRET environment variable is required}"
export NETWORK="${NETWORK:-testnet}"

# Smart wait configuration (replaces fixed WAIT_TIME)
export MAX_WAIT_RETRIES="${MAX_WAIT_RETRIES:-20}"   # 20 attempts
export WAIT_RETRY_DELAY="${WAIT_RETRY_DELAY:-3}"    # 3 seconds each = 60s max
export LAST_EVENT_BLOCK=""                          # Set by call_and_wait()

# Colors
export GREEN='\033[0;32m'
export RED='\033[0;31m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export NC='\033[0m'

# Test counters
export ASSERTIONS_PASSED=0
export ASSERTIONS_FAILED=0
export TESTS_PASSED=0
export TESTS_FAILED=0

# Logging
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_test() { echo -e "${CYAN}🧪 TEST: $1${NC}"; }

test_passed() {
    log_success "$1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_failed() {
    log_error "$1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Check dependencies
check_deps() {
    local missing=0
    command -v near >/dev/null 2>&1 || { log_error "near-cli required. Install: npm i -g near-cli"; missing=1; }
    command -v curl >/dev/null 2>&1 || { log_error "curl required"; missing=1; }
    command -v jq >/dev/null 2>&1 || { log_error "jq required"; missing=1; }
    [ $missing -eq 1 ] && exit 1
}

# =============================================================================
# Hasura GraphQL Queries
# =============================================================================

# Query Hasura GraphQL endpoint
query_hasura() {
    local query="$1"
    local json_body=$(jq -n --arg q "$query" '{"query": $q}')
    curl -s -X POST "${HASURA_URL}/v1/graphql" \
        -H "Content-Type: application/json" \
        -H "X-Hasura-Admin-Secret: ${HASURA_ADMIN_SECRET}" \
        -d "$json_body"
}

# Check Hasura health
check_hasura_health() {
    local health=$(curl -s "${HASURA_URL}/healthz")
    if [ "$health" = "OK" ]; then
        return 0
    else
        log_error "Hasura not healthy: $health"
        return 1
    fi
}

# Get current cursor/block from indexer
get_current_block() {
    local result=$(query_hasura '{ cursors(limit: 1) { cursor blockNum } }')
    echo "$result" | jq -r '.data.cursors[0].blockNum // "0"'
}

# Smart wait: poll until indexer reaches target block
# Usage: wait_for_block <target_block> [max_retries] [retry_delay]
wait_for_block() {
    local target_block="$1"
    local max_retries="${2:-$MAX_WAIT_RETRIES}"
    local retry_delay="${3:-$WAIT_RETRY_DELAY}"
    
    for ((i=1; i<=max_retries; i++)); do
        local current_block=$(get_current_block)
        
        if [[ "$current_block" -ge "$target_block" ]]; then
            log_info "Indexer synced to block $current_block (target: $target_block)"
            return 0
        fi
        
        log_info "Waiting for block $target_block (current: $current_block, attempt $i/$max_retries)..."
        sleep "$retry_delay"
    done
    
    log_warn "Indexer may not have reached block $target_block yet (current: $(get_current_block))"
    return 1
}

# =============================================================================
# NEAR Contract Calls
# =============================================================================

# Call contract method (no wait)
call_contract() {
    local method="$1"
    local args="$2"
    local deposit="${3:-0}"
    
    log_info "Calling $CONTRACT.$method..."
    
    near call "$CONTRACT" "$method" "$args" \
        --accountId "$SIGNER" \
        --deposit "$deposit" \
        --gas 300000000000000 \
        --networkId "$NETWORK" 2>&1
}

# Call contract and wait for indexing (smart wait)
# Extracts block height from EVENT_JSON and polls until indexed
call_and_wait() {
    local method="$1"
    local args="$2"
    local deposit="${3:-0}"
    
    local tx_output=$(call_contract "$method" "$args" "$deposit")
    echo "$tx_output" | grep -v "^null$"
    
    # Check for errors
    if echo "$tx_output" | grep -q "Error\|error\|FAILED"; then
        log_error "Contract call failed"
        return 1
    fi
    
    # Extract block height from EVENT_JSON log (NEP-297 standard event)
    LAST_EVENT_BLOCK=$(echo "$tx_output" | grep -o '"block_height":[0-9]*' | tail -1 | grep -o '[0-9]*')
    
    if [[ -n "$LAST_EVENT_BLOCK" ]]; then
        log_info "Event at block $LAST_EVENT_BLOCK, waiting for indexer..."
        wait_for_block "$LAST_EVENT_BLOCK"
        return 0
    else
        log_error "Could not extract block height from EVENT_JSON - transaction may have failed"
        echo "$tx_output" | tail -5
        return 1
    fi
}

# =============================================================================
# Assertion Helpers
# =============================================================================

# Assert field equals expected value
assert_field() {
    local result="$1"
    local jq_path="$2"
    local expected="$3"
    local description="$4"
    
    local actual=$(echo "$result" | jq -r "$jq_path")
    
    if [ "$actual" = "$expected" ]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $description: $actual"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $description: expected '$expected', got '$actual'"
        return 1
    fi
}

# Assert field contains substring
assert_field_contains() {
    local result="$1"
    local jq_path="$2"
    local substring="$3"
    local description="$4"
    
    local actual=$(echo "$result" | jq -r "$jq_path")
    
    if [[ "$actual" == *"$substring"* ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $description: contains '$substring'"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $description: '$actual' doesn't contain '$substring'"
        return 1
    fi
}

# Assert field exists and is not null
assert_field_exists() {
    local result="$1"
    local jq_path="$2"
    local description="$3"
    
    local actual=$(echo "$result" | jq -r "$jq_path")
    
    if [ -n "$actual" ] && [ "$actual" != "null" ]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $description: $actual"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $description: field is null or missing"
        return 1
    fi
}

# Assert field is a valid BigInt (numeric string)
assert_field_bigint() {
    local result="$1"
    local jq_path="$2"
    local description="$3"
    
    local actual=$(echo "$result" | jq -r "$jq_path")
    
    if [[ "$actual" =~ ^[0-9]+$ ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $description: $actual"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $description: '$actual' is not a valid BigInt"
        return 1
    fi
}

# Assert field matches ID format (alphanumeric with hyphens/underscores)
assert_field_id() {
    local result="$1"
    local jq_path="$2"
    local description="$3"
    
    local actual=$(echo "$result" | jq -r "$jq_path")
    
    if [[ "$actual" =~ ^[a-zA-Z0-9_\-:]+$ ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $description: ${actual:0:40}..."
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $description: '$actual' is not a valid ID format"
        return 1
    fi
}

# Assert field is hex string (receipt_id, etc.)
assert_field_hex() {
    local result="$1"
    local jq_path="$2"
    local description="$3"
    
    local actual=$(echo "$result" | jq -r "$jq_path")
    
    if [[ "$actual" =~ ^[a-fA-F0-9]+$ ]] || [[ "$actual" =~ ^0x[a-fA-F0-9]+$ ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $description: ${actual:0:20}..."
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $description: '$actual' is not a valid hex string"
        return 1
    fi
}

# Assert field is null
assert_field_null() {
    local result="$1"
    local jq_path="$2"
    local description="$3"
    
    local actual=$(echo "$result" | jq -r "$jq_path")
    
    if [ "$actual" = "null" ] || [ -z "$actual" ]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $description"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $description: expected null, got '$actual'"
        return 1
    fi
}

# =============================================================================
# Test Summary
# =============================================================================

print_summary() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BLUE}Test Summary:${NC}"
    echo -e "  ${GREEN}Tests Passed: $TESTS_PASSED${NC}"
    echo -e "  ${RED}Tests Failed: $TESTS_FAILED${NC}"
    echo -e "  ${GREEN}Assertions Passed: $ASSERTIONS_PASSED${NC}"
    echo -e "  ${RED}Assertions Failed: $ASSERTIONS_FAILED${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    [ $TESTS_FAILED -eq 0 ] && [ $ASSERTIONS_FAILED -eq 0 ]
}
