//! Unit tests for domain/groups/permissions/kv/types.rs internal helpers
//!
//! Tests coverage for:
//! - normalize_group_path_owned: Path normalization edge cases
//! - get_parent_path: Parent path extraction
//! - parse_permission_value: Permission value parsing
//! - is_valid_permission_level: Level validation
//! - PermissionLevel: Enum behavior
//! - consider_permission_key: Permission key evaluation

#[cfg(test)]
mod types_tests {
    use crate::domain::groups::permissions::kv::types::{
        FULL_ACCESS, MANAGE, MODERATE, NONE, PermissionLevel, WRITE, get_parent_path,
        is_valid_permission_level, normalize_group_path_owned, parse_permission_value,
    };

    // =========================================================================
    // normalize_group_path_owned tests
    // =========================================================================

    #[test]
    fn test_normalize_group_path_direct_groups_prefix() {
        let result = normalize_group_path_owned("groups/mygroup/content");
        assert_eq!(result, Some("groups/mygroup/content".to_string()));
        println!("✅ normalize_group_path_owned preserves direct groups/ prefix");
    }

    #[test]
    fn test_normalize_group_path_prefixed_path() {
        let result = normalize_group_path_owned("alice.near/groups/mygroup/content");
        assert_eq!(result, Some("groups/mygroup/content".to_string()));
        println!("✅ normalize_group_path_owned strips prefix before /groups/");
    }

    #[test]
    fn test_normalize_group_path_just_groups_returns_none() {
        let result = normalize_group_path_owned("groups/");
        assert_eq!(result, None, "groups/ without id should return None");
        println!("✅ normalize_group_path_owned returns None for 'groups/'");
    }

    #[test]
    fn test_normalize_group_path_non_group_returns_none() {
        let result = normalize_group_path_owned("alice.near/profile");
        assert_eq!(result, None, "Non-group path should return None");
        println!("✅ normalize_group_path_owned returns None for non-group path");
    }

    #[test]
    fn test_normalize_group_path_empty_returns_none() {
        let result = normalize_group_path_owned("");
        assert_eq!(result, None, "Empty path should return None");
        println!("✅ normalize_group_path_owned returns None for empty path");
    }

    #[test]
    fn test_normalize_group_path_groups_slash_slash_returns_none() {
        // "groups//" has empty id
        let result = normalize_group_path_owned("groups//content");
        assert_eq!(result, None, "groups// should return None");
        println!("✅ normalize_group_path_owned returns None for 'groups//'");
    }

    #[test]
    fn test_normalize_group_path_deep_prefix() {
        let result = normalize_group_path_owned("a/b/c/groups/mygroup/data");
        assert_eq!(result, Some("groups/mygroup/data".to_string()));
        println!("✅ normalize_group_path_owned handles deep prefix");
    }

    // =========================================================================
    // get_parent_path tests
    // =========================================================================

    #[test]
    fn test_get_parent_path_nested() {
        let result = get_parent_path("groups/mygroup/content/posts");
        assert_eq!(result, Some("groups/mygroup/content".to_string()));
        println!("✅ get_parent_path returns parent for nested path");
    }

    #[test]
    fn test_get_parent_path_single_segment() {
        let result = get_parent_path("mygroup");
        assert_eq!(result, None, "Single segment has no parent");
        println!("✅ get_parent_path returns None for single segment");
    }

    #[test]
    fn test_get_parent_path_two_segments() {
        let result = get_parent_path("groups/mygroup");
        assert_eq!(result, Some("groups".to_string()));
        println!("✅ get_parent_path returns parent for two segments");
    }

    #[test]
    fn test_get_parent_path_empty() {
        let result = get_parent_path("");
        assert_eq!(result, None, "Empty path has no parent");
        println!("✅ get_parent_path returns None for empty path");
    }

    #[test]
    fn test_get_parent_path_root_slash() {
        let result = get_parent_path("/something");
        assert_eq!(
            result, None,
            "Path starting with / at position 0 returns None"
        );
        println!("✅ get_parent_path handles root slash correctly");
    }

    #[test]
    fn test_get_parent_path_trailing_slash() {
        let result = get_parent_path("groups/mygroup/");
        assert_eq!(result, Some("groups/mygroup".to_string()));
        println!("✅ get_parent_path handles trailing slash");
    }

    // =========================================================================
    // parse_permission_value tests
    // =========================================================================

    #[test]
    fn test_parse_permission_value_write_no_expiry() {
        let result = parse_permission_value("1:0");
        assert!(result.is_some());
        let (level, expires) = result.unwrap();
        assert_eq!(level, PermissionLevel::Write);
        assert_eq!(expires, 0);
        println!("✅ parse_permission_value parses WRITE:0");
    }

    #[test]
    fn test_parse_permission_value_moderate_with_expiry() {
        let result = parse_permission_value("2:1234567890");
        assert!(result.is_some());
        let (level, expires) = result.unwrap();
        assert_eq!(level, PermissionLevel::Moderate);
        assert_eq!(expires, 1234567890);
        println!("✅ parse_permission_value parses MODERATE with expiry");
    }

    #[test]
    fn test_parse_permission_value_manage() {
        let result = parse_permission_value("3:0");
        assert!(result.is_some());
        let (level, _expires) = result.unwrap();
        assert_eq!(level, PermissionLevel::Manage);
        println!("✅ parse_permission_value parses MANAGE");
    }

    #[test]
    fn test_parse_permission_value_none() {
        let result = parse_permission_value("0:0");
        assert!(result.is_some());
        let (level, _) = result.unwrap();
        assert_eq!(level, PermissionLevel::None);
        println!("✅ parse_permission_value parses NONE");
    }

    #[test]
    fn test_parse_permission_value_invalid_level() {
        let result = parse_permission_value("99:0");
        assert!(result.is_none(), "Invalid level should return None");
        println!("✅ parse_permission_value returns None for invalid level");
    }

    #[test]
    fn test_parse_permission_value_no_colon() {
        let result = parse_permission_value("10");
        assert!(result.is_none(), "Missing colon should return None");
        println!("✅ parse_permission_value returns None without colon");
    }

    #[test]
    fn test_parse_permission_value_non_numeric_level() {
        let result = parse_permission_value("abc:0");
        assert!(result.is_none(), "Non-numeric level should return None");
        println!("✅ parse_permission_value returns None for non-numeric level");
    }

    #[test]
    fn test_parse_permission_value_non_numeric_expiry() {
        let result = parse_permission_value("1:abc");
        assert!(result.is_none(), "Non-numeric expiry should return None");
        println!("✅ parse_permission_value returns None for non-numeric expiry");
    }

    #[test]
    fn test_parse_permission_value_empty() {
        let result = parse_permission_value("");
        assert!(result.is_none(), "Empty string should return None");
        println!("✅ parse_permission_value returns None for empty string");
    }

    #[test]
    fn test_parse_permission_value_multiple_colons() {
        let result = parse_permission_value("1:2:3");
        // split_once only splits at first colon, so "2:3" becomes expires_str
        assert!(result.is_none(), "Multiple colons cause parse failure");
        println!("✅ parse_permission_value handles multiple colons");
    }

    // =========================================================================
    // is_valid_permission_level tests
    // =========================================================================

    #[test]
    fn test_is_valid_permission_level_write() {
        assert!(is_valid_permission_level(WRITE, false));
        assert!(is_valid_permission_level(WRITE, true));
        println!("✅ is_valid_permission_level accepts WRITE");
    }

    #[test]
    fn test_is_valid_permission_level_moderate() {
        assert!(is_valid_permission_level(MODERATE, false));
        assert!(is_valid_permission_level(MODERATE, true));
        println!("✅ is_valid_permission_level accepts MODERATE");
    }

    #[test]
    fn test_is_valid_permission_level_manage() {
        assert!(is_valid_permission_level(MANAGE, false));
        assert!(is_valid_permission_level(MANAGE, true));
        println!("✅ is_valid_permission_level accepts MANAGE");
    }

    #[test]
    fn test_is_valid_permission_level_none_with_allow() {
        assert!(is_valid_permission_level(NONE, true));
        println!("✅ is_valid_permission_level accepts NONE when allow_none=true");
    }

    #[test]
    fn test_is_valid_permission_level_none_without_allow() {
        assert!(!is_valid_permission_level(NONE, false));
        println!("✅ is_valid_permission_level rejects NONE when allow_none=false");
    }

    #[test]
    fn test_is_valid_permission_level_invalid() {
        assert!(!is_valid_permission_level(99, false));
        assert!(!is_valid_permission_level(99, true));
        assert!(!is_valid_permission_level(FULL_ACCESS, false)); // FULL_ACCESS not valid for grants
        println!("✅ is_valid_permission_level rejects invalid levels");
    }

    // =========================================================================
    // PermissionLevel enum tests
    // =========================================================================

    #[test]
    fn test_permission_level_from_stored() {
        assert_eq!(PermissionLevel::from_stored(0), Some(PermissionLevel::None));
        assert_eq!(
            PermissionLevel::from_stored(1),
            Some(PermissionLevel::Write)
        );
        assert_eq!(
            PermissionLevel::from_stored(2),
            Some(PermissionLevel::Moderate)
        );
        assert_eq!(
            PermissionLevel::from_stored(3),
            Some(PermissionLevel::Manage)
        );
        assert_eq!(
            PermissionLevel::from_stored(0xFF),
            Some(PermissionLevel::FullAccess)
        );
        assert_eq!(PermissionLevel::from_stored(99), None);
        println!("✅ PermissionLevel::from_stored handles all cases");
    }

    #[test]
    fn test_permission_level_at_least() {
        assert!(PermissionLevel::Write.at_least(WRITE));
        assert!(!PermissionLevel::Write.at_least(MODERATE));
        assert!(PermissionLevel::Moderate.at_least(WRITE));
        assert!(PermissionLevel::Moderate.at_least(MODERATE));
        assert!(!PermissionLevel::Moderate.at_least(MANAGE));
        assert!(PermissionLevel::Manage.at_least(WRITE));
        assert!(PermissionLevel::Manage.at_least(MODERATE));
        assert!(PermissionLevel::Manage.at_least(MANAGE));
        assert!(PermissionLevel::FullAccess.at_least(MANAGE));
        assert!(PermissionLevel::None.at_least(NONE));
        assert!(!PermissionLevel::None.at_least(WRITE));
        println!("✅ PermissionLevel::at_least compares correctly");
    }

    #[test]
    fn test_permission_level_as_u8() {
        assert_eq!(PermissionLevel::None.as_u8(), 0);
        assert_eq!(PermissionLevel::Write.as_u8(), 1);
        assert_eq!(PermissionLevel::Moderate.as_u8(), 2);
        assert_eq!(PermissionLevel::Manage.as_u8(), 3);
        assert_eq!(PermissionLevel::FullAccess.as_u8(), 0xFF);
        println!("✅ PermissionLevel::as_u8 returns correct values");
    }

    #[test]
    fn test_permission_level_ordering() {
        // PermissionLevel derives Ord
        assert!(PermissionLevel::None < PermissionLevel::Write);
        assert!(PermissionLevel::Write < PermissionLevel::Moderate);
        assert!(PermissionLevel::Moderate < PermissionLevel::Manage);
        assert!(PermissionLevel::Manage < PermissionLevel::FullAccess);
        println!("✅ PermissionLevel ordering is correct");
    }
}
