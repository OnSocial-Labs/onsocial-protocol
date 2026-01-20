use near_sdk::AccountId;
use serde_json::Value;

use crate::SocialError;
use crate::events::EventBuilder;
use crate::state::models::SocialPlatform;
use crate::state::set_context::ApiOperationContext;

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

        let mut storage = self
            .user_storage
            .get(account_id)
            .cloned()
            .unwrap_or_default();

        let previous_balance = storage.balance;

        storage.storage_tracker.start_tracking();

        storage.balance = storage.balance.saturating_add(amount);
        let new_balance = storage.balance;

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
