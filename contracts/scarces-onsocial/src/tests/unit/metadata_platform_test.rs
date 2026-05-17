use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::test_utils::get_logs;
use near_sdk::testing_env;

fn setup_contract() -> Contract {
    new_contract()
}

#[test]
fn nft_metadata_returns_contract_metadata() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());

    let meta = contract.nft_metadata();
    assert_eq!(meta.spec, "nft-1.0.0");
    assert!(!meta.name.is_empty());
}

#[test]
fn scarces_transfer_emits_standard_nep171_event_first() {
    testing_env!(context(owner()).build());

    crate::events::emit_scarce_transfer(&owner(), &owner(), &buyer(), "s:1", None);

    let logs = get_logs();
    let first = parse_event_json(&logs[0]);
    assert_eq!(first["standard"], "nep171");
    assert_eq!(first["version"], "1.2.0");
    assert_eq!(first["event"], "nft_transfer");

    let second = parse_event_json(&logs[1]);
    assert_eq!(second["standard"], "onsocial");
    assert_eq!(second["event"], "SCARCE_UPDATE");
}

#[test]
fn scarces_metadata_update_events_use_nep171_current_version() {
    testing_env!(context(owner()).build());

    crate::events::nep171::emit_contract_metadata_update();
    crate::events::nep171::emit_metadata_update(&["s:1"]);

    let logs = get_logs();
    let contract_update = parse_event_json(&logs[0]);
    assert_eq!(contract_update["version"], "1.2.0");
    assert_eq!(contract_update["event"], "contract_metadata_update");

    let token_update = parse_event_json(&logs[1]);
    assert_eq!(token_update["version"], "1.2.0");
    assert_eq!(token_update["event"], "nft_metadata_update");
}

#[test]
fn contract_metadata_wrapper_emits_standard_nep171_event_first() {
    testing_env!(context(owner()).build());

    crate::events::emit_contract_metadata_updated(
        &owner(),
        "OnSocial Scarces",
        "SCARCE",
        None,
        None,
        None,
    );

    let logs = get_logs();
    let first = parse_event_json(&logs[0]);
    assert_eq!(first["standard"], "nep171");
    assert_eq!(first["event"], "contract_metadata_update");

    let second = parse_event_json(&logs[1]);
    assert_eq!(second["standard"], "onsocial");
    assert_eq!(second["event"], "CONTRACT_UPDATE");
    assert_eq!(second["data"][0]["operation"], "contract_metadata_updated");
}

#[test]
fn token_metadata_wrappers_emit_standard_nep171_event_first() {
    testing_env!(context(owner()).build());

    crate::events::emit_token_renewed(&owner(), "s:1", "c:1", &owner(), 1_800_000_000);

    let logs = get_logs();
    let first = parse_event_json(&logs[0]);
    assert_eq!(first["standard"], "nep171");
    assert_eq!(first["event"], "nft_metadata_update");

    let second = parse_event_json(&logs[1]);
    assert_eq!(second["standard"], "onsocial");
    assert_eq!(second["event"], "SCARCE_UPDATE");
    assert_eq!(second["data"][0]["operation"], "renew");
}

fn parse_event_json(log: &str) -> Value {
    let json = log
        .strip_prefix("EVENT_JSON:")
        .expect("event log must use EVENT_JSON prefix");
    near_sdk::serde_json::from_str(json).expect("event log must be valid JSON")
}

#[test]
fn nft_metadata_after_update() {
    let mut contract = setup_contract();

    testing_env!(context_with_deposit(owner(), 1).build());
    contract.set_fee_recipient(buyer()).unwrap();

    contract
        .set_contract_metadata(
            Some("Updated Marketplace".into()),
            Some("UPD".into()),
            None,
            None,
            None,
            None,
        )
        .unwrap();

    let meta = contract.nft_metadata();
    assert_eq!(meta.name, "Updated Marketplace");
    assert_eq!(meta.symbol, "UPD");
}

#[test]
fn contract_info_fee_config_returns_defaults() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());

    let info = contract.get_contract_info();
    let _ = info.fee_config.total_fee_bps;
}

#[test]
fn contract_info_fee_recipient_default() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_contract_info().fee_recipient, owner());
}

#[test]
fn contract_info_fee_recipient_after_change() {
    let mut contract = setup_contract();

    testing_env!(context_with_deposit(owner(), 1).build());
    contract.set_fee_recipient(buyer()).unwrap();

    assert_eq!(contract.get_contract_info().fee_recipient, buyer());
}

#[test]
fn get_platform_storage_balance_returns_value() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(
        contract.get_platform_storage_balance().0,
        5_000_000_000_000_000_000_000_000
    );
}

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
    assert!(matches!(
        result,
        Err(MarketplaceError::InsufficientDeposit(_))
    ));
}

#[test]
fn withdraw_platform_storage_below_reserve_fails() {
    let mut contract = setup_contract();
    contract.platform_storage_balance = 15_000_000_000_000_000_000_000_000;
    testing_env!(context_with_deposit(owner(), 1).build());

    let result =
        contract.withdraw_platform_storage(&owner(), U128(11_000_000_000_000_000_000_000_000));
    assert!(matches!(result, Err(MarketplaceError::InvalidInput(_))));
}

#[test]
fn withdraw_platform_storage_at_reserve_boundary_fails() {
    let mut contract = setup_contract();
    contract.platform_storage_balance = 5_000_000_000_000_000_000_000_000;
    testing_env!(context_with_deposit(owner(), 1).build());

    let result = contract.withdraw_platform_storage(&owner(), U128(1));
    assert!(matches!(result, Err(MarketplaceError::InvalidInput(_))));
}

#[test]
fn withdraw_platform_storage_happy() {
    let mut contract = setup_contract();
    contract.platform_storage_balance = 30_000_000_000_000_000_000_000_000;

    testing_env!(context_with_deposit(owner(), 1).build());
    let result =
        contract.withdraw_platform_storage(&owner(), U128(10_000_000_000_000_000_000_000_000));
    assert!(result.is_ok());
    assert_eq!(
        contract.platform_storage_balance,
        20_000_000_000_000_000_000_000_000
    );
}

#[test]
fn fund_platform_storage_happy() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 5_000_000_000_000_000_000_000_000).build());
    let result = contract.fund_platform_storage();
    assert!(result.is_ok());
    assert_eq!(
        contract.platform_storage_balance,
        10_000_000_000_000_000_000_000_000
    );
}

#[test]
fn fund_platform_storage_accumulates() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 2_000_000_000_000_000_000_000_000).build());
    let result = contract.fund_platform_storage();
    assert!(result.is_ok());
    assert_eq!(
        contract.platform_storage_balance,
        7_000_000_000_000_000_000_000_000
    );
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
    assert!(matches!(
        result,
        Err(MarketplaceError::InsufficientDeposit(_))
    ));
}
