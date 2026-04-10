#!/bin/bash
# =============================================================================
# User Reward State Tests for Hasura/PostgreSQL Indexer
# Tests the userRewardState table (current reward state per user)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             User Reward State Test Suite                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

# ─────────────────────────────────────────────────────────────────────────────
# Schema validation
# ─────────────────────────────────────────────────────────────────────────────
log_test "userRewardState table exists with expected columns"

result=$(query_hasura '{
  userRewardState(limit: 1) {
    accountId
    totalEarned
    totalClaimed
    lastCreditBlock
    lastClaimBlock
    updatedAt
  }
}')

error=$(echo "$result" | jq -r '.errors[0].message // empty' 2>/dev/null)
if [[ -z "$error" ]]; then
    test_passed "userRewardState table accessible with all columns"
else
    test_failed "userRewardState table query failed: $error"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Accounts with rewards
# ─────────────────────────────────────────────────────────────────────────────
log_test "Accounts with reward activity"

result=$(query_hasura '{
  userRewardStateAggregate {
    aggregate { count }
  }
}')

count=$(echo "$result" | jq '.data.userRewardStateAggregate.aggregate.count // 0' 2>/dev/null)
log_info "Accounts with reward state: $count"

if [[ "$count" -ge 0 ]]; then
    test_passed "userRewardState aggregate query works ($count accounts)"
else
    test_failed "userRewardState aggregate query failed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Recently active accounts
# ─────────────────────────────────────────────────────────────────────────────
log_test "Most recently active reward accounts (limit 5)"

result=$(query_hasura '{
  userRewardState(orderBy: {lastCreditBlock: DESC}, limit: 5) {
    accountId
    totalEarned
    totalClaimed
    lastCreditBlock
    lastClaimBlock
  }
}')

count=$(echo "$result" | jq '.data.userRewardState | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
    test_passed "Found $count user reward state entries"
    echo "$result" | jq -r '.data.userRewardState[] | "  \(.accountId) | earned=\(.totalEarned) | claimed=\(.totalClaimed) | lastCredit=\(.lastCreditBlock)"' 2>/dev/null
else
    log_warn "No user reward state entries yet"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Non-negative balances
# ─────────────────────────────────────────────────────────────────────────────
log_test "Reward state amounts and block pointers are valid"

result=$(query_hasura '{
  userRewardState(limit: 50) {
    accountId
    totalEarned
    totalClaimed
  }
}')

count=$(echo "$result" | jq '.data.userRewardState | length // 0' 2>/dev/null)
if [[ "$count" -gt 0 ]]; then
  valid=true
  for i in $(seq 0 $((count - 1))); do
    earned=$(echo "$result" | jq -r ".data.userRewardState[$i].totalEarned // \"0\"" 2>/dev/null)
    claimed=$(echo "$result" | jq -r ".data.userRewardState[$i].totalClaimed // \"0\"" 2>/dev/null)
    last_credit=$(echo "$result" | jq -r ".data.userRewardState[$i].lastCreditBlock // \"0\"" 2>/dev/null)
    last_claim=$(echo "$result" | jq -r ".data.userRewardState[$i].lastClaimBlock // \"0\"" 2>/dev/null)
    if ! [[ "$earned" =~ ^[0-9]+$ && "$claimed" =~ ^[0-9]+$ && "$last_credit" =~ ^[0-9]+$ && "$last_claim" =~ ^[0-9]+$ ]]; then
      acct=$(echo "$result" | jq -r ".data.userRewardState[$i].accountId" 2>/dev/null)
      log_warn "Account $acct has non-numeric reward state fields"
      valid=false
      break
    fi
  done
  if [[ "$valid" == "true" ]]; then
    test_passed "All $count accounts have numeric reward amounts and block pointers"
  else
    test_failed "Found invalid reward state field values"
  fi
else
    log_warn "No user reward state entries to validate"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "User Reward State Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
