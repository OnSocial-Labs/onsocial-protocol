//! 3-tier byte-accurate storage management.
//!
//! Tier 1: App pool       — per-app isolated pools fund user storage within per-user limits.
//! Tier 2: Platform pool  — 0.5% of all sales accumulates here; sponsors individual (no-app) ops.
//! Tier 3: User balance   — manual storage_deposit(); last resort if both pools are empty.
//!
//! Storage is never deducted from sale prices. Sellers always receive exactly
//! `price - marketplace_fee - app_commission`. The waterfall absorbs all storage overhead.
//!
//! Every state-changing operation measures bytes via `env::storage_usage()`
//! before/after to get exact cost.

use crate::internal::check_one_yocto;
use crate::*;

#[near]
impl Contract {
    /// Deposit NEAR to cover your own storage costs (Tier 3: user balance).
    #[payable]
    #[handle_result]
    pub fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
    ) -> Result<(), MarketplaceError> {
        let storage_account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Requires attached deposit of at least 1 yoctoNEAR".to_string(),
            ));
        }

        let mut user = self
            .user_storage
            .get(&storage_account_id)
            .cloned()
            .unwrap_or_default();
        user.balance += deposit;
        self.user_storage
            .insert(storage_account_id.clone(), user.clone());

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
        let user = self
            .user_storage
            .get(&owner_id)
            .cloned()
            .unwrap_or_default();

        let used_cost = (user.used_bytes as u128) * storage_byte_cost();
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
        U128(
            self.user_storage
                .get(&account_id)
                .map(|u| u.balance)
                .unwrap_or(0),
        )
    }
}

impl Contract {
    /// After a successful `execute()` dispatch, handle any remaining attached deposit.
    /// If `refund_unused_deposit` is true, refund via transfer; otherwise credit user storage.
    pub(crate) fn finalize_unused_deposit(
        &mut self,
        amount: u128,
        deposit_owner: &AccountId,
        options: &crate::Options,
    ) {
        if options.refund_unused_deposit {
            let _ = Promise::new(deposit_owner.clone())
                .transfer(NearToken::from_yoctonear(amount));
            events::emit_storage_refund(deposit_owner, amount);
        } else {
            let mut user = self
                .user_storage
                .get(deposit_owner)
                .cloned()
                .unwrap_or_default();
            user.balance += amount;
            let new_balance = user.balance;
            self.user_storage.insert(deposit_owner.clone(), user);
            events::emit_storage_credit_unused(deposit_owner, amount, new_balance);
        }
    }
}

impl Contract {
    /// Charge storage after a state mutation: Tier 1 (app pool) → Tier 2 (platform pool) → Tier 3 (user balance).
    /// `bytes_used` is the delta measured by the caller via `env::storage_usage()`.
    /// Returns error if no tier can cover the cost.
    pub(crate) fn charge_storage_waterfall(
        &mut self,
        account_id: &AccountId,
        bytes_used: u64,
        app_id: Option<&AccountId>,
    ) -> Result<(), MarketplaceError> {
        if bytes_used == 0 {
            return Ok(());
        }

        // ── Tier 1: App Pool ─────────────────────────────────────────
        if let Some(app) = app_id {
            if let Some(mut pool) = self.app_pools.remove(app) {
                let usage_key = format!("{}:{}", account_id, app);
                let user_used = self.app_user_usage.get(&usage_key).copied().unwrap_or(0);

                let remaining_allowance = pool.max_user_bytes.saturating_sub(user_used);
                let can_cover_bytes = remaining_allowance.min(bytes_used);
                let can_cover_cost = (can_cover_bytes as u128) * storage_byte_cost();

                if can_cover_cost > 0 && pool.balance >= can_cover_cost {
                    pool.balance -= can_cover_cost;
                    pool.used_bytes += can_cover_bytes;
                    self.app_pools.insert(app.clone(), pool);
                    self.app_user_usage
                        .insert(usage_key, user_used + can_cover_bytes);

                    if can_cover_bytes >= bytes_used {
                        return Ok(());
                    }

                    // Partially covered by app pool — remainder falls to Tier 3 (user balance).
                    // Platform pool (Tier 2) is not used for app-affiliated operations.
                    let remaining_bytes = bytes_used - can_cover_bytes;
                    self.charge_user_storage(account_id, remaining_bytes)?;
                    return Ok(());
                }

                // Pool couldn't cover — put it back
                self.app_pools.insert(app.clone(), pool);
            }
        }

        // ── Tier 2: Platform Storage Pool ────────────────────────────
        // For standalone operations with no app_id, the platform pool (funded
        // by platform_storage_fee_bps on each sale) sponsors storage first.
        // This ensures users never pay hidden storage costs on top of the 2% fee.
        if app_id.is_none() {
            let cost = (bytes_used as u128) * storage_byte_cost();
            if self.platform_storage_balance >= cost {
                self.platform_storage_balance -= cost;
                let mut user = self.user_storage.get(account_id).cloned().unwrap_or_default();
                user.tier2_used_bytes += bytes_used;
                self.user_storage.insert(account_id.clone(), user);
                return Ok(());
            }
        }

        // ── Tier 3: User Balance (last resort) ───────────────────────
        self.charge_user_storage(account_id, bytes_used)?;
        Ok(())
    }

    /// Release storage when a state mutation is reverted (e.g., lazy listing cancelled).
    /// Mirrors `charge_storage_waterfall` in reverse — credits each tier back proportionally.
    ///
    /// - Tier 1 (app pool): credits bytes that were tracked in `app_user_usage` back to the pool.
    ///   Any remainder (charged to Tier 3 due to partial coverage) is returned to user tracking.
    /// - Tier 2 (platform pool): credits cost back when no `app_id` is present.
    ///
    /// If the app pool no longer exists, Tier 3 accounting is adjusted as a fallback.
    /// All operations use `saturating_sub`; no NEAR is transferred (no locked NEAR to return).
    pub(crate) fn release_storage_waterfall(
        &mut self,
        account_id: &AccountId,
        bytes_freed: u64,
        app_id: Option<&AccountId>,
    ) {
        if bytes_freed == 0 {
            return;
        }

        // Mirror Tier 1: credit back to app pool
        if let Some(app) = app_id {
            let usage_key = format!("{}:{}", account_id, app);
            if let Some(mut pool) = self.app_pools.remove(app) {
                let user_used = self.app_user_usage.get(&usage_key).copied().unwrap_or(0);

                // Only credit back what was actually tracked against this user in the pool
                let returnable = user_used.min(bytes_freed);
                let return_cost = (returnable as u128) * storage_byte_cost();
                pool.balance += return_cost;
                pool.used_bytes = pool.used_bytes.saturating_sub(returnable);
                self.app_user_usage
                    .insert(usage_key, user_used.saturating_sub(returnable));
                self.app_pools.insert(app.clone(), pool);

                // Remainder was charged to Tier 3 (user balance) during partial coverage
                let remainder = bytes_freed.saturating_sub(returnable);
                if remainder > 0 {
                    if let Some(mut user) = self.user_storage.remove(account_id) {
                        user.used_bytes = user.used_bytes.saturating_sub(remainder);
                        self.user_storage.insert(account_id.clone(), user);
                    }
                }
                return;
            }
            // App pool no longer exists — use usage tracking to determine user-charged portion
            let pool_bytes = self.app_user_usage.get(&usage_key).copied().unwrap_or(0);
            let from_pool = pool_bytes.min(bytes_freed);
            let from_user = bytes_freed.saturating_sub(from_pool);
            self.app_user_usage.insert(usage_key, pool_bytes.saturating_sub(from_pool));
            if from_user > 0 {
                if let Some(mut user) = self.user_storage.remove(account_id) {
                    user.used_bytes = user.used_bytes.saturating_sub(from_user);
                    self.user_storage.insert(account_id.clone(), user);
                }
            }
            return;
        }

        // Mirror Tier 2/3 in reverse: use tier2_used_bytes to correctly attribute
        // each released byte back to the tier that originally charged it.
        if let Some(mut user) = self.user_storage.remove(account_id) {
            let from_tier2 = user.tier2_used_bytes.min(bytes_freed);
            let from_tier3 = bytes_freed - from_tier2;
            user.tier2_used_bytes = user.tier2_used_bytes.saturating_sub(from_tier2);
            user.used_bytes = user.used_bytes.saturating_sub(from_tier3);
            self.user_storage.insert(account_id.clone(), user);
            if from_tier2 > 0 {
                let cost = (from_tier2 as u128) * storage_byte_cost();
                self.platform_storage_balance += cost;
            }
            return;
        }
        let cost = (bytes_freed as u128) * storage_byte_cost();
        self.platform_storage_balance += cost;
    }

    /// Charge bytes against user's own storage balance (Tier 3: last resort).
    /// Returns error if insufficient.
    fn charge_user_storage(
        &mut self,
        account_id: &AccountId,
        bytes_used: u64,
    ) -> Result<(), MarketplaceError> {
        let cost = (bytes_used as u128) * storage_byte_cost();
        let mut user = self
            .user_storage
            .get(account_id)
            .cloned()
            .unwrap_or_default();

        let available = user
            .balance
            .saturating_sub((user.used_bytes as u128) * storage_byte_cost());
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
}
