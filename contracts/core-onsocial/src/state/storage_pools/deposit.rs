use near_sdk::AccountId;
use serde_json::Value;

use crate::events::EventBuilder;
use crate::json_api::set::types::ApiOperationContext;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(crate) fn handle_api_storage_deposit(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        let amount: u128 = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u128>().ok())
            .ok_or_else(|| crate::invalid_input!("amount required for storage deposit"))?;

        Self::require_positive_amount(amount)?;

        // Use shared `attached_balance` for batch accounting.
        if *ctx.attached_balance < amount {
            return Err(crate::invalid_input!("Insufficient deposit attached"));
        }

        *ctx.attached_balance = ctx.attached_balance.saturating_sub(amount);

        let mut storage = self.user_storage.get(account_id).cloned().unwrap_or_default();

        let previous_balance = storage.balance;

        storage.storage_tracker.start_tracking();

        storage.balance = storage.balance.saturating_add(amount);
        let new_balance = storage.balance;

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

        self.user_storage.insert(account_id.clone(), storage);

        EventBuilder::new(
            crate::constants::EVENT_TYPE_STORAGE_UPDATE,
            "storage_deposit",
            account_id.clone(),
        )
        .with_field("amount", amount.to_string())
        .with_field("previous_balance", previous_balance.to_string())
        .with_field("new_balance", new_balance.to_string())
        .emit(ctx.event_batch);

        Ok(())
    }
}
