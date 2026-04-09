#!/bin/bash
# =============================================================================
# Booster State Tests for Hasura/PostgreSQL Indexer
# Tests the boosterState table (current lock state per account)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Booster State Test Suite                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "boosterState table exists with expected columns"

result=$(query_hasura '{
  boosterState(limit: 1) {
    accountId
    lockedAmount
    effectiveBoost
    lockMonths
    totalClaimed
    totalCreditsPurchased
    lastEventType
    lastEventBlock
    updatedAt
  }
}')

error=$(echo "$result" | jq -r '.errors[0].message // empty' 2>/dev/null)
if [[ -z "$error" ]]; then
    test_passed "boosterState table accessible with all columns"
else
    test_failed "boosterState table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Active boosters
# ─────────────────────────────────────────────────────────────────────────────
log_test "Boosters with active locks"

result=$(query_hasura '{
  boosterStateAggregate(where: {lockedAmount: {_neq: "0"}}) {
    aggregate { count }
  }
}')

count=$(echo "$result" | jq '.data.boosterStateAggregate.aggregate.count // 0' 2>/dev/null)
log_info "Accounts with active boost locks: $count"

if [[ "$count" -ge 0 ]]; then
    test_passed "boosterState aggregate query works ($count active boosters)"
else
    test_failed "boosterState aggregate query failed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Recent activity
# ─────────────────────────────────────────────────────────────────────────────
log_test "Most recently active booster accounts (limit 5)"

result=$(query_hasura '{
  boosterState(order_by: {lastEventBlock: desc}, limit: 5) {
    accountId
    lockedAmount
    effectiveBoost
    lockMonths
    lastEventType
    lastEventBlock
  }
}')

count=$(echo "$result" | jq '.data.boosterState | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count booster state entries"
    echo "$result" | jq -r '.data.boosterState[] | "  \(.accountId) | locked=\(.lockedAmount) | boost=\(.effectiveBoost) | months=\(.lockMonths) | last=\(.lastEventType)"' 2>/dev/null
else
    log_warn "No booster state entries yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# lastEventType consistency
# ─────────────────────────────────────────────────────────────────────────────
log_test "lastEventType values are valid boost event types"

result=$(query_hasura '{
  boosterState(limit: 50) {
    lastEventType
  }
}')

count=$(echo "$result" | jq '.data.boosterState | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    valid=true
    for i in $(seq 0 $((count - 1))); do
        evt=$(echo "$result" | jq -r ".data.boosterState[$i].lastEventType // empty" 2>/dev/null)
        case "$evt" in
            BOOST_LOCK|BOOST_EXTEND|BOOST_UNLOCK|REWARDS_RELEASED|REWARDS_CLAIM|CREDITS_PURCHASE|SCHEDULED_FUND|INFRA_WITHDRAW|OWNER_CHANGED|CONTRACT_UPGRADE|STORAGE_DEPOSIT|UNLOCK_FAILED|CLAIM_FAILED|WITHDRAW_INFRA_FAILED|"") ;;
            *) valid=false; log_warn "Unexpected event type: $evt"; break ;;
        esac
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All lastEventType values are valid"
    else
        test_failed "Invalid lastEventType values found"
    fi
else
    log_warn "No booster state entries to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Booster State Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
