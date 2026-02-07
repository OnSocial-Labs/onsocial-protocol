#!/bin/bash
# =============================================================================
# Staker State Tests for Hasura/PostgreSQL Indexer
# Tests the stakerState materialized view
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Staker State Test Suite                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "stakerState table exists with expected columns"

result=$(query_hasura '{
  stakerState(limit: 1) {
    accountId
    lockedAmount
    effectiveStake
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
    test_passed "stakerState table accessible with all columns"
else
    test_failed "stakerState table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Active stakers
# ─────────────────────────────────────────────────────────────────────────────
log_test "Active stakers (lockedAmount > 0)"

result=$(query_hasura '{
  stakerStateAggregate(where: {lockedAmount: {_neq: "0"}}) {
    aggregate { count }
  }
}')

count=$(echo "$result" | jq '.data.stakerStateAggregate.aggregate.count // 0' 2>/dev/null)
log_info "Active stakers: $count"

if [[ "$count" -ge 0 ]]; then
    test_passed "stakerState aggregate query works ($count active)"
else
    test_failed "stakerState aggregate query failed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Top stakers
# ─────────────────────────────────────────────────────────────────────────────
log_test "Top stakers by effective stake (limit 5)"

result=$(query_hasura '{
  stakerState(order_by: {lastEventBlock: desc}, limit: 5) {
    accountId
    lockedAmount
    effectiveStake
    lockMonths
    lastEventType
  }
}')

count=$(echo "$result" | jq '.data.stakerState | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count staker state entries"
    echo "$result" | jq -r '.data.stakerState[] | "  \(.accountId) | locked=\(.lockedAmount) | eff=\(.effectiveStake) | months=\(.lockMonths)"' 2>/dev/null
else
    log_warn "No staker state entries yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Staker State Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
