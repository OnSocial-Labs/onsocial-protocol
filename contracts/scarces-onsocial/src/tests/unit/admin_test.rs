use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;

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

#[test]
fn set_fee_recipient_secondary_happy() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract.set_fee_recipient_secondary(Some(buyer())).unwrap();
    assert_eq!(contract.fee_recipient_secondary, Some(buyer()));

    contract.set_fee_recipient_secondary(None).unwrap();
    assert_eq!(contract.fee_recipient_secondary, None);
}

#[test]
fn set_fee_recipient_secondary_same_as_primary_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let err = contract
        .set_fee_recipient_secondary(Some(owner()))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn set_fee_recipient_secondary_non_owner_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .set_fee_recipient_secondary(Some(creator()))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn set_contract_metadata_partial_update() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract
        .set_contract_metadata(Some("My Marketplace".into()), None, None, None, None, None)
        .unwrap();

    assert_eq!(contract.contract_metadata.name, "My Marketplace");
}

#[test]
fn set_contract_metadata_icon_to_none() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract
        .set_contract_metadata(None, None, Some(Some("icon_data".into())), None, None, None)
        .unwrap();
    assert_eq!(
        contract.contract_metadata.icon,
        Some("icon_data".to_string())
    );

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

#[test]
fn admin_update_fee_config_below_minimum_fails() {
    let contract = new_contract();
    testing_env!(context(owner()).build());

    let err = contract
        .fee_config
        .validate_patch(&FeeConfigUpdate {
            total_fee_bps: Some(0),
            app_pool_fee_bps: Some(0),
            platform_storage_fee_bps: Some(0),
        })
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn get_contract_info_returns_all_fields() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let nft: AccountId = "nft.near".parse().unwrap();
    contract.add_approved_nft_contract(nft.clone()).unwrap();

    let info = contract.get_contract_info();
    assert_eq!(info.owner, owner());
    assert_eq!(info.fee_recipient, owner());
    assert!(info.fee_recipient_secondary.is_none());
    assert!(info.approved_nft_contracts.contains(&nft));
    assert!(info.wnear_account_id.is_none());
    assert!(!info.version.is_empty());
    assert_eq!(
        info.platform_storage_balance.0,
        5_000_000_000_000_000_000_000_000
    );
}

#[test]
fn get_contract_info_empty_defaults() {
    let contract = new_contract();
    testing_env!(context(owner()).build());

    let info = contract.get_contract_info();
    assert!(info.approved_nft_contracts.is_empty());
    assert!(info.wnear_account_id.is_none());
    assert!(info.fee_recipient_secondary.is_none());
}

#[test]
fn migrate_defaults_missing_fee_recipient_secondary() {
    use near_sdk::borsh::BorshDeserialize;

    let contract = new_contract();
    let mut bytes = near_sdk::borsh::to_vec(&contract).unwrap();
    // Drop trailing Option::None tag for fee_recipient_secondary (pre-upgrade layout).
    assert_eq!(
        bytes.last().copied(),
        Some(0),
        "fresh contract serializes secondary as None"
    );
    bytes.truncate(bytes.len() - 1);

    let loaded = Contract::try_from_slice(&bytes).unwrap();
    assert!(loaded.fee_recipient_secondary.is_none());
    assert_eq!(loaded.fee_recipient, owner());
    assert_eq!(loaded.owner_id, owner());

    near_sdk::env::state_write(&loaded);
    let migrated = Contract::migrate();
    assert!(migrated.fee_recipient_secondary.is_none());
}

#[test]
fn fee_recipient_secondary_borsh_roundtrip_some() {
    use near_sdk::borsh::BorshDeserialize;

    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract.set_fee_recipient_secondary(Some(buyer())).unwrap();

    let bytes = near_sdk::borsh::to_vec(&contract).unwrap();
    let loaded = Contract::try_from_slice(&bytes).unwrap();
    assert_eq!(loaded.fee_recipient_secondary, Some(buyer()));
}
