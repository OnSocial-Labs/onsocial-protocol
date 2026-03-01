use crate::errors::SocialError;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    /// Ensure storage is covered, using attached deposit as final fallback.
    ///
    /// Only deposits the minimum shortfall from attached balance, leaving
    /// the remainder available for refund via `refund_unused_deposit`.
    pub(super) fn ensure_storage_covered(
        &self,
        storage: &mut crate::storage::Storage,
        attached_balance: &mut Option<&mut u128>,
    ) -> Result<(), SocialError> {
        if self.assert_storage_covered_with_platform(storage).is_ok() {
            return Ok(());
        }

        // Try auto-deposit from attached balance — only deposit the shortfall
        if let Some(balance) = attached_balance {
            if **balance > 0 {
                let needed = storage.storage_balance_needed();
                let available = storage.available_balance();
                let shortfall = needed.saturating_sub(available);
                let deposit = shortfall.min(**balance);
                storage.balance.0 = storage.balance.0.saturating_add(deposit);
                **balance = balance.saturating_sub(deposit);
                return self.assert_storage_covered_with_platform(storage);
            }
        }

        self.assert_storage_covered_with_platform(storage)
    }
}
