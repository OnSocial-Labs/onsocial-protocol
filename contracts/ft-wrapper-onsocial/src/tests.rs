#[cfg(test)]
use crate::{state_versions::StateV010, FtWrapperContract, FtWrapperContractState};
use near_sdk::borsh;
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    env,
    test_utils::{get_logs, VMContextBuilder},
    testing_env, AccountId, NearToken,
};

fn setup_context(predecessor: AccountId) -> VMContextBuilder {
    let mut context = VMContextBuilder::new();
    context
        .predecessor_account_id(predecessor)
        .current_account_id("ft-wrapper.testnet".parse::<AccountId>().unwrap())
        .block_timestamp(1_000_000_000_000)
        .attached_deposit(NearToken::from_yoctonear(0));
    context
}

#[test]
fn test_add_supported_token() {
    let manager: AccountId = "manager.testnet".parse().unwrap();
    let context = setup_context(manager.clone());
    testing_env!(context.build());

    let mut contract = FtWrapperContract::new(
        manager.clone(),
        "relayer.testnet".parse().unwrap(),
        U128(1_250_000_000_000_000_000_000),
    );
    let token: AccountId = "token.testnet".parse().unwrap();

    contract
        .add_supported_token(token.clone())
        .expect("Failed to add token");
    assert!(
        contract.state.supported_tokens.contains(&token),
        "Token should be supported"
    );

    let logs = get_logs();
    assert!(
        logs.contains(&"EVENT_JSON:{\"standard\":\"nep297\",\"version\":\"1.0.0\",\"event\":\"token_added\",\"data\":{\"token\":\"token.testnet\"}}".to_string()),
        "Expected token_added event, got: {:?}", logs
    );
}

#[test]
fn test_migration_from_010() {
    let manager: AccountId = "manager.testnet".parse().unwrap();
    let context = setup_context(manager.clone());
    testing_env!(context.build());

    let token: AccountId = "token.testnet".parse().unwrap();
    let state_v010 = StateV010 {
        version: "0.1.0".to_string(),
        manager: manager.clone(),
        relayer_contract: "relayer.testnet".parse().unwrap(),
        supported_tokens: vec![token.clone()],
        storage_deposit: U128(1_250_000_000_000_000_000_000),
        cross_contract_gas: 100_000_000_000_000,
        storage_balances: LookupMap::new(b"s".to_vec()),
        min_balance: 10_000_000_000_000_000_000_000_000,
        max_balance: 1_000_000_000_000_000_000_000_000_000,
    };
    let state_bytes = borsh::to_vec(&state_v010).expect("Failed to serialize state");
    env::state_write(&state_bytes);

    let new_contract = FtWrapperContract::migrate();

    assert_eq!(
        new_contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match Cargo.toml"
    );
    assert_eq!(
        new_contract.state.manager, manager,
        "Manager should be preserved"
    );
    assert_eq!(
        new_contract.state.relayer_contract,
        "relayer.testnet".parse::<AccountId>().unwrap(),
        "Relayer contract should be preserved"
    );
    assert!(
        new_contract.state.supported_tokens.contains(&token),
        "Supported tokens should be preserved"
    );
    assert_eq!(
        new_contract.state.fee_percentage, 0,
        "Fee percentage should be initialized"
    );

    let logs = get_logs();
    assert!(
        logs.contains(&"Migrating from state version 0.1.0".to_string()),
        "Expected migration log, got: {:?}",
        logs
    );
    assert!(
        logs.contains(&format!(
            "EVENT_JSON:{{\"standard\":\"nep297\",\"version\":\"1.0.0\",\"event\":\"state_migrated\",\"data\":{{\"old_version\":\"0.1.0\",\"new_version\":\"{}\"}}}}",
            env!("CARGO_PKG_VERSION")
        )),
        "Expected state_migrated event, got: {:?}", logs
    );
}

#[test]
fn test_migration_no_prior_state() {
    let manager: AccountId = "manager.testnet".parse().unwrap();
    let context = setup_context(manager.clone());
    testing_env!(context.build());

    let new_contract = FtWrapperContract::migrate();

    assert_eq!(
        new_contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match Cargo.toml"
    );
    assert_eq!(
        new_contract.state.manager,
        env::current_account_id(),
        "Manager should be current account"
    );
    assert_eq!(
        new_contract.state.relayer_contract,
        "relayer.testnet".parse::<AccountId>().unwrap(),
        "Relayer contract should be initialized"
    );
    assert_eq!(
        new_contract.state.fee_percentage, 0,
        "Fee percentage should be initialized"
    );

    let logs = get_logs();
    assert!(
        logs.contains(
            &"No valid prior state found or unknown version, initializing new state".to_string()
        ),
        "Expected no prior state log, got: {:?}",
        logs
    );
}

#[test]
fn test_migration_corrupted_state() {
    let manager: AccountId = "manager.testnet".parse().unwrap();
    let context = setup_context(manager.clone());
    testing_env!(context.build());

    // Simulate corrupted state
    env::state_write(&vec![0u8; 10]); // Invalid Borsh data

    let new_contract = FtWrapperContract::migrate();

    assert_eq!(
        new_contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match Cargo.toml"
    );
    assert_eq!(
        new_contract.state.manager,
        env::current_account_id(),
        "Manager should be current account"
    );
    assert_eq!(
        new_contract.state.relayer_contract,
        "relayer.testnet".parse::<AccountId>().unwrap(),
        "Relayer contract should be initialized"
    );
    assert_eq!(
        new_contract.state.fee_percentage, 0,
        "Fee percentage should be initialized"
    );

    let logs = get_logs();
    assert!(
        logs.contains(
            &"No valid prior state found or unknown version, initializing new state".to_string()
        ),
        "Expected no prior state log, got: {:?}",
        logs
    );
}

#[test]
fn test_migration_current_version_no_op() {
    let manager: AccountId = "manager.testnet".parse().unwrap();
    let context = setup_context(manager.clone());
    testing_env!(context.build());

    let token: AccountId = "token.testnet".parse().unwrap();
    let state = FtWrapperContractState {
        version: env!("CARGO_PKG_VERSION").to_string(),
        manager: manager.clone(),
        relayer_contract: "relayer.testnet".parse().unwrap(),
        supported_tokens: vec![token.clone()],
        storage_deposit: U128(1_250_000_000_000_000_000_000),
        cross_contract_gas: 100_000_000_000_000,
        storage_balances: LookupMap::new(b"s".to_vec()),
        min_balance: 10_000_000_000_000_000_000_000_000,
        max_balance: 1_000_000_000_000_000_000_000_000_000,
        fee_percentage: 10,
    };
    let state_bytes = borsh::to_vec(&state).expect("Failed to serialize state");
    env::state_write(&state_bytes);

    let new_contract = FtWrapperContract::migrate();

    assert_eq!(
        new_contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match Cargo.toml"
    );
    assert_eq!(
        new_contract.state.manager, manager,
        "Manager should be preserved"
    );
    assert_eq!(
        new_contract.state.relayer_contract,
        "relayer.testnet".parse::<AccountId>().unwrap(),
        "Relayer contract should be preserved"
    );
    assert!(
        new_contract.state.supported_tokens.contains(&token),
        "Supported tokens should be preserved"
    );
    assert_eq!(
        new_contract.state.fee_percentage, 10,
        "Fee percentage should be preserved"
    );

    let logs = get_logs();
    assert!(
        logs.contains(&"State is at current or newer version, no migration needed".to_string()),
        "Expected no-migration log, got: {:?}",
        logs
    );
    assert!(
        !logs.iter().any(|log| log.contains("state_migrated")),
        "Unexpected state_migrated event, got: {:?}",
        logs
    );
}
