use crate::*;
use near_sdk::json_types::U128;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::testing_env;

fn account(id: &str) -> AccountId {
    id.parse().unwrap()
}

fn owner() -> AccountId {
    account("owner.testnet")
}

fn token() -> AccountId {
    account("token.testnet")
}

fn beneficiary() -> AccountId {
    account("beneficiary.testnet")
}

fn context(predecessor: &AccountId, timestamp: u64) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.predecessor_account_id(predecessor.clone());
    builder.current_account_id(account("vesting.testnet"));
    builder.block_timestamp(timestamp);
    builder
}

fn new_contract() -> VestingContract {
    let owner = owner();
    testing_env!(context(&owner, 1).build());
    VestingContract::new(owner, token(), beneficiary(), U128(100), 10, 20, 110)
}

#[test]
#[should_panic(expected = "Invalid vesting schedule")]
fn init_rejects_zero_total_amount() {
    let owner = owner();
    testing_env!(context(&owner, 1).build());
    let _ = VestingContract::new(owner, token(), beneficiary(), U128(0), 10, 20, 110);
}

#[test]
#[should_panic(expected = "Cliff must be >= start")]
fn init_rejects_cliff_before_start() {
    let owner = owner();
    testing_env!(context(&owner, 1).build());
    let _ = VestingContract::new(owner, token(), beneficiary(), U128(100), 20, 10, 110);
}

#[test]
#[should_panic(expected = "End must be > cliff")]
fn init_rejects_end_not_after_cliff() {
    let owner = owner();
    testing_env!(context(&owner, 1).build());
    let _ = VestingContract::new(owner, token(), beneficiary(), U128(100), 10, 20, 20);
}

#[test]
fn emits_funded_event() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    let _ = get_logs();

    contract.ft_on_transfer(owner(), U128(100), String::new());
    let logs = get_logs();

    assert_eq!(logs.len(), 1);
    assert!(logs[0].starts_with("EVENT_JSON:"));
    assert!(logs[0].contains("\"event\":\"VESTING_FUNDED\""));
    assert!(logs[0].contains("\"amount\":\"100\""));
}

#[test]
fn computes_zero_before_cliff() {
    let owner = owner();
    let contract = new_contract();
    testing_env!(context(&owner, 15).build());
    assert_eq!(contract.get_vested_amount().0, 0);
}

#[test]
fn computes_zero_at_cliff() {
    let owner = owner();
    let contract = new_contract();
    testing_env!(context(&owner, 20).build());
    assert_eq!(contract.get_vested_amount().0, 0);
}

#[test]
fn computes_full_amount_after_end() {
    let owner = owner();
    let contract = new_contract();
    testing_env!(context(&owner, 111).build());
    assert_eq!(contract.get_vested_amount().0, 100);
}

// NOTE: ft_on_transfer uses require! / env::panic_str which aborts in
// release mode, so negative cases must be tested in integration tests
// (sandbox), not with #[should_panic]:
// - ft_on_transfer with wrong amount (Funding amount mismatch)
// - ft_on_transfer from wrong token (Wrong token)
// - ft_on_transfer from non-owner sender (Only owner can fund)
// - ft_on_transfer when already funded (Already funded)

#[test]
fn claim_before_funding_fails() {
    let mut contract = new_contract();
    testing_env!(context(&beneficiary(), 65).build());

    let result = contract.claim();

    assert!(matches!(result, Err(VestingError::NotFunded)));
}

#[test]
fn claim_before_cliff_fails() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&beneficiary(), 15).build());
    let result = contract.claim();

    assert!(matches!(result, Err(VestingError::NothingToClaim)));
}

#[test]
fn non_beneficiary_cannot_claim() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&owner(), 65).build());
    let result = contract.claim();

    assert!(matches!(result, Err(VestingError::Unauthorized(_))));
}

#[test]
fn second_claim_while_pending_fails() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&beneficiary(), 65).build());
    let _ = contract.claim().unwrap();
    let result = contract.claim();

    assert!(matches!(result, Err(VestingError::ClaimPending)));
}

#[test]
fn repeated_claims_only_release_delta() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&beneficiary(), 65).build());
    let _ = contract.claim().unwrap();
    testing_env!(context(&account("vesting.testnet"), 65).build());
    contract.on_claim_callback(Ok(()), beneficiary(), U128(50));

    testing_env!(context(&beneficiary(), 92).build());
    let _ = contract.claim().unwrap();

    assert_eq!(contract.claimed_amount, 80);
    assert!(contract.pending_claims.contains_key(&beneficiary()));
}

#[test]
fn computes_partial_amount_after_cliff() {
    let owner = owner();
    let contract = new_contract();
    testing_env!(context(&owner, 65).build());
    assert_eq!(contract.get_vested_amount().0, 50);
}

#[test]
fn get_config_returns_expected_values() {
    let contract = new_contract();
    let config = contract.get_config();

    assert_eq!(config.owner_id, owner());
    assert_eq!(config.token_id, token());
    assert_eq!(config.beneficiary_id, beneficiary());
    assert_eq!(config.total_amount.0, 100);
    assert_eq!(config.claimed_amount.0, 0);
    assert_eq!(config.start_at_ns, 10);
    assert_eq!(config.cliff_at_ns, 20);
    assert_eq!(config.end_at_ns, 110);
    assert!(!config.funded);
}

#[test]
fn get_status_returns_expected_values_after_funding() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&beneficiary(), 65).build());
    let status = contract.get_status();

    assert_eq!(status.total_amount.0, 100);
    assert_eq!(status.claimed_amount.0, 0);
    assert_eq!(status.vested_amount.0, 50);
    assert_eq!(status.claimable_amount.0, 50);
    assert_eq!(status.unvested_amount.0, 50);
    assert!(status.funded);
    assert_eq!(status.now_ns, 65);
}

#[test]
fn get_status_reflects_claimed_amount_after_successful_claim() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&beneficiary(), 65).build());
    let _ = contract.claim().unwrap();
    testing_env!(context(&account("vesting.testnet"), 65).build());
    contract.on_claim_callback(Ok(()), beneficiary(), U128(50));

    testing_env!(context(&beneficiary(), 65).build());
    let status = contract.get_status();

    assert_eq!(status.claimed_amount.0, 50);
    assert_eq!(status.vested_amount.0, 50);
    assert_eq!(status.claimable_amount.0, 0);
    assert_eq!(status.unvested_amount.0, 50);
}

#[test]
fn emits_created_event() {
    let owner = owner();
    testing_env!(context(&owner, 1).build());
    let _ = get_logs();

    let _ = VestingContract::new(owner, token(), beneficiary(), U128(100), 10, 20, 110);
    let logs = get_logs();

    assert_eq!(logs.len(), 1);
    assert!(logs[0].starts_with("EVENT_JSON:"));
    assert!(logs[0].contains("\"standard\":\"onsocial\""));
    assert!(logs[0].contains("\"event\":\"VESTING_CREATED\""));
}

#[test]
fn owner_can_change_beneficiary() {
    let mut contract = new_contract();
    let new_beneficiary = account("new-beneficiary.testnet");
    testing_env!(context(&owner(), 1).build());

    let result = contract.set_beneficiary(new_beneficiary.clone());

    assert!(result.is_ok());
    assert_eq!(contract.beneficiary_id, new_beneficiary);
}

#[test]
fn non_owner_cannot_change_beneficiary() {
    let mut contract = new_contract();
    let new_beneficiary = account("new-beneficiary.testnet");
    testing_env!(context(&beneficiary(), 1).build());

    let result = contract.set_beneficiary(new_beneficiary);

    assert!(matches!(result, Err(VestingError::Unauthorized(_))));
}

#[test]
fn old_beneficiary_loses_access_after_rotation() {
    let mut contract = new_contract();
    let new_beneficiary = account("new-beneficiary.testnet");
    testing_env!(context(&owner(), 1).build());
    contract.set_beneficiary(new_beneficiary.clone()).unwrap();

    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&beneficiary(), 65).build());
    let old_result = contract.claim();
    assert!(matches!(old_result, Err(VestingError::Unauthorized(_))));

    testing_env!(context(&new_beneficiary, 65).build());
    let new_result = contract.claim();
    assert!(new_result.is_ok());
}

#[test]
fn claim_sets_pending_and_claimed_amount() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&beneficiary(), 65).build());
    let result = contract.claim();

    assert!(result.is_ok());
    assert_eq!(contract.claimed_amount, 50);
    assert!(contract.pending_claims.contains_key(&beneficiary()));
}

#[test]
fn claim_callback_failure_rolls_back_state() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&beneficiary(), 65).build());
    let _ = contract.claim().unwrap();
    assert_eq!(contract.claimed_amount, 50);

    testing_env!(context(&account("vesting.testnet"), 65).build());
    contract.on_claim_callback(Err(near_sdk::PromiseError::Failed), beneficiary(), U128(50));

    assert_eq!(contract.claimed_amount, 0);
    assert!(!contract.pending_claims.contains_key(&beneficiary()));
    assert_eq!(contract.get_claimable_amount().0, 50);
}

#[test]
fn claim_callback_success_clears_pending() {
    let mut contract = new_contract();
    testing_env!(context(&token(), 1).build());
    contract.ft_on_transfer(owner(), U128(100), String::new());

    testing_env!(context(&beneficiary(), 65).build());
    let _ = contract.claim().unwrap();

    testing_env!(context(&account("vesting.testnet"), 65).build());
    contract.on_claim_callback(Ok(()), beneficiary(), U128(50));

    assert_eq!(contract.claimed_amount, 50);
    assert!(!contract.pending_claims.contains_key(&beneficiary()));
    assert_eq!(contract.get_claimable_amount().0, 0);
}
