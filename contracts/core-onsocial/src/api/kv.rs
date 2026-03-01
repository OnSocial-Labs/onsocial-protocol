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

    pub fn get_nonce(
        &self,
        account_id: AccountId,
        public_key: near_sdk::PublicKey,
    ) -> near_sdk::json_types::U64 {
        near_sdk::json_types::U64(crate::state::models::SocialPlatform::read_nonce(
            &account_id,
            &public_key,
        ))
    }
}
