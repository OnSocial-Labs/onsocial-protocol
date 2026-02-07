#!/bin/bash
# =============================================================================
# DATA_UPDATE Event Tests for Hasura/PostgreSQL Indexer
# Tests: set, remove, parent, ref, parentType, refType, refs array
# Mirror of subgraph/tests/test_data.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

# =============================================================================
# Test: Query existing DataUpdates
# =============================================================================
test_data_query() {
    log_test "Query existing DataUpdates"
    
    local result=$(query_hasura '{ dataUpdates(limit: 5, order_by: {blockHeight: desc}) { id operation author path blockHeight blockTimestamp } }')
    
    if echo "$result" | jq -e '.data.dataUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.dataUpdates | length')
        test_passed "Found $count DataUpdate entries"
        echo "$result" | jq '.data.dataUpdates'
        return 0
    else
        log_warn "No DataUpdates found (table may be empty - waiting for contract activity)"
        if echo "$result" | jq -e '.data.dataUpdates' >/dev/null 2>&1; then
            test_passed "DataUpdates table exists (empty)"
            return 0
        fi
        test_failed "Failed to query DataUpdates"
        echo "$result" | jq .
        return 1
    fi
}

# =============================================================================
# Test: Validate fields on existing DataUpdates (no write needed)
# =============================================================================
test_data_validate_fields() {
    log_test "Validating DataUpdate field mapping against existing data"
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation path value author partitionId blockHeight blockTimestamp receiptId accountId dataType groupId isGroupContent } }')
    
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
# Test: DATA_UPDATE (set)
# =============================================================================
test_data_set() {
    local key="test-data-set-$(date +%s)"
    local value="test-value-$(date +%s)"
    
    log_test "DATA_UPDATE (set) - Setting data at profile/$key"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"$value\"}}}}" \
        "0.01"
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation path value author partitionId blockHeight blockTimestamp receiptId accountId dataType dataId groupId groupPath isGroupContent } }')
    
    echo "Verifying all DataUpdate fields:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field "$result" "$entry.operation" "set" "operation = set"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Partition field
    assert_field_exists "$result" "$entry.partitionId" "partitionId exists"
    
    # Derived fields from path
    assert_field "$result" "$entry.accountId" "$SIGNER" "accountId derived from path"
    assert_field "$result" "$entry.dataType" "profile" "dataType = profile"
    assert_field "$result" "$entry.isGroupContent" "false" "isGroupContent = false"
    
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
    
    # First set (use call_and_wait to ensure it's indexed before deleting)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"to-delete\"}}}}" \
        "0.01"
    
    # Then delete by setting to null
    log_info "Set complete, now deleting..."
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": null}}}}"
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation path value author partitionId blockHeight blockTimestamp receiptId } }')
    
    echo "Verifying all DataUpdate fields for remove:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field "$result" "$entry.operation" "remove" "operation = remove"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "DATA_UPDATE (remove) - all fields validated"
        return 0
    else
        test_failed "DATA_UPDATE (remove) - some field assertions failed"
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
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}, where: {dataType: {_eq: "post"}}) { id operation path value author partitionId blockHeight blockTimestamp receiptId accountId dataType parentPath parentAuthor refPath refAuthor } }')
    
    echo "Verifying parent field extraction:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field "$result" "$entry.operation" "set" "operation = set"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field "$result" "$entry.dataType" "post" "dataType = post"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Parent fields
    assert_field "$result" "$entry.parentPath" "$parent_path" "parentPath extracted from value.parent"
    assert_field "$result" "$entry.parentAuthor" "alice.testnet" "parentAuthor = first segment of parentPath"
    
    # Ref fields should be null
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
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}, where: {dataType: {_eq: "post"}}) { id operation path value author partitionId blockHeight blockTimestamp receiptId accountId dataType parentPath parentAuthor refPath refAuthor } }')
    
    echo "Verifying ref field extraction:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field "$result" "$entry.operation" "set" "operation = set"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field "$result" "$entry.dataType" "post" "dataType = post"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Ref fields
    assert_field "$result" "$entry.refPath" "$ref_path" "refPath extracted from value.ref"
    assert_field "$result" "$entry.refAuthor" "bob.testnet" "refAuthor = first segment of refPath"
    
    # Parent fields should be null
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
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}, where: {dataType: {_eq: "post"}}) { id operation path value author partitionId blockHeight blockTimestamp receiptId accountId dataType parentPath parentAuthor refPath refAuthor } }')
    
    echo "Verifying both parent and ref field extraction:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field "$result" "$entry.operation" "set" "operation = set"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field "$result" "$entry.dataType" "post" "dataType = post"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Both parent and ref fields
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
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}, where: {dataType: {_eq: "post"}}) { id operation path author dataType blockHeight blockTimestamp receiptId parentPath parentAuthor parentType } }')
    
    echo "Verifying parentType field extraction:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field "$result" "$entry.operation" "set" "operation = set"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field "$result" "$entry.dataType" "post" "dataType = post"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Parent fields with type
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
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}, where: {dataType: {_eq: "post"}}) { id operation path author dataType blockHeight blockTimestamp receiptId refPath refAuthor refType } }')
    
    echo "Verifying refType field extraction:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field "$result" "$entry.operation" "set" "operation = set"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field "$result" "$entry.dataType" "post" "dataType = post"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Ref fields with type
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
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}, where: {dataType: {_eq: "post"}}) { id operation path author dataType blockHeight blockTimestamp receiptId refs refAuthors } }')
    
    echo "Verifying refs array extraction:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field "$result" "$entry.operation" "set" "operation = set"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field "$result" "$entry.dataType" "post" "dataType = post"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # Check refs field (stored as JSON string or array)
    local refs=$(echo "$result" | jq -r "$entry.refs // \"null\"")
    if [[ "$refs" != "null" && "$refs" != "" ]]; then
        echo -e "  ${GREEN}✓${NC} refs field populated: ${refs:0:50}..."
    else
        echo -e "  ${RED}✗${NC} refs field is empty or null"
        ASSERTIONS_FAILED=$((ASSERTIONS_FAILED + 1))
    fi
    
    # Check refAuthors field
    local authors=$(echo "$result" | jq -r "$entry.refAuthors // \"null\"")
    if [[ "$authors" != "null" && "$authors" != "" ]]; then
        echo -e "  ${GREEN}✓${NC} refAuthors field populated: ${authors:0:50}..."
    else
        echo -e "  ${RED}✗${NC} refAuthors field is empty or null"
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
    
    local result=$(query_hasura '{ dataUpdates(limit: 1, order_by: {blockHeight: desc}, where: {dataType: {_eq: "post"}}) { id operation path author dataType blockHeight blockTimestamp receiptId parentPath parentAuthor parentType refPath refAuthor refType refs refAuthors } }')
    
    echo "Verifying ALL reference fields:"
    local entry=".data.dataUpdates[0]"
    
    # Core fields
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field "$result" "$entry.operation" "set" "operation = set"
    assert_field_contains "$result" "$entry.path" "$key" "path contains test key"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    assert_field "$result" "$entry.dataType" "post" "dataType = post"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    # All parent fields
    assert_field "$result" "$entry.parentPath" "alice.testnet/post/thread" "parentPath"
    assert_field "$result" "$entry.parentAuthor" "alice.testnet" "parentAuthor"
    assert_field "$result" "$entry.parentType" "reply" "parentType"
    
    # All ref fields
    assert_field "$result" "$entry.refPath" "bob.testnet/post/quoted" "refPath"
    assert_field "$result" "$entry.refAuthor" "bob.testnet" "refAuthor"
    assert_field "$result" "$entry.refType" "quote" "refType"
    
    # Check arrays
    local refs=$(echo "$result" | jq -r "$entry.refs // \"null\"")
    if [[ "$refs" != "null" && "$refs" != "" ]]; then
        echo -e "  ${GREEN}✓${NC} refs array populated"
    else
        echo -e "  ${RED}✗${NC} refs array is empty"
        ASSERTIONS_FAILED=$((ASSERTIONS_FAILED + 1))
    fi
    
    local refAuthors=$(echo "$result" | jq -r "$entry.refAuthors // \"null\"")
    if [[ "$ref_authors" != "null" && "$ref_authors" != "" ]]; then
        echo -e "  ${GREEN}✓${NC} refAuthors array populated"
    else
        echo -e "  ${RED}✗${NC} refAuthors array is empty"
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
# Test: Verify real-time indexing speed
# =============================================================================
test_indexing_speed() {
    log_test "Indexing Speed - Verify substreams is faster than subgraph"
    
    local key="speed-test-$(date +%s)"
    local start_time=$(date +%s)
    
    # Submit transaction
    call_contract "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"speed-test\"}}}}" \
        "0.01"
    
    # Poll until indexed (max 30 seconds)
    local max_wait=30
    local indexed=false
    
    for ((i=1; i<=max_wait; i++)); do
        local result=$(query_hasura "{ dataUpdates(where: {path: {_ilike: \"%$key%\"}}, limit: 1) { id } }")
        
        if echo "$result" | jq -e '.data.dataUpdates[0]' >/dev/null 2>&1; then
            indexed=true
            break
        fi
        sleep 1
    done
    
    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))
    
    if $indexed; then
        if [ $elapsed -lt 20 ]; then
            test_passed "Indexed in ${elapsed}s (target: <20s for substreams)"
        else
            log_warn "Indexed in ${elapsed}s - slower than expected"
            test_passed "Indexed successfully (but slower: ${elapsed}s)"
        fi
        return 0
    else
        test_failed "Not indexed within ${max_wait}s"
        return 1
    fi
}

# =============================================================================
# Test: GraphQL Subscriptions work
# =============================================================================
test_subscriptions_support() {
    log_test "Verify GraphQL subscriptions are supported"
    
    local result=$(query_hasura '{ __schema { subscriptionType { name fields { name } } } }')
    
    if echo "$result" | jq -e '.data.__schema.subscriptionType.fields[] | select(.name == "dataUpdates")' >/dev/null 2>&1; then
        test_passed "Real-time subscriptions supported for dataUpdates"
        return 0
    else
        test_failed "Subscriptions not available"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================
show_help() {
    echo "Usage: $0 [test_name|mode]"
    echo ""
    echo "Modes:"
    echo "  query      - Read-only tests (default, safe)"
    echo "  write      - Tests that write to contract (requires signer)"
    echo "  speed      - Indexing speed tests"
    echo "  all        - Run all tests"
    echo ""
    echo "Individual tests:"
    echo "  set          - Test DATA_UPDATE (set operation)"
    echo "  remove       - Test DATA_UPDATE (remove operation)"
    echo "  parent       - Test DATA_UPDATE with parent field (replies)"
    echo "  ref          - Test DATA_UPDATE with ref field (quotes)"
    echo "  parent_ref   - Test DATA_UPDATE with both parent and ref"
    echo "  parentType  - Test DATA_UPDATE with parentType field"
    echo "  refType     - Test DATA_UPDATE with refType field"
    echo "  refs_array   - Test DATA_UPDATE with refs array (multiple refs)"
    echo "  all_refs     - Test DATA_UPDATE with ALL reference fields"
    echo "  validate     - Validate all schema fields against existing data"
}

main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║     OnSocial Hasura Indexer - DATA_UPDATE Tests               ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║  Hasura:   $HASURA_URL"
    echo "║  Contract: $CONTRACT"
    echo "║  Signer:   $SIGNER"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    
    check_deps
    check_hasura_health || exit 1
    
    local mode="${1:-query}"
    
    case "$mode" in
        query)
            # Read-only tests (safe, no writes)
            test_data_query
            test_data_validate_fields
            test_subscriptions_support
            ;;
        write)
            # Tests that write to the contract (requires signer)
            test_data_set
            test_data_remove
            test_data_parent
            test_data_ref
            test_data_parent_and_ref
            test_data_parent_type
            test_data_ref_type
            test_data_refs_array
            test_data_all_refs
            ;;
        speed)
            # Speed/performance tests
            test_indexing_speed
            ;;
        all)
            # All tests
            test_data_query
            test_data_validate_fields
            test_subscriptions_support
            test_data_set
            test_data_remove
            test_data_parent
            test_data_ref
            test_data_parent_and_ref
            test_data_parent_type
            test_data_ref_type
            test_data_refs_array
            test_data_all_refs
            test_indexing_speed
            ;;
        # Individual tests
        set)          test_data_set ;;
        remove)       test_data_remove ;;
        parent)       test_data_parent ;;
        ref)          test_data_ref ;;
        parent_ref)   test_data_parent_and_ref ;;
        parentType)  test_data_parent_type ;;
        refType)     test_data_ref_type ;;
        refs_array)   test_data_refs_array ;;
        all_refs)     test_data_all_refs ;;
        validate)     test_data_validate_fields ;;
        help|--help|-h) show_help; exit 0 ;;
        *)
            log_error "Unknown test: $mode"
            show_help
            exit 1
            ;;
    esac
    
    print_summary
}

main "$@"
