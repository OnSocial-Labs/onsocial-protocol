//! Fee routing, calculation, and distribution for primary and secondary sales.

use crate::*;
use super::PrimarySaleResult;

impl Contract {
    // Storage covered by 3-tier waterfall, never deducted from `price`.
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

    // Expiry validation is the caller's responsibility.
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

        let (total_fee, _, _, _) = self.internal_calculate_fee_split(sale_price, app_id.as_ref());
        let (revenue, app_pool_amount) = self.route_fee(sale_price, app_id.as_ref());
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

    // Returns (total_fee, app_pool_amount, platform_storage_amount, revenue_amount).
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

        let platform_amount =
            (price * self.fee_config.platform_storage_fee_bps as u128) / BASIS_POINTS as u128;
        let revenue = total_fee.saturating_sub(platform_amount);
        (total_fee, 0, platform_amount, revenue)
    }

    // Falls back to platform pool if app pool is missing at settlement.
    pub(crate) fn route_fee(&mut self, price: u128, app_id: Option<&AccountId>) -> (u128, u128) {
        let (_, app_amount, platform_amount, revenue) =
            self.internal_calculate_fee_split(price, app_id);

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

    // Validates sub-fees against effective post-update total to prevent stale-value bugs.
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

    // Rounding dust goes to fee recipient; if payout total is 0, full amount goes to fallback.
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
