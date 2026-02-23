use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    new_contract()
}

// --- storage_deposit ---

#[test]
fn storage_deposit_happy() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 1_000_000).build());

    contract.storage_deposit(&buyer(), 1_000_000).unwrap();

    let balance = contract.storage_balance_of(buyer());
    assert_eq!(balance.0, 1_000_000);
}

#[test]
fn storage_deposit_for_another_account() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 500_000).build());

    contract.storage_deposit(&creator(), 500_000).unwrap();

    assert_eq!(contract.storage_balance_of(creator()).0, 500_000);
    assert_eq!(contract.storage_balance_of(buyer()).0, 0);
}

#[test]
fn storage_deposit_accumulates() {
    let mut contract = setup_contract();

    testing_env!(context_with_deposit(buyer(), 1_000).build());
    contract.storage_deposit(&buyer(), 1_000).unwrap();

    testing_env!(context_with_deposit(buyer(), 2_000).build());
    contract.storage_deposit(&buyer(), 2_000).unwrap();

    assert_eq!(contract.storage_balance_of(buyer()).0, 3_000);
}

#[test]
fn storage_deposit_zero_fails() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    let err = contract.storage_deposit(&buyer(), 0).unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

// --- storage_withdraw ---

#[test]
fn storage_withdraw_happy() {
    let mut contract = setup_contract();

    // Deposit first
    testing_env!(context_with_deposit(buyer(), 1_000_000).build());
    contract.storage_deposit(&buyer(), 1_000_000).unwrap();

    // Withdraw (1 yocto required)
    testing_env!(context_with_deposit(buyer(), 1).build());
    contract.storage_withdraw(&buyer()).unwrap();

    // Balance should be 0 after withdrawal (no used_bytes)
    assert_eq!(contract.storage_balance_of(buyer()).0, 0);
}

#[test]
fn storage_withdraw_no_balance_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract.storage_withdraw(&buyer()).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn storage_withdraw_no_balance_returns_error() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());

    // Withdrawing with no storage balance should fail
    let err = contract.storage_withdraw(&buyer()).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn storage_withdraw_no_yocto_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 1_000_000).build());
    contract.storage_deposit(&buyer(), 1_000_000).unwrap();

    // Through execute(), Direct auth without 1 yocto should fail
    testing_env!(context(buyer()).build());
    let err = contract
        .execute(make_request(Action::StorageWithdraw))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

// --- storage_balance_of ---

#[test]
fn storage_balance_of_zero_for_unknown() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(contract.storage_balance_of(buyer()).0, 0);
}
