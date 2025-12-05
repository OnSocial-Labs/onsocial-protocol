// Test self-join permission restrictions for public groups
use crate::groups::kv_permissions::{WRITE, MODERATE, MANAGE, FULL_ACCESS};
use crate::tests::test_utils::*;
use serde_json::json;

/// Test that self-join to public groups is restricted to WRITE permission only
#[test]
fn test_self_join_public_group_only_allows_write() {
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

    // Test 1: WRITE permission should succeed (allowed)
    let write_result = contract.join_group("publicgroup".to_string(), WRITE);
    assert!(write_result.is_ok(), "Self-join with WRITE should succeed: {:?}", write_result);
    
    // Verify member has WRITE permission
    let member_data = contract.get_member_data("publicgroup".to_string(), joiner.clone()).unwrap();
    assert_eq!(member_data.get("permission_flags"), Some(&json!(WRITE)));
    
    // Remove member to test other scenarios
    near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000).build());
    contract.remove_group_member("publicgroup".to_string(), joiner.clone(), None).unwrap();

    println!("✅ Self-join with WRITE permission works correctly");
}

#[test]
fn test_self_join_public_group_rejects_moderate() {
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

    // Test 2: MODERATE permission should fail (not allowed for self-join)
    let moderate_result = contract.join_group("publicgroup".to_string(), MODERATE);
    assert!(moderate_result.is_err(), "Self-join with MODERATE should fail");
    assert!(moderate_result.unwrap_err().to_string().contains("Self-join in public groups is limited to WRITE permission only"));
    
    // Verify user is NOT a member
    assert!(!contract.is_group_member("publicgroup".to_string(), joiner.clone()));

    println!("✅ Self-join with MODERATE permission correctly rejected");
}

#[test]
fn test_self_join_public_group_rejects_manage() {
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

    // Test 3: MANAGE permission should fail (not allowed for self-join)
    let manage_result = contract.join_group("publicgroup".to_string(), MANAGE);
    assert!(manage_result.is_err(), "Self-join with MANAGE should fail");
    assert!(manage_result.unwrap_err().to_string().contains("Self-join in public groups is limited to WRITE permission only"));
    
    // Verify user is NOT a member
    assert!(!contract.is_group_member("publicgroup".to_string(), joiner.clone()));

    println!("✅ Self-join with MANAGE permission correctly rejected");
}

#[test]
fn test_self_join_public_group_rejects_full_access() {
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

    // Test 4: FULL_ACCESS permission should fail (not allowed for self-join)
    let full_access_result = contract.join_group("publicgroup".to_string(), FULL_ACCESS);
    assert!(full_access_result.is_err(), "Self-join with FULL_ACCESS should fail");
    assert!(full_access_result.unwrap_err().to_string().contains("Self-join in public groups is limited to WRITE permission only"));
    
    // Verify user is NOT a member
    assert!(!contract.is_group_member("publicgroup".to_string(), joiner.clone()));

    println!("✅ Self-join with FULL_ACCESS permission correctly rejected");
}

#[test]
fn test_self_join_public_group_rejects_combined_permissions() {
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

    // Test: Combined permissions (WRITE | MODERATE = 3) should fail
    let combined_result = contract.join_group("publicgroup".to_string(), WRITE | MODERATE);
    assert!(combined_result.is_err(), "Self-join with combined permissions should fail");
    assert!(combined_result.unwrap_err().to_string().contains("Self-join in public groups is limited to WRITE permission only"));
    
    // Verify user is NOT a member
    assert!(!contract.is_group_member("publicgroup".to_string(), joiner.clone()));

    println!("✅ Self-join with combined permissions correctly rejected");
}

/// Test that private groups still allow requesting higher permissions (they go through approval)
#[test]
fn test_private_group_allows_requesting_any_permission() {
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

    // Private groups should allow requesting MODERATE (will go through approval flow)
    let moderate_result = contract.join_group("privategroup".to_string(), MODERATE);
    assert!(moderate_result.is_ok(), "Private group join request with MODERATE should succeed: {:?}", moderate_result);
    
    // User should NOT be a member yet (pending approval)
    assert!(!contract.is_group_member("privategroup".to_string(), joiner.clone()));
    
    // Switch back to owner to approve
    near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000).build());
    let approve_result = contract.approve_join_request("privategroup".to_string(), joiner.clone(), None);
    assert!(approve_result.is_ok(), "Owner should approve request: {:?}", approve_result);
    
    // Now user should be a member with MODERATE permission
    assert!(contract.is_group_member("privategroup".to_string(), joiner.clone()));
    let member_data = contract.get_member_data("privategroup".to_string(), joiner.clone()).unwrap();
    assert_eq!(member_data.get("permission_flags"), Some(&json!(MODERATE)));

    println!("✅ Private groups correctly allow requesting higher permissions through approval flow");
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

    // Owner directly adds member with MANAGE permission (bypasses self-join restriction)
    let add_result = contract.add_group_member("publicgroup".to_string(), member.clone(), MANAGE, None);
    assert!(add_result.is_ok(), "Owner should be able to add member with MANAGE: {:?}", add_result);
    
    // Verify member has MANAGE permission
    let member_data = contract.get_member_data("publicgroup".to_string(), member.clone()).unwrap();
    assert_eq!(member_data.get("permission_flags"), Some(&json!(MANAGE)));

    println!("✅ Owner can still grant higher permissions directly (self-join restriction only applies to self-join)");
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

    // Member self-joins with WRITE (only allowed permission for self-join)
    near_sdk::testing_env!(get_context_with_deposit(member.clone(), 2_000_000_000_000_000_000_000_000).build());
    contract.join_group("publicgroup".to_string(), WRITE).unwrap();
    
    // Verify member has WRITE permission
    let member_data = contract.get_member_data("publicgroup".to_string(), member.clone()).unwrap();
    assert_eq!(member_data.get("permission_flags"), Some(&json!(WRITE)));

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
