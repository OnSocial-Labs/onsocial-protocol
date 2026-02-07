#!/bin/bash
# =============================================================================
# Credit Purchases Tests for Hasura/PostgreSQL Indexer
# Tests the creditPurchases table
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Credit Purchases Test Suite                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "creditPurchases table exists with expected columns"

result=$(query_hasura '{
  creditPurchases(limit: 1) {
    id
    blockHeight
    blockTimestamp
    receiptId
    accountId
    amount
    infraShare
    rewardsShare
  }
}')

error=$(echo "$result" | jq -r '.errors[0].message // empty' 2>/dev/null)
if [[ -z "$error" ]]; then
    test_passed "creditPurchases table accessible with all columns"
else
    test_failed "creditPurchases table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Recent credit purchases
# ─────────────────────────────────────────────────────────────────────────────
log_test "Recent credit purchases (last 5)"

result=$(query_hasura '{
  creditPurchases(order_by: {blockHeight: desc}, limit: 5) {
    id
    accountId
    amount
    infraShare
    rewardsShare
    blockHeight
  }
}')

count=$(echo "$result" | jq '.data.creditPurchases | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count recent credit purchases"
    echo "$result" | jq -r '.data.creditPurchases[] | "  \(.accountId) | amt=\(.amount) | infra=\(.infraShare) | rewards=\(.rewardsShare) | blk=\(.blockHeight)"' 2>/dev/null
else
    log_warn "No credit purchases indexed yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Share split validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "Credit purchase share splits are valid"

result=$(query_hasura '{
  creditPurchases(limit: 10) {
    amount
    infraShare
    rewardsShare
  }
}')

count=$(echo "$result" | jq '.data.creditPurchases | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    # Each purchase should have non-empty amount, infraShare, rewardsShare
    valid=true
    for i in $(seq 0 $((count - 1))); do
        amt=$(echo "$result" | jq -r ".data.creditPurchases[$i].amount // empty" 2>/dev/null)
        inf=$(echo "$result" | jq -r ".data.creditPurchases[$i].infraShare // empty" 2>/dev/null)
        rew=$(echo "$result" | jq -r ".data.creditPurchases[$i].rewardsShare // empty" 2>/dev/null)
        if [[ -z "$amt" || -z "$inf" || -z "$rew" ]]; then
            valid=false
            break
        fi
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All $count credit purchases have valid share splits"
    else
        test_failed "Some credit purchases have empty share fields"
    fi
else
    log_warn "No credit purchases to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Credit Purchases Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
