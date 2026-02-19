use crate::*;

// ── Token ownership set management ───────────────────────────────────────────

impl Contract {
    pub(crate) fn add_token_to_owner(&mut self, owner_id: &AccountId, token_id: &str) {
        if !self.scarces_per_owner.contains_key(owner_id) {
            self.scarces_per_owner.insert(
                owner_id.clone(),
                IterableSet::new(StorageKey::ScarcesPerOwnerInner {
                    account_id_hash: env::sha256(owner_id.as_bytes()),
                }),
            );
        }
        self.scarces_per_owner
            .get_mut(owner_id)
            .unwrap()
            .insert(token_id.to_string());
    }

    pub(crate) fn remove_token_from_owner(&mut self, owner_id: &AccountId, token_id: &str) {
        if let Some(owner_tokens) = self.scarces_per_owner.get_mut(owner_id) {
            owner_tokens.remove(token_id);
            if owner_tokens.is_empty() {
                self.scarces_per_owner.remove(owner_id);
            }
        }
    }
}

// ── Transferability guard ────────────────────────────────────────────────────

impl Contract {
    /// Check whether a token is transferable. Returns `Err` for revoked or soulbound tokens.
    /// Revoked tokens are always blocked. Token-level transferable flag takes precedence;
    /// `None` falls through to collection.
    pub(crate) fn check_transferable(
        &self,
        token: &Scarce,
        token_id: &str,
        action: &str,
    ) -> Result<(), MarketplaceError> {
        if token.revoked_at.is_some() {
            return Err(MarketplaceError::InvalidState(format!(
                "Token is revoked and cannot be used for: {}",
                action
            )));
        }
        match token.transferable {
            Some(false) => Err(MarketplaceError::soulbound(action)),
            Some(true) => Ok(()),
            None => {
                let cid = collection_id_from_token_id(token_id);
                if !cid.is_empty() {
                    if let Some(collection) = self.collections.get(cid) {
                        if !collection.transferable {
                            return Err(MarketplaceError::soulbound(action));
                        }
                    }
                }
                Ok(())
            }
        }
    }
}

// ── Resolve effective app_id for a token ─────────────────────────────────────

impl Contract {
    /// Get the effective `app_id` for a token: standalone tokens carry their own,
    /// collection tokens inherit from the collection.
    pub(crate) fn resolve_token_app_id(
        &self,
        token_id: &str,
        token_app_id: Option<&AccountId>,
    ) -> Option<AccountId> {
        token_app_id.cloned().or_else(|| {
            let cid = collection_id_from_token_id(token_id);
            self.collections.get(cid).and_then(|c| c.app_id.clone())
        })
    }
}

// ── Royalty validation ───────────────────────────────────────────────────────

impl Contract {
    /// Validate a royalty map: max 10 recipients, each > 0 bps, total <= MAX_ROYALTY_BPS.
    pub(crate) fn validate_royalty(
        royalty: &std::collections::HashMap<AccountId, u32>,
    ) -> Result<(), MarketplaceError> {
        if royalty.is_empty() {
            return Ok(());
        }
        if royalty.len() > 10 {
            return Err(MarketplaceError::InvalidInput(
                "Maximum 10 royalty recipients".into(),
            ));
        }
        let total: u32 = royalty.values().sum();
        if total > MAX_ROYALTY_BPS {
            return Err(MarketplaceError::InvalidInput(format!(
                "Total royalty {} bps exceeds max {} bps (50%)",
                total, MAX_ROYALTY_BPS
            )));
        }
        for bps in royalty.values() {
            if *bps == 0 {
                return Err(MarketplaceError::InvalidInput(
                    "Each royalty share must be > 0 bps".into(),
                ));
            }
        }
        Ok(())
    }
}

// ── Authority guards ─────────────────────────────────────────────────────────

impl Contract {
    pub(crate) fn check_contract_owner(
        &self,
        actor_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        if actor_id != &self.owner_id {
            return Err(MarketplaceError::only_owner("contract owner"));
        }
        Ok(())
    }
}

// ── Refund excess deposit ────────────────────────────────────────────────────

pub(crate) fn refund_excess(buyer: &AccountId, deposit: u128, price: u128) {
    let refund = deposit.saturating_sub(price);
    if refund > 0 {
        let _ = Promise::new(buyer.clone()).transfer(NearToken::from_yoctonear(refund));
    }
}

// ── Primary sale payment routing ─────────────────────────────────────────────

/// Result from `route_primary_sale`: amounts for event emission and analytics.
pub(crate) struct PrimarySaleResult {
    pub revenue: u128,
    pub app_pool_amount: u128,
    pub app_commission: u128,
    pub creator_payment: u128,
}

impl Contract {
    /// Route payment for a primary sale (collection purchase, lazy listing purchase).
    /// Storage is covered by the 3-tier waterfall, never deducted from `price`.
    /// Distribution order: marketplace fee → app commission → remainder to creator.
    pub(crate) fn route_primary_sale(
        &mut self,
        price: u128,
        bytes_used: u64,
        creator_id: &AccountId,
        payer_id: &AccountId,
        app_id: Option<&AccountId>,
    ) -> Result<PrimarySaleResult, MarketplaceError> {
        self.charge_storage_waterfall(payer_id, bytes_used, app_id)?;

        if price > 0 {
            let (rev, app_amt) = self.route_fee(price, app_id);

            let app_commission = self.calculate_app_commission(price, app_id);
            if app_commission > 0 {
                if let Some(aid) = app_id {
                    if let Some(pool) = self.app_pools.get(aid) {
                        let _ = Promise::new(pool.owner_id.clone())
                            .transfer(NearToken::from_yoctonear(app_commission));
                    }
                }
            }

            let total_deductions = rev + app_amt + app_commission;
            let creator_payment = price.saturating_sub(total_deductions);
            if creator_payment > 0 {
                let _ = Promise::new(creator_id.clone())
                    .transfer(NearToken::from_yoctonear(creator_payment));
            } else {
                env::log_str(&format!(
                    "WARN: creator '{}' payment is 0 (price={}, fees={}, app_commission={})",
                    creator_id,
                    price,
                    rev + app_amt,
                    app_commission
                ));
            }

            Ok(PrimarySaleResult {
                revenue: rev,
                app_pool_amount: app_amt,
                app_commission,
                creator_payment,
            })
        } else {
            Ok(PrimarySaleResult {
                revenue: 0,
                app_pool_amount: 0,
                app_commission: 0,
                creator_payment: 0,
            })
        }
    }

    /// Settle a secondary sale. Expiry validation is the caller's responsibility.
    pub(crate) fn settle_secondary_sale(
        &mut self,
        token_id: &str,
        sale_price: u128,
        seller_id: &AccountId,
    ) -> Result<PrimarySaleResult, MarketplaceError> {
        let token_clone = self.scarces_by_id.get(token_id).cloned();
        let app_id = self.resolve_token_app_id(
            token_id,
            token_clone.as_ref().and_then(|t| t.app_id.as_ref()),
        );

        let (revenue, app_pool_amount) = self.route_fee(sale_price, app_id.as_ref());
        let total_fee = revenue + app_pool_amount;
        let amount_after_fee = sale_price.saturating_sub(total_fee);

        if let Some(ref token) = token_clone {
            let payout = self.internal_compute_payout(token, seller_id, amount_after_fee, 10)?;
            self.distribute_payout(&payout, amount_after_fee, seller_id);
        } else if amount_after_fee > 0 {
            let _ = Promise::new(seller_id.clone())
                .transfer(NearToken::from_yoctonear(amount_after_fee));
        }

        Ok(PrimarySaleResult {
            revenue,
            app_pool_amount,
            app_commission: 0,
            creator_payment: 0,
        })
    }
}

impl Contract {
    pub(crate) fn internal_remove_sale(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
    ) -> Result<Sale, MarketplaceError> {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);

        let sale = self
            .sales
            .remove(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;

        if let Some(mut owner_set) = self.by_owner_id.remove(&sale.owner_id) {
            owner_set.remove(&sale_id);

            if !owner_set.is_empty() {
                self.by_owner_id.insert(sale.owner_id.clone(), owner_set);
            }
        }

        if let Some(mut contract_set) = self.by_scarce_contract_id.remove(&scarce_contract_id) {
            contract_set.remove(&sale_id);

            if !contract_set.is_empty() {
                self.by_scarce_contract_id
                    .insert(scarce_contract_id, contract_set);
            }
        }

        Ok(sale)
    }

    pub(crate) fn internal_add_sale(&mut self, sale: Sale) {
        let (scarce_contract_id, token_id) = match &sale.sale_type {
            SaleType::External {
                scarce_contract_id,
                token_id,
                ..
            } => (scarce_contract_id.clone(), token_id.clone()),
            SaleType::LazyCollection { collection_id } => {
                (env::current_account_id(), collection_id.clone())
            }
            SaleType::NativeScarce { token_id } => (env::current_account_id(), token_id.clone()),
        };

        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);

        self.sales.insert(sale_id.clone(), sale.clone());

        let mut by_owner_id = self.by_owner_id.remove(&sale.owner_id).unwrap_or_else(|| {
            IterableSet::new(StorageKey::ByOwnerIdInner {
                account_id_hash: hash_account_id(&sale.owner_id),
            })
        });
        by_owner_id.insert(sale_id.clone());
        self.by_owner_id.insert(sale.owner_id.clone(), by_owner_id);

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

pub(crate) fn hash_account_id(account_id: &AccountId) -> Vec<u8> {
    env::sha256(account_id.as_bytes())
}

pub(crate) fn check_one_yocto() -> Result<(), MarketplaceError> {
    if env::attached_deposit().as_yoctonear() != ONE_YOCTO.as_yoctonear() {
        return Err(MarketplaceError::InsufficientDeposit(
            "Requires attached deposit of exactly 1 yoctoNEAR".into(),
        ));
    }
    Ok(())
}

pub(crate) fn check_at_least_one_yocto() -> Result<(), MarketplaceError> {
    if env::attached_deposit().as_yoctonear() < ONE_YOCTO.as_yoctonear() {
        return Err(MarketplaceError::InsufficientDeposit(
            "Requires attached deposit of at least 1 yoctoNEAR".into(),
        ));
    }
    Ok(())
}

// ── Fee / utility helpers ───────────────────────────────────────────────────

impl Contract {
    pub(crate) fn make_sale_id(scarce_contract_id: &AccountId, token_id: &str) -> String {
        format!("{}{}{}", scarce_contract_id, DELIMETER, token_id)
    }

    /// Calculate fee split for a sale price.
    /// Returns (total_fee, app_pool_amount, platform_storage_amount, revenue_amount).
    /// - With app_id: app_pool_fee_bps → app pool, 0 → platform pool, rest → revenue.
    /// - Without app_id: 0 → app pool, platform_storage_fee_bps → platform pool, rest → revenue.
    pub(crate) fn internal_calculate_fee_split(
        &self,
        price: u128,
        app_id: Option<&AccountId>,
    ) -> (u128, u128, u128, u128) {
        let total_fee = (price * self.fee_config.total_fee_bps as u128) / BASIS_POINTS as u128;

        if let Some(app) = app_id {
            if self.app_pools.contains_key(app) {
                let app_amount =
                    (price * self.fee_config.app_pool_fee_bps as u128) / BASIS_POINTS as u128;
                let revenue = total_fee.saturating_sub(app_amount);
                return (total_fee, app_amount, 0, revenue);
            }
        }

        // No app → platform storage pool gets platform_storage_fee_bps, rest is revenue
        let platform_amount =
            (price * self.fee_config.platform_storage_fee_bps as u128) / BASIS_POINTS as u128;
        let revenue = total_fee.saturating_sub(platform_amount);
        (total_fee, 0, platform_amount, revenue)
    }

    /// Distributes the fee split: revenue to fee_recipient, remainder to app or platform pool.
    /// If the app pool disappears between fee calculation and credit, falls back to platform pool.
    pub(crate) fn route_fee(&mut self, price: u128, app_id: Option<&AccountId>) -> (u128, u128) {
        let (total_fee, app_amount, platform_amount, revenue) =
            self.internal_calculate_fee_split(price, app_id);
        let _ = total_fee; // suppress unused warning

        if app_amount > 0 {
            if let Some(app) = app_id {
                if let Some(mut pool) = self.app_pools.remove(app) {
                    pool.balance += app_amount;
                    self.app_pools.insert(app.clone(), pool);
                } else {
                    env::log_str(&format!(
                        "WARN: app pool '{}' missing during route_fee; {} yN → platform pool",
                        app, app_amount
                    ));
                    self.platform_storage_balance += app_amount;
                }
            }
        }

        if platform_amount > 0 {
            self.platform_storage_balance += platform_amount;
        }

        if revenue > 0 {
            let _ = Promise::new(self.fee_recipient.clone())
                .transfer(NearToken::from_yoctonear(revenue));
        }

        (revenue, app_amount)
    }

    /// Validates sub-fees against the effective post-update total to prevent stale-value bugs.
    pub(crate) fn internal_update_fee_config(
        &mut self,
        total_fee_bps: Option<u16>,
        app_pool_fee_bps: Option<u16>,
        platform_storage_fee_bps: Option<u16>,
    ) -> Result<(), MarketplaceError> {
        let effective_total = total_fee_bps.unwrap_or(self.fee_config.total_fee_bps);

        if let Some(bps) = total_fee_bps {
            if bps > 1000 {
                return Err(MarketplaceError::InvalidInput(
                    "Total fee cannot exceed 10%".into(),
                ));
            }
            self.fee_config.total_fee_bps = bps;
        }
        if let Some(bps) = app_pool_fee_bps {
            if bps > effective_total {
                return Err(MarketplaceError::InvalidInput(
                    "App pool fee cannot exceed total fee".into(),
                ));
            }
            self.fee_config.app_pool_fee_bps = bps;
        }
        if let Some(bps) = platform_storage_fee_bps {
            if bps > effective_total {
                return Err(MarketplaceError::InvalidInput(
                    "Platform storage fee cannot exceed total fee".into(),
                ));
            }
            self.fee_config.platform_storage_fee_bps = bps;
        }
        if self.fee_config.app_pool_fee_bps + self.fee_config.platform_storage_fee_bps
            > self.fee_config.total_fee_bps
        {
            return Err(MarketplaceError::InvalidInput(
                "app_pool_fee_bps + platform_storage_fee_bps cannot exceed total_fee_bps".into(),
            ));
        }
        events::emit_fee_config_updated(
            &self.owner_id,
            self.fee_config.total_fee_bps,
            self.fee_config.app_pool_fee_bps,
            self.fee_config.platform_storage_fee_bps,
        );
        Ok(())
    }

    /// Merges app default royalty with creator royalty; app entries cannot be removed by the creator.
    /// Shared accounts are summed. Returns `Err` if merged total exceeds `MAX_ROYALTY_BPS`.
    pub(crate) fn merge_royalties(
        &self,
        app_id: Option<&AccountId>,
        creator_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    ) -> Result<Option<std::collections::HashMap<AccountId, u32>>, MarketplaceError> {
        let app_royalty = app_id
            .and_then(|id| self.app_pools.get(id))
            .and_then(|pool| pool.default_royalty.clone());

        let result = match (app_royalty, creator_royalty) {
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
        };

        if let Some(ref r) = result {
            Self::validate_royalty(r)?;
        }

        Ok(result)
    }

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

    pub(crate) fn validate_metadata_json(json_str: &str) -> Result<(), MarketplaceError> {
        if json_str.len() > MAX_METADATA_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Metadata exceeds max length of {} bytes",
                MAX_METADATA_LEN
            )));
        }
        let _: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(json_str)
            .map_err(|_| MarketplaceError::InvalidInput("Metadata must be valid JSON".into()))?;
        Ok(())
    }

    /// Each recipient's share is scaled proportionally to `amount_after_fee`.
    /// Rounding dust goes to the platform fee recipient.
    /// If payout total is 0, the full amount goes to `fallback_recipient`.
    pub(crate) fn distribute_payout(
        &self,
        payout: &Payout,
        amount_after_fee: u128,
        fallback_recipient: &AccountId,
    ) {
        let total_payout: u128 = payout.payout.values().map(|a| a.0).sum();
        if total_payout > 0 {
            let mut actual_distributed: u128 = 0;
            for (receiver, amount) in payout.payout.iter() {
                if amount.0 > 0 {
                    let scaled_amount = (primitive_types::U256::from(amount.0)
                        * primitive_types::U256::from(amount_after_fee)
                        / primitive_types::U256::from(total_payout))
                    .as_u128();
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
