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

count_op "storageUpdates" "storage_deposit"
count_op "storageUpdates" "storage_withdraw"
count_op "storageUpdates" "auto_deposit"
count_op "storageUpdates" "attached_deposit"
count_op "storageUpdates" "refund_unused_deposit"
count_op "storageUpdates" "platform_pool_deposit"
count_op "storageUpdates" "pool_deposit"
count_op "storageUpdates" "share_storage"
count_op "storageUpdates" "return_storage"
count_op "storageUpdates" "platform_sponsor"
count_op "storageUpdates" "group_sponsor_spend"

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
count_op "groupUpdates" "member_nonce_updated"
count_op "groupUpdates" "stats_updated"
count_op "groupUpdates" "transfer_ownership"
count_op "groupUpdates" "privacy_changed"
count_op "groupUpdates" "permission_changed"
count_op "groupUpdates" "group_pool_created"
count_op "groupUpdates" "group_pool_deposit"
count_op "groupUpdates" "group_sponsor_quota_set"
count_op "groupUpdates" "group_sponsor_default_set"
count_op "groupUpdates" "join_request_submitted"
count_op "groupUpdates" "join_request_approved"
count_op "groupUpdates" "join_request_rejected"
count_op "groupUpdates" "join_request_cancelled"
count_op "groupUpdates" "add_to_blacklist"
count_op "groupUpdates" "remove_from_blacklist"
count_op "groupUpdates" "member_invited"
count_op "groupUpdates" "proposal_created"
count_op "groupUpdates" "vote_cast"
count_op "groupUpdates" "proposal_status_updated"
count_op "groupUpdates" "group_updated"
count_op "groupUpdates" "voting_config_changed"
count_op "groupUpdates" "custom_proposal_executed"
count_op "groupUpdates" "path_permission_granted"
count_op "groupUpdates" "path_permission_revoked"
count_op "groupUpdates" "create"
count_op "groupUpdates" "update"
count_op "groupUpdates" "delete"

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
count_op "contractUpdates" "update_config"
count_op "contractUpdates" "add_intents_executor"
count_op "contractUpdates" "remove_intents_executor"
count_op "contractUpdates" "update_manager"
count_op "contractUpdates" "enter_read_only"
count_op "contractUpdates" "resume_live"
count_op "contractUpdates" "activate_contract"

CONTRACT_TOTAL=$TOTAL_OPS
CONTRACT_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}BOOST Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "boostEvents" "BOOST_LOCK"
count_op "boostEvents" "BOOST_EXTEND"
count_op "boostEvents" "BOOST_UNLOCK"
count_op "boostEvents" "REWARDS_RELEASED"
count_op "boostEvents" "REWARDS_CLAIM"
count_op "boostEvents" "CREDITS_PURCHASE"
count_op "boostEvents" "SCHEDULED_FUND"
count_op "boostEvents" "INFRA_WITHDRAW"
count_op "boostEvents" "OWNER_CHANGED"
count_op "boostEvents" "CONTRACT_UPGRADE"
count_op "boostEvents" "STORAGE_DEPOSIT"
count_op "boostEvents" "UNLOCK_FAILED"
count_op "boostEvents" "CLAIM_FAILED"
count_op "boostEvents" "WITHDRAW_INFRA_FAILED"

BOOST_TOTAL=$TOTAL_OPS
BOOST_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}REWARDS Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "rewardsEvents" "REWARD_CREDITED"
count_op "rewardsEvents" "REWARD_CLAIMED"
count_op "rewardsEvents" "CLAIM_FAILED"
count_op "rewardsEvents" "POOL_DEPOSIT"
count_op "rewardsEvents" "OWNER_CHANGED"
count_op "rewardsEvents" "MAX_DAILY_UPDATED"
count_op "rewardsEvents" "EXECUTOR_ADDED"
count_op "rewardsEvents" "EXECUTOR_REMOVED"
count_op "rewardsEvents" "CALLER_ADDED"
count_op "rewardsEvents" "CALLER_REMOVED"
count_op "rewardsEvents" "CONTRACT_UPGRADE"

REWARDS_TOTAL=$TOTAL_OPS
REWARDS_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}TOKEN Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "tokenEvents" "ft_mint"
count_op "tokenEvents" "ft_burn"
count_op "tokenEvents" "ft_transfer"

TOKEN_TOTAL=$TOTAL_OPS
TOKEN_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}SCARCES — SCARCE_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "scarces_events" "mint"
count_op "scarces_events" "transfer"
count_op "scarces_events" "burn"
count_op "scarces_events" "list"
count_op "scarces_events" "delist"
count_op "scarces_events" "purchase"
count_op "scarces_events" "renew"
count_op "scarces_events" "revoke"
count_op "scarces_events" "redeem"
count_op "scarces_events" "approve"
count_op "scarces_events" "revoke_approval"
count_op "scarces_events" "revoke_all"
count_op "scarces_events" "auction_created"
count_op "scarces_events" "auction_bid"
count_op "scarces_events" "auction_settled"
count_op "scarces_events" "auction_cancelled"

SCARCE_UPDATE_TOTAL=$TOTAL_OPS
SCARCE_UPDATE_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}SCARCES — COLLECTION_UPDATE Operations${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

count_op "scarces_events" "create"
count_op "scarces_events" "update_price"
count_op "scarces_events" "update_timing"
count_op "scarces_events" "delete"
count_op "scarces_events" "pause"
count_op "scarces_events" "resume"
count_op "scarces_events" "cancel"
count_op "scarces_events" "airdrop"
count_op "scarces_events" "set_allowlist"
count_op "scarces_events" "remove_from_allowlist"
count_op "scarces_events" "set_metadata"
count_op "scarces_events" "withdraw_refunds"

COLLECTION_UPDATE_TOTAL=$TOTAL_OPS
COLLECTION_UPDATE_INDEXED=$INDEXED_OPS

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}SCARCES — Other Event Types${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_OPS=0
INDEXED_OPS=0

# LAZY_LISTING_UPDATE
count_op "scarces_events" "lazy_create"
count_op "scarces_events" "lazy_purchase"
count_op "scarces_events" "lazy_cancel"
count_op "scarces_events" "lazy_update_price"
count_op "scarces_events" "lazy_update_expiry"
# OFFER_UPDATE
count_op "scarces_events" "offer_make"
count_op "scarces_events" "offer_accept"
count_op "scarces_events" "offer_cancel"
# APP_POOL_UPDATE
count_op "scarces_events" "register"
count_op "scarces_events" "fund"
count_op "scarces_events" "withdraw"
count_op "scarces_events" "config"
# STORAGE_UPDATE (scarces)
count_op "scarces_events" "deposit"
count_op "scarces_events" "set_cap"
# CONTRACT_UPDATE (scarces)
count_op "scarces_events" "upgrade"
count_op "scarces_events" "fee_config"
count_op "scarces_events" "ban"
count_op "scarces_events" "unban"

SCARCES_OTHER_TOTAL=$TOTAL_OPS
SCARCES_OTHER_INDEXED=$INDEXED_OPS

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     COVERAGE SUMMARY                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

ALL_TOTAL=$((DATA_TOTAL + STORAGE_TOTAL + GROUP_TOTAL + PERMISSION_TOTAL + CONTRACT_TOTAL + BOOST_TOTAL + REWARDS_TOTAL + TOKEN_TOTAL + SCARCE_UPDATE_TOTAL + COLLECTION_UPDATE_TOTAL + SCARCES_OTHER_TOTAL))
ALL_INDEXED=$((DATA_INDEXED + STORAGE_INDEXED + GROUP_INDEXED + PERMISSION_INDEXED + CONTRACT_INDEXED + BOOST_INDEXED + REWARDS_INDEXED + TOKEN_INDEXED + SCARCE_UPDATE_INDEXED + COLLECTION_UPDATE_INDEXED + SCARCES_OTHER_INDEXED))

printf "  DATA_UPDATE:       %2d/%2d operations indexed\n" "$DATA_INDEXED" "$DATA_TOTAL"
printf "  STORAGE_UPDATE:    %2d/%2d operations indexed\n" "$STORAGE_INDEXED" "$STORAGE_TOTAL"
printf "  GROUP_UPDATE:      %2d/%2d operations indexed\n" "$GROUP_INDEXED" "$GROUP_TOTAL"
printf "  PERMISSION_UPDATE: %2d/%2d operations indexed\n" "$PERMISSION_INDEXED" "$PERMISSION_TOTAL"
printf "  CONTRACT_UPDATE:   %2d/%2d operations indexed\n" "$CONTRACT_INDEXED" "$CONTRACT_TOTAL"
printf "  BOOST:             %2d/%2d operations indexed\n" "$BOOST_INDEXED" "$BOOST_TOTAL"
printf "  REWARDS:           %2d/%2d operations indexed\n" "$REWARDS_INDEXED" "$REWARDS_TOTAL"
printf "  TOKEN:             %2d/%2d operations indexed\n" "$TOKEN_INDEXED" "$TOKEN_TOTAL"
printf "  SCARCE_UPDATE:     %2d/%2d operations indexed\n" "$SCARCE_UPDATE_INDEXED" "$SCARCE_UPDATE_TOTAL"
printf "  COLLECTION_UPDATE: %2d/%2d operations indexed\n" "$COLLECTION_UPDATE_INDEXED" "$COLLECTION_UPDATE_TOTAL"
printf "  SCARCES_OTHER:     %2d/%2d operations indexed\n" "$SCARCES_OTHER_INDEXED" "$SCARCES_OTHER_TOTAL"
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

check_test_file "core/test_data.sh" "DATA_UPDATE tests"
check_test_file "core/test_storage.sh" "STORAGE_UPDATE tests"
check_test_file "core/test_group.sh" "GROUP_UPDATE tests"
check_test_file "core/test_permission.sh" "PERMISSION_UPDATE tests"
check_test_file "core/test_contract.sh" "CONTRACT_UPDATE tests"
check_test_file "test_health.sh" "Health & connectivity tests"
check_test_file "scarces/test_scarces_events.sh" "Scarces event read tests"
check_test_file "scarces/test_scarces_write.sh" "Scarces event write tests"
check_test_file "boost/test_boost_events.sh" "Boost event tests"
check_test_file "boost/test_booster_state.sh" "Booster state tests"
check_test_file "boost/test_credit_purchases.sh" "Boost credit purchase tests"
check_test_file "rewards/test_rewards_events.sh" "Rewards event tests"
check_test_file "rewards/test_user_reward_state.sh" "User reward state tests"
check_test_file "token/test_token_events.sh" "Token event tests"
check_test_file "token/test_token_balances.sh" "Token balance tests"

echo ""
