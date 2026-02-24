use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

/// Create a contract with a collection and mint one token into it.
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
    };
    contract.create_collection(&creator(), config).unwrap();

    testing_env!(context(creator()).build());
    contract
        .mint_from_collection(&creator(), "col", 1, Some(&buyer()))
        .unwrap();

    let token_id = "col:1".to_string();
    (contract, token_id)
}

// --- Renew ---

#[test]
fn renew_happy_path() {
    let (mut contract, tid) = setup_with_token(true, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let future = 2_000_000_000_000_000_000u64;
    contract
        .renew_token(&creator(), &tid, "col", future)
        .unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.metadata.expires_at, Some(future));
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

    // timestamp in the past
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

// --- Revoke (Invalidate) ---

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

// --- Revoke (Burn) ---

#[test]
fn revoke_burn_removes_token() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::Burn, true, None);
    testing_env!(context(creator()).build());

    contract
        .revoke_token(&creator(), &tid, "col", None)
        .unwrap();

    assert!(!contract.scarces_by_id.contains_key(&tid));
    let col = contract.collections.get("col").unwrap();
    assert_eq!(col.minted_count, 0, "minted_count decremented");
}

// --- Revoke (None) ---

#[test]
fn revoke_irrevocable_fails() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let err = contract
        .revoke_token(&creator(), &tid, "col", None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- Redeem ---

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

    // First revoke, then try redeem
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

// --- Burn (owner burn) ---

#[test]
fn burn_happy_path() {
    let (mut contract, tid) = setup_with_token(false, RevocationMode::None, true, None);
    testing_env!(context(buyer()).build());

    contract.burn_scarce(&buyer(), &tid, "col").unwrap();

    assert!(!contract.scarces_by_id.contains_key(&tid));
    assert_eq!(contract.collections.get("col").unwrap().minted_count, 0);
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

// --- Cross-collection token ID mismatch ---

#[test]
fn renew_wrong_collection_fails() {
    let (mut contract, _tid) = setup_with_token(true, RevocationMode::None, true, None);
    testing_env!(context(creator()).build());

    let err = contract
        .renew_token(&creator(), "col:1", "other-col", 2_000_000_000_000_000_000)
        .unwrap_err();
    // check_token_in_collection should reject
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}
