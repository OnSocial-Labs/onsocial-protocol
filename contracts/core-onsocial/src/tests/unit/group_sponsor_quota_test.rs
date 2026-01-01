#[cfg(test)]
mod group_sponsor_quota_tests {
    use crate::tests::test_utils::*;
    use crate::state::models::GroupSponsorAccount;
    use near_sdk::serde_json::json;
    use near_sdk::{testing_env, NearToken};

    #[test]
    fn test_group_sponsor_quota_spends_on_group_write() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let target = test_account(1);
        let group_id = "g1";

        // Owner funds their own storage via set(), then writes group config via low-level storage_set
        // (bypasses permission checks that apply to user-path set()).
        let deposit_attached = NearToken::from_near(3).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), deposit_attached).build());

        let owner_deposit = NearToken::from_near(2).as_yoctonear();
        let deposit_call = json!({
            "storage/deposit": { "amount": owner_deposit.to_string() }
        });
        contract
            .set(set_request(deposit_call, None))
            .expect("deposit should succeed");

        contract
            .platform
            .storage_set("groups/g1/config", &json!({"owner": owner.to_string()}))
            .expect("writing group config should succeed");

        // Fund group pool and set quota.
        let pool_deposit = NearToken::from_near(1).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), pool_deposit).build());
        let setup = json!({
            "storage/group_pool_deposit": { "group_id": group_id, "amount": pool_deposit.to_string() },
            "storage/group_sponsor_quota_set": {
                "group_id": group_id,
                "target_id": target.to_string(),
                "enabled": true,
                "daily_refill_bytes": 0,
                "allowance_max_bytes": 10_000
            }
        });
        contract
            .set(set_request(setup, None))
            .expect("setup should succeed");

        // Target writes to a group path without any personal deposit; should be sponsored by group pool.
        testing_env!(get_context(target.clone()).build());

        let res = contract
            .platform
            .storage_write_string("groups/g1/test_key", "x", None);
        assert!(res.is_ok(), "group-sponsored write should succeed");

        // Quota should be consumed (allowance decreases).
        let quota_key = crate::state::models::SocialPlatform::group_sponsor_quota_key(&target, group_id);
        let quota = contract
            .platform
            .group_sponsor_quotas
            .get(&quota_key)
            .expect("quota should exist");

        assert!(quota.allowance_bytes < quota.allowance_max_bytes, "allowance should decrease after spend");
    }

    #[test]
    fn test_group_sponsor_quota_blocks_when_exhausted() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let target = test_account(1);
        let group_id = "g1";

        // Setup group and pool, but set target quota extremely low.
        let deposit_attached = NearToken::from_near(3).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), deposit_attached).build());

        let owner_deposit = NearToken::from_near(2).as_yoctonear();
        let deposit_call = json!({
            "storage/deposit": { "amount": owner_deposit.to_string() }
        });
        contract
            .set(set_request(deposit_call, None))
            .expect("deposit should succeed");

        contract
            .platform
            .storage_set("groups/g1/config", &json!({"owner": owner.to_string()}))
            .expect("writing group config should succeed");

        let pool_deposit = NearToken::from_near(1).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), pool_deposit).build());
        let setup = json!({
            "storage/group_pool_deposit": { "group_id": group_id, "amount": pool_deposit.to_string() },
            "storage/group_sponsor_quota_set": {
                "group_id": group_id,
                "target_id": target.to_string(),
                "enabled": true,
                "daily_refill_bytes": 0,
                "allowance_max_bytes": 1
            }
        });
        contract
            .set(set_request(setup, None))
            .expect("setup should succeed");

        // Target attempts group write without personal balance; should fail due to quota gating.
        testing_env!(get_context(target.clone()).build());
        let res = contract
            .platform
            .storage_write_string("groups/g1/test_key_blocked", "x", None);

        assert!(res.is_err(), "write should fail when quota is exhausted");

        if let Err(e) = res {
            match e {
                crate::errors::SocialError::InsufficientStorage(_) => {}
                other => panic!("expected InsufficientStorage, got: {:?}", other),
            }
        }
    }

    #[test]
    fn test_group_sponsor_default_applies_to_unassigned_members() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let target = test_account(1);
        let group_id = "g1";

        // Prepare group config.
        let deposit_attached = NearToken::from_near(3).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), deposit_attached).build());

        let owner_deposit = NearToken::from_near(2).as_yoctonear();
        let deposit_call = json!({
            "storage/deposit": { "amount": owner_deposit.to_string() }
        });
        contract
            .set(set_request(deposit_call, None))
            .expect("deposit should succeed");

        contract
            .platform
            .storage_set("groups/g1/config", &json!({"owner": owner.to_string()}))
            .expect("writing group config should succeed");

        // Fund pool and set default quota (no per-user quota for target).
        let pool_deposit = NearToken::from_near(1).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), pool_deposit).build());
        let setup = json!({
            "storage/group_pool_deposit": { "group_id": group_id, "amount": pool_deposit.to_string() },
            "storage/group_sponsor_default_set": {
                "group_id": group_id,
                "enabled": true,
                "daily_refill_bytes": 0,
                "allowance_max_bytes": 10_000
            }
        });
        contract
            .set(set_request(setup, None))
            .expect("setup should succeed");

        // Target writes to group path; should be sponsored via default quota.
        testing_env!(get_context(target.clone()).build());
        let res = contract
            .platform
            .storage_write_string("groups/g1/test_key_default", "x", None);
        assert!(res.is_ok(), "group-sponsored write should succeed via default policy");

        // A per-user quota record should be lazily created and consumed.
        let quota_key = crate::state::models::SocialPlatform::group_sponsor_quota_key(&target, group_id);
        let quota = contract
            .platform
            .group_sponsor_quotas
            .get(&quota_key)
            .expect("quota should be created from default policy");

        assert!(!quota.is_override, "default-derived quota must not be marked as override");
        assert_eq!(quota.applied_default_version, 1, "default-derived quota must track the current default version");
        assert!(quota.last_refill_ns > 0, "default-derived quota must initialize last_refill_ns");
        assert!(quota.allowance_bytes < quota.allowance_max_bytes, "allowance should decrease after spend");
    }

    #[test]
    fn test_group_sponsor_default_update_syncs_quota_without_clamping_allowance() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let target = test_account(1);
        let group_id = "g1";

        // Prepare group config.
        let deposit_attached = NearToken::from_near(3).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), deposit_attached).build());

        let owner_deposit = NearToken::from_near(2).as_yoctonear();
        let deposit_call = json!({
            "storage/deposit": { "amount": owner_deposit.to_string() }
        });
        contract
            .set(set_request(deposit_call, None))
            .expect("deposit should succeed");

        contract
            .platform
            .storage_set("groups/g1/config", &json!({"owner": owner.to_string()}))
            .expect("writing group config should succeed");

        // Fund pool and set initial default quota large enough that allowance remains well above
        // the new max after an update.
        let pool_deposit = NearToken::from_near(1).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), pool_deposit).build());
        let setup_v1 = json!({
            "storage/group_pool_deposit": { "group_id": group_id, "amount": pool_deposit.to_string() },
            "storage/group_sponsor_default_set": {
                "group_id": group_id,
                "enabled": true,
                "daily_refill_bytes": 0,
                "allowance_max_bytes": 50_000
            }
        });
        contract
            .set(set_request(setup_v1, None))
            .expect("setup v1 should succeed");

        // Target writes once to create + spend from the default-derived quota.
        testing_env!(get_context(target.clone()).build());
        contract
            .platform
            .storage_write_string("groups/g1/test_key_default_v1", "x", None)
            .expect("group-sponsored write should succeed");

        let quota_key = crate::state::models::SocialPlatform::group_sponsor_quota_key(&target, group_id);
        let q_before = contract
            .platform
            .group_sponsor_quotas
            .get(&quota_key)
            .expect("quota should exist");
        assert!(!q_before.is_override);
        assert_eq!(q_before.applied_default_version, 1);
        assert!(q_before.allowance_bytes > 0);

        // Update default to a much smaller max; this should sync policy fields but NOT clamp
        // allowance_bytes down.
        let setup_v2 = json!({
            "storage/group_sponsor_default_set": {
                "group_id": group_id,
                "enabled": true,
                "daily_refill_bytes": 0,
                "allowance_max_bytes": 100
            }
        });
        testing_env!(get_context(owner.clone()).build());
        contract
            .set(set_request(setup_v2, None))
            .expect("setup v2 should succeed");

        // Trigger lazy sync via another sponsored write.
        testing_env!(get_context(target.clone()).build());
        contract
            .platform
            .storage_write_string("groups/g1/test_key_default_v2", "y", None)
            .expect("group-sponsored write should succeed after default update");

        let q_after = contract
            .platform
            .group_sponsor_quotas
            .get(&quota_key)
            .expect("quota should still exist");

        assert!(!q_after.is_override);
        assert_eq!(q_after.applied_default_version, 2, "quota should lazily sync to the new default version");
        assert_eq!(q_after.allowance_max_bytes, 100, "quota max should sync to new default");
        assert!(
            q_after.allowance_bytes > q_after.allowance_max_bytes,
            "allowance should not be clamped down when default max decreases"
        );
    }

    #[test]
    fn test_group_sponsor_default_blocks_when_exhausted() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let target = test_account(1);
        let group_id = "g1";

        // Prepare group config.
        let deposit_attached = NearToken::from_near(3).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), deposit_attached).build());

        let owner_deposit = NearToken::from_near(2).as_yoctonear();
        let deposit_call = json!({
            "storage/deposit": { "amount": owner_deposit.to_string() }
        });
        contract
            .set(set_request(deposit_call, None))
            .expect("deposit should succeed");

        contract
            .platform
            .storage_set("groups/g1/config", &json!({"owner": owner.to_string()}))
            .expect("writing group config should succeed");

        // Fund pool and set default quota extremely low.
        let pool_deposit = NearToken::from_near(1).as_yoctonear();
        testing_env!(get_context_with_deposit(owner.clone(), pool_deposit).build());
        let setup = json!({
            "storage/group_pool_deposit": { "group_id": group_id, "amount": pool_deposit.to_string() },
            "storage/group_sponsor_default_set": {
                "group_id": group_id,
                "enabled": true,
                "daily_refill_bytes": 0,
                "allowance_max_bytes": 1
            }
        });
        contract
            .set(set_request(setup, None))
            .expect("setup should succeed");

        // Target attempts group write without personal balance; should fail due to default gating.
        testing_env!(get_context(target.clone()).build());
        let res = contract
            .platform
            .storage_write_string("groups/g1/test_key_default_blocked", "x", None);

        assert!(res.is_err(), "write should fail when default quota is exhausted");
    }

    #[test]
    fn test_group_sponsor_quota_refill_is_proportional_and_capped() {
        // Deterministic refill test (no env timestamps needed).
        let mut q = GroupSponsorAccount {
            is_override: false,
            applied_default_version: 0,
            enabled: true,
            daily_refill_bytes: 100,
            allowance_max_bytes: 150,
            allowance_bytes: 0,
            last_refill_ns: 1,
        };

        // 2 days elapsed => refill 200, capped at 150.
        let two_days_ns = 2 * crate::constants::NANOS_PER_DAY;
        q.refill(1 + two_days_ns);

        assert_eq!(q.allowance_bytes, 150);
        assert_eq!(q.last_refill_ns, 1 + two_days_ns);
    }

    #[test]
    fn test_group_sponsor_quota_refill_skips_tiny_intervals_and_initializes_timestamp() {
        let mut q = GroupSponsorAccount {
            is_override: false,
            applied_default_version: 0,
            enabled: true,
            daily_refill_bytes: 100,
            allowance_max_bytes: 1_000,
            allowance_bytes: 0,
            last_refill_ns: 0,
        };

        // First refill call should only initialize last_refill_ns.
        q.refill(123);
        assert_eq!(q.last_refill_ns, 123);
        assert_eq!(q.allowance_bytes, 0);

        // Less than 1 minute later: no refill.
        q.refill(123 + 59_000_000_000);
        assert_eq!(q.allowance_bytes, 0);

        // Refill is proportional and uses integer division, so we need a sufficiently
        // large interval to yield at least 1 byte at 100 bytes/day.
        // 20 minutes is safely above the ~14.4 minute threshold for 1 byte.
        q.refill(123 + 20 * 60_000_000_000);
        assert!(q.allowance_bytes > 0);
    }

    #[test]
    fn test_group_sponsor_quota_refill_does_not_clamp_down_when_over_max() {
        use crate::state::models::GroupSponsorAccount;

        // Start above max (e.g., max was reduced). Allowance should remain as-is until spent.
        let mut q = GroupSponsorAccount {
            is_override: false,
            applied_default_version: 0,
            enabled: true,
            daily_refill_bytes: 10_000,
            allowance_max_bytes: 50,
            allowance_bytes: 100,
            last_refill_ns: 1,
        };

        let now = 86_400_000_000_000u64 + 1; // > 1 day later
        q.refill(now);

        assert_eq!(q.allowance_bytes, 100, "refill must not clamp allowance down when over max");
        assert_eq!(q.last_refill_ns, now, "timestamp should advance to avoid refill accumulation");
    }

    #[test]
    fn test_group_sponsor_quota_disabled_is_not_gated_and_refill_is_noop() {
        let mut q = GroupSponsorAccount {
            is_override: false,
            applied_default_version: 0,
            enabled: false,
            daily_refill_bytes: 999,
            allowance_max_bytes: 100,
            allowance_bytes: 0,
            last_refill_ns: 1,
        };

        // Disabled quotas are treated as "no quota gating".
        assert!(q.can_spend(1));
        assert!(q.can_spend(u64::MAX));

        // spend() should be a no-op when disabled.
        q.spend(10);
        assert_eq!(q.allowance_bytes, 0);

        // refill() should also be a no-op when disabled.
        q.refill(1 + crate::constants::NANOS_PER_DAY);
        assert_eq!(q.last_refill_ns, 1);
        assert_eq!(q.allowance_bytes, 0);
    }

    #[test]
    fn test_group_sponsor_quota_refill_does_not_update_timestamp_when_refill_is_zero() {
        let mut q = GroupSponsorAccount {
            is_override: false,
            applied_default_version: 0,
            enabled: true,
            // Intentionally tiny rate so even >= 1 minute elapsed yields 0 bytes.
            daily_refill_bytes: 1,
            allowance_max_bytes: 10,
            allowance_bytes: 0,
            last_refill_ns: 100,
        };

        // >= 1 minute elapsed but (elapsed * daily / day) floors to 0.
        let now = 100 + crate::constants::NANOS_PER_MINUTE;
        q.refill(now);

        // When refill_bytes == 0, we intentionally do NOT advance the timestamp,
        // so time accumulates until at least 1 byte can be added.
        assert_eq!(q.allowance_bytes, 0);
        assert_eq!(q.last_refill_ns, 100);
    }

    #[test]
    fn test_group_sponsor_quota_refill_advances_timestamp_when_exactly_at_max() {
        let mut q = GroupSponsorAccount {
            is_override: false,
            applied_default_version: 0,
            enabled: true,
            daily_refill_bytes: 10_000,
            allowance_max_bytes: 50,
            allowance_bytes: 50,
            last_refill_ns: 1,
        };

        let now = 1 + crate::constants::NANOS_PER_DAY;
        q.refill(now);

        assert_eq!(q.allowance_bytes, 50);
        assert_eq!(q.last_refill_ns, now);
    }

    #[test]
    fn test_group_sponsor_quota_refill_is_noop_when_time_goes_backwards() {
        let mut q = GroupSponsorAccount {
            is_override: false,
            applied_default_version: 0,
            enabled: true,
            daily_refill_bytes: 10_000,
            allowance_max_bytes: 50,
            allowance_bytes: 0,
            last_refill_ns: 1_000,
        };

        // now < last_refill_ns => saturating_sub makes elapsed 0 => < 1 minute => no-op.
        q.refill(999);
        assert_eq!(q.allowance_bytes, 0);
        assert_eq!(q.last_refill_ns, 1_000);
    }
}
