#[cfg(test)]
mod test_enhanced_permissions {
    use crate::domain::groups::permissions::kv::types::{FULL_ACCESS, MANAGE, WRITE};
    use crate::tests::test_utils::*;

    #[test]
    fn test_simple_permission_check() {
        let owner = test_account(0);
        let context = get_context(owner.clone());
        near_sdk::testing_env!(context.build());
        let contract = init_live_contract();

        // Test that the contract is in live mode
        let status = contract.get_contract_status();
        assert_eq!(
            status,
            crate::state::models::ContractStatus::Live,
            "Contract should be in Live mode"
        );

        // Simple test: check if we can read from a basic path
        let read_result = contract_get_values_map(
            &contract,
            vec!["test/path".to_string()],
            Some(owner.clone()),
        );
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
        assert!(contract.has_permission(
            owner.clone(),
            owner.clone(),
            test_path.clone(),
            FULL_ACCESS
        ));

        // Test specific permissions that owner should have (READ removed - everything readable by default)
        assert!(contract.has_permission(owner.clone(), owner.clone(), test_path.clone(), WRITE));
        assert!(contract.has_permission(owner.clone(), owner.clone(), test_path.clone(), MANAGE));

        // Other users should not have permissions without explicit grants
        assert!(!contract.has_permission(
            owner.clone(),
            other_user.clone(),
            test_path.clone(),
            WRITE
        ));
        assert!(!contract.has_permission(
            owner.clone(),
            other_user.clone(),
            test_path.clone(),
            MANAGE
        ));
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
        contract.execute(set_request(deposit_data)).unwrap();

        let test_path = format!("{}/test", owner.as_str());

        // Initially, grantee should not have write permission
        assert!(!contract.has_permission(owner.clone(), grantee.clone(), test_path.clone(), WRITE));

        // Grant write permission using the new API format
        let grant_data = serde_json::json!({
            "permission/grant": {
                "grantee": grantee.to_string(),
                "path": test_path,
                "level": WRITE
            }
        });
        let result = contract.execute(set_request(grant_data));
        assert!(result.is_ok());

        // Now grantee should have write permission
        assert!(contract.has_permission(owner.clone(), grantee.clone(), test_path.clone(), WRITE));
        // But not manage permission
        assert!(!contract.has_permission(
            owner.clone(),
            grantee.clone(),
            test_path.clone(),
            MANAGE
        ));

        // Revoke permission (set to 0) using the new API format
        let revoke_data = serde_json::json!({
            "permission/revoke": {
                "grantee": grantee.to_string(),
                "path": test_path
            }
        });
        let result = contract.execute(set_request(revoke_data));
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
        contract.execute(set_request(deposit_data)).unwrap();

        let test_path = format!("{}/test", owner.as_str());

        // Initially, grantee should have no permissions (flags = 0)
        let flags = contract.get_permissions(owner.clone(), grantee.clone(), test_path.clone());
        assert_eq!(flags, 0, "Grantee should have no permissions initially");

        // Grant WRITE permission (1)
        let grant_data = serde_json::json!({
            "permission/grant": {
                "grantee": grantee.to_string(),
                "path": test_path,
                "level": WRITE
            }
        });
        contract.execute(set_request(grant_data)).unwrap();

        // get_permissions should return WRITE flag (1)
        let flags = contract.get_permissions(owner.clone(), grantee.clone(), test_path.clone());
        assert_eq!(flags, WRITE, "Should return WRITE flag (1)");
        assert!(flags & WRITE != 0, "WRITE bit should be set");

        // Grant MANAGE permission (4). MANAGE implies WRITE in checks.
        let grant_manage = serde_json::json!({
            "permission/grant": {
                "grantee": grantee.to_string(),
                "path": test_path,
                "level": MANAGE
            }
        });
        contract.execute(set_request(grant_manage)).unwrap();

        // get_permissions should return the stored flag value
        let flags = contract.get_permissions(owner.clone(), grantee.clone(), test_path.clone());
        assert_eq!(flags, MANAGE, "Should return MANAGE (4)");
        assert!(flags & MANAGE != 0, "MANAGE bit should be set");

        // Revoke permissions
        let revoke_data = serde_json::json!({
            "permission/revoke": {
                "grantee": grantee.to_string(),
                "path": test_path
            }
        });
        contract.execute(set_request(revoke_data)).unwrap();

        // get_permissions should return 0 after revocation
        let flags = contract.get_permissions(owner.clone(), grantee.clone(), test_path.clone());
        assert_eq!(flags, 0, "Should return 0 after revocation");

        // Owner should always have full permissions on their own paths
        let owner_flags = contract.get_permissions(owner.clone(), owner.clone(), test_path.clone());
        assert_eq!(
            owner_flags, FULL_ACCESS,
            "Owner should have FULL_ACCESS (255)"
        );
    }

    #[test]
    #[should_panic(expected = "group permission nonce must be > 0")]
    fn test_build_group_permission_key_panics_on_zero_nonce() {
        use crate::domain::groups::permissions::kv::keys::build_group_permission_key;
        let _ =
            build_group_permission_key("test-group", "grantee.near", "groups/test-group/data", 0);
    }

    // =========================================================================
    // Unit tests for build_permission_key
    // =========================================================================

    mod build_permission_key_tests {
        use crate::domain::groups::permissions::kv::keys::build_permission_key;

        #[test]
        fn test_path_with_slash_prefix_matches_strips_prefix() {
            // Path contains '/' and starts with owner_or_group_id → strip prefix
            let key =
                build_permission_key("alice.near", "bob.near", "alice.near/documents/file.txt");
            assert_eq!(key, "alice.near/permissions/bob.near/documents/file.txt");
        }

        #[test]
        fn test_path_with_slash_prefix_mismatch_uses_original_path() {
            // Path contains '/' but does NOT start with owner_or_group_id → use original path
            let key =
                build_permission_key("alice.near", "bob.near", "other.near/documents/file.txt");
            assert_eq!(
                key,
                "alice.near/permissions/bob.near/other.near/documents/file.txt"
            );
        }

        #[test]
        fn test_path_without_slash_no_subpath() {
            // Path does NOT contain '/' → key without subpath component
            let key = build_permission_key("alice.near", "bob.near", "profile");
            assert_eq!(key, "alice.near/permissions/bob.near");
        }

        #[test]
        fn test_path_with_trailing_slash_only() {
            // Path is just "{owner}/" → strip prefix results in empty, but still has slash
            let key = build_permission_key("alice.near", "bob.near", "alice.near/");
            assert_eq!(key, "alice.near/permissions/bob.near/");
        }

        #[test]
        fn test_path_with_deep_nesting() {
            // Deep nested path with matching prefix
            let key = build_permission_key("alice.near", "bob.near", "alice.near/a/b/c/d/e");
            assert_eq!(key, "alice.near/permissions/bob.near/a/b/c/d/e");
        }

        #[test]
        fn test_empty_owner_id() {
            // Edge case: empty owner_or_group_id
            let key = build_permission_key("", "bob.near", "documents/file.txt");
            assert_eq!(key, "/permissions/bob.near/documents/file.txt");
        }
    }

    // =========================================================================
    // Unit tests for build_group_permission_key
    // =========================================================================

    mod build_group_permission_key_tests {
        use crate::domain::groups::permissions::kv::keys::build_group_permission_key;

        #[test]
        fn test_path_contains_groups_prefix_extracts_subpath() {
            // Path contains "groups/{id}/" → extract subpath
            let key = build_group_permission_key(
                "mygroup",
                "bob.near",
                "groups/mygroup/private/data",
                42,
            );
            assert_eq!(key, "groups/mygroup/permissions/bob.near/n42/private/data");
        }

        #[test]
        fn test_path_with_owner_prefix_extracts_subpath() {
            // Path like "alice.near/groups/{id}/..." → extract subpath after needle
            let key = build_group_permission_key(
                "mygroup",
                "bob.near",
                "alice.near/groups/mygroup/docs/file.txt",
                7,
            );
            assert_eq!(key, "groups/mygroup/permissions/bob.near/n7/docs/file.txt");
        }

        #[test]
        fn test_path_without_groups_prefix_empty_subpath() {
            // Path does NOT contain "groups/{id}/" → empty subpath
            let key = build_group_permission_key("mygroup", "bob.near", "some/other/path", 10);
            assert_eq!(key, "groups/mygroup/permissions/bob.near/n10");
        }

        #[test]
        fn test_path_exactly_groups_prefix_empty_subpath() {
            // Path is exactly "groups/{id}/" → subpath is empty
            let key = build_group_permission_key("mygroup", "bob.near", "groups/mygroup/", 5);
            assert_eq!(key, "groups/mygroup/permissions/bob.near/n5");
        }

        #[test]
        fn test_path_groups_prefix_no_trailing_content() {
            // Path is "groups/{id}" without trailing slash → needle not found, empty subpath
            let key = build_group_permission_key("mygroup", "bob.near", "groups/mygroup", 3);
            assert_eq!(key, "groups/mygroup/permissions/bob.near/n3");
        }

        #[test]
        fn test_deep_nested_subpath() {
            // Deep nested subpath after groups prefix
            let key = build_group_permission_key("g1", "bob.near", "groups/g1/a/b/c/d/e", 99);
            assert_eq!(key, "groups/g1/permissions/bob.near/n99/a/b/c/d/e");
        }

        #[test]
        fn test_nonce_value_1() {
            // Minimum valid nonce = 1
            let key = build_group_permission_key("grp", "bob.near", "groups/grp/data", 1);
            assert_eq!(key, "groups/grp/permissions/bob.near/n1/data");
        }

        #[test]
        fn test_nonce_large_value() {
            // Large nonce value
            let key = build_group_permission_key("grp", "bob.near", "groups/grp/x", u64::MAX);
            assert_eq!(
                key,
                format!("groups/grp/permissions/bob.near/n{}/x", u64::MAX)
            );
        }

        #[test]
        fn test_mismatched_group_id_in_path() {
            // Path contains different group id → needle not found, empty subpath
            let key =
                build_group_permission_key("mygroup", "bob.near", "groups/othergroup/data", 2);
            assert_eq!(key, "groups/mygroup/permissions/bob.near/n2");
        }
    }
}
