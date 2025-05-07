#[cfg(test)]
mod tests {
    use crate::{OnSocialRelayer, Relayer}; // Import Relayer directly
    use near_sdk::{
        env,
        test_utils::{VMContextBuilder, get_logs},
        testing_env, AccountId, NearToken, CurveType, PublicKey,
    };
    use near_sdk::store::{LazyOption, LookupMap};
    use near_sdk::borsh;
    use crate::types::{SignedDelegateAction, DelegateAction, Action, SignatureScheme};

    fn setup_context(predecessor: AccountId) -> VMContextBuilder {
        let mut context = VMContextBuilder::new();
        context
            .predecessor_account_id(predecessor)
            .current_account_id("relayer.testnet".parse::<AccountId>().unwrap())
            .block_timestamp(1_000_000_000_000)
            .attached_deposit(NearToken::from_yoctonear(0));
        context
    }

    #[test]
    fn test_migration_from_010() {
        let manager: AccountId = "manager.testnet".parse().unwrap();
        let context = setup_context(manager.clone());
        testing_env!(context.build());

        // Create a Relayer state with version 0.1.0 (same as current)
        let state = Relayer {
            version: "0.1.0".to_string(),
            manager: manager.clone(),
            offload_recipient: "recipient.testnet".parse().unwrap(),
            auth_contract: "auth.testnet".parse().unwrap(),
            ft_wrapper_contract: "ft.testnet".parse().unwrap(),
            omni_locker_contract: LazyOption::new(b"omni_locker".to_vec(), Some("locker.testnet".parse::<AccountId>().unwrap())),
            chain_mpc_mapping: LookupMap::new(b"chain_mpc".to_vec()),
            sponsor_amount: 10_000_000_000_000_000_000_000,
            sponsor_gas: 100_000_000_000_000,
            cross_contract_gas: 100_000_000_000_000,
            migration_gas: 250_000_000_000_000,
            chunk_size: 10,
            min_balance: 10_000_000_000_000_000_000_000_000,
            max_balance: 1_000_000_000_000_000_000_000_000_000,
            base_fee: 100_000_000_000_000_000_000,
            transfer_nonces: LookupMap::new(b"nonces".to_vec()),
            pending_transfers: LookupMap::new(b"pending_transfers".to_vec()),
        };
        let state_bytes = borsh::to_vec(&state).expect("Failed to serialize state");
        env::state_write(&state_bytes);

        let new_contract = OnSocialRelayer::migrate();

        assert_eq!(new_contract.relayer.version, env!("CARGO_PKG_VERSION"), "Version should match Cargo.toml");
        assert_eq!(new_contract.relayer.manager, manager, "Manager should be preserved");
        assert_eq!(
            new_contract.relayer.offload_recipient,
            "recipient.testnet".parse::<AccountId>().unwrap(),
            "Offload recipient should be preserved"
        );
        assert_eq!(
            new_contract.relayer.auth_contract,
            "auth.testnet".parse::<AccountId>().unwrap(),
            "Auth contract should be preserved"
        );
        assert_eq!(
            new_contract.relayer.ft_wrapper_contract,
            "ft.testnet".parse::<AccountId>().unwrap(),
            "FT wrapper contract should be preserved"
        );
        assert_eq!(
            new_contract.relayer.min_balance,
            10_000_000_000_000_000_000_000_000,
            "Min balance should be preserved"
        );
        assert_eq!(
            new_contract.relayer.max_balance,
            1_000_000_000_000_000_000_000_000_000,
            "Max balance should be preserved"
        );
        assert_eq!(
            new_contract.relayer.base_fee,
            100_000_000_000_000_000_000,
            "Base fee should be preserved"
        );

        let logs = get_logs();
        assert!(
            logs.contains(&"State is at current or newer version, no migration needed".to_string()),
            "Expected no-migration log, got: {:?}", logs
        );
        // No StateMigrated event should be emitted
        assert!(
            !logs.iter().any(|log| log.contains("state_migrated")),
            "Unexpected state_migrated event, got: {:?}", logs
        );
    }

    #[test]
    fn test_migration_no_prior_state() {
        let manager: AccountId = "manager.testnet".parse().unwrap();
        let context = setup_context(manager.clone());
        testing_env!(context.build());

        let new_contract = OnSocialRelayer::migrate();

        assert_eq!(new_contract.relayer.version, env!("CARGO_PKG_VERSION"), "Version should match Cargo.toml");
        assert_eq!(new_contract.relayer.manager, env::current_account_id(), "Manager should be current account");
        assert_eq!(
            new_contract.relayer.offload_recipient,
            "recipient.testnet".parse::<AccountId>().unwrap(),
            "Offload recipient should be initialized"
        );
        assert_eq!(
            new_contract.relayer.auth_contract,
            "auth.testnet".parse::<AccountId>().unwrap(),
            "Auth contract should be initialized"
        );
        assert_eq!(
            new_contract.relayer.ft_wrapper_contract,
            "ft.testnet".parse::<AccountId>().unwrap(),
            "FT wrapper contract should be initialized"
        );

        let logs = get_logs();
        assert!(
            logs.contains(&"No valid prior state found or unknown version, initializing new state".to_string()),
            "Expected no prior state log, got: {:?}", logs
        );
    }

    #[test]
    fn test_migration_corrupted_state() {
        let manager: AccountId = "manager.testnet".parse().unwrap();
        let context = setup_context(manager.clone());
        testing_env!(context.build());

        // Simulate corrupted state
        env::state_write(&vec![0u8; 10]); // Invalid Borsh data

        let new_contract = OnSocialRelayer::migrate();

        assert_eq!(new_contract.relayer.version, env!("CARGO_PKG_VERSION"), "Version should match Cargo.toml");
        assert_eq!(new_contract.relayer.manager, env::current_account_id(), "Manager should be current account");
        assert_eq!(
            new_contract.relayer.offload_recipient,
            "recipient.testnet".parse::<AccountId>().unwrap(),
            "Offload recipient should be initialized"
        );
        assert_eq!(
            new_contract.relayer.auth_contract,
            "auth.testnet".parse::<AccountId>().unwrap(),
            "Auth contract should be initialized"
        );
        assert_eq!(
            new_contract.relayer.ft_wrapper_contract,
            "ft.testnet".parse::<AccountId>().unwrap(),
            "FT wrapper contract should be initialized"
        );

        let logs = get_logs();
        assert!(
            logs.contains(&"No valid prior state found or unknown version, initializing new state".to_string()),
            "Expected no prior state log, got: {:?}", logs
        );
    }

    #[test]
    fn test_gas_logging_relay_meta_transaction() {
        let manager: AccountId = "manager.testnet".parse().unwrap();
        let context = setup_context(manager.clone());
        testing_env!(context.build());

        let mut contract = OnSocialRelayer::new(
            "recipient.testnet".parse().unwrap(),
            "auth.testnet".parse().unwrap(),
            "ft.testnet".parse().unwrap(),
        );

        // Create a mock SignedDelegateAction with multiple actions to trigger InvalidNonce
        let delegate_action = DelegateAction {
            sender_id: "sender.testnet".parse().unwrap(),
            receiver_id: "receiver.testnet".parse().unwrap(),
            actions: vec![
                Action::Transfer { deposit: NearToken::from_yoctonear(1_000_000_000_000_000_000_000) },
                Action::Transfer { deposit: NearToken::from_yoctonear(1_000_000_000_000_000_000_000) },
            ],
            nonce: 1,
            max_block_height: 1_000_000,
        };
        let dummy_key = vec![0u8; 32]; // Valid 32-byte ED25519 key (all zeros for testing)
        let signed_delegate = SignedDelegateAction {
            delegate_action,
            signature: vec![0u8; 64], // Dummy signature
            public_key: PublicKey::from_parts(CurveType::ED25519, dummy_key).expect("Failed to create public key"),
            session_nonce: 0,
            scheme: SignatureScheme::Ed25519,
            fee_action: None,
            multi_signatures: None,
        };

        let result = contract.relay_meta_transaction(signed_delegate);
        assert!(result.is_err(), "Expected InvalidNonce error");
        let logs = get_logs();
        assert!(
            logs.iter().any(|log| log.contains("Gas used in relay_meta_transaction")),
            "Expected gas usage log, got: {:?}", logs
        );
    }
}