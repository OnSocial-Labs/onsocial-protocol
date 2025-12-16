// --- Ultra-Simple API Tests ---
#[cfg(test)]
mod ultra_simple_api_tests {
    use super::*;
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::{accounts, VMContextBuilder};

    #[test]
    fn test_ultra_simple_set_api() {
        let mut contract = init_live_contract();
        let alice = accounts(1);

        // Set up context for alice
        let context = get_context_with_deposit(alice.clone(), 1_000_000_000_000_000_000_000_000); // 1 NEAR
        near_sdk::testing_env!(context.build());

        // Test the ultra-simple API: set profile data
        let data = json!({
            "profile/name": "Alice",
            "profile/bio": "Developer",
            "posts/1": {"text": "Hello world!", "timestamp": 1234567890}
        });

        let result = contract.set(data, None, None);
        assert!(result.is_ok(), "Simple set operation should succeed");

        // Verify data was set
        let keys = vec!["alice.testnet/profile".to_string()];
        let retrieved = contract.get(keys, Some(alice.clone()), None, None);
        assert!(!retrieved.is_empty(), "Data should be retrievable");

        println!("✓ Ultra-simple set API test passed");
    }

    #[test]
    fn test_simple_storage_operations() {
        let mut contract = init_live_contract();
        let bob = accounts(2);

        // Set up context for bob
        let context = get_context_with_deposit(bob.clone(), 2_000_000_000_000_000_000_000_000); // 2 NEAR
        near_sdk::testing_env!(context.build());

        // Test storage deposit
        let deposit_data = json!({
            "storage/deposit": {"amount": "1000000000000000000000000"}  // 1 NEAR
        });

        let result = contract.set(deposit_data, None, None);
        assert!(result.is_ok(), "Storage deposit should succeed");

        // Verify storage balance
        let balance = contract.get_storage_balance(bob.clone());
        assert!(balance.is_some(), "Storage balance should exist");
        assert!(balance.unwrap().balance > 0, "Storage balance should be positive");

        // Test storage withdraw
        let withdraw_data = json!({
            "storage/withdraw": {"amount": "500000000000000000000000"}  // 0.5 NEAR
        });

        let result = contract.set(withdraw_data, None, None);
        assert!(result.is_ok(), "Storage withdraw should succeed");

        println!("✓ Simple storage operations test passed");
    }

    #[test]
    fn test_simple_permission_operations() {
        let mut contract = init_live_contract();
        let alice = accounts(1);
        let bob = accounts(2);

        // Set up context for alice
        let context = get_context(alice.clone());
        near_sdk::testing_env!(context.build());

        // Grant permission to bob
        let permission_data = json!({
            "permission/grant": {
                "grantee": bob.to_string(),
                "path": "alice.testnet/posts",
                "flags": 1
            }
        });

        let result = contract.set(permission_data, None, None);
        assert!(result.is_ok(), "Permission grant should succeed");

        // Verify permission was granted
        let has_perm = contract.has_permission(
            alice.clone(),
            bob.clone(),
            "alice.testnet/posts".to_string(),
            1
        );
        assert!(has_perm, "Bob should have permission on alice's posts");

        // Revoke permission
        let revoke_data = json!({
            "permission/revoke": {
                "grantee": bob.to_string(),
                "path": "alice.testnet/posts"
            }
        });

        let result = contract.set(revoke_data, None, None);
        assert!(result.is_ok(), "Permission revoke should succeed");

        // Verify permission was revoked
        let has_perm = contract.has_permission(
            alice.clone(),
            bob.clone(),
            "alice.testnet/posts".to_string(),
            1
        );
        assert!(!has_perm, "Bob should not have permission on alice's posts");

        println!("✓ Simple permission operations test passed");
    }

    #[test]
    fn test_mixed_operations() {
        let mut contract = init_live_contract();
        let charlie = accounts(3);

        // Set up context for charlie with deposit
        let context = get_context_with_deposit(charlie.clone(), 1_500_000_000_000_000_000_000_000); // 1.5 NEAR
        near_sdk::testing_env!(context.build());

        // Mix of all operation types in one call
        let mixed_data = json!({
            "storage/deposit": {"amount": "500000000000000000000000"},  // 0.5 NEAR
            "profile/name": "Charlie",
            "profile/status": "Online",
            "permission/grant": {
                "grantee": accounts(4).to_string(),
                "path": "charlie.testnet/friends",
                "flags": 1
            }
        });

        let result = contract.set(mixed_data, None, None);
        assert!(result.is_ok(), "Mixed operations should succeed");

        // Verify storage was deposited
        let balance = contract.get_storage_balance(charlie.clone());
        assert!(balance.is_some(), "Storage balance should exist");

        // Verify data was set
        let keys = vec!["charlie.testnet/profile".to_string()];
        let retrieved = contract.get(keys, Some(charlie.clone()), None, None);
        assert!(!retrieved.is_empty(), "Profile data should be retrievable");

        println!("✓ Mixed operations test passed");
    }
}