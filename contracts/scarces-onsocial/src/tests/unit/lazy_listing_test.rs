use crate::tests::test_utils::*;
use crate::*;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::test_utils::get_logs;
use near_sdk::testing_env;

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
        max_per_purchase: 1,
    }
}

fn setup_contract() -> Contract {
    new_contract()
}

#[test]
fn create_lazy_listing_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    assert!(id.starts_with("ll:"));
    assert!(contract.lazy_listings.contains_key(&id));
    let listing = contract.lazy_listings.get(&id).unwrap();
    assert_eq!(listing.minted_count, 0);
    assert_eq!(listing.metadata.copies, Some(1));
    assert_eq!(crate::lazy_listing::remaining_editions(listing), 1);
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
    params.expires_at = Some(1_000_000_000_000_000_000);
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
    params.options.app_id = Some("unknown-app".to_string());
    let err = contract
        .create_lazy_listing(&creator(), params)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn create_lazy_listing_invite_only_blocks_outsider() {
    let mut contract = setup_contract();
    contract.app_pools.insert(
        "gated".to_string(),
        AppPool {
            owner_id: owner(),
            balance: U128(10u128.pow(24)),
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: None,
            primary_sale_bps: 100,
            moderators: vec![],
            curated: false,
            metadata: None,
            creator_access: CreatorAccess::InviteOnly,
            approved_creators: vec![],
        },
    );
    testing_env!(context(creator()).build());

    let mut params = make_lazy_listing_params(1_000);
    params.options.app_id = Some("gated".to_string());
    let err = contract
        .create_lazy_listing(&creator(), params)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn create_lazy_listing_snapshots_commission_and_emits_app_id() {
    let mut contract = setup_contract();
    contract.app_pools.insert(
        "snap".to_string(),
        AppPool {
            owner_id: owner(),
            balance: U128(10u128.pow(24)),
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: None,
            primary_sale_bps: 350,
            moderators: vec![],
            curated: false,
            metadata: None,
            creator_access: CreatorAccess::Open,
            approved_creators: vec![],
        },
    );
    testing_env!(context(creator()).build());

    let mut params = make_lazy_listing_params(1_000);
    params.options.app_id = Some("snap".to_string());
    let id = contract.create_lazy_listing(&creator(), params).unwrap();

    let listing = contract.lazy_listings.get(&id).unwrap();
    assert_eq!(listing.app_commission_bps, 350);
    assert_eq!(listing.app_id.as_deref(), Some("snap"));

    let logs = get_logs();
    let joined = logs.join("\n");
    assert!(
        joined.contains("\"app_id\":\"snap\""),
        "created event must carry app_id for indexer: {joined}"
    );
    assert!(
        joined.contains("\"app_commission_bps\":350"),
        "created event must carry commission snapshot: {joined}"
    );

    // Live pool change must not rewrite the snapshot.
    let mut pool = contract.app_pools.get("snap").unwrap().clone();
    pool.primary_sale_bps = 900;
    contract.app_pools.insert("snap".to_string(), pool);
    assert_eq!(
        contract.calculate_app_commission(10_000, Some("snap"), Some(listing.app_commission_bps)),
        350
    );
}

#[test]
fn create_lazy_listing_invalid_royalty_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let mut params = make_lazy_listing_params(1_000);
    let mut bad_royalty = std::collections::HashMap::new();
    bad_royalty.insert("a.near".parse().unwrap(), 6_000u32);
    params.options.royalty = Some(bad_royalty);
    let err = contract
        .create_lazy_listing(&creator(), params)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn cancel_lazy_listing_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    contract.cancel_lazy_listing(&creator(), &id).unwrap();
    assert!(!contract.lazy_listings.contains_key(&id));
}

#[test]
fn cancel_lazy_listing_wrong_creator_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let id = contract
        .create_lazy_listing(&creator(), make_lazy_listing_params(1_000))
        .unwrap();
    let err = contract.cancel_lazy_listing(&buyer(), &id).unwrap_err();
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
    assert_eq!(
        contract.lazy_listings.get(&id).unwrap().expires_at,
        Some(future)
    );
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
    assert_eq!(contract.lazy_listings.get(&id).unwrap().price, U128(5_000));
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

/// Pre-`minted_count` / `max_per_purchase` Borsh bytes (fields through `created_at` only).
fn borsh_legacy_lazy_listing(listing: &LazyListingRecord) -> Vec<u8> {
    let mut buf = Vec::new();
    listing.creator_id.serialize(&mut buf).unwrap();
    listing.metadata.serialize(&mut buf).unwrap();
    listing.price.serialize(&mut buf).unwrap();
    listing.royalty.serialize(&mut buf).unwrap();
    listing.app_id.serialize(&mut buf).unwrap();
    listing.transferable.serialize(&mut buf).unwrap();
    listing.burnable.serialize(&mut buf).unwrap();
    listing.expires_at.serialize(&mut buf).unwrap();
    listing.created_at.serialize(&mut buf).unwrap();
    buf
}

#[test]
fn lazy_listing_borsh_append_defaults_minted_and_max() {
    let legacy = LazyListingRecord {
        creator_id: creator(),
        metadata: scarce::types::TokenMetadata {
            title: Some("Legacy".into()),
            description: None,
            media: None,
            media_hash: None,
            copies: Some(4),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        },
        price: U128(1_000),
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
        expires_at: None,
        created_at: 42,
        minted_count: 99,
        max_per_purchase: 7,
        app_commission_bps: 0,
    };
    let bytes = borsh_legacy_lazy_listing(&legacy);
    let loaded = LazyListingRecord::try_from_slice(&bytes).unwrap();
    assert_eq!(loaded.minted_count, 0);
    assert_eq!(loaded.max_per_purchase, 1);
    assert_eq!(loaded.app_commission_bps, u16::MAX);
    assert_eq!(loaded.metadata.copies, Some(4));
    assert_eq!(loaded.created_at, 42);
}

#[test]
fn lazy_listing_borsh_minted_only_defaults_max_per_purchase() {
    use near_sdk::borsh::BorshDeserialize;

    let mut buf = borsh_legacy_lazy_listing(&LazyListingRecord {
        creator_id: creator(),
        metadata: scarce::types::TokenMetadata {
            title: Some("Mid".into()),
            description: None,
            media: None,
            media_hash: None,
            copies: Some(3),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        },
        price: U128(500),
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
        expires_at: None,
        created_at: 1,
        minted_count: 0,
        max_per_purchase: 1,
        app_commission_bps: 0,
    });
    2u32.serialize(&mut buf).unwrap(); // minted_count only
    0u32.serialize(&mut buf).unwrap(); // IterableMap key_index

    #[derive(near_sdk::borsh::BorshSerialize, BorshDeserialize)]
    #[borsh(crate = "near_sdk::borsh")]
    struct ValueAndIndex {
        value: LazyListingRecord,
        key_index: u32,
    }
    let loaded = ValueAndIndex::try_from_slice(&buf).unwrap().value;
    assert_eq!(loaded.minted_count, 2);
    assert_eq!(loaded.max_per_purchase, 1);
}

#[test]
fn purchase_lazy_listing_emits_one_event_with_quantity() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let mut params = make_lazy_listing_params(1_000);
    params.metadata.copies = Some(10);
    params.max_per_purchase = 3;
    let listing_id = contract.create_lazy_listing(&creator(), params).unwrap();

    testing_env!(context_with_deposit(buyer(), 10_000).build());
    let token_ids = contract
        .purchase_lazy_listing(&buyer(), listing_id.clone(), 3, 10_000)
        .unwrap();
    assert_eq!(token_ids.len(), 3);

    let logs = get_logs();
    let purchased: Vec<&String> = logs
        .iter()
        .filter(|l| l.contains("LAZY_LISTING_UPDATE") && l.contains("\"purchased\""))
        .collect();
    assert_eq!(
        purchased.len(),
        1,
        "expected one purchased event, got {purchased:?}"
    );
    let payload = purchased[0];
    assert!(payload.contains("\"quantity\":3"));
    assert!(payload.contains("\"total_price\":\"3000\""));
    assert!(payload.contains("\"minted_count\":3"));
    assert!(payload.contains("\"remaining\":7"));
    assert!(payload.contains(&token_ids[0]));
    assert!(payload.contains(&token_ids[2]));
}
