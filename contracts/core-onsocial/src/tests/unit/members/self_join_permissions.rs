// Test self-join permission restrictions for public groups
use crate::domain::groups::permissions::kv::types::{WRITE, MODERATE, MANAGE};
use crate::tests::test_utils::*;
use serde_json::json;

/// Test that public self-join always uses 0 (member-only role)
#[test]
fn test_self_join_public_group_allows_member_only() {
    let mut contract = init_live_contract();
    let owner = test_account(0);
    let joiner = test_account(1);

    // Owner creates public group
    let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
    near_sdk::testing_env!(context.build());

    let config = json!({"member_driven": false, "is_private": false});
    contract.create_group("publicgroup".to_string(), config).unwrap();

    // Switch to joiner context
    let joiner_context = get_context_with_deposit(joiner.clone(), 2_000_000_000_000_000_000_000_000);
    near_sdk::testing_env!(joiner_context.build());

    // 0 (member-only) should succeed
    let member_only_result = contract.join_group("publicgroup".to_string());
    assert!(member_only_result.is_ok(), "Self-join with 0 should succeed: {:?}", member_only_result);
    
    // Verify member has 0 global role
    let member_data = contract.get_member_data("publicgroup".to_string(), joiner.clone()).unwrap();
    assert_eq!(member_data.get("level"), Some(&json!(0)));

    // Verify member can WRITE to default content path
    let content_path = "groups/publicgroup/content".to_string();
    assert!(
        contract.has_permission(owner.clone(), joiner.clone(), content_path, WRITE),
        "Joiner should have WRITE permission to default content path"
    );
    
    println!("✅ Public self-join uses 0 and grants /content WRITE");
}



    /// Test that private groups use 0 for join requests and approvals
#[test]
fn test_private_group_join_request_starts_member_only() {
    let mut contract = init_live_contract();
    let owner = test_account(0);
    let joiner = test_account(1);

    // Owner creates private group (requires approval)
    let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
    near_sdk::testing_env!(context.build());

    let config = json!({"member_driven": false, "is_private": true});
    contract.create_group("privategroup".to_string(), config).unwrap();

    // Switch to joiner context
    let joiner_context = get_context_with_deposit(joiner.clone(), 2_000_000_000_000_000_000_000_000);
    near_sdk::testing_env!(joiner_context.build());

    // Private groups should allow joining with 0 (membership-only request)
    let join_result = contract.join_group("privategroup".to_string());
    assert!(join_result.is_ok(), "Private group join request with 0 should succeed: {:?}", join_result);
    
    // User should NOT be a member yet (pending approval)
    assert!(!contract.is_group_member("privategroup".to_string(), joiner.clone()));
    
    // Switch back to owner to approve (approval cannot grant role)
    near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000).build());
    let approve_result = contract.approve_join_request("privategroup".to_string(), joiner.clone(), 0);
    assert!(approve_result.is_ok(), "Owner should approve request: {:?}", approve_result);
    
    // Now user should be a member with member-only (0) global role
    assert!(contract.is_group_member("privategroup".to_string(), joiner.clone()));
    let member_data = contract.get_member_data("privategroup".to_string(), joiner.clone()).unwrap();
    assert_eq!(member_data.get("level"), Some(&json!(0)));

    println!("✅ Private group join requests and approvals use 0; roles granted later");
}

/// Test that owner can still grant higher permissions directly
#[test]
fn test_owner_can_grant_higher_permissions_directly() {
    let mut contract = init_live_contract();
    let owner = test_account(0);
    let member = test_account(1);

    // Owner creates public group
    let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
    near_sdk::testing_env!(context.build());

    let config = json!({"member_driven": false, "is_private": false});
    contract.create_group("publicgroup".to_string(), config).unwrap();

    // Owner adds member (clean-add: always 0)
    contract
        .add_group_member("publicgroup".to_string(), member.clone(), 0)
        .unwrap();

    // Owner grants MANAGE on config explicitly
    contract
        .set_permission(member.clone(), "groups/publicgroup/config".to_string(), MANAGE, None)
        .unwrap();

    // Verify member role remains 0, but path permission is granted
    let member_data = contract.get_member_data("publicgroup".to_string(), member.clone()).unwrap();
    assert_eq!(member_data.get("level"), Some(&json!(0)));
    assert!(contract.has_permission(
        owner.clone(),
        member.clone(),
        "groups/publicgroup/config".to_string(),
        MANAGE
    ));

    println!("✅ Owner can grant higher permissions via set_permission after add");
}

/// Test that existing members can be upgraded to higher permissions
/// This uses set_permission to upgrade member permissions after self-join
#[test]
fn test_existing_member_can_be_upgraded() {
    let mut contract = init_live_contract();
    let owner = test_account(0);
    let member = test_account(1);

    // Owner creates public group
    let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
    near_sdk::testing_env!(context.build());

    let config = json!({"member_driven": false, "is_private": false});
    contract.create_group("publicgroup".to_string(), config).unwrap();

    // Member self-joins with 0 (member-only role)
    near_sdk::testing_env!(get_context_with_deposit(member.clone(), 2_000_000_000_000_000_000_000_000).build());
    contract.join_group("publicgroup".to_string()).unwrap();
    
    // Verify member starts with 0 role
    let member_data = contract.get_member_data("publicgroup".to_string(), member.clone()).unwrap();
    assert_eq!(member_data.get("level"), Some(&json!(0)));

    // Owner upgrades member to MODERATE using set_permission
    near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000).build());
    let update_result = contract.set_permission(
        member.clone(),
        "groups/publicgroup/config".to_string(),
        MODERATE,
        None
    );
    assert!(update_result.is_ok(), "Owner should upgrade permissions: {:?}", update_result);
    
    // Verify member now has MODERATE permission
    assert!(contract.has_permission(
        owner.clone(),
        member.clone(),
        "groups/publicgroup/config".to_string(),
        MODERATE
    ), "Member should have MODERATE permission after upgrade");

    // Test upgrading to MANAGE
    let manage_result = contract.set_permission(
        member.clone(),
        "groups/publicgroup/config".to_string(),
        MANAGE,
        None
    );
    assert!(manage_result.is_ok(), "Owner should upgrade to MANAGE: {:?}", manage_result);
    
    // Verify member now has MANAGE permission
    assert!(contract.has_permission(
        owner.clone(),
        member.clone(),
        "groups/publicgroup/config".to_string(),
        MANAGE
    ), "Member should have MANAGE permission after upgrade");

    println!("✅ Existing members can be upgraded to higher permissions (self-join restriction only applies to initial join)");
}
