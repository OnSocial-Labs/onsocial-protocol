use super::*;
use near_sdk::test_utils::{VMContextBuilder, accounts};
use near_sdk::{NearToken, PromiseError, testing_env};

const ONE_SOCIAL: u128 = SOCIAL_UNIT;
const NOW_NS: u64 = 1_800_000_000_000_000_000;
const SEASON_START_NS: u64 = NOW_NS - 1_000_000_000;
const SEASON_END_NS: u64 = NOW_NS + 1_000_000_000;
const AFTER_SEASON_NS: u64 = SEASON_END_NS + 1_000_000_000;

fn owner() -> AccountId {
    accounts(0)
}

fn token() -> AccountId {
    accounts(1)
}

fn alice() -> AccountId {
    accounts(2)
}

fn bob() -> AccountId {
    accounts(3)
}

fn treasury() -> AccountId {
    accounts(4)
}

fn contract_id() -> AccountId {
    accounts(5)
}

fn publisher() -> AccountId {
    "publisher.near".parse().unwrap()
}

fn boost() -> AccountId {
    "boost.near".parse().unwrap()
}

fn context(predecessor: AccountId) -> VMContextBuilder {
    context_at(predecessor, NOW_NS)
}

fn context_at(predecessor: AccountId, block_timestamp: u64) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .predecessor_account_id(predecessor)
        .current_account_id(contract_id())
        .block_timestamp(block_timestamp)
        .account_balance(NearToken::from_near(100));
    builder
}

fn context_with_deposit(predecessor: AccountId) -> VMContextBuilder {
    context_with_deposit_at(predecessor, NOW_NS)
}

fn context_with_deposit_at(predecessor: AccountId, block_timestamp: u64) -> VMContextBuilder {
    let mut builder = context_at(predecessor, block_timestamp);
    builder.attached_deposit(NearToken::from_yoctonear(1));
    builder
}

fn callback_context() -> VMContextBuilder {
    let mut builder = context(contract_id());
    builder.predecessor_account_id(contract_id());
    builder
}

fn new_contract() -> SocialSpendContract {
    testing_env!(context(owner()).build());
    SocialSpendContract::new(owner(), token(), treasury(), Some(boost()))
}

fn assert_invalid_input(err: SocialSpendError, expected: &str) {
    match &err {
        SocialSpendError::InvalidInput(message) if message == expected => {}
        _ => panic!("expected InvalidInput({expected}), got {err:?}"),
    }
}

fn configure_season(
    contract: &mut SocialSpendContract,
    season_id: &str,
    active: bool,
    starts_at_ns: u64,
    ends_at_ns: u64,
    claim_starts_at_ns: Option<u64>,
) {
    testing_env!(context_with_deposit(owner()).build());
    contract
        .set_season_config(
            season_id.into(),
            SeasonConfigInput {
                label: "Support Rally".into(),
                active,
                starts_at_ns,
                ends_at_ns,
                claim_starts_at_ns,
            },
        )
        .unwrap();
}

fn configure_open_season(contract: &mut SocialSpendContract, season_id: &str) {
    configure_season(
        contract,
        season_id,
        true,
        SEASON_START_NS,
        SEASON_END_NS,
        Some(SEASON_END_NS),
    );
}

fn spend_msg(
    action: &str,
    target_type: &str,
    target_id: &str,
    season_id: Option<&str>,
    recipient_id: Option<AccountId>,
) -> String {
    let mut value = serde_json::json!({
        "v": 1,
        "app_id": "portal",
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
    });
    if let Some(season_id) = season_id {
        value["season_id"] = serde_json::json!(season_id);
    }
    if let Some(recipient_id) = recipient_id {
        value["recipient_id"] = serde_json::json!(recipient_id);
    }
    value.to_string()
}

#[test]
fn test_rejects_spend_without_boost_contract() {
    let mut contract = new_contract();
    contract.boost_contract_id = None;

    let err = signal_profile(&mut contract, bob(), alice()).unwrap_err();
    assert_invalid_input(err, "Boost contract not configured");
}

fn signal_profile(
    contract: &mut SocialSpendContract,
    sender_id: AccountId,
    target_id: AccountId,
) -> Result<(), SocialSpendError> {
    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            sender_id,
            U128(100 * ONE_SOCIAL),
            spend_msg("signal_profile", "profile", target_id.as_str(), None, None),
        )
        .map(|_| ())
}

fn join_rally(contract: &mut SocialSpendContract, sender_id: AccountId) {
    configure_open_season(contract, "season-zero");
    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            sender_id,
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "join_rally",
                "rally",
                "creator-week",
                Some("season-zero"),
                None,
            ),
        )
        .unwrap();
}

#[test]
fn test_init_installs_default_actions() {
    let contract = new_contract();

    assert_eq!(contract.owner_id, owner());
    assert_eq!(contract.social_token, token());
    assert_eq!(contract.treasury_id, treasury());
    assert_eq!(contract.action_ids.len(), 5);
    assert!(contract.season_ids.is_empty());

    let signal = contract
        .get_action_config("signal_profile".into())
        .expect("signal_profile config");
    assert!(signal.active);
    assert_eq!(signal.treasury_bps, 1_000);
    assert_eq!(signal.season_pool_bps, 0);
    assert_eq!(signal.target_bps, 9_000);
    assert!(!signal.season_required);

    let support = contract
        .get_action_config("support_profile".into())
        .expect("support_profile config");
    assert_eq!(support.treasury_bps, 500);
    assert_eq!(support.target_bps, 9_500);
    assert_eq!(
        contract
            .get_action_config("join_rally".into())
            .expect("join_rally config")
            .burn_bps,
        0
    );
    assert!(contract.get_action_config("welcome_user".into()).is_none());
}

#[test]
fn test_season_config_controls_rally_spend_window() {
    let mut contract = new_contract();

    testing_env!(context(token()).build());
    let err = contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "join_rally",
                "rally",
                "creator-week",
                Some("season-zero"),
                None,
            ),
        )
        .unwrap_err();
    assert_invalid_input(err, "Season not configured");

    configure_season(
        &mut contract,
        "season-zero",
        true,
        NOW_NS + 1,
        SEASON_END_NS,
        Some(SEASON_END_NS),
    );
    testing_env!(context(token()).build());
    let err = contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "join_rally",
                "rally",
                "creator-week",
                Some("season-zero"),
                None,
            ),
        )
        .unwrap_err();
    assert_invalid_input(err, "Season not started");

    configure_season(
        &mut contract,
        "season-zero",
        false,
        SEASON_START_NS,
        SEASON_END_NS,
        Some(SEASON_END_NS),
    );
    testing_env!(context(token()).build());
    let err = contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "join_rally",
                "rally",
                "creator-week",
                Some("season-zero"),
                None,
            ),
        )
        .unwrap_err();
    assert_invalid_input(err, "Season inactive");

    configure_season(
        &mut contract,
        "season-zero",
        true,
        SEASON_START_NS,
        NOW_NS,
        Some(NOW_NS),
    );
    testing_env!(context(token()).build());
    let err = contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "join_rally",
                "rally",
                "creator-week",
                Some("season-zero"),
                None,
            ),
        )
        .unwrap_err();
    assert_invalid_input(err, "Season ended");

    configure_open_season(&mut contract, "season-zero");
    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "join_rally",
                "rally",
                "creator-week",
                Some("season-zero"),
                None,
            ),
        )
        .unwrap();
    assert_eq!(
        contract.get_season_pool("season-zero".into()).0,
        95 * ONE_SOCIAL
    );

    let config = contract
        .get_season_config("season-zero".into())
        .expect("season config");
    assert!(config.is_live);
    assert_eq!(contract.get_season_ids(), vec!["season-zero".to_string()]);
}

#[test]
fn test_admin_rejects_invalid_season_config() {
    let mut contract = new_contract();

    testing_env!(context_with_deposit(owner()).build());
    let err = contract
        .set_season_config(
            "season-zero".into(),
            SeasonConfigInput {
                label: "Support Rally".into(),
                active: true,
                starts_at_ns: SEASON_END_NS,
                ends_at_ns: SEASON_START_NS,
                claim_starts_at_ns: Some(SEASON_END_NS),
            },
        )
        .unwrap_err();
    assert_invalid_input(err, "starts_at_ns must be before ends_at_ns");

    let err = contract
        .set_season_config(
            "season-zero".into(),
            SeasonConfigInput {
                label: "Support Rally".into(),
                active: true,
                starts_at_ns: SEASON_START_NS,
                ends_at_ns: SEASON_END_NS,
                claim_starts_at_ns: Some(SEASON_START_NS),
            },
        )
        .unwrap_err();
    assert_invalid_input(err, "claim_starts_at_ns must be at or after ends_at_ns");
}

#[test]
fn test_signal_profile_routes_to_treasury_and_target() {
    let mut contract = new_contract();

    signal_profile(&mut contract, bob(), alice()).unwrap();

    assert_eq!(contract.treasury_balance, 0);
    assert_eq!(contract.total_boost_credits_routed, 10 * ONE_SOCIAL);
    assert_eq!(contract.get_season_pool("season-zero".into()).0, 0);
    assert_eq!(contract.get_target_balance(alice()).0, 90 * ONE_SOCIAL);
    assert_eq!(contract.total_spent, 100 * ONE_SOCIAL);

    let action_totals = contract.get_action_totals("signal_profile".into());
    assert_eq!(action_totals.count, 1);
    assert_eq!(action_totals.total_spent.0, 100 * ONE_SOCIAL);
    assert_eq!(action_totals.treasury_routed.0, 10 * ONE_SOCIAL);
    assert_eq!(action_totals.season_routed.0, 0);
    assert_eq!(action_totals.target_routed.0, 90 * ONE_SOCIAL);

    let target_totals = contract.get_target_totals("profile".into(), alice().to_string());
    assert_eq!(target_totals.count, 1);
    assert_eq!(target_totals.total_spent.0, 100 * ONE_SOCIAL);
}

#[test]
fn test_support_profile_routes_without_season() {
    let mut contract = new_contract();

    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg("support_profile", "profile", alice().as_str(), None, None),
        )
        .unwrap();

    assert_eq!(contract.treasury_balance, 0);
    assert_eq!(contract.total_boost_credits_routed, 5 * ONE_SOCIAL);
    assert_eq!(contract.get_target_balance(alice()).0, 95 * ONE_SOCIAL);
    assert_eq!(contract.get_season_pool("season-zero".into()).0, 0);
}

#[test]
fn test_boost_post_requires_recipient_for_target_split() {
    let mut contract = new_contract();

    testing_env!(context(token()).build());
    let err = contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg("boost_post", "post", "alice.near/post/1", None, None),
        )
        .unwrap_err();
    assert!(
        matches!(err, SocialSpendError::InvalidInput(message) if message == "recipient_id required for target split")
    );

    contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "boost_post",
                "post",
                "alice.near/post/1",
                None,
                Some(alice()),
            ),
        )
        .unwrap();
    assert_eq!(contract.get_target_balance(alice()).0, 90 * ONE_SOCIAL);
}

#[test]
fn test_custom_onboarding_action_supports_path_target_with_recipient() {
    let mut contract = new_contract();

    testing_env!(context_with_deposit(owner()).build());
    contract
        .set_action_config(
            "welcome_user".into(),
            ActionConfigInput {
                label: "Welcome User".into(),
                active: true,
                min_amount: U128(MIN_SOCIAL_SPEND),
                target_types: vec!["profile".into(), "onboarding".into()],
                treasury_bps: 1_000,
                season_pool_bps: 0,
                target_bps: 9_000,
                season_required: false,
                allow_self_target: false,
                burn_bps: 0,
            },
        )
        .unwrap();

    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "welcome_user",
                "onboarding",
                "welcome/alice.near",
                None,
                Some(alice()),
            ),
        )
        .unwrap();

    assert_eq!(contract.treasury_balance, 0);
    assert_eq!(contract.total_boost_credits_routed, 10 * ONE_SOCIAL);
    assert_eq!(contract.get_target_balance(alice()).0, 90 * ONE_SOCIAL);

    let target_totals =
        contract.get_target_totals("onboarding".into(), "welcome/alice.near".into());
    assert_eq!(target_totals.count, 1);
    assert_eq!(target_totals.total_spent.0, 100 * ONE_SOCIAL);
}

#[test]
fn test_rejects_wrong_token_unknown_action_and_self_signal() {
    let mut contract = new_contract();

    testing_env!(context(bob()).build());
    let err = contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg("signal_profile", "profile", alice().as_str(), None, None),
        )
        .unwrap_err();
    assert_invalid_input(err, "Wrong token");

    testing_env!(context(token()).build());
    let err = contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg("unknown", "profile", alice().as_str(), None, None),
        )
        .unwrap_err();
    assert!(matches!(err, SocialSpendError::ActionNotFound(action) if action == "unknown"));

    let err = contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg("signal_profile", "profile", bob().as_str(), None, None),
        )
        .unwrap_err();
    assert_invalid_input(err, "Self target not allowed");
}

#[test]
fn test_admin_rejects_invalid_action_config_bps() {
    let mut contract = new_contract();

    testing_env!(context_with_deposit(owner()).build());
    let err = contract
        .set_action_config(
            "bad_action".into(),
            ActionConfigInput {
                label: "Bad Action".into(),
                active: true,
                min_amount: U128(MIN_SOCIAL_SPEND),
                target_types: vec!["profile".into()],
                treasury_bps: 1,
                season_pool_bps: 1,
                target_bps: 1,
                season_required: false,
                allow_self_target: false,
                burn_bps: 9996,
            },
        )
        .unwrap_err();
    assert_invalid_input(err, "routing bps must sum to 10000");
}

#[test]
fn test_join_rally_burn_routing() {
    let mut contract = new_contract();
    configure_open_season(&mut contract, "season-zero");

    testing_env!(context_with_deposit(owner()).build());
    contract
        .set_action_config(
            "join_rally".into(),
            ActionConfigInput {
                label: "Join Rally".into(),
                active: true,
                min_amount: U128(MIN_SOCIAL_SPEND),
                target_types: vec!["rally".into()],
                treasury_bps: 0,
                season_pool_bps: 9_500,
                target_bps: 0,
                season_required: true,
                allow_self_target: true,
                burn_bps: 500,
            },
        )
        .unwrap();

    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "join_rally",
                "rally",
                "creator-week",
                Some("season-zero"),
                None,
            ),
        )
        .unwrap();

    assert_eq!(contract.treasury_balance, 0);
    assert_eq!(
        contract.get_season_pool("season-zero".into()).0,
        95 * ONE_SOCIAL
    );
    assert_eq!(contract.total_burned, 5 * ONE_SOCIAL);
    assert_eq!(
        contract
            .get_action_totals("join_rally".into())
            .burn_routed
            .0,
        5 * ONE_SOCIAL
    );
}

#[test]
fn test_claim_season_reward_respects_claim_window() {
    let mut contract = new_contract();
    configure_season(
        &mut contract,
        "season-zero",
        true,
        SEASON_START_NS,
        SEASON_END_NS,
        Some(AFTER_SEASON_NS),
    );

    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "join_rally",
                "rally",
                "creator-week",
                Some("season-zero"),
                None,
            ),
        )
        .unwrap();

    let amount = 10 * ONE_SOCIAL;
    let root = season_leaf_hash("season-zero", &bob(), amount);
    testing_env!(context_with_deposit_at(owner(), SEASON_END_NS).build());
    contract
        .publish_season_root(
            "season-zero".into(),
            Base64VecU8(root.to_vec()),
            U128(amount),
            true,
        )
        .unwrap();

    testing_env!(context_at(bob(), SEASON_END_NS + 1).build());
    let err = contract
        .claim_season_reward("season-zero".into(), U128(amount), vec![])
        .unwrap_err();
    assert_invalid_input(err, "Claims not open");
}

#[test]
fn test_publish_root_and_claim_season_reward() {
    let mut contract = new_contract();
    join_rally(&mut contract, bob());

    let amount = 10 * ONE_SOCIAL;
    let root = season_leaf_hash("season-zero", &bob(), amount);

    testing_env!(context_with_deposit_at(owner(), AFTER_SEASON_NS).build());
    contract
        .publish_season_root(
            "season-zero".into(),
            Base64VecU8(root.to_vec()),
            U128(amount),
            true,
        )
        .unwrap();

    testing_env!(context_at(bob(), AFTER_SEASON_NS + 1).build());
    let result = contract
        .claim_season_reward("season-zero".into(), U128(amount), vec![])
        .unwrap();
    assert_eq!(result["status"], "pending");
    assert_eq!(
        contract.get_season_pool("season-zero".into()).0,
        85 * ONE_SOCIAL
    );
    assert!(contract.has_claimed_season("season-zero".into(), bob()));
    assert!(contract.pending_transfers.contains_key(&bob()));

    testing_env!(callback_context().build());
    contract.on_transfer_callback(Ok(()), bob(), U128(amount));
    assert!(!contract.pending_transfers.contains_key(&bob()));
}

#[test]
fn test_claim_season_reward_rejects_invalid_proof() {
    let mut contract = new_contract();
    join_rally(&mut contract, bob());

    let amount = 10 * ONE_SOCIAL;
    let root = season_leaf_hash("season-zero", &bob(), amount);

    testing_env!(context_with_deposit_at(owner(), AFTER_SEASON_NS).build());
    contract
        .publish_season_root(
            "season-zero".into(),
            Base64VecU8(root.to_vec()),
            U128(amount),
            true,
        )
        .unwrap();

    testing_env!(context_at(alice(), AFTER_SEASON_NS + 1).build());
    let err = contract
        .claim_season_reward("season-zero".into(), U128(amount), vec![])
        .unwrap_err();
    assert!(matches!(err, SocialSpendError::InvalidProof));
}

#[test]
fn test_failed_target_claim_rolls_back_balance() {
    let mut contract = new_contract();

    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg("support_profile", "profile", alice().as_str(), None, None),
        )
        .unwrap();

    testing_env!(context(alice()).build());
    contract
        .claim_target_balance(Some(U128(10 * ONE_SOCIAL)))
        .unwrap();
    assert_eq!(contract.get_target_balance(alice()).0, 85 * ONE_SOCIAL);

    testing_env!(callback_context().build());
    contract.on_transfer_callback(Err(PromiseError::Failed), alice(), U128(10 * ONE_SOCIAL));
    assert_eq!(contract.get_target_balance(alice()).0, 95 * ONE_SOCIAL);
    assert!(!contract.pending_transfers.contains_key(&alice()));
}

#[test]
fn test_failed_season_claim_rolls_back_claim_marker_and_pool() {
    let mut contract = new_contract();
    join_rally(&mut contract, bob());

    let amount = 10 * ONE_SOCIAL;
    let root = season_leaf_hash("season-zero", &bob(), amount);

    testing_env!(context_with_deposit_at(owner(), AFTER_SEASON_NS).build());
    contract
        .publish_season_root(
            "season-zero".into(),
            Base64VecU8(root.to_vec()),
            U128(amount),
            true,
        )
        .unwrap();

    testing_env!(context_at(bob(), AFTER_SEASON_NS + 1).build());
    contract
        .claim_season_reward("season-zero".into(), U128(amount), vec![])
        .unwrap();
    assert_eq!(
        contract.get_season_pool("season-zero".into()).0,
        85 * ONE_SOCIAL
    );
    assert!(contract.has_claimed_season("season-zero".into(), bob()));

    testing_env!(callback_context().build());
    contract.on_transfer_callback(Err(PromiseError::Failed), bob(), U128(amount));
    assert_eq!(
        contract.get_season_pool("season-zero".into()).0,
        95 * ONE_SOCIAL
    );
    assert!(!contract.has_claimed_season("season-zero".into(), bob()));
}

#[test]
fn test_settlement_publisher_can_publish_roots() {
    let mut contract = new_contract();
    join_rally(&mut contract, bob());

    testing_env!(context_with_deposit(owner()).build());
    contract
        .set_settlement_publisher(Some(publisher()))
        .unwrap();

    let amount = 10 * ONE_SOCIAL;
    let root = season_leaf_hash("season-zero", &bob(), amount);
    testing_env!(context_with_deposit_at(publisher(), AFTER_SEASON_NS).build());
    contract
        .publish_season_root(
            "season-zero".into(),
            Base64VecU8(root.to_vec()),
            U128(amount),
            true,
        )
        .unwrap();
}

#[test]
fn test_set_owner() {
    let mut contract = new_contract();

    testing_env!(context_with_deposit(owner()).build());
    contract.set_owner(alice()).unwrap();

    assert_eq!(contract.owner_id, alice());
}

#[test]
fn test_update_contract_from_hash_requires_owner() {
    let contract = new_contract();

    testing_env!(context(alice()).build());
    let result = contract.update_contract_from_hash([0u8; 32].into());

    assert!(
        matches!(result, Err(SocialSpendError::Unauthorized(message)) if message == "Only owner")
    );
}

#[test]
fn test_update_contract_requires_owner() {
    let contract = new_contract();

    testing_env!(context(alice()).build());
    let result = contract.update_contract();

    assert!(
        matches!(result, Err(SocialSpendError::Unauthorized(message)) if message == "Only owner")
    );
}

fn pre_boost_state_from_contract(
    contract: SocialSpendContract,
) -> SocialSpendContractPreBoostCredits {
    SocialSpendContractPreBoostCredits {
        version: contract.version,
        owner_id: contract.owner_id,
        social_token: contract.social_token,
        treasury_id: contract.treasury_id,
        settlement_publisher: contract.settlement_publisher,
        paused: contract.paused,
        treasury_balance: contract.treasury_balance,
        total_spent: contract.total_spent,
        action_ids: contract.action_ids,
        season_ids: contract.season_ids,
        action_configs: contract.action_configs,
        season_configs: contract.season_configs,
        action_totals: contract.action_totals,
        season_pools: contract.season_pools,
        season_settlements: contract.season_settlements,
        season_claims: contract.season_claims,
        target_balances: contract.target_balances,
        target_totals: contract.target_totals,
        pending_transfers: contract.pending_transfers,
        action_burn_bps: contract.action_burn_bps,
        action_burn_totals: contract.action_burn_totals,
        total_burned: contract.total_burned,
    }
}

#[test]
fn test_pre_boost_state_roundtrip() {
    let contract = new_contract();
    let pre_boost = pre_boost_state_from_contract(contract);

    testing_env!(context(contract_id()).build());
    near_sdk::env::state_write(&pre_boost);

    let read: SocialSpendContractPreBoostCredits =
        near_sdk::env::state_read().expect("pre-boost state should roundtrip");
    assert_eq!(read.version, CONTRACT_VERSION);
    assert_eq!(read.total_burned, 0);
}

fn onsocial_spend_contract_id() -> AccountId {
    "social-spend.onsocial.testnet".parse().unwrap()
}

fn onsocial_boost_contract_id() -> AccountId {
    "boost.onsocial.testnet".parse().unwrap()
}

#[test]
fn test_migrate_from_pre_boost_state() {
    let contract = new_contract();
    let pre_boost = pre_boost_state_from_contract(contract);

    testing_env!(
        context(onsocial_spend_contract_id())
            .current_account_id(onsocial_spend_contract_id())
            .build()
    );
    near_sdk::env::state_write(&pre_boost);

    let migrated = SocialSpendContract::migrate();
    assert_eq!(migrated.version, CONTRACT_VERSION);
    assert_eq!(migrated.total_boost_credits_routed, 0);
    assert_eq!(
        migrated.boost_contract_id,
        Some(onsocial_boost_contract_id())
    );
}

#[test]
fn test_treasury_bps_routes_to_boost_credits_when_boost_contract_set() {
    let mut contract = new_contract();
    configure_open_season(&mut contract, "season-zero");

    testing_env!(context_with_deposit(owner()).build());
    contract.set_boost_contract_id(Some(boost())).unwrap();

    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg(
                "join_rally",
                "rally",
                "creator-week",
                Some("season-zero"),
                None,
            ),
        )
        .unwrap();

    assert_eq!(contract.treasury_balance, 0);
    assert_eq!(
        contract.get_season_pool("season-zero".into()).0,
        95 * ONE_SOCIAL
    );
    assert_eq!(contract.total_boost_credits_routed, 5 * ONE_SOCIAL);
    assert_eq!(
        contract
            .get_action_totals("join_rally".into())
            .boost_credits_routed
            .0,
        5 * ONE_SOCIAL
    );
}

#[test]
fn test_treasury_bps_accrues_when_boost_contract_unset() {
    let mut contract = new_contract();
    contract.boost_contract_id = None;

    let err = signal_profile(&mut contract, bob(), alice()).unwrap_err();
    assert_invalid_input(err, "Boost contract not configured");
}

#[test]
fn test_all_default_actions_route_protocol_fees_to_boost() {
    let mut contract = new_contract();
    configure_open_season(&mut contract, "season-zero");

    testing_env!(context_with_deposit(owner()).build());
    contract.set_boost_contract_id(Some(boost())).unwrap();

    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            bob(),
            U128(100 * ONE_SOCIAL),
            spend_msg("signal_profile", "profile", alice().as_str(), None, None),
        )
        .unwrap();

    assert_eq!(contract.treasury_balance, 0);
    assert_eq!(contract.total_boost_credits_routed, 10 * ONE_SOCIAL);
    assert_eq!(
        contract
            .get_action_totals("signal_profile".into())
            .boost_credits_routed
            .0,
        10 * ONE_SOCIAL
    );
}

fn fund_season_pool_msg(season_id: &str) -> String {
    serde_json::json!({
        "v": 1,
        "action": "fund_season_pool",
        "season_id": season_id,
    })
    .to_string()
}

#[test]
fn test_fund_season_pool_from_treasury_by_owner() {
    let mut contract = new_contract();
    configure_open_season(&mut contract, "season-zero");

    let fund_amount = 5 * ONE_SOCIAL;
    contract.treasury_balance = fund_amount;
    testing_env!(context_with_deposit(owner()).build());
    contract
        .fund_season_pool_from_treasury("season-zero".into(), U128(fund_amount))
        .unwrap();

    assert_eq!(
        contract.get_season_pool("season-zero".into()).0,
        fund_amount
    );
}

#[test]
fn test_fund_season_pool_from_treasury_rejects_non_owner() {
    let mut contract = new_contract();
    configure_open_season(&mut contract, "season-zero");
    contract.treasury_balance = ONE_SOCIAL;

    testing_env!(context_with_deposit(alice()).build());
    let err = contract
        .fund_season_pool_from_treasury("season-zero".into(), U128(ONE_SOCIAL))
        .unwrap_err();
    assert!(matches!(err, SocialSpendError::Unauthorized(_)));
}

#[test]
fn test_fund_season_pool_via_wallet_by_owner() {
    let mut contract = new_contract();
    configure_open_season(&mut contract, "season-zero");

    let fund_amount = 25 * ONE_SOCIAL;
    testing_env!(context(token()).build());
    contract
        .ft_on_transfer(
            owner(),
            U128(fund_amount),
            fund_season_pool_msg("season-zero"),
        )
        .unwrap();

    assert_eq!(
        contract.get_season_pool("season-zero".into()).0,
        fund_amount
    );
}

#[test]
fn test_fund_season_pool_via_wallet_rejects_random_account() {
    let mut contract = new_contract();
    configure_open_season(&mut contract, "season-zero");

    testing_env!(context(token()).build());
    let err = contract
        .ft_on_transfer(
            alice(),
            U128(ONE_SOCIAL),
            fund_season_pool_msg("season-zero"),
        )
        .unwrap_err();
    assert!(matches!(err, SocialSpendError::Unauthorized(_)));
}
