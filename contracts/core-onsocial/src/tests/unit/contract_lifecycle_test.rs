// --- Contract Lifecycle Tests ---
// Tests for contract initialization, status transitions, and basic lifecycle operations

#[cfg(test)]
mod contract_lifecycle_tests {
    use crate::{Contract, config::GovernanceConfig};
    use crate::tests::test_utils::*;
    use crate::state::models::ContractStatus;
    use near_sdk::test_utils::get_logs;

    #[test]
    fn test_contract_creation_and_default_state() {
        // Set up context for contract creation (predecessor becomes manager)
        let contract_account = near_sdk::test_utils::accounts(0);
        let context = get_context(contract_account.clone());
        near_sdk::testing_env!(context.build());

        let contract = Contract::new();

        // Test contract status
        assert_eq!(contract.platform.status, ContractStatus::Genesis,
            "New contract should start in Genesis status");

        // Test default config values
        let config = contract.platform.config;
        assert!(config.max_key_length > 0, "Max key length should be set");
        assert!(config.max_path_depth > 0, "Max path depth should be set");
        assert!(config.max_batch_size > 0, "Max batch size should be set");
        assert!(config.min_promise_gas_tgas > 0, "Min promise gas should be set");

        // Test manager is set (should be the contract account itself initially)
        assert!(!contract.platform.manager.to_string().is_empty(), "Manager should be set");

        // Test storage structures are initialized (empty state verified through other means)
    }

    #[test]
    fn test_contract_activation() {
        // Set up context for contract creation (predecessor becomes manager)
        let contract_account = near_sdk::test_utils::accounts(0);
        let context = get_context(contract_account.clone());
        near_sdk::testing_env!(context.build());

        let mut contract = Contract::new();

        // Contract should start in Genesis
        assert_eq!(contract.platform.status, ContractStatus::Genesis);

        // Clear any previous logs
        let _ = get_logs();

        // Set up context with required deposit for payable method (manager must be caller)
        let context = get_context_with_deposit(contract_account, 1);
        near_sdk::testing_env!(context.build());

        // Activate contract
        let result = contract.activate_contract();
        assert!(result, "Contract activation should succeed");

        // Contract should now be in Live status
        assert_eq!(contract.platform.status, ContractStatus::Live,
            "Contract should be in Live status after activation");

        // Verify event was emitted
        let logs = get_logs();
        assert_eq!(logs.len(), 1, "Should emit exactly one event");
        assert!(verify_contract_event(&logs[0], "activate_contract", "Genesis", "Live"),
            "Event should contain correct contract activation data");
    }

    #[test]
    fn test_status_transitions() {
        // Set up context for contract creation (predecessor becomes manager)
        let contract_account = near_sdk::test_utils::accounts(0);
        let context = get_context(contract_account.clone());
        near_sdk::testing_env!(context.build());

        let mut contract = init_live_contract();

        // Start in Live status
        assert_eq!(contract.platform.status, ContractStatus::Live);

        // Clear any previous logs
        let _ = get_logs();

        // Enter read-only mode with required deposit (manager must be caller)
        let context1 = get_context_with_deposit(contract_account.clone(), 1);
        near_sdk::testing_env!(context1.build());
        let result = contract.enter_read_only();
        assert!(result, "Entering read-only should succeed");
        assert_eq!(contract.platform.status, ContractStatus::ReadOnly,
            "Contract should be in ReadOnly status");

        // Verify read-only event was emitted
        let logs = get_logs();
        assert_eq!(logs.len(), 1, "Should emit exactly one event for read-only transition");
        assert!(verify_contract_event(&logs[0], "enter_read_only", "Live", "ReadOnly"),
            "Event should contain correct read-only transition data");

        // Clear logs for next transition
        let _ = get_logs();

        // Resume live mode with required deposit (manager must be caller)
        let context2 = get_context_with_deposit(contract_account, 1);
        near_sdk::testing_env!(context2.build());
        let result = contract.resume_live();
        assert!(result, "Resuming live mode should succeed");
        assert_eq!(contract.platform.status, ContractStatus::Live,
            "Contract should be back in Live status");

        // Verify live resume event was emitted
        let logs = get_logs();
        assert_eq!(logs.len(), 1, "Should emit exactly one event for live resume transition");
        assert!(verify_contract_event(&logs[0], "resume_live", "ReadOnly", "Live"),
            "Event should contain correct live resume transition data");
    }

    #[test]
    fn test_config_defaults() {
        let config = GovernanceConfig::default();

        // Test key limits
        assert_eq!(config.max_key_length, 256, "Max key length should be 256");
        assert!(config.max_path_depth >= 10, "Max path depth should be reasonable");

        // Test operation limits
        assert!(config.max_batch_size > 0, "Should allow some operations per batch");
        assert!(config.max_batch_size <= 200, "Batch size should be reasonable");

        // Test gas limits
        assert!(config.min_promise_gas_tgas >= 10, "Should have minimum gas requirements");
        assert!(config.min_promise_gas_tgas <= 100, "Gas minimum should be reasonable");
    }

    #[test]
    fn test_manager_validation() {
        let contract = init_live_contract();
        let manager = contract.platform.manager.clone();

        // Test that manager is a valid account ID
        assert!(!manager.to_string().is_empty(), "Manager should be set");
        assert!(manager.to_string().contains('.'), "Manager should be a valid account ID format");
    }

    #[test]
    #[should_panic(expected = "Invalid transition: can only activate Live from Genesis")]
    fn test_invalid_activation_from_readonly() {
        let mut contract = init_live_contract();

        // Put contract in ReadOnly mode
        let manager = contract.platform.manager.clone();
        let context = get_context_with_deposit(manager, 1);
        near_sdk::testing_env!(context.build());
        contract.enter_read_only();

        // Try to activate from ReadOnly - should panic
        contract.activate_contract();
    }

    #[test]
    #[should_panic(expected = "Invalid transition: can only enter ReadOnly from Live")]
    fn test_invalid_enter_readonly_from_genesis() {
        let mut contract = Contract::new();
        // Contract starts in Genesis, try to enter ReadOnly - should panic
        let manager = contract.platform.manager.clone();
        let context = get_context_with_deposit(manager, 1);
        near_sdk::testing_env!(context.build());
        contract.enter_read_only();
    }

    #[test]
    #[should_panic(expected = "Invalid transition: can only resume Live from ReadOnly")]
    fn test_invalid_resume_live_from_genesis() {
        let mut contract = Contract::new();
        // Contract starts in Genesis, try to resume Live - should panic
        let manager = contract.platform.manager.clone();
        let context = get_context_with_deposit(manager, 1);
        near_sdk::testing_env!(context.build());
        contract.resume_live();
    }

    #[test]
    fn test_idempotent_operations() {
        let mut contract = init_live_contract();
        let manager = contract.platform.manager.clone();

        // Try to activate already live contract - should return false
        let context = get_context_with_deposit(manager.clone(), 1);
        near_sdk::testing_env!(context.build());
        let result = contract.activate_contract();
        assert!(!result, "Activating already live contract should return false");

        // Enter ReadOnly, then try again - should return false
        let result = contract.enter_read_only();
        assert!(result, "First enter_read_only should succeed");
        let result = contract.enter_read_only();
        assert!(!result, "Second enter_read_only should return false");

        // Resume Live, then try again - should return false
        let result = contract.resume_live();
        assert!(result, "First resume_live should succeed");
        let result = contract.resume_live();
        assert!(!result, "Second resume_live should return false");
    }

    #[test]
    #[should_panic(expected = "manager_operation")]
    fn test_unauthorized_activate_contract() {
        let mut contract = Contract::new();
        // Use non-manager account
        let non_manager = near_sdk::test_utils::accounts(1);
        let context = get_context_with_deposit(non_manager, 1);
        near_sdk::testing_env!(context.build());

        contract.activate_contract();
    }

    #[test]
    #[should_panic(expected = "manager_operation")]
    fn test_unauthorized_enter_readonly() {
        let mut contract = init_live_contract();
        // Use non-manager account
        let non_manager = near_sdk::test_utils::accounts(1);
        let context = get_context_with_deposit(non_manager, 1);
        near_sdk::testing_env!(context.build());

        contract.enter_read_only();
    }

    #[test]
    #[should_panic(expected = "manager_operation")]
    fn test_unauthorized_resume_live() {
        let mut contract = init_live_contract();
        let manager = contract.platform.manager.clone();

        // Enter ReadOnly first as manager
        let context = get_context_with_deposit(manager, 1);
        near_sdk::testing_env!(context.build());
        contract.enter_read_only();

        // Now try to resume as non-manager
        let non_manager = near_sdk::test_utils::accounts(1);
        let context = get_context_with_deposit(non_manager, 1);
        near_sdk::testing_env!(context.build());

        contract.resume_live();
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn test_activate_contract_requires_deposit() {
        let mut contract = Contract::new();
        let manager = contract.platform.manager.clone();
        // Call without deposit
        let context = get_context(manager);
        near_sdk::testing_env!(context.build());

        contract.activate_contract();
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn test_enter_readonly_requires_deposit() {
        let mut contract = init_live_contract();
        let manager = contract.platform.manager.clone();
        // Call without deposit
        let context = get_context(manager);
        near_sdk::testing_env!(context.build());

        contract.enter_read_only();
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn test_resume_live_requires_deposit() {
        let mut contract = init_live_contract();
        let manager = contract.platform.manager.clone();

        // Enter ReadOnly first with deposit
        let context = get_context_with_deposit(manager.clone(), 1);
        near_sdk::testing_env!(context.build());
        contract.enter_read_only();

        // Now try to resume without deposit
        let context = get_context(manager);
        near_sdk::testing_env!(context.build());

        contract.resume_live();
    }

    #[test]
    fn test_config_validation() {
        let current_config = GovernanceConfig::default();

        // Test valid updates (increases only)
        let mut valid_update = current_config.clone();
        valid_update.max_key_length = 300; // Increase allowed
        valid_update.max_batch_size = 150; // Increase allowed
        assert!(valid_update.validate_update(&current_config).is_ok(),
            "Valid increases should be allowed");

        // Test invalid updates (decreases)
        let mut invalid_update = current_config.clone();
        invalid_update.max_key_length = 200; // Decrease not allowed
        assert!(invalid_update.validate_update(&current_config).is_err(),
            "Decreases should not be allowed");

        // Test gas minimum enforcement
        let mut low_gas_config = current_config.clone();
        low_gas_config.min_promise_gas_tgas = 5; // Below minimum
        assert!(low_gas_config.validate_update(&current_config).is_err(),
            "Gas below minimum should not be allowed");
    }

    #[test]
    fn test_initialization_completeness() {
        let contract = Contract::new();

        // Test version is set
        assert!(!contract.platform.version.is_empty(), "Version should be set");
        assert_eq!(contract.platform.version, env!("CARGO_PKG_VERSION"),
            "Version should match Cargo package version");

        // Test storage maps are initialized (empty)
        // Note: We can't directly test emptiness of LookupMaps in unit tests
        // but we can verify they exist by checking the contract compiles and initializes

        // Test all config values are reasonable
        let config = contract.platform.config;
        assert!(config.max_key_length >= 256, "Max key length should be at least 256");
        assert!(config.max_path_depth >= 10, "Max path depth should be reasonable");
        assert!(config.max_batch_size >= 50, "Max batch size should be reasonable");
        assert!(config.min_promise_gas_tgas >= 10, "Min gas should be at least 10 TGas");
    }
}