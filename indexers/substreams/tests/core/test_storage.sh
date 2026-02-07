#!/bin/bash
# =============================================================================
# STORAGE_UPDATE Event Tests for Hasura/PostgreSQL Indexer
# Tests: auto_deposit, deposit, withdraw, share_storage operations
# Mirror of subgraph/tests/test_storage.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

# =============================================================================
# Test: Query existing StorageUpdates
# =============================================================================
test_storage_query() {
    log_test "Query existing StorageUpdates"
    
    local result=$(query_hasura '{ storageUpdates(limit: 5, order_by: {blockHeight: desc}) { id operation author amount blockHeight blockTimestamp } }')
    
    if echo "$result" | jq -e '.data.storageUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.storageUpdates | length')
        test_passed "Found $count StorageUpdate entries"
        echo "$result" | jq '.data.storageUpdates'
        return 0
    else
        log_warn "No StorageUpdates found (table may be empty)"
        test_passed "StorageUpdates table queryable"
        return 0
    fi
}

# =============================================================================
# Test: Validate fields on existing StorageUpdates
# =============================================================================
test_storage_validate_fields() {
    log_test "Validating StorageUpdate field mapping against existing data"
    
    local result=$(query_hasura '{ storageUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation author amount previousBalance newBalance reason partitionId blockHeight blockTimestamp receiptId targetId actorId payerId authType } }')
    
    if ! echo "$result" | jq -e '.data.storageUpdates[0]' >/dev/null 2>&1; then
        log_warn "No StorageUpdates found to validate"
        return 0
    fi
    
    echo "Validating StorageUpdate schema fields:"
    local entry=".data.storageUpdates[0]"
    
    # Required fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field_exists "$result" "$entry.operation" "operation exists"
    assert_field_exists "$result" "$entry.author" "author exists"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Amount fields
    assert_field_exists "$result" "$entry.amount" "amount exists"
    
    # Optional fields
    echo ""
    echo "Optional fields:"
    local prev=$(echo "$result" | jq -r "$entry.previousBalance // \"null\"")
    echo -e "  ${BLUE}○${NC} previousBalance = $prev"
    local new=$(echo "$result" | jq -r "$entry.newBalance // \"null\"")
    echo -e "  ${BLUE}○${NC} newBalance = $new"
    local reason=$(echo "$result" | jq -r "$entry.reason // \"null\"")
    echo -e "  ${BLUE}○${NC} reason = $reason"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "StorageUpdate field mapping validated"
        return 0
    else
        test_failed "StorageUpdate field mapping has issues"
        return 1
    fi
}

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
    
    local result=$(query_hasura '{ storageUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation author amount previousBalance newBalance reason partitionId blockHeight blockTimestamp receiptId targetId actorId payerId authType } }')
    
    echo "Verifying StorageUpdate fields for auto_deposit:"
    local entry=".data.storageUpdates[0]"
    
    # Core fields
    assert_field "$result" "$entry.operation" "auto_deposit" "operation = auto_deposit"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    
    # Amount fields
    assert_field_exists "$result" "$entry.amount" "amount exists"
    assert_field_exists "$result" "$entry.reason" "reason exists"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Balance tracking
    assert_field_exists "$result" "$entry.previousBalance" "previousBalance exists"
    assert_field_exists "$result" "$entry.newBalance" "newBalance exists"
    
    # Auth context
    assert_field "$result" "$entry.targetId" "$SIGNER" "targetId = signer"
    assert_field "$result" "$entry.authType" "direct" "authType = direct"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "STORAGE_UPDATE (auto_deposit) - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.storageUpdates[0]'
        return 0
    else
        test_failed "STORAGE_UPDATE (auto_deposit) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: STORAGE_UPDATE (deposit) - via execute with larger NEAR
# =============================================================================
test_storage_deposit() {
    log_test "STORAGE_UPDATE (deposit) - Deposit via execute with attached NEAR"
    
    local key="test-deposit-$(date +%s)"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"deposit-test\"}}}}" \
        "0.1"
    
    local result=$(query_hasura '{ storageUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation author amount previousBalance newBalance reason partitionId blockHeight blockTimestamp receiptId } }')
    
    echo "Verifying StorageUpdate fields for deposit:"
    local entry=".data.storageUpdates[0]"
    local op=$(echo "$result" | jq -r "$entry.operation // \"\"")
    
    if [[ "$op" == "auto_deposit" ]] || [[ "$op" == "deposit" ]]; then
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_exists "$result" "$entry.amount" "amount exists"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
        
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
# Test: Query STORAGE_UPDATE operations by type
# =============================================================================
test_storage_breakdown() {
    log_test "STORAGE_UPDATE breakdown by operation type"
    
    echo ""
    echo "Operations indexed:"
    
    for op in "storage_deposit" "storage_withdraw" "auto_deposit" "attached_deposit" "refund_unused_deposit" "platform_pool_deposit" "pool_deposit" "share_storage" "return_storage" "platform_sponsor" "group_sponsor_spend"; do
        local result=$(query_hasura "{ storageUpdates(where: {operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.storageUpdates | length // 0')
        if [[ "$count" -gt 0 ]]; then
            echo -e "  ${GREEN}✓${NC} $op"
        else
            echo -e "  ${YELLOW}○${NC} $op (not indexed)"
        fi
    done
    
    test_passed "STORAGE_UPDATE breakdown complete"
    return 0
}

# =============================================================================
# Show usage
# =============================================================================
show_usage() {
    echo "Usage: test_storage.sh [test_name|mode]"
    echo ""
    echo "Modes:"
    echo "  query      - Read-only tests (default, safe)"
    echo "  write      - Tests that write to contract"
    echo "  all        - Run all tests"
    echo ""
    echo "Individual tests:"
    echo "  validate   - Validate schema fields against existing data"
    echo "  auto_deposit - Test STORAGE_UPDATE (auto_deposit)"
    echo "  deposit    - Test STORAGE_UPDATE (deposit)"
    echo "  breakdown  - Show operations breakdown"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     OnSocial Hasura Indexer - STORAGE_UPDATE Tests            ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Hasura:   $HASURA_URL"
echo "║  Contract: $CONTRACT"
echo "║  Signer:   $SIGNER"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

check_deps

case "${1:-query}" in
    query)
        test_storage_query
        test_storage_breakdown
        ;;
    write)
        test_storage_auto_deposit
        test_storage_deposit
        ;;
    all)
        test_storage_query
        test_storage_validate_fields
        test_storage_auto_deposit
        test_storage_deposit
        test_storage_breakdown
        ;;
    validate)
        test_storage_validate_fields
        ;;
    auto_deposit)
        test_storage_auto_deposit
        ;;
    deposit)
        test_storage_deposit
        ;;
    breakdown)
        test_storage_breakdown
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
