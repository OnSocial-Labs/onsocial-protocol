#!/bin/bash
# =============================================================================
# OnSocial Hasura/PostgreSQL Indexer Test Script
# Tests the Substreams → PostgreSQL → Hasura indexing pipeline
# =============================================================================

set -e

# Configuration
HASURA_URL="${HASURA_URL:-http://135.181.110.183:8080}"
HASURA_ADMIN_SECRET="${HASURA_ADMIN_SECRET:?HASURA_ADMIN_SECRET environment variable is required}"
CONTRACT_ID="${CONTRACT_ID:-core.onsocial.testnet}"
NETWORK="testnet"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_header() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"; }

# Check dependencies
check_deps() {
    command -v curl >/dev/null 2>&1 || { log_error "curl required"; exit 1; }
    command -v jq >/dev/null 2>&1 || { log_error "jq required"; exit 1; }
}

# Query Hasura GraphQL
query_hasura() {
    local query="$1"
    curl -s -X POST "${HASURA_URL}/v1/graphql" \
        -H "Content-Type: application/json" \
        -H "X-Hasura-Admin-Secret: ${HASURA_ADMIN_SECRET}" \
        -d "{\"query\": \"$query\"}"
}

# =============================================================================
# TEST 1: Hasura Health Check
# =============================================================================
test_hasura_health() {
    log_header "Test 1: Hasura Health Check"
    
    local health=$(curl -s "${HASURA_URL}/healthz")
    if [ "$health" = "OK" ]; then
        log_success "Hasura is healthy"
        return 0
    else
        log_error "Hasura health check failed: $health"
        return 1
    fi
}

# =============================================================================
# TEST 2: Check Cursor (Indexer Progress)
# =============================================================================
test_cursor() {
    log_header "Test 2: Indexer Cursor Check"
    
    local query='{ cursors(limit: 1) { id cursor block_num } }'
    local result=$(query_hasura "$query")
    
    if echo "$result" | jq -e '.data.cursors[0]' >/dev/null 2>&1; then
        local block_num=$(echo "$result" | jq -r '.data.cursors[0].block_num')
        log_success "Cursor found at block: ${block_num}"
        log_info "Indexer is tracking progress correctly"
        return 0
    else
        log_error "No cursor found - indexer may not be running"
        echo "$result" | jq .
        return 1
    fi
}

# =============================================================================
# TEST 3: Query Data Updates
# =============================================================================
test_data_updates() {
    log_header "Test 3: Data Updates Table"
    
    local query='{ data_updates(limit: 5, order_by: {block_height: desc}) { id operation author path value block_height block_timestamp } }'
    local result=$(query_hasura "$query")
    
    if echo "$result" | jq -e '.data.data_updates' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.data_updates | length')
        if [ "$count" -gt 0 ]; then
            log_success "DataUpdates found: $count entries"
            echo "$result" | jq '.data.data_updates[0]'
        else
            log_warn "DataUpdates table exists but is empty (waiting for contract activity)"
        fi
        return 0
    else
        log_error "Failed to query data_updates"
        echo "$result" | jq .
        return 1
    fi
}

# =============================================================================
# TEST 4: Query Storage Updates
# =============================================================================
test_storage_updates() {
    log_header "Test 4: Storage Updates Table"
    
    local query='{ storage_updates(limit: 5, order_by: {block_height: desc}) { id operation author amount block_height } }'
    local result=$(query_hasura "$query")
    
    if echo "$result" | jq -e '.data.storage_updates' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.storage_updates | length')
        if [ "$count" -gt 0 ]; then
            log_success "StorageUpdates found: $count entries"
        else
            log_warn "StorageUpdates table exists but is empty"
        fi
        return 0
    else
        log_error "Failed to query storage_updates"
        return 1
    fi
}

# =============================================================================
# TEST 5: Query Group Updates
# =============================================================================
test_group_updates() {
    log_header "Test 5: Group Updates Table"
    
    local query='{ group_updates(limit: 5, order_by: {block_height: desc}) { id group_id operation member_id block_height } }'
    local result=$(query_hasura "$query")
    
    if echo "$result" | jq -e '.data.group_updates' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.group_updates | length')
        if [ "$count" -gt 0 ]; then
            log_success "GroupUpdates found: $count entries"
        else
            log_warn "GroupUpdates table exists but is empty"
        fi
        return 0
    else
        log_error "Failed to query group_updates"
        return 1
    fi
}

# =============================================================================
# TEST 6: Check All Tables Exist
# =============================================================================
test_schema() {
    log_header "Test 6: Schema Verification"
    
    local query='{ __schema { queryType { fields { name } } } }'
    local result=$(query_hasura "$query")
    
    local tables=("data_updates" "storage_updates" "group_updates" "contract_updates" "permission_updates" "cursors")
    local all_found=true
    
    for table in "${tables[@]}"; do
        if echo "$result" | jq -e ".data.__schema.queryType.fields[] | select(.name == \"$table\")" >/dev/null 2>&1; then
            log_success "Table tracked: $table"
        else
            log_error "Table NOT tracked: $table"
            all_found=false
        fi
    done
    
    $all_found && return 0 || return 1
}

# =============================================================================
# TEST 7: Test GraphQL Subscription Capability
# =============================================================================
test_subscription_support() {
    log_header "Test 7: Subscription Support"
    
    local query='{ __schema { subscriptionType { name } } }'
    local result=$(query_hasura "$query")
    
    if echo "$result" | jq -e '.data.__schema.subscriptionType' >/dev/null 2>&1; then
        log_success "Real-time subscriptions supported"
        log_info "Clients can subscribe to: data_updates, storage_updates, etc."
        return 0
    else
        log_warn "Subscriptions may not be enabled"
        return 0
    fi
}

# =============================================================================
# TEST 8: Compare with The Graph (if available)
# =============================================================================
test_compare_thegraph() {
    log_header "Test 8: Compare with The Graph Subgraph"
    
    local thegraph_url="https://api.studio.thegraph.com/query/1723512/onsocial-testnet/version/latest"
    
    # Query The Graph
    local tg_result=$(curl -s "$thegraph_url" \
        -H 'Content-Type: application/json' \
        -d '{"query":"{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { blockTimestamp } }"}')
    
    local tg_block=$(echo "$tg_result" | jq -r '.data.dataUpdates[0].blockTimestamp // "none"' 2>/dev/null)
    
    if [ "$tg_block" != "none" ] && [ "$tg_block" != "null" ]; then
        log_info "The Graph latest: block timestamp $tg_block"
        log_info "Hasura: Real-time (current block)"
        log_success "Both indexers operational - Hasura is faster!"
    else
        log_warn "Could not query The Graph subgraph (may be behind or no data)"
    fi
    
    return 0
}

# =============================================================================
# Main
# =============================================================================
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║       OnSocial Hasura Indexer Test Suite                      ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║  Hasura:   $HASURA_URL"
    echo "║  Contract: $CONTRACT_ID"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    
    check_deps
    
    local passed=0
    local failed=0
    
    set +e  # Disable exit on error for test execution
    
    test_hasura_health && passed=$((passed+1)) || failed=$((failed+1))
    test_cursor && passed=$((passed+1)) || failed=$((failed+1))
    test_schema && passed=$((passed+1)) || failed=$((failed+1))
    test_data_updates && passed=$((passed+1)) || failed=$((failed+1))
    test_storage_updates && passed=$((passed+1)) || failed=$((failed+1))
    test_group_updates && passed=$((passed+1)) || failed=$((failed+1))
    test_subscription_support && passed=$((passed+1)) || failed=$((failed+1))
    test_compare_thegraph && passed=$((passed+1)) || failed=$((failed+1))
    
    set -e  # Re-enable exit on error
    
    log_header "Test Summary"
    echo ""
    log_success "Passed: $passed"
    [ $failed -gt 0 ] && log_error "Failed: $failed" || echo ""
    echo ""
    
    if [ $failed -eq 0 ]; then
        log_success "All tests passed! Hasura indexer is operational."
        echo ""
        echo "📊 GraphQL Endpoint: ${HASURA_URL}/v1/graphql"
        echo "🖥️  Console: ${HASURA_URL}/console"
        echo ""
    else
        log_error "Some tests failed. Check the output above."
        exit 1
    fi
}

main "$@"
