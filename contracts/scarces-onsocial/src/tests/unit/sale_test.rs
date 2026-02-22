use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;


// --- Helpers ---

/// Standalone token (quick-mint style) for listing tests outside collections.
fn make_standalone_token(contract: &mut Contract, owner_account: &AccountId) -> String {
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    testing_env!(context(owner_account.clone()).build());
    let metadata = scarce::types::TokenMetadata {
        title: Some("Standalone".into()),
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
    };
    let options = scarce::types::ScarceOptions {
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
    };
    contract.quick_mint(owner_account, metadata, options).unwrap()
}

// --- list_native_scarce ---

#[test]
fn list_native_scarce_happy() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    contract
        .list_native_scarce(&buyer(), &tid, U128(1_000), None)
        .unwrap();

    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    assert!(contract.sales.contains_key(&sale_id));
}

#[test]
fn list_native_scarce_not_owner_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(creator()).build());

    let err = contract
        .list_native_scarce(&creator(), &tid, U128(1_000), None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn list_native_scarce_zero_price_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    let err = contract
        .list_native_scarce(&buyer(), &tid, U128(0), None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn list_native_scarce_nonexistent_token_fails() {
    let mut contract = new_contract();
    testing_env!(context(buyer()).build());

    let err = contract
        .list_native_scarce(&buyer(), "nope", U128(1_000), None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn list_native_scarce_duplicate_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    contract
        .list_native_scarce(&buyer(), &tid, U128(1_000), None)
        .unwrap();
    let err = contract
        .list_native_scarce(&buyer(), &tid, U128(2_000), None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn list_native_scarce_past_expiry_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    let past = 1_000_000_000_000_000_000u64; // before test block_timestamp
    let err = contract
        .list_native_scarce(&buyer(), &tid, U128(1_000), Some(past))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- delist_native_scarce ---

#[test]
fn delist_native_scarce_happy() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    contract
        .list_native_scarce(&buyer(), &tid, U128(1_000), None)
        .unwrap();
    contract
        .delist_native_scarce(&buyer(), &tid)
        .unwrap();

    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    assert!(!contract.sales.contains_key(&sale_id));
}

#[test]
fn delist_native_scarce_wrong_owner_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    contract
        .list_native_scarce(&buyer(), &tid, U128(1_000), None)
        .unwrap();
    let err = contract
        .delist_native_scarce(&creator(), &tid)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn delist_nonexistent_sale_fails() {
    let mut contract = new_contract();
    testing_env!(context(buyer()).build());

    let err = contract
        .delist_native_scarce(&buyer(), "no-sale")
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// --- update_price ---

#[test]
fn update_price_happy() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    contract
        .list_native_scarce(&buyer(), &tid, U128(1_000), None)
        .unwrap();
    let mkt: AccountId = "marketplace.near".parse().unwrap();
    contract
        .update_price(&buyer(), &mkt, &tid, U128(2_000))
        .unwrap();

    let sale_id = Contract::make_sale_id(&mkt, &tid);
    assert_eq!(contract.sales.get(&sale_id).unwrap().sale_conditions.0, 2_000);
}

#[test]
fn update_price_zero_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    contract
        .list_native_scarce(&buyer(), &tid, U128(1_000), None)
        .unwrap();
    let mkt: AccountId = "marketplace.near".parse().unwrap();
    let err = contract
        .update_price(&buyer(), &mkt, &tid, U128(0))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn update_price_wrong_owner_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    contract
        .list_native_scarce(&buyer(), &tid, U128(1_000), None)
        .unwrap();
    let mkt: AccountId = "marketplace.near".parse().unwrap();
    let err = contract
        .update_price(&creator(), &mkt, &tid, U128(5_000))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- Auction listing ---

#[test]
fn auction_list_happy() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    let params = AuctionListing {
        reserve_price: U128(1_000),
        min_bid_increment: U128(100),
        expires_at: Some(2_000_000_000_000_000_000),
        auction_duration_ns: None,
        anti_snipe_extension_ns: 0,
        buy_now_price: None,
    };
    contract
        .list_native_scarce_auction(&buyer(), &tid, params)
        .unwrap();

    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    let sale = contract.sales.get(&sale_id).unwrap();
    assert!(sale.auction.is_some());
}

#[test]
fn auction_list_zero_increment_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    let params = AuctionListing {
        reserve_price: U128(1_000),
        min_bid_increment: U128(0),
        expires_at: Some(2_000_000_000_000_000_000),
        auction_duration_ns: None,
        anti_snipe_extension_ns: 0,
        buy_now_price: None,
    };
    let err = contract
        .list_native_scarce_auction(&buyer(), &tid, params)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn auction_list_no_expiry_no_duration_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    let params = AuctionListing {
        reserve_price: U128(1_000),
        min_bid_increment: U128(100),
        expires_at: None,
        auction_duration_ns: None,
        anti_snipe_extension_ns: 0,
        buy_now_price: None,
    };
    let err = contract
        .list_native_scarce_auction(&buyer(), &tid, params)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn auction_list_buy_now_below_reserve_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    let params = AuctionListing {
        reserve_price: U128(1_000),
        min_bid_increment: U128(100),
        expires_at: Some(2_000_000_000_000_000_000),
        auction_duration_ns: None,
        anti_snipe_extension_ns: 0,
        buy_now_price: Some(U128(500)), // below reserve
    };
    let err = contract
        .list_native_scarce_auction(&buyer(), &tid, params)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Auction cancel ---

#[test]
fn cancel_auction_no_bids_happy() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    let params = AuctionListing {
        reserve_price: U128(1_000),
        min_bid_increment: U128(100),
        expires_at: Some(2_000_000_000_000_000_000),
        auction_duration_ns: None,
        anti_snipe_extension_ns: 0,
        buy_now_price: None,
    };
    contract
        .list_native_scarce_auction(&buyer(), &tid, params)
        .unwrap();
    contract.cancel_auction(&buyer(), &tid).unwrap();

    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    assert!(!contract.sales.contains_key(&sale_id));
}

#[test]
fn cancel_auction_wrong_owner_fails() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    let params = AuctionListing {
        reserve_price: U128(1_000),
        min_bid_increment: U128(100),
        expires_at: Some(2_000_000_000_000_000_000),
        auction_duration_ns: None,
        anti_snipe_extension_ns: 0,
        buy_now_price: None,
    };
    contract
        .list_native_scarce_auction(&buyer(), &tid, params)
        .unwrap();
    let err = contract
        .cancel_auction(&creator(), &tid)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- Sale index ---

#[test]
fn make_sale_id_format() {
    let contract_id: AccountId = "nft.near".parse().unwrap();
    let sale_id = Contract::make_sale_id(&contract_id, "token-1");
    assert!(sale_id.contains("nft.near"));
    assert!(sale_id.contains("token-1"));
}

#[test]
fn add_then_remove_sale_cleans_indexes() {
    let mut contract = new_contract();
    let tid = make_standalone_token(&mut contract, &buyer());
    testing_env!(context(buyer()).build());

    contract
        .list_native_scarce(&buyer(), &tid, U128(1_000), None)
        .unwrap();

    // Verify by_owner_id populated
    let owner_set = contract.by_owner_id.get(&buyer());
    assert!(owner_set.is_some());

    contract
        .delist_native_scarce(&buyer(), &tid)
        .unwrap();

    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    assert!(!contract.sales.contains_key(&sale_id));
}

// --- Soulbound listing gate ---

#[test]
fn list_soulbound_token_fails() {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;

    // Create a soulbound collection
    let config = CollectionConfig {
        collection_id: "soul".to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: false,
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
    testing_env!(context(creator()).build());
    contract
        .mint_from_collection(&creator(), "soul", 1, Some(&buyer()))
        .unwrap();

    testing_env!(context(buyer()).build());
    let err = contract
        .list_native_scarce(&buyer(), "soul:1", U128(1_000), None)
        .unwrap_err();
    // Soulbound check
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- Revoked token listing gate ---

#[test]
fn list_revoked_token_fails() {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;

    let config = CollectionConfig {
        collection_id: "rev".to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        renewable: false,
        revocation_mode: RevocationMode::Invalidate,
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
    testing_env!(context(creator()).build());
    contract
        .mint_from_collection(&creator(), "rev", 1, Some(&buyer()))
        .unwrap();

    // Revoke it
    contract
        .revoke_token(&creator(), "rev:1", "rev", None)
        .unwrap();

    testing_env!(context(buyer()).build());
    let err = contract
        .list_native_scarce(&buyer(), "rev:1", U128(1_000), None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}
