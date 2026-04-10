#!/bin/bash
# =============================================================================
# Token (NEP-141) Event Tests for Hasura/PostgreSQL Indexer
# Tests: ft_mint, ft_burn, ft_transfer events
# Queries tokenEvents table
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

export TOKEN_CONTRACT="${TOKEN_CONTRACT:-token.onsocial.testnet}"
CONTRACT="$TOKEN_CONTRACT"
export TOKEN_SENDER="${TOKEN_SENDER:-greenghost.onsocial.testnet}"
export TOKEN_RECEIVER="${TOKEN_RECEIVER:-voter2.onsocial.testnet}"
export TOKEN_TRANSFER_AMOUNT="${TOKEN_TRANSFER_AMOUNT:-1234567890000000000}"
export TOKEN_BURN_AMOUNT="${TOKEN_BURN_AMOUNT:-234567890000000000}"
export TOKEN_TRANSFER_MEMO="${TOKEN_TRANSFER_MEMO:-token-events-transfer-$(date +%s)}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Token Events Test Suite                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

has_live_local_access_key() {
    local account_id="$1"
    local credential_file="$HOME/.near-credentials/$NETWORK/$account_id.json"
    [[ -f "$credential_file" ]] || return 1

    local public_key
    public_key=$(jq -r '.public_key // empty' "$credential_file")
    [[ -n "$public_key" ]] || return 1

    local result
    result=$(curl -s "$(get_rpc_url)" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":\"dontcare\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key\",\"finality\":\"final\",\"account_id\":\"$account_id\",\"public_key\":\"$public_key\"}}")

    echo "$result" | jq -e '.result.nonce != null' >/dev/null 2>&1
}

call_as() {
    local account_id="$1"
    local method="$2"
    local args="$3"
    local deposit_flag="$4"
    local deposit_value="$5"

    log_info "Calling $CONTRACT.$method as $account_id..."

    near call "$CONTRACT" "$method" "$args" \
        --accountId "$account_id" \
        "$deposit_flag" "$deposit_value" \
        --gas 300000000000000 \
        --networkId "$NETWORK" 2>&1
}

call_as_and_wait() {
    local account_id="$1"
    local method="$2"
    local args="$3"
    local deposit_flag="$4"
    local deposit_value="$5"

    local tx_output
    tx_output=$(call_as "$account_id" "$method" "$args" "$deposit_flag" "$deposit_value")
    echo "$tx_output" | grep -v '^null$'

    if echo "$tx_output" | grep -q 'Error\|error\|FAILED'; then
        log_error "Contract call failed"
        return 1
    fi

    LAST_EVENT_BLOCK=$(extract_index_target_block "$tx_output" "$account_id")
    if [[ -n "$LAST_EVENT_BLOCK" ]]; then
        log_info "Event at block $LAST_EVENT_BLOCK, waiting for indexer..."
        wait_for_block "$LAST_EVENT_BLOCK"
        return 0
    fi

    log_error "Could not extract block height from token transaction"
    echo "$tx_output" | tail -5
    return 1
}

wait_for_hasura_match() {
    local description="$1"
    local query="$2"
    local jq_path="$3"
    local max_retries="${4:-$MAX_WAIT_RETRIES}"
    local retry_delay="${5:-$WAIT_RETRY_DELAY}"

    local result
    for ((i=1; i<=max_retries; i++)); do
        result=$(query_hasura "$query")
        if echo "$result" | jq -e "$jq_path" >/dev/null 2>&1; then
            echo "$result"
            return 0
        fi

        log_info "Waiting for $description in Hasura (attempt $i/$max_retries)..."
        sleep "$retry_delay"
    done

    log_error "Timed out waiting for $description in Hasura"
    echo "$result"
    return 1
}

require_write_env() {
    if ! has_live_local_access_key "$TOKEN_SENDER"; then
        log_error "TOKEN_SENDER is not signable with a live local credential: $TOKEN_SENDER"
        exit 1
    fi

    if ! has_live_local_access_key "$TOKEN_RECEIVER"; then
        log_error "TOKEN_RECEIVER is not signable with a live local credential: $TOKEN_RECEIVER"
        exit 1
    fi

    local sender_balance
    sender_balance=$(near view "$CONTRACT" ft_balance_of "{\"account_id\":\"$TOKEN_SENDER\"}" --networkId "$NETWORK" | jq -r '.')
    if [[ ! "$sender_balance" =~ ^[0-9]+$ ]] || [[ "$sender_balance" -lt "$TOKEN_TRANSFER_AMOUNT" ]]; then
        log_error "TOKEN_SENDER does not have enough token balance for transfer: $TOKEN_SENDER"
        echo "Balance: $sender_balance, required: $TOKEN_TRANSFER_AMOUNT"
        exit 1
    fi

    local receiver_storage
    receiver_storage=$(near view "$CONTRACT" storage_balance_of "{\"account_id\":\"$TOKEN_RECEIVER\"}" --networkId "$NETWORK" | jq -c '.')
    if [[ "$receiver_storage" == "null" ]]; then
        log_error "TOKEN_RECEIVER is not storage-registered on $CONTRACT: $TOKEN_RECEIVER"
        exit 1
    fi
}

verify_historical_mint() {
    local result
    result=$(wait_for_hasura_match \
        "tokenEvents.ft_mint" \
        '{ tokenEvents(where: {eventType: {_eq: "ft_mint"}}, limit: 1, orderBy: {blockHeight: DESC}) { id eventType ownerId amount blockHeight blockTimestamp receiptId } }' \
        '.data.tokenEvents[0]') || {
        test_failed "Historical ft_mint not found in Hasura"
        return 1
    }

    local entry='.data.tokenEvents[0]'
    echo "Verifying historical ft_mint fields:"
    assert_field "$result" "$entry.eventType" "ft_mint" "eventType = ft_mint"
    assert_field_exists "$result" "$entry.ownerId" "ownerId exists"
    assert_field_exists "$result" "$entry.amount" "amount exists"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"

    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "Historical ft_mint verified"
        return 0
    fi

    test_failed "Historical ft_mint has field mismatches"
    return 1
}

verify_live_transfer() {
    local min_block="$1"
    local query
    query="{ tokenEvents(where: {eventType: {_eq: \"ft_transfer\"}, oldOwnerId: {_eq: \"$TOKEN_SENDER\"}, newOwnerId: {_eq: \"$TOKEN_RECEIVER\"}, memo: {_eq: \"$TOKEN_TRANSFER_MEMO\"}, blockHeight: {_gte: \"$min_block\"}}, limit: 1, orderBy: {blockHeight: DESC}) { id eventType oldOwnerId newOwnerId amount memo blockHeight blockTimestamp receiptId } }"

    local result
    result=$(wait_for_hasura_match "tokenEvents.ft_transfer" "$query" '.data.tokenEvents[0]') || {
        test_failed "Live ft_transfer not found in Hasura"
        return 1
    }

    local entry='.data.tokenEvents[0]'
    echo "Verifying live ft_transfer fields:"
    assert_field "$result" "$entry.eventType" "ft_transfer" "eventType = ft_transfer"
    assert_field "$result" "$entry.oldOwnerId" "$TOKEN_SENDER" "oldOwnerId = sender"
    assert_field "$result" "$entry.newOwnerId" "$TOKEN_RECEIVER" "newOwnerId = receiver"
    assert_field "$result" "$entry.amount" "$TOKEN_TRANSFER_AMOUNT" "amount matches"
    assert_field "$result" "$entry.memo" "$TOKEN_TRANSFER_MEMO" "memo matches"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"

    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "Live ft_transfer verified"
        return 0
    fi

    test_failed "Live ft_transfer has field mismatches"
    return 1
}

verify_live_burn() {
    local min_block="$1"
    local query
    query="{ tokenEvents(where: {eventType: {_eq: \"ft_burn\"}, ownerId: {_eq: \"$TOKEN_RECEIVER\"}, amount: {_eq: \"$TOKEN_BURN_AMOUNT\"}, blockHeight: {_gte: \"$min_block\"}}, limit: 1, orderBy: {blockHeight: DESC}) { id eventType ownerId amount memo blockHeight blockTimestamp receiptId } }"

    local result
    result=$(wait_for_hasura_match "tokenEvents.ft_burn" "$query" '.data.tokenEvents[0]') || {
        test_failed "Live ft_burn not found in Hasura"
        return 1
    }

    local entry='.data.tokenEvents[0]'
    echo "Verifying live ft_burn fields:"
    assert_field "$result" "$entry.eventType" "ft_burn" "eventType = ft_burn"
    assert_field "$result" "$entry.ownerId" "$TOKEN_RECEIVER" "ownerId = burner"
    assert_field "$result" "$entry.amount" "$TOKEN_BURN_AMOUNT" "amount matches"
    assert_field_contains "$result" "$entry.memo" "User burn" "memo contains User burn"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"

    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "Live ft_burn verified"
        return 0
    fi

    test_failed "Live ft_burn has field mismatches"
    return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "tokenEvents table exists with expected columns"

result=$(query_hasura '{
  tokenEvents(limit: 1) {
    id
    blockHeight
    blockTimestamp
    receiptId
    eventType
    ownerId
    amount
    memo
    oldOwnerId
    newOwnerId
  }
}')

error=$(echo "$result" | jq -r '.errors[0].message // empty' 2>/dev/null)
if [[ -z "$error" ]]; then
    test_passed "tokenEvents table accessible with all columns"
else
    test_failed "tokenEvents table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Event type breakdown
# ─────────────────────────────────────────────────────────────────────────────
log_test "Token event type distribution"

TOKEN_OPS="ft_mint ft_burn ft_transfer"

for op in $TOKEN_OPS; do
    result=$(query_hasura "{ tokenEventsAggregate(where: {eventType: {_eq: \"$op\"}}) { aggregate { count } } }")
    count=$(echo "$result" | jq '.data.tokenEventsAggregate.aggregate.count // 0' 2>/dev/null)
    printf "  %-25s %s events\n" "$op" "$count"
done

# ─────────────────────────────────────────────────────────────────────────────
# Recent events query
# ─────────────────────────────────────────────────────────────────────────────
log_test "Recent token events (last 5)"

result=$(query_hasura '{
    tokenEvents(orderBy: {blockHeight: DESC}, limit: 5) {
    id
    eventType
    ownerId
    oldOwnerId
    newOwnerId
    amount
    blockHeight
  }
}')

count=$(echo "$result" | jq '.data.tokenEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count recent token events"
    echo "$result" | jq -r '.data.tokenEvents[] | "  \(.eventType) | owner=\(.ownerId // .oldOwnerId) | amt=\(.amount) | blk=\(.blockHeight)"' 2>/dev/null
else
    log_warn "No token events indexed yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Transfer validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "ft_transfer events have both oldOwnerId and newOwnerId"

result=$(query_hasura '{
  tokenEvents(where: {eventType: {_eq: "ft_transfer"}}, limit: 10) {
    oldOwnerId
    newOwnerId
    amount
  }
}')

count=$(echo "$result" | jq '.data.tokenEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    valid=true
    for i in $(seq 0 $((count - 1))); do
        old=$(echo "$result" | jq -r ".data.tokenEvents[$i].oldOwnerId // empty" 2>/dev/null)
        new=$(echo "$result" | jq -r ".data.tokenEvents[$i].newOwnerId // empty" 2>/dev/null)
        if [[ -z "$old" || -z "$new" ]]; then
            valid=false
            break
        fi
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All $count ft_transfer events have both owner fields"
    else
        test_failed "Some ft_transfer events missing owner fields"
    fi
else
    log_warn "No ft_transfer events to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Mint validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "ft_mint events have ownerId and amount"

result=$(query_hasura '{
  tokenEvents(where: {eventType: {_eq: "ft_mint"}}, limit: 10) {
    ownerId
    amount
  }
}')

count=$(echo "$result" | jq '.data.tokenEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    valid=true
    for i in $(seq 0 $((count - 1))); do
        owner=$(echo "$result" | jq -r ".data.tokenEvents[$i].ownerId // empty" 2>/dev/null)
        amt=$(echo "$result" | jq -r ".data.tokenEvents[$i].amount // empty" 2>/dev/null)
        if [[ -z "$owner" || -z "$amt" ]]; then
            valid=false
            break
        fi
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All $count ft_mint events have ownerId and amount"
    else
        test_failed "Some ft_mint events missing required fields"
    fi
else
    log_warn "No ft_mint events to validate"
fi

if [[ "$mode" == "write" || "$mode" == "all" ]]; then
    require_write_env

    log_test "Historical ft_mint sanity"
    verify_historical_mint

    log_test "Live ft_transfer indexing"
    call_as_and_wait "$TOKEN_SENDER" ft_transfer \
        "{\"receiver_id\":\"$TOKEN_RECEIVER\",\"amount\":\"$TOKEN_TRANSFER_AMOUNT\",\"memo\":\"$TOKEN_TRANSFER_MEMO\"}" \
        --depositYocto 1 || exit 1
    verify_live_transfer "$LAST_EVENT_BLOCK"

    log_test "Live ft_burn indexing"
    call_as_and_wait "$TOKEN_RECEIVER" burn \
        "{\"amount\":\"$TOKEN_BURN_AMOUNT\"}" \
        --depositYocto 1 || exit 1
    verify_live_burn "$LAST_EVENT_BLOCK"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
print_summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Token Events Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
