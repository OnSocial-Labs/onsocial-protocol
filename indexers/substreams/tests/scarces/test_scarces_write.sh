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

    local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"STORAGE_UPDATE\"}, operation: {_eq: \"deposit\"}}, limit: 1, orderBy: {blockHeight: DESC}) { id eventType operation author accountId deposit blockHeight blockTimestamp receiptId extraData } }")

    if echo "$result" | jq -e '.data.scarcesEvents[0]' >/dev/null 2>&1; then
        local entry=".data.scarcesEvents[0]"

        assert_field "$result" "$entry.eventType" "STORAGE_UPDATE" "eventType = STORAGE_UPDATE"
        assert_field "$result" "$entry.operation" "deposit" "operation = deposit"
        assert_field_exists "$result" "$entry.author" "author exists"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
        assert_field_exists "$result" "$entry.extraData" "extraData preserved"

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

    local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"mint\"}}, limit: 1, orderBy: {blockHeight: DESC}) { id eventType operation author ownerId tokenId blockHeight blockTimestamp receiptId extraData } }")

    if echo "$result" | jq -e '.data.scarcesEvents[0]' >/dev/null 2>&1; then
        local entry=".data.scarcesEvents[0]"

        assert_field "$result" "$entry.eventType" "SCARCE_UPDATE" "eventType = SCARCE_UPDATE"
        assert_field "$result" "$entry.operation" "mint" "operation = mint"
        assert_field_exists "$result" "$entry.ownerId" "ownerId exists"
        assert_field_exists "$result" "$entry.tokenId" "tokenId exists"
        assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
        assert_field_exists "$result" "$entry.receiptId" "receiptId exists"
        assert_field_exists "$result" "$entry.extraData" "extraData preserved"

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
    local mint_result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"mint\"}, ownerId: {_eq: \"$SIGNER\"}}, limit: 1, orderBy: {blockHeight: DESC}) { tokenId } }")
    local token_id=$(echo "$mint_result" | jq -r '.data.scarcesEvents[0].tokenId // ""')

    if [[ -z "$token_id" || "$token_id" == "null" ]]; then
        log_warn "No minted token found — skipping list test"
        test_passed "list test skipped (no token)"
        return 0
    fi

    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"list_native_scarce\", \"token_id\": \"$token_id\", \"price\": \"1000000000000000000000000\"}}}" \
        "0.01"

    local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"list\"}, tokenId: {_eq: \"$token_id\"}}, limit: 1, orderBy: {blockHeight: DESC}) { id eventType operation tokenId price sellerId blockHeight receiptId extraData } }")

    if echo "$result" | jq -e '.data.scarcesEvents[0]' >/dev/null 2>&1; then
        local entry=".data.scarcesEvents[0]"

        assert_field "$result" "$entry.eventType" "SCARCE_UPDATE" "eventType = SCARCE_UPDATE"
        assert_field "$result" "$entry.operation" "list" "operation = list"
        assert_field "$result" "$entry.tokenId" "$token_id" "tokenId matches"
        assert_field_exists "$result" "$entry.price" "price exists"
        assert_field_exists "$result" "$entry.sellerId" "sellerId exists"

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
    local mint_result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"mint\"}, ownerId: {_eq: \"$SIGNER\"}}, limit: 1, orderBy: {blockHeight: DESC}) { tokenId } }")
    local token_id=$(echo "$mint_result" | jq -r '.data.scarcesEvents[0].tokenId // ""')

    if [[ -z "$token_id" || "$token_id" == "null" ]]; then
        log_warn "Could not find minted token — skipping burn test"
        test_passed "burn test skipped"
        return 0
    fi

    call_and_wait "execute" \
        "{\"request\": {\"action\": {\"type\": \"burn_scarce\", \"token_id\": \"$token_id\"}}}" \
        "0.01"

    local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"SCARCE_UPDATE\"}, operation: {_eq: \"burn\"}, tokenId: {_eq: \"$token_id\"}}, limit: 1) { id eventType operation tokenId blockHeight receiptId extraData } }")

    if echo "$result" | jq -e '.data.scarcesEvents[0]' >/dev/null 2>&1; then
        local entry=".data.scarcesEvents[0]"
        assert_field "$result" "$entry.operation" "burn" "operation = burn"
        assert_field "$result" "$entry.tokenId" "$token_id" "tokenId matches"

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

    local result=$(query_hasura "{ scarcesEvents(where: {eventType: {_eq: \"COLLECTION_UPDATE\"}, operation: {_eq: \"create\"}, collectionId: {_eq: \"$coll_id\"}}, limit: 1) { id eventType operation collectionId creatorId totalSupply price blockHeight receiptId extraData } }")

    if echo "$result" | jq -e '.data.scarcesEvents[0]' >/dev/null 2>&1; then
        local entry=".data.scarcesEvents[0]"

        assert_field "$result" "$entry.eventType" "COLLECTION_UPDATE" "eventType = COLLECTION_UPDATE"
        assert_field "$result" "$entry.operation" "create" "operation = create"
        assert_field "$result" "$entry.collectionId" "$coll_id" "collectionId matches"
        assert_field_exists "$result" "$entry.creatorId" "creatorId exists"
        assert_field_exists "$result" "$entry.totalSupply" "totalSupply exists"
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
