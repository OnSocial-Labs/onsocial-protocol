use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    contract
}

fn default_options() -> scarce::types::ScarceOptions {
    scarce::types::ScarceOptions {
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
    }
}

fn create_refundable_collection(contract: &mut Contract) {
    testing_env!(context(creator()).build());
    let config = CollectionConfig {
        collection_id: "refcol".to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"R"}"#.to_string(),
        price_near: U128(1_000_000),
        start_time: None,
        end_time: None,
        options: default_options(),
        renewable: false,
        revocation_mode: RevocationMode::None,
        max_redeems: Some(1),
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    contract
        .internal_create_collection(&creator(), config)
        .unwrap();
}

fn mint_and_get_token(contract: &mut Contract) -> String {
    testing_env!(context_with_deposit(buyer(), 1_000_000).build());
    let action = Action::PurchaseFromCollection {
        collection_id: "refcol".into(),
        quantity: 1,
        max_price_per_token: None,
    };
    contract.execute(make_request(action)).unwrap();
    let col = contract.collections.get("refcol").unwrap();
    format!("refcol:{}", col.minted_count)
}

// --- cancel_collection ---

#[test]
fn cancel_collection_happy() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);

    // Mint a token first
    let _token_id = mint_and_get_token(&mut contract);

    // The creator cancels (deposit = refund_per_token * refundable_count)
    // refundable_count = minted - fully_redeemed = 1 - 0 = 1
    // deposit = 500_000 * 1 = 500_000
    testing_env!(context_with_deposit(creator(), 500_000).build());
    contract
        .cancel_collection("refcol".into(), U128(500_000), None)
        .unwrap();

    let col = contract.get_collection("refcol".into()).unwrap();
    assert!(col.cancelled);
    assert_eq!(col.refund_pool, 500_000);
    assert_eq!(col.refund_per_token, 500_000);
}

#[test]
fn cancel_collection_not_found_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(creator(), 1_000).build());

    let err = contract
        .cancel_collection("nope".into(), U128(100), None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn cancel_collection_already_cancelled_fails() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);
    let _token_id = mint_and_get_token(&mut contract);

    testing_env!(context_with_deposit(creator(), 500_000).build());
    contract
        .cancel_collection("refcol".into(), U128(500_000), None)
        .unwrap();

    testing_env!(context_with_deposit(creator(), 500_000).build());
    let err = contract
        .cancel_collection("refcol".into(), U128(500_000), None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn cancel_collection_insufficient_deposit_fails() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);
    let _token_id = mint_and_get_token(&mut contract);

    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .cancel_collection("refcol".into(), U128(500_000), None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

#[test]
fn cancel_collection_short_deadline_fails() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);
    let _token_id = mint_and_get_token(&mut contract);

    testing_env!(context_with_deposit(creator(), 500_000).build());
    let err = contract
        .cancel_collection("refcol".into(), U128(500_000), Some(1_000)) // too short
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- claim_refund ---

#[test]
fn claim_refund_happy() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);
    let token_id = mint_and_get_token(&mut contract);

    // Cancel
    testing_env!(context_with_deposit(creator(), 500_000).build());
    contract
        .cancel_collection("refcol".into(), U128(500_000), None)
        .unwrap();

    // Claim refund (buyer = token holder, 1 yocto required)
    testing_env!(context_with_deposit(buyer(), 1).build());
    contract
        .claim_refund(token_id.clone(), "refcol".into())
        .unwrap();

    // Token should be marked refunded
    let token = contract.scarces_by_id.get(&token_id).unwrap();
    assert!(token.refunded);

    // Refund pool should be reduced
    let col = contract.get_collection("refcol".into()).unwrap();
    assert_eq!(col.refund_pool, 0);
}

#[test]
fn claim_refund_not_cancelled_fails() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);
    let token_id = mint_and_get_token(&mut contract);

    testing_env!(context_with_deposit(buyer(), 1).build());
    let err = contract
        .claim_refund(token_id, "refcol".into())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn claim_refund_not_token_owner_fails() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);
    let token_id = mint_and_get_token(&mut contract);

    // Cancel
    testing_env!(context_with_deposit(creator(), 500_000).build());
    contract
        .cancel_collection("refcol".into(), U128(500_000), None)
        .unwrap();

    // Wrong caller
    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .claim_refund(token_id, "refcol".into())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn claim_refund_twice_fails() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);
    let token_id = mint_and_get_token(&mut contract);

    testing_env!(context_with_deposit(creator(), 500_000).build());
    contract
        .cancel_collection("refcol".into(), U128(500_000), None)
        .unwrap();

    testing_env!(context_with_deposit(buyer(), 1).build());
    contract
        .claim_refund(token_id.clone(), "refcol".into())
        .unwrap();

    testing_env!(context_with_deposit(buyer(), 1).build());
    let err = contract
        .claim_refund(token_id, "refcol".into())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- withdraw_unclaimed_refunds ---

#[test]
fn withdraw_unclaimed_before_deadline_fails() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);
    let _token_id = mint_and_get_token(&mut contract);

    testing_env!(context_with_deposit(creator(), 500_000).build());
    contract
        .cancel_collection("refcol".into(), U128(500_000), None)
        .unwrap();

    // Try immediately — deadline hasn't passed
    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .withdraw_unclaimed_refunds("refcol".into())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn withdraw_unclaimed_not_cancelled_fails() {
    let mut contract = setup_contract();
    create_refundable_collection(&mut contract);

    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .withdraw_unclaimed_refunds("refcol".into())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn withdraw_unclaimed_not_found_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(creator(), 1).build());

    let err = contract
        .withdraw_unclaimed_refunds("nope".into())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}
