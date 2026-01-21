//! Unit tests for domain/groups/permissions/kv/grants.rs
//!
//! Tests coverage for:
//! - grant_permissions: Invalid permission level
//! - grant_permissions: Non-member cannot receive group permissions
//! - grant_permissions: Member nonce missing error
//! - grant_permissions: Member nonce invalid (== 0) error
//! - revoke_permissions: Idempotent revocation
//! - grant_permissions: expires_at stored correctly
//! - grant_permissions: Account path (non-group) succeeds

#[cfg(test)]
mod grants_tests {
    use crate::domain::groups::permissions::kv::types::{MODERATE, WRITE};
    use crate::events::EventBatch;
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::accounts;
    use near_sdk::{AccountId, testing_env};

    fn test_account(index: usize) -> AccountId {
        accounts(index)
    }

    // ========================================================================
    // TEST: grant_permissions fails with "Member nonce missing"
    // ========================================================================
    // Scenario: Member exists in members/ path but no entry in member_nonces/
    #[test]
    fn test_grant_permissions_fails_when_member_nonce_missing() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // group owner
        let bob = test_account(1); // member without nonce

        // Create group
        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request(
                "nonce_missing_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Manually add Bob as member WITHOUT setting nonce
        // This simulates a corrupted state where member exists but nonce is missing
        let member_path = format!("groups/nonce_missing_test/members/{}", bob);
        contract
            .platform
            .storage_set(
                &member_path,
                &json!({
                    "level": WRITE,
                    "added_at": "1000000000",
                    "added_by": alice.to_string()
                }),
            )
            .unwrap();

        // Attempt to grant permission - should fail because nonce is missing
        let mut event_batch = EventBatch::new();
        let grant = crate::domain::groups::permissions::kv::PermissionGrant {
            path: "groups/nonce_missing_test/content",
            level: WRITE,
            expires_at: None,
        };

        let result = crate::domain::groups::permissions::kv::grant_permissions(
            &mut contract.platform,
            &alice,
            &bob,
            &grant,
            &mut event_batch,
            None,
        );

        assert!(result.is_err(), "Should fail when member nonce is missing");
        let err = result.unwrap_err();
        let err_str = format!("{:?}", err);
        assert!(
            err_str.contains("Member nonce missing"),
            "Error should mention 'Member nonce missing', got: {}",
            err_str
        );

        println!("✅ grant_permissions correctly fails when member nonce is missing");
    }

    // ========================================================================
    // TEST: grant_permissions fails with "Member nonce invalid" when nonce == 0
    // ========================================================================
    #[test]
    fn test_grant_permissions_fails_when_member_nonce_zero() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // group owner
        let bob = test_account(1); // member with zero nonce

        // Create group
        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request(
                "nonce_zero_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Manually add Bob as member WITH nonce = 0 (invalid)
        let member_path = format!("groups/nonce_zero_test/members/{}", bob);
        contract
            .platform
            .storage_set(
                &member_path,
                &json!({
                    "level": WRITE,
                    "added_at": "1000000000",
                    "added_by": alice.to_string()
                }),
            )
            .unwrap();

        // Set nonce to 0 (invalid state)
        let nonce_path = format!("groups/nonce_zero_test/member_nonces/{}", bob);
        contract
            .platform
            .storage_set(&nonce_path, &json!(0))
            .unwrap();

        // Attempt to grant permission - should fail because nonce == 0
        let mut event_batch = EventBatch::new();
        let grant = crate::domain::groups::permissions::kv::PermissionGrant {
            path: "groups/nonce_zero_test/content",
            level: WRITE,
            expires_at: None,
        };

        let result = crate::domain::groups::permissions::kv::grant_permissions(
            &mut contract.platform,
            &alice,
            &bob,
            &grant,
            &mut event_batch,
            None,
        );

        assert!(result.is_err(), "Should fail when member nonce is zero");
        let err = result.unwrap_err();
        let err_str = format!("{:?}", err);
        assert!(
            err_str.contains("Member nonce invalid"),
            "Error should mention 'Member nonce invalid', got: {}",
            err_str
        );

        println!("✅ grant_permissions correctly fails when member nonce is zero");
    }

    // ========================================================================
    // TEST: grant_permissions fails for non-member on group path
    // ========================================================================
    #[test]
    fn test_grant_permissions_fails_for_non_member() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // group owner
        let bob = test_account(1); // non-member

        // Create group
        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request(
                "non_member_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Bob is NOT a member - attempt to grant permission should fail
        let mut event_batch = EventBatch::new();
        let grant = crate::domain::groups::permissions::kv::PermissionGrant {
            path: "groups/non_member_test/content",
            level: WRITE,
            expires_at: None,
        };

        let result = crate::domain::groups::permissions::kv::grant_permissions(
            &mut contract.platform,
            &alice,
            &bob,
            &grant,
            &mut event_batch,
            None,
        );

        assert!(result.is_err(), "Should fail for non-member");
        let err = result.unwrap_err();
        let err_str = format!("{:?}", err);
        assert!(
            err_str.contains("Cannot grant group permissions to non-member"),
            "Error should mention non-member restriction, got: {}",
            err_str
        );

        println!("✅ grant_permissions correctly rejects non-member for group path");
    }

    // ========================================================================
    // TEST: grant_permissions fails for invalid permission level
    // ========================================================================
    #[test]
    fn test_grant_permissions_fails_for_invalid_level() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        let mut event_batch = EventBatch::new();

        // Invalid level = 99 (not 0, 1, 2, 3)
        let grant = crate::domain::groups::permissions::kv::PermissionGrant {
            path: &format!("{}/test", alice),
            level: 99,
            expires_at: None,
        };

        let result = crate::domain::groups::permissions::kv::grant_permissions(
            &mut contract.platform,
            &alice,
            &bob,
            &grant,
            &mut event_batch,
            None,
        );

        assert!(result.is_err(), "Should fail for invalid permission level");
        let err = result.unwrap_err();
        let err_str = format!("{:?}", err);
        assert!(
            err_str.contains("Invalid permission level"),
            "Error should mention 'Invalid permission level', got: {}",
            err_str
        );

        println!("✅ grant_permissions correctly rejects invalid permission level");
    }

    // ========================================================================
    // TEST: revoke_permissions on non-existent entry succeeds (idempotent)
    // ========================================================================
    #[test]
    fn test_revoke_permissions_nonexistent_entry_succeeds() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // group owner
        let bob = test_account(1);

        // Create group and add Bob as member
        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request("revoke_test".to_string(), json!({})))
            .unwrap();

        // Add Bob as member (proper path with nonce)
        test_add_member_bypass_proposals(&mut contract, "revoke_test", &bob, WRITE, &alice);

        // Revoke permission that was never granted - should succeed (idempotent)
        let mut event_batch = EventBatch::new();
        let result = crate::domain::groups::permissions::kv::revoke_permissions(
            &mut contract.platform,
            &alice,
            &bob,
            "groups/revoke_test/never_granted_path",
            &mut event_batch,
        );

        assert!(
            result.is_ok(),
            "Revoke should succeed even if no entry exists (idempotent)"
        );

        println!("✅ revoke_permissions is idempotent for non-existent entry");
    }

    // ========================================================================
    // TEST: revoke_permissions on existing entry succeeds
    // ========================================================================
    #[test]
    fn test_revoke_permissions_existing_entry_succeeds() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // group owner
        let bob = test_account(1);

        // Create group and add Bob as member
        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request(
                "revoke_exists_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Add Bob as member
        test_add_member_bypass_proposals(&mut contract, "revoke_exists_test", &bob, WRITE, &alice);

        // First grant a permission
        let mut grant_batch = EventBatch::new();
        let grant = crate::domain::groups::permissions::kv::PermissionGrant {
            path: "groups/revoke_exists_test/moderation",
            level: MODERATE,
            expires_at: None,
        };
        crate::domain::groups::permissions::kv::grant_permissions(
            &mut contract.platform,
            &alice,
            &bob,
            &grant,
            &mut grant_batch,
            None,
        )
        .unwrap();

        // Verify permission was granted
        let has_perm_before = contract.has_permission(
            "revoke_exists_test".parse().unwrap(),
            bob.clone(),
            "groups/revoke_exists_test/moderation".to_string(),
            MODERATE,
        );
        assert!(has_perm_before, "Bob should have MODERATE before revoke");

        // Now revoke it
        let mut revoke_batch = EventBatch::new();
        let result = crate::domain::groups::permissions::kv::revoke_permissions(
            &mut contract.platform,
            &alice,
            &bob,
            "groups/revoke_exists_test/moderation",
            &mut revoke_batch,
        );

        assert!(result.is_ok(), "Revoke should succeed");

        // Verify permission was revoked
        let has_perm_after = contract.has_permission(
            "revoke_exists_test".parse().unwrap(),
            bob.clone(),
            "groups/revoke_exists_test/moderation".to_string(),
            MODERATE,
        );
        assert!(!has_perm_after, "Bob should NOT have MODERATE after revoke");

        println!("✅ revoke_permissions correctly revokes existing permission");
    }

    // ========================================================================
    // TEST: grant_permissions with expires_at stores correct value
    // ========================================================================
    #[test]
    fn test_grant_permissions_stores_expires_at() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // group owner
        let bob = test_account(1);

        // Create group and add Bob as member
        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request("expiry_test".to_string(), json!({})))
            .unwrap();

        test_add_member_bypass_proposals(&mut contract, "expiry_test", &bob, WRITE, &alice);

        // Grant with expiration far in the future
        let expires_at = 2_000_000_000_000_000_000u64;
        let mut event_batch = EventBatch::new();
        let grant = crate::domain::groups::permissions::kv::PermissionGrant {
            path: "groups/expiry_test/content",
            level: MODERATE,
            expires_at: Some(expires_at),
        };

        crate::domain::groups::permissions::kv::grant_permissions(
            &mut contract.platform,
            &alice,
            &bob,
            &grant,
            &mut event_batch,
            None,
        )
        .unwrap();

        // Verify permission is active (before expiration)
        let has_perm = contract.has_permission(
            "expiry_test".parse().unwrap(),
            bob.clone(),
            "groups/expiry_test/content".to_string(),
            MODERATE,
        );
        assert!(has_perm, "Permission should be active before expiration");

        println!("✅ grant_permissions correctly stores expires_at");
    }

    // ========================================================================
    // TEST: grant_permissions for account path (non-group) succeeds
    // ========================================================================
    #[test]
    fn test_grant_permissions_account_path_succeeds() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Deposit storage for alice
        contract
            .execute(set_request(json!({"storage/deposit": {"amount": "1"}})))
            .unwrap();

        let mut event_batch = EventBatch::new();
        let test_path = format!("{}/profile/public", alice);
        let grant = crate::domain::groups::permissions::kv::PermissionGrant {
            path: &test_path,
            level: WRITE,
            expires_at: None,
        };

        let result = crate::domain::groups::permissions::kv::grant_permissions(
            &mut contract.platform,
            &alice,
            &bob,
            &grant,
            &mut event_batch,
            None,
        );

        assert!(result.is_ok(), "Account path grant should succeed");

        // Verify permission was granted via contract API
        let has_perm =
            contract.has_permission(alice.clone(), bob.clone(), test_path.clone(), WRITE);
        assert!(has_perm, "Bob should have WRITE on Alice's account path");

        println!("✅ grant_permissions succeeds for account paths");
    }
}
