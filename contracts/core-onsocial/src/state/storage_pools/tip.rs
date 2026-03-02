use near_sdk::AccountId;
use serde_json::Value;

use crate::SocialError;
use crate::events::EventBuilder;
use crate::state::models::SocialPlatform;
use crate::state::set_context::ApiOperationContext;

impl SocialPlatform {
    /// Balance-to-balance NEAR transfer. No Promise — purely internal ledger movement.
    pub(crate) fn handle_api_storage_tip(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        _actor_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        let target_id_str = value
            .get("target_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("target_id required for storage tip"))?;

        let target_id: AccountId = crate::validation::parse_account_id_str(
            target_id_str,
            crate::invalid_input!("Invalid target_id account ID"),
        )?;

        let amount: u128 = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u128>().ok())
            .ok_or_else(|| crate::invalid_input!("amount required for storage tip"))?;

        Self::require_positive_amount(amount)?;

        if account_id == &target_id {
            return Err(crate::invalid_input!("Cannot tip yourself"));
        }

        let mut sender_storage = self
            .user_storage
            .get(account_id)
            .cloned()
            .ok_or_else(|| crate::invalid_input!("Account not registered"))?;

        let sender_previous_balance = sender_storage.balance.0;

        // Available = balance - locked - storage_cost(effective_bytes)
        let covered_bytes = sender_storage
            .shared_storage
            .as_ref()
            .map(|s| s.used_bytes)
            .unwrap_or(0)
            .saturating_add(sender_storage.group_pool_used_bytes)
            .saturating_add(sender_storage.platform_pool_used_bytes);

        let used_balance = crate::storage::calculate_storage_balance_needed(
            crate::storage::calculate_effective_bytes(sender_storage.used_bytes, covered_bytes),
        );
        let available = sender_storage
            .available_balance()
            .saturating_sub(used_balance);

        if amount > available {
            return Err(crate::invalid_input!(
                "Tip amount exceeds available balance"
            ));
        }

        sender_storage.balance.0 = sender_storage.balance.0.saturating_sub(amount);

        // Track recipient insert overhead — sender pays for new map entry if recipient is unregistered
        sender_storage.storage_tracker.start_tracking();

        let mut recipient_storage = self
            .user_storage
            .get(&target_id)
            .cloned()
            .unwrap_or_default();

        let recipient_previous_balance = recipient_storage.balance.0;

        recipient_storage.balance.0 = recipient_storage.balance.0.saturating_add(amount);
        self.user_storage
            .insert(target_id.clone(), recipient_storage);

        sender_storage.storage_tracker.stop_tracking();
        let delta = sender_storage.storage_tracker.delta();
        sender_storage.storage_tracker.reset();

        match delta.cmp(&0) {
            std::cmp::Ordering::Greater => {
                sender_storage.used_bytes = sender_storage.used_bytes.saturating_add(delta as u64);
                sender_storage.assert_storage_covered()?;
            }
            std::cmp::Ordering::Less => {
                sender_storage.used_bytes = sender_storage
                    .used_bytes
                    .saturating_sub(delta.unsigned_abs() as u64);
            }
            std::cmp::Ordering::Equal => {}
        }

        self.user_storage.insert(account_id.clone(), sender_storage);

        EventBuilder::new(
            crate::constants::EVENT_TYPE_STORAGE_UPDATE,
            "storage_tip",
            account_id.clone(),
        )
        .with_field("target_id", target_id.to_string())
        .with_field("amount", amount.to_string())
        .with_field(
            "sender_previous_balance",
            sender_previous_balance.to_string(),
        )
        .with_field(
            "sender_new_balance",
            sender_previous_balance.saturating_sub(amount).to_string(),
        )
        .with_field(
            "recipient_previous_balance",
            recipient_previous_balance.to_string(),
        )
        .with_field(
            "recipient_new_balance",
            recipient_previous_balance
                .saturating_add(amount)
                .to_string(),
        )
        .emit(ctx.event_batch);

        Ok(())
    }
}
