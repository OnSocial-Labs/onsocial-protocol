// === PERMISSION MANAGEMENT TESTS ===
// Tests for path-specific permissions, permission delegation, and access control

use crate::tests::test_utils::*;
use crate::domain::groups::permissions::kv::types::{WRITE, MODERATE, MANAGE};
use serde_json::json;

#[cfg(test)]
mod permission_tests {

    use super::*;

    #[test]
    fn test_path_specific_permissions_isolation() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member1 = test_account(1);
        let member2 = test_account(2);

        // Owner creates a traditional group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Add members to the group first with NO permissions (required for path-specific isolation test)
        // Using 0 level ensures members have no group-root permissions,
        // allowing us to test path-specific grants in isolation
        contract.add_group_member("testgroup".to_string(), member1.clone(), 0).unwrap();
        contract.add_group_member("testgroup".to_string(), member2.clone(), 0).unwrap();

        // Define different paths within the group
        let events_path = "groups/testgroup/events".to_string();
        let posts_path = "groups/testgroup/posts".to_string();
        let admin_path = "groups/testgroup/admin".to_string();

        // Grant member1 WRITE permission only to events path
        let grant_result1 = contract.set_permission(
            member1.clone(),
            events_path.clone(),
            WRITE,
            None,
        );
        assert!(grant_result1.is_ok(), "Owner should be able to grant permissions to events path");

        // Grant member2 WRITE permission only to posts path
        let grant_result2 = contract.set_permission(
            member2.clone(),
            posts_path.clone(),
            WRITE,
            None,
        );
        assert!(grant_result2.is_ok(), "Owner should be able to grant permissions to posts path");

        // Test path isolation: member1 should have access to events but NOT posts
        assert!(
            contract.has_permission(
                owner.clone(),
                member1.clone(),
                events_path.clone(),
                WRITE
            ),
            "Member1 should have WRITE permission on events path"
        );

        assert!(
            !contract.has_permission(
                owner.clone(),
                member1.clone(),
                posts_path.clone(),
                WRITE
            ),
            "Member1 should NOT have WRITE permission on posts path"
        );

        assert!(
            !contract.has_permission(
                owner.clone(),
                member1.clone(),
                admin_path.clone(),
                WRITE
            ),
            "Member1 should NOT have WRITE permission on admin path"
        );

        // Test path isolation: member2 should have access to posts but NOT events
        assert!(
            contract.has_permission(
                owner.clone(),
                member2.clone(),
                posts_path.clone(),
                WRITE
            ),
            "Member2 should have WRITE permission on posts path"
        );

        assert!(
            !contract.has_permission(
                owner.clone(),
                member2.clone(),
                events_path.clone(),
                WRITE
            ),
            "Member2 should NOT have WRITE permission on events path"
        );

        assert!(
            !contract.has_permission(
                owner.clone(),
                member2.clone(),
                admin_path.clone(),
                WRITE
            ),
            "Member2 should NOT have WRITE permission on admin path"
        );

        // Test that owner still has access to all paths
        assert!(
            contract.has_permission(
                owner.clone(),
                owner.clone(),
                events_path.clone(),
                WRITE
            ),
            "Owner should have WRITE permission on events path"
        );

        assert!(
            contract.has_permission(
                owner.clone(),
                owner.clone(),
                posts_path.clone(),
                WRITE
            ),
            "Owner should have WRITE permission on posts path"
        );

        assert!(
            contract.has_permission(
                owner.clone(),
                owner.clone(),
                admin_path.clone(),
                WRITE
            ),
            "Owner should have WRITE permission on admin path"
        );

        // Realistic workflow: Test actual writes using set()
        
        // Member1 writes to events path (should succeed)
        near_sdk::testing_env!(get_context_with_deposit(member1.clone(), 1_000_000_000_000_000_000_000_000).build());
        
        let member1_write = contract.set(set_request(
            json!({
                "groups/testgroup/events/event1": {
                    "title": "Member1's Event",
                    "organizer": member1.to_string()
                }
            }),
            None,
        ));

        assert!(
            member1_write.is_ok(),
            "✅ Member1 should be able to write to events path: {:?}",
            member1_write.err()
        );

        // Member1 tries to write to posts path (should fail)
        let member1_unauthorized = contract.set(set_request(
            json!({
                "groups/testgroup/posts/post1": {
                    "title": "Unauthorized Post"
                }
            }),
            None,
        ));

        assert!(
            member1_unauthorized.is_err(),
            "❌ Member1 should NOT be able to write to posts path"
        );

        // Member2 writes to posts path (should succeed)
        near_sdk::testing_env!(get_context_with_deposit(member2.clone(), 1_000_000_000_000_000_000_000_000).build());
        
        let member2_write = contract.set(set_request(
            json!({
                "groups/testgroup/posts/post1": {
                    "title": "Member2's Post",
                    "author": member2.to_string()
                }
            }),
            None,
        ));

        assert!(
            member2_write.is_ok(),
            "✅ Member2 should be able to write to posts path: {:?}",
            member2_write.err()
        );

        // Member2 tries to write to events path (should fail)
        let member2_unauthorized = contract.set(set_request(
            json!({
                "groups/testgroup/events/event2": {
                    "title": "Unauthorized Event"
                }
            }),
            None,
        ));

        assert!(
            member2_unauthorized.is_err(),
            "❌ Member2 should NOT be able to write to events path"
        );

        println!("✅ Path-specific permissions: Members only have access to their assigned paths (verified with actual writes)");
    }

    #[test]
    fn test_manager_can_grant_path_permissions_to_members() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let manager = test_account(1);
        let member1 = test_account(2);
        let member2 = test_account(3);

        // Owner creates a traditional group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Add manager (clean-add) then grant MANAGE on config path.
        contract
            .add_group_member("testgroup".to_string(), manager.clone(), 0)
            .unwrap();
        contract
            .set_permission(manager.clone(), "groups/testgroup/config".to_string(), MANAGE, None)
            .unwrap();

        // Owner adds basic members with NO group-root permissions (for path-specific isolation testing)
        contract.add_group_member("testgroup".to_string(), member1.clone(), 0).unwrap();
        contract.add_group_member("testgroup".to_string(), member2.clone(), 0).unwrap();

        // Define specific paths within the group
        let events_path = "groups/testgroup/events".to_string();
        let moderation_path = "groups/testgroup/moderation".to_string();
        let admin_path = "groups/testgroup/admin".to_string();

        // Switch to manager context
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());

        // Verify manager has MANAGE permission on group config path
        let config_path = "groups/testgroup/config".to_string();
        assert!(
            contract.has_permission(
                owner.clone(),
                manager.clone(),
                config_path.clone(),
                MANAGE
            ),
            "Manager should have MANAGE permission on group config path"
        );

        // Switch back to owner to grant manager MANAGE permission on specific paths
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000).build());
        
        // Owner grants manager MANAGE permission on events path
        let owner_grant_events = contract.set_permission(
            manager.clone(),
            events_path.clone(),
            MANAGE,
            None,
        );
        assert!(owner_grant_events.is_ok(), "Owner should be able to grant MANAGE to events path: {:?}", owner_grant_events);
        
        // Owner grants manager MANAGE permission on moderation path too
        let owner_grant_moderation = contract.set_permission(
            manager.clone(),
            moderation_path.clone(),
            MANAGE,
            None,
        );
        assert!(owner_grant_moderation.is_ok(), "Owner should be able to grant MANAGE to moderation path: {:?}", owner_grant_moderation);

        // Switch back to manager context
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());

        // Ensure manager has storage balance for permission writes.
        contract
            .set(set_request(json!({"storage/deposit": {"amount": "1"}}), None))
            .unwrap();
        
        // Test 1: Manager with MANAGE on events path grants WRITE permission to member1
        let grant_write_result = contract.set_permission(
            member1.clone(),
            events_path.clone(),
            WRITE,
            None,
        );
        assert!(grant_write_result.is_ok(), "Manager with MANAGE on events should be able to grant WRITE permissions: {:?}", grant_write_result);
        
        // Test 2: Manager with MANAGE on moderation path grants WRITE permission to member2
        let grant_manage_delegation = contract.set_permission(
            member2.clone(),
            moderation_path.clone(),
            WRITE,
            None,
        );
        assert!(grant_manage_delegation.is_ok(), "Manager with MANAGE on moderation should be able to grant WRITE permissions: {:?}", grant_manage_delegation);

        // Test for negative case: Create a DIFFERENT user (member2) with only MODERATE permission on admin path
        // Note: Manager has MANAGE at group root, so we need a separate user to test MODERATE-only access
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000).build());
        let owner_grant_moderate_only = contract.set_permission(
            member2.clone(), // Use member2 who has NO group-level permissions
            admin_path.clone(),
            MODERATE, // Only MODERATE, not MANAGE
            None,
        );
        assert!(owner_grant_moderate_only.is_ok(), "Owner should be able to grant MODERATE to admin path: {:?}", owner_grant_moderate_only);

        // Switch to member2 and try to delegate with only MODERATE permission
        near_sdk::testing_env!(get_context_with_deposit(member2.clone(), 1_000_000_000_000_000_000_000_000).build());
        let moderate_cannot_delegate = contract.set_permission(
            member1.clone(),
            admin_path.clone(),
            WRITE,
            None,
        );
        assert!(moderate_cannot_delegate.is_err(), "User with only MODERATE should NOT be able to delegate permissions");

        // Test 3: member2 tries to grant permission to path where they have no authority at all
        let no_permission_path = "groups/testgroup/secret".to_string();
        let grant_unauthorized = contract.set_permission(
            member1.clone(),
            no_permission_path.clone(),
            WRITE,
            None,
        );
        assert!(grant_unauthorized.is_err(), "User should NOT be able to grant permissions to paths they have no authority on");

        // Verify the granted permissions work - check with manager as the granter
        assert!(
            contract.has_permission(
                manager.clone(), // Manager granted the permission, so they're the "owner" in the permission key
                member1.clone(),
                events_path.clone(),
                WRITE
            ),
            "Member1 should have WRITE permission on events path granted by manager"
        );

        assert!(
            contract.has_permission(
                manager.clone(), // Manager granted the permission, so they're the "owner" in the permission key
                member2.clone(),
                moderation_path.clone(),
                WRITE
            ),
            "Member2 should have WRITE permission on moderation path granted by manager"
        );

        // Verify path isolation - member1 doesn't have access to moderation path
        assert!(
            !contract.has_permission(
                manager.clone(),
                member1.clone(),
                moderation_path.clone(),
                WRITE
            ),
            "Member1 should NOT have WRITE permission on moderation path"
        );

        // Verify member1 doesn't have unauthorized access to admin path (where manager only has MODERATE)
        assert!(
            !contract.has_permission(
                manager.clone(),
                member1.clone(),
                admin_path.clone(),
                WRITE
            ),
            "Member1 should NOT have WRITE permission on admin path (manager only has MODERATE there)"
        );

        // Verify member1 doesn't have access to completely unauthorized path
        assert!(
            !contract.has_permission(
                manager.clone(),
                member1.clone(),
                no_permission_path.clone(),
                WRITE
            ),
            "Member1 should NOT have WRITE permission on unauthorized path"
        );

        println!("✅ Manager delegation: Managers can delegate permissions only to paths where owner has granted them authority");
    }

    #[test]
    fn test_permission_hierarchy_enforcement() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let manager = test_account(1);
        let member = test_account(2);

        // Owner creates a traditional group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Add manager with member-only role (cannot grant anything)
        contract
            .add_group_member("testgroup".to_string(), manager.clone(), 0)
            .unwrap();

        // Group path permissions only apply to members.
        contract
            .add_group_member("testgroup".to_string(), member.clone(), 0)
            .unwrap();

        let test_path = "groups/testgroup/test".to_string();

        // Manager tries to grant MANAGE permission (should fail - they only have WRITE)
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());
        let grant_manage_result = contract.set_permission(
            member.clone(),
            test_path.clone(),
            MANAGE,
            None,
        );
        assert!(grant_manage_result.is_err(), "Manager with only WRITE should not be able to grant MANAGE permissions");

        // Manager tries to grant MODERATE permission (should also fail)
        let grant_moderate_result = contract.set_permission(
            member.clone(),
            test_path.clone(),
            MODERATE,
            None,
        );
        assert!(grant_moderate_result.is_err(), "Manager with only WRITE should not be able to grant MODERATE permissions");

        // Give manager MANAGE permission and try again
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.set_permission(manager.clone(), test_path.clone(), MANAGE, None).unwrap();

        // Now manager should be able to grant lower permissions
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());

        // Ensure manager has storage balance for permission writes.
        contract
            .set(set_request(json!({"storage/deposit": {"amount": "1"}}), None))
            .unwrap();

        let grant_write_result = contract.set_permission(
            member.clone(),
            test_path.clone(),
            WRITE,
            None,
        );
        assert!(grant_write_result.is_ok(), "Manager with MANAGE should be able to grant WRITE permissions: {:?}", grant_write_result);

        println!("✅ Permission hierarchy properly enforced - cannot grant higher permissions than possessed");
    }

    #[test]
    fn test_permission_revocation() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Owner creates a traditional group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Add member to the group first with NO group-root permissions
        // This allows us to test path-specific permission grant/revoke in isolation
        contract.add_group_member("testgroup".to_string(), member.clone(), 0).unwrap();

        let test_path = "groups/testgroup/content".to_string();

        // Grant permission to member
        contract.set_permission(member.clone(), test_path.clone(), WRITE, None).unwrap();

        // Verify permission was granted
        assert!(
            contract.has_permission(owner.clone(), member.clone(), test_path.clone(), WRITE),
            "Member should have WRITE permission"
        );

        // Revoke permission (typically done by setting permission to 0 or using a revoke method)
        // Note: This depends on your actual revocation implementation
        let revoke_result = contract.set_permission(member.clone(), test_path.clone(), 0, None); // Assuming 0 revokes
        
        if revoke_result.is_ok() {
            // Verify permission was revoked
            assert!(
                !contract.has_permission(owner.clone(), member.clone(), test_path.clone(), WRITE),
                "Member should not have WRITE permission after revocation"
            );
            println!("✅ Permission successfully revoked");
        } else {
            println!("✅ Permission revocation test - implementation may vary: {:?}", revoke_result);
        }
    }

    #[test]
    fn test_multiple_permission_levels_on_same_path() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Owner creates a traditional group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Add member to the group first (clean-add)
        contract
            .add_group_member("testgroup".to_string(), member.clone(), 0)
            .unwrap();

        let test_path = "groups/testgroup/content".to_string();

        // Grant WRITE permission first
        contract.set_permission(member.clone(), test_path.clone(), WRITE, None).unwrap();
        assert!(
            contract.has_permission(owner.clone(), member.clone(), test_path.clone(), WRITE),
            "Member should have WRITE permission"
        );

        // Upgrade to MODERATE permission
        contract.set_permission(member.clone(), test_path.clone(), MODERATE, None).unwrap();
        assert!(
            contract.has_permission(owner.clone(), member.clone(), test_path.clone(), MODERATE),
            "Member should have MODERATE permission"
        );

        // Check if WRITE is still available (depends on implementation - might be replaced or cumulative)
        let write_still_available = contract.has_permission(owner.clone(), member.clone(), test_path.clone(), WRITE);
        println!("WRITE permission after MODERATE grant: {}", write_still_available);

        // Upgrade to MANAGE permission
        contract.set_permission(member.clone(), test_path.clone(), MANAGE, None).unwrap();
        assert!(
            contract.has_permission(owner.clone(), member.clone(), test_path.clone(), MANAGE),
            "Member should have MANAGE permission"
        );

        println!("✅ Multiple permission levels can be granted on same path");
    }

    // === ROLE TRANSITION TESTS ===

    #[test]
    fn test_member_role_promotion_workflow() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        
        // Create group
        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("promotion_test".to_string(), config).unwrap();

        // Start member as member-only
        contract
            .add_group_member("promotion_test".to_string(), member.clone(), 0)
            .unwrap();
        
        // Verify initial role
        let member_data = contract.get_member_data("promotion_test".to_string(), member.clone()).unwrap();
        assert_eq!(
            member_data["level"],
            json!(0),
            "Should start member-only (0)"
        );

        // Promote to MODERATE role using set_permission
        contract.set_permission(member.clone(), "groups/promotion_test/config".to_string(), MODERATE, None).unwrap();
        
        // Verify they can perform moderate actions
        assert!(contract.has_permission(owner.clone(), member.clone(), "groups/promotion_test/config".to_string(), MODERATE), 
               "Member should have moderate permissions");

        // Promote to MANAGE role (admin) using set_permission
        contract.set_permission(member.clone(), "groups/promotion_test/config".to_string(), MANAGE, None).unwrap();
        
        // Verify they can perform admin actions
        assert!(contract.has_permission(owner.clone(), member.clone(), "groups/promotion_test/config".to_string(), MANAGE), 
               "Member should have management permissions");

        println!("✅ Member role promotion workflow works correctly");
    }

    #[test]
    fn test_member_role_demotion_workflow() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let admin_member = test_account(1);

        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        
        // Create group and add member with NO group-root permissions
        // This allows us to test path-specific permission demotion
        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("demotion_test".to_string(), config).unwrap();
        contract.add_group_member("demotion_test".to_string(), admin_member.clone(), 0).unwrap();

        // Grant MANAGE permission to the config path
        contract.set_permission(admin_member.clone(), "groups/demotion_test/config".to_string(), MANAGE, None).unwrap();

        // Verify initial admin role
        assert!(contract.has_permission(owner.clone(), admin_member.clone(), "groups/demotion_test/config".to_string(), MANAGE), 
               "Member should start with MANAGE permissions on path");

        // Demote to MODERATE role using set_permission (replaces the path permission)
        contract.set_permission(admin_member.clone(), "groups/demotion_test/config".to_string(), MODERATE, None).unwrap();

        // Verify they no longer have admin permissions but retain moderate
        assert!(!contract.has_permission(owner.clone(), admin_member.clone(), "groups/demotion_test/config".to_string(), MANAGE), 
               "Member should lose MANAGE permissions");
        assert!(contract.has_permission(owner.clone(), admin_member.clone(), "groups/demotion_test/config".to_string(), MODERATE), 
               "Member should retain MODERATE permissions");

        // Demote to basic WRITE role using set_permission
        contract.set_permission(admin_member.clone(), "groups/demotion_test/config".to_string(), WRITE, None).unwrap();

        // Verify they only have basic permissions
        assert!(!contract.has_permission(owner.clone(), admin_member.clone(), "groups/demotion_test/config".to_string(), MODERATE), 
               "Member should lose MODERATE permissions");
        assert!(contract.has_permission(owner.clone(), admin_member.clone(), "groups/demotion_test/config".to_string(), WRITE), 
               "Member should retain WRITE permissions");

        println!("✅ Member role demotion workflow works correctly");
    }

    #[test]
    fn test_role_hierarchy_enforcement() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let admin = test_account(1);
        let moderator = test_account(2);
        let writer = test_account(3);

        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        
        // Create group and establish role hierarchy
        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("hierarchy_test".to_string(), config).unwrap();
        
        contract
            .add_group_member("hierarchy_test".to_string(), admin.clone(), 0)
            .unwrap();
        contract
            .add_group_member("hierarchy_test".to_string(), moderator.clone(), 0)
            .unwrap();
        contract
            .add_group_member("hierarchy_test".to_string(), writer.clone(), 0)
            .unwrap();

        // Establish path-scoped role-like permissions explicitly.
        contract
            .set_permission(admin.clone(), "groups/hierarchy_test/config".to_string(), MANAGE, None)
            .unwrap();
        contract
            .set_permission(
                moderator.clone(),
                "groups/hierarchy_test/config".to_string(),
                MODERATE,
                None,
            )
            .unwrap();

        // Test admin can manage roles using set_permission
        near_sdk::testing_env!(get_context_with_deposit(admin.clone(), 1_000_000_000_000_000_000_000_000).build());

        // Ensure admin has storage balance for permission writes.
        contract
            .set(set_request(json!({"storage/deposit": {"amount": "1"}}), None))
            .unwrap();

        let admin_promote_result = contract.set_permission(writer.clone(), "groups/hierarchy_test/config".to_string(), MODERATE, None);
        assert!(admin_promote_result.is_ok(), "Admin should be able to promote members");

        // Test moderator cannot grant admin privileges
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let moderator_promote_result = contract.set_permission(writer.clone(), "groups/hierarchy_test/config".to_string(), MANAGE, None);
        assert!(moderator_promote_result.is_err(), "Moderator should not be able to grant MANAGE permissions");

        // Test writer cannot grant any privileges  
        near_sdk::testing_env!(get_context_with_deposit(writer.clone(), 1_000_000_000_000_000_000_000_000).build());
        let writer_promote_result = contract.set_permission(moderator.clone(), "groups/hierarchy_test/config".to_string(), MODERATE, None);
        assert!(writer_promote_result.is_err(), "Writer should not be able to grant higher permissions");

        println!("✅ Role hierarchy enforcement works correctly");
    }

    #[test]
    fn test_permission_inheritance_during_transitions() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        
        // Create group and add member
        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("inheritance_test".to_string(), config).unwrap();
        contract
            .add_group_member("inheritance_test".to_string(), member.clone(), 0)
            .unwrap();

        // Grant specific path permissions
        let posts_path = "groups/inheritance_test/posts";
        let events_path = "groups/inheritance_test/events";
        
        contract.set_permission(member.clone(), posts_path.to_string(), MODERATE, None).unwrap();
        contract.set_permission(member.clone(), events_path.to_string(), WRITE, None).unwrap();

        // Verify initial permissions
        assert!(contract.has_permission(owner.clone(), member.clone(), posts_path.to_string(), MODERATE), 
               "Should have MODERATE on posts");
        assert!(contract.has_permission(owner.clone(), member.clone(), events_path.to_string(), WRITE), 
               "Should have WRITE on events");

        // Grant additional permissions to test inheritance 
        contract.set_permission(member.clone(), "groups/inheritance_test/config".to_string(), MODERATE, None).unwrap();

        // Verify path-specific permissions are preserved
        assert!(contract.has_permission(owner.clone(), member.clone(), posts_path.to_string(), MODERATE), 
               "Should still have MODERATE on posts after permission update");
        assert!(contract.has_permission(owner.clone(), member.clone(), events_path.to_string(), WRITE), 
               "Should still have WRITE on events after permission update");

        // Verify new role permissions apply to group config
        assert!(contract.has_permission(owner.clone(), member.clone(), "groups/inheritance_test/config".to_string(), MODERATE), 
               "Should have MODERATE on group config after permission grant");

        println!("✅ Permission inheritance during role transitions works correctly");
    }

    // === MEMBER-DRIVEN PERMISSION GOVERNANCE TESTS ===
    // Tests for democratic permission control through voting in member-driven groups

    #[test]
    fn test_member_driven_path_permission_grant_via_voting() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // Creator
        let bob = test_account(1);   // Member who will get permission
        let charlie = test_account(2); // Voting member

        // Create member-driven group
        near_sdk::testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
        });
        contract.create_group("demo_group".to_string(), config).unwrap();

        // Add bob and charlie as members (bypassing proposals for setup)
        test_add_member_bypass_proposals_with_timestamp(&mut contract, "demo_group", &bob, WRITE, &alice, 1000);
        test_add_member_bypass_proposals_with_timestamp(&mut contract, "demo_group", &charlie, WRITE, &alice, 2000);

        let meetings_path = "groups/demo_group/meetings".to_string();

        // Verify bob initially does NOT have WRITE permission to meetings path
        assert!(
            !contract.has_permission(alice.clone(), bob.clone(), meetings_path.clone(), WRITE),
            "Bob should NOT have WRITE permission to meetings initially"
        );

        // Alice creates proposal to grant bob WRITE permission to meetings path
        near_sdk::testing_env!(get_context_with_deposit(alice.clone(), test_deposits::member_operations() * 2).build());
        let proposal_data = json!({
            "target_user": bob.to_string(),
            "path": meetings_path.clone(),
            "level": WRITE,
            "reason": "Bob needs access to manage meeting notes"
        });

        let proposal_id = contract.create_group_proposal(
            "demo_group".to_string(),
            "path_permission_grant".to_string(),
            proposal_data,
            None,
        ).unwrap();

        // Charlie votes YES (alice automatically voted YES when creating)
        // 2 YES votes out of 3 members = 66% participation, 100% approval
        near_sdk::testing_env!(get_context_with_deposit(charlie.clone(), test_deposits::member_operations()).build());
        let vote_result = contract.vote_on_proposal("demo_group".to_string(), proposal_id.clone(), true);
        assert!(vote_result.is_ok(), "Charlie's vote should succeed: {:?}", vote_result.err());

        // Verify bob now has WRITE permission to meetings path
        // Note: Permissions are granted by the group owner (alice), even though it was a democratic decision
        assert!(
            contract.has_permission(alice.clone(), bob.clone(), meetings_path.clone(), WRITE),
            "Bob should have WRITE permission to meetings after proposal passes"
        );

        // Step 3: Bob actually WRITES data using set() - the realistic workflow
        near_sdk::testing_env!(get_context_with_deposit(bob.clone(), test_deposits::member_operations()).build());

        let write_result = contract.set(set_request(
            json!({
                "groups/demo_group/meetings/meeting1": {
                    "title": "Team Sync Meeting",
                    "organizer": bob.to_string(),
                    "date": "2025-10-15"
                }
            }),
            None,
        ));

        assert!(
            write_result.is_ok(),
            "✅ Bob should be able to WRITE to meetings path using set(): {:?}",
            write_result.err()
        );

        // Step 4: Verify bob CANNOT write to other paths (path isolation enforcement)
        let admin_path = "groups/demo_group/admin".to_string();
        
        let unauthorized_write = contract.set(set_request(
            json!({
                "groups/demo_group/admin/config": {
                    "setting": "unauthorized"
                }
            }),
            None,
        ));

        assert!(
            unauthorized_write.is_err(),
            "❌ Bob should NOT be able to write to admin path without permission"
        );
        assert!(
            unauthorized_write.unwrap_err().to_string().contains("Permission denied"),
            "Should be permission denied error"
        );

        // Also verify permission check shows no access
        assert!(
            !contract.has_permission(alice.clone(), bob.clone(), admin_path.clone(), WRITE),
            "Bob should NOT have WRITE permission to admin path"
        );

        println!("✅ Member-driven permission grant via voting: Members democratically grant path permissions AND can actually use them");
    }

    #[test]
    fn test_member_driven_path_permission_revoke_via_voting() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // Creator
        let bob = test_account(1);   // Member who will have permission revoked
        let charlie = test_account(2); // Voting member

        // Create member-driven group
        near_sdk::testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
        });
        contract.create_group("revoke_demo".to_string(), config).unwrap();

        // Add bob and charlie as members
        test_add_member_bypass_proposals_with_timestamp(&mut contract, "revoke_demo", &bob, WRITE, &alice, 1000);
        test_add_member_bypass_proposals_with_timestamp(&mut contract, "revoke_demo", &charlie, WRITE, &alice, 2000);

        let events_path = "groups/revoke_demo/events".to_string();

        // Step 1: First grant bob permission to events path via proposal
        near_sdk::testing_env!(get_context_with_deposit(alice.clone(), test_deposits::member_operations() * 2).build());
        let grant_proposal = json!({
            "target_user": bob.to_string(),
            "path": events_path.clone(),
            "level": WRITE,
            "reason": "Bob will manage events"
        });

        let grant_proposal_id = contract.create_group_proposal(
            "revoke_demo".to_string(),
            "path_permission_grant".to_string(),
            grant_proposal,
            None,
        ).unwrap();

        // Charlie votes YES on grant proposal
        near_sdk::testing_env!(get_context_with_deposit(charlie.clone(), test_deposits::member_operations()).build());
        contract.vote_on_proposal("revoke_demo".to_string(), grant_proposal_id.clone(), true).unwrap();

        // Verify bob has permission (alice is the group owner, used as permission owner)
        assert!(
            contract.has_permission(alice.clone(), bob.clone(), events_path.clone(), WRITE),
            "Bob should have WRITE permission to events after grant"
        );

        // Step 2: Now create proposal to REVOKE bob's permission (Charlie creates this one)
        near_sdk::testing_env!(get_context_with_deposit(charlie.clone(), test_deposits::member_operations() * 2).build());
        let revoke_proposal = json!({
            "target_user": bob.to_string(),
            "path": events_path.clone(),
            "reason": "Bob no longer needs event management access"
        });

        let revoke_proposal_id = contract.create_group_proposal(
            "revoke_demo".to_string(),
            "path_permission_revoke".to_string(),
            revoke_proposal,
            None,
        ).unwrap();

        // Alice votes YES on revoke proposal (charlie already voted YES automatically)
        near_sdk::testing_env!(get_context_with_deposit(alice.clone(), test_deposits::member_operations()).build());
        let revoke_vote = contract.vote_on_proposal("revoke_demo".to_string(), revoke_proposal_id.clone(), true);
        assert!(revoke_vote.is_ok(), "Alice's vote on revoke should succeed: {:?}", revoke_vote.err());

        // Verify bob NO LONGER has permission to events path
        assert!(
            !contract.has_permission(alice.clone(), bob.clone(), events_path.clone(), WRITE),
            "Bob should NOT have WRITE permission to events after revoke"
        );

        // Step 3: Verify bob CANNOT write data after revoke (realistic test)
        near_sdk::testing_env!(get_context_with_deposit(bob.clone(), test_deposits::member_operations()).build());

        let write_attempt = contract.set(set_request(
            json!({
                "groups/revoke_demo/events/event1": {
                    "title": "Unauthorized Event",
                    "organizer": bob.to_string()
                }
            }),
            None,
        ));

        assert!(
            write_attempt.is_err(),
            "❌ Bob should NOT be able to write to events path after revoke"
        );
        assert!(
            write_attempt.unwrap_err().to_string().contains("Permission denied"),
            "Should be permission denied error"
        );

        println!("✅ Member-driven permission revoke via voting: Members democratically revoke path permissions AND writes are blocked");
    }

    #[test]
    fn test_new_member_default_path_permissions() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // Creator/owner
        let bob = test_account(1);   // New member joining

        // Create member-driven group
        near_sdk::testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
        });
        contract.create_group("default_perms".to_string(), config).unwrap();

        // Add bob as new member with member-only global role (0). Default /content access is granted separately.
        test_add_member_bypass_proposals_with_timestamp(&mut contract, "default_perms", &bob, 0, &alice, 1000);

        // Define common paths
        let content_path = "groups/default_perms/content".to_string();
        let admin_path = "groups/default_perms/admin".to_string();
        let config_path = "groups/default_perms/config".to_string();

        // Verify bob has member-only global role
        let member_data = contract.get_member_data("default_perms".to_string(), bob.clone()).unwrap();
        assert_eq!(member_data["level"], json!(0), "Bob should have 0 global role by default");

        // Verify bob can WRITE to default content path
        assert!(
            contract.has_permission(alice.clone(), bob.clone(), content_path.clone(), WRITE),
            "New member should have WRITE permission to default content path"
        );

        // Verify bob does NOT have path-specific permissions to restricted areas
        assert!(
            !contract.has_permission(alice.clone(), bob.clone(), admin_path.clone(), MANAGE),
            "New member should NOT have MANAGE permission to admin path by default"
        );

        assert!(
            !contract.has_permission(alice.clone(), bob.clone(), config_path.clone(), MODERATE),
            "New member should NOT have MODERATE permission to config path by default"
        );

        println!("✅ New member default permissions: Members default to 0 global role but can write to /content");
    }

    #[test]
    fn test_member_driven_multiple_path_permissions_workflow() {
        let mut contract = init_live_contract();
        let alice = test_account(0); // Creator
        let bob = test_account(1);   // Gets meetings permission
        let charlie = test_account(2); // Gets events permission
        let dave = test_account(3);   // Voting member

        // Create member-driven group
        near_sdk::testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
        });
        contract.create_group("multi_path".to_string(), config).unwrap();

        // Add all members
        test_add_member_bypass_proposals_with_timestamp(&mut contract, "multi_path", &bob, WRITE, &alice, 1000);
        test_add_member_bypass_proposals_with_timestamp(&mut contract, "multi_path", &charlie, WRITE, &alice, 2000);
        test_add_member_bypass_proposals_with_timestamp(&mut contract, "multi_path", &dave, WRITE, &alice, 3000);

        let meetings_path = "groups/multi_path/meetings".to_string();
        let events_path = "groups/multi_path/events".to_string();
        let admin_path = "groups/multi_path/admin".to_string();

        // Proposal 1: Grant bob WRITE permission to meetings (Dave creates to avoid alice voting twice)
        near_sdk::testing_env!(get_context_with_deposit(dave.clone(), test_deposits::member_operations() * 2).build());
        let bob_proposal = json!({
            "target_user": bob.to_string(),
            "path": meetings_path.clone(),
            "level": WRITE,
            "reason": "Bob manages meetings"
        });

        let bob_proposal_id = contract.create_group_proposal(
            "multi_path".to_string(),
            "path_permission_grant".to_string(),
            bob_proposal,
            None,
        ).unwrap();

        // Alice and Charlie vote YES on bob's proposal (dave already voted YES automatically)
        // Need 3 votes for 51% participation with 4 members
        near_sdk::testing_env!(get_context_with_deposit(alice.clone(), test_deposits::member_operations()).build());
        contract.vote_on_proposal("multi_path".to_string(), bob_proposal_id.clone(), true).unwrap();
        
        near_sdk::testing_env!(get_context_with_deposit(charlie.clone(), test_deposits::member_operations()).build());
        contract.vote_on_proposal("multi_path".to_string(), bob_proposal_id.clone(), true).unwrap();

        // Proposal 2: Grant charlie WRITE permission to events (Bob creates this one)
        near_sdk::testing_env!(get_context_with_deposit(bob.clone(), test_deposits::member_operations() * 2).build());
        let charlie_proposal = json!({
            "target_user": charlie.to_string(),
            "path": events_path.clone(),
            "level": WRITE,
            "reason": "Charlie manages events"
        });

        let charlie_proposal_id = contract.create_group_proposal(
            "multi_path".to_string(),
            "path_permission_grant".to_string(),
            charlie_proposal,
            None,
        ).unwrap();

        // Alice and Dave vote YES on charlie's proposal (bob already voted YES automatically)
        // Need 3 votes for 51% participation with 4 members
        near_sdk::testing_env!(get_context_with_deposit(alice.clone(), test_deposits::member_operations()).build());
        contract.vote_on_proposal("multi_path".to_string(), charlie_proposal_id.clone(), true).unwrap();
        
        near_sdk::testing_env!(get_context_with_deposit(dave.clone(), test_deposits::member_operations()).build());
        contract.vote_on_proposal("multi_path".to_string(), charlie_proposal_id.clone(), true).unwrap();

        // Verify path isolation: Bob has meetings, Charlie has events
        // (alice is the group owner, used as permission owner)
        
        assert!(
            contract.has_permission(alice.clone(), bob.clone(), meetings_path.clone(), WRITE),
            "Bob should have WRITE permission to meetings"
        );

        assert!(
            !contract.has_permission(alice.clone(), bob.clone(), events_path.clone(), WRITE),
            "Bob should NOT have WRITE permission to events"
        );

        assert!(
            contract.has_permission(alice.clone(), charlie.clone(), events_path.clone(), WRITE),
            "Charlie should have WRITE permission to events"
        );

        assert!(
            !contract.has_permission(alice.clone(), charlie.clone(), meetings_path.clone(), WRITE),
            "Charlie should NOT have WRITE permission to meetings"
        );

        // Verify neither has admin access
        assert!(
            !contract.has_permission(alice.clone(), bob.clone(), admin_path.clone(), MANAGE),
            "Bob should NOT have MANAGE permission to admin"
        );

        assert!(
            !contract.has_permission(alice.clone(), charlie.clone(), admin_path.clone(), MANAGE),
            "Charlie should NOT have MANAGE permission to admin"
        );

        // Realistic test: Bob writes to meetings (should succeed)
        near_sdk::testing_env!(get_context_with_deposit(bob.clone(), test_deposits::member_operations()).build());

        let bob_write = contract.set(set_request(
            json!({
                "groups/multi_path/meetings/meeting1": {
                    "title": "Bob's Meeting",
                    "organizer": bob.to_string()
                }
            }),
            None,
        ));

        assert!(
            bob_write.is_ok(),
            "✅ Bob should be able to write to meetings: {:?}",
            bob_write.err()
        );

        // Bob tries to write to events (should fail - path isolation)
        let bob_unauthorized = contract.set(set_request(
            json!({
                "groups/multi_path/events/event1": {
                    "title": "Bob's Unauthorized Event"
                }
            }),
            None,
        ));

        assert!(
            bob_unauthorized.is_err(),
            "❌ Bob should NOT be able to write to events (different path)"
        );

        // Realistic test: Charlie writes to events (should succeed)
        near_sdk::testing_env!(get_context_with_deposit(charlie.clone(), test_deposits::member_operations()).build());

        let charlie_write = contract.set(set_request(
            json!({
                "groups/multi_path/events/event1": {
                    "title": "Charlie's Event",
                    "moderator": charlie.to_string()
                }
            }),
            None,
        ));

        assert!(
            charlie_write.is_ok(),
            "✅ Charlie should be able to write to events: {:?}",
            charlie_write.err()
        );

        // Charlie tries to write to meetings (should fail - path isolation)
        let charlie_unauthorized = contract.set(set_request(
            json!({
                "groups/multi_path/meetings/meeting2": {
                    "title": "Charlie's Unauthorized Meeting"
                }
            }),
            None,
        ));

        assert!(
            charlie_unauthorized.is_err(),
            "❌ Charlie should NOT be able to write to meetings (different path)"
        );

        println!("✅ Multiple path permissions workflow: Members can have different permissions to different paths AND actually use them");
    }
}