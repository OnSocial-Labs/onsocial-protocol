#!/bin/bash
# =============================================================================
# PERMISSION_UPDATE Event Tests for Hasura/PostgreSQL Indexer
# Tests: grant, revoke, grant_key, revoke_key operations
# Mirror of subgraph/tests/test_permission.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

# =============================================================================
# Test: Query existing PermissionUpdates
# =============================================================================
test_permission_query() {
    log_test "Query existing PermissionUpdates"
    
    local result=$(query_hasura '{ permissionUpdates(limit: 5, order_by: {blockHeight: desc}) { id operation author targetId path level blockHeight } }')
    
    if echo "$result" | jq -e '.data.permissionUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.permissionUpdates | length')
        test_passed "Found $count PermissionUpdate entries"
        echo "$result" | jq '.data.permissionUpdates'
        return 0
    else
        log_warn "No PermissionUpdates found (table may be empty)"
        test_passed "PermissionUpdates table queryable"
        return 0
    fi
}

# =============================================================================
# Test: Validate fields on existing PermissionUpdates
# =============================================================================
test_permission_validate_fields() {
    log_test "Validating PermissionUpdate field mapping against existing data"
    
    local result=$(query_hasura '{ permissionUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation author targetId permissionKey path level expiresAt partitionId blockHeight blockTimestamp receiptId deleted value derivedId derivedType } }')
    
    if ! echo "$result" | jq -e '.data.permissionUpdates[0]' >/dev/null 2>&1; then
        log_warn "No PermissionUpdates found to validate"
        return 0
    fi
    
    echo "Validating PermissionUpdate schema fields:"
    local entry=".data.permissionUpdates[0]"
    
    # Required fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field_exists "$result" "$entry.operation" "operation exists"
    assert_field_exists "$result" "$entry.author" "author exists"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Permission-specific fields
    assert_field_exists "$result" "$entry.path" "path exists"
    
    # Optional fields
    echo ""
    echo "Optional fields:"
    local targetId=$(echo "$result" | jq -r "$entry.targetId // \"null\"")
    echo -e "  ${BLUE}○${NC} targetId = $targetId"
    local publicKey=$(echo "$result" | jq -r "$entry.permissionKey // \"null\"")
    echo -e "  ${BLUE}○${NC} permissionKey = $publicKey"
    local level=$(echo "$result" | jq -r "$entry.level // \"null\"")
    echo -e "  ${BLUE}○${NC} level = $level"
    local expiresAt=$(echo "$result" | jq -r "$entry.expiresAt // \"null\"")
    echo -e "  ${BLUE}○${NC} expiresAt = $expiresAt"
    local deleted=$(echo "$result" | jq -r "$entry.deleted // \"null\"")
    echo -e "  ${BLUE}○${NC} deleted = $deleted"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "PermissionUpdate field mapping validated"
        return 0
    else
        test_failed "PermissionUpdate field mapping has issues"
        return 1
    fi
}

# =============================================================================
# Test: PERMISSION_UPDATE (grant)
# =============================================================================
test_permission_grant() {
    local path="profile/test-perm-$(date +%s)"
    local grantee="test-grantee-$(date +%s).testnet"
    
    log_test "PERMISSION_UPDATE (grant) - Granting write access to $grantee on $path"
    
    # SetPermission: level 2 = write
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 2}}}"
    
    local result=$(query_hasura '{ permissionUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation author targetId path level partitionId blockHeight blockTimestamp receiptId expiresAt } }')
    
    echo "Verifying PermissionUpdate fields for grant:"
    local entry=".data.permissionUpdates[0]"
    
    assert_field "$result" "$entry.operation" "grant" "operation = grant"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field_contains "$result" "$entry.targetId" "testnet" "targetId is valid account"
    assert_field_contains "$result" "$entry.path" "test-perm" "path contains test key"
    assert_field "$result" "$entry.level" "2" "level = 2 (write)"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "PERMISSION_UPDATE (grant) - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 0
    else
        test_failed "PERMISSION_UPDATE (grant) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: PERMISSION_UPDATE (revoke)
# =============================================================================
test_permission_revoke() {
    local path="profile/test-revoke-$(date +%s)"
    local grantee="revoke-test-$(date +%s).testnet"
    
    log_test "PERMISSION_UPDATE (revoke) - First grant, then revoke"
    
    # First grant (use call_and_wait to ensure it's indexed)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 2}}}"
    
    log_info "Permission granted, now revoking (level 0)..."
    
    # Then revoke (level 0 = no access)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 0}}}"
    
    local result=$(query_hasura '{ permissionUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation author targetId path level partitionId blockHeight blockTimestamp receiptId deleted } }')
    
    echo "Verifying PermissionUpdate fields for revoke:"
    local entry=".data.permissionUpdates[0]"
    
    assert_field "$result" "$entry.operation" "revoke" "operation = revoke"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field_contains "$result" "$entry.targetId" "revoke-test" "targetId matches"
    assert_field "$result" "$entry.level" "0" "level = 0 (revoked)"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "PERMISSION_UPDATE (revoke) - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 0
    else
        test_failed "PERMISSION_UPDATE (revoke) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: PERMISSION_UPDATE (grant_key)
# =============================================================================
test_permission_key_grant() {
    local path="profile/test-key-grant-$(date +%s)"
    # Use a sample ed25519 public key format
    local public_key="ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
    
    log_test "PERMISSION_UPDATE (grant_key) - Grant permission to public key"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_key_permission\", \"public_key\": \"$public_key\", \"path\": \"$path\", \"level\": 2}}}"
    
    local result=$(query_hasura '{ permissionUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation author targetId permissionKey path level partitionId blockHeight blockTimestamp receiptId expiresAt } }')
    
    echo "Verifying PermissionUpdate fields for key_grant:"
    local entry=".data.permissionUpdates[0]"
    local op=$(echo "$result" | jq -r "$entry.operation // \"\"")
    
    if [[ "$op" == "grant_key" ]] || [[ "$op" == "key_grant" ]]; then
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_exists "$result" "$entry.permissionKey" "permissionKey exists"
        assert_field_contains "$result" "$entry.path" "test-key-grant" "path matches"
        assert_field "$result" "$entry.level" "2" "level = 2 (write)"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
        
        test_passed "PERMISSION_UPDATE (grant_key) - fields validated (op=$op)"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 0
    else
        test_failed "PERMISSION_UPDATE (grant_key) - unexpected operation: $op"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 1
    fi
}

# =============================================================================
# Test: PERMISSION_UPDATE (revoke_key)
# =============================================================================
test_permission_key_revoke() {
    local path="profile/test-key-revoke-$(date +%s)"
    local public_key="ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
    
    log_test "PERMISSION_UPDATE (revoke_key) - First grant, then revoke from public key"
    
    # First grant
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_key_permission\", \"public_key\": \"$public_key\", \"path\": \"$path\", \"level\": 2}}}"
    
    log_info "Key permission granted, now revoking..."
    
    # Then revoke (level 0)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_key_permission\", \"public_key\": \"$public_key\", \"path\": \"$path\", \"level\": 0}}}"
    
    local result=$(query_hasura '{ permissionUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation author permissionKey path level blockHeight blockTimestamp receiptId deleted } }')
    
    echo "Verifying PermissionUpdate fields for key_revoke:"
    local entry=".data.permissionUpdates[0]"
    local op=$(echo "$result" | jq -r "$entry.operation // \"\"")
    
    if [[ "$op" == "revoke_key" ]] || [[ "$op" == "key_revoke" ]]; then
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_exists "$result" "$entry.permissionKey" "permissionKey exists"
        assert_field "$result" "$entry.level" "0" "level = 0 (revoked)"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        
        test_passed "PERMISSION_UPDATE (revoke_key) - fields validated (op=$op)"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 0
    else
        test_failed "PERMISSION_UPDATE (revoke_key) - unexpected operation: $op"
        return 1
    fi
}

# =============================================================================
# Test: Query PERMISSION_UPDATE operations by type
# =============================================================================
test_permission_breakdown() {
    log_test "PERMISSION_UPDATE breakdown by operation type"
    
    echo ""
    echo "Operations indexed:"
    
    for op in "grant" "revoke" "grant_key" "revoke_key"; do
        local result=$(query_hasura "{ permissionUpdates(where: {operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.permissionUpdates | length // 0')
        if [[ "$count" -gt 0 ]]; then
            echo -e "  ${GREEN}✓${NC} $op"
        else
            echo -e "  ${YELLOW}○${NC} $op (not indexed)"
        fi
    done
    
    test_passed "PERMISSION_UPDATE breakdown complete"
    return 0
}

# =============================================================================
# Show usage
# =============================================================================
show_usage() {
    echo "Usage: test_permission.sh [test_name|mode]"
    echo ""
    echo "Modes:"
    echo "  query      - Read-only tests (default, safe)"
    echo "  write      - Tests that write to contract"
    echo "  all        - Run all tests"
    echo ""
    echo "Individual tests:"
    echo "  validate   - Validate schema fields against existing data"
    echo "  grant      - Test PERMISSION_UPDATE (grant)"
    echo "  revoke     - Test PERMISSION_UPDATE (revoke)"
    echo "  key_grant  - Test PERMISSION_UPDATE (grant_key)"
    echo "  key_revoke - Test PERMISSION_UPDATE (revoke_key)"
    echo "  breakdown  - Show operations breakdown"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     OnSocial Hasura Indexer - PERMISSION_UPDATE Tests         ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Hasura:   $HASURA_URL"
echo "║  Contract: $CONTRACT"
echo "║  Signer:   $SIGNER"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

check_deps

case "${1:-query}" in
    query)
        test_permission_query
        test_permission_breakdown
        ;;
    write)
        test_permission_grant
        test_permission_revoke
        test_permission_key_grant
        test_permission_key_revoke
        ;;
    all)
        test_permission_query
        test_permission_validate_fields
        test_permission_grant
        test_permission_revoke
        test_permission_key_grant
        test_permission_key_revoke
        test_permission_breakdown
        ;;
    validate)
        test_permission_validate_fields
        ;;
    grant)
        test_permission_grant
        ;;
    revoke)
        test_permission_revoke
        ;;
    key_grant)
        test_permission_key_grant
        ;;
    key_revoke)
        test_permission_key_revoke
        ;;
    breakdown)
        test_permission_breakdown
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
