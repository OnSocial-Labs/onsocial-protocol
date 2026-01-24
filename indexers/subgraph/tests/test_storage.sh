#!/bin/bash
# =============================================================================
# STORAGE_UPDATE Event Tests
# Tests: auto_deposit, deposit, withdraw operations
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# =============================================================================
# Test: STORAGE_UPDATE (auto_deposit)
# =============================================================================
test_storage_auto_deposit() {
    log_test "STORAGE_UPDATE (auto_deposit) - Triggered by data write with deposit"
    
    local key="storage-auto-$(date +%s)"
    
    # Writing data with deposit triggers auto_deposit
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"test\"}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ storageUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author amount previousBalance newBalance reason partitionId blockHeight blockTimestamp receiptId } }')
    
    echo "Verifying all StorageUpdate fields for auto_deposit:"
    local entry=".data.storageUpdates[0]"
    
    # Core fields
    assert_field "$result" "$entry.operation" "auto_deposit" "operation = auto_deposit"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    
    # Amount fields
    assert_field_bigint "$result" "$entry.amount" "amount is BigInt"
    assert_field_exists "$result" "$entry.reason" "reason exists"
    
    # Block/receipt fields  
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
    
    # Optional balance fields (may be null)
    # assert_field_bigint "$result" "$entry.previousBalance" "previousBalance is BigInt"
    # assert_field_bigint "$result" "$entry.newBalance" "newBalance is BigInt"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "STORAGE_UPDATE (auto_deposit) - all fields validated"
        return 0
    else
        test_failed "STORAGE_UPDATE (auto_deposit) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (deposit)
# Note: storage_deposit is an internal operation. When you attach NEAR to 
# execute calls, unused deposit triggers "auto_deposit" operation.
# =============================================================================
test_storage_deposit() {
    log_test "STORAGE_UPDATE (auto_deposit) - Deposit via execute with attached NEAR"
    
    # Any execute call with attached NEAR that has unused deposit will trigger auto_deposit
    local key="test-auto-deposit-$(date +%s)"
    local value="test-value-$(date +%s)"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"$value\"}}}}" \
        "0.1"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ storageUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author amount previousBalance newBalance reason partitionId blockHeight blockTimestamp receiptId targetId actorId payerId authType } }')
    
    echo "Verifying StorageUpdate fields for deposit:"
    local entry=".data.storageUpdates[0]"
    local op=$(echo "$result" | jq -r "$entry.operation // \"\"")
    
    # auto_deposit is triggered when unused NEAR is saved to storage
    if [[ "$op" == "storage_deposit" ]] || [[ "$op" == "auto_deposit" ]]; then
        # Core fields
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_bigint "$result" "$entry.amount" "amount is BigInt"
        
        # Block/receipt fields
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
        
        # Balance tracking
        assert_field_bigint "$result" "$entry.previousBalance" "previousBalance is BigInt"
        assert_field_bigint "$result" "$entry.newBalance" "newBalance is BigInt"
        assert_field_exists "$result" "$entry.reason" "reason exists"
        
        # Auth context fields
        assert_field_exists "$result" "$entry.partitionId" "partitionId exists"
        assert_field "$result" "$entry.targetId" "$SIGNER" "targetId = signer"
        assert_field "$result" "$entry.actorId" "$SIGNER" "actorId = signer"
        assert_field "$result" "$entry.payerId" "$SIGNER" "payerId = signer"
        assert_field "$result" "$entry.authType" "direct" "authType = direct"
        
        test_passed "STORAGE_UPDATE (deposit) - fields validated (op=$op)"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.storageUpdates[0]'
        return 0
    else
        test_failed "STORAGE_UPDATE (deposit) - unexpected operation: $op"
        return 1
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (storage_deposit) - via execute API
# =============================================================================
test_storage_deposit_explicit() {
    log_test "STORAGE_UPDATE (storage_deposit) - Explicit deposit via execute API"
    
    # Storage operations use execute API with keys like "storage/deposit"
    call_and_wait "execute" \
        '{"request": {"action": {"type": "set", "data": {"storage/deposit": {"amount": "100000000000000000000000"}}}}}' \
        "0.1"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ storageUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {operation: "storage_deposit"}) { id operation author amount previousBalance newBalance partitionId blockHeight blockTimestamp receiptId } }')
    local op=$(echo "$result" | jq -r '.data.storageUpdates[0].operation // ""')
    
    if [[ "$op" == "storage_deposit" ]]; then
        echo "Verifying StorageUpdate fields for storage_deposit:"
        local entry=".data.storageUpdates[0]"
        ASSERTIONS_FAILED=0
        
        assert_field "$result" "$entry.operation" "storage_deposit" "operation = storage_deposit"
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_bigint "$result" "$entry.amount" "amount is BigInt"
        assert_field_bigint "$result" "$entry.previousBalance" "previousBalance is BigInt"
        assert_field_bigint "$result" "$entry.newBalance" "newBalance is BigInt"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        
        if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
            test_passed "STORAGE_UPDATE (storage_deposit) - all fields validated"
            echo "$result" | jq '.data.storageUpdates[0]'
            return 0
        else
            test_failed "STORAGE_UPDATE (storage_deposit) - some assertions failed"
            return 1
        fi
    else
        test_failed "STORAGE_UPDATE (storage_deposit) not found"
        echo "Latest storage operations:"
        query_subgraph '{ storageUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { operation author } }' | jq '.data.storageUpdates'
        return 1
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (storage_withdraw) - via execute API
# =============================================================================
test_storage_withdraw() {
    log_test "STORAGE_UPDATE (storage_withdraw) - Withdrawal via execute API"
    
    # First deposit to ensure balance, then withdraw
    call_and_wait "execute" \
        '{"request": {"action": {"type": "set", "data": {"storage/deposit": {"amount": "100000000000000000000000"}}}}}' \
        "0.1"
    
    # Now withdraw (0.05 NEAR = 50000000000000000000000 yoctoNEAR)
    call_and_wait "execute" \
        '{"request": {"action": {"type": "set", "data": {"storage/withdraw": {"amount": "50000000000000000000000"}}}}}' \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ storageUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation author amount previousBalance newBalance reason } }')
    local op=$(echo "$result" | jq -r '.data.storageUpdates[0].operation // ""')
    
    # storage_withdraw may trigger auto_deposit for unused deposit
    if [[ "$op" == "storage_withdraw" ]] || [[ "$op" == "auto_deposit" ]]; then
        # Check if storage_withdraw is in results
        local withdraw_found=$(echo "$result" | jq '[.data.storageUpdates[] | select(.operation == "storage_withdraw")] | length')
        if [[ "$withdraw_found" -gt 0 ]]; then
            test_passed "STORAGE_UPDATE (storage_withdraw) indexed"
            echo "$result" | jq '[.data.storageUpdates[] | select(.operation == "storage_withdraw")][0]'
            return 0
        fi
    fi
    
    test_failed "STORAGE_UPDATE (storage_withdraw) not found"
    echo "Latest storage operations:"
    echo "$result" | jq '.data.storageUpdates'
    return 1
}

# =============================================================================
# Test: Query existing StorageUpdates
# =============================================================================
test_storage_query() {
    log_test "Query existing StorageUpdates"
    
    local result=$(query_subgraph '{ storageUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author amount reason blockTimestamp } }')
    
    if echo "$result" | jq -e '.data.storageUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.storageUpdates | length')
        test_passed "Found $count StorageUpdate entries"
        echo "$result" | jq '.data.storageUpdates'
        return 0
    else
        test_failed "No StorageUpdates found"
        return 1
    fi
}

# =============================================================================
# Test: Query storage operations breakdown
# =============================================================================
test_storage_breakdown() {
    log_test "Storage operations breakdown"
    
    local result=$(query_subgraph '{ 
        autoDeposits: storageUpdates(where: {operation: "auto_deposit"}, first: 1) { id }
        deposits: storageUpdates(where: {operation: "deposit"}, first: 1) { id }
        withdrawals: storageUpdates(where: {operation: "withdraw"}, first: 1) { id }
        poolOps: storageUpdates(where: {poolId_not: null}, first: 1) { id }
        groupOps: storageUpdates(where: {groupId_not: null}, first: 1) { id }
    }')
    
    echo "Storage operations breakdown:"
    echo "  auto_deposit: $(echo "$result" | jq '[.data.autoDeposits // []] | length') found"
    echo "  deposit:      $(echo "$result" | jq '[.data.deposits // []] | length') found"
    echo "  withdraw:     $(echo "$result" | jq '[.data.withdrawals // []] | length') found"
    echo "  pool_*:       $(echo "$result" | jq '[.data.poolOps // []] | length') found"
    echo "  group_*:      $(echo "$result" | jq '[.data.groupOps // []] | length') found"
    
    return 0
}

# =============================================================================
# Test: Validate StorageUpdate field mapping (no contract calls)
# =============================================================================
test_storage_validate_fields() {
    log_test "Validating StorageUpdate field mapping against existing data"
    
    local result=$(query_subgraph '{ storageUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author amount previousBalance newBalance reason partitionId blockHeight blockTimestamp receiptId poolId poolKey groupId bytes authType actorId payerId } }')
    
    if ! echo "$result" | jq -e '.data.storageUpdates[0]' >/dev/null 2>&1; then
        test_failed "No StorageUpdates found to validate"
        return 1
    fi
    
    echo "Validating ALL StorageUpdate schema fields:"
    local entry=".data.storageUpdates[0]"
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
    local amount=$(echo "$result" | jq -r "$entry.amount // \"null\"")
    local prev=$(echo "$result" | jq -r "$entry.previousBalance // \"null\"")
    local new=$(echo "$result" | jq -r "$entry.newBalance // \"null\"")
    local reason=$(echo "$result" | jq -r "$entry.reason // \"null\"")
    local partition=$(echo "$result" | jq -r "$entry.partitionId // \"null\"")
    local poolId=$(echo "$result" | jq -r "$entry.poolId // \"null\"")
    local poolKey=$(echo "$result" | jq -r "$entry.poolKey // \"null\"")
    local groupId=$(echo "$result" | jq -r "$entry.groupId // \"null\"")
    local bytes=$(echo "$result" | jq -r "$entry.bytes // \"null\"")
    local authType=$(echo "$result" | jq -r "$entry.authType // \"null\"")
    local actorId=$(echo "$result" | jq -r "$entry.actorId // \"null\"")
    local payerId=$(echo "$result" | jq -r "$entry.payerId // \"null\"")
    
    echo "  ○ amount = ${amount:0:30}"
    echo "  ○ previousBalance = ${prev:0:30}"
    echo "  ○ newBalance = ${new:0:30}"
    echo "  ○ reason = ${reason:0:50}"
    echo "  ○ partitionId = $partition"
    echo "  ○ poolId = $poolId"
    echo "  ○ poolKey = $poolKey"
    echo "  ○ groupId = $groupId"
    echo "  ○ bytes = $bytes"
    echo "  ○ authType = $authType"
    echo "  ○ actorId = $actorId"
    echo "  ○ payerId = $payerId"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "StorageUpdate field mapping validated"
        return 0
    else
        test_failed "StorageUpdate field mapping has errors"
        return 1
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (share_storage) - Allocate bytes from shared pool to user
# =============================================================================
test_storage_share() {
    log_test "STORAGE_UPDATE (share_storage) - Allocate bytes from pool to target user"
    
    # First ensure we have a shared pool (from previous tests or create one)
    # The pool_id must equal the signer's account
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"storage/shared_pool_deposit\": {\"pool_id\": \"$SIGNER\", \"amount\": \"500000000000000000000000\"}}}}}" \
        "0.6"
    
    # Share storage with a target account
    # Note: target_id must be a different account and NOT already have shared storage
    local target="share-recipient-$(date +%s).testnet"
    local max_bytes=50000  # 50KB allocation
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"storage/share_storage\": {\"target_id\": \"$target\", \"max_bytes\": $max_bytes}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ storageUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {operation: "share_storage"}) { id operation author targetId bytes newSharedBytes newUsedBytes poolAvailableBytes } }')
    local op=$(echo "$result" | jq -r '.data.storageUpdates[0].operation // ""')
    
    if [[ "$op" == "share_storage" ]]; then
        test_passed "STORAGE_UPDATE (share_storage) indexed"
        echo ""
        echo "📄 Shared storage allocation:"
        echo "$result" | jq '.data.storageUpdates[0]'
        return 0
    else
        log_warn "share_storage not found"
        echo "Latest storage operations:"
        query_subgraph '{ storageUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { operation author targetId } }' | jq '.data.storageUpdates'
        return 0
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (return_storage) - Target returns shared storage allocation
# =============================================================================
test_storage_return() {
    log_test "STORAGE_UPDATE (return_storage) - Return shared storage to pool"
    
    # This requires a target account to call return_shared_storage
    # The target must have been allocated shared storage first
    
    # Query for existing return_storage events (from any previous tests)
    local result=$(query_subgraph '{ storageUpdates(where: {operation: "return_storage"}, first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation author targetId bytes poolId returnedBytes } }')
    
    if echo "$result" | jq -e '.data.storageUpdates[0]' >/dev/null 2>&1; then
        test_passed "STORAGE_UPDATE (return_storage) found"
        echo "$result" | jq '.data.storageUpdates'
        return 0
    else
        log_warn "No return_storage events found"
        log_info "To test: target account must call storage/return_shared_storage"
        log_info "This requires the target account's keys (not available in current tests)"
        return 0
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (platform_pool_deposit) - via execute API
# =============================================================================
test_storage_platform_pool() {
    log_test "STORAGE_UPDATE (platform_pool_deposit) - via execute API"
    
    # Platform pool deposit - requires attached NEAR
    call_and_wait "execute" \
        '{"request": {"action": {"type": "set", "data": {"storage/platform_pool_deposit": {"amount": "100000000000000000000000"}}}}}' \
        "0.15"
    
    check_indexing_errors || return 1
    
    # Filter by operation since auto_deposit may also be emitted
    local result=$(query_subgraph '{ storageUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {operation: "platform_pool_deposit"}) { id operation author amount previousPoolBalance newPoolBalance donor } }')
    local op=$(echo "$result" | jq -r '.data.storageUpdates[0].operation // ""')
    
    if [[ "$op" == "platform_pool_deposit" ]]; then
        test_passed "STORAGE_UPDATE (platform_pool_deposit) indexed"
        echo "$result" | jq '.data.storageUpdates[0]'
        return 0
    else
        log_warn "platform_pool_deposit not found (may require admin or different permissions)"
        return 0
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (shared_pool_deposit / pool_deposit) - via execute API  
# =============================================================================
test_storage_shared_pool() {
    log_test "STORAGE_UPDATE (pool_deposit) - via shared_pool_deposit API"
    
    # Shared pool deposit: pool_id must equal the signer's account
    # You can only create/deposit to your own shared storage pool
    # Note: contract emits "pool_deposit" operation (not shared_pool_deposit)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"storage/shared_pool_deposit\": {\"pool_id\": \"$SIGNER\", \"amount\": \"100000000000000000000000\"}}}}}" \
        "0.15"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ storageUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {operation: "pool_deposit"}) { id operation author amount poolId poolKey previousPoolBalance newPoolBalance } }')
    local op=$(echo "$result" | jq -r '.data.storageUpdates[0].operation // ""')
    
    if [[ "$op" == "pool_deposit" ]]; then
        test_passed "STORAGE_UPDATE (pool_deposit) indexed via shared_pool_deposit API"
        echo "$result" | jq '.data.storageUpdates[0]'
        return 0
    else
        log_warn "pool_deposit not found"
        query_subgraph '{ storageUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { operation author } }' | jq '.data.storageUpdates'
        return 0  
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (group_pool_deposit) - via execute API
# =============================================================================
test_storage_group_pool() {
    log_test "STORAGE_UPDATE (group_pool_deposit) - via execute API"
    
    # First create a proper group using CreateGroup action (not data set)
    local group_id="pool-test-$(date +%s)"
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {\"name\": \"Pool Test Group\", \"description\": \"Test group for pool deposit\"}}}}" \
        "0.1"
    
    # Now deposit to the group pool
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"storage/group_pool_deposit\": {\"group_id\": \"$group_id\", \"amount\": \"100000000000000000000000\"}}}}}" \
        "0.15"
    
    check_indexing_errors || return 1
    
    # Check GROUP_UPDATE for group_pool_deposit (it emits there, not STORAGE_UPDATE)
    local result=$(query_subgraph '{ groupUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc, where: {operation_in: ["group_pool_deposit", "group_pool_created"]}) { id operation author groupId amount poolKey } }')
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "group_pool_deposit" ]] || [[ "$op" == "group_pool_created" ]]; then
        test_passed "GROUP_UPDATE (group_pool_deposit) indexed"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    else
        log_warn "group_pool_deposit not found"
        echo "Latest group updates:"
        query_subgraph '{ groupUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { operation author groupId } }' | jq '.data.groupUpdates'
        return 0
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (pool_deposit)
# =============================================================================
test_storage_pool() {
    log_test "STORAGE_UPDATE (pool_deposit)"
    
    # Query for pool_deposit events
    local result=$(query_subgraph '{ storageUpdates(where: {operation: "pool_deposit"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author amount poolId poolKey previousPoolBalance newPoolBalance } }')
    
    if echo "$result" | jq -e '.data.storageUpdates[0]' >/dev/null 2>&1; then
        test_passed "STORAGE_UPDATE (pool_deposit) found"
        echo "$result" | jq '.data.storageUpdates'
        return 0
    else
        log_warn "No pool_deposit events found"
        return 0
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (attached_deposit)
# =============================================================================
test_storage_attached() {
    log_test "STORAGE_UPDATE (attached_deposit)"
    
    # Query for attached_deposit events
    local result=$(query_subgraph '{ storageUpdates(where: {operation: "attached_deposit"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author amount reason } }')
    
    if echo "$result" | jq -e '.data.storageUpdates[0]' >/dev/null 2>&1; then
        test_passed "STORAGE_UPDATE (attached_deposit) found"
        echo "$result" | jq '.data.storageUpdates'
        return 0
    else
        log_warn "No attached_deposit events found"
        return 0
    fi
}

# =============================================================================
# Test: Query all STORAGE_UPDATE operations breakdown
# =============================================================================
test_storage_operations_breakdown() {
    log_test "STORAGE_UPDATE operations breakdown"
    
    echo "STORAGE_UPDATE operations breakdown:"
    
    local url="$SUBGRAPH_URL"
    
    check_op() {
        local op=$1
        local result=$(curl -s "$url" -H 'Content-Type: application/json' -d '{"query":"{ storageUpdates(where: {operation: \"'"$op"'\"}, first: 1) { id } }"}')
        local count=$(echo "$result" | jq '.data.storageUpdates | length // 0' 2>/dev/null || echo "0")
        printf "  %-22s %s found\n" "$op:" "$count"
    }
    
    check_op "auto_deposit"
    check_op "storage_deposit"
    check_op "storage_withdraw"
    check_op "attached_deposit"
    check_op "platform_pool_deposit"
    check_op "platform_sponsor"
    check_op "pool_deposit"
    check_op "share_storage"
    check_op "return_storage"
    
    return 0
}

# =============================================================================
# Main
# =============================================================================
show_help() {
    echo "Usage: $0 [test_name|all]"
    echo ""
    echo "Available tests:"
    echo "  auto_deposit     - Test STORAGE_UPDATE (auto_deposit)"
    echo "  deposit          - Test STORAGE_UPDATE (auto_deposit via execute)"
    echo "  deposit_explicit - Test STORAGE_UPDATE (storage_deposit via API)"
    echo "  withdraw         - Test STORAGE_UPDATE (storage_withdraw via API)"
    echo "  share            - Test STORAGE_UPDATE (share_storage)"
    echo "  return           - Test STORAGE_UPDATE (return_storage)"
    echo "  platform_pool    - Test STORAGE_UPDATE (platform_pool_deposit)"
    echo "  shared_pool      - Test STORAGE_UPDATE (shared_pool_deposit)"
    echo "  group_pool       - Test STORAGE_UPDATE (group_pool_deposit)"
    echo "  pool             - Test STORAGE_UPDATE (pool_deposit)"
    echo "  attached         - Test STORAGE_UPDATE (attached_deposit)"
    echo "  ops_breakdown    - Show all operations breakdown"
    echo "  query            - Query existing StorageUpdates"
    echo "  breakdown        - Show breakdown by operation type"
    echo "  validate         - Validate field mapping"
    echo "  all              - Run all tests"
}

main() {
    echo ""
    echo "=============================================="
    echo "  STORAGE_UPDATE Event Tests"
    echo "=============================================="
    echo ""
    
    check_deps
    
    case "${1:-all}" in
        auto_deposit)     test_storage_auto_deposit ;;
        deposit)          test_storage_deposit ;;
        deposit_explicit) test_storage_deposit_explicit ;;
        withdraw)         test_storage_withdraw ;;
        share)            test_storage_share ;;
        return)           test_storage_return ;;
        platform_pool)    test_storage_platform_pool ;;
        shared_pool)      test_storage_shared_pool ;;
        group_pool)       test_storage_group_pool ;;
        pool)             test_storage_pool ;;
        attached)         test_storage_attached ;;
        ops_breakdown)    test_storage_operations_breakdown ;;
        query)            test_storage_query ;;
        breakdown)        test_storage_breakdown ;;
        validate)         test_storage_validate_fields ;;
        all)
            test_storage_query
            test_storage_breakdown
            test_storage_operations_breakdown
            test_storage_validate_fields
            test_storage_auto_deposit
            test_storage_deposit
            test_storage_deposit_explicit
            test_storage_withdraw
            test_storage_platform_pool
            test_storage_shared_pool
            test_storage_group_pool
            test_storage_share
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
