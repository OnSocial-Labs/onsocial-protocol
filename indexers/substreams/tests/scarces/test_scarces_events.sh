#!/bin/bash
# =============================================================================
# SCARCES EVENT Tests — Read-only validation of scarces_events table
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

    local result=$(query_hasura '{ scarces_events(limit: 1) { id event_type operation } }')

    if echo "$result" | jq -e '.data.scarces_events' >/dev/null 2>&1; then
        local count=$(echo "$result" | jq '.data.scarces_events | length')
        if [[ "$count" -gt 0 ]]; then
            test_passed "scarces_events table exists with data"
        else
            test_passed "scarces_events table exists (empty — no events indexed yet)"
        fi
        return 0
    else
        test_failed "scarces_events table not found in Hasura"
        echo "$result" | jq .
        return 1
    fi
}

# =============================================================================
# Test: Schema field validation — all columns are queryable
# =============================================================================
test_scarces_schema() {
    log_test "Validating scarces_events schema (all columns queryable)"

    local result=$(query_hasura '{
        scarces_events(limit: 1, order_by: {block_height: desc}) {
            id block_height block_timestamp receipt_id event_type operation author
            token_id collection_id listing_id owner_id creator_id buyer_id seller_id
            bidder winner_id sender_id receiver_id account_id executor contract_id
            scarce_contract_id
            amount price old_price new_price bid_amount attempted_price
            marketplace_fee app_pool_amount app_commission creator_payment revenue
            new_balance initial_balance refunded_amount refund_per_token refund_pool
            quantity total_supply redeem_count max_redeems bid_count refundable_count
            reserve_price buy_now_price min_bid_increment winning_bid expires_at
            auction_duration_ns anti_snipe_extension_ns
            app_id funder
            old_owner new_owner old_recipient new_recipient
            reason mode memo
            token_ids prices receivers accounts
            old_version new_version total_fee_bps app_pool_fee_bps platform_storage_fee_bps
            start_time end_time new_expires_at old_expires_at
            approval_id
            deposit remaining_balance cap
            extra_data
        }
    }')

    if echo "$result" | jq -e '.data.scarces_events' >/dev/null 2>&1; then
        test_passed "All scarces_events columns are queryable"
    else
        test_failed "Schema query failed — columns may be missing from Hasura tracking"
        echo "$result" | jq '.errors // .'
        return 1
    fi

    # Validate required fields on first entry if data exists
    if echo "$result" | jq -e '.data.scarces_events[0]' >/dev/null 2>&1; then
        echo "Validating required fields on latest event:"
        local entry=".data.scarces_events[0]"

        assert_field_exists "$result" "$entry.id" "id exists"
        assert_field_exists "$result" "$entry.event_type" "event_type exists"
        assert_field_exists "$result" "$entry.operation" "operation exists"
        assert_field_exists "$result" "$entry.author" "author exists"
        assert_field_bigint "$result" "$entry.block_height" "block_height is BigInt"
        assert_field_bigint "$result" "$entry.block_timestamp" "block_timestamp is BigInt"
        assert_field_exists "$result" "$entry.receipt_id" "receipt_id exists"
        assert_field_exists "$result" "$entry.extra_data" "extra_data JSON preserved"

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
        local result=$(query_hasura "{ scarces_events_aggregate(where: {event_type: {_eq: \"$etype\"}}) { aggregate { count } } }")
        local count=$(echo "$result" | jq -r '.data.scarces_events_aggregate.aggregate.count // "0"')

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
        local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarces_events | length // 0')

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
        local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"COLLECTION_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarces_events | length // 0')

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
        local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"LAZY_LISTING_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarces_events | length // 0')
        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    log_test "OFFER_UPDATE operations"
    for op in "make" "accept" "cancel" "collection_make" "collection_accept" "collection_cancel"; do
        local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"OFFER_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarces_events | length // 0')
        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    log_test "APP_POOL_UPDATE operations"
    for op in "register" "fund" "withdraw" "config" "transfer_ownership" "add_moderator" "remove_moderator"; do
        local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"APP_POOL_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarces_events | length // 0')
        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    log_test "STORAGE_UPDATE operations"
    for op in "deposit" "withdraw" "set_cap" "platform_withdraw"; do
        local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"STORAGE_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarces_events | length // 0')
        if [[ "$count" -gt 0 ]]; then
            printf "  ${GREEN}✓${NC} %-25s indexed\n" "$op"
        else
            printf "  ${YELLOW}○${NC} %-25s not yet indexed\n" "$op"
        fi
    done

    log_test "CONTRACT_UPDATE operations"
    for op in "upgrade" "fee_config" "ban" "unban"; do
        local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"CONTRACT_UPDATE\"}, operation: {_eq: \"$op\"}}, limit: 1) { id } }")
        local count=$(echo "$result" | jq '.data.scarces_events | length // 0')
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

    local result=$(query_hasura '{ scarces_events(where: {price: {_is_null: false}}, limit: 1, order_by: {block_height: desc}) { id event_type operation price marketplace_fee app_pool_amount app_commission creator_payment revenue extra_data } }')

    if echo "$result" | jq -e '.data.scarces_events[0]' >/dev/null 2>&1; then
        local entry=".data.scarces_events[0]"
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
    log_test "extra_data JSON catch-all preserves full payload"

    local result=$(query_hasura '{ scarces_events(limit: 1, order_by: {block_height: desc}) { id extra_data } }')

    if echo "$result" | jq -e '.data.scarces_events[0]' >/dev/null 2>&1; then
        local extra=$(echo "$result" | jq -r '.data.scarces_events[0].extra_data // "null"')
        if [[ "$extra" != "null" && "$extra" != "" ]]; then
            # Try to parse as JSON
            if echo "$extra" | jq . >/dev/null 2>&1; then
                test_passed "extra_data is valid JSON"
            else
                test_failed "extra_data exists but is not valid JSON"
            fi
        else
            test_passed "extra_data column queryable (null for this event)"
        fi
    else
        log_warn "No events to check extra_data"
        test_passed "extra_data query works"
    fi
}

# =============================================================================
# Test: Block ordering — events are in ascending block order
# =============================================================================
test_block_ordering() {
    log_test "Block ordering (chronological)"

    local result=$(query_hasura '{ scarces_events(limit: 10, order_by: {block_height: asc}) { block_height } }')
    local count=$(echo "$result" | jq '.data.scarces_events | length // 0')

    if [[ "$count" -lt 2 ]]; then
        log_warn "Need at least 2 events to verify ordering"
        test_passed "Ordering query works"
        return 0
    fi

    local prev=0
    local ordered=true
    for i in $(seq 0 $((count - 1))); do
        local height=$(echo "$result" | jq -r ".data.scarces_events[$i].block_height")
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
