// --- Group Stats Tests ---
// Tests for group statistics counter operations including underflow protection

#[cfg(test)]
mod stats_counter_tests {
    use crate::domain::groups::core::GroupStorage;
    use crate::events::EventBatch;
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;

    /// Test that decrementing a counter from 0 does not underflow
    /// Covers: stats.rs line 79 - saturating_sub protection
    #[test]
    fn test_counter_underflow_protection_member_count() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Set up context for alice
        let context = get_context_with_deposit(alice.clone(), 100_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group
        let group_id = "underflow_test";
        let config = json!({
            "description": "Test group for underflow",
            "is_private": false
        });
        contract
            .execute(create_group_request(group_id.to_string(), config))
            .expect("Group creation should succeed");

        // Manually set stats to have total_members = 0 (edge case)
        let stats_path = format!("groups/{}/stats", group_id);
        let zero_stats = json!({
            "total_members": 0,
            "total_join_requests": 0,
            "created_at": "1727740800000000000",
            "last_updated": "1727740800000000000"
        });
        contract
            .platform
            .storage_set(&stats_path, &zero_stats)
            .expect("Setting stats should succeed");

        // Verify stats are at 0
        let stats_before = GroupStorage::get_group_stats(&contract.platform, group_id);
        assert!(stats_before.is_some());
        assert_eq!(
            stats_before
                .as_ref()
                .unwrap()
                .get("total_members")
                .and_then(|v| v.as_u64()),
            Some(0)
        );

        // Attempt to decrement member count from 0 - should NOT underflow to u64::MAX
        let mut event_batch = EventBatch::new();
        let result = GroupStorage::decrement_member_count(
            &mut contract.platform,
            group_id,
            &alice,
            &mut event_batch,
        );
        assert!(result.is_ok(), "Decrement should succeed (saturating)");

        // Verify counter stayed at 0, not underflowed to u64::MAX
        let stats_after = GroupStorage::get_group_stats(&contract.platform, group_id);
        assert!(stats_after.is_some());
        let member_count = stats_after
            .as_ref()
            .unwrap()
            .get("total_members")
            .and_then(|v| v.as_u64());
        assert_eq!(
            member_count,
            Some(0),
            "Counter should remain 0, not underflow to u64::MAX"
        );

        println!("✓ Member count underflow protection test passed");
    }

    /// Test that decrementing join_requests from 0 does not underflow
    #[test]
    fn test_counter_underflow_protection_join_requests() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        let context = get_context_with_deposit(alice.clone(), 100_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        let group_id = "join_underflow_test";
        let config = json!({
            "description": "Test group",
            "is_private": true
        });
        contract
            .execute(create_group_request(group_id.to_string(), config))
            .expect("Group creation should succeed");

        // Force stats to 0 join requests
        let stats_path = format!("groups/{}/stats", group_id);
        let zero_stats = json!({
            "total_members": 1,
            "total_join_requests": 0,
            "created_at": "1727740800000000000",
            "last_updated": "1727740800000000000"
        });
        contract
            .platform
            .storage_set(&stats_path, &zero_stats)
            .expect("Set stats");

        // Decrement from 0
        let mut event_batch = EventBatch::new();
        let result = GroupStorage::decrement_join_request_count(
            &mut contract.platform,
            group_id,
            &alice,
            &mut event_batch,
        );
        assert!(result.is_ok());

        // Verify no underflow
        let stats_after = GroupStorage::get_group_stats(&contract.platform, group_id);
        let join_count = stats_after
            .as_ref()
            .unwrap()
            .get("total_join_requests")
            .and_then(|v| v.as_u64());
        assert_eq!(join_count, Some(0), "Join request counter should remain 0");

        println!("✓ Join request count underflow protection test passed");
    }

    /// Test that increment works correctly
    #[test]
    fn test_counter_increment() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        let context = get_context_with_deposit(alice.clone(), 100_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        let group_id = "increment_test";
        let config = json!({ "is_private": false });
        contract
            .execute(create_group_request(group_id.to_string(), config))
            .expect("Create group");

        // Get initial member count (should be 1 for owner)
        let initial_stats = GroupStorage::get_group_stats(&contract.platform, group_id);
        let initial_count = initial_stats
            .as_ref()
            .unwrap()
            .get("total_members")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        // Increment
        let mut event_batch = EventBatch::new();
        GroupStorage::increment_member_count(
            &mut contract.platform,
            group_id,
            &alice,
            &mut event_batch,
        )
        .expect("Increment should succeed");

        // Verify increment
        let after_stats = GroupStorage::get_group_stats(&contract.platform, group_id);
        let after_count = after_stats
            .as_ref()
            .unwrap()
            .get("total_members")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        assert_eq!(
            after_count,
            initial_count + 1,
            "Counter should increment by 1"
        );

        println!("✓ Counter increment test passed");
    }

    /// Test that last_updated is set on each update
    #[test]
    fn test_last_updated_timestamp() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        let context = get_context_with_deposit(alice.clone(), 100_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        let group_id = "timestamp_test";
        let config = json!({ "is_private": false });
        contract
            .execute(create_group_request(group_id.to_string(), config))
            .expect("Create group");

        let stats = GroupStorage::get_group_stats(&contract.platform, group_id);
        assert!(stats.is_some());

        let last_updated = stats
            .as_ref()
            .unwrap()
            .get("last_updated")
            .and_then(|v| v.as_str());
        assert!(last_updated.is_some(), "last_updated should be set");
        assert!(
            !last_updated.unwrap().is_empty(),
            "last_updated should not be empty"
        );

        let created_at = stats
            .as_ref()
            .unwrap()
            .get("created_at")
            .and_then(|v| v.as_str());
        assert!(created_at.is_some(), "created_at should be set");

        println!("✓ Timestamp fields test passed");
    }
}
