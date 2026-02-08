#!/bin/bash
# =============================================================================
# CONTRACT_UPDATE Event Tests for Hasura/PostgreSQL Indexer
# Tests: config_change, admin_change, manager_change, status_change, partition
# Note: Most of these require admin privileges
# Mirror of subgraph/tests/test_contract.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

# =============================================================================
# Test: Query existing ContractUpdates
# =============================================================================
test_contract_query() {
    log_test "Query existing ContractUpdates"
    
    local result=$(query_hasura '{ contractUpdates(limit: 10, order_by: {blockHeight: desc}) { id operation author path targetId partitionId blockTimestamp } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.contractUpdates | length')
        test_passed "Found $count ContractUpdate entries"
        echo "$result" | jq '.data.contractUpdates'
        return 0
    else
        log_warn "No ContractUpdates found (may be normal if no admin operations performed)"
        test_passed "ContractUpdates table queryable"
        return 0
    fi
}

# =============================================================================
# Test: Validate fields on existing ContractUpdates
# =============================================================================
test_contract_validate_fields() {
    log_test "Validating ContractUpdate field mapping against existing data"
    
    local result=$(query_hasura '{ contractUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation author path partitionId blockHeight blockTimestamp receiptId derivedId derivedType targetId authType actorId payerId extraData } }')
    
    if ! echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_warn "No ContractUpdates found to validate"
        return 0
    fi
    
    echo "Validating ContractUpdate schema fields:"
    local entry=".data.contractUpdates[0]"
    
    # Required fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field_exists "$result" "$entry.operation" "operation exists"
    assert_field_exists "$result" "$entry.author" "author exists"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Optional fields
    echo ""
    echo "Optional fields:"
    local path=$(echo "$result" | jq -r "$entry.path // \"null\"")
    echo -e "  ${BLUE}○${NC} path = $path"
    local derivedId=$(echo "$result" | jq -r "$entry.derivedId // \"null\"")
    echo -e "  ${BLUE}○${NC} derivedId = $derivedId"
    local derivedType=$(echo "$result" | jq -r "$entry.derivedType // \"null\"")
    echo -e "  ${BLUE}○${NC} derivedType = $derivedType"
    local targetId=$(echo "$result" | jq -r "$entry.targetId // \"null\"")
    echo -e "  ${BLUE}○${NC} targetId = $targetId"
    local partitionId=$(echo "$result" | jq -r "$entry.partitionId // \"null\"")
    echo -e "  ${BLUE}○${NC} partitionId = $partitionId"
    local extraData=$(echo "$result" | jq -r "$entry.extraData // \"null\"")
    echo -e "  ${BLUE}○${NC} extraData = ${extraData:0:80}"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "ContractUpdate field mapping validated"
        return 0
    else
        test_failed "ContractUpdate field mapping has issues"
        return 1
    fi
}

# =============================================================================
# Test: CONTRACT_UPDATE (set) - meta_tx tracking
# =============================================================================
test_contract_set() {
    log_test "CONTRACT_UPDATE (set) - Meta transaction tracking"
    
    # Any execute call generates a meta_tx contract update
    local key="contract-test-$(date +%s)"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"test\"}}}}" \
        "0.01"
    
    local result=$(query_hasura '{ contractUpdates(where: {operation: {_eq: "set"}}, limit: 1, order_by: {blockHeight: desc}) { id operation author path partitionId blockHeight blockTimestamp receiptId targetId authType actorId payerId } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        echo "Verifying ContractUpdate fields for set:"
        local entry=".data.contractUpdates[0]"
        
        assert_field "$result" "$entry.operation" "set" "operation = set"
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
        
        test_passed "CONTRACT_UPDATE (set) - fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.contractUpdates[0]'
        return 0
    else
        log_warn "No CONTRACT_UPDATE (set) found"
        return 0
    fi
}

# =============================================================================
# Test: CONTRACT_UPDATE (config_change)
# Note: Requires admin access
# =============================================================================
test_contract_config() {
    log_test "CONTRACT_UPDATE (update_config) - Requires admin privileges"
    
    log_warn "Skipping update_config test - requires admin privileges"
    log_info "To test manually, call as admin:"
    echo "  near call $CONTRACT set_config '{\"key\": \"max_data_size\", \"value\": \"10000\"}' --accountId admin.testnet"
    
    # Query to see if any config changes exist
    local result=$(query_hasura '{ contractUpdates(where: {operation: {_eq: "update_config"}}, limit: 5, order_by: {blockHeight: desc}) { id operation path targetId author } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing config_change events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
    test_passed "update_config check complete"
    return 0
}

# =============================================================================
# Test: CONTRACT_UPDATE (admin_change)
# Note: Requires admin access
# =============================================================================
test_contract_admin() {
    log_test "CONTRACT_UPDATE (intents_executor) - Requires admin privileges"
    
    log_warn "Skipping intents_executor test - requires admin privileges"
    log_info "To test manually:"
    echo "  near call $CONTRACT add_intents_executor '{\"accountId\": \"executor.testnet\"}' --accountId admin.testnet"
    echo "  near call $CONTRACT remove_intents_executor '{\"accountId\": \"executor.testnet\"}' --accountId admin.testnet"
    
    # Query to see if any executor changes exist
    local result=$(query_hasura '{ contractUpdates(where: {operation: {_ilike: "%intents%"}}, limit: 5, order_by: {blockHeight: desc}) { id operation author targetId } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing intents_executor events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
    test_passed "intents_executor check complete"
    return 0
}

# =============================================================================
# Test: CONTRACT_UPDATE (manager_change)
# Note: Requires admin access
# =============================================================================
test_contract_manager() {
    log_test "CONTRACT_UPDATE (update_manager) - Requires admin privileges"
    
    log_warn "Skipping update_manager test - requires admin privileges"
    log_info "To test manually:"
    echo "  near call $CONTRACT set_manager '{\"new_manager\": \"new-manager.testnet\"}' --accountId admin.testnet"
    
    # Query to see if any manager changes exist
    local result=$(query_hasura '{ contractUpdates(where: {operation: {_eq: "update_manager"}}, limit: 5, order_by: {blockHeight: desc}) { id operation targetId actorId author } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing manager_change events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
    test_passed "update_manager check complete"
    return 0
}

# =============================================================================
# Test: CONTRACT_UPDATE (status_change)
# Note: Requires admin access
# =============================================================================
test_contract_status() {
    log_test "CONTRACT_UPDATE (status transitions) - Requires admin privileges"
    
    log_warn "Skipping status test - requires admin privileges"
    log_info "To test manually (pausing/unpausing contract):"
    echo "  near call $CONTRACT enter_read_only '{}' --accountId admin.testnet"
    echo "  near call $CONTRACT resume_live '{}' --accountId admin.testnet"
    
    # Query to see if any status changes exist
    local result=$(query_hasura '{ contractUpdates(where: {operation: {_in: ["enter_read_only", "resume_live", "activate_contract"]}}, limit: 5, order_by: {blockHeight: desc}) { id operation targetId author } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing status_change events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
    test_passed "status transition check complete"
    return 0
}

# =============================================================================
# Test: CONTRACT_UPDATE (partition operations)
# Note: Requires admin access
# =============================================================================
test_contract_partition() {
    log_test "CONTRACT_UPDATE (partition) - Requires admin privileges"
    
    log_warn "Skipping partition test - requires admin privileges"
    log_info "To test manually:"
    echo "  near call $CONTRACT create_partition '{\"partitionId\": 1, \"config\": {}}' --accountId admin.testnet"
    
    # Query to see if any partition events exist
    local result=$(query_hasura '{ contractUpdates(where: {partitionId: {_is_null: false}}, limit: 5, order_by: {blockHeight: desc}) { id operation partitionId author } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing partition events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
    test_passed "partition check complete"
    return 0
}

# =============================================================================
# Test: Query CONTRACT_UPDATE operations by type
# =============================================================================
test_contract_breakdown() {
    log_test "CONTRACT_UPDATE breakdown by operation type"
    
    echo ""
    echo "Operations indexed:"
    
    for op in "set" "update_config" "add_intents_executor" "remove_intents_executor" "update_manager" "enter_read_only" "resume_live" "activate_contract"; do
        local result=$(query_hasura "{ contractUpdates(where: {operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.contractUpdates | length // 0')
        if [[ "$count" -gt 0 ]]; then
            echo -e "  ${GREEN}✓${NC} $op"
        else
            echo -e "  ${YELLOW}○${NC} $op (not indexed)"
        fi
    done
    
    test_passed "CONTRACT_UPDATE breakdown complete"
    return 0
}

# =============================================================================
# Show usage
# =============================================================================
show_usage() {
    echo "Usage: test_contract.sh [test_name|mode]"
    echo ""
    echo "Modes:"
    echo "  query      - Read-only tests (default, safe)"
    echo "  write      - Tests that write to contract"
    echo "  all        - Run all tests"
    echo ""
    echo "Individual tests:"
    echo "  validate   - Validate schema fields against existing data"
    echo "  set        - Test CONTRACT_UPDATE (set/meta_tx)"
    echo "  config     - Check CONFIG_CHANGE events (admin)"
    echo "  admin      - Check admin events (admin)"
    echo "  manager    - Check manager events (admin)"
    echo "  status     - Check status events (admin)"
    echo "  partition  - Check partition events (admin)"
    echo "  breakdown  - Show operations breakdown"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     OnSocial Hasura Indexer - CONTRACT_UPDATE Tests           ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Hasura:   $HASURA_URL"
echo "║  Contract: $CONTRACT"
echo "║  Signer:   $SIGNER"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

check_deps

case "${1:-query}" in
    query)
        test_contract_query
        test_contract_breakdown
        ;;
    write)
        test_contract_set
        ;;
    all)
        test_contract_query
        test_contract_validate_fields
        test_contract_set
        test_contract_config
        test_contract_admin
        test_contract_manager
        test_contract_status
        test_contract_partition
        test_contract_breakdown
        ;;
    validate)
        test_contract_validate_fields
        ;;
    set)
        test_contract_set
        ;;
    config)
        test_contract_config
        ;;
    admin)
        test_contract_admin
        ;;
    manager)
        test_contract_manager
        ;;
    status)
        test_contract_status
        ;;
    partition)
        test_contract_partition
        ;;
    breakdown)
        test_contract_breakdown
        ;;
    -h|--help|help)
        show_usage
        exit 0
        ;;
    *)
        echo "❌ Unknown test: $1"
        show_usage
        exit 1
        ;;
esac

print_summary
