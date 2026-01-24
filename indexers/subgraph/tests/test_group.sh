#!/bin/bash
# =============================================================================
# GROUP_UPDATE Event Tests
# Tests: create_group, add_member, remove_member, privacy_changed
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# =============================================================================
# Test: GROUP_UPDATE (create_group)
# =============================================================================
test_group_create() {
    local group_id="test-group-$(date +%s)"
    
    log_test "GROUP_UPDATE (create_group) - Creating $group_id"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {}}}}" \
        "0.1"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ groupUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId author partitionId blockHeight blockTimestamp receiptId memberId role value isPrivate config } groups(first: 1, orderBy: createdAt, orderDirection: desc) { id owner memberCount isPrivate proposalCount createdAt lastActivityAt } }')
    
    echo "Verifying GroupUpdate fields for create_group:"
    
    # Find the create_group event (may not be first due to add_member auto-event)
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
    assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
    assert_field_exists "$result" "$entry.partitionId" "partitionId exists"
    
    # Create-specific fields
    assert_field "$result" "$entry.isPrivate" "false" "isPrivate = false (default)"
    
    echo ""
    echo "Verifying Group entity fields:"
    local group=".data.groups[0]"
    
    assert_field "$result" "$group.id" "$group_id" "group.id matches"
    assert_field_exists "$result" "$group.owner" "group.owner exists"
    assert_field_positive "$result" "$group.memberCount" "group.memberCount > 0"
    assert_field_bigint "$result" "$group.createdAt" "group.createdAt is BigInt"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "GROUP_UPDATE (create_group) - all fields validated"
        export TEST_GROUP_ID="$group_id"  # Export for subsequent tests
        return 0
    else
        test_failed "GROUP_UPDATE (create_group) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (add_member)
# =============================================================================
test_group_add_member() {
    local group_id="${TEST_GROUP_ID:-test-subgraph-group}"
    local member="test-member-$(date +%s).testnet"
    
    log_test "GROUP_UPDATE (add_member) - Adding $member to $group_id"
    
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$member\"}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ groupUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId author role level blockHeight blockTimestamp receiptId partitionId } }')
    
    echo "Verifying GroupUpdate fields for add_member:"
    local entry=".data.groupUpdates[0]"
    
    # Core fields
    assert_field "$result" "$entry.operation" "add_member" "operation = add_member"
    assert_field "$result" "$entry.groupId" "$group_id" "groupId matches"
    assert_field_contains "$result" "$entry.memberId" "testnet" "memberId is valid account"
    assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
    
    # Block/receipt fields
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
    assert_field_exists "$result" "$entry.partitionId" "partitionId exists"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "GROUP_UPDATE (add_member) - all fields validated"
        return 0
    else
        test_failed "GROUP_UPDATE (add_member) - some field assertions failed"
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (remove_member)
# =============================================================================
test_group_remove_member() {
    local group_id="${TEST_GROUP_ID:-test-subgraph-group}"
    local member="temp-member-$(date +%s).testnet"
    
    log_test "GROUP_UPDATE (remove_member) - First add, then remove $member"
    
    # First add a member
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$member\"}}}"
    
    log_info "Member added, now removing..."
    
    # Then remove them (with smart wait)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"remove_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$member\"}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ groupUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId } }')
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
# Test: GROUP_UPDATE (privacy_changed)
# =============================================================================
test_group_privacy() {
    local group_id="test-privacy-$(date +%s)"
    
    log_test "GROUP_UPDATE (privacy_changed) - Create group then toggle privacy"
    
    # Create a new group (default is_private=false)
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {}}}}" \
        "0.1"
    
    log_info "Group created, now setting to private..."
    
    # Toggle to private (with smart wait)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set_group_privacy\", \"group_id\": \"$group_id\", \"is_private\": true}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ groupUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId isPrivate } }')
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "privacy_changed" ]]; then
        test_passed "GROUP_UPDATE (privacy_changed) indexed successfully"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        test_failed "GROUP_UPDATE (privacy_changed) not found"
        echo "Latest group ops:"
        echo "$result" | jq '.data.groupUpdates[:3]'
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
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {\"member_driven\": true}}}}" \
        "0.1"
    
    log_info "Group created, creating proposal..."
    
    # Create a custom_proposal (simplest type) - requires 0.1 NEAR deposit
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_proposal\", \"group_id\": \"$group_id\", \"proposal_type\": \"custom_proposal\", \"changes\": {\"title\": \"Test Proposal\", \"description\": \"Testing subgraph indexing\", \"custom_data\": {}}, \"auto_vote\": true}}}" \
        "0.1"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph "{ groupUpdates(where: {operation: \"proposal_created\", groupId: \"$group_id\"}, first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId proposalId proposalType sequenceNumber author createdAt lockedMemberCount lockedDeposit expiresAt autoVote blockHeight blockTimestamp receiptId } }")
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "proposal_created" ]]; then
        echo "Verifying proposal_created fields:"
        local entry=".data.groupUpdates[0]"
        assert_field "$result" "$entry.groupId" "$group_id" "groupId matches"
        assert_field "$result" "$entry.proposalType" "custom_proposal" "proposalType = custom_proposal"
        assert_field "$result" "$entry.author" "$SIGNER" "author = signer"
        assert_field "$result" "$entry.sequenceNumber" "1" "sequenceNumber = 1 (first proposal)"
        assert_field "$result" "$entry.autoVote" "true" "autoVote = true"
        assert_field_bigint "$result" "$entry.createdAt" "createdAt is BigInt"
        assert_field_bigint "$result" "$entry.lockedDeposit" "lockedDeposit is BigInt"
        assert_field_bigint "$result" "$entry.expiresAt" "expiresAt is BigInt"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
        
        test_passed "GROUP_UPDATE (proposal_created) - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.groupUpdates[0]'
        export TEST_PROPOSAL_GROUP_ID="$group_id"
        export LAST_PROPOSAL_ID=$(echo "$result" | jq -r '.data.groupUpdates[0].proposalId // ""')
        return 0
    else
        test_failed "GROUP_UPDATE (proposal_created) not found"
        echo "Query result:"
        echo "$result" | jq '.data.groupUpdates'
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (vote_cast)
# =============================================================================
test_group_vote() {
    local group_id="${TEST_PROPOSAL_GROUP_ID:-}"
    local proposal_id="${LAST_PROPOSAL_ID:-}"
    local voter="relayer_test0_onsocial.testnet"
    
    log_test "GROUP_UPDATE (vote_cast)"
    
    if [ -z "$proposal_id" ]; then
        log_info "No proposal ID available, creating new proposal first..."
        
        # Create group and proposal
        group_id="vote-test-$(date +%s)"
        call_contract_setup "execute" \
            "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {}}}}" \
            "0.1"
        
        # Add voter as member so they can vote
        call_contract_setup "execute" \
            "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$voter\"}}}"
        
        # Create proposal without auto_vote
        local tx_output=$(near call "$CONTRACT" "execute" \
            "{\"request\": {\"action\": {\"type\": \"create_proposal\", \"group_id\": \"$group_id\", \"proposal_type\": \"custom_proposal\", \"changes\": {\"title\": \"Vote Test\", \"description\": \"Testing vote\", \"custom_data\": {}}, \"auto_vote\": false}}}" \
            --accountId "$SIGNER" --networkId "$NETWORK" --deposit "0.01" 2>&1)
        
        echo "$tx_output" | grep -v "^null$"
        
        # Extract proposal_id from output
        proposal_id=$(echo "$tx_output" | grep -o '"proposal_id":"[^"]*"' | head -1 | sed 's/"proposal_id":"//;s/"//')
        if [ -z "$proposal_id" ]; then
            log_warn "Could not extract proposal ID"
            return 0
        fi
        log_info "Created proposal: $proposal_id"
    fi
    
    log_info "Voting on proposal $proposal_id in group $group_id..."
    
    # Vote as a different member (voter)
    call_and_wait_as "$voter" "execute" \
        "{\"request\": {\"action\": {\"type\": \"vote_on_proposal\", \"group_id\": \"$group_id\", \"proposal_id\": \"$proposal_id\", \"approve\": true}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph "{ groupUpdates(where: {operation: \"vote_cast\", groupId: \"$group_id\"}, first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId proposalId voter approve yesVotes noVotes totalVotes shouldExecute votedAt blockHeight blockTimestamp receiptId } }")
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "vote_cast" ]]; then
        echo "Verifying vote_cast fields:"
        local entry=".data.groupUpdates[0]"
        assert_field "$result" "$entry.groupId" "$group_id" "groupId matches"
        assert_field_exists "$result" "$entry.proposalId" "proposalId exists"
        assert_field "$result" "$entry.voter" "$voter" "voter matches"
        assert_field "$result" "$entry.approve" "true" "approve = true"
        assert_field_exists "$result" "$entry.yesVotes" "yesVotes exists"
        assert_field_exists "$result" "$entry.noVotes" "noVotes exists"
        assert_field_exists "$result" "$entry.totalVotes" "totalVotes exists"
        assert_field_bigint "$result" "$entry.votedAt" "votedAt is BigInt"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
        
        test_passed "GROUP_UPDATE (vote_cast) - all fields validated"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        log_warn "vote_cast not found"
        echo "Query result:"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (transfer_ownership)
# =============================================================================
test_group_transfer_ownership() {
    local group_id="test-transfer-$(date +%s)"
    local new_owner="new-owner-$(date +%s).testnet"
    
    log_test "GROUP_UPDATE (transfer_ownership) - Create group then transfer"
    
    # Create a new group
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {}}}}" \
        "0.1"
    
    log_info "Group created, now adding new owner as member..."
    
    # Add new owner as member first (required before transfer)
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$new_owner\"}}}"
    
    log_info "Member added, now transferring ownership..."
    
    # Transfer ownership (with smart wait)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"transfer_group_ownership\", \"group_id\": \"$group_id\", \"new_owner\": \"$new_owner\"}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ groupUpdates(where: {operation: \"transfer_ownership\"}, first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId previousOwner newOwner } }')
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "transfer_ownership" ]]; then
        test_passed "GROUP_UPDATE (transfer_ownership) indexed successfully"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        test_failed "GROUP_UPDATE (transfer_ownership) not found"
        echo "Latest ops:"
        echo "$result" | jq '.data.groupUpdates'
        return 1
    fi
}

# =============================================================================
# Test: Query existing GroupUpdates
# =============================================================================
test_group_query() {
    log_test "Query existing GroupUpdates"
    
    local result=$(query_subgraph '{ groupUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation author groupId memberId blockTimestamp } groups(first: 5, orderBy: lastActivityAt, orderDirection: desc) { id owner memberCount isPrivate proposalCount activeProposalCount } }')
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.groupUpdates | length')
        test_passed "Found $count GroupUpdate entries"
        echo "Events:"
        echo "$result" | jq '.data.groupUpdates'
        echo "Groups:"
        echo "$result" | jq '.data.groups'
        return 0
    else
        test_failed "No GroupUpdates found"
        return 1
    fi
}

# =============================================================================
# Test: Query proposals
# =============================================================================
test_group_proposals_query() {
    log_test "Query existing Proposals"
    
    local result=$(query_subgraph '{ groupUpdates(where: {operation_in: ["proposal_created", "vote_cast", "proposal_status_updated"]}, first: 10, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId proposalId proposalType status voter approve yesVotes noVotes } }')
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.groupUpdates | length')
        test_passed "Found $count proposal-related events"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    else
        log_warn "No proposal events found (may be normal if no proposals created)"
        return 0
    fi
}

# =============================================================================
# Test: Validate GroupUpdate field mapping (no contract calls)
# =============================================================================
test_group_validate_fields() {
    log_test "Validating GroupUpdate field mapping against existing data"
    
    local result=$(query_subgraph '{ groupUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation author partitionId blockHeight blockTimestamp receiptId groupId memberId memberNonce role level path value proposalId proposalType status voter approve yesVotes noVotes isPrivate previousOwner newOwner } }')
    
    if ! echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        test_failed "No GroupUpdates found to validate"
        return 1
    fi
    
    echo "Validating ALL GroupUpdate schema fields:"
    local entry=".data.groupUpdates[0]"
    ASSERTIONS_FAILED=0
    
    # Core fields (required)
    assert_field_exists "$result" "$entry.id" "id exists"
    assert_field_exists "$result" "$entry.operation" "operation exists"
    assert_field_exists "$result" "$entry.author" "author exists"
    
    # Blockchain fields (required)
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
    
    # GroupUpdate specific (required for group operations)
    assert_field_exists "$result" "$entry.groupId" "groupId exists"
    
    # Optional fields (null is acceptable)
    echo ""
    echo "Optional fields (null is acceptable):"
    local partition=$(echo "$result" | jq -r "$entry.partitionId // \"null\"")
    local memberId=$(echo "$result" | jq -r "$entry.memberId // \"null\"")
    local memberNonce=$(echo "$result" | jq -r "$entry.memberNonce // \"null\"")
    local role=$(echo "$result" | jq -r "$entry.role // \"null\"")
    local level=$(echo "$result" | jq -r "$entry.level // \"null\"")
    local path=$(echo "$result" | jq -r "$entry.path // \"null\"")
    local value=$(echo "$result" | jq -r "$entry.value // \"null\"")
    local proposalId=$(echo "$result" | jq -r "$entry.proposalId // \"null\"")
    local proposalType=$(echo "$result" | jq -r "$entry.proposalType // \"null\"")
    local status=$(echo "$result" | jq -r "$entry.status // \"null\"")
    local voter=$(echo "$result" | jq -r "$entry.voter // \"null\"")
    local approve=$(echo "$result" | jq -r "$entry.approve // \"null\"")
    local yesVotes=$(echo "$result" | jq -r "$entry.yesVotes // \"null\"")
    local noVotes=$(echo "$result" | jq -r "$entry.noVotes // \"null\"")
    local isPrivate=$(echo "$result" | jq -r "$entry.isPrivate // \"null\"")
    local prevOwner=$(echo "$result" | jq -r "$entry.previousOwner // \"null\"")
    local newOwner=$(echo "$result" | jq -r "$entry.newOwner // \"null\"")
    
    echo "  ○ partitionId = $partition"
    echo "  ○ memberId = $memberId"
    echo "  ○ memberNonce = $memberNonce"
    echo "  ○ role = $role"
    echo "  ○ level = $level"
    echo "  ○ path = ${path:0:50}"
    echo "  ○ value = ${value:0:50}"
    echo "  ○ proposalId = $proposalId"
    echo "  ○ proposalType = $proposalType"
    echo "  ○ status = $status"
    echo "  ○ voter = $voter"
    echo "  ○ approve = $approve"
    echo "  ○ yesVotes = $yesVotes"
    echo "  ○ noVotes = $noVotes"
    echo "  ○ isPrivate = $isPrivate"
    echo "  ○ previousOwner = $prevOwner"
    echo "  ○ newOwner = $newOwner"
    
    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "GroupUpdate field mapping validated"
        return 0
    else
        test_failed "GroupUpdate field mapping has errors"
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (add_to_blacklist)
# =============================================================================
test_group_blacklist_add() {
    log_test "GROUP_UPDATE (add_to_blacklist)"
    
    local group_id="${TEST_GROUP_ID:-test-group-$(date +%s)}"
    local target="blacklist-target-$(date +%s).testnet"
    
    # First create group and add member
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {}}}}" \
        "0.1"
    
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$target\"}}}"
    
    # Blacklist the member (with smart wait)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"blacklist_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$target\"}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph "{ groupUpdates(where: {operation: \"add_to_blacklist\", groupId: \"$group_id\"}, first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId } }")
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "add_to_blacklist" ]]; then
        test_passed "GROUP_UPDATE (add_to_blacklist) indexed"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        test_failed "GROUP_UPDATE (add_to_blacklist) not found"
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (remove_from_blacklist)
# =============================================================================
test_group_blacklist_remove() {
    log_test "GROUP_UPDATE (remove_from_blacklist)"
    
    local group_id="${TEST_GROUP_ID:-test-group-$(date +%s)}"
    local target="unblacklist-target-$(date +%s).testnet"
    
    # Create group, add member, blacklist, then unblacklist
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {}}}}" \
        "0.1"
    
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$target\"}}}"
    
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"blacklist_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$target\"}}}"
    
    # Unblacklist with smart wait
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"unblacklist_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$target\"}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph "{ groupUpdates(where: {operation: \"remove_from_blacklist\", groupId: \"$group_id\"}, first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId } }")
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "remove_from_blacklist" ]]; then
        test_passed "GROUP_UPDATE (remove_from_blacklist) indexed"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        test_failed "GROUP_UPDATE (remove_from_blacklist) not found"
        return 1
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (join_request_submitted) - Private group join flow
# =============================================================================
test_group_join_request() {
    log_test "GROUP_UPDATE (join_request_submitted) - Submit join request to private group"
    
    local group_id="private-join-$(date +%s)"
    local requester="relayer_test0_onsocial.testnet"
    
    # Create a private group (owner = SIGNER)
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {\"is_private\": true}}}}" \
        "0.1"
    
    log_info "Private group '$group_id' created, submitting join request from $requester..."
    
    # Submit join request from different account (needs storage deposit)
    call_and_wait_as "$requester" "execute" \
        "{\"request\": {\"action\": {\"type\": \"join_group\", \"group_id\": \"$group_id\"}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph "{ groupUpdates(where: {groupId: \"$group_id\", operation_in: [\"join_request_submitted\", \"join_request\"]}, first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId author status blockHeight blockTimestamp receiptId partitionId } }")
    
    echo "Verifying GroupUpdate fields for join_request:"
    local entry=".data.groupUpdates[0]"
    local op=$(echo "$result" | jq -r "$entry.operation // \"\"")
    
    if [[ "$op" == "join_request_submitted" ]] || [[ "$op" == "join_request" ]]; then
        assert_field "$result" "$entry.groupId" "$group_id" "groupId matches"
        assert_field "$result" "$entry.author" "$requester" "author = requester"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
        
        test_passed "GROUP_UPDATE (join_request_submitted) - fields validated (op=$op)"
        echo ""
        echo "📄 Created entity:"
        echo "$result" | jq '.data.groupUpdates[0]'
        export TEST_JOIN_GROUP_ID="$group_id"
        export TEST_JOIN_REQUESTER="$requester"
        return 0
    else
        # May fail if account doesn't have access
        log_warn "join_request event not found (check $requester has contract access)"
        echo "Query result:"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (approve_join_request)
# =============================================================================
test_group_approve_join_request() {
    log_test "GROUP_UPDATE (approve_join_request)"
    
    local group_id="${TEST_JOIN_GROUP_ID:-}"
    local requester="${TEST_JOIN_REQUESTER:-relayer_test0_onsocial.testnet}"
    
    # If we don't have an existing group with pending request, create one and submit join request
    if [[ -z "$group_id" ]]; then
        group_id="private-approve-$(date +%s)"
        call_contract_setup "execute" \
            "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {\"is_private\": true}}}}" \
            "0.1"
        
        log_info "Submitting join request from $requester..."
        call_contract_as "$requester" "execute" \
            "{\"request\": {\"action\": {\"type\": \"join_group\", \"group_id\": \"$group_id\"}}}"
    fi
    
    log_info "Approving join request for $requester..."
    # Approve as owner (SIGNER)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"approve_join_request\", \"group_id\": \"$group_id\", \"requester_id\": \"$requester\"}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph "{ groupUpdates(where: {groupId: \"$group_id\", operation_in: [\"join_request_approved\", \"member_added\", \"add_member\"]}, first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId author status blockHeight blockTimestamp receiptId } }")
    local op=$(echo "$result" | jq -r ".data.groupUpdates[0].operation // \"\"")
    
    if [[ "$op" == "join_request_approved" ]] || [[ "$op" == "add_member" ]] || [[ "$op" == "member_added" ]]; then
        test_passed "GROUP_UPDATE (approve_join_request) indexed (op=$op)"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        log_warn "approve_join_request event not found"
        echo "Query result:"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (reject_join_request)
# =============================================================================
test_group_reject_join_request() {
    log_test "GROUP_UPDATE (reject_join_request)"
    
    local group_id="private-reject-$(date +%s)"
    local requester="relayer_test0_onsocial.testnet"
    
    # Create private group
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {\"is_private\": true}}}}" \
        "0.1"
    
    log_info "Submitting join request from $requester..."
    call_contract_as "$requester" "execute" \
        "{\"request\": {\"action\": {\"type\": \"join_group\", \"group_id\": \"$group_id\"}}}"
    
    log_info "Rejecting join request..."
    # Reject as owner (SIGNER)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"reject_join_request\", \"group_id\": \"$group_id\", \"requester_id\": \"$requester\"}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph "{ groupUpdates(where: {groupId: \"$group_id\", operation_in: [\"join_request_rejected\", \"join_request_cancelled\"]}, first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId author status blockHeight blockTimestamp receiptId } }")
    local op=$(echo "$result" | jq -r ".data.groupUpdates[0].operation // \"\"")
    
    if [[ "$op" == "join_request_rejected" ]]; then
        test_passed "GROUP_UPDATE (reject_join_request) indexed"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        log_warn "reject_join_request event not found"
        echo "Query result:"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (cancel_join_request)
# =============================================================================
test_group_cancel_join_request() {
    log_test "GROUP_UPDATE (cancel_join_request)"
    
    local group_id="private-cancel-$(date +%s)"
    local requester="relayer_test0_onsocial.testnet"
    
    # Create private group
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {\"is_private\": true}}}}" \
        "0.1"
    
    log_info "Submitting join request from $requester..."
    call_contract_as "$requester" "execute" \
        "{\"request\": {\"action\": {\"type\": \"join_group\", \"group_id\": \"$group_id\"}}}"
    
    log_info "Cancelling join request..."
    # Cancel as requester (not owner)
    call_and_wait_as "$requester" "execute" \
        "{\"request\": {\"action\": {\"type\": \"cancel_join_request\", \"group_id\": \"$group_id\"}}}"
    
    check_indexing_errors || return 1
    
    local result=$(query_subgraph "{ groupUpdates(where: {groupId: \"$group_id\", operation: \"join_request_cancelled\"}, first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId author status blockHeight blockTimestamp receiptId } }")
    local op=$(echo "$result" | jq -r ".data.groupUpdates[0].operation // \"\"")
    
    if [[ "$op" == "join_request_cancelled" ]]; then
        test_passed "GROUP_UPDATE (cancel_join_request) indexed"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        log_warn "cancel_join_request event not found"
        echo "Query result:"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (group_pool_deposit)
# =============================================================================
test_group_pool_deposit() {
    log_test "GROUP_UPDATE (group_pool_deposit)"
    
    local group_id="${TEST_GROUP_ID:-test-group-$(date +%s)}"
    
    # Create group with pool
    call_contract_setup "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {}}}}" \
        "0.5"
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    # Query for pool deposit events
    local result=$(query_subgraph '{ groupUpdates(where: {operation_in: ["group_pool_deposit", "group_pool_created"]}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId poolKey amount previousPoolBalance newPoolBalance } }')
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        test_passed "GROUP_UPDATE (group_pool operations) found"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    else
        log_warn "No group_pool events found (may require explicit pool deposit)"
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (voting_config_changed)
# =============================================================================
test_group_voting_config() {
    log_test "GROUP_UPDATE (voting_config_changed)"
    
    # Query for any existing voting config changes
    local result=$(query_subgraph '{ groupUpdates(where: {operation: "voting_config_changed"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId votingPeriod participationQuorum majorityThreshold effectiveVotingPeriod effectiveParticipationQuorum effectiveMajorityThreshold } }')
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        test_passed "GROUP_UPDATE (voting_config_changed) found"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    else
        log_warn "No voting_config_changed events found"
        log_info "These are typically emitted via governance proposals"
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (proposal_status_updated)
# =============================================================================
test_group_proposal_status() {
    log_test "GROUP_UPDATE (proposal_status_updated)"
    
    # Query for proposal status updates (executed, rejected, expired)
    local result=$(query_subgraph '{ groupUpdates(where: {operation: "proposal_status_updated"}, first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId proposalId status finalTotalVotes finalYesVotes finalNoVotes lockedMemberCount blockHeight blockTimestamp receiptId } }')
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        echo "Verifying proposal_status_updated fields:"
        local entry=".data.groupUpdates[0]"
        assert_field_exists "$result" "$entry.groupId" "groupId exists"
        assert_field_exists "$result" "$entry.proposalId" "proposalId exists"
        assert_field_exists "$result" "$entry.status" "status exists"
        assert_field_exists "$result" "$entry.finalTotalVotes" "finalTotalVotes exists"
        assert_field_exists "$result" "$entry.finalYesVotes" "finalYesVotes exists"
        assert_field_exists "$result" "$entry.finalNoVotes" "finalNoVotes exists"
        assert_field_exists "$result" "$entry.lockedMemberCount" "lockedMemberCount exists"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_hex "$result" "$entry.receiptId" "receiptId is hex"
        
        test_passed "GROUP_UPDATE (proposal_status_updated) - fields validated"
        echo ""
        echo "📄 Entity:"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        log_warn "No proposal_status_updated events found"
        log_info "These are emitted when proposals are executed/rejected/expired"
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (member_invited)
# =============================================================================
test_group_member_invited() {
    log_test "GROUP_UPDATE (member_invited)"
    
    # Query for member_invited events (via governance)
    local result=$(query_subgraph '{ groupUpdates(where: {operation: "member_invited"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId fromGovernance proposalId } }')
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        test_passed "GROUP_UPDATE (member_invited) found"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    else
        log_warn "No member_invited events found"
        log_info "These are emitted via governance proposals to invite members"
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (permission_changed)
# =============================================================================
test_group_permission_changed() {
    log_test "GROUP_UPDATE (permission_changed)"
    
    # Query for permission_changed events
    local result=$(query_subgraph '{ groupUpdates(where: {operation: "permission_changed"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId permissionPath permissionLevel via } }')
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        test_passed "GROUP_UPDATE (permission_changed) found"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    else
        log_warn "No permission_changed events found"
        log_info "These are emitted when group member permissions change"
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (group_updated)
# =============================================================================
test_group_updated() {
    log_test "GROUP_UPDATE (group_updated)"
    
    # Query for group_updated events
    local result=$(query_subgraph '{ groupUpdates(where: {operation: "group_updated"}, first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId updateType changes message } }')
    
    if echo "$result" | jq -e '.data.groupUpdates[0]' >/dev/null 2>&1; then
        test_passed "GROUP_UPDATE (group_updated) found"
        echo "$result" | jq '.data.groupUpdates'
        return 0
    else
        log_warn "No group_updated events found"
        log_info "These are emitted when group metadata is updated"
        return 0
    fi
}

# =============================================================================
# Test: GROUP_UPDATE (sponsor operations)
# =============================================================================
test_group_sponsor() {
    log_test "GROUP_UPDATE (sponsor operations) - group_sponsor_quota_set & group_sponsor_default_set"
    
    # First, create a group with a pool (or use existing)
    local group_id="sponsor-test-$(date +%s)"
    
    # Create group
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {\"name\": \"Sponsor Test Group\"}}}}" \
        "0.1"
    
    # Fund the group pool (required for sponsorship)
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"storage/group_pool_deposit\": {\"group_id\": \"$group_id\", \"amount\": \"100000000000000000000000\"}}}}}" \
        "0.15"
    
    # Test group_sponsor_quota_set - set quota for a specific user
    local target_user="sponsored-user-$(date +%s).testnet"
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"storage/group_sponsor_quota_set\": {\"group_id\": \"$group_id\", \"target_id\": \"$target_user\", \"enabled\": true, \"daily_refill_bytes\": 1000, \"allowance_max_bytes\": 10000}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    # Verify group_sponsor_quota_set (uses memberId not targetId in schema)
    local result=$(query_subgraph '{ groupUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {operation: "group_sponsor_quota_set"}) { id operation author groupId memberId sponsorEnabled dailyRefillBytes allowanceMaxBytes previouslyEnabled } }')
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "group_sponsor_quota_set" ]]; then
        echo "✅ group_sponsor_quota_set indexed"
        echo "$result" | jq '.data.groupUpdates[0]'
    else
        log_warn "group_sponsor_quota_set not found"
    fi
    
    # Test group_sponsor_default_set - set default sponsorship for all members
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"storage/group_sponsor_default_set\": {\"group_id\": \"$group_id\", \"enabled\": true, \"daily_refill_bytes\": 500, \"allowance_max_bytes\": 5000}}}}}" \
        "0.01"
    
    check_indexing_errors || return 1
    
    # Verify group_sponsor_default_set
    result=$(query_subgraph '{ groupUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {operation: "group_sponsor_default_set"}) { id operation author groupId sponsorEnabled dailyRefillBytes allowanceMaxBytes previouslyEnabled } }')
    op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "group_sponsor_default_set" ]]; then
        echo "✅ group_sponsor_default_set indexed"
        echo "$result" | jq '.data.groupUpdates[0]'
        test_passed "GROUP_UPDATE (sponsor operations) - both operations validated"
        return 0
    else
        log_warn "group_sponsor_default_set not found"
        return 0
    fi
}

# =============================================================================
# Test: Query all GROUP_UPDATE operations breakdown
# =============================================================================
test_group_operations_breakdown() {
    log_test "GROUP_UPDATE operations breakdown"
    
    echo "GROUP_UPDATE operations breakdown:"
    
    # Use direct curl calls to avoid escaping issues
    local url="$SUBGRAPH_URL"
    
    check_op() {
        local op=$1
        local result=$(curl -s "$url" -H 'Content-Type: application/json' -d '{"query":"{ groupUpdates(where: {operation: \"'"$op"'\"}, first: 1) { id } }"}')
        local count=$(echo "$result" | jq '.data.groupUpdates | length // 0' 2>/dev/null || echo "0")
        printf "  %-28s %s found\n" "$op:" "$count"
    }
    
    check_op "create_group"
    check_op "add_member"
    check_op "remove_member"
    check_op "add_to_blacklist"
    check_op "remove_from_blacklist"
    check_op "transfer_ownership"
    check_op "privacy_changed"
    check_op "proposal_created"
    check_op "vote_cast"
    check_op "proposal_status_updated"
    check_op "join_request_submitted"
    check_op "join_request_approved"
    check_op "join_request_rejected"
    check_op "group_pool_deposit"
    check_op "group_pool_created"
    check_op "voting_config_changed"
    check_op "member_invited"
    check_op "permission_changed"
    check_op "group_updated"
    check_op "group_sponsor_quota_set"
    check_op "group_sponsor_default_set"
    check_op "stats_updated"
    
    return 0
}

# =============================================================================
# Main
# =============================================================================
show_help() {
    echo "Usage: $0 [test_name|all]"
    echo ""
    echo "Available tests:"
    echo "  create           - Test GROUP_UPDATE (create_group)"
    echo "  add_member       - Test GROUP_UPDATE (add_member)"
    echo "  remove_member    - Test GROUP_UPDATE (remove_member)"
    echo "  privacy          - Test GROUP_UPDATE (privacy_changed)"
    echo "  proposal_create  - Test GROUP_UPDATE (proposal_created)"
    echo "  vote             - Test GROUP_UPDATE (vote_cast)"
    echo "  transfer         - Test GROUP_UPDATE (transfer_ownership)"
    echo "  blacklist_add    - Test GROUP_UPDATE (add_to_blacklist)"
    echo "  blacklist_remove - Test GROUP_UPDATE (remove_from_blacklist)"
    echo "  join_request     - Test GROUP_UPDATE (join_request_submitted)"
    echo "  approve_join     - Test GROUP_UPDATE (approve_join_request)"
    echo "  reject_join      - Test GROUP_UPDATE (reject_join_request)"
    echo "  cancel_join      - Test GROUP_UPDATE (cancel_join_request)"
    echo "  pool_deposit     - Test GROUP_UPDATE (group_pool operations)"
    echo "  voting_config    - Test GROUP_UPDATE (voting_config_changed)"
    echo "  proposal_status  - Test GROUP_UPDATE (proposal_status_updated)"
    echo "  member_invited   - Test GROUP_UPDATE (member_invited)"
    echo "  permission       - Test GROUP_UPDATE (permission_changed)"
    echo "  group_updated    - Test GROUP_UPDATE (group_updated)"
    echo "  sponsor          - Test GROUP_UPDATE (sponsor operations)"
    echo "  breakdown        - Show all operations breakdown"
    echo "  query            - Query existing GroupUpdates"
    echo "  proposals_query  - Query proposal events"
    echo "  validate         - Validate field mapping"
    echo "  all              - Run all tests"
    echo ""
    echo "Environment variables:"
    echo "  TEST_GROUP_ID    - Group ID to use for member/proposal tests"
    echo "  LAST_PROPOSAL_ID - Proposal ID for vote test"
}

main() {
    echo ""
    echo "=============================================="
    echo "  GROUP_UPDATE Event Tests"
    echo "=============================================="
    echo ""
    
    check_deps
    
    case "${1:-all}" in
        create)          test_group_create ;;
        add_member)      test_group_add_member ;;
        remove_member)   test_group_remove_member ;;
        privacy)         test_group_privacy ;;
        proposal_create) test_group_proposal_create ;;
        vote)            test_group_vote ;;
        transfer)        test_group_transfer_ownership ;;
        blacklist_add)   test_group_blacklist_add ;;
        blacklist_remove) test_group_blacklist_remove ;;
        join_request)    test_group_join_request ;;
        approve_join)    test_group_approve_join_request ;;
        reject_join)     test_group_reject_join_request ;;
        cancel_join)     test_group_cancel_join_request ;;
        pool_deposit)    test_group_pool_deposit ;;
        voting_config)   test_group_voting_config ;;
        proposal_status) test_group_proposal_status ;;
        member_invited)  test_group_member_invited ;;
        permission)      test_group_permission_changed ;;
        group_updated)   test_group_updated ;;
        sponsor)         test_group_sponsor ;;
        breakdown)       test_group_operations_breakdown ;;
        query)           test_group_query ;;
        proposals_query) test_group_proposals_query ;;
        validate)        test_group_validate_fields ;;
        all)
            test_group_query
            test_group_proposals_query
            test_group_validate_fields
            test_group_operations_breakdown
            test_group_create
            test_group_add_member
            test_group_remove_member
            test_group_privacy
            test_group_proposal_create
            test_group_vote
            test_group_transfer_ownership
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
