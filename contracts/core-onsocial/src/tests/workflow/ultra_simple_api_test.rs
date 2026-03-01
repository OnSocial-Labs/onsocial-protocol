// --- Ultra-Simple API Tests ---
// Tests for the unified execute() API with various operation types
#[cfg(test)]
mod ultra_simple_api_tests {
    use crate::domain::groups::permissions::kv::types::{NONE, WRITE};
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::accounts;

    #[test]
    fn test_ultra_simple_set_api() {
        let mut contract = init_live_contract();
        let alice = accounts(1);

        // Set up context for alice with deposit
        let context = get_context_with_deposit(alice.clone(), 1_000_000_000_000_000_000_000_000); // 1 NEAR
        near_sdk::testing_env!(context.build());

        // Test the ultra-simple API: set profile data using the Set action
        let data = json!({
            "profile/name": "Alice",
            "profile/bio": "Developer",
            "posts/1": {"text": "Hello world!", "timestamp": 1234567890}
        });

        let result = contract.execute(set_request(data));
        assert!(
            result.is_ok(),
            "Simple set operation should succeed: {:?}",
            result
        );

        // Verify data was set by reading it back
        let keys = vec![
            format!("{}/profile/name", alice),
            format!("{}/profile/bio", alice),
        ];
        let retrieved = contract.get(keys, Some(alice.clone()));
        assert_eq!(retrieved.len(), 2, "Should retrieve 2 entries");
        assert!(
            retrieved.iter().any(|e| e.value == Some(json!("Alice"))),
            "Should find Alice name"
        );
        assert!(
            retrieved
                .iter()
                .any(|e| e.value == Some(json!("Developer"))),
            "Should find Developer bio"
        );

        println!("✓ Ultra-simple set API test passed");
    }

    #[test]
    fn test_simple_storage_operations() {
        let mut contract = init_live_contract();
        let bob = accounts(2);

        // Set up context for bob with deposit
        let context = get_context_with_deposit(bob.clone(), 2_000_000_000_000_000_000_000_000); // 2 NEAR
        near_sdk::testing_env!(context.build());

        // Test storage deposit using the storage/deposit key
        let deposit_data = json!({
            "storage/deposit": {"amount": "1000000000000000000000000"}  // 1 NEAR
        });

        let result = contract.execute(set_request(deposit_data));
        assert!(
            result.is_ok(),
            "Storage deposit should succeed: {:?}",
            result
        );

        // Verify storage balance
        let balance = contract.get_storage_balance(bob.clone());
        assert!(balance.is_some(), "Storage balance should exist");
        let balance_val = balance.unwrap();
        assert!(
            balance_val.balance.0 > 0,
            "Storage balance should be positive"
        );

        // Test storage withdraw using the storage/withdraw key
        let withdraw_data = json!({
            "storage/withdraw": {"amount": "500000000000000000000000"}  // 0.5 NEAR
        });

        let result = contract.execute(set_request(withdraw_data));
        assert!(
            result.is_ok(),
            "Storage withdraw should succeed: {:?}",
            result
        );

        println!("✓ Simple storage operations test passed");
    }

    #[test]
    fn test_simple_permission_operations() {
        let mut contract = init_live_contract();
        let alice = accounts(1);
        let bob = accounts(2);

        // Set up context for alice with deposit
        let context = get_context_with_deposit(alice.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Grant WRITE permission to bob using the SetPermission action
        let result = contract.execute(set_permission_request(
            bob.clone(),
            format!("{}/posts", alice), // Path format: owner/subpath
            WRITE,                      // Permission level
            None,                       // No expiration
        ));
        assert!(
            result.is_ok(),
            "Permission grant should succeed: {:?}",
            result
        );

        // Verify permission was granted
        let has_perm = contract.has_permission(
            alice.clone(),
            bob.clone(),
            format!("{}/posts", alice),
            WRITE,
        );
        assert!(
            has_perm,
            "Bob should have WRITE permission on alice's posts"
        );

        // Revoke permission by setting level to NONE
        let result = contract.execute(set_permission_request(
            bob.clone(),
            format!("{}/posts", alice),
            NONE, // Revoke
            None,
        ));
        assert!(
            result.is_ok(),
            "Permission revoke should succeed: {:?}",
            result
        );

        // Verify permission was revoked
        let has_perm = contract.has_permission(
            alice.clone(),
            bob.clone(),
            format!("{}/posts", alice),
            WRITE,
        );
        assert!(
            !has_perm,
            "Bob should not have permission on alice's posts after revoke"
        );

        println!("✓ Simple permission operations test passed");
    }

    #[test]
    fn test_mixed_operations() {
        let mut contract = init_live_contract();
        let charlie = accounts(3);
        let dave = accounts(4);

        // Set up context for charlie with deposit
        let context = get_context_with_deposit(charlie.clone(), 2_000_000_000_000_000_000_000_000); // 2 NEAR
        near_sdk::testing_env!(context.build());

        // Step 1: Storage deposit
        let deposit_result = contract.execute(set_request(json!({
            "storage/deposit": {"amount": "500000000000000000000000"}  // 0.5 NEAR
        })));
        assert!(deposit_result.is_ok(), "Storage deposit should succeed");

        // Step 2: Set profile data
        let data_result = contract.execute(set_request(json!({
            "profile/name": "Charlie",
            "profile/status": "Online"
        })));
        assert!(data_result.is_ok(), "Profile data set should succeed");

        // Step 3: Grant WRITE permission to dave
        let perm_result = contract.execute(set_permission_request(
            dave.clone(),
            format!("{}/friends", charlie),
            WRITE,
            None,
        ));
        assert!(perm_result.is_ok(), "Permission grant should succeed");

        // Verify storage was deposited
        let balance = contract.get_storage_balance(charlie.clone());
        assert!(balance.is_some(), "Storage balance should exist");

        // Verify data was set
        let keys = vec![format!("{}/profile/name", charlie)];
        let retrieved = contract.get(keys, Some(charlie.clone()));
        assert_eq!(retrieved.len(), 1, "Should retrieve profile name");
        assert_eq!(
            retrieved[0].value,
            Some(json!("Charlie")),
            "Profile name should be Charlie"
        );

        // Verify permission was granted
        let has_perm = contract.has_permission(
            charlie.clone(),
            dave.clone(),
            format!("{}/friends", charlie),
            WRITE,
        );
        assert!(has_perm, "Dave should have permission on charlie's friends");

        println!("✓ Mixed operations test passed");
    }
}
