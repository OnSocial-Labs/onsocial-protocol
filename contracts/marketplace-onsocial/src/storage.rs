//! 4-tier byte-accurate storage management.
//!
//! Tier 1 (app pool) → Tier 2 (platform pool, 0.5% of sales) → Tier 3 (user balance) → Tier 4 (attached NEAR).
//! Sellers always receive `price - fee - commission`; storage overhead never reduces sale proceeds.

use crate::internal::check_one_yocto;
use crate::*;

#[near]
impl Contract {
    /// Deposit NEAR to cover your own storage costs.
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
        let new_balance = user.balance;
        self.user_storage
            .insert(storage_account_id.clone(), user);

        events::emit_storage_deposit(&storage_account_id, deposit, new_balance);
        Ok(())
    }

    /// Withdraw excess storage balance; panics unless exactly 1 yoctoNEAR is attached.
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

        let new_balance = used_cost;
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
    // Routes leftover attached NEAR to refund or user balance after execute() dispatch.
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
    // Charges storage via Tier1→2→3→4; `bytes_used` must equal the storage_usage() delta.
    pub(crate) fn charge_storage_waterfall(
        &mut self,
        account_id: &AccountId,
        bytes_used: u64,
        app_id: Option<&AccountId>,
    ) -> Result<(), MarketplaceError> {
        if bytes_used == 0 {
            return Ok(());
        }

        // --- Tier 1: App Pool ---
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

                    // Partial coverage; remainder falls to Tier 3 (Tier 2 skipped for app ops).
                    let remaining_bytes = bytes_used - can_cover_bytes;
                    self.charge_user_storage(account_id, remaining_bytes)?;
                    return Ok(());
                }

                self.app_pools.insert(app.clone(), pool);
            }
        }

        // --- Tier 2: Platform Pool ---
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

        // --- Tier 3: User Balance ---
        self.charge_user_storage(account_id, bytes_used)?;
        Ok(())
    }

    // Mirrors charge_storage_waterfall in reverse; falls back to Tier 3 if the app pool is gone.
    pub(crate) fn release_storage_waterfall(
        &mut self,
        account_id: &AccountId,
        bytes_freed: u64,
        app_id: Option<&AccountId>,
    ) {
        if bytes_freed == 0 {
            return;
        }

        // --- Tier 1: credit app pool ---
        if let Some(app) = app_id {
            let usage_key = format!("{}:{}", account_id, app);
            if let Some(mut pool) = self.app_pools.remove(app) {
                let user_used = self.app_user_usage.get(&usage_key).copied().unwrap_or(0);

                // Credit only tracked bytes to avoid over-crediting the pool.
                let returnable = user_used.min(bytes_freed);
                let return_cost = (returnable as u128) * storage_byte_cost();
                pool.balance += return_cost;
                pool.used_bytes = pool.used_bytes.saturating_sub(returnable);
                self.app_user_usage
                    .insert(usage_key, user_used.saturating_sub(returnable));
                self.app_pools.insert(app.clone(), pool);

                // Remainder was charged to Tier 3 on partial app-pool coverage.
                let remainder = bytes_freed.saturating_sub(returnable);
                if remainder > 0 {
                    if let Some(mut user) = self.user_storage.remove(account_id) {
                        user.used_bytes = user.used_bytes.saturating_sub(remainder);
                        self.user_storage.insert(account_id.clone(), user);
                    }
                }
                return;
            }
            // App pool gone — derive Tier 3 portion from usage tracking.
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

        // --- Tier 2/3: reverse attribution via tier2_used_bytes ---
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

    // Tier 3→4: charges from user balance, then exact shortfall from pending_attached_balance.
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
            let shortfall = cost - available;
            if self.pending_attached_balance < shortfall {
                return Err(MarketplaceError::InsufficientStorage(format!(
                    "Insufficient storage. Need {} yoctoNEAR ({} bytes). Attach NEAR or call storage_deposit().",
                    cost, bytes_used
                )));
            }
            self.pending_attached_balance -= shortfall;
            user.balance += shortfall;
        }

        user.used_bytes += bytes_used;
        self.user_storage.insert(account_id.clone(), user);
        Ok(())
    }
}
