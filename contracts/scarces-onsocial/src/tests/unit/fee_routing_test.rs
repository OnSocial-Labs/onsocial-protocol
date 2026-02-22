use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;

// --- calculate_fee_split ---

#[test]
fn fee_split_no_app_id() {
    let contract = new_contract();
    // Default config: total=200bps, app_pool=50bps, platform_storage=50bps
    let price: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR
    let (total, app, platform, revenue) = contract.calculate_fee_split(price, None);

    // total = 1 NEAR * 200 / 10000 = 0.02 NEAR
    assert_eq!(total, price * 200 / 10_000);
    assert_eq!(app, 0, "no app → no app split");
    // platform = 1 NEAR * 50 / 10000
    assert_eq!(platform, price * 50 / 10_000);
    // revenue = total - platform
    assert_eq!(revenue, total - platform);
}

#[test]
fn fee_split_with_app_pool() {
    let mut contract = new_contract();
    let app: AccountId = "app.near".parse().unwrap();
    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: owner(),
            balance: 0,
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: None,
            primary_sale_bps: 0,
            moderators: vec![],
            curated: false,
            metadata: None,
        },
    );

    let price: u128 = 10_000_000_000_000_000_000_000_000; // 10 NEAR
    let (total, app_amt, platform, revenue) =
        contract.calculate_fee_split(price, Some(&app));

    assert_eq!(total, price * 200 / 10_000);
    assert_eq!(app_amt, price * 50 / 10_000);
    assert_eq!(platform, 0, "app present → no platform split");
    assert_eq!(revenue, total - app_amt);
}

#[test]
fn fee_split_missing_app_pool_falls_to_platform() {
    let contract = new_contract();
    let app: AccountId = "app.near".parse().unwrap();
    // app_pool not registered
    let (total, app_amt, platform, revenue) =
        contract.calculate_fee_split(1_000_000, Some(&app));

    assert_eq!(app_amt, 0, "pool not found → no app share");
    assert!(platform > 0, "falls back to platform");
    assert_eq!(total, revenue + platform);
}

#[test]
fn fee_split_zero_price() {
    let contract = new_contract();
    let (total, app, platform, revenue) = contract.calculate_fee_split(0, None);
    assert_eq!((total, app, platform, revenue), (0, 0, 0, 0));
}

// --- route_fee ---

#[test]
fn route_fee_no_app_funds_platform() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let before = contract.platform_storage_balance;
    let price: u128 = 1_000_000_000_000_000_000_000_000;
    let (revenue, app_amt) = contract.route_fee(price, None);

    assert!(revenue > 0);
    assert_eq!(app_amt, 0);
    // platform_storage_balance increased by platform_storage split
    let expected_platform = price * 50 / 10_000;
    assert_eq!(contract.platform_storage_balance, before + expected_platform);
}

#[test]
fn route_fee_with_app_funds_pool() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let app: AccountId = "app.near".parse().unwrap();
    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: owner(),
            balance: 0,
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: None,
            primary_sale_bps: 0,
            moderators: vec![],
            curated: false,
            metadata: None,
        },
    );

    let price: u128 = 2_000_000_000_000_000_000_000_000; // 2 NEAR
    let (_revenue, app_amt) = contract.route_fee(price, Some(&app));

    assert!(app_amt > 0);
    let pool = contract.app_pools.get(&app).unwrap();
    assert_eq!(pool.balance, app_amt, "pool credited with app share");
}

#[test]
fn route_fee_missing_pool_falls_to_platform() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let app: AccountId = "ghost.near".parse().unwrap();
    let before = contract.platform_storage_balance;

    let (_revenue, app_amt) = contract.route_fee(1_000_000, Some(&app));
    assert_eq!(app_amt, 0, "pool missing → 0 returned for app_amt");
    // platform should have gotten the platform_storage split
    assert!(contract.platform_storage_balance > before);
}

// --- FeeConfig validate_patch / apply_patch ---

#[test]
fn update_fee_config_happy() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let patch = FeeConfigUpdate {
        total_fee_bps: Some(300),
        app_pool_fee_bps: Some(80),
        platform_storage_fee_bps: Some(80),
    };
    contract.fee_config.validate_patch(&patch).unwrap();
    contract.fee_config.apply_patch(&patch);
    assert_eq!(contract.fee_config.total_fee_bps, 300);
    assert_eq!(contract.fee_config.app_pool_fee_bps, 80);
    assert_eq!(contract.fee_config.platform_storage_fee_bps, 80);
}

#[test]
fn update_fee_config_total_above_max_fails() {
    let contract = new_contract();
    testing_env!(context(owner()).build());

    let err = contract.fee_config.validate_patch(&FeeConfigUpdate {
        total_fee_bps: Some(301),
        ..Default::default()
    }).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn update_fee_config_app_exceeds_total_fails() {
    let contract = new_contract();
    testing_env!(context(owner()).build());

    let err = contract.fee_config.validate_patch(&FeeConfigUpdate {
        total_fee_bps: Some(200),
        app_pool_fee_bps: Some(100),
        platform_storage_fee_bps: Some(101),
    }).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn update_fee_config_platform_exceeds_total_fails() {
    let contract = new_contract();
    testing_env!(context(owner()).build());

    let err = contract.fee_config.validate_patch(&FeeConfigUpdate {
        total_fee_bps: Some(150),
        app_pool_fee_bps: Some(100),
        platform_storage_fee_bps: Some(51),
    }).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn update_fee_config_sum_exceeds_total_fails() {
    let contract = new_contract();
    testing_env!(context(owner()).build());

    let err = contract.fee_config.validate_patch(&FeeConfigUpdate {
        total_fee_bps: Some(150),
        app_pool_fee_bps: Some(80),
        platform_storage_fee_bps: Some(80),
    }).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn update_fee_config_partial_update() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let patch = FeeConfigUpdate {
        total_fee_bps: Some(300),
        ..Default::default()
    };
    contract.fee_config.validate_patch(&patch).unwrap();
    contract.fee_config.apply_patch(&patch);
    assert_eq!(contract.fee_config.total_fee_bps, 300);
    assert_eq!(contract.fee_config.app_pool_fee_bps, DEFAULT_APP_POOL_FEE_BPS);
    assert_eq!(contract.fee_config.platform_storage_fee_bps, DEFAULT_PLATFORM_STORAGE_FEE_BPS);
}

#[test]
fn update_fee_config_boundary_max_bps() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let patch = FeeConfigUpdate {
        total_fee_bps: Some(300),
        app_pool_fee_bps: Some(100),
        platform_storage_fee_bps: Some(100),
    };
    contract.fee_config.validate_patch(&patch).unwrap();
    contract.fee_config.apply_patch(&patch);
    assert_eq!(contract.fee_config.total_fee_bps, 300);
}

#[test]
fn update_fee_config_pool_above_max_fails() {
    let contract = new_contract();
    testing_env!(context(owner()).build());

    let err = contract.fee_config.validate_patch(&FeeConfigUpdate {
        total_fee_bps: Some(300),
        app_pool_fee_bps: Some(101),
        ..Default::default()
    }).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn update_fee_config_total_below_min_fails() {
    let contract = new_contract();
    testing_env!(context(owner()).build());

    let err = contract.fee_config.validate_patch(&FeeConfigUpdate {
        total_fee_bps: Some(99),
        ..Default::default()
    }).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- calculate_app_commission ---

#[test]
fn app_commission_no_app() {
    let contract = new_contract();
    assert_eq!(contract.calculate_app_commission(1_000_000, None), 0);
}

#[test]
fn app_commission_pool_zero_bps() {
    let mut contract = new_contract();
    let app: AccountId = "app.near".parse().unwrap();
    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: owner(),
            balance: 0,
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: None,
            primary_sale_bps: 0,
            moderators: vec![],
            curated: false,
            metadata: None,
        },
    );
    assert_eq!(contract.calculate_app_commission(1_000_000, Some(&app)), 0);
}

#[test]
fn app_commission_computed() {
    let mut contract = new_contract();
    let app: AccountId = "app.near".parse().unwrap();
    contract.app_pools.insert(
        app.clone(),
        AppPool {
            owner_id: owner(),
            balance: 0,
            used_bytes: 0,
            max_user_bytes: 50_000,
            default_royalty: None,
            primary_sale_bps: 500, // 5%
            moderators: vec![],
            curated: false,
            metadata: None,
        },
    );

    let price: u128 = 10_000;
    let commission = contract.calculate_app_commission(price, Some(&app));
    assert_eq!(commission, price * 500 / 10_000); // 500 yN
}
