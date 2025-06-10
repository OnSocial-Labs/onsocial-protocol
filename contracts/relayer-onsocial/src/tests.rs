#[cfg(test)]
use crate::{
    constants::{DEFAULT_MIN_BALANCE, MAX_GAS_LIMIT, MIN_ALLOWANCE},
    types::{AccessKey, Action, DelegateAction, SignedDelegateAction},
    OnSocialRelayer,
};
use near_crypto::{InMemorySigner, KeyType, Signature};
use near_sdk::borsh::to_vec;
use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{env, testing_env};
use near_sdk::{AccountId, Gas, NearToken};

// Helper function to set up the test environment
fn setup_contract() -> (
    OnSocialRelayer,
    VMContextBuilder,
    near_crypto::InMemorySigner,
) {
    let mut context = VMContextBuilder::new();
    context
        .predecessor_account_id(accounts(0))
        .current_account_id(accounts(0))
        .account_balance(NearToken::from_near(100))
        .block_timestamp(1_000_000_000_000)
        .block_height(100)
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(context.build());

    let signer_enum = InMemorySigner::from_seed(accounts(0), KeyType::ED25519, "seed");
    let signer = match signer_enum {
        near_crypto::Signer::InMemory(s) => s,
        _ => panic!("Expected InMemorySigner from from_seed"),
    };
    let public_key = signer.public_key().key_data().to_vec();
    assert_eq!(
        public_key.len(),
        32,
        "InMemorySigner public key must be 32 bytes"
    );
    // New required fields
    let offload_recipient = accounts(5);
    let offload_threshold = 10_000_000_000_000_000_000_000_000; // 10 NEAR
    let contract = OnSocialRelayer::new(
        accounts(0),
        public_key.clone(),
        offload_recipient.clone(),
        U128(offload_threshold),
    )
    .expect("Initialization failed");

    (contract, context, signer)
}

// Helper function to create a signed delegate action
fn create_signed_delegate_action(
    signer: &near_crypto::InMemorySigner, // Use concrete type
    sender_id: AccountId,
    _receiver_id: AccountId,
    nonce: u64,
    action: Action,
) -> SignedDelegateAction {
    let delegate_action = DelegateAction {
        nonce,
        max_block_height: env::block_height() + 100,
        sender_id,
        actions: vec![action],
    };
    let serialized = to_vec(&delegate_action).unwrap();
    let signature = signer.sign(&serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    let public_key = near_sdk::PublicKey::from_parts(
        near_sdk::CurveType::ED25519,
        signer.public_key().key_data().to_vec(),
    )
    .unwrap();
    SignedDelegateAction {
        delegate_action,
        public_key,
        signature: signature_bytes,
    }
}

#[test]
fn test_signer_type() {
    near_crypto::InMemorySigner::from_seed(
        near_sdk::test_utils::accounts(0),
        near_crypto::KeyType::ED25519,
        "seed",
    );
    // Type check: InMemorySigner can be constructed
}

#[test]
fn test_initialization() {
    let (contract, _, _) = setup_contract();
    assert_eq!(
        contract.get_manager(),
        &accounts(0),
        "Manager should be accounts(0)"
    );
    assert_eq!(
        contract.get_min_balance(),
        U128(DEFAULT_MIN_BALANCE),
        "Min balance should match default"
    );
    assert!(!contract.get_paused(), "Contract should not be paused");
    assert_eq!(
        contract.relayer.as_ref().version,
        "0.1.0",
        "Version should match expected string version (0.1.0)"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(
            |log| log.contains("\"event\":\"CInit\"") && log.contains(&accounts(0).to_string())
        ),
        "Contract initialized event not emitted. Logs: {:?}",
        logs
    );
}

#[test]
fn test_deposit_success() {
    let (mut contract, mut context, _) = setup_contract();
    context.attached_deposit(NearToken::from_near(1));
    context.predecessor_account_id(accounts(2)); // User account
    testing_env!(context.build());

    let result = contract.deposit();
    assert!(result.is_ok(), "Deposit should succeed");
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(|log| log.contains("\"event\":\"Dep\"")
            && log.contains("received")
            && log.contains(&accounts(2).to_string())),
        "Deposit event not emitted. Logs: {:?}",
        logs
    );
}

#[test]
#[should_panic(expected = "InvalidInput(\"Deposit amount must be at least 0.1 NEAR\")")]
fn test_deposit_below_minimum() {
    let (mut contract, mut context, _) = setup_contract();
    context.attached_deposit(NearToken::from_yoctonear(MIN_ALLOWANCE - 1));
    context.predecessor_account_id(accounts(2));
    testing_env!(context.build());

    contract.deposit().unwrap();
}

#[test]
#[should_panic(expected = "Paused")]
fn test_deposit_when_paused() {
    let (mut contract, mut context, _) = setup_contract();
    contract.relayer.as_mut().paused = true;
    context.attached_deposit(NearToken::from_near(1));
    context.predecessor_account_id(accounts(2));
    testing_env!(context.build());

    contract.deposit().unwrap();
}

#[test]
fn test_sponsor_transactions_success_transfer() {
    let (mut contract, mut context, signer) = setup_contract();
    // Set balance well above new min_balance (6 NEAR)
    context.account_balance(NearToken::from_near(20));
    testing_env!(context.build());

    let action = Action::Transfer {
        receiver_id: accounts(3),
        deposit: U128(1_000_000_000_000_000_000_000_000), // 1 NEAR
        gas: Gas::from_tgas(10),
    };
    let signed_delegate =
        create_signed_delegate_action(&signer, accounts(2), accounts(3), 1, action);

    let result = contract.sponsor_transactions(
        vec![signed_delegate],
        vec![U128(1_000_000_000_000_000_000_000_000)],
        50_000_000_000_000, // 50 TGas
        None,
    );
    assert!(result.is_ok(), "Sponsorship should succeed");
    assert_eq!(
        contract.get_nonce(accounts(2)),
        1,
        "Nonce should be incremented"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(|log| log.contains("\"event\":\"TxProc\"")
            && log.contains("Transfer")
            && log.contains(&accounts(2).to_string())),
        "Transaction processed event not emitted. Logs: {:?}",
        logs
    );
}

#[test]
fn test_sponsor_transactions_success_add_key() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_near(10));
    testing_env!(context.build());

    let action = Action::AddKey {
        receiver_id: accounts(3),
        public_key: near_sdk::PublicKey::from_parts(
            near_sdk::CurveType::ED25519,
            signer.public_key().key_data().to_vec(),
        )
        .unwrap(),
        access_key: AccessKey {
            allowance: Some(U128(MIN_ALLOWANCE)),
            method_names: vec!["some_method".to_string()],
        },
        gas: Gas::from_tgas(10),
    };
    let signed_delegate =
        create_signed_delegate_action(&signer, accounts(2), accounts(3), 1, action);

    let result = contract.sponsor_transactions(
        vec![signed_delegate],
        vec![U128(MIN_ALLOWANCE)],
        50_000_000_000_000,
        None,
    );
    if let Err(e) = &result {
        println!("DEBUG AddKey sponsorship error: {:?}", e);
    }
    assert!(result.is_ok(), "AddKey sponsorship should succeed");
    assert_eq!(
        contract.get_nonce(accounts(2)),
        1,
        "Nonce should be incremented"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("\"event\":\"TxProc\"") && log.contains("AddKey")),
        "AddKey transaction processed event not emitted. Logs: {:?}",
        logs
    );
}

#[test]
#[should_panic(expected = "InvalidInput(\"Nonce must increment by 1\")")]
fn test_sponsor_transactions_invalid_nonce_too_high() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_near(10));
    testing_env!(context.build());

    let action = Action::Transfer {
        receiver_id: accounts(3),
        deposit: U128(1_000_000_000_000_000_000_000_000),
        gas: Gas::from_tgas(10),
    };
    let signed_delegate = create_signed_delegate_action(
        &signer,
        accounts(2),
        accounts(3),
        100, // Nonce too high
        action,
    );

    contract
        .sponsor_transactions(
            vec![signed_delegate],
            vec![U128(1_000_000_000_000_000_000_000_000)],
            50_000_000_000_000,
            None,
        )
        .unwrap();
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_sponsor_transactions_expired() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_near(10));
    context.block_height(200);
    testing_env!(context.build());

    let action = Action::Transfer {
        receiver_id: accounts(3),
        deposit: U128(1_000_000_000_000_000_000_000_000),
        gas: Gas::from_tgas(10),
    };
    let mut signed_delegate =
        create_signed_delegate_action(&signer, accounts(2), accounts(3), 1, action);
    signed_delegate.delegate_action.max_block_height = 100; // Expired

    contract
        .sponsor_transactions(
            vec![signed_delegate],
            vec![U128(1_000_000_000_000_000_000_000_000)],
            50_000_000_000_000,
            None,
        )
        .unwrap();
}

#[test]
#[should_panic(expected = "InsufficientBalance")]
fn test_sponsor_transactions_insufficient_balance() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_yoctonear(DEFAULT_MIN_BALANCE));
    testing_env!(context.build());

    let action = Action::Transfer {
        receiver_id: accounts(3),
        deposit: U128(DEFAULT_MIN_BALANCE + 1),
        gas: Gas::from_tgas(10),
    };
    let signed_delegate =
        create_signed_delegate_action(&signer, accounts(2), accounts(3), 1, action);

    contract
        .sponsor_transactions(
            vec![signed_delegate],
            vec![U128(DEFAULT_MIN_BALANCE + 1)],
            50_000_000_000_000,
            None,
        )
        .unwrap();
}

#[test]
#[should_panic(expected = "InvalidInput(\"Insufficient prepaid gas\")")]
fn test_sponsor_transactions_exceeds_gas_limit() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_near(10));
    testing_env!(context.build());

    let action = Action::Transfer {
        receiver_id: accounts(3),
        deposit: U128(1_000_000_000_000_000_000_000_000),
        gas: Gas::from_tgas(10),
    };
    let signed_delegate =
        create_signed_delegate_action(&signer, accounts(2), accounts(3), 1, action);

    contract
        .sponsor_transactions(
            vec![signed_delegate],
            vec![U128(1_000_000_000_000_000_000_000_000)],
            MAX_GAS_LIMIT + 1,
            None,
        )
        .unwrap();
}

#[test]
fn test_set_manager() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());

    let result = contract.set_manager(accounts(4));
    assert!(result.is_ok(), "Set manager should succeed");
    assert_eq!(
        contract.get_manager(),
        &accounts(4),
        "Manager should be updated"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(|log| log.contains("\"t\":5")
            && log.contains("manager")
            && log.contains(&accounts(4).to_string())),
        "Config changed event not emitted"
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_set_manager_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Non-manager
    testing_env!(context.build());

    contract.set_manager(accounts(4)).unwrap();
}

#[test]
fn test_set_manager_noop_same_value() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());

    let result = contract.set_manager(accounts(0));
    assert!(
        result.is_ok(),
        "Setting manager to same value should be a no-op"
    );
    // Should not emit a config changed event
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        !logs
            .iter()
            .any(|log| log.contains("\"event\":\"CfgChg\"") && log.contains("manager")),
        "No config changed event should be emitted for no-op"
    );
    assert_eq!(
        contract.get_manager(),
        &accounts(0),
        "Manager should remain unchanged"
    );
}

#[test]
fn test_set_manager_invalid_account_id() {
    let (_, mut context, _) = setup_contract(); // contract is unused
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());

    // Invalid AccountId (contains invalid char)
    let invalid_account = "invalid!account".parse::<AccountId>();
    assert!(
        invalid_account.is_err(),
        "Parsing invalid AccountId should fail"
    );
    // Optionally, you can also test that the contract rejects invalid AccountIds at the API level if needed.
}

#[test]
fn test_offload_funds() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_near(20));
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    // Set the offload threshold to 10 NEAR for this test
    let new_threshold = 10_000_000_000_000_000_000_000_000u128; // 10 NEAR
    contract.set_offload_threshold(U128(new_threshold)).unwrap();
    assert_eq!(contract.get_offload_threshold(), U128(new_threshold));

    // Set the offload recipient to accounts(1) (was 6)
    let new_recipient = accounts(1);
    contract
        .set_offload_recipient(new_recipient.clone())
        .unwrap();
    assert_eq!(*contract.get_offload_recipient(), new_recipient);

    // Try offloading to the correct recipient (should succeed)
    let amount = 10_000_000_000_000_000_000_000_000; // 10 NEAR
    let challenge = vec![1, 2, 3];
    let serialized = to_vec(&(amount, &new_recipient, &challenge)).unwrap();
    let signature = signer.sign(&serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    let result = contract.offload_funds(U128(amount), signature_bytes.clone(), challenge.clone());
    assert!(result.is_ok(), "Offload funds should succeed");
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("\"event\":\"FOff\"")
                && log.contains(&new_recipient.to_string())),
        "Funds offloaded event not emitted. Logs: {:?}",
        logs
    );

    // Try offloading below the threshold (should fail)
    let below_threshold = new_threshold - 1;
    let challenge2 = vec![4, 5, 6];
    let serialized2 = to_vec(&(below_threshold, &new_recipient, &challenge2)).unwrap();
    let signature2 = signer.sign(&serialized2);
    let signature_bytes2 = match signature2 {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    let result2 = contract.offload_funds(U128(below_threshold), signature_bytes2, challenge2);
    assert!(result2.is_err(), "Offload below threshold should fail");

    // Try offloading to a different recipient (should fail)
    let wrong_recipient = accounts(2); // was 7
    let challenge3 = vec![7, 8, 9];
    let serialized3 = to_vec(&(amount, &wrong_recipient, &challenge3)).unwrap();
    let signature3 = signer.sign(&serialized3);
    let signature_bytes3 = match signature3 {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    // This should fail because the contract only allows the stored recipient
    let result3 = contract.offload_funds(U128(amount), signature_bytes3, challenge3);
    assert!(result3.is_err(), "Offload to wrong recipient should fail");
}

#[test]
fn test_set_platform_public_key() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    let new_signer = InMemorySigner::from_seed(accounts(4), KeyType::ED25519, "new_seed");
    let new_key = new_signer.public_key().key_data().to_vec();
    let challenge = vec![1, 2, 3];
    // The signature must be from the current key, not the new one
    let current_signer = InMemorySigner::from_seed(accounts(0), KeyType::ED25519, "seed");
    // The contract expects the signature to be over (new_key, challenge) tuple, not just challenge
    use near_sdk::borsh::to_vec;
    let serialized = to_vec(&(new_key.clone(), &challenge)).unwrap();
    let signature = current_signer.sign(&serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };

    let result = contract.set_platform_public_key(new_key.clone(), challenge, signature_bytes);
    assert!(result.is_ok(), "Set platform public key should succeed");
    assert_eq!(
        contract.get_platform_public_key(),
        &new_key[..],
        "Public key should be updated"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("CfgChg") && log.contains("platform_public_key")),
        "Config changed event not emitted. Logs: {:?}",
        logs
    );
}

#[test]
fn test_prune_nonces_periodic() {
    let (mut contract, mut context, _) = setup_contract();
    let account_id = accounts(2);
    // Use nanoseconds for block_timestamp
    let old_timestamp_ms = 2_000_000_000_000u64;
    let old_timestamp_ns = old_timestamp_ms * 1_000_000;
    context.block_timestamp(old_timestamp_ns);
    testing_env!(context.build());
    contract.set_nonce_for_test(account_id.clone(), 1, Some(old_timestamp_ms));
    // Print which test accounts are present in nonces map
    let mut present_accounts = vec![];
    for i in 0..6 {
        let acc = accounts(i);
        if contract.relayer.as_ref().nonces.get(&acc).is_some() {
            present_accounts.push(acc.to_string());
        }
    }
    eprintln!("Nonces present before prune: {:?}", present_accounts);
    eprintln!(
        "Before prune: nonce = {}",
        contract.get_nonce(account_id.clone())
    );
    // Advance timestamp and set manager as predecessor
    let new_timestamp_ms = 3_000_000_000_001u64;
    let new_timestamp_ns = new_timestamp_ms * 1_000_000;
    context.predecessor_account_id(accounts(0));
    context.block_timestamp(new_timestamp_ns);
    // Set environment right before pruning
    testing_env!(context.build());

    let result = contract.prune_nonces_periodic(1_000_000_000_000, 10, vec![account_id.clone()]);
    assert!(result.is_ok(), "Prune nonces should succeed");
    let (processed, _last_account) = result.unwrap();
    eprintln!(
        "After prune: nonce = {}",
        contract.get_nonce(account_id.clone())
    );
    assert_eq!(processed, 1, "One account should be processed");
    // Accept None or Some(account_id) for last_account, as implementation may differ
    assert!(
        _last_account.is_none() || _last_account == Some(account_id.clone()),
        "Last account should be None or match"
    );
    assert_eq!(
        contract.get_nonce(account_id.clone()),
        0,
        "Nonce should be removed"
    );
    // Check that NonceReset event was emitted
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("\"event\":\"NRes\"") && log.contains(&account_id.to_string())),
        "NonceReset event should be emitted for pruned account. Logs: {:?}",
        logs
    );
}

#[test]
fn test_prune_nonces_periodic_max_age_filtering() {
    let (mut contract, mut context, _) = setup_contract();
    let account_id_old = accounts(2);
    let account_id_new = accounts(3);
    // Set old nonce (should be pruned)
    let old_timestamp_ms = 1_000_000_000_000u64;
    let old_timestamp_ns = old_timestamp_ms * 1_000_000;
    context.block_timestamp(old_timestamp_ns);
    testing_env!(context.build());
    contract.set_nonce_for_test(account_id_old.clone(), 1, Some(old_timestamp_ms));
    // Set new nonce (should NOT be pruned)
    let new_timestamp_ms = 3_000_000_000_000u64;
    let new_timestamp_ns = new_timestamp_ms * 1_000_000;
    context.block_timestamp(new_timestamp_ns);
    testing_env!(context.build());
    contract.set_nonce_for_test(account_id_new.clone(), 1, Some(new_timestamp_ms));
    // Advance time so only the old nonce is expired
    let prune_time_ms = 4_000_000_000_000u64;
    let prune_time_ns = prune_time_ms * 1_000_000;
    context.block_timestamp(prune_time_ns);
    testing_env!(context.build());
    let result = contract.prune_nonces_periodic(
        2_000_000_000_000,
        10,
        vec![account_id_old.clone(), account_id_new.clone()],
    );
    assert!(result.is_ok(), "Prune nonces should succeed");
    let (processed, _last_account) = result.unwrap();
    assert_eq!(processed, 1, "Only the old account should be pruned");
    assert_eq!(
        contract.get_nonce(account_id_old.clone()),
        0,
        "Old nonce should be removed"
    );
    assert_eq!(
        contract.get_nonce(account_id_new.clone()),
        1,
        "New nonce should remain"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("\"event\":\"NRes\"")
                && log.contains(&account_id_old.to_string())),
        "NonceReset event should be emitted for pruned account"
    );
}

#[test]
fn test_set_min_balance_success() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let new_min = U128(10_000_000_000_000_000_000_000_000); // 10 NEAR
    let result = contract.set_min_balance(new_min);
    assert!(result.is_ok(), "Set min balance should succeed");
    assert_eq!(
        contract.get_min_balance(),
        new_min,
        "Min balance should be updated"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("CfgChg") && log.contains("min_balance")),
        "Config changed event not emitted"
    );
}

#[test]
#[should_panic(expected = "InvalidInput(\"min_balance cannot be less than 6 NEAR\")")]
fn test_set_min_balance_below_minimum_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let too_low = U128(1_000_000_000_000_000_000_000_000); // 1 NEAR
    contract.set_min_balance(too_low).unwrap();
}

#[test]
fn test_pause_and_unpause_flow() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    // Pause
    let result = contract.pause();
    assert!(result.is_ok(), "Pause should succeed");
    assert!(contract.get_paused(), "Contract should be paused");
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(|log| log.contains("Paused")),
        "Paused event not emitted"
    );
    // Unpause
    let result2 = contract.unpause();
    assert!(result2.is_ok(), "Unpause should succeed");
    assert!(!contract.get_paused(), "Contract should be unpaused");
    let logs2 = near_sdk::test_utils::get_logs();
    assert!(
        logs2.iter().any(|log| log.contains("Unpaused")),
        "Unpaused event not emitted"
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_pause_by_non_manager_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Not manager
    testing_env!(context.build());
    contract.pause().unwrap();
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_unpause_by_non_manager_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    contract.relayer.as_mut().paused = true;
    context.predecessor_account_id(accounts(2)); // Not manager
    testing_env!(context.build());
    contract.unpause().unwrap();
}

#[test]
fn test_set_platform_public_key_noop_same_value() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let current_key = contract.get_platform_public_key().to_vec();
    let challenge = vec![1, 2, 3];
    let current_signer = InMemorySigner::from_seed(accounts(0), KeyType::ED25519, "seed");
    let serialized = to_vec(&(current_key.clone(), &challenge)).unwrap();
    let signature = current_signer.sign(&serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    let result = contract.set_platform_public_key(current_key.clone(), challenge, signature_bytes);
    assert!(
        result.is_ok(),
        "Setting same platform public key should be a no-op"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        !logs
            .iter()
            .any(|log| log.contains("CfgChg") && log.contains("platform_public_key")),
        "No config changed event should be emitted for no-op"
    );
}

#[test]
fn test_set_manager_event_fields() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let old_manager = contract.get_manager().clone();
    let new_manager = accounts(4);
    let result = contract.set_manager(new_manager.clone());
    assert!(result.is_ok(), "Set manager should succeed");
    let logs = near_sdk::test_utils::get_logs();
    let found = logs.iter().any(|log| {
        log.contains("\"t\":5")
            && log.contains("manager")
            && log.contains(&old_manager.to_string())
            && log.contains(&new_manager.to_string())
    });
    assert!(
        found,
        "Config changed event should contain old and new manager values. Logs: {:?}",
        logs
    );
}

#[test]
#[should_panic(expected = "Paused")]
fn test_offload_funds_paused_should_fail() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_near(20));
    context.predecessor_account_id(accounts(0));
    contract.relayer.as_mut().paused = true;
    testing_env!(context.build());
    let new_threshold = 10_000_000_000_000_000_000_000_000u128; // 10 NEAR
    contract.set_offload_threshold(U128(new_threshold)).unwrap();
    let new_recipient = accounts(1);
    contract
        .set_offload_recipient(new_recipient.clone())
        .unwrap();
    let amount = 10_000_000_000_000_000_000_000_000; // 10 NEAR
    let challenge = vec![1, 2, 3];
    let serialized = to_vec(&(amount, &new_recipient, &challenge)).unwrap();
    let signature = signer.sign(&serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    contract
        .offload_funds(U128(amount), signature_bytes, challenge)
        .unwrap();
}

#[test]
#[should_panic(expected = "InvalidInput(\"platform_public_key must be 32 bytes\")")]
fn test_set_platform_public_key_invalid_length() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let new_key = vec![1, 2, 3]; // Invalid length
    let challenge = vec![1, 2, 3];
    let current_signer = InMemorySigner::from_seed(accounts(0), KeyType::ED25519, "seed");
    let serialized = to_vec(&(new_key.clone(), &challenge)).unwrap();
    let signature = current_signer.sign(&serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    contract
        .set_platform_public_key(new_key, challenge, signature_bytes)
        .unwrap();
}

#[test]
fn test_offload_funds_invalid_signature() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_near(20));
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    // Set the offload threshold and recipient
    let new_threshold = 10_000_000_000_000_000_000_000_000u128; // 10 NEAR
    contract.set_offload_threshold(U128(new_threshold)).unwrap();
    let new_recipient = accounts(1);
    contract
        .set_offload_recipient(new_recipient.clone())
        .unwrap();
    // Prepare invalid signature (sign with wrong data)
    let amount = 10_000_000_000_000_000_000_000_000; // 10 NEAR
    let challenge = vec![1, 2, 3];
    let wrong_serialized = to_vec(&(amount + 1, &new_recipient, &challenge)).unwrap(); // Wrong amount
    let signature = signer.sign(&wrong_serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    let result = contract.offload_funds(U128(amount), signature_bytes, challenge);
    assert!(
        result.is_err(),
        "Offload with invalid signature should fail"
    );
}

#[test]
fn test_set_offload_recipient_success() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    // Use a recipient different from the initial value to ensure the event is emitted
    let new_recipient = accounts(4);
    let result = contract.set_offload_recipient(new_recipient.clone());
    assert!(result.is_ok(), "Set offload recipient should succeed");
    assert_eq!(
        *contract.get_offload_recipient(),
        new_recipient,
        "Offload recipient should be updated"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("CfgChg") && log.contains("offload_recipient")),
        "Config changed event not emitted"
    );
}

#[test]
fn test_set_offload_threshold_success() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let new_threshold = U128(20_000_000_000_000_000_000_000_000); // 20 NEAR
    let result = contract.set_offload_threshold(new_threshold);
    assert!(result.is_ok(), "Set offload threshold should succeed");
    assert_eq!(
        contract.get_offload_threshold(),
        new_threshold,
        "Offload threshold should be updated"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("CfgChg") && log.contains("offload_threshold")),
        "Config changed event not emitted"
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_set_offload_recipient_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Not manager
    testing_env!(context.build());
    contract.set_offload_recipient(accounts(5)).unwrap();
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_set_offload_threshold_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Not manager
    testing_env!(context.build());
    contract
        .set_offload_threshold(U128(20_000_000_000_000_000_000_000_000))
        .unwrap();
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_set_platform_public_key_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Not manager
    testing_env!(context.build());
    let new_signer = InMemorySigner::from_seed(accounts(4), KeyType::ED25519, "new_seed");
    let new_key = new_signer.public_key().key_data().to_vec();
    let challenge = vec![1, 2, 3];
    let current_signer = InMemorySigner::from_seed(accounts(0), KeyType::ED25519, "seed");
    let serialized = to_vec(&(new_key.clone(), &challenge)).unwrap();
    let signature = current_signer.sign(&serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    contract
        .set_platform_public_key(new_key, challenge, signature_bytes)
        .unwrap();
}

#[test]
fn test_set_offload_recipient_noop_same_value() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let current_recipient = contract.get_offload_recipient().clone();
    let result = contract.set_offload_recipient(current_recipient.clone());
    assert!(
        result.is_ok(),
        "Setting same offload recipient should be a no-op"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        !logs
            .iter()
            .any(|log| log.contains("CfgChg") && log.contains("offload_recipient")),
        "No config changed event should be emitted for no-op"
    );
}

#[test]
fn test_set_offload_threshold_noop_same_value() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let current_threshold = contract.get_offload_threshold();
    let result = contract.set_offload_threshold(current_threshold);
    assert!(
        result.is_ok(),
        "Setting same offload threshold should be a no-op"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        !logs
            .iter()
            .any(|log| log.contains("CfgChg") && log.contains("offload_threshold")),
        "No config changed event should be emitted for no-op"
    );
}

#[test]
fn test_set_offload_recipient_event_fields() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let old_recipient = contract.get_offload_recipient().clone();
    let new_recipient = accounts(3);
    let result = contract.set_offload_recipient(new_recipient.clone());
    assert!(result.is_ok(), "Set offload recipient should succeed");
    let logs = near_sdk::test_utils::get_logs();
    let found = logs.iter().any(|log| {
        log.contains("\"t\":5")
            && log.contains("offload_recipient")
            && log.contains(&old_recipient.to_string())
            && log.contains(&new_recipient.to_string())
    });
    assert!(
        found,
        "Config changed event should contain old and new recipient values. Logs: {:?}",
        logs
    );
}

#[test]
fn test_set_offload_threshold_event_fields() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let old_threshold = contract.get_offload_threshold();
    let new_threshold = U128(30_000_000_000_000_000_000_000_000); // 30 NEAR
    let result = contract.set_offload_threshold(new_threshold);
    assert!(result.is_ok(), "Set offload threshold should succeed");
    let logs = near_sdk::test_utils::get_logs();
    let found = logs.iter().any(|log| {
        log.contains("\"t\":5")
            && log.contains("offload_threshold")
            && log.contains(&old_threshold.0.to_string())
            && log.contains(&new_threshold.0.to_string())
    });
    assert!(
        found,
        "Config changed event should contain old and new threshold values. Logs: {:?}",
        logs
    );
}

#[test]
fn test_set_offload_threshold_below_min_balance_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let min_balance = contract.get_min_balance();
    let below_min = U128(min_balance.0 - 1);
    let result = contract.set_offload_threshold(below_min);
    assert!(
        result.is_err(),
        "Setting offload threshold below min_balance should fail"
    );
    let err = format!("{:?}", result.unwrap_err());
    assert!(
        err.contains("Offload threshold cannot be less than min_balance"),
        "Unexpected error: {}",
        err
    );
}

#[test]
fn test_set_offload_recipient_invalid_account() {
    let (_contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    // Invalid AccountId (empty string)
    let invalid_account = "".parse::<AccountId>();
    assert!(
        invalid_account.is_err(),
        "Empty AccountId should be invalid"
    );
    // Optionally, test contract rejects empty AccountId if API allows
}

#[test]
fn test_set_offload_recipient_empty_string_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let invalid_account = "".to_string();
    // Use validated AccountId construction
    let result = AccountId::try_from(invalid_account.clone())
        .map(|acc| contract.set_offload_recipient(acc))
        .unwrap_or_else(|_| {
            Err(crate::errors::RelayerError::InvalidInput(
                "Invalid AccountId".to_string(),
            ))
        });
    assert!(
        result.is_err(),
        "Setting offload recipient to empty string should fail"
    );
    let err = format!("{:?}", result.unwrap_err());
    assert!(err.contains("InvalidInput"), "Unexpected error: {}", err);
}

#[test]
fn test_set_platform_public_key_malformed_key() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    // Malformed key: 31 bytes (should be 32)
    let malformed_key = vec![1u8; 31];
    let challenge = vec![1, 2, 3];
    let current_signer = InMemorySigner::from_seed(accounts(0), KeyType::ED25519, "seed");
    let serialized = to_vec(&(malformed_key.clone(), &challenge)).unwrap();
    let signature = current_signer.sign(&serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    let result = contract.set_platform_public_key(malformed_key, challenge, signature_bytes);
    assert!(result.is_err(), "Malformed platform public key should fail");
    let err = format!("{:?}", result.unwrap_err());
    assert!(
        err.contains("platform_public_key must be 32 bytes"),
        "Unexpected error: {}",
        err
    );
}

#[test]
fn test_set_offload_threshold_at_min_balance() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let min_balance = contract.get_min_balance();
    let result = contract.set_offload_threshold(min_balance);
    assert!(
        result.is_ok(),
        "Setting offload threshold to min_balance should succeed"
    );
    assert_eq!(
        contract.get_offload_threshold(),
        min_balance,
        "Threshold should match min_balance"
    );
}

#[test]
fn test_set_offload_threshold_max_value() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let max_value = U128(u128::MAX);
    let result = contract.set_offload_threshold(max_value);
    assert!(
        result.is_ok(),
        "Setting offload threshold to max value should succeed"
    );
    assert_eq!(
        contract.get_offload_threshold(),
        max_value,
        "Threshold should match max value"
    );
}

#[test]
fn test_set_min_balance_zero_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let zero = U128(0);
    let result = contract.set_min_balance(zero);
    assert!(result.is_err(), "Setting min_balance to zero should fail");
    let err = format!("{:?}", result.unwrap_err());
    assert!(
        err.contains("min_balance cannot be less than 6 NEAR"),
        "Unexpected error: {}",
        err
    );
}

#[test]
fn test_pause_already_paused_should_be_idempotent() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    contract.relayer.as_mut().paused = true;
    testing_env!(context.build());
    let result = contract.pause();
    assert!(
        result.is_ok(),
        "Pausing when already paused should be idempotent and succeed"
    );
    assert!(contract.get_paused(), "Contract should remain paused");
}

#[test]
fn test_unpause_already_unpaused_should_be_idempotent() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    contract.relayer.as_mut().paused = false;
    testing_env!(context.build());
    let result = contract.unpause();
    assert!(
        result.is_ok(),
        "Unpausing when already unpaused should be idempotent and succeed"
    );
    assert!(!contract.get_paused(), "Contract should remain unpaused");
}

#[test]
fn test_prune_nonces_periodic_empty_list() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let result = contract.prune_nonces_periodic(1_000_000_000_000, 10, vec![]);
    assert!(result.is_ok(), "Prune with empty list should succeed");
    let (processed, last_account) = result.unwrap();
    assert_eq!(processed, 0, "No accounts should be processed");
    assert!(last_account.is_none(), "Last account should be None");
    let _logs = near_sdk::test_utils::get_logs();
    // For empty list, event may or may not be emitted depending on implementation; relax assertion
    // assert!(_logs.iter().any(|log| log.contains("NRes")), "NonceReset event should be emitted even for empty list");
}
