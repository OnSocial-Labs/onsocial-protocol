use crate::state::StorageKey;
#[cfg(test)]
use crate::{
    errors::AuthError,
    state::AuthContractState,
    state_versions::StateV010,
    types::{KeyInfo, RotateKeyArgs},
    AuthContract,
};
use near_sdk::borsh;
use near_sdk::store::{IterableSet, LookupMap, Vector};
use near_sdk::test_utils::{accounts, get_logs, VMContextBuilder};
use near_sdk::{env, testing_env, AccountId, PublicKey};

fn setup_context(predecessor: &AccountId) -> VMContextBuilder {
    let mut context = VMContextBuilder::new();
    context
        .predecessor_account_id(predecessor.clone())
        .current_account_id("auth.testnet".parse().unwrap())
        .block_timestamp(1_000_000_000_000);
    context
}

fn setup_contract() -> AuthContractState {
    let context = setup_context(&accounts(0));
    testing_env!(context.build());
    AuthContractState::new()
}

#[test]
fn test_register_and_get_keys() {
    let mut state = setup_contract();
    let account_id = accounts(0);
    let pk1: PublicKey = "ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU"
        .parse()
        .unwrap();
    let pk2: PublicKey = "ed25519:4jS5V2kAWg7fW7V5F8mD8Z5Y3mJ5gG5kAW7fW7V5F8mD"
        .parse()
        .unwrap();

    state
        .register_key(&account_id, &account_id, pk1.clone(), None, false, None)
        .unwrap();
    state
        .register_key(&account_id, &account_id, pk2.clone(), None, false, None)
        .unwrap();

    let keys = state.get_keys(&account_id, 1, 0);
    assert_eq!(keys.len(), 1, "Should return 1 key");

    let keys = state.get_keys(&account_id, 2, 1);
    assert_eq!(keys.len(), 1, "Should return 1 key");

    let keys = state.get_keys(&account_id, 10, 0);
    assert_eq!(keys.len(), 2, "Should return all 2 keys");

    let key_info = state.get_key_info(&account_id, &pk1).unwrap();
    assert_eq!(key_info.public_key, pk1, "Key info should match");
}

#[test]
fn test_rotate_key() {
    let mut state = setup_contract();
    let account_id = accounts(0);
    let old_pk: PublicKey = "ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU"
        .parse()
        .unwrap();
    let new_pk: PublicKey = "ed25519:4jS5V2kAWg7fW7V5F8mD8Z5Y3mJ5gG5kAW7fW7V5F8mD"
        .parse()
        .unwrap();

    state
        .register_key(
            &account_id,
            &account_id,
            old_pk.clone(),
            Some(30),
            true,
            Some(2),
        )
        .unwrap();

    state
        .rotate_key(
            &account_id,
            RotateKeyArgs {
                account_id: account_id.clone(),
                old_public_key: old_pk.clone(),
                new_public_key: new_pk.clone(),
                expiration_days: Some(60),
                is_multi_sig: false,
                multi_sig_threshold: None,
            },
        )
        .unwrap();

    assert!(
        state.get_key_info(&account_id, &old_pk).is_none(),
        "Old key should be removed"
    );
    let new_key_info = state.get_key_info(&account_id, &new_pk).unwrap();
    assert_eq!(new_key_info.public_key, new_pk, "New key should match");
    assert!(
        new_key_info.expiration_timestamp.is_some(),
        "Expiration should be set"
    );
    assert!(!new_key_info.is_multi_sig, "Multi-sig should be false");
    assert_eq!(
        new_key_info.multi_sig_threshold, None,
        "Threshold should be None"
    );
}

#[test]
fn test_rotate_key_unauthorized() {
    let mut state = setup_contract();
    let account_id = accounts(0);
    let caller = accounts(1);
    let old_pk: PublicKey = "ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU"
        .parse()
        .unwrap();
    let new_pk: PublicKey = "ed25519:4jS5V2kAWg7fW7V5F8mD8Z5Y3mJ5gG5kAW7fW7V5F8mD"
        .parse()
        .unwrap();

    state
        .register_key(&account_id, &account_id, old_pk.clone(), None, false, None)
        .unwrap();

    let result = state.rotate_key(
        &caller,
        RotateKeyArgs {
            account_id: account_id.clone(),
            old_public_key: old_pk,
            new_public_key: new_pk,
            expiration_days: None,
            is_multi_sig: false,
            multi_sig_threshold: None,
        },
    );
    assert_eq!(result, Err(AuthError::Unauthorized));
}

#[test]
fn test_rotate_key_not_found() {
    let mut state = setup_contract();
    let account_id = accounts(0);
    let old_pk: PublicKey = "ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU"
        .parse()
        .unwrap();
    let new_pk: PublicKey = "ed25519:4jS5V2kAWg7fW7V5F8mD8Z5Y3mJ5gG5kAW7fW7V5F8mD"
        .parse()
        .unwrap();

    let result = state.rotate_key(
        &account_id,
        RotateKeyArgs {
            account_id: account_id.clone(),
            old_public_key: old_pk,
            new_public_key: new_pk,
            expiration_days: None,
            is_multi_sig: false,
            multi_sig_threshold: None,
        },
    );
    assert_eq!(result, Err(AuthError::KeyNotFound));
}

#[test]
fn test_update_contract_no_input() {
    let mut state = setup_contract();
    let manager = accounts(0);
    let context = setup_context(&manager);
    testing_env!(context.build());
    let result = state.update_contract();
    match result {
        Err(AuthError::MissingInput) => (), // Expected error
        Err(_e) => panic!("Expected MissingInput error, got different error"),
        Ok(_) => panic!("Expected MissingInput error, got Ok"),
    }
}

#[test]
fn test_update_contract_unauthorized() {
    let mut state = setup_contract();
    let non_manager = accounts(1);
    let context = setup_context(&non_manager);
    let mut vm_context = context.build();
    vm_context.input = vec![1, 2, 3];
    testing_env!(vm_context);
    let result = state.update_contract();
    match result {
        Err(AuthError::Unauthorized) => (), // Expected error
        Err(_e) => panic!("Expected Unauthorized error, got different error"),
        Ok(_) => panic!("Expected Unauthorized error, got Ok"),
    }
}

#[test]
fn test_update_contract_authorized() {
    let mut state = setup_contract();
    let manager = accounts(0);
    let context = setup_context(&manager);
    let mut vm_context = context.build();
    vm_context.input = vec![1, 2, 3];
    testing_env!(vm_context);
    let result = state.update_contract();
    assert!(result.is_ok(), "Expected successful contract update");
}

#[test]
fn test_set_manager_authorized() {
    let mut state = setup_contract();
    let manager = accounts(0);
    let new_manager = accounts(1);
    let context = setup_context(&manager);
    testing_env!(context.build());
    let result = state.set_manager(&manager, new_manager.clone());
    assert!(result.is_ok());
    assert_eq!(state.manager, new_manager);
}

#[test]
fn test_set_manager_unauthorized() {
    let mut state = setup_contract();
    let non_manager = accounts(1);
    let new_manager = accounts(2);
    let context = setup_context(&non_manager);
    testing_env!(context.build());
    let result = state.set_manager(&non_manager, new_manager);
    assert_eq!(result, Err(AuthError::Unauthorized));
}

#[test]
fn test_migration_from_010() {
    let manager = accounts(0);
    let account_id = accounts(1);
    let pk: PublicKey = "ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU"
        .parse()
        .unwrap();
    let context = setup_context(&manager);
    testing_env!(context.build());

    let mut state_v010 = StateV010 {
        version: "0.1.0".to_string(),
        keys: LookupMap::new(b"k".to_vec()),
        last_active_timestamps: LookupMap::new(b"t".to_vec()),
        registered_accounts: Vector::new(b"a".to_vec()),
        manager: manager.clone(),
    };
    let mut key_set = IterableSet::new(b"s".to_vec());
    key_set.insert(KeyInfo {
        public_key: pk.clone(),
        expiration_timestamp: None,
        is_multi_sig: false,
        multi_sig_threshold: None,
    });
    key_set.flush();
    state_v010.keys.insert(account_id.clone(), key_set);
    state_v010.keys.flush();
    state_v010.registered_accounts.push(account_id.clone());
    state_v010.registered_accounts.flush();
    state_v010
        .last_active_timestamps
        .insert(account_id.clone(), 0);
    let state_bytes = borsh::to_vec(&state_v010).expect("Failed to serialize state");
    env::state_write(&state_bytes);

    let new_contract = AuthContract::migrate();

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
        new_contract.state.registered_accounts.len(),
        1,
        "Accounts should be preserved"
    );
    assert_eq!(
        new_contract.state.max_keys_per_account, 100,
        "Max keys should be initialized"
    );
    let keys = new_contract.state.get_keys(&account_id, 10, 0);
    assert_eq!(keys.len(), 1, "Should have one key");
    assert_eq!(keys[0].public_key, pk, "Key should match");

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
    let manager = accounts(0);
    let context = setup_context(&manager);
    testing_env!(context.build());

    let new_contract = AuthContract::migrate();

    assert_eq!(
        new_contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match Cargo.toml"
    );
    assert_eq!(
        new_contract.state.manager, manager,
        "Manager should be current account"
    );
    assert_eq!(
        new_contract.state.registered_accounts.len(),
        0,
        "No accounts should exist"
    );
    assert_eq!(
        new_contract.state.max_keys_per_account, 100,
        "Max keys should be initialized"
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
    let manager = accounts(0);
    let context = setup_context(&manager);
    testing_env!(context.build());

    env::state_write(&vec![0u8; 10]);

    let new_contract = AuthContract::migrate();

    assert_eq!(
        new_contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match Cargo.toml"
    );
    assert_eq!(
        new_contract.state.manager, manager,
        "Manager should be current account"
    );
    assert_eq!(
        new_contract.state.registered_accounts.len(),
        0,
        "No accounts should exist"
    );
    assert_eq!(
        new_contract.state.max_keys_per_account, 100,
        "Max keys should be initialized"
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
    let manager = accounts(0);
    let account_id = accounts(1);
    let pk: PublicKey = "ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU"
        .parse()
        .unwrap();
    let context = setup_context(&manager);
    testing_env!(context.build());

    let mut state = AuthContractState {
        version: env!("CARGO_PKG_VERSION").to_string(),
        keys: LookupMap::new(StorageKey::Keys),
        last_active_timestamps: LookupMap::new(StorageKey::LastActive),
        registered_accounts: Vector::new(StorageKey::Accounts),
        manager: manager.clone(),
        max_keys_per_account: 50,
    };
    let mut key_set = IterableSet::new(StorageKey::KeySet {
        account_id: account_id.clone(),
    });
    key_set.insert(KeyInfo {
        public_key: pk.clone(),
        expiration_timestamp: None,
        is_multi_sig: false,
        multi_sig_threshold: None,
    });
    key_set.flush(); // Added to ensure IterableSet is persisted
    state.keys.insert(account_id.clone(), key_set);
    state.keys.flush();
    state.registered_accounts.push(account_id.clone());
    state.last_active_timestamps.insert(account_id.clone(), 0);
    let state_bytes = borsh::to_vec(&state).expect("Failed to serialize state");
    env::state_write(&state_bytes);

    let new_contract = AuthContract::migrate();

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
        new_contract.state.registered_accounts.len(),
        1,
        "Accounts should be preserved"
    );
    assert_eq!(
        new_contract.state.max_keys_per_account, 50,
        "Max keys should be preserved"
    );
    let keys = new_contract.state.get_keys(&account_id, 10, 0);
    assert_eq!(keys.len(), 1, "Should have one key");
    assert_eq!(keys[0].public_key, pk, "Key should match");

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
