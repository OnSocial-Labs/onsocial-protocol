use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    new_contract()
}

// ===== nft_metadata =====

#[test]
fn nft_metadata_returns_contract_metadata() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());

    let meta = contract.nft_metadata();
    assert_eq!(meta.spec, "nft-2.0.0");
    // Name and symbol come from Contract::new defaults
    assert!(!meta.name.is_empty());
}

#[test]
fn nft_metadata_after_update() {
    let mut contract = setup_contract();

    // Update fee recipient via standalone admin method
    testing_env!(context_with_deposit(owner(), 1).build());
    contract.set_fee_recipient(buyer()).unwrap();

    // Update contract metadata via admin
    contract.set_contract_metadata(
        Some("Updated Marketplace".into()),
        Some("UPD".into()),
        None, // icon
        None, // base_uri
        None, // reference
        None, // reference_hash
    ).unwrap();

    let meta = contract.nft_metadata();
    assert_eq!(meta.name, "Updated Marketplace");
    assert_eq!(meta.symbol, "UPD");
}

// ===== get_fee_config / get_fee_recipient =====

#[test]
fn get_fee_config_returns_defaults() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());

    let config = contract.get_fee_config();
    // Smoke-test: calling get_fee_config must not panic
    let _ = config.total_fee_bps;
}

#[test]
fn get_fee_recipient_default() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_fee_recipient(), owner());
}

#[test]
fn get_fee_recipient_after_change() {
    let mut contract = setup_contract();

    testing_env!(context_with_deposit(owner(), 1).build());
    contract.set_fee_recipient(buyer()).unwrap();

    assert_eq!(contract.get_fee_recipient(), buyer());
}

// ===== get_platform_storage_balance =====

#[test]
fn get_platform_storage_balance_returns_value() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    // Init seeds 5 NEAR
    assert_eq!(
        contract.get_platform_storage_balance().0,
        5_000_000_000_000_000_000_000_000
    );
}

// ===== withdraw_platform_storage =====

#[test]
fn withdraw_platform_storage_non_owner_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let result = contract.withdraw_platform_storage(&buyer(), U128(1_000));
    assert!(matches!(result, Err(MarketplaceError::Unauthorized(_))));
}

#[test]
fn withdraw_platform_storage_exceeds_balance_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let result = contract.withdraw_platform_storage(&owner(), U128(u128::MAX));
    assert!(matches!(result, Err(MarketplaceError::InsufficientDeposit(_))));
}

#[test]
fn withdraw_platform_storage_below_reserve_fails() {
    let mut contract = setup_contract();
    // Platform balance = 15 NEAR, reserve = 5 NEAR, max withdrawable = 10 NEAR
    // Requesting 11 NEAR should fail
    contract.platform_storage_balance = 15_000_000_000_000_000_000_000_000;
    testing_env!(context_with_deposit(owner(), 1).build());

    let result = contract.withdraw_platform_storage(&owner(), U128(11_000_000_000_000_000_000_000_000));
    assert!(matches!(result, Err(MarketplaceError::InvalidInput(_))));
}

#[test]
fn withdraw_platform_storage_at_reserve_boundary_fails() {
    let mut contract = setup_contract();
    // Platform balance = 5 NEAR (exactly the reserve), any withdrawal fails
    contract.platform_storage_balance = 5_000_000_000_000_000_000_000_000;
    testing_env!(context_with_deposit(owner(), 1).build());

    let result = contract.withdraw_platform_storage(&owner(), U128(1));
    assert!(matches!(result, Err(MarketplaceError::InvalidInput(_))));
}

#[test]
fn withdraw_platform_storage_happy() {
    let mut contract = setup_contract();
    // Set balance well above reserve so we can withdraw
    contract.platform_storage_balance = 30_000_000_000_000_000_000_000_000; // 30 NEAR

    testing_env!(context_with_deposit(owner(), 1).build());
    let result = contract.withdraw_platform_storage(&owner(), U128(10_000_000_000_000_000_000_000_000));
    assert!(result.is_ok());
    assert_eq!(
        contract.platform_storage_balance,
        20_000_000_000_000_000_000_000_000
    );
}

// ===== fund_platform_storage =====

#[test]
fn fund_platform_storage_happy() {
    let mut contract = new_contract();
    // Init seeds 5 NEAR; fund another 5 NEAR
    testing_env!(context_with_deposit(owner(), 5_000_000_000_000_000_000_000_000).build());
    let result = contract.fund_platform_storage();
    assert!(result.is_ok());
    assert_eq!(contract.platform_storage_balance, 10_000_000_000_000_000_000_000_000);
}

#[test]
fn fund_platform_storage_accumulates() {
    let mut contract = new_contract();
    // Init seeds 5 NEAR; fund another 2 NEAR
    testing_env!(context_with_deposit(owner(), 2_000_000_000_000_000_000_000_000).build());
    let result = contract.fund_platform_storage();
    assert!(result.is_ok());
    assert_eq!(contract.platform_storage_balance, 7_000_000_000_000_000_000_000_000);
}

#[test]
fn fund_platform_storage_non_owner_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());

    let result = contract.fund_platform_storage();
    assert!(matches!(result, Err(MarketplaceError::Unauthorized(_))));
}

#[test]
fn fund_platform_storage_zero_deposit_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 0).build());

    let result = contract.fund_platform_storage();
    assert!(matches!(result, Err(MarketplaceError::InsufficientDeposit(_))));
}
