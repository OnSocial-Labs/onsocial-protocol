#!/bin/bash
# =============================================================================
# Core gap verification for live Hasura/Substreams indexing
# Verifies the remaining high-value core testnet event proofs:
# - CONTRACT_UPDATE: add/remove intents executor, update_config,
#   enter_read_only, resume_live, update_manager
# - STORAGE_UPDATE: group_sponsor_spend
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

export GAP_MANAGER="${GAP_MANAGER:-$SIGNER}"
export GAP_MEMBER="${GAP_MEMBER:-}"
export GAP_GROUP_ID="${GAP_GROUP_ID:-gap-sponsor-$(date +%s)}"
export GAP_TEMP_EXECUTOR="${GAP_TEMP_EXECUTOR:-exec-gap-$(date +%s).testnet}"

get_storage_balance_json() {
    local account_id="$1"
    near view "$CONTRACT" get_storage_balance "{\"account_id\":\"$account_id\"}" --networkId "$NETWORK" | jq -c '.'
}

has_live_local_access_key() {
    local account_id="$1"
    local credential_file="$HOME/.near-credentials/$NETWORK/$account_id.json"
    [[ -f "$credential_file" ]] || return 1

    local public_key
    public_key=$(jq -r '.public_key // empty' "$credential_file")
    [[ -n "$public_key" ]] || return 1

    local rpc_url
    rpc_url=$(get_rpc_url)

    local result
    result=$(curl -s "$rpc_url" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":\"dontcare\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key\",\"finality\":\"final\",\"account_id\":\"$account_id\",\"public_key\":\"$public_key\"}}")

    echo "$result" | jq -e '.result.nonce != null' >/dev/null 2>&1
}

is_clean_group_sponsor_member() {
    local account_id="$1"
    local storage_json
    storage_json=$(get_storage_balance_json "$account_id")

    if [[ "$storage_json" == "null" ]]; then
        return 0
    fi

    local platform_sponsored
    platform_sponsored=$(echo "$storage_json" | jq -r '.platform_sponsored // false')
    local balance
    balance=$(echo "$storage_json" | jq -r '.balance // "0"')
    local used_bytes
    used_bytes=$(echo "$storage_json" | jq -r '.used_bytes // 0')

    [[ "$platform_sponsored" == "false" && "$balance" == "0" && "$used_bytes" == "0" ]]
}

is_preferred_group_sponsor_member() {
    local account_id="$1"
    [[ "$account_id" =~ ^test[0-9]+\.onsocial\.testnet$ ]] && return 0
    [[ "$account_id" =~ ^gasprobe[0-9]+\.onsocial\.testnet$ ]] && return 0
    [[ "$account_id" =~ ^claimdrop[0-9]+\.onsocial\.testnet$ ]] && return 0
    [[ "$account_id" =~ ^greenghost\.onsocial\.testnet$ ]] && return 0
    [[ "$account_id" =~ ^voter[0-9]+\.onsocial\.testnet$ ]] && return 0
    [[ "$account_id" == "test-deployer.testnet" ]] && return 0
    return 1
}

is_excluded_group_sponsor_member() {
    local account_id="$1"
    [[ "$account_id" == "$CONTRACT" ]] && return 0
    [[ "$account_id" == "$GAP_MANAGER" ]] && return 0
    [[ "$account_id" =~ ^(boost|core|rewards|scarces|staking|token|shared_storage)\.onsocial\.testnet$ ]] && return 0
    [[ "$account_id" =~ ^(governance|governance-seed|treasury|onsocial)\.testnet$ ]] && return 0
    [[ "$account_id" =~ ^(governance|governance-seed|treasury|onsocial)\.onsocial\.testnet$ ]] && return 0
    [[ "$account_id" =~ ^founder-vesting(-fast)?\.onsocial\.testnet$ ]] && return 0
    [[ "$account_id" =~ ^relayer(_test[0-9]+_onsocial)?\.testnet$ ]] && return 0
    [[ "$account_id" =~ ^relayer_test[0-9]+_onsocial\.testnet$ ]] && return 0
    return 1
}

find_clean_member_candidate() {
    local creds_dir="$HOME/.near-credentials/$NETWORK"
    [[ -d "$creds_dir" ]] || return 1

    local accounts=()
    local account_id
    while IFS= read -r account_id; do
        [[ -n "$account_id" ]] || continue
        [[ "$account_id" == "-" ]] && continue
        [[ "$account_id" == *:Zone.Identifier ]] && continue
        is_excluded_group_sponsor_member "$account_id" && continue
        accounts+=("$account_id")
    done < <(find "$creds_dir" -maxdepth 1 -type f -name '*.json' -printf '%f\n' | sed 's/\.json$//' | sort -u)

    for account_id in "${accounts[@]}"; do
        if is_preferred_group_sponsor_member "$account_id" \
            && has_live_local_access_key "$account_id" \
            && is_clean_group_sponsor_member "$account_id"; then
            echo "$account_id"
            return 0
        fi
    done

    for account_id in "${accounts[@]}"; do
        if has_live_local_access_key "$account_id" && is_clean_group_sponsor_member "$account_id"; then
            echo "$account_id"
            return 0
        fi
    done

    return 1
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

    log_error "Could not extract block height from EVENT_JSON"
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

verify_contract_update() {
    local operation="$1"
    local author="$2"
    local min_block="$3"

    local query
    query="{ contractUpdates(where: {operation: {_eq: \"$operation\"}, author: {_eq: \"$author\"}, blockHeight: {_gte: \"$min_block\"}}, limit: 1, orderBy: {blockHeight: DESC}) { id operation author path blockHeight blockTimestamp receiptId } }"

    local result
    result=$(wait_for_hasura_match "contractUpdates.$operation" "$query" '.data.contractUpdates[0]') || {
        test_failed "CONTRACT_UPDATE ($operation) not found in Hasura"
        return 1
    }

    local entry='.data.contractUpdates[0]'
    echo "Verifying ContractUpdate fields for $operation:"
    assert_field "$result" "$entry.operation" "$operation" "operation = $operation"
    assert_field "$result" "$entry.author" "$author" "author = $author"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"

    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "CONTRACT_UPDATE ($operation) verified"
        echo "$result" | jq '.data.contractUpdates[0]'
        return 0
    fi

    test_failed "CONTRACT_UPDATE ($operation) has field mismatches"
    return 1
}

verify_group_sponsor_spend() {
    local group_id="$1"
    local member_id="$2"
    local min_block="$3"
    local suppress_failure="${4:-0}"

    local query
    query="{ storageUpdates(where: {operation: {_eq: \"group_sponsor_spend\"}, groupId: {_eq: \"$group_id\"}, author: {_eq: \"$member_id\"}, blockHeight: {_gte: \"$min_block\"}}, limit: 1, orderBy: {blockHeight: DESC}) { id operation author groupId bytes remainingAllowance amount blockHeight blockTimestamp receiptId } }"

    local result
    result=$(wait_for_hasura_match "storageUpdates.group_sponsor_spend" "$query" '.data.storageUpdates[0]') || {
        if [[ "$suppress_failure" != "1" ]]; then
            test_failed "STORAGE_UPDATE (group_sponsor_spend) not found in Hasura"
        fi
        return 1
    }

    local entry='.data.storageUpdates[0]'
    echo "Verifying StorageUpdate fields for group_sponsor_spend:"
    assert_field "$result" "$entry.operation" "group_sponsor_spend" "operation = group_sponsor_spend"
    assert_field "$result" "$entry.author" "$member_id" "author = member"
    assert_field "$result" "$entry.groupId" "$group_id" "groupId matches"
    assert_field_exists "$result" "$entry.bytes" "bytes exists"
    assert_field_exists "$result" "$entry.remainingAllowance" "remainingAllowance exists"
    assert_field_bigint "$result" "$entry.blockHeight" "blockHeight is BigInt"
    assert_field_bigint "$result" "$entry.blockTimestamp" "blockTimestamp is BigInt"
    assert_field_exists "$result" "$entry.receiptId" "receiptId exists"

    if [[ $ASSERTIONS_FAILED -eq 0 ]]; then
        test_passed "STORAGE_UPDATE (group_sponsor_spend) verified"
        echo "$result" | jq '.data.storageUpdates[0]'
        return 0
    fi

    test_failed "STORAGE_UPDATE (group_sponsor_spend) has field mismatches"
    return 1
}

has_platform_sponsor_after_block() {
    local member_id="$1"
    local min_block="$2"
    local query
    query="{ storageUpdates(where: {operation: {_eq: \"platform_sponsor\"}, author: {_eq: \"$member_id\"}, blockHeight: {_gte: \"$min_block\"}}, limit: 1, orderBy: {blockHeight: DESC}) { id } }"

    local result
    result=$(query_hasura "$query")
    echo "$result" | jq -e '.data.storageUpdates[0]' >/dev/null 2>&1
}

get_platform_allowance_json() {
    local account_id="$1"
    near view "$CONTRACT" get_platform_allowance "{\"account_id\":\"$account_id\"}" --networkId "$NETWORK" | jq -c '.'
}

build_large_text() {
    local size="$1"
    head -c "$size" /dev/zero | tr '\0' 'x'
}

get_group_write_args_for_slug() {
    local slug="$1"
    local text="$2"
    local group_key="$GAP_MEMBER/groups/$GAP_GROUP_ID/content/posts/$slug"
    jq -nc --arg key "$group_key" --arg text "$text" \
        '{request:{target_account:null,action:{type:"set",data:{($key):{text:$text}}},options:null,auth:null}}'
}

require_write_env() {
    if [[ -n "$GAP_MEMBER" ]]; then
        if has_live_local_access_key "$GAP_MEMBER" && is_clean_group_sponsor_member "$GAP_MEMBER"; then
            return 0
        fi

        local storage_json
        storage_json=$(get_storage_balance_json "$GAP_MEMBER")
        log_warn "Configured GAP_MEMBER is not suitable for group_sponsor_spend proof: $GAP_MEMBER"
        echo "$storage_json" | jq .
        if ! has_live_local_access_key "$GAP_MEMBER"; then
            log_warn "Configured GAP_MEMBER local credential does not match a live on-chain access key: $GAP_MEMBER"
        fi
    fi

    local candidate
    candidate=$(find_clean_member_candidate || true)
    if [[ -n "$candidate" ]]; then
        GAP_MEMBER="$candidate"
        export GAP_MEMBER
        log_info "Auto-selected clean GAP_MEMBER: $GAP_MEMBER"
        return 0
    fi

    log_error "No clean GAP_MEMBER account available for sponsorship verification"
    echo "Provide a local testnet account with no existing storage balance and no platform sponsorship."
    exit 1
}

get_current_manager() {
    near view "$CONTRACT" get_contract_info '{}' --networkId "$NETWORK" | jq -r '.manager'
}

get_update_config_args() {
    local config_json
    config_json=$(near view "$CONTRACT" get_config '{}' --networkId "$NETWORK")
    printf '%s\n' "$config_json" | jq -c '{update:{intents_executors:.intents_executors}}'
}

get_create_group_args() {
    jq -nc --arg group "$GAP_GROUP_ID" \
        '{request:{action:{type:"create_group",group_id:$group,config:{is_private:false}}}}'
}

get_add_group_member_args() {
    jq -nc --arg group "$GAP_GROUP_ID" --arg member "$GAP_MEMBER" \
        '{request:{action:{type:"add_group_member",group_id:$group,member_id:$member}}}'
}

get_fund_group_args() {
    jq -nc --arg group "$GAP_GROUP_ID" \
        '{request:{target_account:null,action:{type:"set",data:{
            "storage/group_pool_deposit":{
                group_id:$group,
                amount:"2000000000000000000000000"
            },
            "storage/group_sponsor_default_set":{
                group_id:$group,
                enabled:true,
                daily_refill_bytes:0,
                allowance_max_bytes:50000
            }
        }},options:null,auth:null}}'
}

get_group_write_args() {
    get_group_write_args_for_slug hello hello
}

test_gap_query() {
    log_test "Query gap-closing operations already indexed"

    local contract_result
    contract_result=$(query_hasura '{ contractUpdates(where: {operation: {_in: ["add_intents_executor", "remove_intents_executor", "update_config", "enter_read_only", "resume_live", "update_manager"]}}, limit: 20, orderBy: {blockHeight: DESC}) { operation author blockHeight } }')
    echo "$contract_result" | jq '.data.contractUpdates'

    local storage_result
    storage_result=$(query_hasura '{ storageUpdates(where: {operation: {_eq: "group_sponsor_spend"}}, limit: 10, orderBy: {blockHeight: DESC}) { operation author groupId blockHeight } }')
    echo "$storage_result" | jq '.data.storageUpdates'

    test_passed "Gap verification query complete"
    return 0
}

test_gap_write() {
    require_write_env

    local current_manager
    current_manager=$(get_current_manager)
    if [[ -z "$current_manager" || "$current_manager" == "null" ]]; then
        test_failed "Could not determine current manager"
        return 1
    fi

    log_info "Using manager: $current_manager"
    log_info "Using member: $GAP_MEMBER"
    log_info "Using group id: $GAP_GROUP_ID"
    log_info "Using temp executor: $GAP_TEMP_EXECUTOR"

    log_test "CONTRACT_UPDATE (add_intents_executor)"
    call_as_and_wait "$GAP_MANAGER" add_intents_executor \
        "{\"executor\":\"$GAP_TEMP_EXECUTOR\"}" \
        --depositYocto 1 || return 1
    verify_contract_update add_intents_executor "$GAP_MANAGER" "$LAST_EVENT_BLOCK" || return 1

    log_test "CONTRACT_UPDATE (remove_intents_executor)"
    call_as_and_wait "$GAP_MANAGER" remove_intents_executor \
        "{\"executor\":\"$GAP_TEMP_EXECUTOR\"}" \
        --depositYocto 1 || return 1
    verify_contract_update remove_intents_executor "$GAP_MANAGER" "$LAST_EVENT_BLOCK" || return 1

    log_test "CONTRACT_UPDATE (update_config)"
    local update_config_args
    update_config_args=$(get_update_config_args)
    call_as_and_wait "$GAP_MANAGER" update_config \
        "$update_config_args" \
        --depositYocto 1 || return 1
    verify_contract_update update_config "$GAP_MANAGER" "$LAST_EVENT_BLOCK" || return 1

    log_test "CONTRACT_UPDATE (enter_read_only)"
    call_as_and_wait "$GAP_MANAGER" enter_read_only '{}' --depositYocto 1 || return 1
    verify_contract_update enter_read_only "$GAP_MANAGER" "$LAST_EVENT_BLOCK" || return 1

    log_test "CONTRACT_UPDATE (resume_live)"
    call_as_and_wait "$GAP_MANAGER" resume_live '{}' --depositYocto 1 || return 1
    verify_contract_update resume_live "$GAP_MANAGER" "$LAST_EVENT_BLOCK" || return 1

    log_test "CONTRACT_UPDATE (update_manager)"
    call_as_and_wait "$current_manager" update_manager \
        "{\"new_manager\":\"$current_manager\"}" \
        --depositYocto 1 || return 1
    verify_contract_update update_manager "$current_manager" "$LAST_EVENT_BLOCK" || return 1

    log_test "GROUP_UPDATE / STORAGE_UPDATE sponsorship setup"
    call_as_and_wait "$GAP_MANAGER" execute "$(get_create_group_args)" --deposit 1 || return 1
    call_as_and_wait "$GAP_MANAGER" execute "$(get_add_group_member_args)" --deposit 1 || return 1
    call_as_and_wait "$GAP_MANAGER" execute "$(get_fund_group_args)" --deposit 2 || return 1

    log_test "STORAGE_UPDATE (group_sponsor_spend)"
    call_as_and_wait "$GAP_MEMBER" execute "$(get_group_write_args)" --deposit 0 || return 1

    if verify_group_sponsor_spend "$GAP_GROUP_ID" "$GAP_MEMBER" "$LAST_EVENT_BLOCK" 1; then
        return 0
    fi

    if has_platform_sponsor_after_block "$GAP_MEMBER" "$LAST_EVENT_BLOCK"; then
        log_warn "Initial group write used platform_sponsor before group sponsorship; forcing a larger write to exceed platform allowance"

        local allowance_json
        allowance_json=$(get_platform_allowance_json "$GAP_MEMBER")
        local current_allowance
        current_allowance=$(echo "$allowance_json" | jq -r '.current_allowance // 0')
        local write_size=$((current_allowance + 1024))
        if [[ "$write_size" -gt 9000 ]]; then
            write_size=9000
        fi

        local large_text
        large_text=$(build_large_text "$write_size")

        call_as_and_wait "$GAP_MEMBER" execute "$(get_group_write_args_for_slug sponsor-burst "$large_text")" --deposit 0 || return 1
        verify_group_sponsor_spend "$GAP_GROUP_ID" "$GAP_MEMBER" "$LAST_EVENT_BLOCK" || return 1
        return 0
    fi

    return 1

    return 0
}

show_usage() {
    echo "Usage: test_gap_verification.sh [mode]"
    echo ""
    echo "Modes:"
    echo "  query      - Read-only check for existing gap-closing events"
    echo "  write      - Execute core gap-closing calls and verify them in Hasura"
    echo "  all        - Same as write"
    echo ""
    echo "Environment:"
    echo "  GAP_MANAGER       - Manager signer for admin calls (default: SIGNER)"
    echo "  GAP_MEMBER        - Member signer used for group_sponsor_spend verification"
    echo "  GAP_GROUP_ID      - Group id to create for sponsorship flow"
    echo "  GAP_TEMP_EXECUTOR - Temporary executor account id for add/remove verification"
    echo ""
    echo "Example:"
    echo "  GAP_MEMBER=test04.onsocial.testnet ./core/test_gap_verification.sh write"
}

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   OnSocial Hasura Indexer - Core Gap Verification            ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Hasura:   $HASURA_URL"
echo "║  Contract: $CONTRACT"
echo "║  Signer:   $SIGNER"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

check_deps

case "${1:-query}" in
    query)
        test_gap_query
        ;;
    write|all)
        test_gap_write
        ;;
    -h|--help|help)
        show_usage
        exit 0
        ;;
    *)
        echo "❌ Unknown mode: $1"
        show_usage
        exit 1
        ;;
esac

print_summary