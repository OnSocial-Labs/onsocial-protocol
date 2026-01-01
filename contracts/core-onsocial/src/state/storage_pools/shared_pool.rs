use near_sdk::AccountId;
use serde_json::Value;

use crate::events::EventBuilder;
use crate::json_api::set::types::ApiOperationContext;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    /// Handle shared pool deposit.
    pub(crate) fn handle_api_shared_pool_deposit(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        let pool_id_str = value
            .get("pool_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("pool_id required for shared_pool_deposit"))?;

        let pool_id: AccountId = crate::validation::parse_account_id_str(
            pool_id_str,
            crate::invalid_input!("Invalid pool_id account ID"),
        )?;

        let amount: u128 = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u128>().ok())
            .ok_or_else(|| crate::invalid_input!("amount required for shared_pool_deposit"))?;

        Self::require_positive_amount(amount)?;

        if account_id != &pool_id {
            return Err(crate::unauthorized!("shared_pool_deposit", account_id.as_str()));
        }

        // Use shared `attached_balance` for batch accounting.
        if *ctx.attached_balance < amount {
            return Err(crate::invalid_input!("Insufficient deposit for shared pool"));
        }

        *ctx.attached_balance = ctx.attached_balance.saturating_sub(amount);

        let mut storage = self.user_storage.get(&pool_id).cloned().unwrap_or_default();

        storage.storage_tracker.start_tracking();

        let mut pool = self.shared_storage_pools.get(&pool_id).cloned().unwrap_or_default();
        let previous_pool_balance = pool.storage_balance;
        pool.storage_balance = pool.storage_balance.saturating_add(amount);
        let new_pool_balance = pool.storage_balance;
        self.shared_storage_pools.insert(pool_id.clone(), pool);

        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        storage.storage_tracker.reset();

        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
            storage.assert_storage_covered()?;
        } else if delta < 0 {
            storage.used_bytes = storage
                .used_bytes
                .saturating_sub(delta.unsigned_abs() as u64);
        }

        self.user_storage.insert(pool_id.clone(), storage);

        EventBuilder::new(
            crate::constants::EVENT_TYPE_STORAGE_UPDATE,
            "pool_deposit",
            account_id.clone(),
        )
        .with_field("pool_id", pool_id.to_string())
        .with_field("amount", amount.to_string())
        .with_field("previous_pool_balance", previous_pool_balance.to_string())
        .with_field("new_pool_balance", new_pool_balance.to_string())
        .emit(ctx.event_batch);

        Ok(())
    }
}
