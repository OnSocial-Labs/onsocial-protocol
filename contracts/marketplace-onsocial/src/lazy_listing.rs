//! Lazy listings: mint-on-purchase for standalone tokens.
//! Storage is managed by the 3-tier waterfall and never deducted from the sale price.

use crate::*;

impl Contract {
    pub(crate) fn internal_create_lazy_listing(
        &mut self,
        creator_id: &AccountId,
        params: LazyListing,
    ) -> Result<String, MarketplaceError> {
        let LazyListing {
            metadata,
            price,
            options:
                crate::ScarceOptions {
                    royalty,
                    app_id,
                    transferable,
                    burnable,
                },
            expires_at,
        } = params;
        let price = price.0;

        let metadata_json = near_sdk::serde_json::to_string(&metadata)
            .map_err(|_| MarketplaceError::InternalError("Failed to serialize metadata".into()))?;
        if metadata_json.len() > MAX_METADATA_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Metadata exceeds max length of {} bytes",
                MAX_METADATA_LEN
            )));
        }

        // Validate royalty before merge so creators get early feedback.
        if let Some(ref r) = royalty {
            Self::validate_royalty(r)?;
        }

        if let Some(ref app) = app_id {
            if !self.app_pools.contains_key(app) {
                return Err(MarketplaceError::NotFound("App pool not found".into()));
            }
        }

        if let Some(exp) = expires_at {
            if exp <= env::block_timestamp() {
                return Err(MarketplaceError::InvalidInput(
                    "Expiration must be in the future".into(),
                ));
            }
        }

        // Capture before app_id moves into the record.
        let listing_app_id = app_id.clone();

        let merged_royalty = self.merge_royalties(app_id.as_ref(), royalty)?;

        // Shared with QuickMint; prefix "ll:" distinguishes lazy listing IDs.
        let id = self.next_token_id;
        self.next_token_id = self
            .next_token_id
            .checked_add(1)
            .ok_or_else(|| MarketplaceError::InternalError("Token ID counter overflow".into()))?;
        let listing_id = format!("ll:{id}");

        let listing = LazyListingRecord {
            creator_id: creator_id.clone(),
            metadata,
            price,
            royalty: merged_royalty,
            app_id,
            transferable,
            burnable,
            expires_at,
            created_at: env::block_timestamp(),
        };

        // Insert first to measure exact byte cost, then charge; roll back on failure.
        let before = env::storage_usage();
        self.lazy_listings.insert(listing_id.clone(), listing);
        let bytes_used = env::storage_usage().saturating_sub(before);
        if let Err(e) =
            self.charge_storage_waterfall(creator_id, bytes_used, listing_app_id.as_ref())
        {
            self.lazy_listings.remove(&listing_id);
            return Err(e);
        }

        events::emit_lazy_listing_created(creator_id, &listing_id, price);
        Ok(listing_id)
    }

    // Creator-only; releases storage back to the originating tier.
    pub(crate) fn internal_cancel_lazy_listing(
        &mut self,
        actor_id: &AccountId,
        listing_id: &str,
    ) -> Result<(), MarketplaceError> {
        let listing = self
            .lazy_listings
            .get(listing_id)
            .ok_or_else(|| MarketplaceError::NotFound("Lazy listing not found".into()))?
            .clone();

        if actor_id != &listing.creator_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the creator can cancel a lazy listing".into(),
            ));
        }

        let creator_id = listing.creator_id.clone();
        let app_id = listing.app_id.clone();

        let before = env::storage_usage();
        self.lazy_listings.remove(listing_id);
        let bytes_freed = before.saturating_sub(env::storage_usage());
        self.release_storage_waterfall(&creator_id, bytes_freed, app_id.as_ref());

        events::emit_lazy_listing_cancelled(&creator_id, listing_id);
        Ok(())
    }

    // Creator-only; pass `None` to make the listing permanent.
    pub(crate) fn internal_update_lazy_listing_expiry(
        &mut self,
        actor_id: &AccountId,
        listing_id: &str,
        new_expires_at: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        if let Some(exp) = new_expires_at {
            if exp <= env::block_timestamp() {
                return Err(MarketplaceError::InvalidInput(
                    "Expiration must be in the future".into(),
                ));
            }
        }

        let creator_id = self
            .lazy_listings
            .get(listing_id)
            .ok_or_else(|| MarketplaceError::NotFound("Lazy listing not found".into()))?
            .creator_id
            .clone();

        if &creator_id != actor_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the creator can update listing expiry".into(),
            ));
        }

        // Safety: existence confirmed above; NEAR transactions are atomic.
        let mut listing = self.lazy_listings.remove(listing_id).unwrap();
        let old_expires_at = listing.expires_at;
        listing.expires_at = new_expires_at;
        self.lazy_listings.insert(listing_id.to_string(), listing);

        events::emit_lazy_listing_expiry_updated(
            &creator_id,
            listing_id,
            old_expires_at,
            new_expires_at,
        );
        Ok(())
    }

    pub(crate) fn internal_update_lazy_listing_price(
        &mut self,
        actor_id: &AccountId,
        listing_id: &str,
        new_price: u128,
    ) -> Result<(), MarketplaceError> {
        let creator_id = self
            .lazy_listings
            .get(listing_id)
            .ok_or_else(|| MarketplaceError::NotFound("Lazy listing not found".into()))?
            .creator_id
            .clone();

        if &creator_id != actor_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the creator can update listing price".into(),
            ));
        }

        // Safety: existence confirmed above; NEAR transactions are atomic.
        let mut listing = self.lazy_listings.remove(listing_id).unwrap();
        let old_price = listing.price;
        listing.price = new_price;
        self.lazy_listings.insert(listing_id.to_string(), listing);

        events::emit_lazy_listing_price_updated(&creator_id, listing_id, old_price, new_price);
        Ok(())
    }
}

#[near]
impl Contract {
    /// Panics (returns Err) if deposit < listing.price or listing is expired.
    /// Creator receives price minus marketplace fees; excess deposit is refunded.
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
                    crate::internal::refund_excess(&buyer_id, deposit, 0);
                    return Err(MarketplaceError::InvalidState(
                        "Lazy listing has expired".into(),
                    ));
                }
            }

            if deposit < listing.price {
                crate::internal::refund_excess(&buyer_id, deposit, 0);
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
            crate::internal::refund_excess(&buyer_id, deposit, 0);
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
                crate::internal::refund_excess(&buyer_id, deposit, 0);
                return Err(e);
            }
        };

        crate::internal::refund_excess(&buyer_id, deposit, price);

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
    /// Callable by anyone. Removes up to `limit` (max 50) expired listings and releases their storage.
    /// Emits `expired` (not `cancelled`) so indexers can distinguish sweeps from manual cancellations.
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

#[near]
impl Contract {
    pub fn get_lazy_listing(&self, listing_id: String) -> Option<LazyListingRecord> {
        self.lazy_listings.get(&listing_id).cloned()
    }

    pub fn get_lazy_listings_by_creator(
        &self,
        creator_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<(String, LazyListingRecord)> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;

        self.lazy_listings
            .iter()
            .filter(|(_, listing)| listing.creator_id == creator_id)
            .skip(start)
            .take(limit)
            .map(|(id, listing)| (id.clone(), listing.clone()))
            .collect()
    }

    pub fn get_lazy_listings_by_app(
        &self,
        app_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<(String, LazyListingRecord)> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;

        self.lazy_listings
            .iter()
            .filter(|(_, listing)| listing.app_id.as_ref() == Some(&app_id))
            .skip(start)
            .take(limit)
            .map(|(id, listing)| (id.clone(), listing.clone()))
            .collect()
    }

    pub fn get_lazy_listings_count(&self) -> u64 {
        self.lazy_listings.len() as u64
    }
}
