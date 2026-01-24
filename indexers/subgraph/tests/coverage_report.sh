#!/bin/bash
# =============================================================================
# Subgraph Event Coverage Report
# Generates a comprehensive report of all indexed operations
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       OnSocial Subgraph Event Coverage Report                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_info "Subgraph: $SUBGRAPH_URL"
echo ""

# Helper to check operation count
check_op() {
    local entity=$1
    local op=$2
    local result=$(curl -s "$SUBGRAPH_URL" -H 'Content-Type: application/json' \
        -d '{"query":"{ '"$entity"'(where: {operation: \"'"$op"'\"}, first: 1) { id } }"}')
    local count=$(echo "$result" | jq ".data.$entity | length // 0" 2>/dev/null || echo "0")
    if [[ "$count" -gt 0 ]]; then
        printf "  ${GREEN}✓${NC} %-30s %s indexed\n" "$op" "$count"
        return 0
    else
        printf "  ${YELLOW}○${NC} %-30s %s indexed\n" "$op" "0"
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

count_op "dataUpdates" "set"
count_op "dataUpdates" "remove"

DATA_TOTAL=$TOTAL_OPS
DATA_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}STORAGE_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "storageUpdates" "auto_deposit"
count_op "storageUpdates" "storage_deposit"
count_op "storageUpdates" "storage_withdraw"
count_op "storageUpdates" "attached_deposit"
count_op "storageUpdates" "platform_pool_deposit"
count_op "storageUpdates" "platform_sponsor"
count_op "storageUpdates" "pool_deposit"
count_op "storageUpdates" "share_storage"
count_op "storageUpdates" "return_storage"

STORAGE_TOTAL=$TOTAL_OPS
STORAGE_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}GROUP_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "groupUpdates" "create_group"
count_op "groupUpdates" "add_member"
count_op "groupUpdates" "remove_member"
count_op "groupUpdates" "add_to_blacklist"
count_op "groupUpdates" "remove_from_blacklist"
count_op "groupUpdates" "transfer_ownership"
count_op "groupUpdates" "privacy_changed"
count_op "groupUpdates" "proposal_created"
count_op "groupUpdates" "vote_cast"
count_op "groupUpdates" "proposal_status_updated"
count_op "groupUpdates" "join_request_submitted"
count_op "groupUpdates" "join_request_approved"
count_op "groupUpdates" "join_request_rejected"
count_op "groupUpdates" "join_request_cancelled"
count_op "groupUpdates" "group_pool_deposit"
count_op "groupUpdates" "group_pool_created"
count_op "groupUpdates" "voting_config_changed"
count_op "groupUpdates" "member_invited"
count_op "groupUpdates" "permission_changed"
count_op "groupUpdates" "group_updated"
count_op "groupUpdates" "group_sponsor_quota_set"
count_op "groupUpdates" "group_sponsor_default_set"
count_op "groupUpdates" "stats_updated"

GROUP_TOTAL=$TOTAL_OPS
GROUP_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}PERMISSION_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "permissionUpdates" "grant"
count_op "permissionUpdates" "revoke"
count_op "permissionUpdates" "grant_key"
count_op "permissionUpdates" "revoke_key"

PERMISSION_TOTAL=$TOTAL_OPS
PERMISSION_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}CONTRACT_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "contractUpdates" "set"
count_op "contractUpdates" "config_change"
count_op "contractUpdates" "admin_added"
count_op "contractUpdates" "admin_removed"
count_op "contractUpdates" "manager_change"
count_op "contractUpdates" "status_change"
count_op "contractUpdates" "partition_created"
count_op "contractUpdates" "partition_updated"

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

PERCENT=$((ALL_INDEXED * 100 / ALL_TOTAL))
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

log_info "To improve coverage, run operations that emit the missing event types"
echo ""
