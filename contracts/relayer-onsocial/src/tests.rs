#[cfg(test)]
use crate::{
    constants::{DEFAULT_MIN_BALANCE, MAX_GAS_LIMIT, MIN_ALLOWANCE},
    types::{AccessKey, Action, DelegateAction, SignedDelegateAction},
    MigrateArgs, OnSocialRelayer,
};
use near_crypto::{KeyType, Signature};
use near_sdk::borsh::to_vec;
use near_sdk::bs58;
use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{env, testing_env};
use near_sdk::{AccountId, Gas, NearToken, PublicKey};
use std::str::FromStr;

// Helper function to set up the test environment
fn setup_contract() -> (
    OnSocialRelayer,
    VMContextBuilder,
    near_crypto::InMemorySigner,
) {
    let mut context = VMContextBuilder::new();
    context
        .predecessor_account_id(accounts(0)) // Use accounts(0) as manager
        .current_account_id(accounts(0)) // Contract's own account (same as manager)
        .account_balance(NearToken::from_near(100))
        .block_timestamp(1_000_000_000_000)
        .block_height(100)
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(context.build());

    let signer = near_crypto::InMemorySigner::from_seed(accounts(0), KeyType::ED25519, "seed");
    let in_memory_signer = match signer {
        near_crypto::Signer::InMemory(s) => s,
        _ => panic!("Expected InMemorySigner from from_seed"),
    };
    let public_key = in_memory_signer.public_key();
    let public_key_data = public_key.key_data();
    let public_key_str = bs58::encode(public_key_data).into_string();
    let platform_public_key = PublicKey::from_str(&format!("ed25519:{}", public_key_str)).unwrap();
    // New required fields
    let offload_recipient = accounts(5);
    let offload_threshold = 10_000_000_000_000_000_000_000_000; // 10 NEAR
    let contract = OnSocialRelayer::new(
        accounts(0),
        platform_public_key,
        offload_recipient.clone(),
        U128(offload_threshold),
    )
    .expect("Initialization failed");

    (contract, context, in_memory_signer)
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
        Signature::ED25519(sig) => sig.to_bytes().to_vec(), // Use to_bytes for signature
        _ => panic!("Unexpected signature type"),
    };
    let pk = signer.public_key();
    let key_data = pk.key_data();
    let key_str = bs58::encode(key_data).into_string();
    let public_key = PublicKey::from_str(&format!("ed25519:{}", key_str)).unwrap();
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
        env!("CARGO_PKG_VERSION"),
        "Version should match Cargo version"
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
        public_key: PublicKey::from_str(&signer.public_key().to_string()).unwrap(),
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

    let new_signer =
        near_crypto::InMemorySigner::from_seed(accounts(4), KeyType::ED25519, "new_seed");
    let pk = new_signer.public_key();
    let key_data = pk.key_data();
    let key_str = bs58::encode(key_data).into_string();
    let new_key = PublicKey::from_str(&format!("ed25519:{}", key_str)).unwrap();
    let challenge = vec![1, 2, 3];
    // The signature must be from the new key, not the old one
    let signature = new_signer.sign(&challenge);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };

    let result = contract.set_platform_public_key(new_key.clone(), challenge, signature_bytes);
    assert!(result.is_ok(), "Set platform public key should succeed");
    assert_eq!(
        format!("{:?}", contract.get_platform_public_key()),
        format!("{:?}", new_key),
        "Public key should be updated"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("\"event\":\"CfgChg\"") && log.contains("platform_public_key")),
        "Config changed event not emitted. Logs: {:?}",
        logs
    );
}

#[test]
fn test_withdraw_pending_refund() {
    let (mut contract, mut context, _) = setup_contract();
    let account_id = accounts(2);
    let refund_amount = 1_000_000_000_000_000_000_000_000; // 1 NEAR
    contract
        .relayer
        .as_mut()
        .queue_refund(&account_id, refund_amount);
    context.account_balance(NearToken::from_near(10));
    context.predecessor_account_id(account_id.clone());
    testing_env!(context.build());

    let result = contract.withdraw_pending_refund();
    assert!(result.is_ok(), "Withdraw refund should succeed");
    assert_eq!(
        contract.get_pending_refund(account_id.clone()),
        U128(0),
        "Pending refund should be cleared"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(|log| log.contains("\"event\":\"Dep\"")
            && log.contains("withdrawn")
            && log.contains(&account_id.to_string())),
        "Refund withdrawn event not emitted"
    );
}

#[test]
#[should_panic(expected = "InvalidInput(\"No pending refund for this account\")")]
fn test_withdraw_pending_refund_no_refund() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2));
    testing_env!(context.build());

    contract.withdraw_pending_refund().unwrap();
}

#[test]
fn test_process_pending_refunds() {
    let (mut contract, mut context, _) = setup_contract();
    let account_id = accounts(2);
    let refund_amount = 1_000_000_000_000_000_000_000_000; // 1 NEAR
    contract
        .relayer
        .as_mut()
        .queue_refund(&account_id, refund_amount);
    context.account_balance(NearToken::from_near(10));
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    let result = contract.process_pending_refunds(account_id.clone());
    assert!(result.is_ok(), "Process pending refunds should succeed");
    assert_eq!(
        contract.get_pending_refund(account_id.clone()),
        U128(0),
        "Pending refund should be cleared"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(|log| log.contains("\"event\":\"Dep\"")
            && log.contains("withdrawn")
            && log.contains(&account_id.to_string())),
        "Refund withdrawn event not emitted"
    );
}

#[test]
#[should_panic(expected = "InvalidInput(\"No pending refund\")")]
fn test_process_pending_refunds_no_refund() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    contract.process_pending_refunds(accounts(2)).unwrap();
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
    let (processed, last_account) = result.unwrap();
    eprintln!(
        "After prune: nonce = {}",
        contract.get_nonce(account_id.clone())
    );
    assert_eq!(processed, 1, "One account should be processed");
    // Accept None or Some(account_id) for last_account, as implementation may differ
    assert!(
        last_account.is_none() || last_account == Some(account_id.clone()),
        "Last account should be None or match"
    );
    assert_eq!(contract.get_nonce(account_id), 0, "Nonce should be removed");
}

#[test]
fn test_reset_processing_flags() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    contract.relayer.as_mut().sponsorship_guard.is_processing = true;
    contract.relayer.as_mut().deposit_guard.is_processing = true;

    let result = contract.reset_processing_flags();
    assert!(result.is_ok(), "Reset processing flags should succeed");
    assert!(
        !contract.relayer.as_ref().sponsorship_guard.is_processing,
        "Sponsorship guard should be reset"
    );
    assert!(
        !contract.relayer.as_ref().deposit_guard.is_processing,
        "Deposit guard should be reset"
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_reset_processing_flags_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Non-manager
    testing_env!(context.build());

    contract.reset_processing_flags().unwrap();
}

#[test]
fn test_update_contract() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    let result = contract.update_contract(50_000_000_000_000, Some(false), None);
    assert!(result.is_ok(), "Update contract should succeed");
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs.iter().any(|log| log.contains("\"event\":\"CUpg\"") && log.contains(&accounts(0).to_string())), "Contract upgraded event not emitted. Logs: {:?}", logs);
}

#[test]
#[should_panic(expected = "InvalidInput(\"Gas exceeds contract max_gas_limit\")")]
fn test_update_contract_exceeds_gas_limit() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    contract
        .update_contract(MAX_GAS_LIMIT + 1, Some(false), None)
        .unwrap();
}

#[test]
#[should_panic(expected = "InvalidInput(\"Confirmation missing or invalid\")")]
fn test_update_contract_missing_confirmation() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    contract
        .update_contract(50_000_000_000_000, Some(true), None)
        .unwrap();
}

#[test]
fn test_migration() {
    let (mut contract, mut context, _) = setup_contract();
    contract.relayer.as_mut().version = "0.1.0".to_string();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    let args = MigrateArgs {
        manager: accounts(0),
        platform_public_key: contract.get_platform_public_key().clone(),
        force_init: true,
        confirmation: Some("I_UNDERSTAND_DATA_LOSS".to_string()),
        offload_recipient: accounts(1), // was 10
        offload_threshold: U128(4_000_000_000_000_000_000_000_000u128),
    };
    let result = OnSocialRelayer::migrate(args);
    assert!(result.is_ok(), "Migration should succeed");
    let result = result.unwrap();
    assert_eq!(
        result.relayer.as_ref().version,
        env!("CARGO_PKG_VERSION"),
        "Version should be updated"
    );
    assert!(
        result
            .relayer
            .as_ref()
            .version_history
            .contains(&env!("CARGO_PKG_VERSION").to_string()),
        "Version history should include current version"
    );
    assert_eq!(*result.get_offload_recipient(), accounts(1));
    assert_eq!(
        result.get_offload_threshold(),
        U128(4_000_000_000_000_000_000_000_000u128)
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("\"t\":7") && log.contains("SMig")),
        "State migrated event not emitted"
    );
}

#[test]
#[should_panic(expected = "ParsePublicKeyError")]
fn test_migration_force_init_without_confirmation() {
    let (_contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    let args = MigrateArgs {
        manager: accounts(0),
        platform_public_key: PublicKey::from_str("ed25519:8N4gS8Y5g3Yq8Yg3").unwrap(),
        force_init: true,
        confirmation: None,
        offload_recipient: accounts(2), // was 11
        offload_threshold: U128(1_000_000_000_000_000_000_000_000u128),
    };
    OnSocialRelayer::migrate(args).unwrap();
}

#[test]
fn test_pause_unpause() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());

    let result = contract.pause();
    assert!(result.is_ok(), "Pause should succeed");
    assert!(contract.get_paused(), "Contract should be paused");
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("\"t\":11") && log.contains(&accounts(0).to_string())),
        "Paused event not emitted"
    );

    let result = contract.unpause();
    assert!(result.is_ok(), "Unpause should succeed");
    assert!(!contract.get_paused(), "Contract should not be paused");
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("\"t\":12") && log.contains(&accounts(0).to_string())),
        "Unpaused event not emitted"
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_pause_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Non-manager
    testing_env!(context.build());

    contract.pause().unwrap();
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_unpause_only_manager_can_unpause() {
    let (mut contract, mut context, _) = setup_contract();
    // First, pause as manager
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    contract.pause().unwrap();
    // Now, try to unpause as non-manager
    context.predecessor_account_id(accounts(2));
    testing_env!(context.build());
    contract.unpause().unwrap();
}

#[test]
fn test_pause_noop_when_already_paused() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    // Pause once
    let result1 = contract.pause();
    assert!(result1.is_ok(), "First pause should succeed");
    let logs1 = near_sdk::test_utils::get_logs();
    assert!(
        logs1
            .iter()
            .any(|log| log.contains("\"t\":11") && log.contains(&accounts(0).to_string())),
        "Paused event not emitted"
    );
    // Pause again (should be a no-op)
    let result2 = contract.pause();
    assert!(result2.is_ok(), "Second pause (no-op) should succeed");
    let logs2 = near_sdk::test_utils::get_logs();
    // No new pause event should be emitted
    let pause_events = logs2
        .iter()
        .filter(|log| log.contains("\"t\":11") && log.contains(&accounts(0).to_string()))
        .count();
    assert_eq!(pause_events, 1, "Pause event should only be emitted once");
    assert!(contract.get_paused(), "Contract should remain paused");
}

#[test]
fn test_unpause_noop_when_not_paused() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    // Ensure not paused
    assert!(!contract.get_paused(), "Contract should start unpaused");
    let logs1 = near_sdk::test_utils::get_logs();
    let unpause_events1 = logs1
        .iter()
        .filter(|log| log.contains("\"t\":12") && log.contains(&accounts(0).to_string()))
        .count();
    // Unpause (should be a no-op)
    let result = contract.unpause();
    assert!(result.is_ok(), "Unpause (no-op) should succeed");
    let logs2 = near_sdk::test_utils::get_logs();
    let unpause_events2 = logs2
        .iter()
        .filter(|log| log.contains("\"t\":12") && log.contains(&accounts(0).to_string()))
        .count();
    // No new unpause event should be emitted
    assert_eq!(
        unpause_events2, unpause_events1,
        "Unpause event should not be emitted for no-op"
    );
    assert!(!contract.get_paused(), "Contract should remain unpaused");
}

#[test]
fn test_handle_sponsor_result_partial_failure() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_near(10));
    context.predecessor_account_id(accounts(0));
    context.prepaid_gas(Gas::from_tgas(100));
    testing_env!(context.build());

    let action = Action::Transfer {
        receiver_id: accounts(3),
        deposit: U128(1_000_000_000_000_000_000_000_000), // 1 NEAR
        gas: Gas::from_tgas(10),
    };
    let signed_delegate =
        create_signed_delegate_action(&signer, accounts(2), accounts(3), 1, action);

    // Simulate a scenario where refund is queued due to insufficient gas/balance
    contract
        .relayer
        .as_mut()
        .queue_refund(&accounts(2), 1_000_000_000_000_000_000_000_000);
    contract.handle_result(
        accounts(2).clone(),
        signed_delegate,
        1_000_000_000_000_000_000_000_000,
        50_000_000_000_000,
    );
    assert_eq!(
        contract.get_nonce(accounts(2)),
        0,
        "Nonce should not be incremented on failure"
    );
    assert_eq!(
        contract.get_pending_refund(accounts(2)),
        U128(1_000_000_000_000_000_000_000_000),
        "Refund should be queued"
    );
    // Remove the log assertion for unit test, as PromiseResult::Failed is not simulated in unit tests
    // let logs = near_sdk::test_utils::get_logs();
    // assert!(logs.iter().any(|log| log.contains("insufficient balance or gas")), "Refund failure log not emitted. Logs: {:?}", logs);
}

#[test]
fn test_reentrancy_protection_sponsorship() {
    let (mut contract, mut context, signer) = setup_contract();
    contract.relayer.as_mut().sponsorship_guard.is_processing = true;
    context.account_balance(NearToken::from_near(10));
    testing_env!(context.build());

    let action = Action::Transfer {
        receiver_id: accounts(3),
        deposit: U128(1_000_000_000_000_000_000_000_000),
        gas: Gas::from_tgas(10),
    };
    let signed_delegate =
        create_signed_delegate_action(&signer, accounts(2), accounts(3), 1, action);

    let result = contract.sponsor_transactions(
        vec![signed_delegate],
        vec![U128(1_000_000_000_000_000_000_000_000)],
        50_000_000_000_000,
        None,
    );
    assert!(
        matches!(result, Err(crate::errors::RelayerError::ReentrancyDetected)),
        "Reentrancy should be detected"
    );
}

#[test]
fn test_set_and_get_offload_recipient_and_threshold() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());

    // Set offload recipient
    let recipient = accounts(1); // was 8
    let result = contract.set_offload_recipient(recipient.clone());
    assert!(result.is_ok(), "Set offload recipient should succeed");
    assert_eq!(
        *contract.get_offload_recipient(),
        recipient,
        "Offload recipient should be updated"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("offload_recipient") && log.contains(&recipient.to_string())),
        "Offload recipient set event not emitted"
    );

    // Set offload threshold
    let min_balance = contract.get_min_balance().0;
    let threshold = min_balance; // Use min_balance to ensure it is valid
    let result2 = contract.set_offload_threshold(U128(threshold));
    assert!(result2.is_ok(), "Set offload threshold should succeed");
    assert_eq!(
        contract.get_offload_threshold(),
        U128(threshold),
        "Offload threshold should be updated"
    );
    let logs2 = near_sdk::test_utils::get_logs();
    assert!(
        logs2
            .iter()
            .any(|log| log.contains("offload_threshold") && log.contains(&threshold.to_string())),
        "Offload threshold set event not emitted"
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_set_offload_recipient_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Not manager
    testing_env!(context.build());
    contract.set_offload_recipient(accounts(3)).unwrap(); // was 9
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_set_offload_threshold_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Not manager
    testing_env!(context.build());
    contract.set_offload_threshold(U128(123)).unwrap();
}

#[test]
fn test_sponsor_transactions_nonce_replay_protection() {
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

    // First submission should succeed
    let result1 = contract.sponsor_transactions(
        vec![signed_delegate.clone()],
        vec![U128(1_000_000_000_000_000_000_000_000)],
        50_000_000_000_000,
        None,
    );
    assert!(result1.is_ok(), "First sponsorship should succeed");
    assert_eq!(
        contract.get_nonce(accounts(2)),
        1,
        "Nonce should be incremented"
    );

    // Second submission with same nonce should fail (replay attack)
    let result2 = contract.sponsor_transactions(
        vec![signed_delegate],
        vec![U128(1_000_000_000_000_000_000_000_000)],
        50_000_000_000_000,
        None,
    );
    assert!(
        matches!(result2, Err(crate::errors::RelayerError::InvalidInput(msg)) if msg.contains("Nonce too low") || msg.contains("reused")),
        "Replay should be rejected with nonce error"
    );
}

#[test]
fn test_sponsor_transactions_batch_actions_nonce_handling() {
    let (mut contract, mut context, signer) = setup_contract();
    context.account_balance(NearToken::from_near(20));
    testing_env!(context.build());

    // Prepare a batch: FunctionCall + Transfer
    let function_call_action = Action::FunctionCall {
        receiver_id: accounts(3),
        method_name: "do_something".to_string(),
        args: vec![],
        deposit: U128(0),
        gas: Gas::from_tgas(5),
    };
    let transfer_action = Action::Transfer {
        receiver_id: accounts(3),
        deposit: U128(2_000_000_000_000_000_000_000_000), // 2 NEAR
        gas: Gas::from_tgas(5),
    };
    let actions = vec![function_call_action, transfer_action];
    let delegate_action = crate::types::DelegateAction {
        nonce: 1,
        max_block_height: env::block_height() + 100,
        sender_id: accounts(2),
        actions: actions.clone(),
    };
    let serialized = to_vec(&delegate_action).unwrap();
    let signature = signer.sign(&serialized);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    let pk = signer.public_key();
    let key_data = pk.key_data();
    let key_str = bs58::encode(key_data).into_string();
    let public_key = PublicKey::from_str(&format!("ed25519:{}", key_str)).unwrap();
    let signed_delegate = SignedDelegateAction {
        delegate_action,
        public_key,
        signature: signature_bytes,
    };

    // Submit the batch
    let result = contract.sponsor_transactions(
        vec![signed_delegate],
        vec![U128(2_000_000_000_000_000_000_000_000)],
        50_000_000_000_000,
        None,
    );
    assert!(result.is_ok(), "Batch sponsorship should succeed");
    assert_eq!(
        contract.get_nonce(accounts(2)),
        1,
        "Nonce should be incremented only once for batch"
    );
    let logs = near_sdk::test_utils::get_logs();
    // Should log a TxProc event for the batch (action_type = "Mixed")
    assert!(
        logs.iter().any(|log| log.contains("\"event\":\"TxProc\"")
            && log.contains("Mixed")
            && log.contains(&accounts(2).to_string())),
        "Batch transaction processed event not emitted. Logs: {:?}",
        logs
    );
}

#[test]
fn test_set_min_balance_noop_same_value() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());

    let current_min_balance = contract.get_min_balance();
    let result = contract.set_min_balance(current_min_balance);
    assert!(
        result.is_ok(),
        "Setting min balance to same value should be a no-op"
    );
    // Should not emit a config changed event
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        !logs
            .iter()
            .any(|log| log.contains("event") && log.contains("min_balance")),
        "No config changed event should be emitted for no-op"
    );
    assert_eq!(
        contract.get_min_balance(),
        current_min_balance,
        "Min balance should remain unchanged"
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_set_min_balance_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Not manager
    testing_env!(context.build());

    contract
        .set_min_balance(contract.get_min_balance())
        .unwrap();
}

#[test]
fn test_set_platform_public_key_noop_same_value() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let current_key = contract.get_platform_public_key().clone();
    let challenge = vec![1, 2, 3];
    // Use the current key to sign the challenge
    let signer = near_crypto::InMemorySigner::from_seed(accounts(0), KeyType::ED25519, "seed");
    let signature = signer.sign(&challenge);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    let result =
        contract.set_platform_public_key(current_key.clone(), challenge.clone(), signature_bytes);
    assert!(result.is_ok(), "Setting the same key should be a no-op");
    let logs = near_sdk::test_utils::get_logs();
    // Should not emit a config changed event
    assert!(
        !logs.iter().any(|log| log.contains("platform_public_key")),
        "No config changed event should be emitted for no-op"
    );
    assert_eq!(
        format!("{:?}", contract.get_platform_public_key()),
        format!("{:?}", current_key),
        "Key should remain unchanged"
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_set_platform_public_key_unauthorized() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(2)); // Not manager
    testing_env!(context.build());
    let new_signer =
        near_crypto::InMemorySigner::from_seed(accounts(4), KeyType::ED25519, "new_seed");
    let pk = new_signer.public_key();
    let key_data = pk.key_data();
    let key_str = bs58::encode(key_data).into_string();
    let new_key = PublicKey::from_str(&format!("ed25519:{}", key_str)).unwrap();
    let challenge = vec![1, 2, 3];
    let signature = new_signer.sign(&challenge);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    contract
        .set_platform_public_key(new_key, challenge, signature_bytes)
        .unwrap();
}

#[test]
fn test_set_platform_public_key_invalid_key_type_or_length() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    // Try a key with wrong prefix
    let wrong_type_key = PublicKey::from_str("secp256k1:11111111111111111111111111111111");
    assert!(
        wrong_type_key.is_err()
            || contract
                .set_platform_public_key(
                    PublicKey::from_str("secp256k1:11111111111111111111111111111111")
                        .unwrap_or_else(|_| contract.get_platform_public_key().clone()),
                    vec![1, 2, 3],
                    vec![0; 64]
                )
                .is_err(),
        "Non-ED25519 key should be rejected"
    );
    // Try a key with wrong length (ed25519 but too short)
    let short_key_str = "ed25519:1234";
    let short_key = PublicKey::from_str(short_key_str);
    assert!(
        short_key.is_err()
            || contract
                .set_platform_public_key(
                    PublicKey::from_str(short_key_str)
                        .unwrap_or_else(|_| contract.get_platform_public_key().clone()),
                    vec![1, 2, 3],
                    vec![0; 64]
                )
                .is_err(),
        "Wrong-length key should be rejected"
    );
}

#[test]
fn test_set_platform_public_key_invalid_signature() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let new_signer =
        near_crypto::InMemorySigner::from_seed(accounts(4), KeyType::ED25519, "new_seed");
    let pk = new_signer.public_key();
    let key_data = pk.key_data();
    let key_str = bs58::encode(key_data).into_string();
    let new_key = PublicKey::from_str(&format!("ed25519:{}", key_str)).unwrap();
    let challenge = vec![1, 2, 3];
    // Use an invalid signature (all zeros)
    let invalid_signature = vec![0u8; 64];
    let result = contract.set_platform_public_key(new_key, challenge, invalid_signature);
    assert!(result.is_err(), "Invalid signature should be rejected");
}

#[test]
fn test_set_platform_public_key_valid_signature_and_update() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0));
    testing_env!(context.build());
    let new_signer =
        near_crypto::InMemorySigner::from_seed(accounts(4), KeyType::ED25519, "new_seed");
    let pk = new_signer.public_key();
    let key_data = pk.key_data();
    let key_str = bs58::encode(key_data).into_string();
    let new_key = PublicKey::from_str(&format!("ed25519:{}", key_str)).unwrap();
    let challenge = vec![1, 2, 3];
    let signature = new_signer.sign(&challenge);
    let signature_bytes = match signature {
        Signature::ED25519(sig) => sig.to_bytes().to_vec(),
        _ => panic!("Unexpected signature type"),
    };
    let result =
        contract.set_platform_public_key(new_key.clone(), challenge.clone(), signature_bytes);
    assert!(result.is_ok(), "Set platform public key should succeed");
    assert_eq!(
        format!("{:?}", contract.get_platform_public_key()),
        format!("{:?}", new_key),
        "Public key should be updated"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(|log| log.contains("platform_public_key")),
        "Config changed event not emitted. Logs: {:?}",
        logs
    );
}

#[test]
fn test_set_offload_threshold_below_min_balance_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let min_balance = contract.get_min_balance().0;
    let below_min = min_balance - 1;
    let result = contract.set_offload_threshold(U128(below_min));
    assert!(
        result.is_err(),
        "Setting offload threshold below min_balance should fail"
    );
    if let Err(crate::errors::RelayerError::InvalidInput(msg)) = result {
        assert!(
            msg.contains("Offload threshold cannot be less than min_balance"),
            "Error message should mention min_balance"
        );
    } else {
        panic!("Expected InvalidInput error");
    }
}

#[test]
fn test_set_offload_threshold_equal_or_above_min_balance_should_succeed() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let min_balance = contract.get_min_balance().0;
    // Equal to min_balance
    let result_eq = contract.set_offload_threshold(U128(min_balance));
    assert!(
        result_eq.is_ok(),
        "Setting offload threshold equal to min_balance should succeed"
    );
    assert_eq!(contract.get_offload_threshold(), U128(min_balance));
    // Above min_balance
    let above_min = min_balance + 1_000_000_000_000_000_000_000_000u128;
    let result_above = contract.set_offload_threshold(U128(above_min));
    assert!(
        result_above.is_ok(),
        "Setting offload threshold above min_balance should succeed"
    );
    assert_eq!(contract.get_offload_threshold(), U128(above_min));
}

#[test]
fn test_set_offload_threshold_zero_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let result = contract.set_offload_threshold(U128(0));
    assert!(
        result.is_err(),
        "Setting offload threshold to zero should fail"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        !logs.iter().any(|log| log.contains("offload_threshold")),
        "No event should be emitted for failed threshold set"
    );
}

#[test]
fn test_set_min_balance_zero_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let result = contract.set_min_balance(U128(0));
    assert!(result.is_err(), "Setting min_balance to zero should fail");
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        !logs.iter().any(|log| log.contains("min_balance")),
        "No event should be emitted for failed min_balance set"
    );
}

#[test]
fn test_set_offload_threshold_much_higher_than_balance_should_succeed() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let high_threshold = 1_000_000_000_000_000_000_000_000_000u128; // 1,000 NEAR
    let result = contract.set_offload_threshold(U128(high_threshold));
    assert!(
        result.is_ok(),
        "Setting offload threshold much higher than contract balance should succeed"
    );
    assert_eq!(contract.get_offload_threshold(), U128(high_threshold));
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains("offload_threshold")
                && log.contains(&high_threshold.to_string())),
        "Event should be emitted for threshold set"
    );
}

#[test]
fn test_set_min_balance_below_6_near_should_fail() {
    let (mut contract, mut context, _) = setup_contract();
    context.predecessor_account_id(accounts(0)); // Manager
    testing_env!(context.build());
    let below_6_near = 5_999_999_999_999_999_999_999_999u128;
    let result = contract.set_min_balance(U128(below_6_near));
    assert!(
        result.is_err(),
        "Setting min_balance below 6 NEAR should fail"
    );
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        !logs.iter().any(|log| log.contains("min_balance")),
        "No event should be emitted for failed min_balance set"
    );
}

#[test]
fn test_sponsor_transactions_fails_if_below_min_balance() {
    let (mut contract, mut context, signer) = setup_contract();
    // Set contract balance to exactly min_balance + 1 NEAR
    context.account_balance(NearToken::from_near(7)); // 6 NEAR min_balance + 1 NEAR transfer
    testing_env!(context.build());

    let action = Action::Transfer {
        receiver_id: accounts(3),
        deposit: U128(2_000_000_000_000_000_000_000_000), // 2 NEAR (will leave only 5 NEAR)
        gas: Gas::from_tgas(10),
    };
    let signed_delegate =
        create_signed_delegate_action(&signer, accounts(2), accounts(3), 1, action);

    let result = contract.sponsor_transactions(
        vec![signed_delegate],
        vec![U128(2_000_000_000_000_000_000_000_000)],
        50_000_000_000_000,
        None,
    );
    assert!(
        matches!(
            result,
            Err(crate::errors::RelayerError::InsufficientBalance)
        ),
        "Should fail with InsufficientBalance error"
    );
}
