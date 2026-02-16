//! 3-tier byte-accurate storage management.
//!
//! Tier 1: Price-embedded — storage cost deducted from purchase payment.
//! Tier 2: App pool — per-app isolated pools fund user storage within limits.
//! Tier 3: User balance — manual deposits cover remaining operations.
//!
//! Every state-changing operation measures bytes via `env::storage_usage()`
//! before/after to get exact cost.

use crate::internal::check_one_yocto;
use crate::*;

// ── Public methods ───────────────────────────────────────────────────────────

#[near]
impl Contract {
    /// Deposit NEAR to cover your own storage costs (Tier 3).
    #[payable]
    #[handle_result]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>) -> Result<(), MarketplaceError> {
        let storage_account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Requires attached deposit of at least 1 yoctoNEAR".to_string(),
            ));
        }

        let mut user = self.user_storage.get(&storage_account_id)
            .cloned()
            .unwrap_or_default();
        user.balance += deposit;
        self.user_storage.insert(storage_account_id.clone(), user.clone());

        events::emit_storage_deposit(&storage_account_id, deposit, user.balance);
        Ok(())
    }

    /// Withdraw excess storage balance (balance minus bytes×cost).
    /// Requires 1 yoctoNEAR to ensure Full Access Key (prevents function-call key abuse).
    #[payable]
    #[handle_result]
    pub fn storage_withdraw(&mut self) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let owner_id = env::predecessor_account_id();
        let user = self.user_storage.get(&owner_id)
            .cloned()
            .unwrap_or_default();

        let used_cost = (user.used_bytes as u128) * STORAGE_BYTE_COST;
        let available = user.balance.saturating_sub(used_cost);
        if available == 0 {
            return Err(MarketplaceError::InvalidState(
                "No storage available to withdraw".to_string(),
            ));
        }

        let new_balance = user.balance - available;
        if new_balance == 0 && user.used_bytes == 0 {
            self.user_storage.remove(&owner_id);
        } else {
            let mut updated = user;
            updated.balance = new_balance;
            self.user_storage.insert(owner_id.clone(), updated);
        }

        let _ = Promise::new(owner_id.clone()).transfer(NearToken::from_yoctonear(available));
        events::emit_storage_withdraw(&owner_id, available, new_balance);
        Ok(())
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.user_storage.get(&account_id).map(|u| u.balance).unwrap_or(0))
    }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

impl Contract {
    /// Charge storage after a state mutation using Tier 2 (app pool) → Tier 3 (user balance).
    /// `bytes_used` is the delta measured by the caller via `env::storage_usage()`.
    /// Returns error if neither tier can cover the cost.
    pub(crate) fn charge_storage_waterfall(
        &mut self,
        account_id: &AccountId,
        bytes_used: u64,
        app_id: Option<&AccountId>,
    ) -> Result<(), MarketplaceError> {
        if bytes_used == 0 {
            return Ok(());
        }

        // ── Tier 2: App Pool ─────────────────────────────────────────
        if let Some(app) = app_id {
            if let Some(mut pool) = self.app_pools.remove(app) {
                let usage_key = format!("{}:{}", account_id, app);
                let user_used = self.app_user_usage.get(&usage_key).copied().unwrap_or(0);

                let remaining_allowance = pool.max_user_bytes.saturating_sub(user_used);
                let can_cover_bytes = remaining_allowance.min(bytes_used);
                let can_cover_cost = (can_cover_bytes as u128) * STORAGE_BYTE_COST;

                if can_cover_cost > 0 && pool.balance >= can_cover_cost {
                    pool.balance -= can_cover_cost;
                    pool.used_bytes += can_cover_bytes;
                    self.app_pools.insert(app.clone(), pool);
                    self.app_user_usage.insert(usage_key, user_used + can_cover_bytes);

                    if can_cover_bytes >= bytes_used {
                        return Ok(()); // Fully covered by app pool
                    }

                    // Partially covered — fall through to Tier 3 for remainder
                    let remaining_bytes = bytes_used - can_cover_bytes;
                    self.charge_user_storage(account_id, remaining_bytes)?;
                    return Ok(());
                }

                // Pool couldn't cover — put it back
                self.app_pools.insert(app.clone(), pool);
            }
        }

        // ── Tier 3: User Balance ─────────────────────────────────────
        self.charge_user_storage(account_id, bytes_used)?;
        Ok(())
    }

    /// Charge bytes against user's own storage balance (Tier 3).
    /// Returns error if insufficient.
    fn charge_user_storage(&mut self, account_id: &AccountId, bytes_used: u64) -> Result<(), MarketplaceError> {
        let cost = (bytes_used as u128) * STORAGE_BYTE_COST;
        let mut user = self.user_storage.get(account_id)
            .cloned()
            .unwrap_or_default();

        let available = user.balance.saturating_sub((user.used_bytes as u128) * STORAGE_BYTE_COST);
        if available < cost {
            return Err(MarketplaceError::InsufficientStorage(format!(
                "Insufficient storage. Need {} yoctoNEAR ({} bytes). Deposit via storage_deposit()",
                cost, bytes_used
            )));
        }

        user.used_bytes += bytes_used;
        self.user_storage.insert(account_id.clone(), user);
        Ok(())
    }

    /// Charge storage cost directly from a payment amount (Tier 1: price-embedded).
    /// Returns the storage cost deducted.
    /// Used during purchases where storage is included in the price.
    pub(crate) fn charge_storage_from_price(&mut self, bytes_used: u64) -> u128 {
        (bytes_used as u128) * STORAGE_BYTE_COST
    }
}
