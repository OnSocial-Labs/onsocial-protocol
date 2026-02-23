use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

fn mint_config(id: &str, supply: u32, mint_mode: MintMode) -> CollectionConfig {
    CollectionConfig {
        collection_id: id.to_string(),
        total_supply: supply,
        metadata_template: r#"{"title":"Token #{seat_number}"}"#.to_string(),
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
        mint_mode,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    }
}

fn setup_with_collection(supply: u32, mint_mode: MintMode) -> Contract {
    let mut contract = new_contract();
    contract
        .create_collection(&creator(), mint_config("col", supply, mint_mode))
        .unwrap();
    contract
}

// --- Happy path ---

#[test]
fn creator_mint_single() {
    let mut contract = setup_with_collection(10, MintMode::Open);
    testing_env!(context(creator()).build());

    contract
        .mint_from_collection(&creator(), "col", 1, None)
        .unwrap();

    let col = contract.collections.get("col").unwrap();
    assert_eq!(col.minted_count, 1);
    assert!(contract.scarces_by_id.contains_key("col:1"));
}

#[test]
fn creator_mint_batch() {
    let mut contract = setup_with_collection(10, MintMode::Open);
    testing_env!(context(creator()).build());

    contract
        .mint_from_collection(&creator(), "col", 5, None)
        .unwrap();

    let col = contract.collections.get("col").unwrap();
    assert_eq!(col.minted_count, 5);
    for i in 1..=5 {
        assert!(contract.scarces_by_id.contains_key(&format!("col:{}", i)));
    }
}

#[test]
fn creator_mint_to_receiver() {
    let mut contract = setup_with_collection(10, MintMode::Open);
    testing_env!(context(creator()).build());

    contract
        .mint_from_collection(&creator(), "col", 1, Some(&buyer()))
        .unwrap();

    let token = contract.scarces_by_id.get("col:1").unwrap();
    assert_eq!(token.owner_id, buyer());
}

// --- Supply cap ---

#[test]
fn mint_exceeds_supply_fails() {
    let mut contract = setup_with_collection(3, MintMode::Open);
    testing_env!(context(creator()).build());

    let err = contract
        .mint_from_collection(&creator(), "col", 4, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn mint_exact_remaining_supply() {
    let mut contract = setup_with_collection(3, MintMode::Open);
    testing_env!(context(creator()).build());

    contract
        .mint_from_collection(&creator(), "col", 3, None)
        .unwrap();

    let col = contract.collections.get("col").unwrap();
    assert_eq!(col.minted_count, 3);
}

// --- Quantity validation ---

#[test]
fn mint_zero_quantity_fails() {
    let mut contract = setup_with_collection(10, MintMode::Open);
    testing_env!(context(creator()).build());

    let err = contract
        .mint_from_collection(&creator(), "col", 0, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn mint_exceeds_max_batch_fails() {
    let mut contract = setup_with_collection(100, MintMode::Open);
    testing_env!(context(creator()).build());

    let err = contract
        .mint_from_collection(&creator(), "col", MAX_BATCH_MINT + 1, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- MintMode gates ---

#[test]
fn purchase_only_blocks_creator_mint() {
    let mut contract = setup_with_collection(10, MintMode::PurchaseOnly);
    testing_env!(context(creator()).build());

    let err = contract
        .mint_from_collection(&creator(), "col", 1, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn creator_only_allows_creator_mint() {
    let mut contract = setup_with_collection(10, MintMode::CreatorOnly);
    testing_env!(context(creator()).build());

    contract
        .mint_from_collection(&creator(), "col", 1, None)
        .unwrap();
    assert_eq!(contract.collections.get("col").unwrap().minted_count, 1);
}

// --- Authority checks ---

#[test]
fn non_creator_cannot_mint() {
    let mut contract = setup_with_collection(10, MintMode::Open);
    testing_env!(context(buyer()).build());

    let err = contract
        .mint_from_collection(&buyer(), "col", 1, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- Paused / banned / cancelled gate ---

#[test]
fn paused_collection_blocks_mint() {
    let mut contract = setup_with_collection(10, MintMode::Open);
    testing_env!(context(creator()).build());

    // Pause
    contract.pause_collection(&creator(), "col").unwrap();

    let err = contract
        .mint_from_collection(&creator(), "col", 1, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn cancelled_collection_blocks_mint() {
    let mut contract = setup_with_collection(10, MintMode::Open);
    testing_env!(context(creator()).build());

    // Cancel
    {
        let mut col = contract.collections.get("col").unwrap().clone();
        col.cancelled = true;
        contract.collections.insert("col".to_string(), col);
    }

    let err = contract
        .mint_from_collection(&creator(), "col", 1, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn banned_collection_blocks_mint() {
    let mut contract = setup_with_collection(10, MintMode::Open);
    testing_env!(context(creator()).build());

    // Ban
    {
        let mut col = contract.collections.get("col").unwrap().clone();
        col.banned = true;
        contract.collections.insert("col".to_string(), col);
    }

    let err = contract
        .mint_from_collection(&creator(), "col", 1, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- Not-found collection ---

#[test]
fn mint_from_nonexistent_collection_fails() {
    let mut contract = new_contract();
    testing_env!(context(creator()).build());

    let err = contract
        .mint_from_collection(&creator(), "nope", 1, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}
