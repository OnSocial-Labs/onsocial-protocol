use near_sdk::AccountId;
use serde_json::Value;

use crate::events::EventBuilder;
use crate::json_api::set::types::ApiOperationContext;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    /// Handle storage withdraw.
    pub(crate) fn handle_api_storage_withdraw(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        actor_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        let amount: Option<u128> = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u128>().ok());

        let mut storage = self
            .user_storage
            .get(account_id)
            .cloned()
            .ok_or_else(|| crate::invalid_input!("Account not registered"))?;

        let previous_balance = storage.balance;

        let withdraw_amount = amount.unwrap_or(storage.balance);

        if let Some(requested) = amount {
            Self::require_positive_amount(requested)?;
        }

        let covered_bytes = storage
            .shared_storage
            .as_ref()
            .map(|s| s.used_bytes)
            .unwrap_or(0)
            .saturating_add(storage.group_pool_used_bytes)
            .saturating_add(storage.platform_pool_used_bytes);

        let used_balance = crate::storage::calculate_storage_balance_needed(
            crate::storage::calculate_effective_bytes(storage.used_bytes, covered_bytes),
        );
        let available = storage.balance.saturating_sub(used_balance);

        if withdraw_amount > available {
            return Err(crate::invalid_input!(
                "Withdrawal amount exceeds available balance"
            ));
        }

        storage.storage_tracker.start_tracking();

        // Update state before transfer.
        storage.balance = storage.balance.saturating_sub(withdraw_amount);

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

        if withdraw_amount > 0 {
            near_sdk::Promise::new(actor_id.clone())
                .transfer(near_sdk::NearToken::from_yoctonear(withdraw_amount))
                .detach();
        }

        let new_balance = previous_balance.saturating_sub(withdraw_amount);

        EventBuilder::new(
            crate::constants::EVENT_TYPE_STORAGE_UPDATE,
            "storage_withdraw",
            account_id.clone(),
        )
        .with_field("amount", withdraw_amount.to_string())
        .with_field("previous_balance", previous_balance.to_string())
        .with_field("new_balance", new_balance.to_string())
        .with_field("available_balance", available.to_string())
        .emit(ctx.event_batch);

        Ok(())
    }
}
