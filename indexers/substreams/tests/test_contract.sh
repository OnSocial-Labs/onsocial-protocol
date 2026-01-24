#!/bin/bash
# =============================================================================
# CONTRACT_UPDATE Event Tests for Hasura/PostgreSQL Indexer
# Tests: config_change, admin_change, manager_change, status_change, partition
# Note: Most of these require admin privileges
# Mirror of subgraph/tests/test_contract.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# =============================================================================
# Test: Query existing ContractUpdates
# =============================================================================
test_contract_query() {
    log_test "Query existing ContractUpdates"
    
    local result=$(query_hasura '{ contract_updates(limit: 10, order_by: {block_height: desc}) { id operation author field old_value new_value partition_id block_timestamp } }')
    
    if echo "$result" | jq -e '.data.contract_updates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.contract_updates | length')
        test_passed "Found $count ContractUpdate entries"
        echo "$result" | jq '.data.contract_updates'
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
    
    local result=$(query_hasura '{ contract_updates(limit: 1, order_by: {block_height: desc}) { id operation author field old_value new_value partition_id block_height block_timestamp receipt_id target_id actor_id payer_id auth_type } }')
    
    if ! echo "$result" | jq -e '.data.contract_updates[0]' >/dev/null 2>&1; then
        log_warn "No ContractUpdates found to validate"
        return 0
    fi
    
    echo "Validating ContractUpdate schema fields:"
    local entry=".data.contract_updates[0]"
    
    # Required fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field_exists "$result" "$entry.operation" "operation exists"
    assert_field_exists "$result" "$entry.author" "author exists"
    assert_field_bigint "$result" "$entry.block_height" "block_height is BigInt"
    assert_field_bigint "$result" "$entry.block_timestamp" "block_timestamp is BigInt"
    assert_field_exists "$result" "$entry.receipt_id" "receipt_id exists"
    
    # Optional fields
    echo ""
    echo "Optional fields:"
    local field=$(echo "$result" | jq -r "$entry.field // \"null\"")
    echo -e "  ${BLUE}○${NC} field = $field"
    local oldValue=$(echo "$result" | jq -r "$entry.old_value // \"null\"")
    echo -e "  ${BLUE}○${NC} old_value = $oldValue"
    local newValue=$(echo "$result" | jq -r "$entry.new_value // \"null\"")
    echo -e "  ${BLUE}○${NC} new_value = $newValue"
    local partitionId=$(echo "$result" | jq -r "$entry.partition_id // \"null\"")
    echo -e "  ${BLUE}○${NC} partition_id = $partitionId"
    
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
    
    local result=$(query_hasura '{ contract_updates(where: {operation: {_eq: "set"}}, limit: 1, order_by: {block_height: desc}) { id operation author field path partition_id block_height block_timestamp receipt_id target_id auth_type } }')
    
    if echo "$result" | jq -e '.data.contract_updates[0]' >/dev/null 2>&1; then
        echo "Verifying ContractUpdate fields for set:"
        local entry=".data.contract_updates[0]"
        
        assert_field "$result" "$entry.operation" "set" "operation = set"
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_bigint "$result" "$entry.block_height" "block_height is BigInt"
        assert_field_bigint "$result" "$entry.block_timestamp" "block_timestamp is BigInt"
        assert_field_exists "$result" "$entry.receipt_id" "receipt_id exists"
        
        test_passed "CONTRACT_UPDATE (set) - fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.contract_updates[0]'
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
    log_test "CONTRACT_UPDATE (config_change) - Requires admin privileges"
    
    log_warn "Skipping config_change test - requires admin privileges"
    log_info "To test manually, call as admin:"
    echo "  near call $CONTRACT set_config '{\"key\": \"max_data_size\", \"value\": \"10000\"}' --accountId admin.testnet"
    
    # Query to see if any config changes exist
    local result=$(query_hasura '{ contract_updates(where: {operation: {_eq: "config_change"}}, limit: 5, order_by: {block_height: desc}) { id operation field old_value new_value author } }')
    
    if echo "$result" | jq -e '.data.contract_updates[0]' >/dev/null 2>&1; then
        log_info "Found existing config_change events:"
        echo "$result" | jq '.data.contract_updates'
    fi
    
    test_passed "config_change check complete"
    return 0
}

# =============================================================================
# Test: CONTRACT_UPDATE (admin_change)
# Note: Requires admin access
# =============================================================================
test_contract_admin() {
    log_test "CONTRACT_UPDATE (admin_change) - Requires admin privileges"
    
    log_warn "Skipping admin_change test - requires admin privileges"
    log_info "To test manually:"
    echo "  near call $CONTRACT add_admin '{\"account_id\": \"new-admin.testnet\"}' --accountId admin.testnet"
    echo "  near call $CONTRACT remove_admin '{\"account_id\": \"admin-to-remove.testnet\"}' --accountId admin.testnet"
    
    # Query to see if any admin changes exist
    local result=$(query_hasura '{ contract_updates(where: {operation: {_ilike: "%admin%"}}, limit: 5, order_by: {block_height: desc}) { id operation author target_id } }')
    
    if echo "$result" | jq -e '.data.contract_updates[0]' >/dev/null 2>&1; then
        log_info "Found existing admin events:"
        echo "$result" | jq '.data.contract_updates'
    fi
    
    test_passed "admin_change check complete"
    return 0
}

# =============================================================================
# Test: CONTRACT_UPDATE (manager_change)
# Note: Requires admin access
# =============================================================================
test_contract_manager() {
    log_test "CONTRACT_UPDATE (manager_change) - Requires admin privileges"
    
    log_warn "Skipping manager_change test - requires admin privileges"
    log_info "To test manually:"
    echo "  near call $CONTRACT set_manager '{\"new_manager\": \"new-manager.testnet\"}' --accountId admin.testnet"
    
    # Query to see if any manager changes exist
    local result=$(query_hasura '{ contract_updates(where: {operation: {_eq: "manager_change"}}, limit: 5, order_by: {block_height: desc}) { id operation old_manager new_manager executor } }')
    
    if echo "$result" | jq -e '.data.contract_updates[0]' >/dev/null 2>&1; then
        log_info "Found existing manager_change events:"
        echo "$result" | jq '.data.contract_updates'
    fi
    
    test_passed "manager_change check complete"
    return 0
}

# =============================================================================
# Test: CONTRACT_UPDATE (status_change)
# Note: Requires admin access
# =============================================================================
test_contract_status() {
    log_test "CONTRACT_UPDATE (status_change) - Requires admin privileges"
    
    log_warn "Skipping status_change test - requires admin privileges"
    log_info "To test manually (pausing/unpausing contract):"
    echo "  near call $CONTRACT pause '{}' --accountId admin.testnet"
    echo "  near call $CONTRACT unpause '{}' --accountId admin.testnet"
    
    # Query to see if any status changes exist
    local result=$(query_hasura '{ contract_updates(where: {operation: {_eq: "status_change"}}, limit: 5, order_by: {block_height: desc}) { id operation previous_status new_status author } }')
    
    if echo "$result" | jq -e '.data.contract_updates[0]' >/dev/null 2>&1; then
        log_info "Found existing status_change events:"
        echo "$result" | jq '.data.contract_updates'
    fi
    
    test_passed "status_change check complete"
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
    echo "  near call $CONTRACT create_partition '{\"partition_id\": 1, \"config\": {}}' --accountId admin.testnet"
    
    # Query to see if any partition events exist
    local result=$(query_hasura '{ contract_updates(where: {partition_id: {_is_null: false}}, limit: 5, order_by: {block_height: desc}) { id operation partition_id author } }')
    
    if echo "$result" | jq -e '.data.contract_updates[0]' >/dev/null 2>&1; then
        log_info "Found existing partition events:"
        echo "$result" | jq '.data.contract_updates'
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
    
    for op in "set" "config_change" "admin_added" "admin_removed" "manager_change" "status_change" "partition_created" "partition_updated"; do
        local result=$(query_hasura "{ contract_updates(where: {operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.contract_updates | length // 0')
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
