#!/bin/bash
# =============================================================================
# SCARCES EVENT Tests — Read-only validation of scarcesEvents table
# Covers all 7 event types:
#   SCARCE_UPDATE, COLLECTION_UPDATE, LAZY_LISTING_UPDATE,
#   CONTRACT_UPDATE, OFFER_UPDATE, STORAGE_UPDATE, APP_POOL_UPDATE
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

SCARCES_CONTRACT="${SCARCES_CONTRACT:-scarces.onsocial.testnet}"

# =============================================================================
# Test: Table exists and has data
# =============================================================================
test_scarces_table() {
    log_test "Scarces events table exists"

    local result=$(query_hasura '{ scarcesEvents(limit: 1) { id eventType operation } }')

    if echo "$result" | jq -e '.data.scarcesEvents' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.scarcesEvents | length')
        if [[ "$count" -gt 0 ]]; then
            test_passed "scarcesEvents table exists with data"
        else
            test_passed "scarcesEvents table exists (empty — no events indexed yet)"
        fi
        return 0
    else
        test_failed "scarcesEvents table not found in Hasura"
        echo "$result" | jq .
        return 1
    fi
}

# =============================================================================
# Test: Schema field validation — all columns are queryable
# =============================================================================
test_scarces_schema() {
    log_test "Validating scarcesEvents schema (all columns queryable)"

    local result=$(query_hasura '{
        scarcesEvents(limit: 1, orderBy: {blockHeight: DESC}) {
            id blockHeight blockTimestamp receiptId eventType operation author
            tokenId collectionId listingId ownerId creatorId buyerId sellerId
            bidder winnerId senderId receiverId accountId executor contractId
            scarceContractId
            amount price oldPrice newPrice bidAmount attemptedPrice
            marketplaceFee appPoolAmount appCommission creatorPayment revenue
            newBalance initialBalance refundedAmount refundPerToken refundPool
            quantity totalSupply redeemCount maxRedeems bidCount refundableCount
            reservePrice buyNowPrice minBidIncrement winningBid expiresAt
            auctionDurationNs antiSnipeExtensionNs
            appId funder
            oldOwner newOwner oldRecipient newRecipient
            reason mode memo
            tokenIds prices receivers accounts
            oldVersion newVersion totalFeeBps appPoolFeeBps platformStorageFeeBps
            startTime endTime newExpiresAt oldExpiresAt
            approvalId
            deposit remainingBalance cap
            extraData
        }
    }')

    if echo "$result" | jq -e '.data.scarcesEvents' >/dev/null 2>&1; then
        test_passed "All scarcesEvents columns are queryable"
    else
        test_failed "Schema query failed — columns may be missing from Hasura tracking"
        echo "$result" | jq '.errors // .'
        return 1
    fi

    # Validate required fields on first entry if data exists
    if echo "$result" | jq -e '.data.scarcesEvents[0]' >/dev/null 2>&1; then
        echo "Validating required fields on latest event:"
        local entry=".data.scarcesEvents[0]"

        assert_field_exists "$result" "$entry.id" "id exists"
        assert_field_exists "$result" "$entry.eventType" "eventType exists"
        assert_field_exists "$result" "$entry.operation" "operation exists"
        assert_field_exists "$result" "$entry.author" "author exists"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
        assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
        assert_field_exists "$result" "$entry.extraData" "extraData JSON preserved"

        if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
            test_passed "Required fields validated"
        else
            test_failed "Required field validation failed"
        fi
    else
        log_warn "No data to validate fields against"
    fi
}

# =============================================================================
# Test: Event type distribution — check all 7 event types
# =============================================================================
test_event_type_distribution() {
    log_test "Event type distribution (all 7 types)"

    local event_types=("SCARCE_UPDATE" "COLLECTION_UPDATE" "LAZY_LISTING_UPDATE" "CONTRACT_UPDATE" "OFFER_UPDATE" "STORAGE_UPDATE" "APP_POOL_UPDATE")
    local found=0

    for etype in "${event_types[@]}"; do
        local result=$(query_hasura "{ scarcesEventsAggregate(where: {eventType: {_eq: \"$etype\"}}) { aggregate { count } } }")
        local count=$(echo "$result" | jq -r '.data.scarcesEventsAggregate.aggregate.count // "0"')

        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s %s events\n" "$etype" "$count"
            found=$((found + 1))
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$etype"
        fi
    done

    if [[ $found -ge 1 ]]; then
        test_passed "Event type distribution: $found/7 types have data"
    else
        log_warn "No event types indexed yet — scarces contract may not have activity"
        test_passed "Event type query works (no data yet)"
    fi
}

# =============================================================================
# Test: Operation breakdown for SCARCE_UPDATE
# =============================================================================
test_scarce_update_operations() {
    log_test "SCARCE_UPDATE operation breakdown"

    local operations=("mint" "transfer" "burn" "list" "delist" "purchase" "renew" "revoke" "redeem" "approve" "revoke_approval" "revoke_all" "auction_created" "auction_bid" "auction_settled" "auction_cancelled")

    for op in "${operations[@]}"; do
        local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarcesEvents | length // 0')

        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    test_passed "SCARCE_UPDATE operation check complete"
}

# =============================================================================
# Test: Operation breakdown for COLLECTION_UPDATE
# =============================================================================
test_collection_update_operations() {
    log_test "COLLECTION_UPDATE operation breakdown"

    local operations=("create" "purchase" "update_price" "update_timing" "delete" "pause" "resume" "cancel" "airdrop" "set_allowlist" "remove_from_allowlist" "set_metadata" "withdraw_refunds")

    for op in "${operations[@]}"; do
        local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"COLLECTION_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarcesEvents | length // 0')

        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    test_passed "COLLECTION_UPDATE operation check complete"
}

# =============================================================================
# Test: Operation breakdown for remaining event types
# =============================================================================
test_other_operations() {
    log_test "LAZY_LISTING_UPDATE operations"
    for op in "create" "purchase" "cancel" "update_price" "update_expiry"; do
        local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"LAZY_LISTING_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarcesEvents | length // 0')
        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    log_test "OFFER_UPDATE operations"
    for op in "make" "accept" "cancel" "collection_make" "collection_accept" "collection_cancel"; do
        local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"OFFER_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarcesEvents | length // 0')
        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    log_test "APP_POOL_UPDATE operations"
    for op in "register" "fund" "withdraw" "config" "transfer_ownership" "add_moderator" "remove_moderator"; do
        local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"APP_POOL_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarcesEvents | length // 0')
        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    log_test "STORAGE_UPDATE operations"
    for op in "deposit" "withdraw" "set_cap" "platform_withdraw"; do
        local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"STORAGE_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarcesEvents | length // 0')
        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    log_test "CONTRACT_UPDATE operations"
    for op in "upgrade" "fee_config" "ban" "unban"; do
        local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"CONTRACT_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarcesEvents | length // 0')
        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    test_passed "All event type operation checks complete"
}

# =============================================================================
# Test: Financial field validation (prices stored correctly)
# =============================================================================
test_financial_fields() {
    log_test "Financial field extraction (prices, fees)"

    local result=$(query_hasura '{ scarcesEvents(where: {price: {_is_null: false}}, limit: 1, orderBy: {blockHeight: DESC}) { id eventType operation price marketplaceFee appPoolAmount appCommission creatorPayment revenue extraData } }')

    if echo "$result" | jq -e '.data.scarcesEvents[0]' >/dev/null 2>&1; then
        local entry=".data.scarcesEvents[0]"
        assert_field_exists "$result" "$entry.price" "price exists"

        local fee=$(echo "$result" | jq -r "$entry.marketplace_fee // \"null\"")
        echo -e "  ${BLUE}○${NC} marketplace_fee = $fee"
        local app=$(echo "$result" | jq -r "$entry.app_pool_amount // \"null\"")
        echo -e "  ${BLUE}○${NC} app_pool_amount = $app"

        test_passed "Financial fields validated"
    else
        log_warn "No events with price data found"
        test_passed "Financial field query works (no priced events yet)"
    fi
}

# =============================================================================
# Test: extra_data preserves full JSON
# =============================================================================
test_extra_data() {
    log_test "extraData JSON catch-all preserves full payload"

    local result=$(query_hasura '{ scarcesEvents(limit: 1, orderBy: {blockHeight: DESC}) { id extraData } }')

    if echo "$result" | jq -e '.data.scarcesEvents[0]' >/dev/null 2>&1; then
        local extra=$(echo "$result" | jq -r '.data.scarcesEvents[0].extraData // "null"')
        if [[ "$extra" != "null" && "$extra" != "" ]]; then
            # Try to parse as JSON
            if echo "$extra" | jq . >/dev/null 2>&1; then
                test_passed "extraData is valid JSON"
            else
                test_failed "extraData exists but is not valid JSON"
            fi
        else
            test_passed "extraData column queryable (null for this event)"
        fi
    else
        log_warn "No events to check extraData"
        test_passed "extraData query works"
    fi
}

# =============================================================================
# Test: Block ordering — events are in ascending block order
# =============================================================================
test_block_ordering() {
    log_test "Block ordering (chronological)"

    local result=$(query_hasura '{ scarcesEvents(limit: 10, orderBy: {blockHeight: ASC}) { blockHeight } }')
    local count=$(echo "$result" | jq '.data.scarcesEvents | length // 0')

    if [[ "$count" -lt 2 ]]; then
        log_warn "Need at least 2 events to verify ordering"
        test_passed "Ordering query works"
        return 0
    fi

    local prev=0
    local ordered=true
    for i in $(seq 0 $((count - 1))); do
        local height=$(echo "$result" | jq -r ".data.scarcesEvents[$i].blockHeight")
        if [[ "$height" -lt "$prev" ]]; then
            ordered=false
            break
        fi
        prev="$height"
    done

    if $ordered; then
        test_passed "Events are in ascending block order"
    else
        test_failed "Events are NOT in ascending block order"
    fi
}

# =============================================================================
# Main
# =============================================================================
mode="${1:-query}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Scarces Events — Read-Only Tests"
echo "  Contract: $SCARCES_CONTRACT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_scarces_table
test_scarces_schema
test_event_type_distribution
test_scarce_update_operations
test_collection_update_operations
test_other_operations
test_financial_fields
test_extra_data
test_block_ordering

print_summary
