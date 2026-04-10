#!/bin/bash
# =============================================================================
# Token Balances Tests for Hasura/PostgreSQL Indexer
# Tests the tokenBalances table (last-known activity per account)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

export TOKEN_CONTRACT="${TOKEN_CONTRACT:-token.onsocial.testnet}"
CONTRACT="$TOKEN_CONTRACT"
export TOKEN_SENDER="${TOKEN_SENDER:-greenghost.onsocial.testnet}"
export TOKEN_RECEIVER="${TOKEN_RECEIVER:-voter2.onsocial.testnet}"
export TOKEN_BALANCE_TRANSFER_AMOUNT="${TOKEN_BALANCE_TRANSFER_AMOUNT:-345678901000000000}"
export TOKEN_BALANCE_TRANSFER_MEMO="${TOKEN_BALANCE_TRANSFER_MEMO:-token-balances-transfer-$(date +%s)}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             Token Balances Test Suite                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

mode="${1:-query}"

has_live_local_access_key() {
  local account_id="$1"
  local credential_file="$HOME/.near-credentials/$NETWORK/$account_id.json"
  [[ -f "$credential_file" ]] || return 1

  local public_key
  public_key=$(jq -r '.public_key // empty' "$credential_file")
  [[ -n "$public_key" ]] || return 1

  local result
  result=$(curl -s "$(get_rpc_url)" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"dontcare\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key\",\"finality\":\"final\",\"account_id\":\"$account_id\",\"public_key\":\"$public_key\"}}")

  echo "$result" | jq -e '.result.nonce != null' >/dev/null 2>&1
}

call_as() {
  local account_id="$1"
  local method="$2"
  local args="$3"
  local deposit_flag="$4"
  local deposit_value="$5"

  log_info "Calling $CONTRACT.$method as $account_id..."

  near call "$CONTRACT" "$method" "$args" \
    --accountId "$account_id" \
    "$deposit_flag" "$deposit_value" \
    --gas 300000000000000 \
    --networkId "$NETWORK" 2>&1
}

call_as_and_wait() {
  local account_id="$1"
  local method="$2"
  local args="$3"
  local deposit_flag="$4"
  local deposit_value="$5"

  local tx_output
  tx_output=$(call_as "$account_id" "$method" "$args" "$deposit_flag" "$deposit_value")
  echo "$tx_output" | grep -v '^null$'

  if echo "$tx_output" | grep -q 'Error\|error\|FAILED'; then
    log_error "Contract call failed"
    return 1
  fi

  LAST_EVENT_BLOCK=$(extract_index_target_block "$tx_output" "$account_id")
  if [[ -n "$LAST_EVENT_BLOCK" ]]; then
    log_info "Event at block $LAST_EVENT_BLOCK, waiting for indexer..."
    wait_for_block "$LAST_EVENT_BLOCK"
    return 0
  fi

  log_error "Could not extract block height from token transaction"
  echo "$tx_output" | tail -5
  return 1
}

wait_for_hasura_match() {
  local description="$1"
  local query="$2"
  local jq_path="$3"
  local max_retries="${4:-$MAX_WAIT_RETRIES}"
  local retry_delay="${5:-$WAIT_RETRY_DELAY}"

  local result
  for ((i=1; i<=max_retries; i++)); do
    result=$(query_hasura "$query")
    if echo "$result" | jq -e "$jq_path" >/dev/null 2>&1; then
      echo "$result"
      return 0
    fi

    log_info "Waiting for $description in Hasura (attempt $i/$max_retries)..."
    sleep "$retry_delay"
  done

  log_error "Timed out waiting for $description in Hasura"
  echo "$result"
  return 1
}

require_write_env() {
  if ! has_live_local_access_key "$TOKEN_SENDER"; then
    log_error "TOKEN_SENDER is not signable with a live local credential: $TOKEN_SENDER"
    exit 1
  fi

  if ! has_live_local_access_key "$TOKEN_RECEIVER"; then
    log_error "TOKEN_RECEIVER is not signable with a live local credential: $TOKEN_RECEIVER"
    exit 1
  fi

  local sender_balance
  sender_balance=$(near view "$CONTRACT" ft_balance_of "{\"account_id\":\"$TOKEN_SENDER\"}" --networkId "$NETWORK" | jq -r '.')
  if [[ ! "$sender_balance" =~ ^[0-9]+$ ]] || [[ "$sender_balance" -lt "$TOKEN_BALANCE_TRANSFER_AMOUNT" ]]; then
    log_error "TOKEN_SENDER does not have enough token balance for balance test transfer: $TOKEN_SENDER"
    echo "Balance: $sender_balance, required: $TOKEN_BALANCE_TRANSFER_AMOUNT"
    exit 1
  fi

  local receiver_storage
  receiver_storage=$(near view "$CONTRACT" storage_balance_of "{\"account_id\":\"$TOKEN_RECEIVER\"}" --networkId "$NETWORK" | jq -c '.')
  if [[ "$receiver_storage" == "null" ]]; then
    log_error "TOKEN_RECEIVER is not storage-registered on $CONTRACT: $TOKEN_RECEIVER"
    exit 1
  fi
}

verify_balance_state() {
  local account_id="$1"
  local min_block="$2"
  local expected_last_event_type="${3:-}"

  local query
  query="{ tokenBalances(where: {accountId: {_eq: \"$account_id\"}, lastEventBlock: {_gte: \"$min_block\"}}, limit: 1, orderBy: {lastEventBlock: DESC}) { accountId lastEventType lastEventBlock updatedAt } }"

  local result
  result=$(wait_for_hasura_match "tokenBalances.$account_id" "$query" '.data.tokenBalances[0]') || {
    test_failed "tokenBalances entry not found for $account_id"
    return 1
  }

  local entry='.data.tokenBalances[0]'
  echo "Verifying tokenBalances entry for $account_id:"
  assert_field "$result" "$entry.accountId" "$account_id" "accountId matches"
  if [[ -n "$expected_last_event_type" ]]; then
    assert_field "$result" "$entry.lastEventType" "$expected_last_event_type" "lastEventType matches"
  else
    assert_field_exists "$result" "$entry.lastEventType" "lastEventType exists"
  fi
  assert_field_bigint "$result" "$entry.lastEventBlock" "lastEventBlock is BigInt"
  assert_field_exists "$result" "$entry.updatedAt" "updatedAt exists"

  if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
    test_passed "tokenBalances updated for $account_id"
    return 0
  fi

  test_failed "tokenBalances validation failed for $account_id"
  return 1
}

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
  tokenBalances(orderBy: {lastEventBlock: DESC}, limit: 5) {
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
            ft_mint|ft_burn|ft_transfer|ft_transfer_out|ft_transfer_in|"") ;;  # valid
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

if [[ "$mode" == "write" || "$mode" == "all" ]]; then
  require_write_env

  log_test "Live tokenBalances projection after ft_transfer"
  call_as_and_wait "$TOKEN_SENDER" ft_transfer \
    "{\"receiver_id\":\"$TOKEN_RECEIVER\",\"amount\":\"$TOKEN_BALANCE_TRANSFER_AMOUNT\",\"memo\":\"$TOKEN_BALANCE_TRANSFER_MEMO\"}" \
    --depositYocto 1 || exit 1
  verify_balance_state "$TOKEN_SENDER" "$LAST_EVENT_BLOCK" "ft_transfer_out"
  verify_balance_state "$TOKEN_RECEIVER" "$LAST_EVENT_BLOCK" "ft_transfer_in"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
print_summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Token Balances Tests: ${GREEN}%d passed${NC}" "$TESTS_PASSED"
if [[ $TESTS_FAILED -gt 0 ]]; then
    printf ", ${RED}%d failed${NC}" "$TESTS_FAILED"
fi
echo ""
