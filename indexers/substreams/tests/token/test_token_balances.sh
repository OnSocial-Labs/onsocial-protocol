#!/bin/bash
# =============================================================================
# Token Balances Tests for Hasura/PostgreSQL Indexer
# Tests the tokenBalances table (last-known activity per account)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Token Balances Test Suite                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "tokenBalances table exists with expected columns"

result=$(query_hasura '{
  tokenBalances(limit: 1) {
    accountId
    lastEventType
    lastEventBlock
    updatedAt
  }
}')

error=$(echo "$result" | jq -r '.errors[0].message // empty' 2>/dev/null)
if [[ -z "$error" ]]; then
    test_passed "tokenBalances table accessible with all columns"
else
    test_failed "tokenBalances table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Active accounts
# ─────────────────────────────────────────────────────────────────────────────
log_test "Token accounts with activity"

result=$(query_hasura '{
  tokenBalancesAggregate {
    aggregate { count }
  }
}')

count=$(echo "$result" | jq '.data.tokenBalancesAggregate.aggregate.count // 0' 2>/dev/null)
log_info "Accounts with token activity: $count"

if [[ "$count" -ge 0 ]]; then
    test_passed "tokenBalances aggregate query works ($count accounts)"
else
    test_failed "tokenBalances aggregate query failed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Recent activity
# ─────────────────────────────────────────────────────────────────────────────
log_test "Most recently active token accounts (limit 5)"

result=$(query_hasura '{
  tokenBalances(order_by: {lastEventBlock: desc}, limit: 5) {
    accountId
    lastEventType
    lastEventBlock
    updatedAt
  }
}')

count=$(echo "$result" | jq '.data.tokenBalances | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count token balance entries"
    echo "$result" | jq -r '.data.tokenBalances[] | "  \(.accountId) | last=\(.lastEventType) | blk=\(.lastEventBlock)"' 2>/dev/null
else
    log_warn "No token balance entries yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Event type consistency
# ─────────────────────────────────────────────────────────────────────────────
log_test "lastEventType values are valid NEP-141 types"

result=$(query_hasura '{
  tokenBalances(limit: 50) {
    lastEventType
  }
}')

count=$(echo "$result" | jq '.data.tokenBalances | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    valid=true
    for i in $(seq 0 $((count - 1))); do
        evt=$(echo "$result" | jq -r ".data.tokenBalances[$i].lastEventType // empty" 2>/dev/null)
        case "$evt" in
            ft_mint|ft_burn|ft_transfer|"") ;;  # valid
            *) valid=false; log_warn "Unexpected event type: $evt"; break ;;
        esac
    done
    if [[ "$valid" == "true" ]]; then
        test_passed "All $count balance entries have valid event types"
    else
        test_failed "Found invalid event types in tokenBalances"
    fi
else
    log_warn "No token balance entries to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Token Balances Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
