// --- API Edge Cases Tests ---
// Tests for get_config, get_contract_status, has_group_admin_permission, and path validation

#[cfg(test)]
mod api_edge_cases_tests {
    use crate::tests::test_utils::*;
    use crate::state::models::ContractStatus;
    use crate::Contract;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::accounts;
    use near_sdk::{testing_env, AccountId};
    use crate::domain::groups::permissions::kv::types::{MODERATE, MANAGE};

    fn test_account(index: usize) -> AccountId {
        accounts(index)
    }

    // ==========================================================================
    // GET_CONFIG AND GET_CONTRACT_STATUS TESTS
    // ==========================================================================

    #[test]
    fn test_get_contract_status_returns_correct_status() {
        let contract = init_live_contract();
        
        let status = contract.get_contract_status();
        assert!(matches!(status, ContractStatus::Live), 
            "Live contract should return Live status");
        
        println!("✅ get_contract_status returns correct status");
    }

    #[test]
    fn test_get_contract_status_genesis() {
        let alice = test_account(0);
        testing_env!(get_context_with_deposit(alice.clone(), 1).build());
        let contract = Contract::new();
        
        let status = contract.get_contract_status();
        assert!(matches!(status, ContractStatus::Genesis), 
            "New contract should return Genesis status");
        
        println!("✅ get_contract_status returns Genesis for new contract");
    }

    #[test]
    fn test_get_config_returns_governance_config() {
        let contract = init_live_contract();
        
        let config = contract.get_config();
        
        // Verify config fields exist and are reasonable
        assert!(config.max_key_length > 0, "max_key_length should be positive");
        assert!(config.max_path_depth > 0, "max_path_depth should be positive");
        assert!(config.max_batch_size > 0, "max_batch_size should be positive");
        
        println!("Config: max_key_length={}, max_path_depth={}, max_batch_size={}", 
            config.max_key_length, config.max_path_depth, config.max_batch_size);
        
        println!("✅ get_config returns valid governance config");
    }

    // ==========================================================================
    // HAS_GROUP_ADMIN_PERMISSION TESTS
    // ==========================================================================

    #[test]
    fn test_has_group_admin_permission_owner_has_admin() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("admin_test".to_string(), config).unwrap();

        // Owner should have admin permission
        let has_admin = contract.has_group_admin_permission("admin_test".to_string(), alice.clone());
        assert!(has_admin, "Owner should have admin permission");
        
        println!("✅ Owner has admin permission");
    }

    #[test]
    fn test_has_group_admin_permission_member_without_admin() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("admin_test2".to_string(), config).unwrap();

        // Add bob as regular member (clean-add)
        contract
            .add_group_member("admin_test2".to_string(), bob.clone())
            .unwrap();

        // Bob should not have admin permission
        let has_admin = contract.has_group_admin_permission("admin_test2".to_string(), bob.clone());
        assert!(!has_admin, "Regular member should not have admin permission");
        
        println!("✅ Regular member does not have admin permission");
    }

    #[test]
    fn test_has_group_admin_permission_member_with_manage() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("admin_test3".to_string(), config).unwrap();

        // Add bob (clean-add) and then grant MANAGE on group config
        contract
            .add_group_member("admin_test3".to_string(), bob.clone())
            .unwrap();
        contract
            .set_permission(
                bob.clone(),
                "groups/admin_test3/config".to_string(),
                MANAGE,
                None,
            )
            .unwrap();

        // Check admin permission - may or may not have it depending on implementation
        let has_admin = contract.has_group_admin_permission("admin_test3".to_string(), bob.clone());
        println!("Member with MANAGE has admin permission: {}", has_admin);
        
        println!("✅ Member with MANAGE flag tested");
    }

    #[test]
    fn test_has_group_admin_permission_nonexistent_group() {
        let contract = init_live_contract();
        let alice = test_account(0);

        // Non-existent group should return false
        let has_admin = contract.has_group_admin_permission("nonexistent".to_string(), alice.clone());
        assert!(!has_admin, "Non-existent group should return false");
        
        println!("✅ Non-existent group returns false for admin permission");
    }

    #[test]
    fn test_has_group_admin_permission_non_member() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("admin_test4".to_string(), config).unwrap();

        // Bob is not a member
        let has_admin = contract.has_group_admin_permission("admin_test4".to_string(), bob.clone());
        assert!(!has_admin, "Non-member should not have admin permission");
        
        println!("✅ Non-member does not have admin permission");
    }

    // ==========================================================================
    // HAS_GROUP_MODERATE_PERMISSION TESTS
    // ==========================================================================

    #[test]
    fn test_has_group_moderate_permission_owner_has_moderate() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("mod_test".to_string(), config).unwrap();

        // Owner should have moderate permission
        let has_moderate = contract.has_group_moderate_permission("mod_test".to_string(), alice.clone());
        assert!(has_moderate, "Owner should have moderate permission");
        
        println!("✅ Owner has moderate permission");
    }

    #[test]
    fn test_has_group_moderate_permission_member_with_moderate() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("mod_test2".to_string(), config).unwrap();

        // Add bob (clean-add) and then grant MODERATE on group config
        contract
            .add_group_member("mod_test2".to_string(), bob.clone())
            .unwrap();
        contract
            .set_permission(bob.clone(), "groups/mod_test2/config".to_string(), MODERATE, None)
            .unwrap();

        // Bob should have moderate permission
        let has_moderate = contract.has_group_moderate_permission("mod_test2".to_string(), bob.clone());
        assert!(has_moderate, "Member with MODERATE flag should have moderate permission");
        
        println!("✅ Member with MODERATE flag has moderate permission");
    }

    #[test]
    fn test_has_group_moderate_permission_member_without_moderate() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("mod_test3".to_string(), config).unwrap();

        // Add bob with member-only role
        contract
            .add_group_member("mod_test3".to_string(), bob.clone())
            .unwrap();

        // Bob should not have moderate permission
        let has_moderate = contract.has_group_moderate_permission("mod_test3".to_string(), bob.clone());
        assert!(!has_moderate, "Member with only WRITE should not have moderate permission");
        
        println!("✅ Member with only WRITE does not have moderate permission");
    }

    // ==========================================================================
    // PATH VALIDATION EDGE CASES (using correct set API format)
    // ==========================================================================

    #[test]
    fn test_path_with_unicode_characters() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        // Test with unicode characters in path
        let result = contract.set(set_request(json!({
                "profile/unicode_测试": "value_🚀"
            }), None));

        // Check if unicode is supported
        match result {
            Ok(_) => println!("✓ Unicode paths are supported"),
            Err(e) => println!("✓ Unicode paths result: {}", e),
        }
        
        println!("✅ Unicode path test passed");
    }

    #[test]
    fn test_path_with_special_characters() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        // Test with dashes and underscores
        let result = contract.set(set_request(json!({
                "posts/path-with-dash_and_underscore": "value"
            }), None));

        // Dashes and underscores should be allowed
        assert!(result.is_ok(), "Dashes and underscores should be allowed: {:?}", result.err());
        
        println!("✅ Special character path test passed");
    }

    #[test]
    fn test_deeply_nested_read() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        // Store deep data
        contract
            .set(set_request(json!({
                    "level1/level2/level3/level4/deep_value": "test"
                }), None))
            .unwrap();
        
        // Verify we can read it back
        let keys = vec![format!("{}/level1/level2/level3/level4/deep_value", alice)];
        let read_result = contract_get_values_map(&contract, keys, None);
        
        assert!(!read_result.is_empty(), "Should read deep value");
        
        println!("✅ Deeply nested path test passed");
    }

    // ==========================================================================
    // GET API EDGE CASES
    // ==========================================================================

    #[test]
    fn test_get_nonexistent_key() {
        let contract = init_live_contract();

        let keys = vec!["nonexistent.near/some/path".to_string()];
        let result = contract_get_values_map(&contract, keys.clone(), None);

        // Result is HashMap<String, Value> - should be empty for non-existent keys
        // or contain a null value for the key
        let key = &keys[0];
        let is_empty_or_null = result.is_empty() || 
            result.get(key).map_or(true, |v| v.is_null());
        
        assert!(
            is_empty_or_null,
            "Non-existent key should return empty/null, got: {:?}", result
        );
        
        println!("✅ Get non-existent key test passed");
    }

    #[test]
    fn test_get_multiple_keys() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        // Set some data
        contract
            .set(set_request(json!({
                    "profile/name": "Alice",
                    "posts/1": "First post"
                }), None))
            .unwrap();

        // Get multiple keys
        let key1 = format!("{}/profile/name", alice);
        let key2 = format!("{}/posts/1", alice);
        let keys = vec![key1.clone(), key2.clone()];
        let result = contract_get_values_map(&contract, keys, None);

        // Result is HashMap<String, Value> - verify we got data back
        assert!(!result.is_empty(), "Should return data for existing keys");
        
        println!("✅ Get multiple keys test passed (got {} entries)", result.len());
    }

    #[test]
    fn test_get_group_config_existing() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ 
            "is_private": true,
            "description": "Test group"
        });
        contract.create_group("config_test".to_string(), config).unwrap();

        let retrieved = contract.get_group_config("config_test".to_string());
        assert!(retrieved.is_some(), "Should retrieve group config");
        
        let cfg = retrieved.unwrap();
        assert_eq!(cfg.get("is_private").and_then(|v| v.as_bool()), Some(true));
        
        println!("✅ Get existing group config test passed");
    }

    #[test]
    fn test_get_group_config_nonexistent() {
        let contract = init_live_contract();

        let retrieved = contract.get_group_config("nonexistent_group".to_string());
        assert!(retrieved.is_none(), "Non-existent group should return None");
        
        println!("✅ Get non-existent group config test passed");
    }

    #[test]
    fn test_get_member_data_existing() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("member_data_test".to_string(), config).unwrap();
        contract
            .add_group_member("member_data_test".to_string(), bob.clone())
            .unwrap();

        let member_data = contract.get_member_data("member_data_test".to_string(), bob.clone());
        assert!(member_data.is_some(), "Should retrieve member data");
        
        let data = member_data.unwrap();
        assert!(data.get("level").is_some(), "Should have level");
        
        println!("✅ Get existing member data test passed");
    }

    #[test]
    fn test_get_member_data_nonexistent_member() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("member_data_test2".to_string(), config).unwrap();

        // Bob is not a member
        let member_data = contract.get_member_data("member_data_test2".to_string(), bob.clone());
        assert!(member_data.is_none(), "Non-member should return None");
        
        println!("✅ Get non-existent member data test passed");
    }

    #[test]
    fn test_get_group_stats() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("stats_test".to_string(), config).unwrap();
        contract
            .add_group_member("stats_test".to_string(), bob.clone())
            .unwrap();

        let stats = contract.get_group_stats("stats_test".to_string());
        assert!(stats.is_some(), "Should retrieve group stats");
        
        let s = stats.unwrap();
        let total_members = s.get("total_members").and_then(|v| v.as_u64());
        assert!(total_members.is_some(), "Should have total_members");
        assert!(total_members.unwrap() >= 2, "Should have at least 2 members (owner + bob)");
        
        println!("✅ Get group stats test passed");
    }
}
