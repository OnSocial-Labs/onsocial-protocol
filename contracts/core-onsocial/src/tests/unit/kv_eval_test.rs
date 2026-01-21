//! Unit tests for domain/groups/permissions/kv/eval.rs
//!
//! Tests coverage for:
//! - classify_group_path: Root, Config, Other classification
//! - extract_path_owner: Group and account path owner extraction
//! - has_permissions: Unified permission checks for groups and accounts
//! - get_user_permissions: Permission level retrieval

#[cfg(test)]
mod eval_tests {
    use crate::domain::groups::permissions::kv::types::{
        FULL_ACCESS, GroupPathKind, MANAGE, WRITE,
    };
    use crate::domain::groups::permissions::kv::{
        classify_group_path, extract_path_owner, get_user_permissions, has_permissions,
    };
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::accounts;
    use near_sdk::testing_env;

    fn test_account(index: usize) -> near_sdk::AccountId {
        accounts(index)
    }

    // =========================================================================
    // classify_group_path tests
    // =========================================================================

    #[test]
    fn test_classify_group_path_root_direct() {
        let result = classify_group_path("groups/mygroup");
        assert!(result.is_some(), "Should parse group root path");
        let info = result.unwrap();
        assert_eq!(info.group_id, "mygroup");
        assert_eq!(info.kind, GroupPathKind::Root);
        assert_eq!(info.normalized, "groups/mygroup");
        println!("✅ classify_group_path correctly identifies direct root path");
    }

    #[test]
    fn test_classify_group_path_root_with_trailing_slash() {
        let result = classify_group_path("groups/mygroup/");
        assert!(result.is_some(), "Should parse group root path with slash");
        let info = result.unwrap();
        assert_eq!(info.group_id, "mygroup");
        assert_eq!(info.kind, GroupPathKind::Root);
        println!("✅ classify_group_path correctly identifies root path with trailing slash");
    }

    #[test]
    fn test_classify_group_path_root_prefixed() {
        let result = classify_group_path("alice.near/groups/mygroup");
        assert!(result.is_some(), "Should parse prefixed group root path");
        let info = result.unwrap();
        assert_eq!(info.group_id, "mygroup");
        assert_eq!(info.kind, GroupPathKind::Root);
        assert_eq!(info.normalized, "groups/mygroup");
        println!("✅ classify_group_path correctly identifies prefixed root path");
    }

    #[test]
    fn test_classify_group_path_root_prefixed_with_trailing_slash() {
        let result = classify_group_path("alice.near/groups/mygroup/");
        assert!(
            result.is_some(),
            "Should parse prefixed group root with slash"
        );
        let info = result.unwrap();
        assert_eq!(info.group_id, "mygroup");
        assert_eq!(info.kind, GroupPathKind::Root);
        println!("✅ classify_group_path correctly identifies prefixed root with slash");
    }

    #[test]
    fn test_classify_group_path_config_direct() {
        let result = classify_group_path("groups/mygroup/config");
        assert!(result.is_some(), "Should parse group config path");
        let info = result.unwrap();
        assert_eq!(info.group_id, "mygroup");
        assert_eq!(info.kind, GroupPathKind::Config);
        println!("✅ classify_group_path correctly identifies config path");
    }

    #[test]
    fn test_classify_group_path_config_nested() {
        let result = classify_group_path("groups/mygroup/config/settings");
        assert!(result.is_some(), "Should parse nested config path");
        let info = result.unwrap();
        assert_eq!(info.group_id, "mygroup");
        assert_eq!(info.kind, GroupPathKind::Config);
        println!("✅ classify_group_path correctly identifies nested config path");
    }

    #[test]
    fn test_classify_group_path_config_prefixed() {
        let result = classify_group_path("alice.near/groups/mygroup/config");
        assert!(result.is_some(), "Should parse prefixed config path");
        let info = result.unwrap();
        assert_eq!(info.group_id, "mygroup");
        assert_eq!(info.kind, GroupPathKind::Config);
        println!("✅ classify_group_path correctly identifies prefixed config path");
    }

    #[test]
    fn test_classify_group_path_other_members() {
        let result = classify_group_path("groups/mygroup/members");
        assert!(result.is_some(), "Should parse members path");
        let info = result.unwrap();
        assert_eq!(info.group_id, "mygroup");
        assert_eq!(info.kind, GroupPathKind::Other);
        println!("✅ classify_group_path correctly identifies members as Other");
    }

    #[test]
    fn test_classify_group_path_other_content() {
        let result = classify_group_path("groups/mygroup/content/posts");
        assert!(result.is_some(), "Should parse content path");
        let info = result.unwrap();
        assert_eq!(info.group_id, "mygroup");
        assert_eq!(info.kind, GroupPathKind::Other);
        println!("✅ classify_group_path correctly identifies content as Other");
    }

    #[test]
    fn test_classify_group_path_non_group_returns_none() {
        let result = classify_group_path("alice.near/profile/name");
        assert!(result.is_none(), "Non-group path should return None");
        println!("✅ classify_group_path returns None for non-group path");
    }

    #[test]
    fn test_classify_group_path_just_groups_prefix_returns_none() {
        let result = classify_group_path("groups/");
        assert!(result.is_none(), "groups/ without id should return None");
        println!("✅ classify_group_path returns None for 'groups/' without id");
    }

    #[test]
    fn test_classify_group_path_empty_returns_none() {
        let result = classify_group_path("");
        assert!(result.is_none(), "Empty path should return None");
        println!("✅ classify_group_path returns None for empty path");
    }

    // =========================================================================
    // extract_path_owner tests
    // =========================================================================

    #[test]
    fn test_extract_path_owner_group_with_config() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request("extract_test".to_string(), json!({})))
            .unwrap();

        let result = extract_path_owner(&contract.platform, "groups/extract_test/content");
        assert_eq!(result, Some("extract_test".to_string()));
        println!("✅ extract_path_owner returns group_id when group config exists");
    }

    #[test]
    fn test_extract_path_owner_group_without_config_returns_none() {
        let contract = init_live_contract();
        let result = extract_path_owner(&contract.platform, "groups/nonexistent/content");
        assert_eq!(result, None, "Should return None when group config missing");
        println!("✅ extract_path_owner returns None when group config missing");
    }

    #[test]
    fn test_extract_path_owner_account_path() {
        let contract = init_live_contract();
        let result = extract_path_owner(&contract.platform, "alice.near/profile/name");
        assert_eq!(result, Some("alice.near".to_string()));
        println!("✅ extract_path_owner extracts first segment for account paths");
    }

    #[test]
    fn test_extract_path_owner_single_segment() {
        let contract = init_live_contract();
        let result = extract_path_owner(&contract.platform, "alice.near");
        assert_eq!(result, Some("alice.near".to_string()));
        println!("✅ extract_path_owner handles single segment path");
    }

    #[test]
    fn test_extract_path_owner_empty_path() {
        let contract = init_live_contract();
        let result = extract_path_owner(&contract.platform, "");
        assert_eq!(result, Some("".to_string()), "Empty first segment");
        println!("✅ extract_path_owner handles empty path");
    }

    // =========================================================================
    // has_permissions tests (unified API)
    // =========================================================================

    #[test]
    fn test_has_permissions_group_owner_always_passes() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request("owner_test".to_string(), json!({})))
            .unwrap();

        let result = has_permissions(
            &contract.platform,
            "owner_test",
            alice.as_str(),
            "groups/owner_test/anything",
            MANAGE,
        );
        assert!(result, "Owner should always have permissions");
        println!("✅ has_permissions returns true for group owner");
    }

    #[test]
    fn test_has_permissions_group_non_member_fails() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request("member_test".to_string(), json!({})))
            .unwrap();

        let result = has_permissions(
            &contract.platform,
            "member_test",
            bob.as_str(),
            "groups/member_test/content",
            WRITE,
        );
        assert!(!result, "Non-member should not have permissions");
        println!("✅ has_permissions returns false for non-member on group path");
    }

    #[test]
    fn test_has_permissions_account_self_always_passes() {
        let contract = init_live_contract();
        let alice = test_account(0);

        let result = has_permissions(
            &contract.platform,
            alice.as_str(),
            alice.as_str(),
            &format!("{}/profile", alice),
            MANAGE,
        );
        assert!(result, "User should have permissions on own path");
        println!("✅ has_permissions returns true for self on account path");
    }

    #[test]
    fn test_has_permissions_account_no_grant_fails() {
        let contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        let result = has_permissions(
            &contract.platform,
            alice.as_str(),
            bob.as_str(),
            &format!("{}/profile", alice),
            WRITE,
        );
        assert!(!result, "User without grant should not have permissions");
        println!("✅ has_permissions returns false without grant on account path");
    }

    // =========================================================================
    // get_user_permissions tests
    // =========================================================================

    #[test]
    fn test_get_user_permissions_group_owner_returns_full_access() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request(
                "perm_level_test".to_string(),
                json!({}),
            ))
            .unwrap();

        let level = get_user_permissions(
            &contract.platform,
            "perm_level_test",
            alice.as_str(),
            "groups/perm_level_test/anything",
        );
        assert_eq!(level, FULL_ACCESS, "Owner should have FULL_ACCESS");
        println!("✅ get_user_permissions returns FULL_ACCESS for group owner");
    }

    #[test]
    fn test_get_user_permissions_group_non_member_returns_zero() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request(
                "non_member_level".to_string(),
                json!({}),
            ))
            .unwrap();

        let level = get_user_permissions(
            &contract.platform,
            "non_member_level",
            bob.as_str(),
            "groups/non_member_level/content",
        );
        assert_eq!(level, 0, "Non-member should have 0 permission level");
        println!("✅ get_user_permissions returns 0 for non-member on group path");
    }

    #[test]
    fn test_get_user_permissions_account_self_returns_full_access() {
        let contract = init_live_contract();
        let alice = test_account(0);

        let level = get_user_permissions(
            &contract.platform,
            alice.as_str(),
            alice.as_str(),
            &format!("{}/profile", alice),
        );
        assert_eq!(level, FULL_ACCESS, "Self should have FULL_ACCESS");
        println!("✅ get_user_permissions returns FULL_ACCESS for self on account path");
    }

    #[test]
    fn test_get_user_permissions_account_no_grant_returns_zero() {
        let contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        let level = get_user_permissions(
            &contract.platform,
            alice.as_str(),
            bob.as_str(),
            &format!("{}/profile", alice),
        );
        assert_eq!(level, 0, "User without grant should have 0");
        println!("✅ get_user_permissions returns 0 without grant on account path");
    }
}
