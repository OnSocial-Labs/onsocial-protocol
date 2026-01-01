#[cfg(test)]
mod test_get_api {
    use crate::tests::test_utils::*;
    use serde_json::json;

    #[test]
    fn test_get_with_empty_keys_returns_empty() {
        let contract = init_live_contract();
        let alice = test_account(0);

        let result = contract.get(vec![], Some(alice.clone()));

        assert!(result.is_empty(), "Empty keys should return empty list");
        println!("✓ Empty keys returns empty list");
    }

    #[test]
    fn test_get_relative_vs_full_paths() {
        let alice = test_account(0);
        let context = get_context_with_deposit(alice.clone(), 5_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());
        let mut contract = init_live_contract();

        // Write some data
        contract
            .set(set_request(
                json!({
            "profile/name": "Alice",
            "posts/1": {"text": "Hello world"}
        }),
                None,
            ))
            .unwrap();

        // Test 1: Full path (with account prefix)
        let full_keys = vec![
            format!("{}/profile/name", alice.as_str()),
            format!("{}/posts/1", alice.as_str())
        ];
        let full_result = contract_get_values_map(&contract, full_keys.clone(), None);
        
        println!("Full result: {:?}", full_result);
        assert_eq!(full_result.len(), 2, "Should retrieve both full path keys");
        assert_eq!(full_result.get(&format!("{}/profile/name", alice.as_str())), Some(&json!("Alice")));


        println!("✓ Full paths work correctly");
    }

    #[test]
    fn test_get_groups_config_path() {
        let alice = test_account(0);
        let context = get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());
        let mut contract = init_live_contract();

        // Create a group
        let config = json!({"member_driven": false, "is_private": true});
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Test: Retrieve group config using full path
        let keys = vec!["groups/testgroup/config".to_string()];
        let result = contract_get_values_map(&contract, keys, None);

        assert!(!result.is_empty(), "Should retrieve group config");
        let config_value = result.get("groups/testgroup/config").expect("Config should exist");
        assert!(config_value.get("member_driven").is_some(), "Config should have member_driven field");

        println!("✓ Groups config path retrieval works");
    }

    #[test]
    fn test_get_rejects_malformed_groups_paths() {
        let contract = init_live_contract();
        let alice = test_account(0);
        let context = get_context(alice);
        near_sdk::testing_env!(context.build());

        let invalid_keys = vec![
            "groups/".to_string(),
            "groups/testgroup".to_string(),
            "groups/testgroup/".to_string(),
            "groups//posts/1".to_string(),
        ];

        for key in invalid_keys {
            let view = contract.get_one(key.clone(), None);
            assert_eq!(view.requested_key, key);
            assert!(view.full_key.is_empty(), "full_key must be empty for invalid group path");
            assert!(view.value.is_none(), "value must be None for invalid group path");
            assert!(view.block_height.is_none(), "block_height must be None for invalid group path");
            assert!(!view.deleted, "deleted must be false for invalid group path");
        }

        println!("✓ Malformed groups paths rejected by get_one()");
    }

    #[test]
    fn test_get_basic() {
        let alice = test_account(0);
        let context = get_context_with_deposit(alice.clone(), 5_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());
        let mut contract = init_live_contract();

        // Write data (metadata is managed internally)
        contract
            .set(set_request(json!({ "profile/name": "Alice" }), None))
            .unwrap();

        // Test: Get works normally (metadata is no longer stored)
        let keys = vec![format!("{}/profile/name", alice.as_str())];
        let result = contract_get_values_map(&contract, keys.clone(), None);

        assert!(!result.is_empty(), "Should retrieve data with metadata flag");
        
        let entry = result.get(&format!("{}/profile/name", alice.as_str()))
            .expect("Entry should exist");

        assert_eq!(entry, &json!("Alice"));
        println!("✓ Basic get works correctly");
    }

    #[test]
    fn test_get_nonexistent_key() {
        let contract = init_live_contract();
        let alice = test_account(0);

        let keys = vec![format!("{}/nonexistent/path", alice.as_str())];
        let result = contract_get_values_map(&contract, keys, None);

        assert!(result.is_empty(), "Nonexistent key should return empty result");
        println!("✓ Nonexistent key returns empty");
    }

    #[test]
    fn test_get_multiple_keys_partial_exist() {
        let alice = test_account(0);
        let context = get_context_with_deposit(alice.clone(), 5_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());
        let mut contract = init_live_contract();

        // Write only one key
        contract
            .set(set_request(json!({ "profile/name": "Alice" }), None))
            .unwrap();

        // Request multiple keys where only one exists
        let keys = vec![
            format!("{}/profile/name", alice.as_str()),
            format!("{}/profile/bio", alice.as_str()),  // Doesn't exist
            format!("{}/posts/1", alice.as_str())  // Doesn't exist
        ];
        let result = contract_get_values_map(&contract, keys, None);

        assert_eq!(result.len(), 1, "Should only return existing keys");
        assert!(result.contains_key(&format!("{}/profile/name", alice.as_str())));
        assert!(!result.contains_key(&format!("{}/profile/bio", alice.as_str())));
        assert!(!result.contains_key(&format!("{}/posts/1", alice.as_str())));

        println!("✓ Partial key existence handled correctly");
    }

    #[test]
    fn test_get_cross_account_data() {
        let alice = test_account(0);
        let bob = test_account(1);
        
        let context_alice = get_context_with_deposit(alice.clone(), 5_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context_alice.build());
        let mut contract = init_live_contract();

        // Alice writes her data
        contract
            .set(set_request(json!({ "profile/name": "Alice" }), None))
            .unwrap();

        // Bob writes his data
        let context_bob = get_context_with_deposit(bob.clone(), 5_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context_bob.build());
        contract
            .set(set_request(json!({ "profile/name": "Bob" }), None))
            .unwrap();

        // Retrieve both accounts' data in one call
        let keys = vec![
            format!("{}/profile/name", alice.as_str()),
            format!("{}/profile/name", bob.as_str())
        ];
        let result = contract_get_values_map(&contract, keys, None);

        assert_eq!(result.len(), 2, "Should retrieve data from both accounts");
        assert_eq!(result.get(&format!("{}/profile/name", alice.as_str())), Some(&json!("Alice")));
        assert_eq!(result.get(&format!("{}/profile/name", bob.as_str())), Some(&json!("Bob")));

        println!("✓ Cross-account data retrieval works");
    }

    #[test]
    fn test_get_with_account_id_parameter() {
        let alice = test_account(0);
        let context = get_context_with_deposit(alice.clone(), 5_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());
        let mut contract = init_live_contract();

        contract
            .set(set_request(json!({
                    "profile/name": "Alice",
                    "posts/1": "Post 1"
                }), None))
            .unwrap();

        // Test: Using full paths (recommended approach)
        let keys_full = vec![
            format!("{}/profile/name", alice.as_str()),
            format!("{}/posts/1", alice.as_str())
        ];
        let result = contract_get_values_map(&contract, keys_full.clone(), None);

        assert_eq!(result.len(), 2, "Should retrieve with full paths");
        assert_eq!(
            result.get(&format!("{}/profile/name", alice.as_str())),
            Some(&json!("Alice"))
        );
        assert_eq!(
            result.get(&format!("{}/posts/1", alice.as_str())),
            Some(&json!("Post 1"))
        );

        println!("✓ get() works correctly with full paths");
    }

    #[test]
    fn test_blockchain_transparency_no_permission_checks() {
        let alice = test_account(0);
        let bob = test_account(1);
        
        let context_alice = get_context_with_deposit(alice.clone(), 5_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context_alice.build());
        let mut contract = init_live_contract();

        // Alice writes "private" data
        contract
            .set(set_request(json!({
                    "private/secrets": "Alice's secret data"
                }), None))
            .unwrap();

        // Bob tries to read Alice's "private" data
        let context_bob = get_context(bob.clone());
        near_sdk::testing_env!(context_bob.build());

        let keys = vec![format!("{}/private/secrets", alice.as_str())];
        let result = contract_get_values_map(&contract, keys, None);

        // Should succeed - blockchain transparency means all data is readable
        assert!(!result.is_empty(), "Bob should be able to read Alice's data (blockchain transparency)");
        assert_eq!(
            result.get(&format!("{}/private/secrets", alice.as_str())),
            Some(&json!("Alice's secret data"))
        );

        println!("✓ Blockchain transparency: all data publicly readable");
        println!("  Note: 'Private' groups control membership, not data visibility");
    }
}
