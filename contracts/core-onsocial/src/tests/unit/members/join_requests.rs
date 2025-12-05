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

        // Non-member submits join request
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        let join_result = contract.join_group("privategroup".to_string(), WRITE);
        assert!(join_result.is_ok(), "Join request should be created successfully");

        // Verify requester is not immediately a member (needs approval)
        assert!(!contract.is_group_member("privategroup".to_string(), requester.clone()));

        // Verify join request exists
        let join_request = contract.get_join_request("privategroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        println!("✅ Non-member join request creates proposal correctly");
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
            MODERATE | WRITE, // Give moderator appropriate permissions
            None,
        ).unwrap();

        // Requester submits join request
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("privategroup".to_string(), WRITE).unwrap();

        // Moderator approves the join request
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result = contract.approve_join_request(
            "privategroup".to_string(),
            requester.clone(),
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
            MODERATE | WRITE,
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
            MODERATE | WRITE,
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

        // Moderator approves the join request
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
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
    fn test_moderator_without_write_cannot_approve_write_request() {
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

        // Owner adds moderator with ONLY MODERATE permission (no WRITE)
        contract.add_group_member(
            "testgroup".to_string(),
            moderator.clone(),
            MODERATE, // Only MODERATE, no WRITE
            None,
        ).unwrap();

        // Verify moderator has moderate but not write permissions
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

        // Moderator tries to approve the WRITE request (should fail - they don't have WRITE to grant)
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result = contract.approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
            None,
        );

        assert!(approve_result.is_err(), "Moderator without WRITE should not be able to approve WRITE requests");
        let error_msg = approve_result.unwrap_err().to_string();
        assert!(error_msg.contains("Permission denied"), "Should be permission error: {}", error_msg);

        // Verify requester is still not a member
        assert!(!contract.is_group_member("testgroup".to_string(), requester.clone()));

        println!("✅ Two-tier validation: Moderator without WRITE correctly cannot approve WRITE requests");
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

        // Owner adds moderator with MODERATE+WRITE permissions (but no MANAGE)
        contract.add_group_member(
            "testgroup".to_string(),
            moderator.clone(),
            MODERATE | WRITE, // 2 | 1 = 3, no MANAGE
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
    fn test_moderator_can_approve_moderate_request() {
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

        // Owner adds moderator with ONLY MODERATE permission
        contract.add_group_member(
            "testgroup".to_string(),
            moderator.clone(),
            MODERATE, // Only MODERATE (2)
            None,
        ).unwrap();

        // Verify moderator has moderate permissions
        assert!(contract.has_group_moderate_permission("testgroup".to_string(), moderator.clone()));

        // Requester submits join request asking for MODERATE permission
        near_sdk::testing_env!(get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group(
            "testgroup".to_string(),
            MODERATE, // Request MODERATE permission
        ).unwrap();

        // Verify join request exists
        let join_request = contract.get_join_request("testgroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        // Moderator approves the MODERATE request (should succeed - they have MODERATE to grant)
        near_sdk::testing_env!(get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result = contract.approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
            None,
        );

        assert!(approve_result.is_ok(), "Moderator with MODERATE should be able to approve MODERATE requests: {:?}", approve_result);

        // Verify requester is now a member
        assert!(contract.is_group_member("testgroup".to_string(), requester.clone()));

        // Verify member has correct permissions
        let member_data = contract.get_member_data("testgroup".to_string(), requester.clone());
        assert!(member_data.is_some(), "Member data should exist");
        let data = member_data.unwrap();
        assert_eq!(data.get("permission_flags"), Some(&json!(MODERATE)), 
                  "Member should have MODERATE permissions");

        println!("✅ Two-tier validation: Moderator with MODERATE can successfully approve MODERATE requests");
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

        // Owner adds manager with MANAGE+MODERATE+WRITE permissions
        contract.add_group_member(
            "testgroup".to_string(),
            manager.clone(),
            MANAGE | MODERATE | WRITE, // 4 | 2 | 1 = 7
            None,
        ).unwrap();

        // Verify manager has manage permissions
        assert!(contract.has_group_moderate_permission("testgroup".to_string(), manager.clone()));

        // Test 1: Manager approves WRITE request
        near_sdk::testing_env!(get_context_with_deposit(requester1.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("testgroup".to_string(), WRITE).unwrap();
        
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result1 = contract.approve_join_request("testgroup".to_string(), requester1.clone(), None);
        assert!(approve_result1.is_ok(), "Manager should approve WRITE requests: {:?}", approve_result1);
        assert!(contract.is_group_member("testgroup".to_string(), requester1.clone()));

        // Test 2: Manager approves MODERATE request
        near_sdk::testing_env!(get_context_with_deposit(requester2.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("testgroup".to_string(), MODERATE).unwrap();
        
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result2 = contract.approve_join_request("testgroup".to_string(), requester2.clone(), None);
        assert!(approve_result2.is_ok(), "Manager should approve MODERATE requests: {:?}", approve_result2);
        assert!(contract.is_group_member("testgroup".to_string(), requester2.clone()));

        // Test 3: Manager approves MANAGE request
        near_sdk::testing_env!(get_context_with_deposit(requester3.clone(), 1_000_000_000_000_000_000_000_000).build());
        contract.join_group("testgroup".to_string(), MANAGE).unwrap();
        
        near_sdk::testing_env!(get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build());
        let approve_result3 = contract.approve_join_request("testgroup".to_string(), requester3.clone(), None);
        assert!(approve_result3.is_ok(), "Manager should approve MANAGE requests: {:?}", approve_result3);
        assert!(contract.is_group_member("testgroup".to_string(), requester3.clone()));

        // Verify all members have their requested permissions
        let member_data1 = contract.get_member_data("testgroup".to_string(), requester1.clone()).unwrap();
        assert_eq!(member_data1.get("permission_flags"), Some(&json!(WRITE)));

        let member_data2 = contract.get_member_data("testgroup".to_string(), requester2.clone()).unwrap();
        assert_eq!(member_data2.get("permission_flags"), Some(&json!(MODERATE)));

        let member_data3 = contract.get_member_data("testgroup".to_string(), requester3.clone()).unwrap();
        assert_eq!(member_data3.get("permission_flags"), Some(&json!(MANAGE)));

        println!("✅ Two-tier validation: Manager with full permissions can approve any permission level");
    }
}