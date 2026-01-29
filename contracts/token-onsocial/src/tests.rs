//! Unit tests for the configurable token contract.

use super::*;
use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::metadata::FungibleTokenMetadataProvider;
use near_sdk::test_utils::{VMContextBuilder, accounts};
use near_sdk::testing_env;

/// Default total supply: 1 billion tokens with 18 decimals
const TEST_TOTAL_SUPPLY: u128 = 1_000_000_000_000_000_000_000_000_000;

const TEST_ICON: &str =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==";

fn get_context(predecessor: AccountId) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.predecessor_account_id(predecessor);
    builder
}

fn setup_contract() -> Contract {
    let owner = accounts(0); // alice.near
    let context = get_context(owner.clone());
    testing_env!(context.build());
    Contract::new(
        owner,
        "OnSocial".to_string(),
        "SOCIAL".to_string(),
        U128(TEST_TOTAL_SUPPLY),
        TEST_ICON.to_string(),
    )
}

// --- Initialization Tests ---

#[test]
fn test_total_supply_default() {
    assert_eq!(TEST_TOTAL_SUPPLY, 1_000_000_000 * 10u128.pow(18));
}

#[test]
fn test_new_initializes_correctly() {
    let contract = setup_contract();
    let owner = accounts(0);

    assert_eq!(contract.ft_total_supply().0, TEST_TOTAL_SUPPLY);
    assert_eq!(contract.ft_balance_of(owner.clone()).0, TEST_TOTAL_SUPPLY);
    assert_eq!(contract.get_owner(), owner);

    let metadata = contract.ft_metadata();
    assert_eq!(metadata.name, "OnSocial");
    assert_eq!(metadata.symbol, "SOCIAL");
    assert_eq!(metadata.decimals, 18);
}

#[test]
fn test_custom_token_parameters() {
    let owner = accounts(0);
    let context = get_context(owner.clone());
    testing_env!(context.build());

    let custom_supply: u128 = 500_000_000 * 10u128.pow(18);
    let contract = Contract::new(
        owner.clone(),
        "MyToken".to_string(),
        "MTK".to_string(),
        U128(custom_supply),
        "data:image/svg+xml;base64,test".to_string(),
    );

    assert_eq!(contract.ft_total_supply().0, custom_supply);
    assert_eq!(contract.ft_balance_of(owner).0, custom_supply);

    let metadata = contract.ft_metadata();
    assert_eq!(metadata.name, "MyToken");
    assert_eq!(metadata.symbol, "MTK");
    assert_eq!(metadata.decimals, 18);
    assert!(metadata.icon.is_some());
}

#[test]
#[should_panic(expected = "Token name cannot be empty")]
fn test_new_empty_name_fails() {
    let owner = accounts(0);
    let context = get_context(owner.clone());
    testing_env!(context.build());

    Contract::new(
        owner,
        "".to_string(),
        "SOCIAL".to_string(),
        U128(TEST_TOTAL_SUPPLY),
        TEST_ICON.to_string(),
    );
}

#[test]
#[should_panic(expected = "Token symbol cannot be empty")]
fn test_new_empty_symbol_fails() {
    let owner = accounts(0);
    let context = get_context(owner.clone());
    testing_env!(context.build());

    Contract::new(
        owner,
        "OnSocial".to_string(),
        "".to_string(),
        U128(TEST_TOTAL_SUPPLY),
        TEST_ICON.to_string(),
    );
}

#[test]
#[should_panic(expected = "Total supply must be greater than 0")]
fn test_new_zero_supply_fails() {
    let owner = accounts(0);
    let context = get_context(owner.clone());
    testing_env!(context.build());

    Contract::new(
        owner,
        "OnSocial".to_string(),
        "SOCIAL".to_string(),
        U128(0),
        TEST_ICON.to_string(),
    );
}

#[test]
fn test_version() {
    let contract = setup_contract();
    assert_eq!(contract.version(), "1.0.0");
}

// --- Owner Functions Tests ---

#[test]
fn test_set_icon() {
    let mut contract = setup_contract();
    let owner = accounts(0);
    let context = get_context(owner);
    testing_env!(context.build());

    let new_icon = "data:image/svg+xml;base64,ABC123".to_string();
    contract.set_icon(new_icon.clone());

    assert_eq!(contract.ft_metadata().icon, Some(new_icon));
}

#[test]
#[should_panic(expected = "Only owner can call this method")]
fn test_set_icon_non_owner_fails() {
    let mut contract = setup_contract();
    let non_owner = accounts(1);
    let context = get_context(non_owner);
    testing_env!(context.build());

    contract.set_icon("icon".to_string());
}

#[test]
fn test_set_reference() {
    let mut contract = setup_contract();
    let owner = accounts(0);
    let context = get_context(owner);
    testing_env!(context.build());

    let reference = Some("https://onsocial.io/token.json".to_string());
    contract.set_reference(reference.clone(), None);

    assert_eq!(contract.ft_metadata().reference, reference);
}

#[test]
fn test_set_owner() {
    let mut contract = setup_contract();
    let owner = accounts(0);
    let new_owner = accounts(1);
    let context = get_context(owner);
    testing_env!(context.build());

    contract.set_owner(new_owner.clone());
    assert_eq!(contract.get_owner(), new_owner);
}

#[test]
#[should_panic(expected = "Only owner can call this method")]
fn test_set_owner_non_owner_fails() {
    let mut contract = setup_contract();
    let non_owner = accounts(1);
    let context = get_context(non_owner);
    testing_env!(context.build());

    contract.set_owner(accounts(2));
}

#[test]
fn test_renounce_owner() {
    let mut contract = setup_contract();
    let owner = accounts(0);
    let context = get_context(owner);
    testing_env!(context.build());

    contract.renounce_owner();
    assert_eq!(contract.get_owner().as_str(), "system");
}

#[test]
#[should_panic(expected = "Only owner can call this method")]
fn test_renounce_owner_then_set_icon_fails() {
    let mut contract = setup_contract();
    let owner = accounts(0);
    let context = get_context(owner);
    testing_env!(context.build());

    contract.renounce_owner();

    contract.set_icon("icon".to_string());
}

// --- Burn Tests ---

#[test]
fn test_burn() {
    let mut contract = setup_contract();
    let owner = accounts(0);
    let mut context = get_context(owner.clone());
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());

    let initial_supply = contract.ft_total_supply().0;
    let burn_amount = 1_000_000 * 10u128.pow(18);

    contract.burn(U128(burn_amount));

    assert_eq!(
        contract.ft_balance_of(owner).0,
        initial_supply - burn_amount
    );
    assert_eq!(contract.ft_total_supply().0, initial_supply - burn_amount);
}

#[test]
#[should_panic(expected = "Requires attached deposit of at least 1 yoctoNEAR")]
fn test_burn_requires_deposit() {
    let mut contract = setup_contract();
    let owner = accounts(0);
    let context = get_context(owner);
    testing_env!(context.build());

    contract.burn(U128(1000));
}

#[test]
#[should_panic]
fn test_burn_more_than_balance_fails() {
    let mut contract = setup_contract();
    let owner = accounts(0);
    let mut context = get_context(owner);
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());

    contract.burn(U128(TEST_TOTAL_SUPPLY + 1));
}

// --- Metadata Tests ---

#[test]
fn test_metadata_spec() {
    let contract = setup_contract();
    let metadata = contract.ft_metadata();

    assert_eq!(metadata.spec, FT_METADATA_SPEC);
    assert_eq!(metadata.name, "OnSocial");
    assert_eq!(metadata.symbol, "SOCIAL");
    assert_eq!(metadata.decimals, 18);
    assert!(metadata.icon.is_some());
    assert!(metadata.reference.is_none());
    assert!(metadata.reference_hash.is_none());
}

#[test]
fn test_metadata_with_icon() {
    let owner = accounts(0);
    let context = get_context(owner.clone());
    testing_env!(context.build());

    let icon = "data:image/png;base64,iVBORw0KGgo=".to_string();
    let contract = Contract::new(
        owner,
        "OnSocial".to_string(),
        "SOCIAL".to_string(),
        U128(TEST_TOTAL_SUPPLY),
        icon.clone(),
    );

    assert_eq!(contract.ft_metadata().icon, Some(icon));
}

#[test]
#[should_panic(expected = "Token icon cannot be empty")]
fn test_new_empty_icon_fails() {
    let owner = accounts(0);
    let context = get_context(owner.clone());
    testing_env!(context.build());

    Contract::new(
        owner,
        "OnSocial".to_string(),
        "SOCIAL".to_string(),
        U128(TEST_TOTAL_SUPPLY),
        "".to_string(),
    );
}

#[test]
#[should_panic(expected = "Token icon cannot be empty")]
fn test_set_icon_empty_fails() {
    let mut contract = setup_contract();
    let owner = accounts(0);
    let context = get_context(owner);
    testing_env!(context.build());

    contract.set_icon("".to_string());
}
