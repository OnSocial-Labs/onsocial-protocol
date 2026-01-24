#!/bin/bash
# =============================================================================
# DATA_UPDATE Event Tests
# Tests: set, remove operations
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# =============================================================================
# Test: DATA_UPDATE (set)
# =============================================================================
test_data_set() {
    local key="test-data-set-$(date +%s)"
    local value="test-value-$(date +%s)"
    
    log_test "DATA_UPDATE (set) - Setting data at profile/$key"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"$value\"}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation path value author partitionId blockHeight blockTimestamp receiptId accountId dataType dataId groupId groupPath isGroupContent } }')
    
    echo "Verifying all DataUpdate fields:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field_id "$result" "$entry.id" "id is valid format"
    assert_field "$result" "$entry.operation" "set" "operation = set"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
    
    # Partition field
    assert_field_exists "$result" "$entry.partitionId" "partitionId exists"
    
    # Derived fields from path
    assert_field "$result" "$entry.accountId" "$SIGNER" "accountId derived from path"
    assert_field "$result" "$entry.dataType" "profile" "dataType = profile"
    assert_field "$result" "$entry.isGroupContent" "false" "isGroupContent = false (not group data)"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE (set) - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        test_failed "DATA_UPDATE (set) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: DATA_UPDATE (remove/delete)
# =============================================================================
test_data_remove() {
    local key="test-data-remove-$(date +%s)"
    
    log_test "DATA_UPDATE (remove) - First set, then delete"
    
    # First set
    call_contract "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"to-delete\"}}}}" \
        "0.01"
    # No arbitrary wait - call_and_wait handles sync
    
    # Then delete by setting to null
    log_info "Set complete, now deleting..."
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": null}}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation path value author partitionId blockHeight blockTimestamp receiptId } }')
    
    echo "Verifying all DataUpdate fields for remove:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field "$result" "$entry.operation" "remove" "operation = remove"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE (remove) - all fields validated"
        return 0
    else
        test_failed "DATA_UPDATE (remove) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: Query existing DataUpdates
# =============================================================================
test_data_query() {
    log_test "Query existing DataUpdates"
    
    local result=$(query_subgraph '{ dataUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author path blockTimestamp } }')
    
    if echo "$result" | jq -e '.data.dataUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.dataUpdates | length')
        test_passed "Found $count DataUpdate entries"
        echo "$result" | jq '.data.dataUpdates'
        return 0
    else
        test_failed "No DataUpdates found"
        return 1
    fi
}

# =============================================================================
# Test: Validate fields on existing DataUpdates (no write needed)
# =============================================================================
test_data_validate_fields() {
    log_test "Validating DataUpdate field mapping against existing data"
    
    # Query only fields that exist in schema
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation path value author partitionId blockHeight blockTimestamp receiptId accountId dataType groupId isGroupContent } }')
    
    if ! echo "$result" | jq -e '.data.dataUpdates[0]' >/dev/null 2>&1; then
        log_warn "No DataUpdates found to validate"
        echo "Raw response:"
        echo "$result" | jq .
        return 0
    fi
    
    echo "Validating ALL DataUpdate schema fields:"
    local entry=".data.dataUpdates[0]"
    
    # Required fields (must exist and be valid)
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field_exists "$result" "$entry.operation" "operation exists"
    assert_field_exists "$result" "$entry.author" "author exists"
    assert_field_exists "$result" "$entry.path" "path exists"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    assert_field_exists "$result" "$entry.accountId" "accountId derived from path"
    
    # Optional fields (just verify they're queryable, may be null)
    echo ""
    echo "Optional fields (null is acceptable):"
    local partition=$(echo "$result" | jq -r "$entry.partitionId // \"null\"")
    echo -e "  ${BLUE}○${NC} partitionId = $partition"
    local value=$(echo "$result" | jq -r "$entry.value // \"null\"")
    echo -e "  ${BLUE}○${NC} value = ${value:0:50}..."
    local groupId=$(echo "$result" | jq -r "$entry.groupId // \"null\"")
    echo -e "  ${BLUE}○${NC} groupId = $groupId"
    local isGroupContent=$(echo "$result" | jq -r "$entry.isGroupContent // \"null\"")
    echo -e "  ${BLUE}○${NC} isGroupContent = $isGroupContent"
    local dataType=$(echo "$result" | jq -r "$entry.dataType // \"null\"")
    echo -e "  ${BLUE}○${NC} dataType = $dataType"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DataUpdate field mapping validated"
        return 0
    else
        test_failed "DataUpdate field mapping has issues"
        return 1
    fi
}

# =============================================================================
# Test: DATA_UPDATE with parent field (replies/threading)
# =============================================================================
test_data_parent() {
    local key="reply-test-$(date +%s)"
    local parent_path="alice.testnet/post/original-post-123"
    
    log_test "DATA_UPDATE with parent field (reply/thread)"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"post/$key\": {\"text\": \"This is a reply!\", \"parent\": \"$parent_path\"}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {dataType: "post"}) { id path author dataType parentPath parentAuthor refPath refAuthor } }')
    
    echo "Verifying parent field extraction:"
    local entry=".data.dataUpdates[0]"
    
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.parentPath" "$parent_path" "parentPath extracted from value.parent"
    assert_field "$result" "$entry.parentAuthor" "alice.testnet" "parentAuthor = first segment of parentPath"
    assert_field_null "$result" "$entry.refPath" "refPath is null (no ref)"
    assert_field_null "$result" "$entry.refAuthor" "refAuthor is null (no ref)"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE with parent - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        test_failed "DATA_UPDATE with parent - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: DATA_UPDATE with ref field (quotes/citations)
# =============================================================================
test_data_ref() {
    local key="quote-test-$(date +%s)"
    local ref_path="bob.testnet/post/awesome-post-456"
    
    log_test "DATA_UPDATE with ref field (quote/citation)"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"post/$key\": {\"text\": \"Quoting this great post!\", \"ref\": \"$ref_path\"}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {dataType: "post"}) { id path author dataType parentPath parentAuthor refPath refAuthor } }')
    
    echo "Verifying ref field extraction:"
    local entry=".data.dataUpdates[0]"
    
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.refPath" "$ref_path" "refPath extracted from value.ref"
    assert_field "$result" "$entry.refAuthor" "bob.testnet" "refAuthor = first segment of refPath"
    assert_field_null "$result" "$entry.parentPath" "parentPath is null (no parent)"
    assert_field_null "$result" "$entry.parentAuthor" "parentAuthor is null (no parent)"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE with ref - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        test_failed "DATA_UPDATE with ref - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: DATA_UPDATE with both parent and ref (reply that quotes)
# =============================================================================
test_data_parent_and_ref() {
    local key="combined-test-$(date +%s)"
    local parent_path="alice.testnet/post/original-post-123"
    local ref_path="bob.testnet/post/awesome-post-456"
    
    log_test "DATA_UPDATE with both parent AND ref fields"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"post/$key\": {\"text\": \"Replying to Alice while quoting Bob!\", \"parent\": \"$parent_path\", \"ref\": \"$ref_path\"}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {dataType: "post"}) { id path author dataType parentPath parentAuthor refPath refAuthor } }')
    
    echo "Verifying both parent and ref field extraction:"
    local entry=".data.dataUpdates[0]"
    
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.parentPath" "$parent_path" "parentPath extracted"
    assert_field "$result" "$entry.parentAuthor" "alice.testnet" "parentAuthor extracted"
    assert_field "$result" "$entry.refPath" "$ref_path" "refPath extracted"
    assert_field "$result" "$entry.refAuthor" "bob.testnet" "refAuthor extracted"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE with parent and ref - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        test_failed "DATA_UPDATE with parent and ref - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: DATA_UPDATE with parentType (typed hierarchical reference)
# =============================================================================
test_data_parent_type() {
    local key="typed-reply-$(date +%s)"
    local parent_path="alice.testnet/post/thread-start"
    
    log_test "DATA_UPDATE with parentType field"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"post/$key\": {\"text\": \"A typed reply\", \"parent\": \"$parent_path\", \"parentType\": \"reply\"}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {dataType: "post"}) { path parentPath parentAuthor parentType } }')
    
    echo "Verifying parentType field extraction:"
    local entry=".data.dataUpdates[0]"
    
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.parentPath" "$parent_path" "parentPath extracted"
    assert_field "$result" "$entry.parentAuthor" "alice.testnet" "parentAuthor extracted"
    assert_field "$result" "$entry.parentType" "reply" "parentType = reply"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE with parentType - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        test_failed "DATA_UPDATE with parentType - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: DATA_UPDATE with refType (typed lateral reference)
# =============================================================================
test_data_ref_type() {
    local key="typed-quote-$(date +%s)"
    local ref_path="bob.testnet/post/quotable"
    
    log_test "DATA_UPDATE with refType field"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"post/$key\": {\"text\": \"A typed quote\", \"ref\": \"$ref_path\", \"refType\": \"quote\"}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {dataType: "post"}) { path refPath refAuthor refType } }')
    
    echo "Verifying refType field extraction:"
    local entry=".data.dataUpdates[0]"
    
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.refPath" "$ref_path" "refPath extracted"
    assert_field "$result" "$entry.refAuthor" "bob.testnet" "refAuthor extracted"
    assert_field "$result" "$entry.refType" "quote" "refType = quote"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE with refType - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        test_failed "DATA_UPDATE with refType - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: DATA_UPDATE with refs array (multiple lateral references)
# =============================================================================
test_data_refs_array() {
    local key="multi-ref-$(date +%s)"
    
    log_test "DATA_UPDATE with refs array (multiple references)"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"post/$key\": {\"text\": \"Referencing multiple posts\", \"refs\": [\"alice.testnet/post/1\", \"bob.testnet/post/2\", \"carol.testnet/post/3\"]}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {dataType: "post"}) { path refs refAuthors } }')
    
    echo "Verifying refs array extraction:"
    local entry=".data.dataUpdates[0]"
    
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    
    # Check refs array length
    local refs_count=$(echo "$result" | jq -r "$entry.refs | length")
    if [[ "$refs_count" == "3" ]]; then
        echo -e "  ${GREEN}✓${NC} refs array has 3 items"
    else
        echo -e "  ${RED}✗${NC} refs array should have 3 items, got $refs_count"
        ASSERTIONS_FAILED=$((ASSERTIONS_FAILED + 1))
    fi
    
    # Check refAuthors array length
    local authors_count=$(echo "$result" | jq -r "$entry.refAuthors | length")
    if [[ "$authors_count" == "3" ]]; then
        echo -e "  ${GREEN}✓${NC} refAuthors array has 3 items"
    else
        echo -e "  ${RED}✗${NC} refAuthors array should have 3 items, got $authors_count"
        ASSERTIONS_FAILED=$((ASSERTIONS_FAILED + 1))
    fi
    
    # Check specific values
    local ref1=$(echo "$result" | jq -r "$entry.refs[0]")
    local author1=$(echo "$result" | jq -r "$entry.refAuthors[0]")
    if [[ "$ref1" == "alice.testnet/post/1" && "$author1" == "alice.testnet" ]]; then
        echo -e "  ${GREEN}✓${NC} refs[0] = alice.testnet/post/1, refAuthors[0] = alice.testnet"
    else
        echo -e "  ${RED}✗${NC} refs[0] or refAuthors[0] incorrect"
        ASSERTIONS_FAILED=$((ASSERTIONS_FAILED + 1))
    fi
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE with refs array - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        test_failed "DATA_UPDATE with refs array - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: DATA_UPDATE with ALL reference fields (comprehensive test)
# =============================================================================
test_data_all_refs() {
    local key="full-refs-$(date +%s)"
    
    log_test "DATA_UPDATE with ALL reference fields"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"post/$key\": {\"text\": \"Complete reference test\", \"parent\": \"alice.testnet/post/thread\", \"parentType\": \"reply\", \"ref\": \"bob.testnet/post/quoted\", \"refType\": \"quote\", \"refs\": [\"carol.testnet/post/1\", \"dave.testnet/post/2\"]}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {dataType: "post"}) { path parentPath parentAuthor parentType refPath refAuthor refType refs refAuthors } }')
    
    echo "Verifying ALL reference fields:"
    local entry=".data.dataUpdates[0]"
    
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.parentPath" "alice.testnet/post/thread" "parentPath"
    assert_field "$result" "$entry.parentAuthor" "alice.testnet" "parentAuthor"
    assert_field "$result" "$entry.parentType" "reply" "parentType"
    assert_field "$result" "$entry.refPath" "bob.testnet/post/quoted" "refPath"
    assert_field "$result" "$entry.refAuthor" "bob.testnet" "refAuthor"
    assert_field "$result" "$entry.refType" "quote" "refType"
    
    # Check arrays
    local refs_count=$(echo "$result" | jq -r "$entry.refs | length")
    if [[ "$refs_count" == "2" ]]; then
        echo -e "  ${GREEN}✓${NC} refs array has 2 items"
    else
        echo -e "  ${RED}✗${NC} refs array should have 2 items"
        ASSERTIONS_FAILED=$((ASSERTIONS_FAILED + 1))
    fi
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE with ALL refs - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        test_failed "DATA_UPDATE with ALL refs - some field assertions failed"
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
    echo "  set          - Test DATA_UPDATE (set operation)"
    echo "  remove       - Test DATA_UPDATE (remove operation)"
    echo "  parent       - Test DATA_UPDATE with parent field (replies)"
    echo "  ref          - Test DATA_UPDATE with ref field (quotes)"
    echo "  parent_ref   - Test DATA_UPDATE with both parent and ref"
    echo "  parent_type  - Test DATA_UPDATE with parentType field"
    echo "  ref_type     - Test DATA_UPDATE with refType field"
    echo "  refs_array   - Test DATA_UPDATE with refs array (multiple refs)"
    echo "  all_refs     - Test DATA_UPDATE with ALL reference fields"
    echo "  query        - Query existing DataUpdates"
    echo "  validate     - Validate all schema fields against existing data"
    echo "  all          - Run all tests"
}

main() {
    echo ""
    echo "=============================================="
    echo "  DATA_UPDATE Event Tests"
    echo "=============================================="
    echo ""
    
    check_deps
    
    case "${1:-all}" in
        set)          test_data_set ;;
        remove)       test_data_remove ;;
        parent)       test_data_parent ;;
        ref)          test_data_ref ;;
        parent_ref)   test_data_parent_and_ref ;;
        parent_type)  test_data_parent_type ;;
        ref_type)     test_data_ref_type ;;
        refs_array)   test_data_refs_array ;;
        all_refs)     test_data_all_refs ;;
        query)        test_data_query ;;
        validate)     test_data_validate_fields ;;
        all)
            test_data_query
            test_data_validate_fields
            test_data_set
            test_data_remove
            test_data_parent
            test_data_ref
            test_data_parent_and_ref
            test_data_parent_type
            test_data_ref_type
            test_data_refs_array
            test_data_all_refs
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
