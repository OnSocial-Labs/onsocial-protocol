// === JOIN REQUEST WORKFLOW TESTS ===
// Tests for join requests, approvals, rejections, and permission validation

use crate::tests::test_utils::*;
use crate::groups::kv_permissions::{WRITE, MODERATE, MANAGE};
use serde_json::json;

#[cfg(test)]
mod join_request_tests {

    use super::*;

    #[test]
    fn test_non_member_join_request_creates_proposal() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let requester = test_account(1);

        // Owner creates a private group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": false, "is_private": true});
        contract.create_group("privategroup".to_string(), config).unwrap();

        // Test invalid permission flags are rejected
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        
        // Zero permissions should be rejected
        let invalid_join_0 = contract.join_group("privategroup".to_string(), 0);
        assert!(invalid_join_0.is_err(), "Join request with 0 permissions should fail");
        assert!(invalid_join_0.unwrap_err().to_string().contains("Invalid permission flags"), 
                "Should report invalid permission flags");
        
        // Invalid permission bits (beyond WRITE | MODERATE | MANAGE = 7) should be rejected
        let invalid_join_255 = contract.join_group("privategroup".to_string(), 255);
        assert!(invalid_join_255.is_err(), "Join request with invalid permission bits should fail");
        assert!(invalid_join_255.unwrap_err().to_string().contains("Invalid permission flags"),
                "Should report invalid permission flags");
        
        // Valid permission request should succeed
        let join_result = contract.join_group("privategroup".to_string(), WRITE);
        assert!(join_result.is_ok(), "Join request with valid permissions should succeed");

        // Verify requester is not immediately a member (needs approval)
        assert!(!contract.is_group_member("privategroup".to_string(), requester.clone()));

        // Verify join request exists
        let join_request = contract.get_join_request("privategroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        println!("✅ Non-member join request creates proposal correctly and validates permission flags");
    }

    #[test]
    fn test_moderate_permission_approve_join_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group and adds moderator
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": false, "is_private": true});
        contract.create_group("privategroup".to_string(), config).unwrap();
        
        contract.add_group_member(
            "privategroup".to_string(),
            moderator.clone(),
            MODERATE, // Hierarchical: MODERATE includes WRITE
            None,
        ).unwrap();

        // Requester submits join request
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("privategroup".to_string(), WRITE).unwrap();

        // Moderator approves the join request with WRITE permission
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result = contract.approve_join_request(
            "privategroup".to_string(),
            requester.clone(),
            WRITE, // Approve with WRITE permission
            None,
        );
        assert!(approve_result.is_ok(), "Moderator should be able to approve join request: {:?}", approve_result);

        // Verify requester is now a member
        assert!(contract.is_group_member("privategroup".to_string(), requester.clone()));

        println!("✅ Moderator successfully approved join request");
    }

    #[test]
    fn test_moderate_permission_reject_join_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group and adds moderator
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": false, "is_private": true});
        contract.create_group("privategroup".to_string(), config).unwrap();
        
        contract.add_group_member(
            "privategroup".to_string(),
            moderator.clone(),
            MODERATE, // Hierarchical: MODERATE includes WRITE
            None,
        ).unwrap();

        // Requester submits join request
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("privategroup".to_string(), WRITE).unwrap();

        // Moderator rejects the join request
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let reject_result = contract.reject_join_request(
            "privategroup".to_string(),
            requester.clone(),
            None,
            None, // event_config
        );
        assert!(reject_result.is_ok(), "Moderator should be able to reject join request");

        // Verify requester is still not a member
        assert!(!contract.is_group_member("privategroup".to_string(), requester.clone()));

        println!("✅ Moderator successfully rejected join request");
    }

    #[test]
    fn test_non_moderator_cannot_approve_join_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let regular_member = test_account(1);
        let requester = test_account(2);

        // Setup: Owner creates private group, adds regular member (no MODERATE permission)
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": false, "is_private": true});
        contract.create_group("privategroup".to_string(), config).unwrap();
        
        contract.add_group_member(
            "privategroup".to_string(),
            regular_member.clone(),
            WRITE, // Only WRITE, no MODERATE
            None,
        ).unwrap();

        // Requester submits join request
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("privategroup".to_string(), WRITE).unwrap();

        // Regular member tries to approve (should fail)
        near_sdk::testing_env!(get_context_with_deposit(regular_member.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result = contract.approve_join_request(
            "privategroup".to_string(),
            requester.clone(),
            WRITE, // Try to approve with WRITE permission
            None,
        );
        
        assert!(approve_result.is_err(), "Regular member should not be able to approve join request");
        let error_msg = approve_result.unwrap_err().to_string();
        assert!(error_msg.contains("Permission denied"), "Should be permission error: {}", error_msg);

        // Verify requester is still not a member
        assert!(!contract.is_group_member("privategroup".to_string(), requester.clone()));

        println!("✅ Regular member correctly denied approval permission");
    }

    #[test]
    fn test_approved_member_gets_functional_path_permissions() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Owner adds moderator with MODERATE permissions
        contract.add_group_member(
            "testgroup".to_string(),
            moderator.clone(),
            MODERATE, // Hierarchical: MODERATE includes WRITE
            None,
        ).unwrap();

        // Requester submits join request for WRITE permissions
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group(
            "testgroup".to_string(),
            WRITE,
        ).unwrap();

        // Verify requester doesn't have path permissions before approval
        let group_config_path = "groups/testgroup/config".to_string();
        
        assert!(
            !contract.has_permission(
                owner.clone(),
                requester.clone(),
                group_config_path.clone(),
                WRITE
            ),
            "Requester should not have permissions before approval"
        );

        // Moderator approves the join request with WRITE permission
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
            WRITE, // Approve with WRITE permission
            None,
        ).unwrap();

        // Verify requester is now a member
        assert!(contract.is_group_member("testgroup".to_string(), requester.clone()));

        // Verify requester now has functional path-based permissions on the group config
        assert!(
            contract.has_permission(
                owner.clone(),
                requester.clone(),
                group_config_path.clone(),
                WRITE
            ),
            "Requester should have WRITE permission after approval"
        );

        // Verify they don't have higher permissions they weren't granted
        assert!(
            !contract.has_permission(
                owner.clone(),
                requester.clone(),
                group_config_path.clone(),
                MANAGE
            ),
            "Requester should not have MANAGE permission"
        );

        // Verify the member data shows correct permissions
        let member_data = contract.get_member_data("testgroup".to_string(), requester.clone());
        assert!(member_data.is_some(), "Member data should exist");
        let data = member_data.unwrap();
        assert_eq!(
            data.get("permission_flags"), 
            Some(&json!(WRITE)), 
            "Member should have WRITE permissions"
        );

        println!("✅ Approved member has functional path-based permissions and correct metadata");
    }

    #[test]
    fn test_moderator_with_hierarchical_permissions_can_approve_write_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Owner adds moderator with MODERATE permission
        // With hierarchical permissions: MODERATE (flag 2) automatically includes WRITE capability
        contract.add_group_member(
            "testgroup".to_string(),
            moderator.clone(),
            MODERATE, // MODERATE includes WRITE automatically (hierarchical)
            None,
        ).unwrap();

        // Verify moderator has moderate permission
        assert!(contract.has_group_moderate_permission("testgroup".to_string(), moderator.clone()));
        
        // Verify moderator can write (hierarchical: MODERATE includes WRITE)
        // We'll verify this by checking the actual permission check succeeds
        let group_config_path = format!("groups/{}/config", "testgroup");
        assert!(
            crate::groups::kv_permissions::can_write(
                &contract.platform,
                "testgroup",
                moderator.as_str(),
                &group_config_path
            ),
            "MODERATE should include WRITE (hierarchical permissions)"
        );

        // Requester submits join request asking for WRITE permission
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group(
            "testgroup".to_string(),
            WRITE, // Request WRITE permission
        ).unwrap();

        // Verify join request exists
        let join_request = contract.get_join_request("testgroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        // Moderator approves the WRITE request (should succeed with hierarchical permissions)
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result = contract.approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
            WRITE, // Approve with WRITE permission
            None,
        );

        assert!(approve_result.is_ok(), "Moderator with MODERATE (includes WRITE) should be able to approve WRITE requests");

        // Verify requester is now a member
        assert!(contract.is_group_member("testgroup".to_string(), requester.clone()));

        println!("✅ Hierarchical permissions: Moderator with MODERATE successfully approved WRITE request");
    }

    #[test]
    fn test_moderator_without_manage_cannot_approve_manage_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Owner adds moderator with MODERATE permissions (but no MANAGE)
        contract.add_group_member(
            "testgroup".to_string(),
            moderator.clone(),
            MODERATE, // Hierarchical: includes WRITE, but no MANAGE
            None,
        ).unwrap();

        // Verify moderator has moderate permissions
        assert!(contract.has_group_moderate_permission("testgroup".to_string(), moderator.clone()));

        // Requester submits join request asking for MANAGE permission
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group(
            "testgroup".to_string(),
            MANAGE, // Request MANAGE permission
        ).unwrap();

        // Verify join request exists
        let join_request = contract.get_join_request("testgroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        // Moderator tries to approve the MANAGE request (should fail - they don't have MANAGE to grant)
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result = contract.approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
            MANAGE, // Try to approve with MANAGE permission
            None,
        );

        assert!(approve_result.is_err(), "Moderator without MANAGE should not be able to approve MANAGE requests");
        let error_msg = approve_result.unwrap_err().to_string();
        assert!(error_msg.contains("Permission denied"), "Should be permission error: {}", error_msg);

        // Verify requester is still not a member
        assert!(!contract.is_group_member("testgroup".to_string(), requester.clone()));

        println!("✅ Two-tier validation: Moderator without MANAGE correctly cannot approve MANAGE requests");
    }

    #[test]
    fn test_moderator_can_approve_write_request_only() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Owner adds moderator with MODERATE permissions
        contract.add_group_member(
            "testgroup".to_string(),
            moderator.clone(),
            MODERATE, // Hierarchical: MODERATE includes WRITE
            None,
        ).unwrap();

        // Verify moderator has moderate permissions
        assert!(contract.has_group_moderate_permission("testgroup".to_string(), moderator.clone()));

        // Requester submits join request asking for WRITE permission
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group(
            "testgroup".to_string(),
            WRITE, // Request WRITE permission
        ).unwrap();

        // Verify join request exists
        let join_request = contract.get_join_request("testgroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        // Moderator approves the WRITE request (should succeed)
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result = contract.approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
            WRITE,
            None,
        );

        assert!(approve_result.is_ok(), "Moderator with MODERATE should be able to approve WRITE requests: {:?}", approve_result);

        // Verify requester is now a member
        assert!(contract.is_group_member("testgroup".to_string(), requester.clone()));

        // Verify member has correct permissions
        let member_data = contract.get_member_data("testgroup".to_string(), requester.clone());
        assert!(member_data.is_some(), "Member data should exist");
        let data = member_data.unwrap();
        assert_eq!(data.get("permission_flags"), Some(&json!(WRITE)), 
                  "Member should have WRITE permissions");

        println!("✅ Moderator with MODERATE can successfully approve WRITE requests (hierarchical)");
        
        // Test: Moderator cannot grant MODERATE (prevents self-propagation)
        let requester2 = test_account(3);
        near_sdk::testing_env!(get_context_with_deposit(requester2.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group(
            "testgroup".to_string(),
            MODERATE, // Request MODERATE permission
        ).unwrap();
        
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_moderate = contract.approve_join_request(
            "testgroup".to_string(),
            requester2.clone(),
            MODERATE,
            None,
        );
        
        assert!(approve_moderate.is_err(), "Moderator should NOT be able to approve MODERATE requests (prevents self-propagation)");
        println!("✅ Moderator correctly denied approving MODERATE request - only MANAGE can expand moderation team");
    }

    #[test]
    fn test_manager_can_approve_any_permission_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let manager = test_account(1);
        let requester1 = test_account(2);
        let requester2 = test_account(3);
        let requester3 = test_account(4);

        // Owner creates a traditional private group
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract.create_group("testgroup".to_string(), config).unwrap();

        // Owner adds manager with MANAGE permissions
        contract.add_group_member(
            "testgroup".to_string(),
            manager.clone(),
            MANAGE, // Hierarchical: MANAGE includes MODERATE and WRITE
            None,
        ).unwrap();

        // Verify manager has manage permissions
        assert!(contract.has_group_moderate_permission("testgroup".to_string(), manager.clone()));

        // Test 1: Manager approves WRITE request
        near_sdk::testing_env!(get_context_with_deposit(requester1.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("testgroup".to_string(), WRITE).unwrap();
        
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result1 = contract.approve_join_request("testgroup".to_string(), requester1.clone(), WRITE, None);
        assert!(approve_result1.is_ok(), "Manager should approve WRITE requests: {:?}", approve_result1);
        assert!(contract.is_group_member("testgroup".to_string(), requester1.clone()));

        // Test 2: Manager approves MODERATE request
        near_sdk::testing_env!(get_context_with_deposit(requester2.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("testgroup".to_string(), MODERATE).unwrap();
        
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result2 = contract.approve_join_request("testgroup".to_string(), requester2.clone(), MODERATE, None);
        assert!(approve_result2.is_ok(), "Manager should approve MODERATE requests: {:?}", approve_result2);
        assert!(contract.is_group_member("testgroup".to_string(), requester2.clone()));

        // Test 3: Manager tries to approve MANAGE request (should fail - can't grant MANAGE)
        near_sdk::testing_env!(get_context_with_deposit(requester3.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("testgroup".to_string(), MANAGE).unwrap();
        
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result3 = contract.approve_join_request("testgroup".to_string(), requester3.clone(), MANAGE, None);
        assert!(approve_result3.is_err(), "Manager should NOT be able to approve MANAGE requests (anti-propagation)");
        assert!(!contract.is_group_member("testgroup".to_string(), requester3.clone()));

        // Verify approved members have their requested permissions
        let member_data1 = contract.get_member_data("testgroup".to_string(), requester1.clone()).unwrap();
        assert_eq!(member_data1.get("permission_flags"), Some(&json!(WRITE)));

        let member_data2 = contract.get_member_data("testgroup".to_string(), requester2.clone()).unwrap();
        assert_eq!(member_data2.get("permission_flags"), Some(&json!(MODERATE)));

        println!("✅ Manager with MANAGE can approve WRITE and MODERATE, but not MANAGE (anti-propagation)");
    }
}