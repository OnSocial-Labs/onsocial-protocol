use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;

fn minimal_config(id: &str) -> CollectionConfig {
    CollectionConfig {
        collection_id: id.to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"Token #{seat_number}"}"#.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        renewable: false,
        revocation_mode: collections::RevocationMode::None,
        max_redeems: None,
        mint_mode: collections::MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    }
}

// --- Create collection ---

#[test]
fn create_collection_happy_path() {
    let mut contract = new_contract();

    contract
        .create_collection(&creator(), minimal_config("event-2026"))
        .unwrap();

    assert!(contract.collections.contains_key("event-2026"));
    let col = contract.collections.get("event-2026").unwrap();
    assert_eq!(col.creator_id, creator());
    assert_eq!(col.total_supply, 10);
    assert_eq!(col.minted_count, 0);
}

#[test]
fn create_collection_duplicate_id_fails() {
    let mut contract = new_contract();

    contract
        .create_collection(&creator(), minimal_config("dup"))
        .unwrap();
    let err = contract
        .create_collection(&creator(), minimal_config("dup"))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- ID validation ---

#[test]
fn create_collection_empty_id_fails() {
    let mut contract = new_contract();
    let err = contract
        .create_collection(&creator(), minimal_config(""))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_colon_in_id_fails() {
    let mut contract = new_contract();
    let err = contract
        .create_collection(&creator(), minimal_config("bad:id"))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_dot_in_id_fails() {
    let mut contract = new_contract();
    let err = contract
        .create_collection(&creator(), minimal_config("bad.id"))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_reserved_s_fails() {
    let mut contract = new_contract();
    let err = contract
        .create_collection(&creator(), minimal_config("s"))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_reserved_ll_fails() {
    let mut contract = new_contract();
    let err = contract
        .create_collection(&creator(), minimal_config("ll"))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_id_too_long() {
    let mut contract = new_contract();
    let long = "a".repeat(65);
    let err = contract
        .create_collection(&creator(), minimal_config(&long))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Supply validation ---

#[test]
fn create_collection_zero_supply_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("zero");
    cfg.total_supply = 0;
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_over_max_supply_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("huge");
    cfg.total_supply = MAX_COLLECTION_SUPPLY + 1;
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Time validation ---

#[test]
fn create_collection_end_before_start_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("time");
    cfg.start_time = Some(2000);
    cfg.end_time = Some(1000);
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Dutch auction validation ---

#[test]
fn create_collection_dutch_without_times_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("dutch");
    cfg.price_near = U128(100);
    cfg.start_price = Some(U128(1000));
    // No start_time/end_time
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_dutch_start_price_le_floor_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("dutch2");
    cfg.price_near = U128(1000);
    cfg.start_price = Some(U128(500)); // less than floor
    cfg.start_time = Some(1000);
    cfg.end_time = Some(2000);
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- max_per_wallet ---

#[test]
fn create_collection_zero_max_per_wallet_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("mpw");
    cfg.max_per_wallet = Some(0);
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Creator tracking ---

#[test]
fn collection_tracked_by_creator() {
    let mut contract = new_contract();

    contract
        .create_collection(&creator(), minimal_config("c1"))
        .unwrap();
    contract
        .create_collection(&creator(), minimal_config("c2"))
        .unwrap();

    let creator_set = contract.collections_by_creator.get(&creator()).unwrap();
    assert!(creator_set.contains("c1"));
    assert!(creator_set.contains("c2"));
}

// --- Pause / Resume ---

#[test]
fn pause_and_resume_collection() {
    let mut contract = new_contract();

    contract
        .create_collection(&creator(), minimal_config("pausable"))
        .unwrap();

    contract.pause_collection(&creator(), "pausable").unwrap();
    assert!(contract.collections.get("pausable").unwrap().paused);

    contract.resume_collection(&creator(), "pausable").unwrap();
    assert!(!contract.collections.get("pausable").unwrap().paused);
}

#[test]
fn pause_wrong_creator_fails() {
    let mut contract = new_contract();

    contract
        .create_collection(&creator(), minimal_config("owned"))
        .unwrap();

    let err = contract.pause_collection(&buyer(), "owned").unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}
