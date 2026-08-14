use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::test_utils::get_logs;

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
        max_per_purchase: None,
        random_assignment: false,
    }
}

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
fn create_collection_emits_catalog_shell_fields() {
    let mut contract = new_contract();
    let mut config = minimal_config("shell-drop");
    config.metadata_template =
        r#"{"title":"Shell","description":"Desc","media":"ipfs://cover","extra":"{\"kind\":\"audio\"}"}"#
            .to_string();
    config.price_near = U128(1_000_000_000_000_000_000_000_000);
    config.start_time = Some(1_000);
    config.end_time = Some(2_000);

    contract.create_collection(&creator(), config).unwrap();

    let logs = get_logs();
    let create_log = logs
        .iter()
        .find(|l| l.contains("COLLECTION_UPDATE") && l.contains("\"create\""))
        .expect("create event");
    assert!(create_log.contains("\"title\":\"Shell\""));
    assert!(create_log.contains("\"media\":\"ipfs://cover\""));
    assert!(create_log.contains("\"kind\":\"audio\""));
    assert!(create_log.contains("\"minted_count\":0"));
    assert!(create_log.contains("\"remaining\":10"));
    assert!(create_log.contains("\"mint_mode\":\"open\""));
    assert!(create_log.contains("\"metadata_template\""));
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

#[test]
fn create_collection_end_before_start_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("time");
    cfg.start_time = Some(2000);
    cfg.end_time = Some(1000);
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_dutch_without_times_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("dutch");
    cfg.price_near = U128(100);
    cfg.start_price = Some(U128(1000));
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_dutch_start_price_le_floor_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("dutch2");
    cfg.price_near = U128(1000);
    cfg.start_price = Some(U128(500));
    cfg.start_time = Some(1000);
    cfg.end_time = Some(2000);
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn create_collection_zero_max_per_wallet_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("mpw");
    cfg.max_per_wallet = Some(0);
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

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

#[test]
fn create_collection_unknown_app_fails() {
    let mut contract = new_contract();
    let mut cfg = minimal_config("no-app");
    cfg.options.app_id = Some("missing-app".to_string());
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn create_collection_invite_only_blocks_outsider() {
    let mut contract = new_contract();
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

    let mut cfg = minimal_config("gated-col");
    cfg.options.app_id = Some("gated".to_string());
    let err = contract.create_collection(&creator(), cfg).unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));

    // Owner can still create.
    contract
        .create_collection(&owner(), {
            let mut cfg = minimal_config("owner-col");
            cfg.options.app_id = Some("gated".to_string());
            cfg
        })
        .unwrap();
    assert_eq!(
        contract
            .collections
            .get("owner-col")
            .unwrap()
            .app_commission_bps,
        100
    );
}

#[test]
fn create_collection_snapshots_commission_bps() {
    let mut contract = new_contract();
    contract.app_pools.insert(
        "snap".to_string(),
        AppPool {
            owner_id: owner(),
            balance: U128(10u128.pow(24)),
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: None,
            primary_sale_bps: 400,
            moderators: vec![],
            curated: false,
            metadata: None,
            creator_access: CreatorAccess::Open,
            approved_creators: vec![],
        },
    );

    let mut cfg = minimal_config("snap-col");
    cfg.options.app_id = Some("snap".to_string());
    contract.create_collection(&creator(), cfg).unwrap();

    // Owner raises live pool bps after create — snapshot must stay 400.
    let mut pool = contract.app_pools.get("snap").unwrap().clone();
    pool.primary_sale_bps = 900;
    contract.app_pools.insert("snap".to_string(), pool);

    let col = contract.collections.get("snap-col").unwrap();
    assert_eq!(col.app_commission_bps, 400);
    assert_eq!(
        contract.calculate_app_commission(10_000, Some("snap"), Some(col.app_commission_bps)),
        400
    );
    assert_eq!(
        contract.calculate_app_commission(10_000, Some("snap"), None),
        900,
        "live pool fallback uses updated bps"
    );
}

#[test]
fn lazy_collection_borsh_append_defaults_commission_sentinel() {
    use near_sdk::borsh::{BorshDeserialize, BorshSerialize};

    let col = LazyCollection {
        creator_id: creator(),
        collection_id: "legacy".into(),
        total_supply: 5,
        minted_count: 0,
        metadata_template: "{}".into(),
        price_near: U128(0),
        start_price: None,
        start_time: None,
        end_time: None,
        created_at: 1,
        app_id: Some("myapp".into()),
        royalty: None,
        renewable: false,
        revocation_mode: collections::RevocationMode::None,
        max_redeems: None,
        redeemed_count: 0,
        fully_redeemed_count: 0,
        burnable: true,
        mint_mode: collections::MintMode::Open,
        max_per_wallet: None,
        transferable: true,
        paused: false,
        cancelled: false,
        refund_pool: U128(0),
        refund_per_token: U128(0),
        refunded_count: 0,
        refund_deadline: None,
        total_revenue: U128(0),
        allowlist_price: None,
        banned: false,
        metadata: None,
        app_metadata: None,
        max_per_purchase: 10,
        app_commission_bps: 500,
        random_assignment: false,
        redeemers: vec![],
    };

    let mut bytes = near_sdk::borsh::to_vec(&col).unwrap();
    // Drop trailing redeemers (empty vec = 4) + random_assignment (1) + app_commission_bps (2).
    bytes.truncate(bytes.len() - 7);
    // IterableMap appends key_index after the value — include it so trailing
    // helpers leave those 4 bytes alone.
    0u32.serialize(&mut bytes).unwrap();

    #[derive(BorshSerialize, BorshDeserialize)]
    #[borsh(crate = "near_sdk::borsh")]
    struct ValueAndIndex {
        value: LazyCollection,
        key_index: u32,
    }
    let loaded = ValueAndIndex::try_from_slice(&bytes).unwrap().value;
    assert_eq!(loaded.app_commission_bps, u16::MAX);
    assert_eq!(loaded.collection_id, "legacy");
    assert_eq!(loaded.max_per_purchase, 10);
    assert!(!loaded.random_assignment);
    assert!(loaded.redeemers.is_empty());
}

/// IterableMap stores `{ value: LazyCollection, key_index: u32 }`. Pre-redeemers
/// layouts must leave those 4 index bytes alone or `get_collection` traps.
#[test]
fn lazy_collection_pre_redeemers_survives_iterable_map_key_index() {
    use near_sdk::borsh::{BorshDeserialize, BorshSerialize};

    let col = LazyCollection {
        creator_id: creator(),
        collection_id: "legacy".into(),
        total_supply: 5,
        minted_count: 0,
        metadata_template: "{}".into(),
        price_near: U128(0),
        start_price: None,
        start_time: None,
        end_time: None,
        created_at: 1,
        app_id: None,
        royalty: None,
        renewable: false,
        revocation_mode: collections::RevocationMode::None,
        max_redeems: None,
        redeemed_count: 0,
        fully_redeemed_count: 0,
        burnable: true,
        mint_mode: collections::MintMode::Open,
        max_per_wallet: None,
        transferable: true,
        paused: false,
        cancelled: false,
        refund_pool: U128(0),
        refund_per_token: U128(0),
        refunded_count: 0,
        refund_deadline: None,
        total_revenue: U128(0),
        allowlist_price: None,
        banned: false,
        metadata: None,
        app_metadata: None,
        max_per_purchase: 10,
        app_commission_bps: 500,
        random_assignment: false,
        redeemers: vec![],
    };
    // Pre-redeemers value blob: collection without redeemers + key_index.
    let mut value_bytes = near_sdk::borsh::to_vec(&col).unwrap();
    value_bytes.truncate(value_bytes.len() - 4); // drop empty redeemers
    let key_index = 0u32;
    key_index.serialize(&mut value_bytes).unwrap();

    #[derive(BorshSerialize, BorshDeserialize)]
    #[borsh(crate = "near_sdk::borsh")]
    struct ValueAndIndex {
        value: LazyCollection,
        key_index: u32,
    }
    let wrapped = ValueAndIndex::try_from_slice(&value_bytes).unwrap();
    assert!(wrapped.value.redeemers.is_empty());
    assert_eq!(wrapped.key_index, 0);
    assert_eq!(wrapped.value.max_per_purchase, 10);
    assert_eq!(wrapped.value.app_commission_bps, 500);
}
