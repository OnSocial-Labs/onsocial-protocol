#!/bin/bash
# =============================================================================
# Token (NEP-141) Event Tests for Hasura/PostgreSQL Indexer
# Tests: ft_mint, ft_burn, ft_transfer events
# Queries tokenEvents table
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Token Events Test Suite                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

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
  tokenEvents(order_by: {blockHeight: desc}, limit: 5) {
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

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Token Events Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
