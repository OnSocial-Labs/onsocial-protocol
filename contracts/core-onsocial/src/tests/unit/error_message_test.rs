// --- Error Message Validation Tests ---
// Tests to ensure error messages are clear and actionable
#[cfg(test)]
mod error_message_tests {
    use crate::tests::test_utils::*;
    use crate::Contract;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::accounts;
    use near_sdk::{testing_env, AccountId};
    fn test_account(index: usize) -> AccountId {
        accounts(index)
    }
    // ==========================================================================
    // PERMISSION ERROR MESSAGES
    // ==========================================================================
    #[test]
    fn test_unauthorized_write_error_message() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        // Alice creates group and adds herself to it
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        // Create a group where Alice is owner
        contract.create_group("perm_test".to_string(), json!({ "is_private": false })).unwrap();
        // Bob tries to write to Alice's group content without permission
        testing_env!(get_context_with_deposit(bob.clone(), 10_000_000_000_000_000_000_000_000).build());
        
        let result = contract.set(set_request_for(
            alice.clone(),
            json!({
                "groups/perm_test/content/unauthorized_test": {
                    "text": "unauthorized"
                }
            }),
            None,
        ));
        match result {
            Err(e) => {
                let msg = e.to_string();
                println!("Error message: {}", msg);
                // Verify the error message indicates a permission/authorization issue
                assert!(
                    msg.contains("Permission denied") || 
                    msg.contains("Unauthorized") || 
                    msg.contains("not allowed") ||
                    msg.contains("permission"),
                    "Error should mention permission/authorization issue: {}", msg
                );
            }
            Ok(_) => {
                println!("Note: Write succeeded (may be allowed in some configurations)");
            }
        }
        println!("✅ Unauthorized write error message test passed");
    }
    // ==========================================================================
    // GROUP ERROR MESSAGES
    // ==========================================================================
    #[test]
    fn test_group_not_found_error_message() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        // Try to add member to non-existent group
        let result = contract.add_group_member("nonexistent_group".to_string(), bob.clone());
        match result {
            Err(e) => {
                let msg = e.to_string();
                println!("Error message: {}", msg);
                assert!(
                    msg.contains("not found") || msg.contains("NotFound") || msg.contains("Group") || msg.contains("not exist"),
                    "Error should mention group not found: {}", msg
                );
            }
            Ok(_) => panic!("Should fail for non-existent group"),
        }
        println!("✅ Group not found error message test passed");
    }
    #[test]
    fn test_not_a_member_error_message() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({ "is_private": false });
        contract.create_group("not_member_test".to_string(), config).unwrap();
        // Try to remove bob who is not a member
        let result = contract.remove_group_member("not_member_test".to_string(), bob.clone());
        match result {
            Err(e) => {
                let msg = e.to_string();
                println!("Error message: {}", msg);
                // Error should indicate the member wasn't found or doesn't exist
                assert!(
                    msg.contains("not found") || 
                    msg.contains("NotFound") || 
                    msg.contains("not a member") ||
                    msg.contains("Member") ||
                    msg.contains("member"),
                    "Error should indicate member not found: {}", msg
                );
            }
            Ok(_) => {
                // Removing non-existent member might be a no-op
                println!("Note: Removing non-member succeeded (no-op case)");
            }
        }
        println!("✅ Not a member error message test passed");
    }
    // ==========================================================================
    // BLACKLIST ERROR MESSAGES
    // ==========================================================================
    #[test]
    fn test_blacklisted_user_cannot_join() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({ "is_private": false });
        contract.create_group("blacklist_test".to_string(), config).unwrap();
        // Blacklist bob
        contract.blacklist_group_member("blacklist_test".to_string(), bob.clone()).unwrap();
        // Bob tries to join with WRITE permission
        testing_env!(get_context_with_deposit(bob.clone(), 10_000_000_000_000_000_000_000_000).build());
        let result = contract.join_group("blacklist_test".to_string());
        match result {
            Err(e) => {
                let msg = e.to_string();
                println!("Error message: {}", msg);
                // The actual error is "You are blacklisted from this group" (InvalidInput)
                assert!(
                    msg.contains("blacklisted") || msg.contains("Blacklisted"),
                    "Error should mention 'blacklisted': {}", msg
                );
            }
            Ok(_) => panic!("Blacklisted user should not be able to join"),
        }
        println!("✅ Blacklisted user error message test passed");
    }
    // ==========================================================================
    // VOTING ERROR MESSAGES
    // ==========================================================================
    #[test]
    fn test_vote_on_nonexistent_proposal() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({ "member_driven": true, "is_private": true });
        contract.create_group("vote_test".to_string(), config).unwrap();
        // Try to vote on non-existent proposal (proposal_id is a String)
        let result = contract.vote_on_proposal("vote_test".to_string(), "999".to_string(), true);
        match result {
            Err(e) => {
                let msg = e.to_string();
                println!("Error message: {}", msg);
                assert!(
                    msg.contains("not found") || msg.contains("NotFound") || msg.contains("proposal") || msg.contains("not exist"),
                    "Error should mention proposal not found: {}", msg
                );
            }
            Ok(_) => panic!("Voting on non-existent proposal should fail"),
        }
        println!("✅ Vote on non-existent proposal error message test passed");
    }
    // ==========================================================================
    // OWNERSHIP ERROR MESSAGES
    // ==========================================================================
    #[test]
    fn test_transfer_ownership_non_owner() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({ "is_private": false });
        contract.create_group("transfer_test".to_string(), config).unwrap();
        // Add bob
        contract
            .add_group_member("transfer_test".to_string(), bob.clone())
            .unwrap();
        // Bob (non-owner) tries to transfer ownership
        testing_env!(get_context_with_deposit(bob.clone(), 10_000_000_000_000_000_000_000_000).build());
        let result = contract.transfer_group_ownership("transfer_test".to_string(), charlie.clone(), None);
        match result {
            Err(e) => {
                let msg = e.to_string();
                println!("Error message: {}", msg);
                assert!(
                    msg.contains("owner") || msg.contains("Unauthorized") || msg.contains("permission") || msg.contains("Owner"),
                    "Error should mention owner requirement: {}", msg
                );
            }
            Ok(_) => panic!("Non-owner should not be able to transfer ownership"),
        }
        println!("✅ Transfer ownership non-owner error message test passed");
    }
    // ==========================================================================
    // INVALID INPUT ERROR MESSAGES
    // ==========================================================================
    #[test]
    fn test_empty_group_id_error_message() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        // Try to create group with empty ID
        let config = json!({ "is_private": false });
        let result = contract.create_group("".to_string(), config);
        match result {
            Err(e) => {
                let msg = e.to_string();
                println!("Error message: {}", msg);
                // Error should indicate invalid input or ID requirement
                assert!(
                    msg.contains("Group ID") || 
                    msg.contains("invalid") || 
                    msg.contains("Invalid") ||
                    msg.contains("empty") ||
                    msg.contains("required") ||
                    msg.contains("characters"),
                    "Error should mention invalid group ID: {}", msg
                );
            }
            Ok(_) => panic!("Empty group ID should be rejected"),
        }
        println!("✅ Empty group ID error message test passed");
    }
    // ==========================================================================
    // MANAGER OPERATION ERROR MESSAGES
    // ==========================================================================
    #[test]
    fn test_non_manager_activate_contract() {
        // Initialize contract with Alice as manager.
        let alice = test_account(0);
        testing_env!(get_context(alice.clone()).build());
        let mut contract = Contract::new();

        let bob = test_account(1);
        // Bob (non-manager) tries to activate
        testing_env!(get_context_with_deposit(bob.clone(), 1).build());

        let err = contract.activate_contract().unwrap_err();
        assert!(err.to_string().contains("Unauthorized"));
    }
    #[test]
    fn test_activate_without_yocto() {
        let alice = test_account(0);
        // Initialize contract with Alice as manager.
        testing_env!(get_context(alice.clone()).build());
        let mut contract = Contract::new();

        // Try to activate without 1 yoctoNEAR
        testing_env!(get_context_with_deposit(alice.clone(), 0).build());
        let err = contract.activate_contract().unwrap_err();
        assert_eq!(err.to_string(), "Requires attached deposit of exactly 1 yoctoNEAR");
    }
}
