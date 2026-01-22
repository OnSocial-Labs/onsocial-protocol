#!/bin/bash
# =============================================================================
# Subgraph Live Integration Tests
# Tests core-onsocial subgraph mapping against testnet
# =============================================================================

set -e

# Configuration
CONTRACT="core.onsocial.testnet"
SIGNER="onsocial.testnet"
SUBGRAPH_URL="https://api.studio.thegraph.com/query/1723512/onsocial-testnet/version/latest"
WAIT_TIME=30  # seconds to wait for indexing

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

query_subgraph() {
    local query="$1"
    curl -s "$SUBGRAPH_URL" \
        -H 'Content-Type: application/json' \
        -d "{\"query\":\"$query\"}"
}

wait_for_indexing() {
    log_info "Waiting ${WAIT_TIME}s for indexing..."
    sleep "$WAIT_TIME"
}

check_indexing_errors() {
    local result=$(query_subgraph '{ _meta { hasIndexingErrors block { number } } }')
    local has_errors=$(echo "$result" | jq -r '.data._meta.hasIndexingErrors')
    local block=$(echo "$result" | jq -r '.data._meta.block.number')
    
    if [ "$has_errors" = "true" ]; then
        log_error "Subgraph has indexing errors at block $block"
        return 1
    fi
    log_info "Subgraph healthy at block $block"
    return 0
}

# =============================================================================
# Test Functions
# =============================================================================

test_data_set() {
    local key="test-key-$(date +%s)"
    local value="test-value"
    
    log_info "TEST: DATA_UPDATE (set) - Setting data at profile/$key"
    
    # Data format: {"path/with/slash": "value"}
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"$value\"}}}}" \
        --accountId "$SIGNER" \
        --deposit 0.01 \
        --gas 30000000000000
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    # Query latest data updates
    local result=$(query_subgraph '{ dataUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation path value author } }')
    local path=$(echo "$result" | jq -r '.data.dataUpdates[0].path // ""')
    
    if [[ "$path" == *"$key"* ]]; then
        log_info "✅ DATA_UPDATE (set) indexed successfully"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        log_error "❌ DATA_UPDATE (set) not found in subgraph"
        echo "Expected path containing: $key"
        echo "Got: $path"
        return 1
    fi
}

test_data_delete() {
    local key="test-delete-$(date +%s)"
    
    log_info "TEST: DATA_UPDATE (delete) - First set, then delete"
    
    # First set
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": \"to-delete\"}}}}" \
        --accountId "$SIGNER" \
        --deposit 0.01 \
        --gas 30000000000000
    
    log_info "Set complete, now deleting by setting to null..."
    
    # Then delete by setting to null
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"set\", \"data\": {\"profile/$key\": null}}}}" \
        --accountId "$SIGNER" \
        --gas 30000000000000
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    # Check for remove operation
    local result=$(query_subgraph '{ dataUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation path } }')
    local op=$(echo "$result" | jq -r '.data.dataUpdates[0].operation // ""')
    
    if [[ "$op" == "remove" ]]; then
        log_info "✅ DATA_UPDATE (delete/remove) indexed successfully"
        echo "$result" | jq '.data.dataUpdates[0]'
        return 0
    else
        log_error "❌ DATA_UPDATE (remove) not found in subgraph"
        echo "Latest operations:"
        echo "$result" | jq '.data.dataUpdates'
        return 1
    fi
}

test_storage_deposit() {
    log_info "TEST: STORAGE_UPDATE (deposit)"
    
    near call "$CONTRACT" storage_deposit \
        '{}' \
        --accountId "$SIGNER" \
        --deposit 0.1 \
        --gas 30000000000000
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ storageUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc, where: {operation: "deposit"}) { id operation accountId attachedDeposit } }')
    local found=$(echo "$result" | jq -r '.data.storageUpdates | length')
    
    if [ "$found" -gt 0 ]; then
        log_info "✅ STORAGE_UPDATE (deposit) indexed successfully"
        echo "$result" | jq '.data.storageUpdates[0]'
        return 0
    else
        log_error "❌ STORAGE_UPDATE (deposit) not found in subgraph"
        return 1
    fi
}

test_group_create() {
    local group_id="test-group-$(date +%s)"
    
    log_info "TEST: GROUP_UPDATE (create_group) - Creating $group_id"
    
    # Use execute() with CreateGroup action
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"create_group\", \"group_id\": \"$group_id\", \"config\": {}}}}" \
        --accountId "$SIGNER" \
        --deposit 0.1 \
        --gas 100000000000000
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    # Query latest group updates and the group entity
    local result=$(query_subgraph '{ groupUpdates(first: 5, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId author } groups(first: 5, orderBy: createdAt, orderDirection: desc) { id owner createdAt } }')
    local latest_group=$(echo "$result" | jq -r '.data.groupUpdates[0].groupId // ""')
    
    if [[ "$latest_group" == "$group_id" ]]; then
        log_info "✅ GROUP_UPDATE (create_group) indexed successfully"
        echo "Events:"
        echo "$result" | jq '.data.groupUpdates[:3]'
        echo "Group entity:"
        echo "$result" | jq '.data.groups[0]'
        return 0
    else
        log_error "❌ GROUP_UPDATE (create_group) not found in subgraph"
        echo "Expected: $group_id"
        echo "Got: $latest_group"
        return 1
    fi
}

test_group_add_member() {
    local group_id="test-subgraph-group"  # Use existing group
    local member="test-member.testnet"
    
    log_info "TEST: GROUP_UPDATE (add_member) - Adding $member to $group_id"
    
    # Use execute() with AddGroupMember action
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$member\"}}}" \
        --accountId "$SIGNER" \
        --gas 50000000000000
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ groupUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId } }')
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "add_member" ]]; then
        log_info "✅ GROUP_UPDATE (add_member) indexed successfully"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        log_error "❌ GROUP_UPDATE (add_member) not found in subgraph"
        return 1
    fi
}

test_permission_grant() {
    local path="profile/test-perm-$(date +%s)"
    local grantee="test-grantee.testnet"
    
    log_info "TEST: PERMISSION_UPDATE (grant) - Granting write access to $grantee on $path"
    
    # SetPermission: level 2 = write
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 2}}}" \
        --accountId "$SIGNER" \
        --gas 50000000000000
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ permissionUpdates(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id operation granterId granteeId path level } }')
    local op=$(echo "$result" | jq -r '.data.permissionUpdates[0].operation // ""')
    
    if [[ "$op" == "grant" ]]; then
        log_info "✅ PERMISSION_UPDATE (grant) indexed successfully"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 0
    else
        log_error "❌ PERMISSION_UPDATE (grant) not found in subgraph"
        echo "Got operation: $op"
        return 1
    fi
}

test_status() {
    log_info "Checking subgraph status..."
    
    local result=$(query_subgraph '{ _meta { hasIndexingErrors block { number } } dataUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation } storageUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation } groupUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation } permissionUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation } accounts(first: 3) { id } groups(first: 3) { id } }')
    
    echo "$result" | jq '.'
}

test_group_remove_member() {
    local group_id="test-group-1769031904"  # Use recently created group
    local member="temp-member.testnet"
    
    log_info "TEST: GROUP_UPDATE (remove_member) - First add, then remove $member from $group_id"
    
    # First add a member
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"add_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$member\"}}}" \
        --accountId "$SIGNER" \
        --gas 50000000000000
    
    log_info "Member added, now removing..."
    
    # Then remove them
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"remove_group_member\", \"group_id\": \"$group_id\", \"member_id\": \"$member\"}}}" \
        --accountId "$SIGNER" \
        --gas 50000000000000
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ groupUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId memberId } }')
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "remove_member" ]]; then
        log_info "✅ GROUP_UPDATE (remove_member) indexed successfully"
        echo "$result" | jq '.data.groupUpdates[0]'
        return 0
    else
        log_error "❌ GROUP_UPDATE (remove_member) not found"
        echo "Latest operations:"
        echo "$result" | jq '.data.groupUpdates'
        return 1
    fi
}

test_permission_revoke() {
    local path="profile/test-revoke-$(date +%s)"
    local grantee="revoke-test.testnet"
    
    log_info "TEST: PERMISSION_UPDATE (revoke) - First grant, then revoke"
    
    # First grant
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 2}}}" \
        --accountId "$SIGNER" \
        --gas 50000000000000
    
    log_info "Permission granted, now revoking (level 0)..."
    
    # Then revoke (level 0 = no access)
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"set_permission\", \"grantee\": \"$grantee\", \"path\": \"$path\", \"level\": 0}}}" \
        --accountId "$SIGNER" \
        --gas 50000000000000
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ permissionUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation grantee path level } }')
    local op=$(echo "$result" | jq -r '.data.permissionUpdates[0].operation // ""')
    local level=$(echo "$result" | jq -r '.data.permissionUpdates[0].level // -1')
    
    if [[ "$op" == "revoke" ]] || [[ "$level" == "0" ]]; then
        log_info "✅ PERMISSION_UPDATE (revoke) indexed successfully"
        echo "$result" | jq '.data.permissionUpdates[0]'
        return 0
    else
        log_error "❌ PERMISSION_UPDATE (revoke) not found"
        echo "Latest permissions:"
        echo "$result" | jq '.data.permissionUpdates'
        return 1
    fi
}

test_group_privacy() {
    local group_id="test-group-1769031904"
    
    log_info "TEST: GROUP_UPDATE (set_group_privacy) - Toggle privacy on $group_id"
    
    near call "$CONTRACT" execute \
        "{\"request\": {\"action\": {\"type\": \"set_group_privacy\", \"group_id\": \"$group_id\", \"is_private\": true}}}" \
        --accountId "$SIGNER" \
        --gas 50000000000000
    
    wait_for_indexing
    check_indexing_errors || return 1
    
    local result=$(query_subgraph '{ groupUpdates(first: 3, orderBy: blockTimestamp, orderDirection: desc) { id operation groupId } groups(where: {id: "test-group-1769031904"}) { id isPrivate } }')
    local op=$(echo "$result" | jq -r '.data.groupUpdates[0].operation // ""')
    
    if [[ "$op" == "privacy_changed" ]] || [[ "$op" == "config_updated" ]]; then
        log_info "✅ GROUP_UPDATE (privacy) indexed successfully"
        echo "$result" | jq '.data.groupUpdates[0]'
        echo "Group privacy:"
        echo "$result" | jq '.data.groups[0]'
        return 0
    else
        log_error "❌ GROUP_UPDATE (privacy) not found"
        echo "Latest group ops:"
        echo "$result" | jq '.data.groupUpdates'
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================

show_help() {
    echo "Usage: $0 [test_name]"
    echo ""
    echo "Available tests:"
    echo "  status            - Check subgraph status"
    echo "  data_set          - Test DATA_UPDATE (set)"
    echo "  data_delete       - Test DATA_UPDATE (delete)"
    echo "  storage_deposit   - Test STORAGE_UPDATE (deposit)"
    echo "  group_create      - Test GROUP_UPDATE (create_group)"
    echo "  group_add         - Test GROUP_UPDATE (add_member)"
    echo "  group_remove      - Test GROUP_UPDATE (remove_member)"
    echo "  group_privacy     - Test GROUP_UPDATE (privacy change)"
    echo "  permission_grant  - Test PERMISSION_UPDATE (grant)"
    echo "  permission_revoke - Test PERMISSION_UPDATE (revoke)"
    echo "  all               - Run all tests"
    echo ""
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 data_set"
    echo "  $0 all"
}

run_all_tests() {
    local passed=0
    local failed=0
    
    log_info "Running all tests..."
    echo ""
    
    for test in data_set data_delete group_create group_remove group_privacy permission_grant permission_revoke; do
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        if "test_$test"; then
            ((passed++))
        else
            ((failed++))
        fi
        echo ""
    done
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "Results: $passed passed, $failed failed"
    
    [ $failed -eq 0 ]
}

case "${1:-help}" in
    status)           test_status ;;
    data_set)         test_data_set ;;
    data_delete)      test_data_delete ;;
    storage_deposit)  test_storage_deposit ;;
    group_create)     test_group_create ;;
    group_add)        test_group_add_member ;;
    group_remove)     test_group_remove_member ;;
    group_privacy)    test_group_privacy ;;
    permission_grant) test_permission_grant ;;
    permission_revoke) test_permission_revoke ;;
    permission)       test_permission_grant ;;  # Alias
    all)              run_all_tests ;;
    help|--help|-h)   show_help ;;
    *)
        log_error "Unknown test: $1"
        show_help
        exit 1
        ;;
esac
