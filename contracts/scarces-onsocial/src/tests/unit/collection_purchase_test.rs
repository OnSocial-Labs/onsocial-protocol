use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract_with_collection(price: u128) -> (Contract, String) {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;

    let config = CollectionConfig {
        collection_id: "col".to_string(),
        total_supply: 100,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(price),
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
        .create_collection(&creator(), config)
        .unwrap();
    (contract, "col".to_string())
}

// --- Quantity validation ---

#[test]
fn purchase_quantity_zero_fails() {
    let (mut contract, col) = setup_contract_with_collection(1_000);
    testing_env!(context_with_deposit(buyer(), 10_000).build());

    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col,
            quantity: 0,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn purchase_quantity_exceeds_max_batch_fails() {
    let (mut contract, col) = setup_contract_with_collection(1_000);
    testing_env!(context_with_deposit(buyer(), 1_000_000).build());

    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col,
            quantity: MAX_BATCH_MINT + 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Collection not found ---

#[test]
fn purchase_nonexistent_collection_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 100_000).build());

    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: "nope".to_string(),
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// --- Creator-only mode ---

#[test]
fn purchase_creator_only_mode_fails() {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;

    let config = CollectionConfig {
        collection_id: "locked".to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(1_000),
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
        mint_mode: MintMode::CreatorOnly,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    contract
        .create_collection(&creator(), config)
        .unwrap();
    testing_env!(context_with_deposit(buyer(), 100_000).build());

    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: "locked".to_string(),
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- Supply exceeded ---

#[test]
fn purchase_exceeds_supply_fails() {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;

    let config = CollectionConfig {
        collection_id: "tiny".to_string(),
        total_supply: 2,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(1_000),
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
        .create_collection(&creator(), config)
        .unwrap();
    testing_env!(context_with_deposit(buyer(), 1_000_000).build());

    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: "tiny".to_string(),
            quantity: 3,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- Max per wallet ---

#[test]
fn purchase_exceeds_per_wallet_limit_fails() {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;

    let config = CollectionConfig {
        collection_id: "limited".to_string(),
        total_supply: 100,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(1_000),
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
        max_per_wallet: Some(2),
        start_price: None,
        allowlist_price: None,
    };
    contract
        .create_collection(&creator(), config)
        .unwrap();

    // First purchase of 2 succeeds
    testing_env!(context_with_deposit(buyer(), 100_000).build());
    contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: "limited".to_string(),
            quantity: 2,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap();

    // Third exceeds per-wallet limit
    testing_env!(context_with_deposit(buyer(), 100_000).build());
    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: "limited".to_string(),
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Slippage guard ---

#[test]
fn purchase_slippage_guard_rejects_high_price() {
    let (mut contract, col) = setup_contract_with_collection(10_000);
    testing_env!(context_with_deposit(buyer(), 100_000).build());

    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col,
            quantity: 1,
            max_price_per_token: U128(5_000),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Insufficient deposit ---

#[test]
fn purchase_insufficient_deposit_fails() {
    let (mut contract, col) = setup_contract_with_collection(10_000);
    testing_env!(context_with_deposit(buyer(), 5_000).build());

    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col,
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

// --- Happy path ---

#[test]
fn purchase_single_happy() {
    let (mut contract, col) = setup_contract_with_collection(1_000);
    testing_env!(context_with_deposit(buyer(), 100_000).build());

    contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col.clone(),
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap();

    let collection = contract.collections.get(&col).unwrap();
    assert_eq!(collection.minted_count, 1);
}

#[test]
fn purchase_batch_happy() {
    let (mut contract, col) = setup_contract_with_collection(1_000);
    testing_env!(context_with_deposit(buyer(), 1_000_000).build());

    contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col.clone(),
            quantity: 5,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap();

    let collection = contract.collections.get(&col).unwrap();
    assert_eq!(collection.minted_count, 5);
}

#[test]
fn purchase_tracks_revenue() {
    let (mut contract, col) = setup_contract_with_collection(1_000);
    testing_env!(context_with_deposit(buyer(), 1_000_000).build());

    contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col.clone(),
            quantity: 3,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap();

    let collection = contract.collections.get(&col).unwrap();
    assert_eq!(collection.total_revenue, 3_000);
}

// --- Paused collection ---

#[test]
fn purchase_paused_collection_fails() {
    let (mut contract, col) = setup_contract_with_collection(1_000);
    testing_env!(context(creator()).build());
    contract.pause_collection(&creator(), &col).unwrap();

    testing_env!(context_with_deposit(buyer(), 100_000).build());
    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col,
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- Allowlist pre-start phase ---

#[test]
fn purchase_before_start_without_allowlist_fails() {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;

    let future = 2_000_000_000_000_000_000u64;
    let config = CollectionConfig {
        collection_id: "al".to_string(),
        total_supply: 100,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(1_000),
        start_time: Some(future),
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
        .create_collection(&creator(), config)
        .unwrap();

    testing_env!(context_with_deposit(buyer(), 100_000).build());
    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: "al".to_string(),
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn purchase_before_start_with_allowlist_succeeds() {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;

    let future = 2_000_000_000_000_000_000u64;
    let config = CollectionConfig {
        collection_id: "al2".to_string(),
        total_supply: 100,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(1_000),
        start_time: Some(future),
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
        .create_collection(&creator(), config)
        .unwrap();

    // Add buyer to allowlist with allocation of 5
    testing_env!(context(creator()).build());
    let entries = vec![AllowlistEntry {
        account_id: buyer(),
        allocation: 5,
    }];
    contract
        .set_allowlist(&creator(), "al2", entries)
        .unwrap();

    testing_env!(context_with_deposit(buyer(), 100_000).build());
    contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: "al2".to_string(),
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap();

    let collection = contract.collections.get("al2").unwrap();
    assert_eq!(collection.minted_count, 1);
}
