#!/bin/bash
# =============================================================================
# PERMISSION_UPDATE Event Tests
# Tests: grant, revoke operations
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

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
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ permissionUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author grantee path level partitionId blockHeight blockTimestamp receiptId } }')
    
    echo "Verifying PermissionUpdate fields for grant:"
    local entry=".data.permissionUpdates[0]"
    
    assert_field "$result" "$entry.operation" "grant" "operation = grant"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field_contains "$result" "$entry.grantee" "testnet" "grantee is valid account"
    assert_field_contains "$result" "$entry.path" "test-perm" "path contains test key"
    assert_field "$result" "$entry.level" "2" "level = 2 (write)"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "PERMISSION_UPDATE (grant) - all fields validated"
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
    
    # First grant
    call_contract "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 2}}}"
    # No arbitrary wait - call_and_wait handles sync
    
    log_info "Permission granted, now revoking (level 0)..."
    
    # Then revoke (level 0 = no access)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 0}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ permissionUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author grantee path level partitionId blockHeight blockTimestamp receiptId } }')
    
    echo "Verifying PermissionUpdate fields for revoke:"
    local entry=".data.permissionUpdates[0]"
    
    assert_field "$result" "$entry.operation" "revoke" "operation = revoke"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field_contains "$result" "$entry.grantee" "revoke-test" "grantee matches"
    assert_field "$result" "$entry.level" "0" "level = 0 (revoked)"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "PERMISSION_UPDATE (revoke) - all fields validated"
        return 0
    else
        test_failed "PERMISSION_UPDATE (revoke) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: PERMISSION_UPDATE (key_grant) - Grant permission to a public key
# =============================================================================
test_permission_key_grant() {
    local path="profile/test-key-grant-$(date +%s)"
    # Use a sample ed25519 public key format
    local public_key="ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
    
    log_test "PERMISSION_UPDATE (key_grant) - Grant permission to public key"
    
    # Grant write permission (level 2) to a public key
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_key_permission\", \"public_key\": \"$public_key\", \"path\": \"$path\", \"level\": 2}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ permissionUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author grantee publicKey path level partitionId blockHeight blockTimestamp receiptId expiresAt deleted } }')
    
    echo "Verifying PermissionUpdate fields for key_grant:"
    local entry=".data.permissionUpdates[0]"
    local op=$(echo "$result" | jq -r "$entry.operation // \"\"")
    
    # Accept grant_key operation (contract emits "grant_key")
    if [[ "$op" == "grant_key" ]] || [[ "$op" == "key_grant" ]]; then
        # Core fields
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_exists "$result" "$entry.publicKey" "publicKey exists"
        assert_field_contains "$result" "$entry.path" "test-key-grant" "path matches"
        assert_field "$result" "$entry.level" "2" "level = 2 (write)"
        
        # Block/receipt fields
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
        
        # Optional fields
        assert_field_exists "$result" "$entry.partitionId" "partitionId exists"
        
        test_passed "PERMISSION_UPDATE (key_grant) - fields validated (op=$op)"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 0
    else
        test_failed "PERMISSION_UPDATE (key_grant) - unexpected operation: $op"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 1
    fi
}

# =============================================================================
# Test: PERMISSION_UPDATE (key_revoke) - Revoke permission from a public key
# =============================================================================
test_permission_key_revoke() {
    local path="profile/test-key-revoke-$(date +%s)"
    # Use a sample ed25519 public key format
    local public_key="ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
    
    log_test "PERMISSION_UPDATE (key_revoke) - First grant, then revoke from public key"
    
    # First grant permission
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_key_permission\", \"public_key\": \"$public_key\", \"path\": \"$path\", \"level\": 2}}}"
    
    log_info "Key permission granted, now revoking..."
    
    # Revoke permission (level 0)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_key_permission\", \"public_key\": \"$public_key\", \"path\": \"$path\", \"level\": 0}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ permissionUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author grantee publicKey path level partitionId blockHeight blockTimestamp receiptId expiresAt deleted } }')
    
    echo "Verifying PermissionUpdate fields for key_revoke:"
    local entry=".data.permissionUpdates[0]"
    local op=$(echo "$result" | jq -r "$entry.operation // \"\"")
    
    # Accept revoke_key operation (contract emits "revoke_key")
    if [[ "$op" == "revoke_key" ]] || [[ "$op" == "key_revoke" ]]; then
        # Core fields
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_exists "$result" "$entry.publicKey" "publicKey exists"
        assert_field_contains "$result" "$entry.path" "test-key-revoke" "path matches"
        assert_field "$result" "$entry.level" "0" "level = 0 (revoked)"
        
        # Block/receipt fields
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
        
        # Revoke-specific fields
        assert_field "$result" "$entry.deleted" "true" "deleted = true (revoked)"
        assert_field_exists "$result" "$entry.partitionId" "partitionId exists"
        
        test_passed "PERMISSION_UPDATE (key_revoke) - fields validated (op=$op)"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 0
    else
        test_failed "PERMISSION_UPDATE (key_revoke) - unexpected operation: $op"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 1
    fi
}

# =============================================================================
# Test: PERMISSION_UPDATE (different levels)
# =============================================================================
test_permission_levels() {
    local path="profile/test-levels-$(date +%s)"
    local grantee="levels-test-$(date +%s).testnet"
    
    log_test "PERMISSION_UPDATE (levels) - Testing different permission levels"
    
    # Level 1 = read
    log_info "Setting level 1 (read)..."
    call_contract "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 1}}}"
    
    wait_for_indexing 15
    
    # Level 3 = admin
    log_info "Setting level 3 (admin)..."
    call_contract "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 3}}}"
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ permissionUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation grantee path level } }')
    
    if echo "$result" | jq -e '.data.permissionUpdates[0]' >/dev/null 2>&1; then
        test_passed "PERMISSION_UPDATE (levels) recorded"
        echo "$result" | jq '.data.permissionUpdates[:3]'
        return 0
    else
        test_failed "PERMISSION_UPDATE (levels) not found"
        return 1
    fi
}

# =============================================================================
# Test: Query existing PermissionUpdates
# =============================================================================
test_permission_query() {
    log_test "Query existing PermissionUpdates"
    
    local result=$(query_subgraph '{ permissionUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author grantee path level blockTimestamp } }')
    
    if echo "$result" | jq -e '.data.permissionUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.permissionUpdates | length')
        test_passed "Found $count PermissionUpdate entries"
        echo "$result" | jq '.data.permissionUpdates'
        return 0
    else
        log_warn "No PermissionUpdates found (may be normal if no permissions set)"
        return 0
    fi
}

# =============================================================================
# Test: Validate PermissionUpdate field mapping (no contract calls)
# =============================================================================
test_permission_validate_fields() {
    log_test "Validating PermissionUpdate field mapping against existing data"
    
    local result=$(query_subgraph '{ permissionUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author partitionId blockHeight blockTimestamp receiptId grantee publicKey path level permission expiresAt groupId permissionNonce deleted } }')
    
    if ! echo "$result" | jq -e '.data.permissionUpdates[0]' >/dev/null 2>&1; then
        test_failed "No PermissionUpdates found to validate"
        return 1
    fi
    
    echo "Validating ALL PermissionUpdate schema fields:"
    local entry=".data.permissionUpdates[0]"
    ASSERTIONS_FAILED=0
    
    # Core fields (required)
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field_exists "$result" "$entry.operation" "operation exists"
    assert_field_exists "$result" "$entry.author" "author exists"
    
    # Blockchain fields (required)
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
    
    # Permission-specific (required)
    assert_field_exists "$result" "$entry.grantee" "grantee exists"
    assert_field_exists "$result" "$entry.path" "path exists"
    
    # Optional fields (null is acceptable)
    echo ""
    echo "Optional fields (null is acceptable):"
    local partition=$(echo "$result" | jq -r "$entry.partitionId // \"null\"")
    local publicKey=$(echo "$result" | jq -r "$entry.publicKey // \"null\"")
    local level=$(echo "$result" | jq -r "$entry.level // \"null\"")
    local permission=$(echo "$result" | jq -r "$entry.permission // \"null\"")
    local expiresAt=$(echo "$result" | jq -r "$entry.expiresAt // \"null\"")
    local groupId=$(echo "$result" | jq -r "$entry.groupId // \"null\"")
    local permissionNonce=$(echo "$result" | jq -r "$entry.permissionNonce // \"null\"")
    local deleted=$(echo "$result" | jq -r "$entry.deleted // \"null\"")
    
    echo "  ○ partitionId = $partition"
    echo "  ○ publicKey = ${publicKey:0:40}"
    echo "  ○ level = $level"
    echo "  ○ permission = $permission"
    echo "  ○ expiresAt = $expiresAt"
    echo "  ○ groupId = $groupId"
    echo "  ○ permissionNonce = $permissionNonce"
    echo "  ○ deleted = $deleted"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "PermissionUpdate field mapping validated"
        return 0
    else
        test_failed "PermissionUpdate field mapping has errors"
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
    echo "  grant      - Test PERMISSION_UPDATE (grant)"
    echo "  revoke     - Test PERMISSION_UPDATE (revoke)"
    echo "  key_grant  - Test PERMISSION_UPDATE (key_grant)"
    echo "  key_revoke - Test PERMISSION_UPDATE (key_revoke)"
    echo "  levels     - Test different permission levels"
    echo "  query      - Query existing PermissionUpdates"
    echo "  validate   - Validate field mapping"
    echo "  all        - Run all tests"
}

main() {
    echo ""
    echo "=============================================="
    echo "  PERMISSION_UPDATE Event Tests"
    echo "=============================================="
    echo ""
    
    check_deps
    
    case "${1:-all}" in
        grant)      test_permission_grant ;;
        revoke)     test_permission_revoke ;;
        key_grant)  test_permission_key_grant ;;
        key_revoke) test_permission_key_revoke ;;
        levels)     test_permission_levels ;;
        query)      test_permission_query ;;
        validate)   test_permission_validate_fields ;;
        all)
            test_permission_query
            test_permission_validate_fields
            test_permission_grant
            test_permission_revoke
            test_permission_key_grant
            test_permission_key_revoke
            test_permission_levels
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
