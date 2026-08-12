use crate::{EntryView, PlatformPoolInfo, state::models::SocialPlatform};
use near_sdk::{AccountId, near, serde_json::Value};

use crate::{Contract, ContractExt};

#[near]
impl Contract {
    pub fn get(&self, keys: Vec<String>, account_id: Option<AccountId>) -> Vec<EntryView> {
        self.platform.get(keys, account_id)
    }

    pub fn get_one(&self, key: String, account_id: Option<AccountId>) -> EntryView {
        self.platform.get_one(key, account_id)
    }

    pub fn get_storage_balance(&self, account_id: AccountId) -> Option<crate::storage::Storage> {
        self.platform.get_account_storage(account_id.as_str())
    }

    pub fn get_platform_pool(&self) -> Option<PlatformPoolInfo> {
        let platform_account = SocialPlatform::platform_pool_account();
        self.platform
            .shared_storage_pools
            .get(&platform_account)
            .map(|pool| {
                let total_capacity_u128 =
                    pool.storage_balance / near_sdk::env::storage_byte_cost().as_yoctonear();
                let total_capacity_bytes = u64::try_from(total_capacity_u128).unwrap_or(u64::MAX);
                PlatformPoolInfo {
                    storage_balance: near_sdk::json_types::U128(pool.storage_balance),
                    total_bytes: total_capacity_bytes,
                    used_bytes: pool.used_bytes,
                    shared_bytes: pool.shared_bytes,
                    available_bytes: total_capacity_bytes.saturating_sub(pool.used_bytes),
                }
            })
    }

    pub fn get_group_pool_info(&self, group_id: String) -> Option<Value> {
        // Avoid panicking on invalid `group_id` in a view method.
        let pool_key = crate::state::models::SharedStoragePool::group_pool_key(&group_id).ok()?;
        let pool = self.platform.shared_storage_pools.get(&pool_key)?;

        let available_bytes = pool.available_bytes();
        let total_capacity_u128 =
            pool.storage_balance / near_sdk::env::storage_byte_cost().as_yoctonear();
        let total_capacity = u64::try_from(total_capacity_u128).unwrap_or(u64::MAX);

        Some(serde_json::json!({
            "pool_key": pool_key.to_string(),
            "storage_balance": pool.storage_balance.to_string(),
            "used_bytes": pool.used_bytes,
            "shared_bytes": pool.shared_bytes,
            "available_bytes": available_bytes,
            "total_capacity_bytes": total_capacity
        }))
    }

    pub fn get_shared_pool(&self, pool_id: AccountId) -> Option<Value> {
        let pool = self.platform.shared_storage_pools.get(&pool_id)?;

        let available_bytes = pool.available_bytes();
        let total_capacity_u128 =
            pool.storage_balance / near_sdk::env::storage_byte_cost().as_yoctonear();
        let total_capacity = u64::try_from(total_capacity_u128).unwrap_or(u64::MAX);

        Some(serde_json::json!({
            "pool_id": pool_id.to_string(),
            "storage_balance": pool.storage_balance.to_string(),
            "used_bytes": pool.used_bytes,
            "shared_bytes": pool.shared_bytes,
            "available_bytes": available_bytes,
            "total_capacity_bytes": total_capacity
        }))
    }

    pub fn get_platform_allowance(&self, account_id: AccountId) -> Value {
        let storage = self.platform.user_storage.get(&account_id);
        let config = &self.platform.config;

        let (allowance, first_write) = storage
            .map(|s| (s.platform_allowance, s.platform_first_write_ns))
            .unwrap_or((0, None));

        let is_active = storage.map(|s| s.platform_sponsored).unwrap_or(false);

        serde_json::json!({
            "current_allowance": allowance,
            "first_write_ns": first_write,
            "is_platform_sponsored": is_active,
            "config": {
                "onboarding_bytes": config.platform_onboarding_bytes,
                "daily_refill_bytes": config.platform_daily_refill_bytes,
                "max_allowance_bytes": config.platform_allowance_max_bytes
            }
        })
    }

    /// Live group-sponsor quota for `(group_id, target_id)`.
    ///
    /// Returns `null` when no quota row exists. Applies lazy default sync and
    /// refill on a clone only (view is read-only).
    pub fn get_group_sponsor_quota(
        &self,
        group_id: String,
        target_id: AccountId,
    ) -> Option<Value> {
        let quota_key =
            SocialPlatform::group_sponsor_quota_key(&target_id, &group_id);
        let mut quota = self.platform.group_sponsor_quotas.get(&quota_key).cloned()?;

        if !quota.is_override {
            if let Some(default_policy) = self.platform.group_sponsor_defaults.get(&group_id) {
                if quota.applied_default_version != default_policy.version {
                    quota.enabled = default_policy.enabled;
                    quota.daily_refill_bytes = default_policy.daily_refill_bytes;
                    quota.allowance_max_bytes = default_policy.allowance_max_bytes;
                    quota.applied_default_version = default_policy.version;
                }
            }
        }

        let now = near_sdk::env::block_timestamp();
        quota.refill(now);

        let used_bytes = quota
            .allowance_max_bytes
            .saturating_sub(quota.allowance_bytes.min(quota.allowance_max_bytes));

        Some(serde_json::json!({
            "group_id": group_id,
            "target_id": target_id.to_string(),
            "is_override": quota.is_override,
            "enabled": quota.enabled,
            "daily_refill_bytes": quota.daily_refill_bytes,
            "allowance_max_bytes": quota.allowance_max_bytes,
            "allowance_bytes": quota.allowance_bytes,
            "used_bytes": used_bytes,
            "applied_default_version": quota.applied_default_version,
            "last_refill_ns": quota.last_refill_ns
        }))
    }

    /// Live group-sponsor default policy for `group_id`.
    ///
    /// Returns `null` when no default has been set.
    pub fn get_group_sponsor_default(&self, group_id: String) -> Option<Value> {
        let default_policy = self.platform.group_sponsor_defaults.get(&group_id)?;
        Some(serde_json::json!({
            "group_id": group_id,
            "enabled": default_policy.enabled,
            "daily_refill_bytes": default_policy.daily_refill_bytes,
            "allowance_max_bytes": default_policy.allowance_max_bytes,
            "version": default_policy.version
        }))
    }
}
