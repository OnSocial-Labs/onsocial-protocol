use near_sdk::AccountId;
use serde_json::Value;

use crate::events::EventBuilder;
use crate::state::set_context::ApiOperationContext;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    /// Handle group pool deposit.
    pub(crate) fn handle_api_group_pool_deposit(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        let group_id: String = value
            .get("group_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| crate::invalid_input!("group_id required for group_pool_deposit"))?;

        let amount: u128 = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u128>().ok())
            .ok_or_else(|| crate::invalid_input!("amount required for group_pool_deposit"))?;

        Self::require_positive_amount(amount)?;

        // Use shared `attached_balance` for batch accounting.
        if *ctx.attached_balance < amount {
            return Err(crate::invalid_input!("Insufficient deposit for group pool"));
        }

        self.require_group_owner_or_manage(&group_id, account_id, "group_pool_deposit")?;

        *ctx.attached_balance = ctx.attached_balance.saturating_sub(amount);

        let pool_key = crate::state::models::SharedStoragePool::group_pool_key(&group_id)?;

        let mut storage = self.user_storage.get(&pool_key).cloned().unwrap_or_default();
        storage.storage_tracker.start_tracking();

        let mut pool = self.shared_storage_pools.get(&pool_key).cloned().unwrap_or_default();
        let is_new_pool = pool.storage_balance == 0;
        let previous_pool_balance = pool.storage_balance;
        pool.storage_balance = pool.storage_balance.saturating_add(amount);
        let new_pool_balance = pool.storage_balance;
        self.shared_storage_pools.insert(pool_key.clone(), pool);

        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        storage.storage_tracker.reset();

        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
        } else if delta < 0 {
            storage.used_bytes = storage
                .used_bytes
                .saturating_sub(delta.unsigned_abs() as u64);
        }
        self.user_storage.insert(pool_key.clone(), storage);

        if is_new_pool {
            EventBuilder::new(
                crate::constants::EVENT_TYPE_GROUP_UPDATE,
                "group_pool_created",
                account_id.clone(),
            )
            .with_field("group_id", group_id.clone())
            .with_field("pool_key", pool_key.to_string())
            .emit(ctx.event_batch);
        }

        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "group_pool_deposit",
            account_id.clone(),
        )
        .with_field("group_id", group_id)
        .with_field("pool_key", pool_key.to_string())
        .with_field("amount", amount.to_string())
        .with_field("previous_pool_balance", previous_pool_balance.to_string())
        .with_field("new_pool_balance", new_pool_balance.to_string())
        .emit(ctx.event_batch);

        Ok(())
    }
}
