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

// --- QuickMint via dispatch ---

#[test]
fn dispatch_quick_mint_returns_token_id() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    let metadata = scarce::types::TokenMetadata {
        title: Some("Dispatch Token".into()),
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
    let action = Action::QuickMint { metadata, options };
    let result = contract.dispatch_action(action, &buyer()).unwrap();
    assert!(result.is_string());
    assert!(result.as_str().unwrap().starts_with("s:"));
}

// --- CreateCollection via dispatch ---

#[test]
fn dispatch_create_collection() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let params = CollectionConfig {
        collection_id: "dcol".to_string(),
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
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    let action = Action::CreateCollection { params };
    let result = contract.dispatch_action(action, &creator()).unwrap();
    assert!(result.is_null());
    assert!(contract.collections.contains_key("dcol"));
}

// --- ListNativeScarce via dispatch ---

#[test]
fn dispatch_list_native_scarce() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    // Mint a token first
    let metadata = scarce::types::TokenMetadata {
        title: Some("Listable".into()),
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
    let tid = contract.quick_mint(&buyer(), metadata, options).unwrap();

    let action = Action::ListNativeScarce {
        token_id: tid.clone(),
        price: U128(5_000),
        expires_at: None,
    };
    let result = contract.dispatch_action(action, &buyer()).unwrap();
    assert!(result.is_null());

    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    assert!(contract.sales.contains_key(&sale_id));
}

// --- DelistNativeScarce via dispatch ---

#[test]
fn dispatch_delist_native_scarce() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    let metadata = scarce::types::TokenMetadata {
        title: Some("Delist".into()),
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
    let tid = contract.quick_mint(&buyer(), metadata, options).unwrap();
    contract
        .list_native_scarce(&buyer(), &tid, U128(5_000), None)
        .unwrap();

    let action = Action::DelistNativeScarce {
        token_id: tid.clone(),
    };
    contract.dispatch_action(action, &buyer()).unwrap();

    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    assert!(!contract.sales.contains_key(&sale_id));
}

// --- TransferScarce via dispatch ---

#[test]
fn dispatch_transfer_scarce() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    let metadata = scarce::types::TokenMetadata {
        title: Some("Transfer".into()),
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
    let tid = contract.quick_mint(&buyer(), metadata, options).unwrap();

    let action = Action::TransferScarce {
        receiver_id: creator(),
        token_id: tid.clone(),
        memo: None,
    };
    contract.dispatch_action(action, &buyer()).unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.owner_id, creator());
}

// --- BurnScarce via dispatch (collection token) ---

#[test]
fn dispatch_burn_scarce() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    // Create a collection and mint a token from it
    let params = CollectionConfig {
        collection_id: "bcol".to_string(),
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
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    contract
        .create_collection(&creator(), params)
        .unwrap();
    contract
        .mint_from_collection(&creator(), "bcol", 1, Some(&buyer()))
        .unwrap();

    testing_env!(context(buyer()).build());
    let action = Action::BurnScarce {
        token_id: "bcol:1".to_string(),
        collection_id: Some("bcol".to_string()),
    };
    contract.dispatch_action(action, &buyer()).unwrap();

    assert!(!contract.scarces_by_id.contains_key("bcol:1"));
}

// --- CreateLazyListing via dispatch ---

#[test]
fn dispatch_create_lazy_listing_returns_id() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let params = LazyListing {
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
        price: U128(1_000),
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        expires_at: None,
    };
    let action = Action::CreateLazyListing { params };
    let result = contract.dispatch_action(action, &creator()).unwrap();
    assert!(result.is_string());
    assert!(result.as_str().unwrap().starts_with("ll:"));
}

// --- PauseCollection / ResumeCollection via dispatch ---

#[test]
fn dispatch_pause_and_resume_collection() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let params = CollectionConfig {
        collection_id: "pcol".to_string(),
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
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    contract
        .create_collection(&creator(), params)
        .unwrap();

    let pause = Action::PauseCollection {
        collection_id: "pcol".to_string(),
    };
    contract.dispatch_action(pause, &creator()).unwrap();
    assert!(contract.collections.get("pcol").unwrap().paused);

    let resume = Action::ResumeCollection {
        collection_id: "pcol".to_string(),
    };
    contract.dispatch_action(resume, &creator()).unwrap();
    assert!(!contract.collections.get("pcol").unwrap().paused);
}

// --- Admin: SetFeeRecipient is standalone (not via dispatch) ---

#[test]
fn standalone_set_fee_recipient_without_yocto_fails() {
    let mut contract = setup_contract();
    testing_env!(context(owner()).build());

    let err = contract.set_fee_recipient(buyer()).unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

#[test]
fn standalone_set_fee_recipient_with_yocto_happy() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract.set_fee_recipient(buyer()).unwrap();
    assert_eq!(contract.fee_recipient, buyer());
}

// --- Admin: UpdateFeeConfig is standalone (not via dispatch) ---

#[test]
fn standalone_update_fee_config_without_yocto_fails() {
    let mut contract = setup_contract();
    testing_env!(context(owner()).build());

    let err = contract.update_fee_config(FeeConfigUpdate {
        total_fee_bps: Some(300),
        ..Default::default()
    }).unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

// --- Dispatch forwarding error from inner method ---

#[test]
fn dispatch_list_nonexistent_token_forwards_error() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    let action = Action::ListNativeScarce {
        token_id: "nonexistent".to_string(),
        price: U128(1_000),
        expires_at: None,
    };
    let err = contract.dispatch_action(action, &buyer()).unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// --- BurnScarce standalone via dispatch (regression: s: prefix bug) ---

#[test]
fn dispatch_burn_standalone_token() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    let metadata = scarce::types::TokenMetadata {
        title: Some("Standalone burn".into()),
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
    let tid = contract.quick_mint(&buyer(), metadata, options).unwrap();
    assert!(tid.starts_with("s:"));

    // Burn via dispatch with collection_id = None — previously hit NotFound("Collection not found")
    let action = Action::BurnScarce {
        token_id: tid.clone(),
        collection_id: None,
    };
    contract.dispatch_action(action, &buyer()).unwrap();

    assert!(!contract.scarces_by_id.contains_key(&tid));
}

// --- UpdatePrice via dispatch ---

#[test]
fn dispatch_update_price() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    let metadata = scarce::types::TokenMetadata {
        title: Some("Price".into()),
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
    let tid = contract.quick_mint(&buyer(), metadata, options).unwrap();
    contract
        .list_native_scarce(&buyer(), &tid, U128(5_000), None)
        .unwrap();

    let mkt: AccountId = "marketplace.near".parse().unwrap();
    let action = Action::UpdatePrice {
        scarce_contract_id: mkt.clone(),
        token_id: tid.clone(),
        price: U128(8_000),
    };
    contract.dispatch_action(action, &buyer()).unwrap();

    let sale_id = Contract::make_sale_id(&mkt, &tid);
    assert_eq!(contract.sales.get(&sale_id).unwrap().sale_conditions.0, 8_000);
}

// --- PurchaseNativeScarce via execute() ---

#[test]
fn execute_purchase_native_scarce_happy() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    let metadata = scarce::types::TokenMetadata {
        title: Some("Buy me".into()),
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
    let tid = contract.quick_mint(&buyer(), metadata, options).unwrap();
    contract
        .list_native_scarce(&buyer(), &tid, U128(5_000), None)
        .unwrap();

    // Purchase as creator via execute()
    testing_env!(context_with_deposit(creator(), 10_000).build());
    contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
        }))
        .unwrap();

    // Token transferred to creator
    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.owner_id, creator());
    // Sale removed
    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    assert!(!contract.sales.contains_key(&sale_id));
}

// --- PurchaseLazyListing via execute() ---

#[test]
fn execute_purchase_lazy_listing_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let params = LazyListing {
        metadata: scarce::types::TokenMetadata {
            title: Some("Lazy buy".into()),
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
        price: U128(3_000),
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        expires_at: None,
    };
    let listing_id = contract
        .create_lazy_listing(&creator(), params)
        .unwrap();

    // Purchase via execute()
    testing_env!(context_with_deposit(buyer(), 10_000).build());
    let result = contract
        .execute(make_request(Action::PurchaseLazyListing {
            listing_id: listing_id.clone(),
        }))
        .unwrap();

    // Returns the minted token ID
    assert!(result.is_string());
    let token_id = result.as_str().unwrap();
    let token = contract.scarces_by_id.get(token_id).unwrap();
    assert_eq!(token.owner_id, buyer());
    // Listing consumed
    assert!(!contract.lazy_listings.contains_key(&listing_id));
}

// --- PlaceBid via execute() ---

#[test]
fn execute_place_bid_happy() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    let metadata = scarce::types::TokenMetadata {
        title: Some("Auction me".into()),
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
    let tid = contract.quick_mint(&buyer(), metadata, options).unwrap();
    let auction_params = AuctionListing {
        reserve_price: U128(1_000),
        min_bid_increment: U128(100),
        expires_at: Some(2_000_000_000_000_000_000),
        auction_duration_ns: None,
        anti_snipe_extension_ns: 0,
        buy_now_price: None,
    };
    contract
        .list_native_scarce_auction(&buyer(), &tid, auction_params)
        .unwrap();

    // Bid via execute()
    testing_env!(context_with_deposit(creator(), 5_000).build());
    contract
        .execute(make_request(Action::PlaceBid {
            token_id: tid.clone(),
            amount: U128(2_000),
        }))
        .unwrap();

    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    let sale = contract.sales.get(&sale_id).unwrap();
    let auction = sale.auction.as_ref().unwrap();
    assert_eq!(auction.highest_bid, 2_000);
}

// --- MakeCollectionOffer via execute() ---

#[test]
fn execute_make_collection_offer_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let params = CollectionConfig {
        collection_id: "ocol".to_string(),
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
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    contract
        .create_collection(&creator(), params)
        .unwrap();

    // Make collection offer via execute()
    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "ocol".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap();

    let offer = contract
        .get_collection_offer("ocol".to_string(), buyer())
        .expect("Collection offer should exist");
    assert_eq!(offer.buyer_id, buyer());
    assert_eq!(offer.amount, 1_000_000_000_000_000_000_000_000);
}
