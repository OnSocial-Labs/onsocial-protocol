use crate::tests::test_utils::*;
use crate::*;

// --- Waterfall: Tier 2 (platform pool) ---

#[test]
fn tier2_platform_pool_covers_storage() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();
    // Fund platform pool
    contract.platform_storage_balance = byte_cost * 100;

    // No app_id => Tier 2 path
    contract
        .charge_storage_waterfall(&buyer(), 50, None)
        .unwrap();

    assert_eq!(contract.platform_storage_balance, byte_cost * 50);
    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.tier2_used_bytes, 50);
    assert_eq!(user.used_bytes, 0); // Not charged to Tier 3
}

// --- Waterfall: Tier 3 (user balance) ---

#[test]
fn tier3_user_balance_covers_storage() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();

    // Drain platform pool to force Tier 3 fallback
    contract.platform_storage_balance = 0;

    // Seed user balance (enough for 100 bytes)
    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: byte_cost * 100,
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    // No app, empty platform => falls to Tier 3
    contract
        .charge_storage_waterfall(&buyer(), 30, None)
        .unwrap();

    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.used_bytes, 30);
    assert_eq!(user.balance, byte_cost * 100); // Balance unchanged; used_bytes tracks usage
}

// --- Waterfall: Tier 4 (pending_attached_balance) ---

#[test]
fn tier4_pending_balance_covers_shortfall() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();

    // Drain platform pool to force Tier 4 fallback
    contract.platform_storage_balance = 0;

    // No user balance, no platform pool
    contract.pending_attached_balance = byte_cost * 50;

    contract
        .charge_storage_waterfall(&buyer(), 30, None)
        .unwrap();

    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.used_bytes, 30);
    // Pending balance used to top up user balance, then charged from it
    assert_eq!(
        contract.pending_attached_balance,
        byte_cost * 50 - byte_cost * 30
    );
}

// --- Waterfall: insufficient all tiers ---

#[test]
fn all_tiers_empty_fails() {
    let mut contract = new_contract();
    // Drain platform pool — no user balance, no pending balance
    contract.platform_storage_balance = 0;
    let err = contract
        .charge_storage_waterfall(&buyer(), 10, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientStorage(_)));
}

// --- Waterfall: Tier 1 (app pool) ---

#[test]
fn tier1_app_pool_covers_storage() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();
    let app: AccountId = "myapp.near".parse().unwrap();

    // Register app pool with enough balance
    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: creator(),
            balance: U128(byte_cost * 200),
            used_bytes: 0,
            max_user_bytes: 1000,
            moderators: vec![],
            curated: false,
            default_royalty: None,
            primary_sale_bps: 0,
            metadata: None,
        },
    );

    contract
        .charge_storage_waterfall(&buyer(), 40, Some(&app))
        .unwrap();

    let pool = contract.app_pools.get(&app).unwrap();
    assert_eq!(pool.balance.0, byte_cost * 160);
    assert_eq!(pool.used_bytes, 40);

    // Check per-user usage
    let usage_key = format!("{}:{}", buyer(), app);
    assert_eq!(contract.app_user_usage.get(&usage_key).copied().unwrap(), 40);
}

// --- Tier 1: per-user cap enforced ---

#[test]
fn tier1_per_user_cap_falls_to_tier3() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();
    let app: AccountId = "myapp.near".parse().unwrap();

    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: creator(),
            balance: U128(byte_cost * 1000),
            used_bytes: 0,
            max_user_bytes: 10, // Only 10 bytes per user
            moderators: vec![],
            curated: false,
            default_royalty: None,
            primary_sale_bps: 0,
            metadata: None,
        },
    );

    // User needs 20 bytes but cap is 10 => partial from pool, rest from user
    contract.pending_attached_balance = byte_cost * 20; // Tier 4 fallback

    contract
        .charge_storage_waterfall(&buyer(), 20, Some(&app))
        .unwrap();

    let pool = contract.app_pools.get(&app).unwrap();
    assert_eq!(pool.used_bytes, 10); // Only 10 covered by pool
    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.used_bytes, 10); // Remaining 10 from user (Tier 3→4)
}

// --- Release storage: reverse Tier 2 ---

#[test]
fn release_tier2_credits_platform_pool() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();

    contract.platform_storage_balance = 0;
    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: 0,
            used_bytes: 0,
            tier2_used_bytes: 50,
            spending_cap: None,
        },
    );

    contract.release_storage_waterfall(&buyer(), 30, None);

    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.tier2_used_bytes, 20);
    assert_eq!(contract.platform_storage_balance, byte_cost * 30);
}

// --- Release storage: reverse Tier 1 ---

#[test]
fn release_tier1_credits_app_pool() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();
    let app: AccountId = "myapp.near".parse().unwrap();

    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: creator(),
            balance: U128(byte_cost * 100),
            used_bytes: 40,
            max_user_bytes: 1000,
            moderators: vec![],
            curated: false,
            default_royalty: None,
            primary_sale_bps: 0,
            metadata: None,
        },
    );
    let usage_key = format!("{}:{}", buyer(), app);
    contract.app_user_usage.insert(usage_key.clone(), 40);

    contract.release_storage_waterfall(&buyer(), 20, Some(&app));

    let pool = contract.app_pools.get(&app).unwrap();
    assert_eq!(pool.used_bytes, 20);
    assert_eq!(pool.balance.0, byte_cost * 120);
    assert_eq!(contract.app_user_usage.get(&usage_key).copied().unwrap(), 20);
}

// --- Zero bytes is a no-op ---

#[test]
fn zero_bytes_charge_is_noop() {
    let mut contract = new_contract();
    contract
        .charge_storage_waterfall(&buyer(), 0, None)
        .unwrap();
    assert!(contract.user_storage.get(&buyer()).is_none());
}

#[test]
fn zero_bytes_release_is_noop() {
    let mut contract = new_contract();
    contract.release_storage_waterfall(&buyer(), 0, None);
    // No panic, no state change
}
