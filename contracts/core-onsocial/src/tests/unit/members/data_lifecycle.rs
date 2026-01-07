// === MEMBER DATA LIFECYCLE TESTS ===
// Tests for member data persistence, updates, metadata management, and cleanup

use crate::tests::test_utils::*;
use crate::domain::groups::permissions::kv::types::{MODERATE, MANAGE};
use near_sdk::test_utils::accounts;
use near_sdk::serde_json::json;

#[cfg(test)]
mod member_data_lifecycle_tests {

    use super::*;

    #[test]
    fn test_member_data_persistence_across_operations() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let member = accounts(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add member
        let config = json!({"member_driven": false, "is_private": false});
        contract.execute(create_group_request("data_test".to_string(), config)).unwrap();
       contract.execute(add_group_member_request("data_test".to_string(), member.clone())).unwrap();

        // Verify initial member data structure
        let initial_data = contract.get_member_data("data_test".to_string(), member.clone()).unwrap();
        assert!(initial_data.get("level").is_some(), "Should have level");
        assert!(initial_data.get("granted_by").is_some(), "Should have granted_by");
        assert!(initial_data.get("joined_at").is_some(), "Should have joined_at timestamp");
        
       let initial_joined_at = initial_data["joined_at"].as_str().unwrap().to_string();
        let initial_granted_by = initial_data["granted_by"].as_str().unwrap();

        // Perform various operations and verify data persists
        contract.execute(set_permission_request(member.clone(), "groups/data_test/posts".to_string(), MODERATE, None)).unwrap();
        
        let after_permission_data = contract.get_member_data("data_test".to_string(), member.clone()).unwrap();
       assert_eq!(after_permission_data["joined_at"], json!(initial_joined_at), 
                  "joined_at should persist after permission grant");
        assert_eq!(after_permission_data["granted_by"].as_str().unwrap(), initial_granted_by, 
                  "granted_by should persist after permission grant");

        // Update member permissions through proper channel and verify core data persists  
        contract.execute(set_permission_request(member.clone(), "groups/data_test/config".to_string(), MODERATE, None)).unwrap();
        
        let after_role_update_data = contract.get_member_data("data_test".to_string(), member.clone()).unwrap();
       assert_eq!(after_role_update_data["joined_at"], json!(initial_joined_at), 
                  "joined_at should persist after permission update");
       // Member data level remain unchanged when using set_permission
       assert_eq!(after_role_update_data["level"], json!(0), 
                "level remain unchanged in member data");
        
        // But verify the permission was actually granted
        assert!(contract.has_permission(owner.clone(), member.clone(), "groups/data_test/config".to_string(), MODERATE), 
               "Should have MODERATE permission on config path");

        println!("✅ Member data persists correctly across various operations");
    }

    #[test]
    fn test_member_data_cleanup_on_removal() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let member = accounts(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add member
        let config = json!({"member_driven": false, "is_private": false});
        contract.execute(create_group_request("cleanup_test".to_string(), config)).unwrap();
       contract.execute(add_group_member_request("cleanup_test".to_string(), member.clone())).unwrap();

        // Verify member data exists
        let member_data = contract.get_member_data("cleanup_test".to_string(), member.clone());
        assert!(member_data.is_some(), "Member data should exist");
        assert!(contract.is_group_member("cleanup_test".to_string(), member.clone()), "Should be a member");

        // Remove member and verify data cleanup
        contract.execute(remove_group_member_request("cleanup_test".to_string(), member.clone())).unwrap();
        
        let after_removal_data = contract.get_member_data("cleanup_test".to_string(), member.clone());
        assert!(after_removal_data.is_none() || after_removal_data == Some(serde_json::Value::Null), 
               "Member data should be cleaned up after removal");
        assert!(!contract.is_group_member("cleanup_test".to_string(), member.clone()), 
               "Should not be a member after removal");

        println!("✅ Member data is properly cleaned up on removal");
    }

    #[test]
    fn test_member_data_cleanup_on_blacklist() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let member = accounts(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add member
        let config = json!({"member_driven": false, "is_private": false});
        contract.execute(create_group_request("blacklist_cleanup_test".to_string(), config)).unwrap();
       contract.execute(add_group_member_request("blacklist_cleanup_test".to_string(), member.clone())).unwrap();

        // Grant additional permissions
        contract.execute(set_permission_request(member.clone(), "groups/blacklist_cleanup_test/special".to_string(), MODERATE, None)).unwrap();

        // Verify initial state
        assert!(contract.is_group_member("blacklist_cleanup_test".to_string(), member.clone()), "Should be a member");
        assert!(contract.has_permission(owner.clone(), member.clone(), "groups/blacklist_cleanup_test/special".to_string(), MODERATE), 
               "Should have special permissions");

        // Blacklist member
        contract.execute(blacklist_group_member_request("blacklist_cleanup_test".to_string(), member.clone())).unwrap();

        // Verify member data is cleaned up but blacklist entry exists
        assert!(!contract.is_group_member("blacklist_cleanup_test".to_string(), member.clone()), 
               "Should not be a member after blacklisting");
        assert!(contract.is_blacklisted("blacklist_cleanup_test".to_string(), member.clone()), 
               "Should be blacklisted");
        
        // Verify path-specific permissions are revoked by the permission system
        // The permission system checks membership and automatically revokes permissions for non-members
        assert!(!contract.has_permission(owner.clone(), member.clone(), "groups/blacklist_cleanup_test/special".to_string(), MODERATE), 
               "Path-specific permissions should be revoked when member is removed during blacklisting");

        let member_data = contract.get_member_data("blacklist_cleanup_test".to_string(), member.clone());
        assert!(member_data.is_none() || member_data == Some(serde_json::Value::Null), 
               "Member data should be cleaned up after blacklisting");

        println!("✅ Member data is properly cleaned up on blacklisting while maintaining blacklist entry and revoking permissions");
    }

    #[test]
    fn test_member_metadata_management() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let member = accounts(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add member
        let config = json!({"member_driven": false, "is_private": false});
        contract.execute(create_group_request("metadata_test".to_string(), config)).unwrap();
       contract.execute(add_group_member_request("metadata_test".to_string(), member.clone())).unwrap();

        // Verify standard metadata fields
        let member_data = contract.get_member_data("metadata_test".to_string(), member.clone()).unwrap();
        
        // Check required metadata fields
        assert!(member_data.get("level").is_some(), "Should have level metadata");
        assert!(member_data.get("granted_by").is_some(), "Should have granted_by metadata");
        assert!(member_data.get("joined_at").is_some(), "Should have joined_at metadata");
        
        // Verify metadata content
       assert_eq!(member_data["level"], json!(0), "Permission flags should match");
        assert_eq!(member_data["granted_by"], json!(owner.to_string()), "Granted by should match owner");
        
       let joined_at = member_data["joined_at"].as_str().unwrap().to_string();
       println!("Member joined at timestamp: {}", joined_at);

        // Test metadata after permission change
        contract.execute(set_permission_request(member.clone(), "groups/metadata_test/config".to_string(), MODERATE, None)).unwrap();
        
        let updated_data = contract.get_member_data("metadata_test".to_string(), member.clone()).unwrap();
        // Note: set_permission doesn't update member data level, it just grants path-specific permissions
       assert_eq!(updated_data["level"], json!(0), "Member data permission flags remain the same");
       assert_eq!(updated_data["joined_at"], json!(joined_at), "Original joined_at should be preserved");
        assert_eq!(updated_data["granted_by"], json!(owner.to_string()), "Original granted_by should be preserved");
        
        // Verify the permission was actually granted
        assert!(contract.has_permission(owner.clone(), member.clone(), "groups/metadata_test/config".to_string(), MODERATE), 
               "Should have MODERATE permission on config path");

        println!("✅ Member metadata is properly managed and preserved");
    }

    #[test]
    fn test_member_data_updates_and_versioning() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let admin = accounts(1);
        let member = accounts(2);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group with admin hierarchy
        let config = json!({"member_driven": false, "is_private": false});
        contract.execute(create_group_request("versioning_test".to_string(), config)).unwrap();
       contract.execute(add_group_member_request("versioning_test".to_string(), admin.clone())).unwrap();
       contract.execute(add_group_member_request("versioning_test".to_string(), member.clone())).unwrap();
        
        // Grant admin permission to manage config
              // set_permission does not consume attached_deposit, so ensure owner has a storage balance.
              contract
                     .execute(set_request(json!({"storage/deposit": {"amount": "1"}})))
                     .unwrap();
        contract.execute(set_permission_request(admin.clone(), "groups/versioning_test/config".to_string(), MANAGE, None)).unwrap();

        // Get initial data
        let initial_data = contract.get_member_data("versioning_test".to_string(), member.clone()).unwrap();
       let initial_timestamp = initial_data["joined_at"].as_str().unwrap().to_string();

        // Admin updates member permissions using set_permission
              near_sdk::testing_env!(get_context_with_deposit(admin.clone(), 1_000_000_000_000_000_000_000_000).build());
              // Ensure admin has storage balance for permission writes.
              contract
                     .execute(set_request(json!({"storage/deposit": {"amount": "1"}})))
                     .unwrap();
        contract.execute(set_permission_request(member.clone(), "groups/versioning_test/config".to_string(), MODERATE, None)).unwrap();

        // Verify permissions were updated (check with admin context since admin granted it)
        let has_moderate = contract.has_permission(admin.clone(), member.clone(), "groups/versioning_test/config".to_string(), MODERATE);
        assert!(has_moderate, "Member should have MODERATE permissions after update");
        
        // Original member data should persist
        let updated_data = contract.get_member_data("versioning_test".to_string(), member.clone()).unwrap();
       assert_eq!(updated_data["joined_at"], json!(initial_timestamp), "Original join timestamp preserved");
        
        // The granted_by field should still reflect original granter since we used set_permission
        assert_eq!(updated_data["granted_by"], json!(owner.to_string()), "Should preserve original granter");

        // Owner makes another permission update
        near_sdk::testing_env!(get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000).build());
              // Ensure owner has storage balance for permission writes.
              contract
                     .execute(set_request(json!({"storage/deposit": {"amount": "1"}})))
                     .unwrap();
        contract.execute(set_permission_request(member.clone(), "groups/versioning_test/config".to_string(), MANAGE, None)).unwrap();

        // Verify final permissions
        let has_manage = contract.has_permission(owner.clone(), member.clone(), "groups/versioning_test/config".to_string(), MANAGE);
        assert!(has_manage, "Member should have MANAGE permissions after final update");
        
        let final_data = contract.get_member_data("versioning_test".to_string(), member.clone()).unwrap();
        assert_eq!(final_data["granted_by"], json!(owner.to_string()), "Should preserve original granter");
       assert_eq!(final_data["joined_at"], json!(initial_timestamp), "Original join timestamp still preserved");

        println!("✅ Member data updates and change tracking work correctly");
    }

    #[test]
    fn test_member_data_integrity_across_complex_scenarios() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let member = accounts(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group
        let config = json!({"member_driven": false, "is_private": false});
        contract.execute(create_group_request("integrity_test".to_string(), config)).unwrap();
        
        // Complex scenario: add, remove, re-add member
       contract.execute(add_group_member_request("integrity_test".to_string(), member.clone())).unwrap();
        let first_join_data = contract.get_member_data("integrity_test".to_string(), member.clone()).unwrap();
       let first_join_time: u64 = first_join_data["joined_at"].as_str().unwrap().parse().unwrap();

        // Remove member
        contract.execute(remove_group_member_request("integrity_test".to_string(), member.clone())).unwrap();
        assert!(!contract.is_group_member("integrity_test".to_string(), member.clone()), "Should be removed");

        // Re-add member with different role
       contract.execute(add_group_member_request("integrity_test".to_string(), member.clone())).unwrap();
        let rejoin_data = contract.get_member_data("integrity_test".to_string(), member.clone()).unwrap();
       let rejoin_time: u64 = rejoin_data["joined_at"].as_str().unwrap().parse().unwrap();

        // Verify fresh start for re-joined member
       assert_eq!(rejoin_data["level"], json!(0), "Members start member-only on rejoin");
        assert!(rejoin_time >= first_join_time, "Rejoin timestamp should be newer or equal");
        assert_eq!(rejoin_data["granted_by"], json!(owner.to_string()), "Should track current granter");

        // Test blacklist and unblacklist cycle
        contract.execute(blacklist_group_member_request("integrity_test".to_string(), member.clone())).unwrap();
        assert!(contract.is_blacklisted("integrity_test".to_string(), member.clone()), "Should be blacklisted");
        assert!(!contract.is_group_member("integrity_test".to_string(), member.clone()), "Should not be member");

        contract.execute(unblacklist_group_member_request("integrity_test".to_string(), member.clone())).unwrap();
        assert!(!contract.is_blacklisted("integrity_test".to_string(), member.clone()), "Should not be blacklisted");
        assert!(!contract.is_group_member("integrity_test".to_string(), member.clone()), "Should not automatically be member");

        // Re-add after unblacklist
       contract.execute(add_group_member_request("integrity_test".to_string(), member.clone())).unwrap();
        let final_data = contract.get_member_data("integrity_test".to_string(), member.clone()).unwrap();
        
        // Verify clean state after complex lifecycle
       assert_eq!(final_data["level"], json!(0), "Should have clean member-only assignment");
       let final_join_time: u64 = final_data["joined_at"].as_str().unwrap().parse().unwrap();
       assert!(final_join_time >= rejoin_time, "Should have fresh timestamp");

        println!("✅ Member data integrity maintained across complex lifecycle scenarios");
    }

    #[test]
    fn test_permission_persistence_during_blacklist_cycles() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let member = accounts(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group and add member
        let config = json!({"member_driven": false, "is_private": false});
        contract.execute(create_group_request("permission_persistence_test".to_string(), config)).unwrap();
       contract.execute(add_group_member_request("permission_persistence_test".to_string(), member.clone())).unwrap();

        // Grant additional path-specific permissions
        contract.execute(set_permission_request(member.clone(), "groups/permission_persistence_test/posts".to_string(), MODERATE, None)).unwrap();
        contract.execute(set_permission_request(member.clone(), "groups/permission_persistence_test/admin".to_string(), MANAGE, None)).unwrap();

        // Verify initial permissions work
        assert!(contract.has_permission(owner.clone(), member.clone(), "groups/permission_persistence_test/posts".to_string(), MODERATE), 
               "Should have MODERATE permission on posts initially");
        assert!(contract.has_permission(owner.clone(), member.clone(), "groups/permission_persistence_test/admin".to_string(), MANAGE), 
               "Should have MANAGE permission on admin initially");

        // Blacklist member (removes membership, permissions become inaccessible)
        contract.execute(blacklist_group_member_request("permission_persistence_test".to_string(), member.clone())).unwrap();
        
        // Verify member is removed and permissions are inaccessible
        assert!(!contract.is_group_member("permission_persistence_test".to_string(), member.clone()), 
               "Should not be a member after blacklisting");
        assert!(!contract.has_permission(owner.clone(), member.clone(), "groups/permission_persistence_test/posts".to_string(), MODERATE), 
               "Should NOT have MODERATE permission while blacklisted");
        assert!(!contract.has_permission(owner.clone(), member.clone(), "groups/permission_persistence_test/admin".to_string(), MANAGE), 
               "Should NOT have MANAGE permission while blacklisted");

        // Unblacklist member
        contract.execute(unblacklist_group_member_request("permission_persistence_test".to_string(), member.clone())).unwrap();
        assert!(!contract.is_blacklisted("permission_persistence_test".to_string(), member.clone()), 
               "Should not be blacklisted after unblacklisting");

        // Re-add member with different permissions (simulating admin decision)
       contract.execute(add_group_member_request("permission_persistence_test".to_string(), member.clone())).unwrap();
        
        // Verify member is back and OLD permissions do NOT resurrect (nonce-scoped)
        assert!(contract.is_group_member("permission_persistence_test".to_string(), member.clone()), 
               "Should be a member after re-adding");
        
        // Old permissions SHOULD NOT be restored after rejoin.
        assert!(!contract.has_permission(owner.clone(), member.clone(), "groups/permission_persistence_test/posts".to_string(), MODERATE), 
               "Should NOT restore MODERATE permission on posts after rejoin");
        assert!(!contract.has_permission(owner.clone(), member.clone(), "groups/permission_persistence_test/admin".to_string(), MANAGE), 
               "Should NOT restore MANAGE permission on admin after rejoin");
        
              // Re-adding a member does not grant any elevated role flags (clean-add semantics).
              assert!(
                     !contract.has_permission(
                            owner.clone(),
                            member.clone(),
                            "groups/permission_persistence_test/config".to_string(),
                            MODERATE
                     ),
                     "Re-add should not implicitly grant MODERATE on config"
              );

              println!("✅ Permission behavior correct during blacklist cycles - old permissions do not resurrect after rejoin");
    }
}