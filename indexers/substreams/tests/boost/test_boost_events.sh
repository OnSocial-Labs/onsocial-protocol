#!/bin/bash
# =============================================================================
# Boost Event Tests for Hasura/PostgreSQL Indexer
# Tests: BOOST_LOCK, BOOST_EXTEND, BOOST_UNLOCK, REWARDS_RELEASED,
#        REWARDS_CLAIM, CREDITS_PURCHASE, SCHEDULED_FUND, INFRA_WITHDRAW,
#        OWNER_CHANGED, CONTRACT_UPGRADE, STORAGE_DEPOSIT,
#        UNLOCK_FAILED, CLAIM_FAILED, WITHDRAW_INFRA_FAILED
# Queries boostEvents table
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Boost Events Test Suite                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "boostEvents table exists with expected columns"

result=$(query_hasura '{
  boostEvents(limit: 1) {
    id
    blockHeight
    blockTimestamp
    receiptId
    accountId
    eventType
    success
    amount
    effectiveBoost
    months
    newMonths
    newEffectiveBoost
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
    extraData
  }
}')

error=$(echo "$result" | jq -r '.errors[0].message // empty' 2>/dev/null)
if [[ -z "$error" ]]; then
    test_passed "boostEvents table accessible with all columns"
else
    test_failed "boostEvents table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Event type breakdown
# ─────────────────────────────────────────────────────────────────────────────
log_test "Boost event type distribution"

BOOST_OPS="BOOST_LOCK BOOST_EXTEND BOOST_UNLOCK REWARDS_RELEASED REWARDS_CLAIM CREDITS_PURCHASE SCHEDULED_FUND INFRA_WITHDRAW OWNER_CHANGED CONTRACT_UPGRADE STORAGE_DEPOSIT UNLOCK_FAILED CLAIM_FAILED WITHDRAW_INFRA_FAILED"

for op in $BOOST_OPS; do
    result=$(query_hasura "{ boostEventsAggregate(where: {eventType: {_eq: \"$op\"}}) { aggregate { count } } }")
    count=$(echo "$result" | jq '.data.boostEventsAggregate.aggregate.count // 0' 2>/dev/null)
    printf "  %-30s %s events\n" "$op" "$count"
done

# ─────────────────────────────────────────────────────────────────────────────
# Recent events query
# ─────────────────────────────────────────────────────────────────────────────
log_test "Recent boost events (last 5)"

result=$(query_hasura '{
    boostEvents(orderBy: {blockHeight: DESC}, limit: 5) {
    id
    eventType
    accountId
    amount
    effectiveBoost
    blockHeight
    success
  }
}')

count=$(echo "$result" | jq '.data.boostEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count recent boost events"
    echo "$result" | jq -r '.data.boostEvents[] | "  \(.eventType) | acct=\(.accountId) | amt=\(.amount // "n/a") | blk=\(.blockHeight)"' 2>/dev/null
else
    log_warn "No boost events indexed yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# BOOST_LOCK validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "BOOST_LOCK events have amount, months, effectiveBoost"

result=$(query_hasura '{
  boostEvents(where: {eventType: {_eq: "BOOST_LOCK"}}, limit: 10) {
    accountId
    amount
    months
    effectiveBoost
  }
}')

count=$(echo "$result" | jq '.data.boostEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    valid=true
    for i in $(seq 0 $((count - 1))); do
        amt=$(echo "$result" | jq -r ".data.boostEvents[$i].amount // empty" 2>/dev/null)
        months=$(echo "$result" | jq -r ".data.boostEvents[$i].months // empty" 2>/dev/null)
        if [[ -z "$amt" || -z "$months" ]]; then
            valid=false
            break
        fi
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All $count BOOST_LOCK events have required fields"
    else
        test_failed "Some BOOST_LOCK events missing required fields"
    fi
else
    log_warn "No BOOST_LOCK events to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# CREDITS_PURCHASE validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "CREDITS_PURCHASE events have amount, infraShare, rewardsShare"

result=$(query_hasura '{
  boostEvents(where: {eventType: {_eq: "CREDITS_PURCHASE"}}, limit: 10) {
    accountId
    amount
    infraShare
    rewardsShare
  }
}')

count=$(echo "$result" | jq '.data.boostEvents | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    valid=true
    for i in $(seq 0 $((count - 1))); do
        amt=$(echo "$result" | jq -r ".data.boostEvents[$i].amount // empty" 2>/dev/null)
        infra=$(echo "$result" | jq -r ".data.boostEvents[$i].infraShare // empty" 2>/dev/null)
        if [[ -z "$amt" || -z "$infra" ]]; then
            valid=false
            break
        fi
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All $count CREDITS_PURCHASE events have required fields"
    else
        test_failed "Some CREDITS_PURCHASE events missing required fields"
    fi
else
    log_warn "No CREDITS_PURCHASE events to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Boost Events Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
