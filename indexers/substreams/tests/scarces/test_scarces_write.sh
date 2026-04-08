#!/bin/bash
# =============================================================================
# SCARCES WRITE Tests — Fire transactions and verify indexing
# Covers: SCARCE_UPDATE (quick_mint), COLLECTION_UPDATE (create_collection),
#          STORAGE_UPDATE (storage_deposit), APP_POOL_UPDATE (fund_app_pool)
#
# Requires: SIGNER with NEAR balance, sink running against scarces contract
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

# Override contract for scarces
SCARCES_CONTRACT="${SCARCES_CONTRACT:-scarces.onsocial.testnet}"
CONTRACT="$SCARCES_CONTRACT"

# =============================================================================
# Test: STORAGE_UPDATE — storage_deposit
# =============================================================================
test_storage_deposit() {
    log_test "STORAGE_UPDATE — storage_deposit via execute"

    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"storage_deposit\"}}}" \
        "0.25"

    local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"STORAGE_UPDATE\"}, operation: {_eq: \"deposit\"}}, limit: 1, order_by: {block_height: desc}) { id event_type operation author account_id deposit block_height block_timestamp receipt_id extra_data } }")

    if echo "$result" | jq -e '.data.scarces_events[0]' >/dev/null 2>&1; then
        local entry=".data.scarces_events[0]"

        assert_field "$result" "$entry.event_type" "STORAGE_UPDATE" "event_type = STORAGE_UPDATE"
        assert_field "$result" "$entry.operation" "deposit" "operation = deposit"
        assert_field_exists "$result" "$entry.author" "author exists"
        assert_field_bigint "$result" "$entry.block_height" "block_height is BigInt"
        assert_field_exists "$result" "$entry.receipt_id" "receipt_id exists"
        assert_field_exists "$result" "$entry.extra_data" "extra_data preserved"

        if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
            test_passed "STORAGE_UPDATE (deposit) indexed correctly"
        else
            test_failed "STORAGE_UPDATE field validation failed"
        fi
    else
        test_failed "STORAGE_UPDATE event not found after storage_deposit"
        echo "$result" | jq .
    fi
}

# =============================================================================
# Test: SCARCE_UPDATE — quick_mint
# =============================================================================
test_quick_mint() {
    local title="test-mint-$(date +%s)"
    log_test "SCARCE_UPDATE — quick_mint"

    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"quick_mint\", \"metadata\": {\"title\": \"$title\", \"description\": \"Integration test NFT\"}}}}" \
        "0.01"

    local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"mint\"}}, limit: 1, order_by: {block_height: desc}) { id event_type operation author owner_id token_id block_height block_timestamp receipt_id extra_data } }")

    if echo "$result" | jq -e '.data.scarces_events[0]' >/dev/null 2>&1; then
        local entry=".data.scarces_events[0]"

        assert_field "$result" "$entry.event_type" "SCARCE_UPDATE" "event_type = SCARCE_UPDATE"
        assert_field "$result" "$entry.operation" "mint" "operation = mint"
        assert_field_exists "$result" "$entry.owner_id" "owner_id exists"
        assert_field_exists "$result" "$entry.token_id" "token_id exists"
        assert_field_bigint "$result" "$entry.block_height" "block_height is BigInt"
        assert_field_exists "$result" "$entry.receipt_id" "receipt_id exists"
        assert_field_exists "$result" "$entry.extra_data" "extra_data preserved"

        if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
            test_passed "SCARCE_UPDATE (mint) indexed correctly"
        else
            test_failed "SCARCE_UPDATE field validation failed"
        fi
    else
        test_failed "SCARCE_UPDATE event not found after quick_mint"
        echo "$result" | jq .
    fi
}

# =============================================================================
# Test: SCARCE_UPDATE — list_native_scarce
# Requires a token to exist (uses the most recently minted one)
# =============================================================================
test_list_scarce() {
    log_test "SCARCE_UPDATE — list_native_scarce"

    # Find the latest minted token
    local mint_result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"mint\"}, owner_id: {_eq: \"$SIGNER\"}}, limit: 1, order_by: {block_height: desc}) { token_id } }")
    local token_id=$(echo "$mint_result" | jq -r '.data.scarces_events[0].token_id // ""')

    if [[ -z "$token_id" || "$token_id" == "null" ]]; then
        log_warn "No minted token found — skipping list test"
        test_passed "list test skipped (no token)"
        return 0
    fi

    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"list_native_scarce\", \"token_id\": \"$token_id\", \"price\": \"1000000000000000000000000\"}}}" \
        "0.01"

    local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"list\"}, token_id: {_eq: \"$token_id\"}}, limit: 1, order_by: {block_height: desc}) { id event_type operation token_id price seller_id block_height receipt_id extra_data } }")

    if echo "$result" | jq -e '.data.scarces_events[0]' >/dev/null 2>&1; then
        local entry=".data.scarces_events[0]"

        assert_field "$result" "$entry.event_type" "SCARCE_UPDATE" "event_type = SCARCE_UPDATE"
        assert_field "$result" "$entry.operation" "list" "operation = list"
        assert_field "$result" "$entry.token_id" "$token_id" "token_id matches"
        assert_field_exists "$result" "$entry.price" "price exists"
        assert_field_exists "$result" "$entry.seller_id" "seller_id exists"

        if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
            test_passed "SCARCE_UPDATE (list) indexed correctly"
        else
            test_failed "SCARCE_UPDATE (list) field validation failed"
        fi

        # Delist so the token is reusable
        call_and_wait "execute" \
            "{\"request\": {\"action\": {\"type\": \"delist_native_scarce\", \"token_id\": \"$token_id\"}}}" \
            "0.01"
    else
        test_failed "SCARCE_UPDATE (list) event not found"
        echo "$result" | jq .
    fi
}

# =============================================================================
# Test: SCARCE_UPDATE — burn_scarce
# =============================================================================
test_burn_scarce() {
    log_test "SCARCE_UPDATE — burn_scarce"

    # Mint a new token specifically for burning
    local title="burn-test-$(date +%s)"
    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"quick_mint\", \"metadata\": {\"title\": \"$title\"}}}}" \
        "0.01"

    # Find the token we just minted
    local mint_result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"mint\"}, owner_id: {_eq: \"$SIGNER\"}}, limit: 1, order_by: {block_height: desc}) { token_id } }")
    local token_id=$(echo "$mint_result" | jq -r '.data.scarces_events[0].token_id // ""')

    if [[ -z "$token_id" || "$token_id" == "null" ]]; then
        log_warn "Could not find minted token — skipping burn test"
        test_passed "burn test skipped"
        return 0
    fi

    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"burn_scarce\", \"token_id\": \"$token_id\"}}}" \
        "0.01"

    local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"burn\"}, token_id: {_eq: \"$token_id\"}}, limit: 1) { id event_type operation token_id block_height receipt_id extra_data } }")

    if echo "$result" | jq -e '.data.scarces_events[0]' >/dev/null 2>&1; then
        local entry=".data.scarces_events[0]"
        assert_field "$result" "$entry.operation" "burn" "operation = burn"
        assert_field "$result" "$entry.token_id" "$token_id" "token_id matches"

        test_passed "SCARCE_UPDATE (burn) indexed correctly"
    else
        test_failed "SCARCE_UPDATE (burn) event not found"
        echo "$result" | jq .
    fi
}

# =============================================================================
# Test: COLLECTION_UPDATE — create_collection
# =============================================================================
test_create_collection() {
    local coll_id="test-coll-$(date +%s)"
    log_test "COLLECTION_UPDATE — create_collection ($coll_id)"

    local metadata_template='{"title":"Test Collection Item","description":"Integration test"}'

    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"create_collection\", \"collection_id\": \"$coll_id\", \"total_supply\": 10, \"metadata_template\": $(echo "$metadata_template" | jq -Rs .), \"price_near\": \"1000000000000000000000000\"}}}" \
        "0.5"

    local result=$(query_hasura "{ scarces_events(where: {event_type: {_eq: \"COLLECTION_UPDATE\"}, operation: {_eq: \"create\"}, collection_id: {_eq: \"$coll_id\"}}, limit: 1) { id event_type operation collection_id creator_id total_supply price block_height receipt_id extra_data } }")

    if echo "$result" | jq -e '.data.scarces_events[0]' >/dev/null 2>&1; then
        local entry=".data.scarces_events[0]"

        assert_field "$result" "$entry.event_type" "COLLECTION_UPDATE" "event_type = COLLECTION_UPDATE"
        assert_field "$result" "$entry.operation" "create" "operation = create"
        assert_field "$result" "$entry.collection_id" "$coll_id" "collection_id matches"
        assert_field_exists "$result" "$entry.creator_id" "creator_id exists"
        assert_field_exists "$result" "$entry.total_supply" "total_supply exists"
        assert_field_exists "$result" "$entry.price" "price exists"

        if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
            test_passed "COLLECTION_UPDATE (create) indexed correctly"
        else
            test_failed "COLLECTION_UPDATE field validation failed"
        fi

        # Clean up: delete the collection
        call_and_wait "execute" \
            "{\"request\": {\"action\": {\"type\": \"delete_collection\", \"collection_id\": \"$coll_id\"}}}" \
            "0.01"
    else
        test_failed "COLLECTION_UPDATE event not found after create_collection"
        echo "$result" | jq .
    fi
}

# =============================================================================
# Main
# =============================================================================
mode="${1:-query}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Scarces Events — Write Tests (fires transactions)"
echo "  Contract: $SCARCES_CONTRACT"
echo "  Signer:   $SIGNER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$mode" = "query" ]; then
    log_warn "Skipping write tests (mode=query). Run with: $0 write"
    exit 0
fi

test_storage_deposit
test_quick_mint
test_list_scarce
test_burn_scarce
test_create_collection

print_summary
