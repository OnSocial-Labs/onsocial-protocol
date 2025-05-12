use super::*;
#[cfg(test)]
use near_sdk::{
    test_utils::{get_logs, VMContextBuilder},
    testing_env, AccountId,
};

fn setup_context(predecessor: AccountId) -> VMContextBuilder {
    let mut context = VMContextBuilder::new();
    context
        .predecessor_account_id(predecessor)
        .current_account_id("staking.testnet".parse::<AccountId>().unwrap())
        .block_timestamp(1_000_000_000_000);
    context
}

#[test]
fn test_new() {
    let manager: AccountId = "manager.testnet".parse().unwrap();
    let context = setup_context(manager.clone());
    testing_env!(context.build());

    let contract = StakingOnsocial::new(manager.clone());

    assert_eq!(
        contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match package version"
    );
    assert_eq!(
        contract.state.manager, manager,
        "Manager should be set correctly"
    );
}

#[test]
fn test_migration_from_010() {
    let manager: AccountId = "manager.testnet".parse().unwrap();
    let context = setup_context(manager.clone());
    testing_env!(context.build());

    // Simulate state version 0.1.0
    let old_state = super::state_versions::StateV010 {
        version: "0.1.0".to_string(),
        manager: manager.clone(),
    };
    let state_bytes = borsh::to_vec(&old_state).expect("Failed to serialize state");
    env::state_write(&state_bytes);

    let contract = StakingOnsocial::migrate();

    assert_eq!(
        contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match package version"
    );
    assert_eq!(
        contract.state.manager, manager,
        "Manager should be preserved"
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
        "Expected StateMigrated event, got: {:?}", logs
    );
}

#[test]
fn test_migration_no_prior_state() {
    let manager: AccountId = "manager.testnet".parse().unwrap();
    let context = setup_context(manager.clone());
    testing_env!(context.build());

    let contract = StakingOnsocial::migrate();

    assert_eq!(
        contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match package version"
    );
    assert_eq!(
        contract.state.manager,
        env::current_account_id(),
        "Manager should be current account"
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
