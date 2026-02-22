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

fn app_id() -> AccountId {
    "app.near".parse().unwrap()
}

fn default_options() -> scarce::types::ScarceOptions {
    scarce::types::ScarceOptions {
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
    }
}

fn register_app(contract: &mut Contract) {
    testing_env!(context(owner()).build());
    let action = Action::RegisterApp {
        app_id: app_id(),
        params: AppConfig {
            max_user_bytes: Some(10_000),
            default_royalty: None,
            primary_sale_bps: Some(500),
            curated: Some(false),
            metadata: Some(r#"{"base_uri":"https://example.com"}"#.to_string()),
        },
    };
    contract.execute(make_request(action)).unwrap();
}

// --- get_app_pool ---

#[test]
fn get_app_pool_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.get_app_pool(app_id()).is_none());
}

#[test]
fn get_app_pool_returns_registered() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    testing_env!(context(owner()).build());
    let pool = contract.get_app_pool(app_id()).unwrap();
    assert_eq!(pool.owner_id, owner());
    assert_eq!(pool.max_user_bytes, 10_000);
    assert_eq!(pool.primary_sale_bps, 500);
}

// --- get_app_user_usage / get_app_user_remaining ---

#[test]
fn get_app_user_usage_zero_initially() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    testing_env!(context(owner()).build());
    assert_eq!(contract.get_app_user_usage(buyer(), app_id()), 0);
}

#[test]
fn get_app_user_remaining_returns_max() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    testing_env!(context(owner()).build());
    assert_eq!(contract.get_app_user_remaining(buyer(), app_id()), 10_000);
}

#[test]
fn get_app_user_remaining_unregistered_returns_zero() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_app_user_remaining(buyer(), app_id()), 0);
}

// --- get_user_storage ---

#[test]
fn get_user_storage_default() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    let storage = contract.get_user_storage(buyer());
    assert_eq!(storage.balance, 0);
    assert_eq!(storage.used_bytes, 0);
}

// --- get_app_metadata ---

#[test]
fn get_app_metadata_returns_json() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    testing_env!(context(owner()).build());
    let meta = contract.get_app_metadata(app_id()).unwrap();
    assert_eq!(meta["base_uri"], "https://example.com");
}

#[test]
fn get_app_metadata_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.get_app_metadata(app_id()).is_none());
}

// --- resolve_base_uri ---

#[test]
fn resolve_base_uri_from_app_metadata() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    // Create a collection under that app
    testing_env!(context(creator()).build());
    let config = CollectionConfig {
        collection_id: "appcol".to_string(),
        total_supply: 5,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: Some(app_id()),
            transferable: true,
            burnable: true,
        },
        renewable: false,
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    contract
        .create_collection(&creator(), config)
        .unwrap();

    testing_env!(context(owner()).build());
    let uri = contract.resolve_base_uri("appcol".into());
    assert_eq!(uri, Some("https://example.com".to_string()));
}

#[test]
fn resolve_base_uri_none_when_no_uri() {
    let mut contract = setup_contract();

    testing_env!(context(creator()).build());
    let config = CollectionConfig {
        collection_id: "nocol".to_string(),
        total_supply: 5,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: default_options(),
        renewable: false,
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    contract
        .create_collection(&creator(), config)
        .unwrap();

    testing_env!(context(owner()).build());
    // No app, no collection metadata, no contract base_uri => None
    assert!(contract.resolve_base_uri("nocol".into()).is_none());
}

// --- fund_app_pool ---

#[test]
fn fund_app_pool_happy() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    testing_env!(context_with_deposit(buyer(), 5_000_000).build());
    contract.fund_app_pool(&buyer(), &app_id(), 5_000_000).unwrap();

    let pool = contract.get_app_pool(app_id()).unwrap();
    assert_eq!(pool.balance, 5_000_000);
}

#[test]
fn fund_app_pool_zero_deposit_fails() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    testing_env!(context(buyer()).build());
    let err = contract.fund_app_pool(&buyer(), &app_id(), 0).unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

#[test]
fn fund_app_pool_not_found_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 1_000).build());

    let err = contract.fund_app_pool(&buyer(), &app_id(), 1_000).unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// --- withdraw_app_pool ---

#[test]
fn withdraw_app_pool_happy() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    // Fund it
    testing_env!(context_with_deposit(buyer(), 10_000_000).build());
    contract.fund_app_pool(&buyer(), &app_id(), 10_000_000).unwrap();

    // Withdraw (owner only, 1 yocto)
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .withdraw_app_pool(&owner(), &app_id(), U128(5_000_000))
        .unwrap();

    let pool = contract.get_app_pool(app_id()).unwrap();
    assert_eq!(pool.balance, 5_000_000);
}

#[test]
fn withdraw_app_pool_not_owner_fails() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    testing_env!(context_with_deposit(buyer(), 10_000_000).build());
    contract.fund_app_pool(&buyer(), &app_id(), 10_000_000).unwrap();

    testing_env!(context_with_deposit(buyer(), 1).build());
    let err = contract
        .withdraw_app_pool(&buyer(), &app_id(), U128(1_000))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn withdraw_app_pool_exceeds_balance_fails() {
    let mut contract = setup_contract();
    register_app(&mut contract);

    testing_env!(context_with_deposit(buyer(), 1_000).build());
    contract.fund_app_pool(&buyer(), &app_id(), 1_000).unwrap();

    testing_env!(context_with_deposit(owner(), 1).build());
    let err = contract
        .withdraw_app_pool(&owner(), &app_id(), U128(99_999))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}
