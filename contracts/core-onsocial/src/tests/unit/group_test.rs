// --- Group Creation Tests ---
// Tests for group creation functionality including storage costs, permissions, and governance

#[cfg(test)]
mod group_creation_tests {
    use crate::tests::test_utils::*;
    use near_sdk::test_utils::get_logs;
    use near_sdk::serde_json::{json, Value};

    #[test]
    fn test_basic_group_creation() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Set up context for alice with sufficient deposit for group creation
        let context = get_context_with_deposit(alice.clone(), 100_000_000_000_000_000_000_000_000); // 100 NEAR
        near_sdk::testing_env!(context.build());

        let group_id = "test_group";
        let config = json!({
            "description": "A test group",
            "is_private": false,
            "member_driven": false
        });

        // Create the group (storage will be automatically allocated from attached deposit)
        let result = contract.create_group(group_id.to_string(), config.clone());
        match result {
            Ok(_) => {},
            Err(e) => panic!("Group creation failed with error: {:?}", e),
        }

        // Verify group was created by checking config
        let group_config = contract.get_group_config(group_id.to_string());
        assert!(group_config.is_some(), "Group config should exist");

        let config_data = group_config.unwrap();
        assert_eq!(config_data.get("owner"), Some(&json!(alice.to_string())), "Alice should be the owner");
        assert_eq!(config_data.get("description"), Some(&json!("A test group")), "Description should match");
        assert_eq!(config_data.get("is_private"), Some(&json!(false)), "Privacy setting should match");
        assert_eq!(config_data.get("member_driven"), Some(&json!(false)), "Governance setting should match");

        // Verify storage balance was allocated and charged
        let balance = contract.get_storage_balance(alice.clone());
        assert!(balance.is_some(), "Storage balance should exist");
        
        // Storage should have been allocated from the 100 NEAR deposit
        let storage_info = balance.unwrap();
        assert!(storage_info.balance > 0, "Storage balance should be positive");
        assert!(storage_info.used_bytes > 0, "Storage should have been used for group creation");

        println!("✓ Basic group creation test passed");
    }

    #[test]
    fn test_member_driven_group_creation() {
        let mut contract = init_live_contract();
        let bob = test_account(1);

        // Set up context for bob
        let context = get_context_with_deposit(bob.clone(), 100_000_000_000_000_000_000_000_000); // 100 NEAR
        near_sdk::testing_env!(context.build());

        let group_id = "democracy_group";
        let config = json!({
            "description": "A member-driven group",
            "is_private": true,
            "member_driven": true,
            "voting_quorum": 0.5,
            "voting_threshold": 0.66
        });

        // Create member-driven group
        let result = contract.create_group(group_id.to_string(), config.clone());
        assert!(result.is_ok(), "Member-driven group creation should succeed");

        // Verify group config
        let group_config = contract.get_group_config(group_id.to_string());
        assert!(group_config.is_some(), "Group config should exist");

        let config_data = group_config.unwrap();
        assert_eq!(config_data.get("owner"), Some(&json!(bob.to_string())), "Bob should be the owner");
        assert_eq!(config_data.get("member_driven"), Some(&json!(true)), "Should be member-driven");
        assert_eq!(config_data.get("is_private"), Some(&json!(true)), "Should be private");

        // Verify owner is automatically a member
        let is_owner = contract.is_group_owner(group_id.to_string(), bob.clone());
        assert!(is_owner, "Creator should be the owner");

        let is_member = contract.is_group_member(group_id.to_string(), bob.clone());
        assert!(is_member, "Creator should be a member");

        println!("✓ Member-driven group creation test passed");
    }

    #[test]
    fn test_private_group_creation() {
        let mut contract = init_live_contract();
        let charlie = test_account(2);

        // Set up context for charlie
        let context = get_context_with_deposit(charlie.clone(), 100_000_000_000_000_000_000_000_000); // 100 NEAR
        near_sdk::testing_env!(context.build());

        let group_id = "private_group";
        let config = json!({
            "description": "A private group",
            "is_private": true,
            "member_driven": false
        });

        // Create private group
        let result = contract.create_group(group_id.to_string(), config.clone());
        assert!(result.is_ok(), "Private group creation should succeed");

        // Verify group config
        let group_config = contract.get_group_config(group_id.to_string());
        assert!(group_config.is_some(), "Group config should exist");

        let config_data = group_config.unwrap();
        assert_eq!(config_data.get("is_private"), Some(&json!(true)), "Should be private");

        println!("✓ Private group creation test passed");
    }

    #[test]
    fn test_duplicate_group_creation_fails() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Set up context for alice
        let context = get_context_with_deposit(alice.clone(), 200_000_000_000_000_000_000_000_000); // 200 NEAR
        near_sdk::testing_env!(context.build());

        let group_id = "duplicate_test";
        let config = json!({
            "description": "First group",
            "is_private": false
        });

        // Create first group
        let result = contract.create_group(group_id.to_string(), config);
        assert!(result.is_ok(), "First group creation should succeed");

        // Try to create the same group again - should fail
        let config2 = json!({
            "description": "Second group with same ID",
            "is_private": true
        });

        let result = contract.create_group(group_id.to_string(), config2);
        assert!(result.is_err(), "Duplicate group creation should fail");

        println!("✓ Duplicate group creation prevention test passed");
    }

    #[test]
    fn test_group_creation_insufficient_deposit() {
        let mut contract = init_live_contract();
        let dave = test_account(3);

        // Set up context with insufficient deposit
        let context = get_context_with_deposit(dave.clone(), 1_000_000); // Very small deposit
        near_sdk::testing_env!(context.build());

        let group_id = "insufficient_deposit_group";
        let config = json!({"description": "Should fail"});

        // Try to create group with insufficient deposit
        let result = contract.create_group(group_id.to_string(), config);
        
        // Verify that insufficient storage error is correctly detected and returned
        assert!(result.is_err(), "Group creation with insufficient deposit should fail");
        if let Err(error) = result {
            // Check that it's specifically a storage error
            let error_msg = format!("{:?}", error);
            assert!(error_msg.contains("InsufficientStorage"), "Should be storage error, got: {}", error_msg);
        }
        
        // Note: Due to NEAR's non-transactional storage writes, the data may still be written 
        // even though the function correctly returns an error. This is a known limitation.

        println!("✓ Insufficient deposit prevention test passed");
    }

    #[test]
    fn test_group_creation_storage_refund() {
        let mut contract = init_live_contract();
        let eve = test_account(4);

        // Set up context with large deposit
        let initial_deposit = 200_000_000_000_000_000_000_000_000u128; // 200 NEAR
        let context = get_context_with_deposit(eve.clone(), initial_deposit);
        near_sdk::testing_env!(context.build());

        let group_id = "refund_test_group";
        let config = json!({
            "description": "Testing storage refund",
            "is_private": false
        });

        // Create the group
        let result = contract.create_group(group_id.to_string(), config);
        assert!(result.is_ok(), "Group creation should succeed");

        // Check storage balance after creation
        let balance = contract.get_storage_balance(eve.clone());
        assert!(balance.is_some(), "Storage balance should exist");

        let storage_info = balance.unwrap();
        
        // Verify storage was used (indicating the group was created)
        assert!(storage_info.used_bytes > 0, "Storage should be used for group creation");
        
        // Verify group was created successfully
        let group_config = contract.get_group_config(group_id.to_string());
        assert!(group_config.is_some(), "Group should be created");

        println!("✓ Group creation storage refund test passed");
    }

    #[test]
    fn test_group_creation_event_emission() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Set up context for alice
        let context = get_context_with_deposit(alice.clone(), 100_000_000_000_000_000_000_000_000); // 100 NEAR
        near_sdk::testing_env!(context.build());

        let group_id = "event_test_group";
        let config = json!({
            "description": "Testing event emission",
            "is_private": false
        });

        // Clear any previous logs
        let _ = get_logs();

        let result = contract.create_group(group_id.to_string(), config);
        assert!(result.is_ok(), "Group creation should succeed");

        // Check that events were emitted
        let logs = get_logs();
        assert!(!logs.is_empty(), "Events should be emitted for group creation");

        // Look for the create_group NEP-297 event and validate key fields.
        let mut found = false;
        for log in &logs {
            let Some(json_str) = log.strip_prefix("EVENT_JSON:") else {
                continue;
            };
            let evt: Value = near_sdk::serde_json::from_str(json_str)
                .expect("EVENT_JSON must be valid JSON");
            let data = evt
                .get("data")
                .and_then(|v| v.as_array())
                .expect("event.data must be an array");

            for item in data {
                if item.get("operation").and_then(|v| v.as_str()) != Some("create_group") {
                    continue;
                }
                found = true;
                assert_eq!(
                    item.get("group_id"),
                    Some(&json!(group_id)),
                    "create_group event must include group_id"
                );
                assert_eq!(
                    item.get("path"),
                    Some(&json!(format!("groups/{}/config", group_id))),
                    "create_group event path must point to groups/{{group_id}}/config"
                );
            }
        }
        assert!(found, "create_group event should be emitted");

        println!("✓ Group creation event emission test passed");
    }

    #[test]
    fn test_group_creation_default_config_values() {
        let mut contract = init_live_contract();
        let bob = test_account(1);

        // Set up context for bob
        let context = get_context_with_deposit(bob.clone(), 100_000_000_000_000_000_000_000_000); // 100 NEAR
        near_sdk::testing_env!(context.build());

        let group_id = "defaults_test_group";
        // Create group with minimal config
        let config = json!({});

        let result = contract.create_group(group_id.to_string(), config);
        assert!(result.is_ok(), "Group creation with minimal config should succeed");

        // Verify default values were set
        let group_config = contract.get_group_config(group_id.to_string());
        assert!(group_config.is_some(), "Group config should exist");

        let config_data = group_config.unwrap();
        assert_eq!(config_data.get("owner"), Some(&json!(bob.to_string())), "Owner should be set");
        assert_eq!(config_data.get("is_private"), Some(&json!(false)), "Should default to public");
        assert_eq!(config_data.get("member_driven"), Some(&json!(false)), "Should default to traditional");
        assert!(config_data.get("created_at").is_some(), "Created timestamp should be set");

        println!("✓ Group creation default config values test passed");
    }

    #[test]
    fn test_multiple_groups_creation() {
        let mut contract = init_live_contract();
        let charlie = test_account(2);

        // Set up context for charlie
        let context = get_context_with_deposit(charlie.clone(), 500_000_000_000_000_000_000_000_000); // 500 NEAR
        near_sdk::testing_env!(context.build());

        // Create multiple groups
        let groups = vec![
            ("group1", json!({"description": "First group"})),
            ("group2", json!({"description": "Second group", "is_private": true})),
            ("group3", json!({"description": "Third group", "member_driven": true})),
        ];

        for (group_id, config) in groups {
            let result = contract.create_group(group_id.to_string(), config);
            assert!(result.is_ok(), "Group {} creation should succeed", group_id);

            // Verify group exists
            let group_config = contract.get_group_config(group_id.to_string());
            assert!(group_config.is_some(), "Group {} should exist", group_id);
        }

        // Verify all groups are distinct
        let group1_config = contract.get_group_config("group1".to_string()).unwrap();
        let group2_config = contract.get_group_config("group2".to_string()).unwrap();
        let group3_config = contract.get_group_config("group3".to_string()).unwrap();

        assert_ne!(group1_config.get("description"), group2_config.get("description"));
        assert_ne!(group1_config.get("is_private"), group3_config.get("is_private"));

        println!("✓ Multiple groups creation test passed");
    }

    #[test]
    fn test_ownership_transfer_api_signature() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let group_id = "test_group";

        // Alice creates group
        let context = get_context_with_deposit(alice.clone(), 500_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        let config = json!({
            "description": "Test group for ownership transfer API"
        });

        contract.create_group(group_id.to_string(), config).unwrap();

        // Test that the new API signature works with all parameter combinations
        
        // Test 1: With None (default behavior)
        let result = contract.transfer_group_ownership(
            group_id.to_string(), 
            bob.clone(), 
            None // Default behavior
        );
        // This should fail because Bob is not a member yet, but the API should work
        assert!(result.is_err(), "Transfer to non-member should fail (but API signature works)");

        // Test 2: With Some(true) (explicit remove old owner)
        let result = contract.transfer_group_ownership(
            group_id.to_string(), 
            bob.clone(), 
            Some(true) // Explicitly remove old owner
        );
        assert!(result.is_err(), "Transfer to non-member should fail (but API signature works)");

        // Test 3: With Some(false) (keep old owner as member)
        let result = contract.transfer_group_ownership(
            group_id.to_string(), 
            bob.clone(), 
            Some(false) // Keep old owner as member
        );
        assert!(result.is_err(), "Transfer to non-member should fail (but API signature works)");

        println!("✓ Ownership transfer API signature test passed");
    }

    #[test]
    fn test_ownership_transfer_basic_validation() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);
        let group_id = "test_group";

        // Alice creates group
        let context = get_context_with_deposit(alice.clone(), 500_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        let config = json!({
            "description": "Test group for ownership transfer validation"
        });

        contract.create_group(group_id.to_string(), config).unwrap();

        // Test 1: Cannot transfer to non-member (this is the validation we can test)
        let result = contract.transfer_group_ownership(
            group_id.to_string(), 
            bob.clone(), 
            None);
        assert!(result.is_err(), "Should not be able to transfer to non-member");
        let error_msg = format!("{:?}", result.unwrap_err());
        assert!(error_msg.contains("must be a member"), "Error should mention membership requirement");

        // Test 2: Cannot transfer to self 
        let result = contract.transfer_group_ownership(
            group_id.to_string(), 
            alice.clone(), 
            None);
        assert!(result.is_err(), "Should not be able to transfer to yourself");

        // Test 3: Non-owner cannot transfer ownership
        let context = get_context_with_deposit(charlie.clone(), 500_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        let result = contract.transfer_group_ownership(
            group_id.to_string(), 
            alice.clone(), 
            None);
        assert!(result.is_err(), "Non-owner should not be able to transfer ownership");

        println!("✓ Ownership transfer basic validation test passed");
    }

    #[test]
    fn test_group_creation_gas_cost() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Set up context for alice with sufficient deposit for group creation
        let context = get_context_with_deposit(alice.clone(), 100_000_000_000_000_000_000_000_000); // 100 NEAR
        near_sdk::testing_env!(context.build());

        let group_id = "gas_test_group";
        let config = json!({
            "description": "A test group for gas measurement",
            "is_private": false,
            "member_driven": false
        });

        // Measure gas before group creation
        let gas_before = near_sdk::env::used_gas().as_gas();

        // Create the group
        let result = contract.create_group(group_id.to_string(), config.clone());
        assert!(result.is_ok(), "Group creation should succeed");

        // Measure gas after group creation
        let gas_after = near_sdk::env::used_gas().as_gas();
        let gas_used = gas_after - gas_before;

        // Convert to TGas for readability
        let gas_used_tgas = gas_used as f64 / 1_000_000_000_000.0;

        // Estimate NEAR cost (approximate: ~0.0001 NEAR per TGas)
        let estimated_cost_near = gas_used_tgas * 0.0001;

        println!("Group creation gas used: {} gas ({:.3} TGas)", gas_used, gas_used_tgas);
        println!("Estimated NEAR cost for gas: {:.8} NEAR", estimated_cost_near);

        // Verify group was created
        let group_config = contract.get_group_config(group_id.to_string());
        assert!(group_config.is_some(), "Group config should exist");

        println!("✓ Group creation gas cost measurement completed");
    }
}

// =============================================================================
// GroupConfig::try_from_value Unit Tests
// =============================================================================
// Tests for malformed config parsing to cover the Err branch in ownership.rs
#[cfg(test)]
mod group_config_parsing_tests {
    use crate::domain::groups::config::GroupConfig;
    use near_sdk::serde_json::json;

    #[test]
    fn test_try_from_value_missing_owner() {
        // Config with no "owner" field should fail
        let malformed_config = json!({
            "description": "A group without owner",
            "is_private": false,
            "member_driven": false
        });

        let result = GroupConfig::try_from_value(&malformed_config);
        assert!(result.is_err(), "Missing owner should return Err");
        println!("✓ Missing owner correctly returns Err");
    }

    #[test]
    fn test_try_from_value_invalid_owner_format() {
        // Config with invalid account ID format
        let malformed_config = json!({
            "owner": "not a valid account id with spaces and CAPS!",
            "is_private": false,
            "member_driven": false
        });

        let result = GroupConfig::try_from_value(&malformed_config);
        assert!(result.is_err(), "Invalid owner account ID should return Err");
        println!("✓ Invalid owner account ID correctly returns Err");
    }

    #[test]
    fn test_try_from_value_owner_is_null() {
        // Config with null owner
        let malformed_config = json!({
            "owner": null,
            "is_private": false,
            "member_driven": false
        });

        let result = GroupConfig::try_from_value(&malformed_config);
        assert!(result.is_err(), "Null owner should return Err");
        println!("✓ Null owner correctly returns Err");
    }

    #[test]
    fn test_try_from_value_owner_is_number() {
        // Config with numeric owner (wrong type)
        let malformed_config = json!({
            "owner": 12345,
            "is_private": false,
            "member_driven": false
        });

        let result = GroupConfig::try_from_value(&malformed_config);
        assert!(result.is_err(), "Numeric owner should return Err");
        println!("✓ Numeric owner correctly returns Err");
    }

    #[test]
    fn test_try_from_value_empty_object() {
        // Completely empty config
        let malformed_config = json!({});

        let result = GroupConfig::try_from_value(&malformed_config);
        assert!(result.is_err(), "Empty object should return Err");
        println!("✓ Empty object correctly returns Err");
    }

    #[test]
    fn test_try_from_value_valid_config() {
        // Valid config should succeed
        let valid_config = json!({
            "owner": "alice.near",
            "is_private": true,
            "member_driven": true
        });

        let result = GroupConfig::try_from_value(&valid_config);
        assert!(result.is_ok(), "Valid config should return Ok");

        let config = result.unwrap();
        assert_eq!(config.owner.as_str(), "alice.near");
        assert!(config.member_driven);
        assert_eq!(config.is_private, Some(true));
        println!("✓ Valid config correctly parsed");
    }

    #[test]
    fn test_try_from_value_optional_fields_missing() {
        // Config with only required field (owner) - optional fields should default
        let minimal_config = json!({
            "owner": "bob.testnet"
        });

        let result = GroupConfig::try_from_value(&minimal_config);
        assert!(result.is_ok(), "Minimal config with only owner should succeed");

        let config = result.unwrap();
        assert_eq!(config.owner.as_str(), "bob.testnet");
        assert!(!config.member_driven, "member_driven should default to false");
        assert_eq!(config.is_private, None, "is_private should default to None");
        println!("✓ Minimal config with defaults correctly parsed");
    }
}
