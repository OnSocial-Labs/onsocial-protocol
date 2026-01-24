#!/bin/bash
# =============================================================================
# CONTRACT_UPDATE Event Tests
# Tests: config_change, admin_change, manager_change, status_change, partition
# Note: Most of these require admin privileges
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# =============================================================================
# Test: Query existing ContractUpdates
# =============================================================================
test_contract_query() {
    log_test "Query existing ContractUpdates"
    
    local result=$(query_subgraph '{ contractUpdates(first: 10, orderBy: blockTimestamp, orderDirection: desc) { id operation author field oldValue newValue partitionId blockTimestamp } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.contractUpdates | length')
        test_passed "Found $count ContractUpdate entries"
        echo "$result" | jq '.data.contractUpdates'
        return 0
    else
        log_warn "No ContractUpdates found (may be normal if no admin operations performed)"
        return 0
    fi
}

# =============================================================================
# Test: CONTRACT_UPDATE (config_change)
# Note: Requires admin access
# =============================================================================
test_contract_config() {
    log_test "CONTRACT_UPDATE (config_change) - Requires admin privileges"
    
    # This would change contract config - typically admin only
    # Example: changing max_data_size or other config params
    
    log_warn "Skipping config_change test - requires admin privileges"
    log_info "To test manually, call as admin:"
    echo "  near call $CONTRACT set_config '{\"key\": \"max_data_size\", \"value\": \"10000\"}' --accountId admin.testnet"
    
    # Query to see if any config changes exist
    local result=$(query_subgraph '{ contractUpdates(where: {operation: "config_change"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation field oldValue newValue author } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing config_change events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
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
    local result=$(query_subgraph '{ contractUpdates(where: {operation_contains: "admin"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author targetId } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing admin events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
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
    local result=$(query_subgraph '{ contractUpdates(where: {operation: "manager_change"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation oldManager newManager executor } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing manager_change events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
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
    local result=$(query_subgraph '{ contractUpdates(where: {operation: "status_change"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation previousStatus newStatus author } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing status_change events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
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
    local result=$(query_subgraph '{ contractUpdates(where: {partitionId_not: null}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation partitionId author } }')
    
    if echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        log_info "Found existing partition events:"
        echo "$result" | jq '.data.contractUpdates'
    fi
    
    return 0
}

# =============================================================================
# Test: CONTRACT_UPDATE by operation type breakdown
# =============================================================================
test_contract_breakdown() {
    log_test "CONTRACT_UPDATE breakdown by operation type"
    
    local result=$(query_subgraph '{ 
        configChanges: contractUpdates(where: {operation: "config_change"}) { id }
        adminChanges: contractUpdates(where: {operation_contains: "admin"}) { id }
        managerChanges: contractUpdates(where: {operation: "manager_change"}) { id }
        statusChanges: contractUpdates(where: {operation: "status_change"}) { id }
        partitionOps: contractUpdates(where: {partitionId_not: null}) { id }
    }')
    
    echo "CONTRACT_UPDATE breakdown:"
    echo "  config_change:  $(echo "$result" | jq '.data.configChanges | length')"
    echo "  admin_*:        $(echo "$result" | jq '.data.adminChanges | length')"
    echo "  manager_change: $(echo "$result" | jq '.data.managerChanges | length')"
    echo "  status_change:  $(echo "$result" | jq '.data.statusChanges | length')"
    echo "  partition_*:    $(echo "$result" | jq '.data.partitionOps | length')"
    
    return 0
}

# =============================================================================
# Test: Validate ContractUpdate field mapping (no contract calls)
# =============================================================================
test_contract_validate_fields() {
    log_test "Validating ContractUpdate field mapping against existing data"
    
    local result=$(query_subgraph '{ contractUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author partitionId blockHeight blockTimestamp receiptId field oldValue newValue path targetId authType actorId payerId publicKey nonce oldManager newManager executor previousStatus newStatus } }')
    
    if ! echo "$result" | jq -e '.data.contractUpdates[0]' >/dev/null 2>&1; then
        test_failed "No ContractUpdates found to validate"
        return 1
    fi
    
    echo "Validating ALL ContractUpdate schema fields:"
    local entry=".data.contractUpdates[0]"
    ASSERTIONS_FAILED=0
    
    # Core fields (required)
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field_exists "$result" "$entry.operation" "operation exists"
    assert_field_exists "$result" "$entry.author" "author exists"
    
    # Blockchain fields (required)
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
    
    # Optional fields (null is acceptable)
    echo ""
    echo "Optional fields (null is acceptable):"
    local partition=$(echo "$result" | jq -r "$entry.partitionId // \"null\"")
    local field=$(echo "$result" | jq -r "$entry.field // \"null\"")
    local oldValue=$(echo "$result" | jq -r "$entry.oldValue // \"null\"")
    local newValue=$(echo "$result" | jq -r "$entry.newValue // \"null\"")
    local path=$(echo "$result" | jq -r "$entry.path // \"null\"")
    local targetId=$(echo "$result" | jq -r "$entry.targetId // \"null\"")
    local authType=$(echo "$result" | jq -r "$entry.authType // \"null\"")
    local actorId=$(echo "$result" | jq -r "$entry.actorId // \"null\"")
    local payerId=$(echo "$result" | jq -r "$entry.payerId // \"null\"")
    local publicKey=$(echo "$result" | jq -r "$entry.publicKey // \"null\"")
    local nonce=$(echo "$result" | jq -r "$entry.nonce // \"null\"")
    local oldManager=$(echo "$result" | jq -r "$entry.oldManager // \"null\"")
    local newManager=$(echo "$result" | jq -r "$entry.newManager // \"null\"")
    local executor=$(echo "$result" | jq -r "$entry.executor // \"null\"")
    local prevStatus=$(echo "$result" | jq -r "$entry.previousStatus // \"null\"")
    local newStatus=$(echo "$result" | jq -r "$entry.newStatus // \"null\"")
    
    echo "  ○ partitionId = $partition"
    echo "  ○ field = $field"
    echo "  ○ oldValue = ${oldValue:0:50}"
    echo "  ○ newValue = ${newValue:0:50}"
    echo "  ○ path = ${path:0:50}"
    echo "  ○ targetId = $targetId"
    echo "  ○ authType = $authType"
    echo "  ○ actorId = $actorId"
    echo "  ○ payerId = $payerId"
    echo "  ○ publicKey = ${publicKey:0:30}"
    echo "  ○ nonce = $nonce"
    echo "  ○ oldManager = $oldManager"
    echo "  ○ newManager = $newManager"
    echo "  ○ executor = $executor"
    echo "  ○ previousStatus = $prevStatus"
    echo "  ○ newStatus = $newStatus"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "ContractUpdate field mapping validated"
        return 0
    else
        test_failed "ContractUpdate field mapping has errors"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================
show_help() {
    echo "Usage: $0 [test_name|all]"
    echo ""
    echo "Available tests:"
    echo "  query     - Query existing ContractUpdates"
    echo "  config    - Test CONTRACT_UPDATE (config_change) - admin only"
    echo "  admin     - Test CONTRACT_UPDATE (admin_change) - admin only"
    echo "  manager   - Test CONTRACT_UPDATE (manager_change) - admin only"
    echo "  status    - Test CONTRACT_UPDATE (status_change) - admin only"
    echo "  partition - Test CONTRACT_UPDATE (partition) - admin only"
    echo "  breakdown - Show breakdown by operation type"
    echo "  validate  - Validate field mapping"
    echo "  all       - Run all tests"
    echo ""
    echo "Note: Most CONTRACT_UPDATE tests require admin privileges."
    echo "Set SIGNER to an admin account to run write tests."
}

main() {
    echo ""
    echo "=============================================="
    echo "  CONTRACT_UPDATE Event Tests"
    echo "=============================================="
    echo ""
    
    check_deps
    
    case "${1:-all}" in
        query)     test_contract_query ;;
        config)    test_contract_config ;;
        admin)     test_contract_admin ;;
        manager)   test_contract_manager ;;
        status)    test_contract_status ;;
        partition) test_contract_partition ;;
        breakdown) test_contract_breakdown ;;
        validate)  test_contract_validate_fields ;;
        all)
            test_contract_query
            test_contract_breakdown
            test_contract_validate_fields
            test_contract_config
            test_contract_admin
            test_contract_manager
            test_contract_status
            test_contract_partition
            print_summary
            ;;
        help|--help|-h) show_help ;;
        *)
            log_error "Unknown test: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
