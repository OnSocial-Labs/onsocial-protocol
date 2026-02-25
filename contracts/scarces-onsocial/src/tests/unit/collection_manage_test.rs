use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn app_id() -> AccountId {
    "myapp.near".parse().unwrap()
}

fn setup_contract() -> Contract {
    new_contract()
}

fn minimal_config(id: &str) -> CollectionConfig {
    CollectionConfig {
        collection_id: id.to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"Token #{seat_number}"}"#.to_string(),
        price_near: U128(1_000_000_000_000_000_000_000_000), // 1 NEAR
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

fn setup_with_collection(id: &str) -> Contract {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::CreateCollection {
            params: minimal_config(id),
        }))
        .unwrap();
    contract
}

fn setup_with_app_collection(col_id: &str) -> Contract {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(owner(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig::default(),
        }))
        .unwrap();

    testing_env!(context(creator()).build());
    let mut cfg = minimal_config(col_id);
    cfg.options.app_id = Some(app_id());
    contract
        .execute(make_request(Action::CreateCollection { params: cfg }))
        .unwrap();
    contract
}

// ─── UpdateCollectionPrice ──────────────────────────────────────────────────

#[test]
fn update_collection_price_happy() {
    let mut contract = setup_with_collection("col1");

    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::UpdateCollectionPrice {
            collection_id: "col1".to_string(),
            new_price_near: U128(2_000_000_000_000_000_000_000_000),
        }))
        .unwrap();

    let col = contract.collections.get("col1").unwrap();
    assert_eq!(col.price_near.0, 2_000_000_000_000_000_000_000_000);
}

#[test]
fn update_collection_price_non_creator_fails() {
    let mut contract = setup_with_collection("col1");
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::UpdateCollectionPrice {
            collection_id: "col1".to_string(),
            new_price_near: U128(2_000),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn update_collection_price_not_found_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(creator(), 1).build());

    let err = contract
        .execute(make_request(Action::UpdateCollectionPrice {
            collection_id: "nope".to_string(),
            new_price_near: U128(1_000),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// ─── UpdateCollectionTiming ─────────────────────────────────────────────────

#[test]
fn update_collection_timing_happy() {
    let mut contract = setup_with_collection("col1");

    testing_env!(context_with_deposit(creator(), 1).build());
    let start = 1_800_000_000_000_000_000u64;
    let end = 1_900_000_000_000_000_000u64;
    contract
        .execute(make_request(Action::UpdateCollectionTiming {
            collection_id: "col1".to_string(),
            start_time: Some(start),
            end_time: Some(end),
        }))
        .unwrap();

    let col = contract.collections.get("col1").unwrap();
    assert_eq!(col.start_time, Some(start));
    assert_eq!(col.end_time, Some(end));
}

#[test]
fn update_collection_timing_end_before_start_fails() {
    let mut contract = setup_with_collection("col1");

    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::UpdateCollectionTiming {
            collection_id: "col1".to_string(),
            start_time: Some(1_900_000_000_000_000_000),
            end_time: Some(1_800_000_000_000_000_000),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn update_collection_timing_non_creator_fails() {
    let mut contract = setup_with_collection("col1");
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::UpdateCollectionTiming {
            collection_id: "col1".to_string(),
            start_time: None,
            end_time: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// ─── DeleteCollection ───────────────────────────────────────────────────────

#[test]
fn delete_collection_happy() {
    let mut contract = setup_with_collection("todel");

    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::DeleteCollection {
            collection_id: "todel".to_string(),
        }))
        .unwrap();
    assert!(!contract.collections.contains_key("todel"));
}

#[test]
fn delete_collection_with_mints_fails() {
    let mut contract = setup_with_collection("minted");

    // Mint 1 token into the collection
    contract
        .execute(make_request(Action::MintFromCollection {
            collection_id: "minted".to_string(),
            quantity: 1,
            receiver_id: None,
        }))
        .unwrap();

    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::DeleteCollection {
            collection_id: "minted".to_string(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn delete_collection_non_creator_fails() {
    let mut contract = setup_with_collection("todel");
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::DeleteCollection {
            collection_id: "todel".to_string(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// ─── AirdropFromCollection ──────────────────────────────────────────────────

#[test]
fn airdrop_from_collection_happy() {
    let mut contract = setup_with_collection("airdrop");

    contract
        .execute(make_request(Action::AirdropFromCollection {
            collection_id: "airdrop".to_string(),
            receivers: vec![buyer(), owner()],
        }))
        .unwrap();

    let col = contract.collections.get("airdrop").unwrap();
    assert_eq!(col.minted_count, 2);

    // Tokens exist and are owned by the right accounts
    assert!(contract.scarces_by_id.contains_key("airdrop:1"));
    assert!(contract.scarces_by_id.contains_key("airdrop:2"));
    assert_eq!(
        contract.scarces_by_id.get("airdrop:1").unwrap().owner_id,
        buyer()
    );
    assert_eq!(
        contract.scarces_by_id.get("airdrop:2").unwrap().owner_id,
        owner()
    );
}

#[test]
fn airdrop_zero_receivers_fails() {
    let mut contract = setup_with_collection("airdrop");

    let err = contract
        .execute(make_request(Action::AirdropFromCollection {
            collection_id: "airdrop".to_string(),
            receivers: vec![],
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn airdrop_exceeds_supply_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());

    let mut cfg = minimal_config("tiny");
    cfg.total_supply = 1;
    contract
        .execute(make_request(Action::CreateCollection { params: cfg }))
        .unwrap();

    let err = contract
        .execute(make_request(Action::AirdropFromCollection {
            collection_id: "tiny".to_string(),
            receivers: vec![buyer(), owner()],
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn airdrop_non_creator_fails() {
    let mut contract = setup_with_collection("airdrop");
    testing_env!(context(buyer()).build());

    let err = contract
        .execute(make_request(Action::AirdropFromCollection {
            collection_id: "airdrop".to_string(),
            receivers: vec![owner()],
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// ─── SetAllowlist ───────────────────────────────────────────────────────────

#[test]
fn set_allowlist_happy() {
    let mut contract = setup_with_collection("al");

    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::SetAllowlist {
            collection_id: "al".to_string(),
            entries: vec![AllowlistEntry {
                account_id: buyer(),
                allocation: 3,
            }],
        }))
        .unwrap();

    let key = format!("al:al:{}", buyer());
    assert_eq!(*contract.collection_allowlist.get(&key).unwrap(), 3);
}

#[test]
fn set_allowlist_empty_entries_fails() {
    let mut contract = setup_with_collection("al");

    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::SetAllowlist {
            collection_id: "al".to_string(),
            entries: vec![],
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn set_allowlist_non_creator_fails() {
    let mut contract = setup_with_collection("al");
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::SetAllowlist {
            collection_id: "al".to_string(),
            entries: vec![AllowlistEntry {
                account_id: buyer(),
                allocation: 1,
            }],
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn set_allowlist_zero_allocation_removes() {
    let mut contract = setup_with_collection("al");

    // Add via execute
    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::SetAllowlist {
            collection_id: "al".to_string(),
            entries: vec![AllowlistEntry {
                account_id: buyer(),
                allocation: 3,
            }],
        }))
        .unwrap();

    // Remove via zero allocation
    contract
        .execute(make_request(Action::SetAllowlist {
            collection_id: "al".to_string(),
            entries: vec![AllowlistEntry {
                account_id: buyer(),
                allocation: 0,
            }],
        }))
        .unwrap();

    let key = format!("al:al:{}", buyer());
    assert!(contract.collection_allowlist.get(&key).is_none());
}

// ─── RemoveFromAllowlist ────────────────────────────────────────────────────

#[test]
fn remove_from_allowlist_happy() {
    let mut contract = setup_with_collection("al2");

    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::SetAllowlist {
            collection_id: "al2".to_string(),
            entries: vec![AllowlistEntry {
                account_id: buyer(),
                allocation: 5,
            }],
        }))
        .unwrap();

    contract
        .execute(make_request(Action::RemoveFromAllowlist {
            collection_id: "al2".to_string(),
            accounts: vec![buyer()],
        }))
        .unwrap();

    let key = format!("al2:al:{}", buyer());
    assert!(contract.collection_allowlist.get(&key).is_none());
}

#[test]
fn remove_from_allowlist_empty_accounts_fails() {
    let mut contract = setup_with_collection("al2");

    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::RemoveFromAllowlist {
            collection_id: "al2".to_string(),
            accounts: vec![],
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn remove_from_allowlist_non_creator_fails() {
    let mut contract = setup_with_collection("al2");
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::RemoveFromAllowlist {
            collection_id: "al2".to_string(),
            accounts: vec![owner()],
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// ─── SetCollectionMetadata ──────────────────────────────────────────────────

#[test]
fn set_collection_metadata_happy() {
    let mut contract = setup_with_collection("meta");

    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::SetCollectionMetadata {
            collection_id: "meta".to_string(),
            metadata: Some(r#"{"name":"My Collection"}"#.to_string()),
        }))
        .unwrap();

    let col = contract.collections.get("meta").unwrap();
    assert_eq!(col.metadata.as_deref(), Some(r#"{"name":"My Collection"}"#));
}

#[test]
fn set_collection_metadata_clear() {
    let mut contract = setup_with_collection("meta");

    // Set then clear
    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::SetCollectionMetadata {
            collection_id: "meta".to_string(),
            metadata: Some(r#"{"name":"X"}"#.to_string()),
        }))
        .unwrap();
    contract
        .execute(make_request(Action::SetCollectionMetadata {
            collection_id: "meta".to_string(),
            metadata: Some("".to_string()),
        }))
        .unwrap();

    let col = contract.collections.get("meta").unwrap();
    assert!(col.metadata.is_none());
}

#[test]
fn set_collection_metadata_none_is_noop() {
    let mut contract = setup_with_collection("meta");

    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::SetCollectionMetadata {
            collection_id: "meta".to_string(),
            metadata: Some(r#"{"name":"X"}"#.to_string()),
        }))
        .unwrap();
    // None = no-op (metadata unchanged)
    contract
        .execute(make_request(Action::SetCollectionMetadata {
            collection_id: "meta".to_string(),
            metadata: None,
        }))
        .unwrap();

    let col = contract.collections.get("meta").unwrap();
    assert_eq!(col.metadata.as_deref(), Some(r#"{"name":"X"}"#));
}

#[test]
fn set_collection_metadata_non_creator_fails() {
    let mut contract = setup_with_collection("meta");
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::SetCollectionMetadata {
            collection_id: "meta".to_string(),
            metadata: Some(r#"{"name":"X"}"#.to_string()),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// ─── SetCollectionAppMetadata ───────────────────────────────────────────────

#[test]
fn set_collection_app_metadata_happy() {
    let mut contract = setup_with_app_collection("appcol");
    testing_env!(context_with_deposit(owner(), 1).build());

    contract
        .execute(make_request(Action::SetCollectionAppMetadata {
            app_id: app_id(),
            collection_id: "appcol".to_string(),
            metadata: Some(r#"{"featured":true}"#.to_string()),
        }))
        .unwrap();

    let col = contract.collections.get("appcol").unwrap();
    assert_eq!(col.app_metadata.as_deref(), Some(r#"{"featured":true}"#));
}

#[test]
fn set_collection_app_metadata_wrong_app_fails() {
    let mut contract = setup_with_collection("noappcol");
    testing_env!(context_with_deposit(owner(), 1).build());

    // Register a different app
    contract
        .execute(make_request(Action::RegisterApp {
            app_id: "other.near".parse().unwrap(),
            params: AppConfig::default(),
        }))
        .unwrap();

    let err = contract
        .execute(make_request(Action::SetCollectionAppMetadata {
            app_id: "other.near".parse().unwrap(),
            collection_id: "noappcol".to_string(),
            metadata: Some(r#"{"x":1}"#.to_string()),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn set_collection_app_metadata_non_authority_fails() {
    let mut contract = setup_with_app_collection("appcol2");
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::SetCollectionAppMetadata {
            app_id: app_id(),
            collection_id: "appcol2".to_string(),
            metadata: Some(r#"{"x":1}"#.to_string()),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}
