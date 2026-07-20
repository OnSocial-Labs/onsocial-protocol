use crate::*;

impl Contract {
    pub(crate) fn purchase_lazy_listing(
        &mut self,
        buyer_id: &AccountId,
        listing_id: String,
        quantity: u32,
        deposit: u128,
    ) -> Result<Vec<String>, MarketplaceError> {
        if quantity == 0 || quantity > MAX_BATCH_MINT {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InvalidInput(format!(
                "Quantity must be 1-{}",
                MAX_BATCH_MINT
            )));
        }

        let Some(mut listing) = self.lazy_listings.get(&listing_id).cloned() else {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::NotFound("Lazy listing not found".into()));
        };

        if let Some(exp) = listing.expires_at {
            if env::block_timestamp() > exp {
                self.pending_attached_balance += deposit;
                return Err(MarketplaceError::InvalidState(
                    "Lazy listing has expired".into(),
                ));
            }
        }

        let max_buy = crate::lazy_listing::max_per_purchase(&listing);
        if quantity > max_buy {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InvalidInput(format!(
                "Quantity exceeds max_per_purchase ({})",
                max_buy
            )));
        }

        let remaining = crate::lazy_listing::remaining_editions(&listing);
        if remaining == 0 {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InvalidState(
                "Lazy listing is sold out".into(),
            ));
        }
        if quantity > remaining {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InvalidState(format!(
                "Only {} items remaining",
                remaining
            )));
        }

        let unit_price = listing.price.0;
        let Some(total_price) = unit_price.checked_mul(quantity as u128) else {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InternalError("Price overflow".into()));
        };
        if deposit < total_price {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Insufficient payment: required {}, got {}",
                total_price, deposit
            )));
        }

        let total_editions = crate::lazy_listing::edition_total(&listing);
        let creator_id = listing.creator_id.clone();
        let app_id = listing.app_id.clone();
        let mint_metadata = crate::lazy_listing::metadata_for_mint(&listing.metadata);
        let royalty = listing.royalty.clone();
        let transferable = listing.transferable;
        let burnable = listing.burnable;

        let start_num = self.next_token_id;
        let Some(next_id) = self.next_token_id.checked_add(quantity as u64) else {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InternalError(
                "Token ID counter overflow".into(),
            ));
        };
        self.next_token_id = next_id;
        let token_ids: Vec<String> = (0..quantity)
            .map(|i| format!("s:{}", start_num + i as u64))
            .collect();

        let before = self.storage_usage_flushed();
        let ctx = crate::MintContext {
            owner_id: buyer_id.clone(),
            creator_id: creator_id.clone(),
            minter_id: buyer_id.clone(),
        };
        let ovr = crate::ScarceOverrides {
            royalty,
            app_id: app_id.clone(),
            transferable: Some(transferable),
            burnable: Some(burnable),
            paid_price: unit_price,
        };

        for token_id in &token_ids {
            if let Err(e) = self.mint(
                token_id.clone(),
                ctx.clone(),
                mint_metadata.clone(),
                Some(ovr.clone()),
            ) {
                for tid in &token_ids {
                    if self.scarces_by_id.contains_key(tid) {
                        if let Some(app) = self.resolve_token_app_id(tid, app_id.as_ref()) {
                            self.untrack_app_owner(&app, buyer_id);
                        }
                        self.scarces_by_id.remove(tid);
                        self.remove_token_from_owner(buyer_id, tid);
                    }
                }
                self.pending_attached_balance += deposit;
                return Err(e);
            }
        }

        let bytes_used = self.storage_usage_flushed().saturating_sub(before);

        let result = match self.route_primary_sale(
            total_price,
            bytes_used,
            &creator_id,
            buyer_id,
            app_id.as_ref(),
        ) {
            Ok(r) => r,
            Err(e) => {
                for tid in &token_ids {
                    if let Some(app) = self.resolve_token_app_id(tid, app_id.as_ref()) {
                        self.untrack_app_owner(&app, buyer_id);
                    }
                    self.scarces_by_id.remove(tid);
                    self.remove_token_from_owner(buyer_id, tid);
                }
                self.pending_attached_balance += deposit;
                return Err(e);
            }
        };

        listing.minted_count = listing.minted_count.saturating_add(quantity);

        if listing.minted_count < total_editions {
            let before_update = self.storage_usage_flushed();
            self.lazy_listings
                .insert(listing_id.clone(), listing.clone());
            let after_update = self.storage_usage_flushed();
            match after_update.cmp(&before_update) {
                std::cmp::Ordering::Greater => {
                    let delta = after_update - before_update;
                    if let Err(e) =
                        self.charge_storage_waterfall(&creator_id, delta, app_id.as_ref())
                    {
                        env::panic_str(&format!("Lazy listing storage charge failed: {e}"));
                    }
                }
                std::cmp::Ordering::Less => {
                    self.release_storage_waterfall(
                        &creator_id,
                        before_update - after_update,
                        app_id.as_ref(),
                    );
                }
                std::cmp::Ordering::Equal => {}
            }
        } else {
            let before_remove = self.storage_usage_flushed();
            self.lazy_listings.remove(&listing_id);
            let bytes_freed = before_remove.saturating_sub(self.storage_usage_flushed());
            self.release_storage_waterfall(&creator_id, bytes_freed, app_id.as_ref());
        }

        self.pending_attached_balance += deposit.saturating_sub(total_price);

        let remaining = crate::lazy_listing::remaining_editions(&listing);
        events::emit_lazy_listing_purchased(&events::LazyListingPurchase {
            buyer_id,
            creator_id: &creator_id,
            listing_id: &listing_id,
            quantity,
            unit_price: U128(unit_price),
            total_price: U128(total_price),
            marketplace_fee: U128(result.revenue),
            app_pool_amount: U128(result.app_pool_amount),
            app_commission: U128(result.app_commission),
            creator_payment: U128(result.creator_payment),
            app_id: result.app_id.as_ref(),
            token_ids: &token_ids,
            minted_count: listing.minted_count,
            remaining,
        });

        Ok(token_ids)
    }
}

#[near]
impl Contract {
    pub fn cleanup_expired_lazy_listings(&mut self, limit: Option<u64>) -> u64 {
        let now = env::block_timestamp();
        let limit = limit.unwrap_or(20).min(50) as usize;

        let expired: Vec<(String, LazyListingRecord)> = self
            .lazy_listings
            .iter()
            .filter(|(_, l)| l.expires_at.map(|e| e <= now).unwrap_or(false))
            .take(limit)
            .map(|(id, l)| (id.clone(), l.clone()))
            .collect();

        let mut count = 0u64;
        for (listing_id, listing) in expired {
            if env::prepaid_gas().saturating_sub(env::used_gas()) < near_sdk::Gas::from_tgas(5) {
                break;
            }
            let creator_id = listing.creator_id.clone();
            let app_id = listing.app_id.clone();
            let before = self.storage_usage_flushed();
            self.lazy_listings.remove(&listing_id);
            let bytes_freed = before.saturating_sub(self.storage_usage_flushed());
            self.release_storage_waterfall(&creator_id, bytes_freed, app_id.as_ref());
            events::emit_lazy_listing_expired(&creator_id, &listing_id);
            count += 1;
        }
        count
    }
}
