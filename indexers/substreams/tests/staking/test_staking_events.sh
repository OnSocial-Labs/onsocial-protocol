#!/bin/bash
# =============================================================================
# STAKING Event Tests for Hasura/PostgreSQL Indexer
# Tests: stake, unstake, withdraw, reward_claim, credit_purchase, etc.
# Queries stakingEvents table
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Staking Events Test Suite                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "Staking events table exists with expected columns"

result=$(query_hasura '{
  stakingEvents(limit: 1) {
    id
    blockHeight
    blockTimestamp
    receiptId
    accountId
    eventType
    success
    amount
    effectiveStake
    months
    newMonths
    newEffective
    elapsedNs
    totalReleased
    remainingPool
    infraShare
    rewardsShare
    totalPool
    receiverId
    oldOwner
    newOwner
    oldVersion
    newVersion
    deposit
  }
}')

error=$(echo "$result" | jq -r '.errors[0].message // empty' 2>/dev/null)
if [[ -z "$error" ]]; then
    test_passed "stakingEvents table accessible with all columns"
else
    test_failed "stakingEvents table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Event type breakdown
# ─────────────────────────────────────────────────────────────────────────────
log_test "Staking event type distribution"

STAKING_OPS="stake unstake withdraw reward_claim pool_created pool_updated delegation_change slash credit_purchase credit_use credit_refund validator_added validator_removed epoch_reward"

for op in $STAKING_OPS; do
    result=$(query_hasura "{ stakingEventsAggregate(where: {eventType: {_eq: \"$op\"}}) { aggregate { count } } }")
    count=$(echo "$result" | jq '.data.stakingEventsAggregate.aggregate.count // 0' 2>/dev/null)
    printf "  %-25s %s events\n" "$op" "$count"
done

# ─────────────────────────────────────────────────────────────────────────────
# Recent events query
# ─────────────────────────────────────────────────────────────────────────────
log_test "Recent staking events (last 5)"

result=$(query_hasura '{
  stakingEvents(order_by: {blockHeight: desc}, limit: 5) {
    id
    eventType
    accountId
    amount
    blockHeight
  }
}')

count=$(echo "$result" | jq '.data.stakingEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count recent staking events"
    echo "$result" | jq -r '.data.stakingEvents[] | "  \(.eventType) | \(.accountId) | amt=\(.amount) | blk=\(.blockHeight)"' 2>/dev/null
else
    log_warn "No staking events indexed yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Block ordering validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "Block height ordering is monotonic"

result=$(query_hasura '{
  stakingEvents(order_by: {blockHeight: desc}, limit: 50) {
    blockHeight
  }
}')

count=$(echo "$result" | jq '.data.stakingEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 1 ]]; then
    # Verify descending order
    is_sorted=$(echo "$result" | jq '[.data.stakingEvents[].blockHeight] | . == (. | sort | reverse)' 2>/dev/null)
    if [[ "$is_sorted" == "true" ]]; then
        test_passed "Block heights are monotonically ordered ($count events checked)"
    else
        test_failed "Block heights are NOT monotonically ordered"
    fi
else
    log_warn "Not enough events to verify ordering"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Staking Events Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
