use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn make_lazy_listing_params(price: u128) -> LazyListing {
    LazyListing {
        metadata: scarce::types::TokenMetadata {
            title: Some("Lazy".into()),
            description: None,
            media: None,
            media_hash: None,
            copies: None,
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        },
        price: U128(price),
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        expires_at: None,
    }
}

fn setup_contract() -> Contract {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    contract
}

// --- create_lazy_listing ---

#[test]
fn create_lazy_listing_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    assert!(id.starts_with("ll:"));
    assert!(contract.lazy_listings.contains_key(&id));
}

#[test]
fn create_lazy_listing_increments_token_id() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let before = contract.next_token_id;
    contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    assert_eq!(contract.next_token_id, before + 1);
}

#[test]
fn create_lazy_listing_past_expiry_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let mut params = make_lazy_listing_params(1_000);
    params.expires_at = Some(1_000_000_000_000_000_000); // before default block_timestamp
    let err = contract
        .create_lazy_listing(&creator(), params)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_lazy_listing_unknown_app_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let mut params = make_lazy_listing_params(1_000);
    params.options.app_id = Some("unknown-app.near".parse().unwrap());
    let err = contract
        .create_lazy_listing(&creator(), params)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn create_lazy_listing_invalid_royalty_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let mut params = make_lazy_listing_params(1_000);
    let mut bad_royalty = std::collections::HashMap::new();
    bad_royalty.insert("a.near".parse().unwrap(), 6_000u32); // over MAX_ROYALTY_BPS
    params.options.royalty = Some(bad_royalty);
    let err = contract
        .create_lazy_listing(&creator(), params)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- cancel_lazy_listing ---

#[test]
fn cancel_lazy_listing_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    contract
        .cancel_lazy_listing(&creator(), &id)
        .unwrap();
    assert!(!contract.lazy_listings.contains_key(&id));
}

#[test]
fn cancel_lazy_listing_wrong_creator_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    let err = contract
        .cancel_lazy_listing(&buyer(), &id)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn cancel_nonexistent_listing_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let err = contract
        .cancel_lazy_listing(&creator(), "ll:999")
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// --- update_lazy_listing_expiry ---

#[test]
fn update_expiry_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    let future = 2_000_000_000_000_000_000u64;
    contract
        .update_lazy_listing_expiry(&creator(), &id, Some(future))
        .unwrap();
    assert_eq!(contract.lazy_listings.get(&id).unwrap().expires_at, Some(future));
}

#[test]
fn update_expiry_past_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    let past = 1_000_000_000_000_000_000u64;
    let err = contract
        .update_lazy_listing_expiry(&creator(), &id, Some(past))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn update_expiry_wrong_creator_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    let err = contract
        .update_lazy_listing_expiry(&buyer(), &id, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- update_lazy_listing_price ---

#[test]
fn update_price_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    contract
        .update_lazy_listing_price(&creator(), &id, 5_000)
        .unwrap();
    assert_eq!(contract.lazy_listings.get(&id).unwrap().price, 5_000);
}

#[test]
fn update_price_wrong_creator_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    let err = contract
        .update_lazy_listing_price(&buyer(), &id, 5_000)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn update_price_nonexistent_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let err = contract
        .update_lazy_listing_price(&creator(), "ll:999", 5_000)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}
