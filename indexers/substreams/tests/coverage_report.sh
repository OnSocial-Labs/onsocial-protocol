#!/bin/bash
# =============================================================================
# Substreams/Hasura Event Coverage Report
# Generates a comprehensive report of all indexed operations
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     OnSocial Substreams/Hasura Event Coverage Report         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_info "Hasura: $HASURA_URL"
echo ""

# Helper to check operation count
check_op() {
    local table=$1
    local op=$2
    local result=$(query_hasura "{ ${table}(where: {operation: {_eq: \"$op\"}}, limit: 1) { id } }")
    local count=$(echo "$result" | jq ".data.$table | length // 0" 2>/dev/null || echo "0")
    if [[ "$count" -gt 0 ]]; then
        printf "  ${GREEN}✓${NC} %-30s indexed\n" "$op"
        return 0
    else
        printf "  ${YELLOW}○${NC} %-30s not indexed\n" "$op"
        return 1
    fi
}

# Count totals
TOTAL_OPS=0
INDEXED_OPS=0

count_op() {
    TOTAL_OPS=$((TOTAL_OPS + 1))
    if check_op "$@"; then
        INDEXED_OPS=$((INDEXED_OPS + 1))
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}DATA_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

count_op "data_updates" "set"
count_op "data_updates" "remove"

DATA_TOTAL=$TOTAL_OPS
DATA_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}STORAGE_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "storage_updates" "deposit"
count_op "storage_updates" "withdraw"
count_op "storage_updates" "auto_deposit"
count_op "storage_updates" "auto_refund"
count_op "storage_updates" "storage_changed"
count_op "storage_updates" "share_storage"
count_op "storage_updates" "unshare_storage"
count_op "storage_updates" "quota_changed"
count_op "storage_updates" "sponsored_used"
count_op "storage_updates" "sponsored_released"

STORAGE_TOTAL=$TOTAL_OPS
STORAGE_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}GROUP_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "group_updates" "group_created"
count_op "group_updates" "group_deleted"
count_op "group_updates" "member_added"
count_op "group_updates" "member_removed"
count_op "group_updates" "member_role_changed"
count_op "group_updates" "proposal_created"
count_op "group_updates" "proposal_executed"
count_op "group_updates" "proposal_canceled"
count_op "group_updates" "vote_cast"
count_op "group_updates" "add_to_blacklist"
count_op "group_updates" "remove_from_blacklist"
count_op "group_updates" "group_pool_created"
count_op "group_updates" "voting_config_changed"
count_op "group_updates" "member_invited"
count_op "group_updates" "permission_changed"
count_op "group_updates" "group_updated"
count_op "group_updates" "group_sponsor_quota_set"
count_op "group_updates" "group_sponsor_default_set"
count_op "group_updates" "stats_updated"

GROUP_TOTAL=$TOTAL_OPS
GROUP_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}PERMISSION_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "permission_updates" "grant"
count_op "permission_updates" "revoke"
count_op "permission_updates" "grant_key"
count_op "permission_updates" "revoke_key"

PERMISSION_TOTAL=$TOTAL_OPS
PERMISSION_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}CONTRACT_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "contract_updates" "set"
count_op "contract_updates" "config_change"
count_op "contract_updates" "admin_added"
count_op "contract_updates" "admin_removed"
count_op "contract_updates" "manager_change"
count_op "contract_updates" "status_change"
count_op "contract_updates" "partition_created"
count_op "contract_updates" "partition_updated"

CONTRACT_TOTAL=$TOTAL_OPS
CONTRACT_INDEXED=$INDEXED_OPS

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     COVERAGE SUMMARY                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

ALL_TOTAL=$((DATA_TOTAL + STORAGE_TOTAL + GROUP_TOTAL + PERMISSION_TOTAL + CONTRACT_TOTAL))
ALL_INDEXED=$((DATA_INDEXED + STORAGE_INDEXED + GROUP_INDEXED + PERMISSION_INDEXED + CONTRACT_INDEXED))

printf "  DATA_UPDATE:       %2d/%2d operations indexed\n" "$DATA_INDEXED" "$DATA_TOTAL"
printf "  STORAGE_UPDATE:    %2d/%2d operations indexed\n" "$STORAGE_INDEXED" "$STORAGE_TOTAL"
printf "  GROUP_UPDATE:      %2d/%2d operations indexed\n" "$GROUP_INDEXED" "$GROUP_TOTAL"
printf "  PERMISSION_UPDATE: %2d/%2d operations indexed\n" "$PERMISSION_INDEXED" "$PERMISSION_TOTAL"
printf "  CONTRACT_UPDATE:   %2d/%2d operations indexed\n" "$CONTRACT_INDEXED" "$CONTRACT_TOTAL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $ALL_TOTAL -gt 0 ]]; then
    PERCENT=$((ALL_INDEXED * 100 / ALL_TOTAL))
else
    PERCENT=0
fi

if [[ $PERCENT -ge 80 ]]; then
    COLOR=$GREEN
elif [[ $PERCENT -ge 50 ]]; then
    COLOR=$YELLOW
else
    COLOR=$RED
fi

printf "  ${COLOR}TOTAL COVERAGE: %d/%d operations (%d%%)${NC}\n" "$ALL_INDEXED" "$ALL_TOTAL" "$PERCENT"
echo ""

# Legend
echo "Legend:"
echo -e "  ${GREEN}✓${NC} = Operation has indexed data"
echo -e "  ${YELLOW}○${NC} = Operation not yet triggered/indexed"
echo ""

# Test file coverage
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}TEST FILE COVERAGE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_test_file() {
    local file=$1
    local desc=$2
    if [[ -f "$SCRIPT_DIR/$file" ]]; then
        printf "  ${GREEN}✓${NC} %-25s %s\n" "$file" "$desc"
    else
        printf "  ${YELLOW}○${NC} %-25s %s\n" "$file" "(not implemented)"
    fi
}

check_test_file "test_data.sh" "DATA_UPDATE tests"
check_test_file "test_storage.sh" "STORAGE_UPDATE tests"
check_test_file "test_group.sh" "GROUP_UPDATE tests"
check_test_file "test_permission.sh" "PERMISSION_UPDATE tests"
check_test_file "test_contract.sh" "CONTRACT_UPDATE tests"
check_test_file "test_health.sh" "Health & connectivity tests"

echo ""
