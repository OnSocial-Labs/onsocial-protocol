use crate::*;

use super::types::storage_byte_cost;

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
