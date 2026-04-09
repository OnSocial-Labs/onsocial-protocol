#!/bin/bash
# =============================================================================
# Rewards Event Tests for Hasura/PostgreSQL Indexer
# Tests: REWARD_CREDITED, REWARD_CLAIMED, CLAIM_FAILED, POOL_DEPOSIT,
#        OWNER_CHANGED, MAX_DAILY_UPDATED, EXECUTOR_ADDED, EXECUTOR_REMOVED,
#        CALLER_ADDED, CALLER_REMOVED, CONTRACT_UPGRADE
# Queries rewardsEvents table
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Rewards Events Test Suite                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "rewardsEvents table exists with expected columns"

result=$(query_hasura '{
  rewardsEvents(limit: 1) {
    id
    blockHeight
    blockTimestamp
    receiptId
    accountId
    eventType
    success
    amount
    source
    creditedBy
    appId
    newBalance
    oldOwner
    newOwner
    oldMax
    newMax
    executor
    caller
    oldVersion
    newVersion
    extraData
  }
}')

error=$(echo "$result" | jq -r '.errors[0].message // empty' 2>/dev/null)
if [[ -z "$error" ]]; then
    test_passed "rewardsEvents table accessible with all columns"
else
    test_failed "rewardsEvents table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Event type breakdown
# ─────────────────────────────────────────────────────────────────────────────
log_test "Rewards event type distribution"

REWARDS_OPS="REWARD_CREDITED REWARD_CLAIMED CLAIM_FAILED POOL_DEPOSIT OWNER_CHANGED MAX_DAILY_UPDATED EXECUTOR_ADDED EXECUTOR_REMOVED CALLER_ADDED CALLER_REMOVED CONTRACT_UPGRADE"

for op in $REWARDS_OPS; do
    result=$(query_hasura "{ rewardsEventsAggregate(where: {eventType: {_eq: \"$op\"}}) { aggregate { count } } }")
    count=$(echo "$result" | jq '.data.rewardsEventsAggregate.aggregate.count // 0' 2>/dev/null)
    printf "  %-25s %s events\n" "$op" "$count"
done

# ─────────────────────────────────────────────────────────────────────────────
# Recent events query
# ─────────────────────────────────────────────────────────────────────────────
log_test "Recent rewards events (last 5)"

result=$(query_hasura '{
  rewardsEvents(order_by: {blockHeight: desc}, limit: 5) {
    id
    eventType
    accountId
    amount
    source
    blockHeight
    success
  }
}')

count=$(echo "$result" | jq '.data.rewardsEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count recent rewards events"
    echo "$result" | jq -r '.data.rewardsEvents[] | "  \(.eventType) | acct=\(.accountId) | amt=\(.amount // "n/a") | src=\(.source // "n/a") | blk=\(.blockHeight)"' 2>/dev/null
else
    log_warn "No rewards events indexed yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# REWARD_CREDITED validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "REWARD_CREDITED events have amount and source"

result=$(query_hasura '{
  rewardsEvents(where: {eventType: {_eq: "REWARD_CREDITED"}}, limit: 10) {
    accountId
    amount
    source
    creditedBy
  }
}')

count=$(echo "$result" | jq '.data.rewardsEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    valid=true
    for i in $(seq 0 $((count - 1))); do
        amt=$(echo "$result" | jq -r ".data.rewardsEvents[$i].amount // empty" 2>/dev/null)
        if [[ -z "$amt" ]]; then
            valid=false
            break
        fi
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All $count REWARD_CREDITED events have amount"
    else
        test_failed "Some REWARD_CREDITED events missing amount"
    fi
else
    log_warn "No REWARD_CREDITED events to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# POOL_DEPOSIT validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "POOL_DEPOSIT events have amount and newBalance"

result=$(query_hasura '{
  rewardsEvents(where: {eventType: {_eq: "POOL_DEPOSIT"}}, limit: 10) {
    accountId
    amount
    newBalance
  }
}')

count=$(echo "$result" | jq '.data.rewardsEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    valid=true
    for i in $(seq 0 $((count - 1))); do
        amt=$(echo "$result" | jq -r ".data.rewardsEvents[$i].amount // empty" 2>/dev/null)
        bal=$(echo "$result" | jq -r ".data.rewardsEvents[$i].newBalance // empty" 2>/dev/null)
        if [[ -z "$amt" || -z "$bal" ]]; then
            valid=false
            break
        fi
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All $count POOL_DEPOSIT events have required fields"
    else
        test_failed "Some POOL_DEPOSIT events missing required fields"
    fi
else
    log_warn "No POOL_DEPOSIT events to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Rewards Events Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
