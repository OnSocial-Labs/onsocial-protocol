#!/bin/bash
# =============================================================================
# GROUP_UPDATE Event Tests for Hasura/PostgreSQL Indexer
# Tests: group_created, member_added, member_removed, proposal_created, vote_cast
# Mirror of subgraph/tests/test_group.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

# =============================================================================
# Test: Query existing GroupUpdates
# =============================================================================
test_group_query() {
    log_test "Query existing GroupUpdates"
    
    local result=$(query_hasura '{ groupUpdates(limit: 5, order_by: {blockHeight: desc}) { id operation groupId author blockHeight } }')
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.groupUpdates | length')
        test_passed "Found $count GroupUpdate entries"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    else
        log_warn "No GroupUpdates found (table may be empty)"
        test_passed "GroupUpdates table queryable"
        return 0
    fi
}

# =============================================================================
# Test: Validate fields on existing GroupUpdates
# =============================================================================
test_group_validate_fields() {
    log_test "Validating GroupUpdate field mapping against existing data"
    
    local result=$(query_hasura '{ groupUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation groupId author memberId role proposalId proposalType partitionId blockHeight blockTimestamp receiptId } }')
    
    if ! echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        log_warn "No GroupUpdates found to validate"
        return 0
    fi
    
    echo "Validating GroupUpdate schema fields:"
    local entry=".data.groupUpdates[0]"
    
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
    local groupId=$(echo "$result" | jq -r "$entry.groupId // \"null\"")
    echo -e "  ${BLUE}○${NC} groupId = $groupId"
    local memberId=$(echo "$result" | jq -r "$entry.memberId // \"null\"")
    echo -e "  ${BLUE}○${NC} memberId = $memberId"
    local role=$(echo "$result" | jq -r "$entry.role // \"null\"")
    echo -e "  ${BLUE}○${NC} role = $role"
    local proposalId=$(echo "$result" | jq -r "$entry.proposalId // \"null\"")
    echo -e "  ${BLUE}○${NC} proposalId = $proposalId"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "GroupUpdate field mapping validated"
        return 0
    else
        test_failed "GroupUpdate field mapping has issues"
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (group_created)
# =============================================================================
test_group_create() {
    local group_id="test-group-$(date +%s)"
    
    log_test "GROUP_UPDATE (group_created) - Creating $group_id"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {}}}}" \
        "0.1"
    
    local result=$(query_hasura '{ groupUpdates(limit: 5, order_by: {blockHeight: desc}) { id operation groupId author partitionId blockHeight blockTimestamp receiptId memberId role level } }')
    
    echo "Verifying GroupUpdate fields for group_created:"
    
    # Find the group_created event
    local create_idx=0
    for i in 0 1 2 3 4; do
        local op=$(echo "$result" | jq -r ".data.groupUpdates[$i].operation // \"\"")
        if [[ "$op" == "create_group" ]]; then
            create_idx=$i
            break
        fi
    done
    
    local entry=".data.groupUpdates[$create_idx]"
    
    # Core fields
    assert_field "$result" "$entry.operation" "create_group" "operation = create_group"
    assert_field "$result" "$entry.groupId" "$group_id" "groupId matches"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    assert_field_exists "$result" "$entry.partitionId" "partitionId exists"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "GROUP_UPDATE (group_created) - all fields validated"
        export TEST_GROUP_ID="$group_id"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq ".data.groupUpdates[$create_idx]"
        return 0
    else
        test_failed "GROUP_UPDATE (group_created) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (member_added)
# =============================================================================
test_group_add_member() {
    local group_id="${TEST_GROUP_ID:-test-subgraph-group}"
    local member="test-member-$(date +%s).testnet"
    
    log_test "GROUP_UPDATE (member_added) - Adding $member to $group_id"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$member\"}}}"
    
    local result=$(query_hasura '{ groupUpdates(limit: 1, order_by: {blockHeight: desc}) { id operation groupId memberId author role blockHeight blockTimestamp receiptId partitionId } }')
    
    echo "Verifying GroupUpdate fields for member_added:"
    local entry=".data.groupUpdates[0]"
    
    # Core fields
    assert_field "$result" "$entry.operation" "add_member" "operation = add_member"
    assert_field "$result" "$entry.groupId" "$group_id" "groupId matches"
    assert_field_contains "$result" "$entry.memberId" "testnet" "memberId is valid account"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "GROUP_UPDATE (member_added) - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        test_failed "GROUP_UPDATE (member_added) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (member_removed)
# =============================================================================
test_group_remove_member() {
    local group_id="${TEST_GROUP_ID:-test-subgraph-group}"
    local member="temp-member-$(date +%s).testnet"
    
    log_test "GROUP_UPDATE (member_removed) - First add, then remove $member"
    
    # First add a member
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$member\"}}}"
    
    log_info "Member added, now removing..."
    
    # Then remove them
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"remove_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$member\"}}}"
    
    local result=$(query_hasura '{ groupUpdates(limit: 3, order_by: {blockHeight: desc}) { id operation groupId memberId } }')
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "remove_member" ]]; then
        test_passed "GROUP_UPDATE (remove_member) indexed successfully"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        test_failed "GROUP_UPDATE (remove_member) not found"
        echo "Latest operations:"
        echo "$result" | jq '.data.groupUpdates'
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (proposal_created)
# =============================================================================
test_group_proposal_create() {
    local group_id="proposal-group-$(date +%s)"
    
    log_test "GROUP_UPDATE (proposal_created) - Creating custom proposal"
    
    # Create group with member_driven: true to allow proposals
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {\"member_driven\": true}}}}" \
        "0.1"
    
    log_info "Group created, creating proposal..."
    
    # Create a custom_proposal
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_proposal\", \"group_id\": \"$group_id\", \"proposal_type\": \"custom_proposal\", \"changes\": {\"title\": \"Test Proposal\", \"description\": \"Testing indexing\", \"custom_data\": {}}, \"auto_vote\": true}}}" \
        "0.1"
    
    local result=$(query_hasura "{ groupUpdates(where: {operation: {_eq: \"proposal_created\"}, groupId: {_eq: \"$group_id\"}}, limit: 1, order_by: {blockHeight: desc}) { id operation groupId proposalId proposalType author blockHeight blockTimestamp receiptId } }")
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "proposal_created" ]]; then
        echo "Verifying proposal_created fields:"
        local entry=".data.groupUpdates[0]"
        assert_field "$result" "$entry.groupId" "$group_id" "groupId matches"
        assert_field "$result" "$entry.proposalType" "custom_proposal" "proposalType = custom_proposal"
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
        
        test_passed "GROUP_UPDATE (proposal_created) - all fields validated"
        export TEST_PROPOSAL_GROUP_ID="$group_id"
        export LAST_PROPOSAL_ID=$(echo "$result" | jq -r '.data.groupUpdates[0].proposalId // ""')
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        test_failed "GROUP_UPDATE (proposal_created) not found"
        echo "Query result:"
        echo "$result" | jq '.data'
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (vote_cast)
# =============================================================================
test_group_vote() {
    local group_id="${TEST_PROPOSAL_GROUP_ID:-}"
    local proposal_id="${LAST_PROPOSAL_ID:-}"
    
    log_test "GROUP_UPDATE (vote_cast)"
    
    if [ -z "$proposal_id" ]; then
        log_warn "No proposal ID available, skipping vote test"
        log_info "Run test_group_proposal_create first to create a proposal"
        return 0
    fi
    
    # Query existing vote_cast operations
    local result=$(query_hasura "{ groupUpdates(where: {operation: {_eq: \"vote_cast\"}}, limit: 1, order_by: {blockHeight: desc}) { id operation groupId proposalId voter approve blockHeight } }")
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        test_passed "Found existing vote_cast operations"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        log_info "No vote_cast operations found (need separate voter account)"
        return 0
    fi
}

# =============================================================================
# Test: Query GROUP_UPDATE operations by type
# =============================================================================
test_group_breakdown() {
    log_test "GROUP_UPDATE breakdown by operation type"
    
    echo ""
    echo "Operations indexed:"
    
    for op in "create_group" "add_member" "remove_member" "member_nonce_updated" "stats_updated" "transfer_ownership" "privacy_changed" "permission_changed" "group_pool_created" "group_pool_deposit" "group_sponsor_quota_set" "group_sponsor_default_set" "join_request_submitted" "join_request_approved" "join_request_rejected" "join_request_cancelled" "add_to_blacklist" "remove_from_blacklist" "member_invited" "proposal_created" "vote_cast" "proposal_status_updated" "group_updated" "voting_config_changed" "custom_proposal_executed" "path_permission_granted" "path_permission_revoked" "create" "update" "delete"; do
        local result=$(query_hasura "{ groupUpdates(where: {operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.groupUpdates | length // 0')
        if [[ "$count" -gt 0 ]]; then
            echo -e "  ${GREEN}✓${NC} $op"
        else
            echo -e "  ${YELLOW}○${NC} $op (not indexed)"
        fi
    done
    
    test_passed "GROUP_UPDATE breakdown complete"
    return 0
}

# =============================================================================
# Show usage
# =============================================================================
show_usage() {
    echo "Usage: test_group.sh [test_name|mode]"
    echo ""
    echo "Modes:"
    echo "  query      - Read-only tests (default, safe)"
    echo "  write      - Tests that write to contract"
    echo "  all        - Run all tests"
    echo ""
    echo "Individual tests:"
    echo "  validate   - Validate schema fields against existing data"
    echo "  create     - Test GROUP_UPDATE (group_created)"
    echo "  add_member - Test GROUP_UPDATE (member_added)"
    echo "  remove_member - Test GROUP_UPDATE (member_removed)"
    echo "  proposal   - Test GROUP_UPDATE (proposal_created)"
    echo "  vote       - Test GROUP_UPDATE (vote_cast)"
    echo "  breakdown  - Show operations breakdown"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     OnSocial Hasura Indexer - GROUP_UPDATE Tests              ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Hasura:   $HASURA_URL"
echo "║  Contract: $CONTRACT"
echo "║  Signer:   $SIGNER"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

check_deps

case "${1:-query}" in
    query)
        test_group_query
        test_group_breakdown
        ;;
    write)
        test_group_create
        test_group_add_member
        test_group_remove_member
        test_group_proposal_create
        ;;
    all)
        test_group_query
        test_group_validate_fields
        test_group_create
        test_group_add_member
        test_group_remove_member
        test_group_proposal_create
        test_group_vote
        test_group_breakdown
        ;;
    validate)
        test_group_validate_fields
        ;;
    create)
        test_group_create
        ;;
    add_member)
        test_group_add_member
        ;;
    remove_member)
        test_group_remove_member
        ;;
    proposal)
        test_group_proposal_create
        ;;
    vote)
        test_group_vote
        ;;
    breakdown)
        test_group_breakdown
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
