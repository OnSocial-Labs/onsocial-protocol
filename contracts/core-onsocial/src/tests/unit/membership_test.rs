//! Unit tests for domain/groups/permissions/kv/membership.rs
//!
//! Tests coverage for:
//! - get_group_member_nonce: returns Some(nonce) when nonce exists and is u64
//! - get_group_member_nonce: returns None when nonce path missing
//! - get_group_member_nonce: returns None when nonce value is not u64
//! - is_group_member: returns true for active member (DataValue::Value)
//! - is_group_member: returns false for deleted member (DataValue::Deleted)
//! - is_group_member: returns false when member path does not exist
//! - get_active_group_member_nonce: returns None when not a member
//! - get_active_group_member_nonce: returns None when member but nonce missing
//! - get_active_group_member_nonce: returns None when member but nonce == 0
//! - get_active_group_member_nonce: returns Some(nonce) when member and nonce > 0

#[cfg(test)]
mod membership_tests {
    use crate::domain::groups::permissions::kv::membership::{
        get_active_group_member_nonce, get_group_member_nonce, is_group_member,
    };
    use crate::state::models::DataValue;
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::accounts;
    use near_sdk::testing_env;

    // ========================================================================
    // get_group_member_nonce tests
    // ========================================================================

    #[test]
    fn test_get_group_member_nonce_returns_some_when_nonce_exists() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request("nonce_test".to_string(), json!({})))
            .unwrap();

        // Set a valid nonce for bob
        let nonce_path = format!("groups/nonce_test/member_nonces/{}", bob);
        contract
            .platform
            .storage_set(&nonce_path, &json!(42))
            .unwrap();

        // Verify get_group_member_nonce returns the nonce
        let result = get_group_member_nonce(&contract.platform, "nonce_test", bob.as_str());
        assert_eq!(result, Some(42), "Should return the stored nonce value");

        println!("✅ get_group_member_nonce returns Some(nonce) when nonce exists");
    }

    #[test]
    fn test_get_group_member_nonce_returns_none_when_path_missing() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group but don't set any nonce for bob
        contract
            .execute(create_group_request("no_nonce_test".to_string(), json!({})))
            .unwrap();

        // Verify get_group_member_nonce returns None
        let result = get_group_member_nonce(&contract.platform, "no_nonce_test", bob.as_str());
        assert_eq!(
            result, None,
            "Should return None when nonce path is missing"
        );

        println!("✅ get_group_member_nonce returns None when nonce path missing");
    }

    #[test]
    fn test_get_group_member_nonce_returns_none_when_value_not_u64() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request(
                "bad_nonce_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Set a non-u64 value (string) for nonce
        let nonce_path = format!("groups/bad_nonce_test/member_nonces/{}", bob);
        contract
            .platform
            .storage_set(&nonce_path, &json!("not_a_number"))
            .unwrap();

        // Verify get_group_member_nonce returns None for non-u64 value
        let result = get_group_member_nonce(&contract.platform, "bad_nonce_test", bob.as_str());
        assert_eq!(
            result, None,
            "Should return None when nonce value is not u64"
        );

        println!("✅ get_group_member_nonce returns None when value is not u64");
    }

    #[test]
    fn test_get_group_member_nonce_returns_none_for_object_value() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request(
                "object_nonce_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Set an object value instead of u64
        let nonce_path = format!("groups/object_nonce_test/member_nonces/{}", bob);
        contract
            .platform
            .storage_set(&nonce_path, &json!({"nonce": 5}))
            .unwrap();

        // Verify get_group_member_nonce returns None for object value
        let result = get_group_member_nonce(&contract.platform, "object_nonce_test", bob.as_str());
        assert_eq!(
            result, None,
            "Should return None when nonce value is an object"
        );

        println!("✅ get_group_member_nonce returns None for object value");
    }

    // ========================================================================
    // is_group_member tests
    // ========================================================================

    #[test]
    fn test_is_group_member_returns_true_for_active_member() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request(
                "member_active_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Add bob as member using test helper (creates valid member entry)
        test_add_member_bypass_proposals(
            &mut contract,
            "member_active_test",
            &bob,
            crate::domain::groups::permissions::kv::types::WRITE,
            &alice,
        );

        // Verify is_group_member returns true
        let result = is_group_member(&contract.platform, "member_active_test", bob.as_str());
        assert!(result, "Should return true for active member");

        println!("✅ is_group_member returns true for active member");
    }

    #[test]
    fn test_is_group_member_returns_false_for_deleted_member() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request(
                "member_deleted_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Add bob as member using test helper
        test_add_member_bypass_proposals(
            &mut contract,
            "member_deleted_test",
            &bob,
            crate::domain::groups::permissions::kv::types::WRITE,
            &alice,
        );

        // Verify bob is a member before deletion
        let is_member_before =
            is_group_member(&contract.platform, "member_deleted_test", bob.as_str());
        assert!(
            is_member_before,
            "Bob should be a member before soft delete"
        );

        // Soft delete the member entry using test helper (simulates removal)
        test_remove_member_bypass_proposals(&mut contract, "member_deleted_test", &bob);

        // Verify the entry exists but is soft-deleted (DataValue::Deleted)
        let member_path = format!("groups/member_deleted_test/members/{}", bob);
        let entry = contract.platform.get_entry(&member_path);
        assert!(
            entry.is_some(),
            "Entry should still exist after soft delete"
        );
        assert!(
            matches!(entry.unwrap().value, DataValue::Deleted(_)),
            "Entry should be DataValue::Deleted variant"
        );

        // Verify is_group_member returns false for deleted member
        let result = is_group_member(&contract.platform, "member_deleted_test", bob.as_str());
        assert!(
            !result,
            "Should return false for member with DataValue::Deleted"
        );

        println!("✅ is_group_member returns false for deleted member (DataValue::Deleted)");
    }

    #[test]
    fn test_is_group_member_returns_false_when_path_missing() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group but don't add bob
        contract
            .execute(create_group_request(
                "member_missing_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Verify is_group_member returns false
        let result = is_group_member(&contract.platform, "member_missing_test", bob.as_str());
        assert!(
            !result,
            "Should return false when member path does not exist"
        );

        println!("✅ is_group_member returns false when member path missing");
    }

    #[test]
    fn test_is_group_member_returns_false_for_nonexistent_group() {
        let contract = init_live_contract();
        let bob = accounts(1);

        // Query membership in a group that doesn't exist
        let result = is_group_member(&contract.platform, "nonexistent_group", bob.as_str());
        assert!(!result, "Should return false for non-existent group");

        println!("✅ is_group_member returns false for non-existent group");
    }

    // ========================================================================
    // get_active_group_member_nonce tests
    // ========================================================================

    #[test]
    fn test_get_active_group_member_nonce_returns_none_when_not_member() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group but don't add bob
        contract
            .execute(create_group_request(
                "active_nonce_not_member".to_string(),
                json!({}),
            ))
            .unwrap();

        // Even if nonce exists, should return None because bob is not a member
        let nonce_path = format!("groups/active_nonce_not_member/member_nonces/{}", bob);
        contract
            .platform
            .storage_set(&nonce_path, &json!(5))
            .unwrap();

        let result = get_active_group_member_nonce(
            &contract.platform,
            "active_nonce_not_member",
            bob.as_str(),
        );
        assert_eq!(result, None, "Should return None when user is not a member");

        println!("✅ get_active_group_member_nonce returns None when not a member");
    }

    #[test]
    fn test_get_active_group_member_nonce_returns_none_when_nonce_missing() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request(
                "active_nonce_missing".to_string(),
                json!({}),
            ))
            .unwrap();

        // Add bob as member entry but WITHOUT setting nonce (corrupted state)
        let member_path = format!("groups/active_nonce_missing/members/{}", bob);
        contract
            .platform
            .storage_set(
                &member_path,
                &json!({
                    "level": 1,
                    "joined_at": "1000000000",
                    "added_by": alice.to_string()
                }),
            )
            .unwrap();

        let result =
            get_active_group_member_nonce(&contract.platform, "active_nonce_missing", bob.as_str());
        assert_eq!(
            result, None,
            "Should return None when member exists but nonce is missing"
        );

        println!("✅ get_active_group_member_nonce returns None when nonce missing");
    }

    #[test]
    fn test_get_active_group_member_nonce_returns_none_when_nonce_zero() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request(
                "active_nonce_zero".to_string(),
                json!({}),
            ))
            .unwrap();

        // Add bob as member entry
        let member_path = format!("groups/active_nonce_zero/members/{}", bob);
        contract
            .platform
            .storage_set(
                &member_path,
                &json!({
                    "level": 1,
                    "joined_at": "1000000000",
                    "added_by": alice.to_string()
                }),
            )
            .unwrap();

        // Set nonce to 0 (invalid)
        let nonce_path = format!("groups/active_nonce_zero/member_nonces/{}", bob);
        contract
            .platform
            .storage_set(&nonce_path, &json!(0))
            .unwrap();

        let result =
            get_active_group_member_nonce(&contract.platform, "active_nonce_zero", bob.as_str());
        assert_eq!(result, None, "Should return None when nonce equals zero");

        println!("✅ get_active_group_member_nonce returns None when nonce is zero");
    }

    #[test]
    fn test_get_active_group_member_nonce_returns_some_for_valid_member() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request(
                "active_nonce_valid".to_string(),
                json!({}),
            ))
            .unwrap();

        // Add bob as proper member using test helper (sets both member entry and nonce)
        test_add_member_bypass_proposals(
            &mut contract,
            "active_nonce_valid",
            &bob,
            crate::domain::groups::permissions::kv::types::WRITE,
            &alice,
        );

        let result =
            get_active_group_member_nonce(&contract.platform, "active_nonce_valid", bob.as_str());
        assert!(
            result.is_some(),
            "Should return Some(nonce) for valid active member"
        );
        assert!(
            result.unwrap() > 0,
            "Nonce should be greater than 0 for active member"
        );

        println!("✅ get_active_group_member_nonce returns Some(nonce) for valid member");
    }

    #[test]
    fn test_get_active_group_member_nonce_preserves_nonce_value() {
        let mut contract = init_live_contract();
        let alice = accounts(0);
        let bob = accounts(1);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request(
                "nonce_value_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Add bob as member entry
        let member_path = format!("groups/nonce_value_test/members/{}", bob);
        contract
            .platform
            .storage_set(
                &member_path,
                &json!({
                    "level": 1,
                    "joined_at": "1000000000",
                    "added_by": alice.to_string()
                }),
            )
            .unwrap();

        // Set specific nonce value
        let nonce_path = format!("groups/nonce_value_test/member_nonces/{}", bob);
        contract
            .platform
            .storage_set(&nonce_path, &json!(999))
            .unwrap();

        let result =
            get_active_group_member_nonce(&contract.platform, "nonce_value_test", bob.as_str());
        assert_eq!(
            result,
            Some(999),
            "Should return the exact nonce value stored"
        );

        println!("✅ get_active_group_member_nonce preserves exact nonce value");
    }

    // ========================================================================
    // Edge cases and boundary conditions
    // ========================================================================

    #[test]
    fn test_membership_functions_with_empty_group_id() {
        let contract = init_live_contract();
        let bob = accounts(1);

        // Empty group_id should gracefully return false/None
        let is_member = is_group_member(&contract.platform, "", bob.as_str());
        assert!(
            !is_member,
            "Empty group_id should return false for is_group_member"
        );

        let nonce = get_group_member_nonce(&contract.platform, "", bob.as_str());
        assert_eq!(
            nonce, None,
            "Empty group_id should return None for get_group_member_nonce"
        );

        let active_nonce = get_active_group_member_nonce(&contract.platform, "", bob.as_str());
        assert_eq!(
            active_nonce, None,
            "Empty group_id should return None for get_active_group_member_nonce"
        );

        println!("✅ Membership functions handle empty group_id gracefully");
    }

    #[test]
    fn test_membership_functions_with_empty_member_id() {
        let mut contract = init_live_contract();
        let alice = accounts(0);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group
        contract
            .execute(create_group_request(
                "empty_member_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Empty member_id should gracefully return false/None
        let is_member = is_group_member(&contract.platform, "empty_member_test", "");
        assert!(
            !is_member,
            "Empty member_id should return false for is_group_member"
        );

        let nonce = get_group_member_nonce(&contract.platform, "empty_member_test", "");
        assert_eq!(
            nonce, None,
            "Empty member_id should return None for get_group_member_nonce"
        );

        let active_nonce =
            get_active_group_member_nonce(&contract.platform, "empty_member_test", "");
        assert_eq!(
            active_nonce, None,
            "Empty member_id should return None for get_active_group_member_nonce"
        );

        println!("✅ Membership functions handle empty member_id gracefully");
    }

    #[test]
    fn test_is_group_member_owner_is_member() {
        let mut contract = init_live_contract();
        let alice = accounts(0);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group - owner should be auto-added as member
        contract
            .execute(create_group_request(
                "owner_member_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Owner should be a member
        let result = is_group_member(&contract.platform, "owner_member_test", alice.as_str());
        assert!(result, "Group owner should be a member of their group");

        println!("✅ is_group_member returns true for group owner");
    }

    #[test]
    fn test_get_active_group_member_nonce_owner_has_nonce() {
        let mut contract = init_live_contract();
        let alice = accounts(0);

        testing_env!(
            get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build()
        );

        // Create group - owner should have nonce set
        contract
            .execute(create_group_request(
                "owner_nonce_test".to_string(),
                json!({}),
            ))
            .unwrap();

        // Owner should have an active nonce
        let result =
            get_active_group_member_nonce(&contract.platform, "owner_nonce_test", alice.as_str());
        assert!(result.is_some(), "Group owner should have an active nonce");
        assert!(result.unwrap() > 0, "Group owner's nonce should be > 0");

        println!("✅ get_active_group_member_nonce returns valid nonce for group owner");
    }
}
