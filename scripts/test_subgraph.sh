#!/bin/bash
# =============================================================================
# OnSocial Subgraph Live Test Script
# Tests subgraph indexing against core.onsocial.testnet
# =============================================================================

set -e

# Configuration
CONTRACT_ID="${CONTRACT_ID:-core.onsocial.testnet}"
SUBGRAPH_URL="${SUBGRAPH_URL:-}"
TEST_ACCOUNT="${TEST_ACCOUNT:-}"
NETWORK="testnet"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

# Check dependencies
check_deps() {
    command -v near >/dev/null 2>&1 || { log_error "near-cli required. Install: npm i -g near-cli"; exit 1; }
    command -v curl >/dev/null 2>&1 || { log_error "curl required"; exit 1; }
    command -v jq >/dev/null 2>&1 || { log_error "jq required"; exit 1; }
}

# Query subgraph
query_subgraph() {
    local query="$1"
    if [ -z "$SUBGRAPH_URL" ]; then
        log_error "SUBGRAPH_URL not set"
        return 1
    fi
    curl -s -X POST "$SUBGRAPH_URL" \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"$query\"}"
}

# =============================================================================
# TEST 1: Query recent DataUpdates
# =============================================================================
test_data_updates() {
    log_info "Testing DataUpdate indexing..."
    
    local query='{ dataUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author path blockTimestamp } }'
    local result=$(query_subgraph "$query")
    
    if echo "$result" | jq -e '.data.dataUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.dataUpdates | length')
        log_success "DataUpdates indexed: $count recent entries"
        echo "$result" | jq '.data.dataUpdates[0]'
    else
        log_warn "No DataUpdates found (may be normal if no recent activity)"
        echo "$result" | jq '.'
    fi
}

# =============================================================================
# TEST 2: Query recent StorageUpdates
# =============================================================================
test_storage_updates() {
    log_info "Testing StorageUpdate indexing..."
    
    local query='{ storageUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author amount blockTimestamp } }'
    local result=$(query_subgraph "$query")
    
    if echo "$result" | jq -e '.data.storageUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.storageUpdates | length')
        log_success "StorageUpdates indexed: $count recent entries"
        echo "$result" | jq '.data.storageUpdates[0]'
    else
        log_warn "No StorageUpdates found"
    fi
}

# =============================================================================
# TEST 3: Query recent GroupUpdates
# =============================================================================
test_group_updates() {
    log_info "Testing GroupUpdate indexing..."
    
    local query='{ groupUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author groupId memberId blockTimestamp } }'
    local result=$(query_subgraph "$query")
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.groupUpdates | length')
        log_success "GroupUpdates indexed: $count recent entries"
        echo "$result" | jq '.data.groupUpdates[0]'
    else
        log_warn "No GroupUpdates found"
    fi
}

# =============================================================================
# TEST 4: Query Accounts aggregate
# =============================================================================
test_accounts() {
    log_info "Testing Account aggregate..."
    
    local query='{ accounts(first: 5, orderBy: lastActiveAt, orderDirection: desc) { id storageBalance dataUpdateCount lastActiveAt } }'
    local result=$(query_subgraph "$query")
    
    if echo "$result" | jq -e '.data.accounts[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.accounts | length')
        log_success "Accounts indexed: $count entries"
        echo "$result" | jq '.data.accounts[0]'
    else
        log_warn "No Accounts found"
    fi
}

# =============================================================================
# TEST 5: Query Groups aggregate
# =============================================================================
test_groups() {
    log_info "Testing Group aggregate..."
    
    local query='{ groups(first: 5, orderBy: lastActivityAt, orderDirection: desc) { id owner memberCount proposalCount isPrivate } }'
    local result=$(query_subgraph "$query")
    
    if echo "$result" | jq -e '.data.groups[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.groups | length')
        log_success "Groups indexed: $count entries"
        echo "$result" | jq '.data.groups[0]'
    else
        log_warn "No Groups found"
    fi
}

# =============================================================================
# TEST 6: Trigger new event and verify indexing
# =============================================================================
test_trigger_and_verify() {
    if [ -z "$TEST_ACCOUNT" ]; then
        log_warn "TEST_ACCOUNT not set, skipping trigger test"
        return
    fi
    
    log_info "Triggering contract action and verifying indexing..."
    
    # Get current block
    local before_block=$(near view $CONTRACT_ID get_version '{}' --networkId $NETWORK 2>/dev/null | head -1 || echo "0")
    
    # Trigger a simple data write
    local timestamp=$(date +%s)
    local test_path="${TEST_ACCOUNT}/test/subgraph_test_${timestamp}"
    
    log_info "Writing test data to: $test_path"
    
    near call $CONTRACT_ID set "{\"data\": {\"${TEST_ACCOUNT}\": {\"test\": {\"subgraph_test_${timestamp}\": \"test_value\"}}}}" \
        --accountId "$TEST_ACCOUNT" \
        --networkId $NETWORK \
        --deposit 0.01 2>&1 | head -20
    
    log_info "Waiting 30s for subgraph to index..."
    sleep 30
    
    # Query for our specific update
    local query="{ dataUpdates(where: {path: \\\"$test_path\\\"}, first: 1) { id operation author path value blockTimestamp } }"
    local result=$(query_subgraph "$query")
    
    if echo "$result" | jq -e '.data.dataUpdates[0]' >/dev/null 2>&1; then
        log_success "Event indexed successfully!"
        echo "$result" | jq '.data.dataUpdates[0]'
    else
        log_error "Event not indexed yet. May need more time or check subgraph sync status."
        echo "$result" | jq '.'
    fi
}

# =============================================================================
# TEST 7: Check subgraph sync status
# =============================================================================
test_sync_status() {
    log_info "Checking subgraph sync status..."
    
    local query='{ _meta { block { number } hasIndexingErrors } }'
    local result=$(query_subgraph "$query")
    
    if echo "$result" | jq -e '.data._meta' >/dev/null 2>&1; then
        local block=$(echo "$result" | jq -r '.data._meta.block.number')
        local errors=$(echo "$result" | jq -r '.data._meta.hasIndexingErrors')
        log_success "Subgraph synced to block: $block"
        if [ "$errors" = "true" ]; then
            log_error "Subgraph has indexing errors!"
        else
            log_success "No indexing errors"
        fi
    else
        log_error "Could not get sync status"
        echo "$result" | jq '.'
    fi
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    echo ""
    echo "=============================================="
    echo "  OnSocial Subgraph Live Test"
    echo "=============================================="
    echo ""
    
    check_deps
    
    if [ -z "$SUBGRAPH_URL" ]; then
        log_error "Please set SUBGRAPH_URL environment variable"
        echo ""
        echo "Example:"
        echo "  export SUBGRAPH_URL='https://api.studio.thegraph.com/query/YOUR_ID/onsocial/version/latest'"
        echo ""
        exit 1
    fi
    
    log_info "Contract: $CONTRACT_ID"
    log_info "Subgraph: $SUBGRAPH_URL"
    echo ""
    
    test_sync_status
    echo ""
    
    test_data_updates
    echo ""
    
    test_storage_updates
    echo ""
    
    test_group_updates
    echo ""
    
    test_accounts
    echo ""
    
    test_groups
    echo ""
    
    if [ -n "$TEST_ACCOUNT" ]; then
        test_trigger_and_verify
        echo ""
    fi
    
    echo "=============================================="
    log_success "Subgraph test complete!"
    echo "=============================================="
}

# Run if executed directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
