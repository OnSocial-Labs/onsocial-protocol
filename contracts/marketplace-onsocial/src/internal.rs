// Internal helper functions for the marketplace

use crate::*;

impl Contract {
    /// Internal function to remove a sale
    /// Returns the Sale object that was removed
    pub(crate) fn internal_remove_sale(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
    ) -> Result<Sale, MarketplaceError> {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);

        // Get and remove the sale object
        let sale = self.sales.remove(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;

        // Remove from owner's sales set by removing and reinserting
        if let Some(mut owner_set) = self.by_owner_id.remove(&sale.owner_id) {
            owner_set.remove(&sale_id);

            if !owner_set.is_empty() {
                self.by_owner_id.insert(sale.owner_id.clone(), owner_set);
            }
        }

        // Remove from Scarce contract's sales set by removing and reinserting
        if let Some(mut contract_set) = self.by_scarce_contract_id.remove(&scarce_contract_id) {
            contract_set.remove(&sale_id);

            if !contract_set.is_empty() {
                self.by_scarce_contract_id
                    .insert(scarce_contract_id, contract_set);
            }
        }

        Ok(sale)
    }

    /// Internal function to add a sale
    pub(crate) fn internal_add_sale(&mut self, sale: Sale) {
        // Extract contract and token from SaleType
        let (scarce_contract_id, token_id) = match &sale.sale_type {
            SaleType::External {
                scarce_contract_id,
                token_id,
                ..
            } => (scarce_contract_id.clone(), token_id.clone()),
            SaleType::LazyCollection { collection_id } => {
                // For lazy collections, use collection_id as unique identifier
                (env::current_account_id(), collection_id.clone())
            }
            SaleType::NativeScarce { token_id } => {
                (env::current_account_id(), token_id.clone())
            }
        };

        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);

        // Add to main sales map
        self.sales.insert(sale_id.clone(), sale.clone());

        // Add to owner's sales set by removing, modifying, and reinserting
        let mut by_owner_id = self.by_owner_id.remove(&sale.owner_id).unwrap_or_else(|| {
            IterableSet::new(StorageKey::ByOwnerIdInner {
                account_id_hash: hash_account_id(&sale.owner_id),
            })
        });
        by_owner_id.insert(sale_id.clone());
        self.by_owner_id.insert(sale.owner_id.clone(), by_owner_id);

        // Add to Scarce contract's sales set by removing, modifying, and reinserting
        let mut by_scarce_contract_id = self
            .by_scarce_contract_id
            .remove(&scarce_contract_id)
            .unwrap_or_else(|| {
                IterableSet::new(StorageKey::ByScarceContractIdInner {
                    account_id_hash: hash_account_id(&scarce_contract_id),
                })
            });
        by_scarce_contract_id.insert(sale_id);
        self.by_scarce_contract_id
            .insert(scarce_contract_id, by_scarce_contract_id);
    }
}

/// Hash an account ID for use in storage keys
pub(crate) fn hash_account_id(account_id: &AccountId) -> Vec<u8> {
    env::sha256(account_id.as_bytes())
}

/// Check exactly one yoctoNEAR is attached (security measure)
pub(crate) fn check_one_yocto() -> Result<(), MarketplaceError> {
    if env::attached_deposit().as_yoctonear() != ONE_YOCTO.as_yoctonear() {
        return Err(MarketplaceError::InsufficientDeposit(
            "Requires attached deposit of exactly 1 yoctoNEAR".into(),
        ));
    }
    Ok(())
}

/// Check at least one yoctoNEAR is attached
pub(crate) fn check_at_least_one_yocto() -> Result<(), MarketplaceError> {
    if env::attached_deposit().as_yoctonear() < ONE_YOCTO.as_yoctonear() {
        return Err(MarketplaceError::InsufficientDeposit(
            "Requires attached deposit of at least 1 yoctoNEAR".into(),
        ));
    }
    Ok(())
}

// ── Fee / utility helpers (moved from lib.rs) ────────────────────────────────

impl Contract {
    pub(crate) fn make_sale_id(scarce_contract_id: &AccountId, token_id: &str) -> String {
        format!("{}{}{}", scarce_contract_id, DELIMETER, token_id)
    }

    /// Calculate fee split for a sale price.
    /// Returns (total_fee, app_pool_amount, revenue_amount).
    /// If app_id is Some, app_pool_fee_bps goes to the app pool.
    /// Otherwise the full fee is revenue.
    pub(crate) fn internal_calculate_fee_split(&self, price: u128, app_id: Option<&AccountId>) -> (u128, u128, u128) {
        let total_fee = (price * self.fee_config.total_fee_bps as u128) / BASIS_POINTS as u128;

        if let Some(app) = app_id {
            // Only route to app pool if the pool exists
            if self.app_pools.contains_key(app) {
                let app_amount = (price * self.fee_config.app_pool_fee_bps as u128) / BASIS_POINTS as u128;
                let revenue = total_fee.saturating_sub(app_amount);
                return (total_fee, app_amount, revenue);
            }
        }

        // No app → all fee is revenue
        (total_fee, 0, total_fee)
    }

    /// Route fee: transfer revenue to platform + fund app pool.
    /// Returns (revenue, app_pool_amount).
    pub(crate) fn route_fee(&mut self, price: u128, app_id: Option<&AccountId>) -> (u128, u128) {
        let (total_fee, app_amount, revenue) = self.internal_calculate_fee_split(price, app_id);
        let _ = total_fee; // suppress unused warning

        // Credit app pool
        if app_amount > 0 {
            if let Some(app) = app_id {
                if let Some(mut pool) = self.app_pools.remove(app) {
                    pool.balance += app_amount;
                    self.app_pools.insert(app.clone(), pool);
                }
            }
        }

        // Transfer revenue to fee recipient
        if revenue > 0 {
            let _ = Promise::new(self.fee_recipient.clone())
                .transfer(NearToken::from_yoctonear(revenue));
        }

        (revenue, app_amount)
    }

    /// Update fee config with validation
    pub(crate) fn internal_update_fee_config(
        &mut self,
        total_fee_bps: Option<u16>,
        app_pool_fee_bps: Option<u16>,
    ) -> Result<(), MarketplaceError> {
        if let Some(bps) = total_fee_bps {
            if bps > 1000 {
                return Err(MarketplaceError::InvalidInput(
                    "Total fee cannot exceed 10%".into(),
                ));
            }
            self.fee_config.total_fee_bps = bps;
        }
        if let Some(bps) = app_pool_fee_bps {
            if bps > self.fee_config.total_fee_bps {
                return Err(MarketplaceError::InvalidInput(
                    "App pool fee cannot exceed total fee".into(),
                ));
            }
            self.fee_config.app_pool_fee_bps = bps;
        }
        Ok(())
    }

    /// Merge app's default royalty with creator's royalty.
    /// App royalties are enforced (creator cannot remove them).
    /// If the same account appears in both, amounts are summed.
    /// Returns None if neither has royalties.
    pub(crate) fn merge_royalties(
        &self,
        app_id: Option<&AccountId>,
        creator_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    ) -> Option<std::collections::HashMap<AccountId, u32>> {
        let app_royalty = app_id
            .and_then(|id| self.app_pools.get(id))
            .and_then(|pool| pool.default_royalty.clone());

        match (app_royalty, creator_royalty) {
            (None, None) => None,
            (Some(app), None) => Some(app),
            (None, Some(creator)) => Some(creator),
            (Some(app), Some(creator)) => {
                let mut merged = app;
                for (account, bps) in creator {
                    let entry = merged.entry(account).or_insert(0);
                    *entry += bps;
                }
                Some(merged)
            }
        }
    }

    /// Calculate app owner's primary sale commission.
    /// Returns 0 if no app or primary_sale_bps is 0.
    pub(crate) fn calculate_app_commission(&self, price: u128, app_id: Option<&AccountId>) -> u128 {
        if let Some(app) = app_id {
            if let Some(pool) = self.app_pools.get(app) {
                if pool.primary_sale_bps > 0 {
                    return (price * pool.primary_sale_bps as u128) / BASIS_POINTS as u128;
                }
            }
        }
        0
    }

    /// Validate that a metadata string is valid JSON and within size limits.
    pub(crate) fn validate_metadata_json(json_str: &str) -> Result<(), MarketplaceError> {
        if json_str.len() > MAX_METADATA_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Metadata exceeds max length of {} bytes",
                MAX_METADATA_LEN
            )));
        }
        let _: near_sdk::serde_json::Value =
            near_sdk::serde_json::from_str(json_str).map_err(|_| {
                MarketplaceError::InvalidInput("Metadata must be valid JSON".into())
            })?;
        Ok(())
    }

    /// Distribute sale proceeds according to a royalty payout, scaled to fit
    /// `amount_after_fee`. Dust goes to the platform fee recipient.
    /// If payout total is 0, the full amount goes to `fallback_recipient`.
    pub(crate) fn distribute_payout(
        &self,
        payout: &Payout,
        amount_after_fee: u128,
        fallback_recipient: &AccountId,
    ) {
        let total_payout: u128 = payout.payout.values().map(|a| a.0).sum();
        if total_payout > 0 {
            let scale_factor = (amount_after_fee * 10_000) / total_payout;
            let mut actual_distributed: u128 = 0;
            for (receiver, amount) in payout.payout.iter() {
                if amount.0 > 0 {
                    let scaled_amount = (amount.0 * scale_factor) / 10_000;
                    if scaled_amount > 0 {
                        let _ = Promise::new(receiver.clone())
                            .transfer(NearToken::from_yoctonear(scaled_amount));
                        actual_distributed += scaled_amount;
                    }
                }
            }
            // Dust → fee recipient
            let remaining = amount_after_fee.saturating_sub(actual_distributed);
            if remaining > 0 {
                let _ = Promise::new(self.fee_recipient.clone())
                    .transfer(NearToken::from_yoctonear(remaining));
            }
        } else if amount_after_fee > 0 {
            let _ = Promise::new(fallback_recipient.clone())
                .transfer(NearToken::from_yoctonear(amount_after_fee));
        }
    }
}
