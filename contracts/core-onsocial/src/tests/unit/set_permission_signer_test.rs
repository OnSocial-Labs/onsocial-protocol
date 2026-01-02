// === SET_PERMISSION SIGNER SECURITY TEST ===
// Verify that set_permission() uses signer_account_id() not predecessor_account_id()
// This prevents intermediary contracts from granting permissions on behalf of users

use crate::tests::test_utils::*;
use crate::domain::groups::permissions::kv::WRITE;
use near_sdk::test_utils::accounts;
use near_sdk::testing_env;
use near_sdk::serde_json::json;

#[cfg(test)]
mod set_permission_signer_tests {
    use super::*;

    /// Test that set_permission uses signer (not predecessor) for permission granting
    /// This is the core security fix to prevent permission abuse via contracts
    #[test]
    fn test_set_permission_uses_signer_not_predecessor() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);
        let intermediary_contract = accounts(2);

        // Scenario: Alice calls through a contract to grant permission to Bob
        // The contract is the predecessor, but Alice is the signer
        // The permission should be granted BY Alice (signer), not by the contract (predecessor)
        
        let storage_deposit = calculate_test_deposit_for_operations(1, 300);
        let context = get_context_with_deposit(alice.clone(), storage_deposit)
            .signer_account_id(alice.clone())           // Alice signed the transaction
            .predecessor_account_id(intermediary_contract.clone())  // Contract made the call
            .build();

        testing_env!(context);

        // Create a storage balance for Alice.
        contract
            .set(set_request(
                json!({"storage/deposit": {"amount": storage_deposit.to_string()}}),
                Some(crate::SetOptions { refund_unused_deposit: true }),
            ))
            .unwrap();

        // Alice (via contract) grants permission to Bob on her own path
        let result = contract.set_permission(
            bob.clone(),
            format!("{}/profile", alice),
            WRITE,
            None
        );

        assert!(result.is_ok(), "Permission grant should succeed when signer owns the path");

        // Verify that the permission was granted by Alice (the signer), not by the contract
        let has_perm = contract.has_permission(
            alice.clone(),
            bob.clone(),
            format!("{}/profile", alice),
            WRITE
        );

        assert!(has_perm, "Bob should have write permission on alice's path");
    }

    /// Test that set_permission fails when signer doesn't own the path
    /// Even if called through a contract, only the path owner (as signer) can grant permissions
    #[test]
    fn test_set_permission_rejects_non_owner_signer() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);
        let charlie = accounts(2);

        // Bob (signer) tries to grant permission on Alice's path
        let context = get_context(bob.clone())
            .signer_account_id(bob.clone())
            .predecessor_account_id(bob.clone())
            .build();

        testing_env!(context);

        // Bob tries to grant Charlie permission on Alice's path
        let result = contract.set_permission(
            charlie.clone(),
            format!("{}/profile", alice),
            WRITE,
            None
        );

        assert!(result.is_err(), "Should fail when signer doesn't own the path");
    }

    /// Test direct wallet call (signer = predecessor)
    #[test]
    fn test_set_permission_direct_wallet_call() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        // Direct call: Alice signs and calls directly (no intermediary)
        let context = get_context_with_deposit(alice.clone(), 1_000_000_000_000_000_000_000_000)
            .signer_account_id(alice.clone())
            .predecessor_account_id(alice.clone())  // Same as signer for direct calls
            .build();

        testing_env!(context);

        // Create a storage balance for Alice.
        contract
            .set(set_request(
                json!({"storage/deposit": {"amount": "1"}}),
                None,
            ))
            .unwrap();

        // Alice grants permission to Bob
        let result = contract.set_permission(
            bob.clone(),
            format!("{}/posts", alice),
            WRITE,
            None
        );

        assert!(result.is_ok(), "Direct wallet calls should work");

        let has_perm = contract.has_permission(
            alice.clone(),
            bob.clone(),
            format!("{}/posts", alice),
            WRITE
        );

        assert!(has_perm, "Permission should be granted");
    }

    /// Test that malicious contract cannot grant permissions when called by different user
    #[test]
    fn test_malicious_contract_cannot_grant_permissions_for_others() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);
        let malicious_contract = accounts(2);
        let charlie = accounts(3);

        // Step 1: Alice grants permission to the malicious contract
        let context = get_context(alice.clone())
            .signer_account_id(alice.clone())
            .predecessor_account_id(alice.clone())
            .build();
        testing_env!(context);

        let _ = contract.set_permission(
            malicious_contract.clone(),
            format!("{}/apps/malicious", alice),
            WRITE,
            None
        );

        // Step 2: Bob calls the malicious contract, which tries to grant Charlie permission on Alice's path
        let context = get_context(bob.clone())
            .signer_account_id(bob.clone())              // Bob signed
            .predecessor_account_id(malicious_contract.clone())  // Contract called
            .build();
        testing_env!(context);

        // The contract tries to grant Charlie permission on Alice's path
        // This should FAIL because the signer (Bob) doesn't own Alice's path
        let result = contract.set_permission(
            charlie.clone(),
            format!("{}/apps/malicious", alice),
            WRITE,
            None
        );

        assert!(result.is_err(), "Malicious contract should not be able to grant permissions when called by non-owner");

        // Verify Charlie doesn't have permission
        let has_perm = contract.has_permission(
            alice.clone(),
            charlie.clone(),
            format!("{}/apps/malicious", alice),
            WRITE
        );

        assert!(!has_perm, "Charlie should not have permission - attack prevented!");
    }
}
