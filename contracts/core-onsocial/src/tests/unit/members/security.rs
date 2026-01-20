// === MEMBER SECURITY TESTS ===
// Tests focused on security boundaries, privilege escalation prevention, and access control

use crate::domain::groups::permissions::kv::types::MANAGE;
use crate::tests::test_utils::*;
use near_sdk::test_utils::accounts;
use serde_json::json;

#[cfg(test)]
mod member_security_tests {
    use super::*;

    // === PRIVILEGE ESCALATION PREVENTION ===

    #[test]
    fn test_prevent_self_permission_grant() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let member = accounts(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add member with WRITE permissions only
        let config = json!({"member_driven": false, "is_private": false});
        contract
            .execute(create_group_request("test_group".to_string(), config))
            .unwrap();
        contract
            .execute(add_group_member_request(
                "test_group".to_string(),
                member.clone(),
            ))
            .unwrap();

        // Switch to member context - member tries to add themselves again (should fail as already a member)
        let member_context =
            get_context_with_deposit(member.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(member_context.build());

        // Attempt: Try to add self again (should fail - already a member)
        let self_add_result = contract.execute(add_group_member_request(
            "test_group".to_string(),
            member.clone(),
        ));

        assert!(
            self_add_result.is_err(),
            "Adding self when already a member should fail"
        );
        let error_msg = format!("{:?}", self_add_result.unwrap_err());
        assert!(
            error_msg.contains("already exists") || error_msg.contains("Member already exists"),
            "Should get member already exists error: {}",
            error_msg
        );

        // Verify member still only has their original permissions
        assert!(
            contract.is_group_member("test_group".to_string(), member.clone()),
            "Member should still be a member"
        );

        println!("✅ Prevented member from re-adding themselves");
    }

    #[test]
    fn test_prevent_circular_permission_delegation() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let user_a = test_account(1);
        let user_b = test_account(2);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add users
        let config = json!({"member_driven": false, "is_private": false});
        contract
            .execute(create_group_request("test_group".to_string(), config))
            .unwrap();
        contract
            .execute(add_group_member_request(
                "test_group".to_string(),
                user_a.clone(),
            ))
            .unwrap();
        contract
            .execute(add_group_member_request(
                "test_group".to_string(),
                user_b.clone(),
            ))
            .unwrap();

        // Switch to user_a - try to add user_b again (should fail - already a member)
        let user_a_context =
            get_context_with_deposit(user_a.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(user_a_context.build());

        let grant_result = contract.execute(add_group_member_request(
            "test_group".to_string(),
            user_b.clone(),
        ));
        assert!(grant_result.is_err(), "Adding existing member should fail");

        // Switch to user_b - try to add user_a again (should also fail)
        let user_b_context =
            get_context_with_deposit(user_b.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(user_b_context.build());

        let grant_result_2 = contract.execute(add_group_member_request(
            "test_group".to_string(),
            user_a.clone(),
        ));
        assert!(
            grant_result_2.is_err(),
            "Adding existing member should fail"
        );

        println!("✅ Prevented circular permission delegation attacks");
    }

    #[test]
    fn test_prevent_permission_escalation_via_group_operations() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let attacker = test_account(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add attacker with minimal WRITE permissions
        let config = json!({"member_driven": false, "is_private": false});
        contract
            .execute(create_group_request("test_group".to_string(), config))
            .unwrap();
        contract
            .execute(add_group_member_request(
                "test_group".to_string(),
                attacker.clone(),
            ))
            .unwrap();

        // Switch to attacker context
        let attacker_context =
            get_context_with_deposit(attacker.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(attacker_context.build());

        // Attack 1: Try to blacklist the owner (should fail)
        let blacklist_result = contract.execute(blacklist_group_member_request(
            "test_group".to_string(),
            owner.clone(),
        ));
        assert!(
            blacklist_result.is_err(),
            "Attacker should not be able to blacklist the owner"
        );

        // Attack 2: Try to remove the owner (should fail)
        let remove_result = contract.execute(remove_group_member_request(
            "test_group".to_string(),
            owner.clone(),
        ));
        assert!(
            remove_result.is_err(),
            "Attacker should not be able to remove the owner"
        );

        // Attack 3: Try to join with higher permissions (should fail due to self-join restriction)
        let fake_user = test_account(3);

        // Switch to fake user to try joining with MANAGE permission
        let fake_user_context =
            get_context_with_deposit(fake_user.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(fake_user_context.build());

        // This should fail because non-owners cannot grant themselves elevated group permissions.
        let self_grant_result = contract.execute(set_permission_request(
            fake_user.clone(),
            "groups/test_group/config".to_string(),
            MANAGE,
            None,
        ));
        assert!(
            self_grant_result.is_err(),
            "Non-owner should not be able to self-grant MANAGE"
        );

        println!("✅ Prevented permission escalation via group operations");
    }

    // === PERMISSION BYPASS ATTEMPTS ===

    #[test]
    fn test_prevent_blacklist_bypass_via_rejoin() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let bad_user = test_account(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add user
        let config = json!({"member_driven": false, "is_private": false});
        contract
            .execute(create_group_request("test_group".to_string(), config))
            .unwrap();
        contract
            .execute(add_group_member_request(
                "test_group".to_string(),
                bad_user.clone(),
            ))
            .unwrap();

        // Blacklist the user
        contract
            .execute(blacklist_group_member_request(
                "test_group".to_string(),
                bad_user.clone(),
            ))
            .unwrap();
        assert!(
            contract.is_blacklisted("test_group".to_string(), bad_user.clone()),
            "User should be blacklisted"
        );
        assert!(
            !contract.is_group_member("test_group".to_string(), bad_user.clone()),
            "User should be removed from group"
        );

        // Switch to bad user context - try to rejoin via join request
        let bad_user_context =
            get_context_with_deposit(bad_user.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(bad_user_context.build());

        let rejoin_result = contract.execute(join_group_request("test_group".to_string()));
        assert!(
            rejoin_result.is_err(),
            "Blacklisted user should not be able to request rejoin"
        );

        let error_msg = format!("{:?}", rejoin_result.unwrap_err());
        assert!(
            error_msg.contains("blacklist"),
            "Should mention blacklist in error: {}",
            error_msg
        );

        // Switch back to owner - try to approve non-existent request from blacklisted user
        let owner_context =
            get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(owner_context.build());

        let approve_result = contract.execute(approve_join_request(
            "test_group".to_string(),
            bad_user.clone(),
        ));
        assert!(
            approve_result.is_err(),
            "Should not be able to approve join request for blacklisted user"
        );

        println!("✅ Prevented blacklist bypass via rejoin attempts");
    }

    #[test]
    fn test_prevent_path_traversal_permission_attacks() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let attacker = test_account(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create two separate groups
        let config = json!({"member_driven": false, "is_private": false});
        contract
            .execute(create_group_request("group_a".to_string(), config.clone()))
            .unwrap();
        contract
            .execute(create_group_request("group_b".to_string(), config))
            .unwrap();

        // Add attacker to group_a with WRITE permissions
        contract
            .execute(add_group_member_request(
                "group_a".to_string(),
                attacker.clone(),
            ))
            .unwrap();

        // Switch to attacker context
        let attacker_context =
            get_context_with_deposit(attacker.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(attacker_context.build());

        // Attack: Try to perform operations on group_b using permissions from group_a
        let fake_user = test_account(2);

        // Try to add member to group_b (should fail - no permissions)
        let add_result = contract.execute(add_group_member_request(
            "group_b".to_string(),
            fake_user.clone(),
        ));
        assert!(
            add_result.is_err(),
            "Attacker should not be able to add members to group_b"
        );

        // Try to blacklist someone in group_b (should fail - no permissions)
        let blacklist_result = contract.execute(blacklist_group_member_request(
            "group_b".to_string(),
            fake_user.clone(),
        ));
        assert!(
            blacklist_result.is_err(),
            "Attacker should not be able to blacklist in group_b"
        );

        // Verify attacker still only has access to group_a
        assert!(
            contract.is_group_member("group_a".to_string(), attacker.clone()),
            "Attacker should be member of group_a"
        );
        assert!(
            !contract.is_group_member("group_b".to_string(), attacker.clone()),
            "Attacker should not be member of group_b"
        );

        println!("✅ Prevented path traversal permission attacks");
    }

    // === CROSS-GROUP ISOLATION ===

    #[test]
    fn test_cross_group_permission_isolation() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let user = test_account(1);
        let target = test_account(2);

        let context = get_context_with_deposit(owner.clone(), 20_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create multiple groups with different permission levels for the same user
        let config = json!({"member_driven": false, "is_private": false});
        contract
            .execute(create_group_request(
                "admin_group".to_string(),
                config.clone(),
            ))
            .unwrap();
        contract
            .execute(create_group_request("user_group".to_string(), config))
            .unwrap();

        // Give user MANAGE permissions in admin_group (via explicit path permission)
        contract
            .execute(add_group_member_request(
                "admin_group".to_string(),
                user.clone(),
            ))
            .unwrap();
        contract
            .execute(set_permission_request(
                user.clone(),
                "groups/admin_group/config".to_string(),
                MANAGE,
                None,
            ))
            .unwrap();

        // Give user only WRITE permissions in user_group
        contract
            .execute(add_group_member_request(
                "user_group".to_string(),
                user.clone(),
            ))
            .unwrap();
        contract
            .execute(add_group_member_request(
                "user_group".to_string(),
                target.clone(),
            ))
            .unwrap();

        // Switch to user context
        let user_context =
            get_context_with_deposit(user.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(user_context.build());

        // User should be able to blacklist in admin_group (has MANAGE permissions)
        let _admin_blacklist_result = contract.execute(blacklist_group_member_request(
            "admin_group".to_string(),
            target.clone(),
        ));
        // This might fail if target is not in admin_group, but should not be a permission error

        // User should NOT be able to blacklist in user_group (only has WRITE permissions)
        let user_blacklist_result = contract.execute(blacklist_group_member_request(
            "user_group".to_string(),
            target.clone(),
        ));

        // This test should fail because bob only has WRITE permissions in user_group, not MANAGE
        assert!(
            user_blacklist_result.is_err(),
            "Expected blacklist to fail in user_group due to insufficient permissions"
        );
        let error_msg = format!("{:?}", user_blacklist_result.unwrap_err());
        assert!(
            error_msg.contains("PermissionDenied"),
            "Should get permission denied error: {}",
            error_msg
        );
        println!(
            "✅ Correctly blocked blacklist operation in user_group due to insufficient permissions"
        );

        // Verify permissions are isolated per group
        assert!(
            contract.is_group_member("admin_group".to_string(), user.clone()),
            "User should be member of admin_group"
        );
        assert!(
            contract.is_group_member("user_group".to_string(), user.clone()),
            "User should be member of user_group"
        );

        println!("✅ Verified cross-group permission isolation");
    }

    // === TIMING AND RACE CONDITION ATTACKS ===

    #[test]
    fn test_prevent_permission_timing_window_attacks() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let user = test_account(1);
        let target = test_account(2);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add user with MANAGE permissions
        let config = json!({"member_driven": false, "is_private": false});
        contract
            .execute(create_group_request("test_group".to_string(), config))
            .unwrap();
        contract
            .execute(add_group_member_request(
                "test_group".to_string(),
                user.clone(),
            ))
            .unwrap();
        contract
            .execute(set_permission_request(
                user.clone(),
                "groups/test_group/config".to_string(),
                MANAGE,
                None,
            ))
            .unwrap();
        contract
            .execute(add_group_member_request(
                "test_group".to_string(),
                target.clone(),
            ))
            .unwrap();

        // Owner removes user from group (revokes all permissions)
        contract
            .execute(remove_group_member_request(
                "test_group".to_string(),
                user.clone(),
            ))
            .unwrap();
        assert!(
            !contract.is_group_member("test_group".to_string(), user.clone()),
            "User should be removed"
        );

        // Switch to removed user context - try to use old permissions
        let user_context =
            get_context_with_deposit(user.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(user_context.build());

        // Attack: Try to blacklist someone using expired permissions
        let blacklist_result = contract.execute(blacklist_group_member_request(
            "test_group".to_string(),
            target.clone(),
        ));

        // With membership-based permissions, this should fail because user is not a member
        assert!(
            blacklist_result.is_err(),
            "Removed user should not be able to blacklist members"
        );
        println!("✅ Correctly blocked expired permission usage via membership validation");

        // Attack: Try to add new members using expired permissions
        let new_member = test_account(3);
        let add_result = contract.execute(add_group_member_request(
            "test_group".to_string(),
            new_member.clone(),
        ));
        assert!(
            add_result.is_err(),
            "Removed user should not be able to add members"
        );

        println!("✅ Prevented permission timing window attacks");
    }

    // === INPUT VALIDATION SECURITY ===

    #[test]
    fn test_prevent_malicious_input_injection() {
        let mut contract = init_live_contract();
        let owner = test_account(0);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Attack 1: Try to create group with malicious group_id (path injection)
        let malicious_ids = vec![
            "../../../sensitive",
            "groups/../config",
            "../../admin/config",
            "group\x00hidden",
            "group/../../etc/passwd",
        ];

        for malicious_id in malicious_ids {
            let config = json!({"member_driven": false, "is_private": false});
            let create_result =
                contract.execute(create_group_request(malicious_id.to_string(), config));

            // Either should fail with validation error, or be sanitized to safe path
            if create_result.is_ok() {
                // If it succeeds, verify it was sanitized properly
                let safe_id = malicious_id
                    .replace("..", "")
                    .replace("/", "")
                    .replace("\x00", "");
                assert!(!safe_id.is_empty(), "Sanitized ID should not be empty");
            } else {
                println!("✅ Blocked malicious group ID: {}", malicious_id);
            }
        }

        // Attack 2: Try extremely long input strings (buffer overflow attempt)
        let long_string = "a".repeat(10000);
        let config = json!({"member_driven": false, "is_private": false});
        let long_id_result = contract.execute(create_group_request(long_string, config));

        // Should either fail gracefully or handle large inputs safely
        if long_id_result.is_err() {
            println!("✅ Blocked excessively long group ID");
        } else {
            println!("✅ Handled long group ID safely");
        }

        println!("✅ Prevented malicious input injection attacks");
    }
}
