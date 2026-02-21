//! Lazy listing purchase and expired-listing cleanup.

use crate::*;

#[near]
impl Contract {
    /// Errors if deposit < listing price or listing is expired. Excess deposit is refunded.
    #[payable]
    #[handle_result]
    pub fn purchase_lazy_listing(
        &mut self,
        listing_id: String,
    ) -> Result<String, MarketplaceError> {
        let buyer_id = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();

        // Read-only guards before removing the listing to avoid needing a restore on early exits.
        {
            let listing = self
                .lazy_listings
                .get(&listing_id)
                .ok_or_else(|| MarketplaceError::NotFound("Lazy listing not found".into()))?;

            if let Some(exp) = listing.expires_at {
                if env::block_timestamp() > exp {
                    crate::fees::refund_excess(&buyer_id, deposit, 0);
                    return Err(MarketplaceError::InvalidState(
                        "Lazy listing has expired".into(),
                    ));
                }
            }

            if deposit < listing.price {
                crate::fees::refund_excess(&buyer_id, deposit, 0);
                return Err(MarketplaceError::InsufficientDeposit(format!(
                    "Insufficient payment: required {}, got {}",
                    listing.price, deposit
                )));
            }
        }

        // Safety: existence confirmed above; NEAR transactions are atomic.
        let listing = self.lazy_listings.remove(&listing_id).unwrap();
        let price = listing.price;

        let creator_id = listing.creator_id.clone();
        let app_id = listing.app_id.clone();
        let metadata = listing.metadata.clone();
        let royalty = listing.royalty.clone();
        let transferable = listing.transferable;
        let burnable = listing.burnable;

        // Shared with QuickMint; prefix "s:" identifies standalone tokens.
        let token_num = self.next_token_id;
        self.next_token_id = self
            .next_token_id
            .checked_add(1)
            .ok_or_else(|| MarketplaceError::InternalError("Token ID counter overflow".into()))?;
        let token_id = format!("s:{token_num}");

        let before = env::storage_usage();

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
            paid_price: price,
        };
        if let Err(e) = self.internal_mint(token_id.clone(), ctx, metadata, Some(ovr)) {
            crate::fees::refund_excess(&buyer_id, deposit, 0);
            return Err(e);
        }

        let bytes_used = env::storage_usage().saturating_sub(before);

        // On payment failure, reverse the mint to maintain consistent state.
        let result = match self.route_primary_sale(
            price,
            bytes_used,
            &creator_id,
            &buyer_id,
            app_id.as_ref(),
        ) {
            Ok(r) => r,
            Err(e) => {
                self.scarces_by_id.remove(&token_id);
                self.remove_token_from_owner(&buyer_id, &token_id);
                crate::fees::refund_excess(&buyer_id, deposit, 0);
                return Err(e);
            }
        };

        crate::fees::refund_excess(&buyer_id, deposit, price);

        events::emit_lazy_listing_purchased(
            &buyer_id,
            &creator_id,
            &listing_id,
            &token_id,
            price,
            &result,
        );

        Ok(token_id)
    }
}

#[near]
impl Contract {
    /// Removes up to `limit` (max 50) expired listings and releases their storage.
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
            // Stop early if < 5 TGas remain to avoid mid-loop gas exhaustion.
            if env::prepaid_gas().saturating_sub(env::used_gas()) < near_sdk::Gas::from_tgas(5) {
                break;
            }
            let creator_id = listing.creator_id.clone();
            let app_id = listing.app_id.clone();
            let before = env::storage_usage();
            self.lazy_listings.remove(&listing_id);
            let bytes_freed = before.saturating_sub(env::storage_usage());
            self.release_storage_waterfall(&creator_id, bytes_freed, app_id.as_ref());
            events::emit_lazy_listing_expired(&creator_id, &listing_id);
            count += 1;
        }
        count
    }
}
