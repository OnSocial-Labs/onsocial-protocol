use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

fn setup_with_token(
    renewable: bool,
    revocation_mode: RevocationMode,
    burnable: bool,
    max_redeems: Option<u32>,
) -> (Contract, String) {
    let mut contract = new_contract();

    let config = CollectionConfig {
        collection_id: "col".to_string(),
        total_supply: 100,
        metadata_template: r#"{"title":"Token #{seat_number}"}"#.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable,
        },
        renewable,
        revocation_mode,
        max_redeems,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
        max_per_purchase: None,
        random_assignment: false,
    };
    contract.create_collection(&creator(), config).unwrap();

    testing_env!(context(creator()).build());
    contract
        .mint_from_collection(&creator(), "col", 1, Some(&buyer()))
        .unwrap();

    let token_id = "col:1".to_string();
    (contract, token_id)
}

#[test]
fn renew_happy_path() {
    let (mut contract, tid) = setup_with_token(true, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let future = 2_000_000_000_000_000_000u64;
    contract
        .renew_token(&creator(), &tid, "col", future)
        .unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.metadata.expires_at, Some(2_000_000_000_000));
    assert_eq!(token.metadata.updated_at, Some(1_700_000_000_000));
}

#[test]
fn renew_non_renewable_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let future = 2_000_000_000_000_000_000u64;
    let err = contract
        .renew_token(&creator(), &tid, "col", future)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn renew_past_expiry_fails() {
    let (mut contract, tid) = setup_with_token(true, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let past = 1_000_000_000_000_000_000u64;
    let err = contract
        .renew_token(&creator(), &tid, "col", past)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn renew_non_creator_fails() {
    let (mut contract, tid) = setup_with_token(true, RevocationMode::None, true, None);
    testing_env!(context(buyer()).build());

    let future = 2_000_000_000_000_000_000u64;
    let err = contract
        .renew_token(&buyer(), &tid, "col", future)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn revoke_invalidate_happy() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::Invalidate, true, None);
    testing_env!(context(creator()).build());

    contract
        .revoke_token(&creator(), &tid, "col", Some("bad behaviour".into()))
        .unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert!(token.revoked_at.is_some());
    assert_eq!(token.revocation_memo, Some("bad behaviour".to_string()));
    assert!(token.approved_account_ids.is_empty(), "approvals cleared");
}

#[test]
fn revoke_already_revoked_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::Invalidate, true, None);
    testing_env!(context(creator()).build());

    contract
        .revoke_token(&creator(), &tid, "col", None)
        .unwrap();
    let err = contract
        .revoke_token(&creator(), &tid, "col", None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn revoke_burn_removes_token() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::Burn, true, None);
    testing_env!(context(creator()).build());

    contract
        .revoke_token(&creator(), &tid, "col", None)
        .unwrap();

    assert!(!contract.scarces_by_id.contains_key(&tid));
    let col = contract.collections.get("col").unwrap();
    assert_eq!(
        col.minted_count, 1,
        "minted_count is high-water mark, not decremented"
    );
}

#[test]
fn revoke_irrevocable_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let err = contract
        .revoke_token(&creator(), &tid, "col", None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn redeem_happy_path() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, Some(3));
    testing_env!(context(creator()).build());

    contract.redeem_token(&creator(), &tid, "col").unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.redeem_count, 1);
    assert!(token.redeemed_at.is_some());
}

#[test]
fn redeem_max_reached_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());

    contract.redeem_token(&creator(), &tid, "col").unwrap();
    let err = contract.redeem_token(&creator(), &tid, "col").unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn redeem_expired_token_fails() {
    let (mut contract, tid) = setup_with_token(true, RevocationMode::None, true, Some(3));
    // Event ended (NEP-177 ms in the past) — the door must reject.
    let mut token = contract.scarces_by_id.get(&tid).unwrap().clone();
    token.metadata.expires_at = Some(1_600_000_000_000);
    contract.scarces_by_id.insert(tid.clone(), token);

    testing_env!(context(creator()).build());
    let err = contract.redeem_token(&creator(), &tid, "col").unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
    assert_eq!(contract.scarces_by_id.get(&tid).unwrap().redeem_count, 0);
}

#[test]
fn redeem_after_renew_succeeds() {
    let (mut contract, tid) = setup_with_token(true, RevocationMode::None, true, Some(3));
    let mut token = contract.scarces_by_id.get(&tid).unwrap().clone();
    token.metadata.expires_at = Some(1_600_000_000_000);
    contract.scarces_by_id.insert(tid.clone(), token);

    // Rain-day: renew to a future date (ns arg), then the door admits again.
    testing_env!(context(creator()).build());
    contract
        .renew_token(&creator(), &tid, "col", 1_800_000_000_000_000_000)
        .unwrap();
    contract.redeem_token(&creator(), &tid, "col").unwrap();
    assert_eq!(contract.scarces_by_id.get(&tid).unwrap().redeem_count, 1);
}

#[test]
fn redeem_non_redeemable_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let err = contract.redeem_token(&creator(), &tid, "col").unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn redeem_revoked_token_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::Invalidate, true, Some(1));
    testing_env!(context(creator()).build());

    contract
        .revoke_token(&creator(), &tid, "col", None)
        .unwrap();
    let err = contract.redeem_token(&creator(), &tid, "col").unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn redeem_increments_collection_counters() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());

    contract.redeem_token(&creator(), &tid, "col").unwrap();

    let col = contract.collections.get("col").unwrap();
    assert_eq!(col.redeemed_count, 1);
    assert_eq!(col.fully_redeemed_count, 1, "1 of 1 max → fully redeemed");
}

#[test]
fn redeem_outsider_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(buyer()).build());

    let err = contract.redeem_token(&buyer(), &tid, "col").unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn add_redeemer_happy_and_redeemer_can_redeem() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, Some(2));
    testing_env!(context(creator()).build());

    contract.add_redeemer(&creator(), "col", buyer()).unwrap();
    assert!(contract.is_collection_redeemer("col".into(), buyer()));
    assert!(contract.is_collection_redeemer("col".into(), creator()));

    testing_env!(context(buyer()).build());
    contract.redeem_token(&buyer(), &tid, "col").unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.redeem_count, 1);
}

#[test]
fn add_redeemer_duplicate_fails() {
    let (mut contract, _tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());

    contract.add_redeemer(&creator(), "col", buyer()).unwrap();
    let err = contract
        .add_redeemer(&creator(), "col", buyer())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn add_redeemer_non_creator_fails() {
    let (mut contract, _tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(buyer()).build());

    let err = contract.add_redeemer(&buyer(), "col", owner()).unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn remove_redeemer_happy_then_cannot_redeem() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());

    contract.add_redeemer(&creator(), "col", buyer()).unwrap();
    contract
        .remove_redeemer(&creator(), "col", &buyer())
        .unwrap();
    assert!(
        !contract
            .collections
            .get("col")
            .unwrap()
            .redeemers
            .contains(&buyer())
    );

    testing_env!(context(buyer()).build());
    let err = contract.redeem_token(&buyer(), &tid, "col").unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn remove_redeemer_missing_fails() {
    let (mut contract, _tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());

    let err = contract
        .remove_redeemer(&creator(), "col", &buyer())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn add_redeemer_cap_fails() {
    let (mut contract, _tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());

    for i in 0..MAX_COLLECTION_REDEEMERS {
        let account: AccountId = format!("door{i}.near").parse().unwrap();
        contract.add_redeemer(&creator(), "col", account).unwrap();
    }
    let overflow: AccountId = "overflow.near".parse().unwrap();
    let err = contract
        .add_redeemer(&creator(), "col", overflow)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn set_redeemers_replaces_roster() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, Some(2));
    testing_env!(context(creator()).build());

    contract
        .set_redeemers(&creator(), "col", vec![buyer(), owner()])
        .unwrap();
    assert!(contract.is_collection_redeemer("col".into(), buyer()));
    assert!(contract.is_collection_redeemer("col".into(), owner()));

    contract
        .set_redeemers(&creator(), "col", vec![buyer()])
        .unwrap();
    assert!(contract.is_collection_redeemer("col".into(), buyer()));
    assert!(
        !contract
            .collections
            .get("col")
            .unwrap()
            .redeemers
            .contains(&owner())
    );

    testing_env!(context(buyer()).build());
    contract.redeem_token(&buyer(), &tid, "col").unwrap();
}

#[test]
fn set_redeemers_empty_clears() {
    let (mut contract, _tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());

    contract
        .set_redeemers(&creator(), "col", vec![buyer()])
        .unwrap();
    contract.set_redeemers(&creator(), "col", vec![]).unwrap();
    assert!(
        contract
            .collections
            .get("col")
            .unwrap()
            .redeemers
            .is_empty()
    );
}

#[test]
fn set_redeemers_cap_fails() {
    let (mut contract, _tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());

    let mut accounts = Vec::new();
    for i in 0..=MAX_COLLECTION_REDEEMERS {
        accounts.push(format!("door{i}.near").parse().unwrap());
    }
    let err = contract
        .set_redeemers(&creator(), "col", accounts)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn set_redeemers_non_creator_fails() {
    let (mut contract, _tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(buyer()).build());

    let err = contract
        .set_redeemers(&buyer(), "col", vec![owner()])
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn set_redeemers_dedupes() {
    let (mut contract, _tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());

    contract
        .set_redeemers(&creator(), "col", vec![buyer(), buyer()])
        .unwrap();
    assert_eq!(contract.collections.get("col").unwrap().redeemers.len(), 1);
}

#[test]
fn redeemer_cannot_pause_collection() {
    let (mut contract, _tid) = setup_with_token(false, RevocationMode::None, true, Some(1));
    testing_env!(context(creator()).build());
    contract.add_redeemer(&creator(), "col", buyer()).unwrap();

    testing_env!(context(buyer()).build());
    let err = contract.pause_collection(&buyer(), "col").unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn burn_happy_path() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, None);
    testing_env!(context(buyer()).build());

    contract.burn_scarce(&buyer(), &tid, "col").unwrap();

    assert!(!contract.scarces_by_id.contains_key(&tid));
    assert_eq!(contract.collections.get("col").unwrap().minted_count, 1);
}

#[test]
fn burn_non_burnable_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, false, None);
    testing_env!(context(buyer()).build());

    let err = contract.burn_scarce(&buyer(), &tid, "col").unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn burn_not_owner_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let err = contract.burn_scarce(&creator(), &tid, "col").unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn renew_wrong_collection_fails() {
    let (mut contract, _tid) = setup_with_token(true, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let err = contract
        .renew_token(&creator(), "col:1", "other-col", 2_000_000_000_000_000_000)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}
