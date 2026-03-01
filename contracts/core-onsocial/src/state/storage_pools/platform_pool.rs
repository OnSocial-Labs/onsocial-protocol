use near_sdk::AccountId;
use serde_json::Value;

use crate::SocialError;
use crate::events::EventBuilder;
use crate::state::models::SocialPlatform;
use crate::state::set_context::ApiOperationContext;

impl SocialPlatform {
    pub(crate) fn handle_api_platform_pool_deposit(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        let amount: u128 = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u128>().ok())
            .ok_or_else(|| crate::invalid_input!("amount required for platform_pool_deposit"))?;

        Self::require_minimum_pool_deposit(amount)?;

        if *ctx.attached_balance < amount {
            return Err(crate::invalid_input!(
                "Insufficient deposit for platform pool"
            ));
        }

        *ctx.attached_balance = ctx.attached_balance.saturating_sub(amount);

        self.platform_pool_deposit_internal(amount, account_id, ctx.event_batch)
    }

    pub(crate) fn platform_pool_deposit_internal(
        &mut self,
        amount: u128,
        donor: &AccountId,
        event_batch: &mut crate::events::EventBatch,
    ) -> Result<(), SocialError> {
        let platform_account = Self::platform_pool_account();

        let mut storage = self
            .user_storage
            .get(&platform_account)
            .cloned()
            .unwrap_or_default();
        storage.storage_tracker.start_tracking();

        let mut pool = self
            .shared_storage_pools
            .get(&platform_account)
            .cloned()
            .unwrap_or_default();
        let previous_pool_balance = pool.storage_balance;
        pool.storage_balance = pool.storage_balance.saturating_add(amount);
        let new_pool_balance = pool.storage_balance;
        self.shared_storage_pools
            .insert(platform_account.clone(), pool);

        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        storage.storage_tracker.reset();

        match delta.cmp(&0) {
            std::cmp::Ordering::Greater => {
                storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
                storage.assert_storage_covered()?;
            }
            std::cmp::Ordering::Less => {
                storage.used_bytes = storage
                    .used_bytes
                    .saturating_sub(delta.unsigned_abs() as u64);
            }
            std::cmp::Ordering::Equal => {}
        }
        self.user_storage.insert(platform_account.clone(), storage);

        EventBuilder::new(
            crate::constants::EVENT_TYPE_STORAGE_UPDATE,
            "platform_pool_deposit",
            donor.clone(),
        )
        .with_field("donor", donor.to_string())
        .with_field("amount", amount.to_string())
        .with_field("previous_pool_balance", previous_pool_balance.to_string())
        .with_field("new_pool_balance", new_pool_balance.to_string())
        .emit(event_batch);

        Ok(())
    }
}
