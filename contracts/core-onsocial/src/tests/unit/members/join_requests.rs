// === JOIN REQUEST WORKFLOW TESTS ===
// Tests for join requests, approvals, rejections, and permission validation

use crate::domain::groups::permissions::kv::types::{MANAGE, MODERATE, WRITE};
use crate::tests::test_utils::*;
use serde_json::json;

#[cfg(test)]
mod join_request_tests {

    use super::*;

    #[test]
    fn test_non_member_join_request_creates_proposal() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let requester = test_account(1);
        let requester2 = test_account(2);

        // Owner creates a private group
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({"member_driven": false, "is_private": true});
        contract
            .execute(create_group_request("privategroup".to_string(), config))
            .unwrap();

        // Test invalid permission flags are rejected
        near_sdk::testing_env!(
            get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build()
        );

        // Join requests must start as membership-only (0).
        let join_0 = contract.execute(join_group_request("privategroup".to_string()));
        assert!(
            join_0.is_ok(),
            "Join request with 0 permissions should succeed (membership-only)"
        );

        // Second requester also joins (0)
        near_sdk::testing_env!(
            get_context_with_deposit(requester2.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        let join_result = contract.execute(join_group_request("privategroup".to_string()));
        assert!(join_result.is_ok(), "Join request with 0 should succeed");

        // Verify requester is not immediately a member (needs approval)
        assert!(!contract.is_group_member("privategroup".to_string(), requester.clone()));
        assert!(!contract.is_group_member("privategroup".to_string(), requester2.clone()));

        // Verify join request exists
        let join_request = contract.get_join_request("privategroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        let join_request2 =
            contract.get_join_request("privategroup".to_string(), requester2.clone());
        assert!(join_request2.is_some(), "Join request should exist");

        println!(
            "✅ Non-member join request creates proposal correctly and validates permission flags"
        );
    }

    #[test]
    fn test_moderate_permission_approve_join_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group and adds moderator
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({"member_driven": false, "is_private": true});
        contract
            .execute(create_group_request("privategroup".to_string(), config))
            .unwrap();

        // Add moderator as member-only, then explicitly grant MODERATE on config.
        contract
            .execute(add_group_member_request(
                "privategroup".to_string(),
                moderator.clone(),
            ))
            .unwrap();

        contract
            .execute(set_permission_request(
                moderator.clone(),
                "groups/privategroup/join_requests".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        // Requester submits join request
        near_sdk::testing_env!(
            get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("privategroup".to_string()))
            .unwrap();

        // Moderator approves the join request (approval cannot grant role)
        near_sdk::testing_env!(
            get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        let approve_result = contract.execute(approve_join_request(
            "privategroup".to_string(),
            requester.clone(),
        ));
        assert!(
            approve_result.is_ok(),
            "Moderator should be able to approve join request: {:?}",
            approve_result
        );

        // Verify requester is now a member (member-only role)
        assert!(contract.is_group_member("privategroup".to_string(), requester.clone()));
        let member_data = contract
            .get_member_data("privategroup".to_string(), requester.clone())
            .unwrap();
        assert_eq!(member_data.get("level"), Some(&json!(0)));

        println!("✅ Moderator successfully approved join request");
    }

    #[test]
    fn test_moderate_permission_reject_join_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group and adds moderator
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({"member_driven": false, "is_private": true});
        contract
            .execute(create_group_request("privategroup".to_string(), config))
            .unwrap();

        // Add moderator as member-only, then explicitly grant MODERATE on config.
        contract
            .execute(add_group_member_request(
                "privategroup".to_string(),
                moderator.clone(),
            ))
            .unwrap();

        contract
            .execute(set_permission_request(
                moderator.clone(),
                "groups/privategroup/join_requests".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        // Requester submits join request
        near_sdk::testing_env!(
            get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("privategroup".to_string()))
            .unwrap();

        // Moderator rejects the join request
        near_sdk::testing_env!(
            get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        let reject_result = contract.execute(reject_join_request(
            "privategroup".to_string(),
            requester.clone(),
            None,
        ));
        assert!(
            reject_result.is_ok(),
            "Moderator should be able to reject join request"
        );

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
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({"member_driven": false, "is_private": true});
        contract
            .execute(create_group_request("privategroup".to_string(), config))
            .unwrap();

        contract
            .execute(add_group_member_request(
                "privategroup".to_string(),
                regular_member.clone(),
            ))
            .unwrap();

        // Requester submits join request
        near_sdk::testing_env!(
            get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("privategroup".to_string()))
            .unwrap();

        // Regular member tries to approve (should fail)
        near_sdk::testing_env!(
            get_context_with_deposit(regular_member.clone(), 1_000_000_000_000_000_000_000_000)
                .build()
        );
        // Approvals must use 0 (member-only). This test exercises authorization, not role assignment.
        let approve_result = contract.execute(approve_join_request(
            "privategroup".to_string(),
            requester.clone(),
        ));

        assert!(
            approve_result.is_err(),
            "Regular member should not be able to approve join request"
        );
        let error_msg = approve_result.unwrap_err().to_string();
        assert!(
            error_msg.contains("Permission denied"),
            "Should be permission error: {}",
            error_msg
        );

        // Verify requester is still not a member
        assert!(!contract.is_group_member("privategroup".to_string(), requester.clone()));

        println!("✅ Regular member correctly denied approval permission");
    }

    #[test]
    fn test_join_requests_moderator_can_approve_write_without_config_moderation() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let join_requests_moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group.
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({"member_driven": false, "is_private": true});
        contract
            .execute(create_group_request("privategroup".to_string(), config))
            .unwrap();

        // Add the join-requests moderator as a plain member (no global/root permissions).
        contract
            .execute(add_group_member_request(
                "privategroup".to_string(),
                join_requests_moderator.clone(),
            ))
            .unwrap();

        // Delegate membership-management only: MODERATE on the join_requests namespace.
        contract
            .execute(set_permission_request(
                join_requests_moderator.clone(),
                "groups/privategroup/join_requests".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        // Requester submits a join request.
        near_sdk::testing_env!(
            get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("privategroup".to_string()))
            .unwrap();

        // Delegate moderator approves (members always join with level=0).
        near_sdk::testing_env!(
            get_context_with_deposit(
                join_requests_moderator.clone(),
                1_000_000_000_000_000_000_000_000
            )
            .build()
        );
        let approve_none = contract.execute(approve_join_request(
            "privategroup".to_string(),
            requester.clone(),
        ));
        assert!(
            approve_none.is_ok(),
            "Join-requests moderator should be able to approve: {:?}",
            approve_none
        );
        assert!(contract.is_group_member("privategroup".to_string(), requester.clone()));

        // Verify member was added with level=0
        let member_data = contract
            .get_member_data("privategroup".to_string(), requester.clone())
            .unwrap();
        assert_eq!(
            member_data.get("level"),
            Some(&json!(0)),
            "Member should have level 0"
        );

        println!(
            "✅ Join-requests moderator can approve join requests (members always join with level=0)"
        );
    }

    #[test]
    fn test_approved_member_gets_functional_path_permissions() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract
            .execute(create_group_request("testgroup".to_string(), config))
            .unwrap();

        // Owner adds moderator as member-only, then delegates moderation on join_requests.
        contract
            .execute(add_group_member_request(
                "testgroup".to_string(),
                moderator.clone(),
            ))
            .unwrap();
        contract
            .execute(set_permission_request(
                moderator.clone(),
                "groups/testgroup/join_requests".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        // Requester submits join request for WRITE permissions
        near_sdk::testing_env!(
            get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("testgroup".to_string()))
            .unwrap();

        // Verify requester doesn't have path permissions before approval
        // (non-members never have group path permissions).
        let group_content_path = "groups/testgroup/content".to_string();

        assert!(
            !contract.has_permission(
                owner.clone(),
                requester.clone(),
                group_content_path.clone(),
                WRITE
            ),
            "Requester should not have permissions before approval"
        );

        // Moderator approves the join request (approval cannot grant role)
        near_sdk::testing_env!(
            get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(approve_join_request(
                "testgroup".to_string(),
                requester.clone(),
            ))
            .unwrap();

        // Verify requester is now a member
        assert!(contract.is_group_member("testgroup".to_string(), requester.clone()));

        // New members get default WRITE on the group's content namespace.
        assert!(
            contract.has_permission(
                owner.clone(),
                requester.clone(),
                group_content_path.clone(),
                WRITE
            ),
            "Requester should have WRITE permission on group content after approval"
        );

        // Verify they don't have higher permissions they weren't granted
        assert!(
            !contract.has_permission(
                owner.clone(),
                requester.clone(),
                group_content_path.clone(),
                MANAGE
            ),
            "Requester should not have MANAGE permission"
        );

        // Verify the member data shows correct permissions
        let member_data = contract.get_member_data("testgroup".to_string(), requester.clone());
        assert!(member_data.is_some(), "Member data should exist");
        let data = member_data.unwrap();
        assert_eq!(
            data.get("level"),
            Some(&json!(0)),
            "Approved member should start member-only (0)"
        );

        println!("✅ Approved member has default content permissions and correct metadata");
    }

    #[test]
    fn test_moderator_with_hierarchical_permissions_can_approve_write_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract
            .execute(create_group_request("testgroup".to_string(), config))
            .unwrap();

        // Owner adds moderator as member-only, then grants moderation on join_requests.
        contract
            .execute(add_group_member_request(
                "testgroup".to_string(),
                moderator.clone(),
            ))
            .unwrap();
        contract
            .execute(set_permission_request(
                moderator.clone(),
                "groups/testgroup/join_requests".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        // Verify moderator has the delegated permission on join_requests.
        assert!(
            contract.has_permission(
                owner.clone(),
                moderator.clone(),
                "groups/testgroup/join_requests".to_string(),
                MODERATE
            ),
            "Moderator should have MODERATE on join_requests"
        );

        // Requester submits join request (starts as 0)
        near_sdk::testing_env!(
            get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("testgroup".to_string()))
            .unwrap();

        // Verify join request exists
        let join_request = contract.get_join_request("testgroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        // Moderator approves the join request (approval cannot grant role; must use 0).
        near_sdk::testing_env!(
            get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        let approve_result = contract.execute(approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
        ));

        assert!(
            approve_result.is_ok(),
            "Moderator with MODERATE should be able to approve join requests"
        );

        // Verify requester is now a member
        assert!(contract.is_group_member("testgroup".to_string(), requester.clone()));

        println!(
            "✅ Hierarchical permissions: Moderator with MODERATE successfully approved join request"
        );
    }

    #[test]
    fn test_join_request_approval_always_adds_member_with_level_zero() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract
            .execute(create_group_request("testgroup".to_string(), config))
            .unwrap();

        // Owner adds moderator (clean-add) and grants MODERATE on join_requests.
        contract
            .execute(add_group_member_request(
                "testgroup".to_string(),
                moderator.clone(),
            ))
            .unwrap();
        contract
            .execute(set_permission_request(
                moderator.clone(),
                "groups/testgroup/join_requests".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        // Requester submits join request
        near_sdk::testing_env!(
            get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("testgroup".to_string()))
            .unwrap();

        // Verify join request exists
        let join_request = contract.get_join_request("testgroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        // Moderator approves (level is no longer a parameter - always 0)
        near_sdk::testing_env!(
            get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        let approve_result = contract.execute(approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
        ));
        assert!(
            approve_result.is_ok(),
            "Moderator should be able to approve: {:?}",
            approve_result
        );

        // Verify requester is now a member with level=0
        assert!(contract.is_group_member("testgroup".to_string(), requester.clone()));
        let member_data = contract
            .get_member_data("testgroup".to_string(), requester.clone())
            .unwrap();
        assert_eq!(
            member_data.get("level"),
            Some(&json!(0)),
            "Members always join with level 0"
        );

        println!(
            "✅ Join approvals always add members with level=0 (elevated roles granted separately)"
        );
    }

    #[test]
    fn test_moderator_can_approve_write_request_only() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let requester = test_account(2);

        // Owner creates a traditional private group
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract
            .execute(create_group_request("testgroup".to_string(), config))
            .unwrap();

        // Owner adds moderator (clean-add) and grants MODERATE on join_requests.
        contract
            .execute(add_group_member_request(
                "testgroup".to_string(),
                moderator.clone(),
            ))
            .unwrap();
        contract
            .execute(set_permission_request(
                moderator.clone(),
                "groups/testgroup/join_requests".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        assert!(
            contract.has_permission(
                owner.clone(),
                moderator.clone(),
                "groups/testgroup/join_requests".to_string(),
                MODERATE
            ),
            "Moderator should have MODERATE on join_requests"
        );

        // Requester submits join request (starts as 0)
        near_sdk::testing_env!(
            get_context_with_deposit(requester.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("testgroup".to_string()))
            .unwrap();

        // Verify join request exists
        let join_request = contract.get_join_request("testgroup".to_string(), requester.clone());
        assert!(join_request.is_some(), "Join request should exist");

        // Moderator approves the join request (member-only; level must be 0)
        near_sdk::testing_env!(
            get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        let approve_result = contract.execute(approve_join_request(
            "testgroup".to_string(),
            requester.clone(),
        ));

        assert!(
            approve_result.is_ok(),
            "Moderator with MODERATE should be able to approve WRITE requests: {:?}",
            approve_result
        );

        // Verify requester is now a member
        assert!(contract.is_group_member("testgroup".to_string(), requester.clone()));

        // Verify member was added with member-only role flags
        let member_data = contract.get_member_data("testgroup".to_string(), requester.clone());
        assert!(member_data.is_some(), "Member data should exist");
        let data = member_data.unwrap();
        assert_eq!(
            data.get("level"),
            Some(&json!(0)),
            "Member should have member-only level"
        );

        println!("✅ Moderator with MODERATE can successfully approve join requests (member-only)");
    }

    #[test]
    fn test_manager_can_approve_any_permission_request() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let manager = test_account(1);
        let requester1 = test_account(2);
        let requester2 = test_account(3);

        // Owner creates a traditional private group
        near_sdk::testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({
            "member_driven": false,
            "is_private": true,
        });
        contract
            .execute(create_group_request("testgroup".to_string(), config))
            .unwrap();

        // Owner adds manager (clean-add) and grants MODERATE on join_requests.
        contract
            .execute(add_group_member_request(
                "testgroup".to_string(),
                manager.clone(),
            ))
            .unwrap();
        contract
            .execute(set_permission_request(
                manager.clone(),
                "groups/testgroup/join_requests".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        // Test 1: Manager approves join request (member-only)
        near_sdk::testing_env!(
            get_context_with_deposit(requester1.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("testgroup".to_string()))
            .unwrap();

        near_sdk::testing_env!(
            get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        let approve_result1 = contract.execute(approve_join_request(
            "testgroup".to_string(),
            requester1.clone(),
        ));
        assert!(
            approve_result1.is_ok(),
            "Manager should approve join requests: {:?}",
            approve_result1
        );
        assert!(contract.is_group_member("testgroup".to_string(), requester1.clone()));

        // Test 2: Manager approves another join request (member-only)
        near_sdk::testing_env!(
            get_context_with_deposit(requester2.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(join_group_request("testgroup".to_string()))
            .unwrap();

        near_sdk::testing_env!(
            get_context_with_deposit(manager.clone(), 1_000_000_000_000_000_000_000_000).build()
        );
        let approve_result2 = contract.execute(approve_join_request(
            "testgroup".to_string(),
            requester2.clone(),
        ));
        assert!(
            approve_result2.is_ok(),
            "Manager should approve join requests: {:?}",
            approve_result2
        );
        assert!(contract.is_group_member("testgroup".to_string(), requester2.clone()));

        // Verify all approved members were added with member-only role flags (level=0)
        let member_data1 = contract
            .get_member_data("testgroup".to_string(), requester1.clone())
            .unwrap();
        assert_eq!(member_data1.get("level"), Some(&json!(0)));

        let member_data2 = contract
            .get_member_data("testgroup".to_string(), requester2.clone())
            .unwrap();
        assert_eq!(member_data2.get("level"), Some(&json!(0)));

        println!("✅ Manager can approve join requests; all members join with level=0");
    }
}
