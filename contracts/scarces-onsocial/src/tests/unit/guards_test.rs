use crate::guards::*;
use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;

// --- check_one_yocto ---

#[test]
fn check_one_yocto_exact() {
    let ctx = context_with_deposit(owner(), 1);
    testing_env!(ctx.build());
    assert!(check_one_yocto().is_ok());
}

#[test]
fn check_one_yocto_zero_fails() {
    let ctx = context_with_deposit(owner(), 0);
    testing_env!(ctx.build());
    let err = check_one_yocto().unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

#[test]
fn check_one_yocto_too_much_fails() {
    let ctx = context_with_deposit(owner(), 2);
    testing_env!(ctx.build());
    let err = check_one_yocto().unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

// --- check_at_least_one_yocto ---

#[test]
fn check_at_least_one_yocto_exact() {
    let ctx = context_with_deposit(owner(), 1);
    testing_env!(ctx.build());
    assert!(check_at_least_one_yocto().is_ok());
}

#[test]
fn check_at_least_one_yocto_more() {
    let ctx = context_with_deposit(owner(), 1_000_000);
    testing_env!(ctx.build());
    assert!(check_at_least_one_yocto().is_ok());
}

#[test]
fn check_at_least_one_yocto_zero_fails() {
    let ctx = context_with_deposit(owner(), 0);
    testing_env!(ctx.build());
    let err = check_at_least_one_yocto().unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

// --- collection_id_from_token_id ---

#[test]
fn collection_id_from_token_with_colon() {
    assert_eq!(collection_id_from_token_id("my-col:42"), "my-col");
}

#[test]
fn collection_id_from_standalone_token() {
    assert_eq!(collection_id_from_token_id("standalone-token"), "");
}

#[test]
fn collection_id_from_multiple_colons() {
    assert_eq!(collection_id_from_token_id("a:b:c"), "a");
}

// --- check_token_in_collection ---

#[test]
fn token_in_collection_ok() {
    assert!(check_token_in_collection("col1:5", "col1").is_ok());
}

#[test]
fn token_not_in_collection() {
    let err = check_token_in_collection("col2:5", "col1").unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- check_contract_owner ---

#[test]
fn check_owner_ok() {
    let contract = new_contract();
    assert!(contract.check_contract_owner(&owner()).is_ok());
}

#[test]
fn check_owner_wrong_account() {
    let contract = new_contract();
    let err = contract.check_contract_owner(&buyer()).unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}
