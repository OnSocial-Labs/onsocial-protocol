use crate::errors::SocialError;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    /// Ensure storage is covered, using attached deposit as final fallback.
    pub(super) fn ensure_storage_covered(
        &self,
        storage: &mut crate::storage::Storage,
        attached_balance: &mut Option<&mut u128>,
    ) -> Result<(), SocialError> {
        if self.assert_storage_covered_with_platform(storage).is_ok() {
            return Ok(());
        }

        // Try auto-deposit from attached balance
        if let Some(balance) = attached_balance {
            if **balance > 0 {
                storage.balance = storage.balance.saturating_add(**balance);
                **balance = 0;
                return self.assert_storage_covered_with_platform(storage);
            }
        }

        self.assert_storage_covered_with_platform(storage)
    }
}
