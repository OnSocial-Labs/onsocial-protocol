#[cfg(test)]
mod test_enhanced_permissions {
    use crate::groups::kv_permissions::{FULL_ACCESS, WRITE, MANAGE};
    use crate::tests::test_utils::*;

    #[test]
    fn test_simple_permission_check() {
        let owner = test_account(0);
        let context = get_context(owner.clone());
        near_sdk::testing_env!(context.build());
        let contract = init_live_contract();

        // Test that the contract is in live mode
        let status = contract.get_contract_status();
        assert_eq!(status, crate::state::models::ContractStatus::Live, "Contract should be in Live mode");

        // Simple test: check if we can read from a basic path
        let read_result = contract.get(vec!["test/path".to_string()], Some(owner.clone()), None, None);
        // Should succeed even if path doesn't exist
        assert!(read_result.is_empty() || read_result.contains_key("test/path"));
    }

    #[test]
    fn test_owner_has_full_permissions() {
        let owner = test_account(0);
        let other_user = test_account(1);
        let context = get_context(owner.clone());
        near_sdk::testing_env!(context.build());
        let contract = init_live_contract();

        // Test that owner has full permissions without explicit grants
        // Use the owner's account as the path they own
        let test_path = format!("{}/test", owner.as_str());

        // Owner should have all permissions (FULL_ACCESS = 255)
        assert!(contract.has_permission(owner.clone(), owner.clone(), test_path.clone(), FULL_ACCESS));

        // Test specific permissions that owner should have (READ removed - everything readable by default)
        assert!(contract.has_permission(owner.clone(), owner.clone(), test_path.clone(), WRITE));
        assert!(contract.has_permission(owner.clone(), owner.clone(), test_path.clone(), MANAGE));

        // Other users should not have permissions without explicit grants
        assert!(!contract.has_permission(owner.clone(), other_user.clone(), test_path.clone(), WRITE));
        assert!(!contract.has_permission(owner.clone(), other_user.clone(), test_path.clone(), MANAGE));
    }

    #[test]
    fn test_permission_grant_and_revoke() {
        let owner = test_account(0);
        let grantee = test_account(1);
        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());
        let mut contract = init_live_contract();

        // Set up storage balance for permission operations (soft delete requires storage for Deleted markers)
        let deposit_data = serde_json::json!({
            "storage/deposit": {
                "amount": "1000000000000000000000000"  // 1 NEAR
            }
        });
        contract.set(deposit_data, None).unwrap();

        let test_path = format!("{}/test", owner.as_str());

        // Initially, grantee should not have write permission
        assert!(!contract.has_permission(owner.clone(), grantee.clone(), test_path.clone(), WRITE));

        // Grant write permission using the new API format
        let grant_data = serde_json::json!({
            "permission/grant": {
                "grantee": grantee.to_string(),
                "path": test_path,
                "flags": WRITE
            }
        });
        let result = contract.set(grant_data, None);
        assert!(result.is_ok());

        // Now grantee should have write permission
        assert!(contract.has_permission(owner.clone(), grantee.clone(), test_path.clone(), WRITE));
        // But not manage permission
        assert!(!contract.has_permission(owner.clone(), grantee.clone(), test_path.clone(), MANAGE));

        // Revoke permission (set to 0) using the new API format
        let revoke_data = serde_json::json!({
            "permission/revoke": {
                "grantee": grantee.to_string(),
                "path": test_path
            }
        });
        let result = contract.set(revoke_data, None);
        assert!(result.is_ok());

        // Now grantee should not have write permission again
        assert!(!contract.has_permission(owner.clone(), grantee.clone(), test_path.clone(), WRITE));
    }

    #[test]
    fn test_get_permissions_returns_flags() {
        let owner = test_account(0);
        let grantee = test_account(1);
        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());
        let mut contract = init_live_contract();

        // Set up storage balance
        let deposit_data = serde_json::json!({
            "storage/deposit": {
                "amount": "1000000000000000000000000"  // 1 NEAR
            }
        });
        contract.set(deposit_data, None).unwrap();

        let test_path = format!("{}/test", owner.as_str());

        // Initially, grantee should have no permissions (flags = 0)
        let flags = contract.get_permissions(owner.clone(), grantee.clone(), test_path.clone());
        assert_eq!(flags, 0, "Grantee should have no permissions initially");

        // Grant WRITE permission (1)
        let grant_data = serde_json::json!({
            "permission/grant": {
                "grantee": grantee.to_string(),
                "path": test_path,
                "flags": WRITE
            }
        });
        contract.set(grant_data, None).unwrap();

        // get_permissions should return WRITE flag (1)
        let flags = contract.get_permissions(owner.clone(), grantee.clone(), test_path.clone());
        assert_eq!(flags, WRITE, "Should return WRITE flag (1)");
        assert!(flags & WRITE != 0, "WRITE bit should be set");

        // Grant additional MANAGE permission (4) - now should have WRITE | MANAGE = 5
        let grant_manage = serde_json::json!({
            "permission/grant": {
                "grantee": grantee.to_string(),
                "path": test_path,
                "flags": WRITE | MANAGE
            }
        });
        contract.set(grant_manage, None).unwrap();

        // get_permissions should return combined flags
        let flags = contract.get_permissions(owner.clone(), grantee.clone(), test_path.clone());
        assert_eq!(flags, WRITE | MANAGE, "Should return WRITE | MANAGE (5)");
        assert!(flags & WRITE != 0, "WRITE bit should be set");
        assert!(flags & MANAGE != 0, "MANAGE bit should be set");

        // Revoke permissions
        let revoke_data = serde_json::json!({
            "permission/revoke": {
                "grantee": grantee.to_string(),
                "path": test_path
            }
        });
        contract.set(revoke_data, None).unwrap();

        // get_permissions should return 0 after revocation
        let flags = contract.get_permissions(owner.clone(), grantee.clone(), test_path.clone());
        assert_eq!(flags, 0, "Should return 0 after revocation");

        // Owner should always have full permissions on their own paths
        let owner_flags = contract.get_permissions(owner.clone(), owner.clone(), test_path.clone());
        assert_eq!(owner_flags, FULL_ACCESS, "Owner should have FULL_ACCESS (255)");
    }
}