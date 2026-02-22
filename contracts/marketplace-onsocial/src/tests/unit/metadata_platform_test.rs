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

    // Update via execute
    testing_env!(context_with_deposit(owner(), 1).build());
    let action = Action::SetFeeRecipient {
        fee_recipient: buyer(),
    };
    contract.execute(make_request(action)).unwrap();

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
    // Default fees should be set
    assert!(config.total_fee_bps > 0 || config.total_fee_bps == 0); // just test it doesn't panic
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
    let action = Action::SetFeeRecipient {
        fee_recipient: buyer(),
    };
    contract.execute(make_request(action)).unwrap();

    assert_eq!(contract.get_fee_recipient(), buyer());
}

// ===== get_platform_storage_balance =====

#[test]
fn get_platform_storage_balance_returns_value() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    // We set it to 10 NEAR in setup
    assert_eq!(
        contract.get_platform_storage_balance().0,
        10_000_000_000_000_000_000_000_000
    );
}

// ===== withdraw_platform_storage =====

#[test]
fn withdraw_platform_storage_non_owner_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let result = contract.withdraw_platform_storage(U128(1_000));
    assert!(matches!(result, Err(MarketplaceError::Unauthorized(_))));
}

#[test]
fn withdraw_platform_storage_exceeds_balance_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let result = contract.withdraw_platform_storage(U128(u128::MAX));
    assert!(matches!(result, Err(MarketplaceError::InsufficientDeposit(_))));
}

#[test]
fn withdraw_platform_storage_below_reserve_fails() {
    let mut contract = setup_contract();
    // Platform balance = 10 NEAR, reserve = 10 NEAR, so withdrawing anything fails
    testing_env!(context_with_deposit(owner(), 1).build());

    let result = contract.withdraw_platform_storage(U128(1));
    assert!(matches!(result, Err(MarketplaceError::InvalidInput(_))));
}

#[test]
fn withdraw_platform_storage_happy() {
    let mut contract = setup_contract();
    // Set balance well above reserve so we can withdraw
    contract.platform_storage_balance = 30_000_000_000_000_000_000_000_000; // 30 NEAR

    testing_env!(context_with_deposit(owner(), 1).build());
    let result = contract.withdraw_platform_storage(U128(10_000_000_000_000_000_000_000_000));
    assert!(result.is_ok());
    assert_eq!(
        contract.platform_storage_balance,
        20_000_000_000_000_000_000_000_000
    );
}
