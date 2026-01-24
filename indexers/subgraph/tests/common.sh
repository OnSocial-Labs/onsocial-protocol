#!/bin/bash
# =============================================================================
# Common utilities for subgraph event testing
# =============================================================================

# Configuration
export CONTRACT="${CONTRACT:-core.onsocial.testnet}"
export SIGNER="${SIGNER:-onsocial.testnet}"
export SUBGRAPH_URL="${SUBGRAPH_URL:-https://api.studio.thegraph.com/query/1723512/onsocial-testnet/version/latest}"
export WAIT_TIME="${WAIT_TIME:-45}"
export NETWORK="${NETWORK:-testnet}"

# Colors
export GREEN='\033[0;32m'
export RED='\033[0;31m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_test() { echo -e "${BLUE}🧪 TEST: $1${NC}"; }

# Check dependencies
check_deps() {
    local missing=0
    command -v near >/dev/null 2>&1 || { log_error "near-cli required. Install: npm i -g near-cli"; missing=1; }
    command -v curl >/dev/null 2>&1 || { log_error "curl required"; missing=1; }
    command -v jq >/dev/null 2>&1 || { log_error "jq required"; missing=1; }
    [ $missing -eq 1 ] && exit 1
}

# Query subgraph - handles JSON escaping properly
query_subgraph() {
    local query="$1"
    if [ -z "$SUBGRAPH_URL" ]; then
        log_error "SUBGRAPH_URL not set"
        return 1
    fi
    # Use jq to properly encode the query as JSON string
    local json_body=$(jq -n --arg q "$query" '{"query": $q}')
    curl -s "$SUBGRAPH_URL" \
        -H 'Content-Type: application/json' \
        -d "$json_body"
}

# Legacy wait (deprecated - use call_and_wait with smart waiting instead)
# Kept for backward compatibility but should not be used
wait_for_indexing() {
    log_warn "DEPRECATED: Using fixed wait. Prefer call_and_wait with smart waiting."
    local wait="${1:-$WAIT_TIME}"
    log_info "Waiting ${wait}s for indexing..."
    sleep "$wait"
}

# Wait for subgraph to reach a specific block (with retries)
wait_for_block() {
    local target_block="$1"
    local max_retries="${2:-10}"
    local retry_delay="${3:-5}"
    
    for ((i=1; i<=max_retries; i++)); do
        local result=$(query_subgraph '{ _meta { block { number } } }')
        local current_block=$(echo "$result" | jq -r '.data._meta.block.number // 0')
        
        if [[ "$current_block" -ge "$target_block" ]]; then
            log_info "Subgraph synced to block $current_block (target: $target_block)"
            return 0
        fi
        
        log_info "Waiting for block $target_block (current: $current_block, attempt $i/$max_retries)..."
        sleep "$retry_delay"
    done
    
    log_warn "Subgraph may not have reached block $target_block yet"
    return 1
}

# Check for indexing errors
check_indexing_errors() {
    local result=$(query_subgraph '{ _meta { hasIndexingErrors block { number } } }')
    local has_errors=$(echo "$result" | jq -r '.data._meta.hasIndexingErrors')
    local block=$(echo "$result" | jq -r '.data._meta.block.number')
    
    if [ "$has_errors" = "true" ]; then
        log_error "Subgraph has indexing errors at block $block"
        return 1
    fi
    log_info "Subgraph healthy at block $block"
    return 0
}

# Execute contract call (fire and forget - no waiting)
call_contract() {
    local method="$1"
    local args="$2"
    local deposit="${3:-0}"
    local gas="${4:-100000000000000}"
    
    # Filter out the "null" return value and empty lines for cleaner output
    near call "$CONTRACT" "$method" "$args" \
        --accountId "$SIGNER" \
        --networkId "$NETWORK" \
        --deposit "$deposit" \
        --gas "$gas" 2>&1 | grep -v "^null$"
}

# Execute contract call with specific account
# Usage: call_contract_as "account.testnet" "method" '{"args": ...}' [deposit] [gas]
call_contract_as() {
    local account="$1"
    local method="$2"
    local args="$3"
    local deposit="${4:-0}"
    local gas="${5:-100000000000000}"
    
    # Filter out the "null" return value and empty lines for cleaner output
    near call "$CONTRACT" "$method" "$args" \
        --accountId "$account" \
        --networkId "$NETWORK" \
        --deposit "$deposit" \
        --gas "$gas" 2>&1 | grep -v "^null$"
}

# Execute contract call and wait for indexing with specific account
# Usage: call_and_wait_as "account.testnet" "method" '{"args": ...}' [deposit] [gas]
# Sets LAST_EVENT_BLOCK with the block height of the event
call_and_wait_as() {
    local account="$1"
    local method="$2"
    local args="$3"
    local deposit="${4:-0}"
    local gas="${5:-100000000000000}"
    
    local tx_output=$(near call "$CONTRACT" "$method" "$args" \
        --accountId "$account" \
        --networkId "$NETWORK" \
        --deposit "$deposit" \
        --gas "$gas" 2>&1)
    
    # Show output without "null" return value
    echo "$tx_output" | grep -v "^null$"
    
    # Extract block height from EVENT_JSON log
    LAST_EVENT_BLOCK=$(echo "$tx_output" | grep -o '"block_height":[0-9]*' | tail -1 | grep -o '[0-9]*')
    
    if [[ -n "$LAST_EVENT_BLOCK" ]]; then
        wait_for_block "$LAST_EVENT_BLOCK" 20 3
        return 0
    else
        log_error "Could not extract block height from EVENT_JSON - transaction may have failed"
        echo "$tx_output" | tail -5
        return 1
    fi
}

# Execute contract call for setup steps (waits for tx to be on-chain but not indexed)
# Use this for setup operations before the main call_and_wait
call_contract_setup() {
    local method="$1"
    local args="$2"
    local deposit="${3:-0}"
    local gas="${4:-100000000000000}"
    
    local tx_output=$(near call "$CONTRACT" "$method" "$args" \
        --accountId "$SIGNER" \
        --networkId "$NETWORK" \
        --deposit "$deposit" \
        --gas "$gas" 2>&1)
    
    echo "$tx_output" | grep -v "^null$"
    
    # Check if tx succeeded (has a receipt)
    if echo "$tx_output" | grep -q "Receipt:"; then
        return 0
    else
        log_error "Setup call may have failed"
        return 1
    fi
}

# Execute contract call and wait for indexing (smart wait)
# Usage: call_and_wait "method" '{"args": ...}' [deposit] [gas]
# Sets LAST_EVENT_BLOCK with the block height of the event
call_and_wait() {
    local method="$1"
    local args="$2"
    local deposit="${3:-0}"
    local gas="${4:-100000000000000}"
    
    local tx_output=$(near call "$CONTRACT" "$method" "$args" \
        --accountId "$SIGNER" \
        --networkId "$NETWORK" \
        --deposit "$deposit" \
        --gas "$gas" 2>&1)
    
    # Show output without "null" return value
    echo "$tx_output" | grep -v "^null$"
    
    # Extract block height from EVENT_JSON log
    LAST_EVENT_BLOCK=$(echo "$tx_output" | grep -o '"block_height":[0-9]*' | tail -1 | grep -o '[0-9]*')
    
    if [[ -n "$LAST_EVENT_BLOCK" ]]; then
        # 20 attempts × 3 seconds = 60 seconds max wait
        # Subgraph typically lags 50-90 blocks behind NEAR chain
        wait_for_block "$LAST_EVENT_BLOCK" 20 3
        return 0
    else
        log_error "Could not extract block height from EVENT_JSON - transaction may have failed"
        echo "$tx_output" | tail -5
        return 1
    fi
}

# Test result tracking
TESTS_PASSED=0
TESTS_FAILED=0
ASSERTIONS_PASSED=0
ASSERTIONS_FAILED=0

test_passed() {
    ((TESTS_PASSED++))
    log_success "$1"
}

test_failed() {
    ((TESTS_FAILED++))
    log_error "$1"
}

# =============================================================================
# Field-Level Assertion Helpers
# =============================================================================

# Assert a JSON field equals expected value
# Usage: assert_field "$json_result" ".data.dataUpdates[0].operation" "set" "operation should be 'set'"
assert_field() {
    local json="$1"
    local path="$2"
    local expected="$3"
    local message="${4:-Field $path should equal '$expected'}"
    
    # Use 'if . == null then "__NULL__" else . end' to handle false correctly
    local actual=$(echo "$json" | jq -r "$path | if . == null then \"__NULL__\" else tostring end")
    
    if [[ "$actual" == "$expected" ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $message"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $message"
        echo -e "    Expected: ${GREEN}$expected${NC}"
        echo -e "    Actual:   ${RED}$actual${NC}"
        return 1
    fi
}

# Assert field is not null/empty
assert_field_exists() {
    local json="$1"
    local path="$2"
    local message="${3:-Field $path should exist}"
    
    local actual=$(echo "$json" | jq -r "$path // \"__NULL__\"")
    
    if [[ "$actual" != "__NULL__" ]] && [[ "$actual" != "null" ]] && [[ -n "$actual" ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $message (=$actual)"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $message (got null/empty)"
        return 1
    fi
}

# Assert field contains substring
assert_field_contains() {
    local json="$1"
    local path="$2"
    local substring="$3"
    local message="${4:-Field $path should contain '$substring'}"
    
    local actual=$(echo "$json" | jq -r "$path // \"\"")
    
    if [[ "$actual" == *"$substring"* ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $message"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $message"
        echo -e "    Actual: ${RED}$actual${NC}"
        return 1
    fi
}

# Assert field is a valid BigInt (numeric string)
assert_field_bigint() {
    local json="$1"
    local path="$2"
    local message="${3:-Field $path should be a valid BigInt}"
    
    local actual=$(echo "$json" | jq -r "$path // \"__NULL__\"")
    
    if [[ "$actual" =~ ^[0-9]+$ ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $message (=$actual)"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $message (got: $actual)"
        return 1
    fi
}

# Assert field is a valid hex string (receipt/tx id)
assert_field_hex() {
    local json="$1"
    local path="$2"
    local message="${3:-Field $path should be a hex string}"
    
    local actual=$(echo "$json" | jq -r "$path // \"__NULL__\"")
    
    if [[ "$actual" =~ ^0x[0-9a-fA-F]+$ ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $message"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $message (got: $actual)"
        return 1
    fi
}

# Assert field is a valid entity ID (format: 0x...hash...-index-type)
assert_field_id() {
    local json="$1"
    local path="$2"
    local message="${3:-Field $path should be a valid entity ID}"
    
    local actual=$(echo "$json" | jq -r "$path // \"__NULL__\"")
    
    # Entity IDs: 0x[hex]-[number]-[type] or just 0x[hex]
    if [[ "$actual" =~ ^0x[0-9a-fA-F]+ ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $message"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $message (got: $actual)"
        return 1
    fi
}

# Assert field is null
assert_field_null() {
    local json="$1"
    local path="$2"
    local message="${3:-Field $path should be null}"
    
    local actual=$(echo "$json" | jq -r "$path // \"__NULL__\"")
    
    if [[ "$actual" == "null" ]] || [[ "$actual" == "__NULL__" ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $message"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $message (got: $actual)"
        return 1
    fi
}

# Assert numeric field is greater than 0
assert_field_positive() {
    local json="$1"
    local path="$2"
    local message="${3:-Field $path should be > 0}"
    
    local actual=$(echo "$json" | jq -r "$path // \"0\"")
    
    if [[ "$actual" =~ ^[0-9]+$ ]] && [[ "$actual" -gt 0 ]]; then
        ((ASSERTIONS_PASSED++))
        echo -e "  ${GREEN}✓${NC} $message (=$actual)"
        return 0
    else
        ((ASSERTIONS_FAILED++))
        echo -e "  ${RED}✗${NC} $message (got: $actual)"
        return 1
    fi
}

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
