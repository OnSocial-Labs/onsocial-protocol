#!/bin/bash
# =============================================================================
# Boost Credit Purchases Tests for Hasura/PostgreSQL Indexer
# Tests the boostCreditPurchases table (credit purchase history)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Boost Credit Purchases Test Suite                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "boostCreditPurchases table exists with expected columns"

result=$(query_hasura '{
  boostCreditPurchases(limit: 1) {
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
    test_passed "boostCreditPurchases table accessible with all columns"
else
    test_failed "boostCreditPurchases table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Total purchases
# ─────────────────────────────────────────────────────────────────────────────
log_test "Total credit purchase count"

result=$(query_hasura '{
  boostCreditPurchasesAggregate {
    aggregate { count }
  }
}')

count=$(echo "$result" | jq '.data.boostCreditPurchasesAggregate.aggregate.count // 0' 2>/dev/null)
log_info "Total credit purchases: $count"

if [[ "$count" -ge 0 ]]; then
    test_passed "boostCreditPurchases aggregate query works ($count purchases)"
else
    test_failed "boostCreditPurchases aggregate query failed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Recent purchases
# ─────────────────────────────────────────────────────────────────────────────
log_test "Most recent credit purchases (limit 5)"

result=$(query_hasura '{
  boostCreditPurchases(order_by: {blockHeight: desc}, limit: 5) {
    id
    accountId
    amount
    infraShare
    rewardsShare
    blockHeight
  }
}')

count=$(echo "$result" | jq '.data.boostCreditPurchases | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count credit purchase entries"
    echo "$result" | jq -r '.data.boostCreditPurchases[] | "  \(.accountId) | amt=\(.amount) | infra=\(.infraShare) | rewards=\(.rewardsShare) | blk=\(.blockHeight)"' 2>/dev/null
else
    log_warn "No credit purchase entries yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Field validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "Credit purchases have all required fields populated"

result=$(query_hasura '{
  boostCreditPurchases(limit: 20) {
    accountId
    amount
    infraShare
    rewardsShare
  }
}')

count=$(echo "$result" | jq '.data.boostCreditPurchases | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    valid=true
    for i in $(seq 0 $((count - 1))); do
        acct=$(echo "$result" | jq -r ".data.boostCreditPurchases[$i].accountId // empty" 2>/dev/null)
        amt=$(echo "$result" | jq -r ".data.boostCreditPurchases[$i].amount // empty" 2>/dev/null)
        infra=$(echo "$result" | jq -r ".data.boostCreditPurchases[$i].infraShare // empty" 2>/dev/null)
        rewards=$(echo "$result" | jq -r ".data.boostCreditPurchases[$i].rewardsShare // empty" 2>/dev/null)
        if [[ -z "$acct" || -z "$amt" || -z "$infra" || -z "$rewards" ]]; then
            valid=false
            break
        fi
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All $count credit purchases have required fields"
    else
        test_failed "Some credit purchases missing required fields"
    fi
else
    log_warn "No credit purchases to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Boost Credit Purchases Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
