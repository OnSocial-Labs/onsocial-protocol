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
    let tid = contract.internal_quick_mint(&buyer(), metadata, options).unwrap();

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
    let tid = contract.internal_quick_mint(&buyer(), metadata, options).unwrap();
    contract
        .internal_list_native_scarce(&buyer(), &tid, U128(5_000), None)
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
    let tid = contract.internal_quick_mint(&buyer(), metadata, options).unwrap();

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
        .internal_create_collection(&creator(), params)
        .unwrap();
    contract
        .internal_mint_from_collection(&creator(), "bcol", 1, Some(&buyer()))
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
        .internal_create_collection(&creator(), params)
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

// --- Admin: SetFeeRecipient requires 1 yocto ---

#[test]
fn dispatch_set_fee_recipient_without_yocto_fails() {
    let mut contract = setup_contract();
    testing_env!(context(owner()).build());

    let action = Action::SetFeeRecipient {
        fee_recipient: buyer(),
    };
    let err = contract.dispatch_action(action, &owner()).unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

#[test]
fn dispatch_set_fee_recipient_with_yocto_happy() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let action = Action::SetFeeRecipient {
        fee_recipient: buyer(),
    };
    contract.dispatch_action(action, &owner()).unwrap();
    assert_eq!(contract.fee_recipient, buyer());
}

// --- Admin: UpdateFeeConfig requires 1 yocto ---

#[test]
fn dispatch_update_fee_config_without_yocto_fails() {
    let mut contract = setup_contract();
    testing_env!(context(owner()).build());

    let action = Action::UpdateFeeConfig {
        total_fee_bps: Some(300),
        app_pool_fee_bps: None,
        platform_storage_fee_bps: None,
    };
    let err = contract.dispatch_action(action, &owner()).unwrap_err();
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
    let tid = contract.internal_quick_mint(&buyer(), metadata, options).unwrap();
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
    let tid = contract.internal_quick_mint(&buyer(), metadata, options).unwrap();
    contract
        .internal_list_native_scarce(&buyer(), &tid, U128(5_000), None)
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
