use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;

// --- transfer_ownership ---

#[test]
fn transfer_ownership_happy() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract.transfer_ownership(buyer()).unwrap();
    assert_eq!(contract.owner_id, buyer());
}

#[test]
fn transfer_ownership_same_owner_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let err = contract.transfer_ownership(owner()).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn transfer_ownership_no_deposit_fails() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let err = contract.transfer_ownership(buyer()).unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

#[test]
fn transfer_ownership_non_owner_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract.transfer_ownership(creator()).unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- set_fee_recipient ---

#[test]
fn set_fee_recipient_happy() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract.set_fee_recipient(buyer()).unwrap();
    assert_eq!(contract.fee_recipient, buyer());
}

#[test]
fn set_fee_recipient_non_owner_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract.set_fee_recipient(creator()).unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- add / remove intents_executor ---

#[test]
fn add_intents_executor_happy() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let executor: AccountId = "exec.near".parse().unwrap();
    contract.add_intents_executor(executor.clone()).unwrap();
    assert!(contract.intents_executors.contains(&executor));
}

#[test]
fn add_intents_executor_duplicate_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let executor: AccountId = "exec.near".parse().unwrap();
    contract.add_intents_executor(executor.clone()).unwrap();

    let err = contract.add_intents_executor(executor).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn add_intents_executor_cap_enforced() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    // Fill to capacity
    for i in 0..MAX_INTENTS_EXECUTORS {
        let exec: AccountId = format!("exec{}.near", i).parse().unwrap();
        contract.add_intents_executor(exec).unwrap();
    }

    let overflow: AccountId = "overflow.near".parse().unwrap();
    let err = contract.add_intents_executor(overflow).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn remove_intents_executor_happy() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let executor: AccountId = "exec.near".parse().unwrap();
    contract.add_intents_executor(executor.clone()).unwrap();

    contract.remove_intents_executor(executor.clone()).unwrap();
    assert!(!contract.intents_executors.contains(&executor));
}

#[test]
fn remove_intents_executor_not_found_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let err = contract
        .remove_intents_executor("ghost.near".parse().unwrap())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// --- set_contract_metadata ---

#[test]
fn set_contract_metadata_partial_update() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract
        .set_contract_metadata(
            Some("My Marketplace".into()),
            None,     // keep symbol
            None,     // keep icon
            None,     // keep base_uri
            None,     // keep reference
            None,     // keep reference_hash
        )
        .unwrap();

    assert_eq!(contract.contract_metadata.name, "My Marketplace");
}

#[test]
fn set_contract_metadata_icon_to_none() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    // Set icon
    contract
        .set_contract_metadata(None, None, Some(Some("icon_data".into())), None, None, None)
        .unwrap();
    assert_eq!(contract.contract_metadata.icon, Some("icon_data".to_string()));

    // Clear icon
    contract
        .set_contract_metadata(None, None, Some(None), None, None, None)
        .unwrap();
    assert_eq!(contract.contract_metadata.icon, None);
}

#[test]
fn set_contract_metadata_non_owner_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .set_contract_metadata(Some("Hacked".into()), None, None, None, None, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- approved_nft_contracts ---

#[test]
fn add_approved_nft_contract_happy() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let nft: AccountId = "nft.near".parse().unwrap();
    contract.add_approved_nft_contract(nft.clone()).unwrap();
    assert!(contract.approved_nft_contracts.contains(&nft));
}

#[test]
fn remove_approved_nft_contract_happy() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let nft: AccountId = "nft.near".parse().unwrap();
    contract.add_approved_nft_contract(nft.clone()).unwrap();
    contract.remove_approved_nft_contract(nft.clone()).unwrap();
    assert!(!contract.approved_nft_contracts.contains(&nft));
}

#[test]
fn approved_nft_contract_non_owner_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .add_approved_nft_contract("nft.near".parse().unwrap())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// --- internal_update_fee_config (admin path) ---

#[test]
fn admin_update_fee_config_zero_values() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    contract
        .internal_update_fee_config(Some(0), Some(0), Some(0))
        .unwrap();
    assert_eq!(contract.fee_config.total_fee_bps, 0);
    assert_eq!(contract.fee_config.app_pool_fee_bps, 0);
    assert_eq!(contract.fee_config.platform_storage_fee_bps, 0);
}
