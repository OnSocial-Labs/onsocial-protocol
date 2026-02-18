//! Lazy Listings — mint-on-purchase for standalone tokens.
//!
//! Creator publishes metadata + price without actually minting.
//! When a buyer pays, the token is minted directly to the buyer,
//! the creator gets paid, and fees/storage are deducted from the payment.
//!
//! This is ideal for social-feed marketplaces where users post content and
//! followers can buy right from their feed.

use crate::*;

// ── Internal methods (gasless via dispatch) ──────────────────────────────────

impl Contract {
    /// Create a lazy listing. Only stores metadata + price — no token minted.
    pub(crate) fn internal_create_lazy_listing(
        &mut self,
        creator_id: &AccountId,
        params: LazyListing,
    ) -> Result<String, MarketplaceError> {
        let LazyListing {
            metadata,
            price,
            options: crate::ScarceOptions {
                royalty,
                app_id,
                transferable,
                burnable,
            },
            expires_at,
        } = params;
        let price = price.0;

        // Validate metadata size
        let metadata_json = near_sdk::serde_json::to_string(&metadata)
            .map_err(|_| MarketplaceError::InternalError("Failed to serialize metadata".into()))?;
        if metadata_json.len() > MAX_METADATA_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Metadata exceeds max length of {} bytes",
                MAX_METADATA_LEN
            )));
        }

        // Validate royalty total
        if let Some(ref r) = royalty {
            Self::validate_royalty(r)?;
        }

        // Validate app exists if specified
        if let Some(ref app) = app_id {
            if !self.app_pools.contains_key(app) {
                return Err(MarketplaceError::NotFound("App pool not found".into()));
            }
        }

        // Validate expiry
        if let Some(exp) = expires_at {
            if exp <= env::block_timestamp() {
                return Err(MarketplaceError::InvalidInput(
                    "Expiration must be in the future".into(),
                ));
            }
        }

        // Merge app royalty with creator royalty
        let merged_royalty = self.merge_royalties(app_id.as_ref(), royalty);

        // Generate listing ID using the shared counter (checked to prevent overflow)
        let id = self.next_token_id;
        self.next_token_id = self.next_token_id.checked_add(1)
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

        // Measure storage
        let before = env::storage_usage();
        self.lazy_listings.insert(listing_id.clone(), listing);
        let bytes_used = env::storage_usage().saturating_sub(before);

        // Charge listing storage via waterfall (creator pays)
        let app_ref = self.lazy_listings.get(&listing_id).and_then(|l| l.app_id.clone());
        self.charge_storage_waterfall(creator_id, bytes_used, app_ref.as_ref())?;

        events::emit_lazy_listing_created(creator_id, &listing_id, price);
        Ok(listing_id)
    }

    /// Cancel a lazy listing. Only the creator can cancel.
    pub(crate) fn internal_cancel_lazy_listing(
        &mut self,
        actor_id: &AccountId,
        listing_id: &str,
    ) -> Result<(), MarketplaceError> {
        let listing = self
            .lazy_listings
            .get(listing_id)
            .ok_or_else(|| MarketplaceError::NotFound("Lazy listing not found".into()))?;

        if &listing.creator_id != actor_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the creator can cancel a lazy listing".into(),
            ));
        }

        let creator_id = listing.creator_id.clone();
        self.lazy_listings.remove(listing_id);

        events::emit_lazy_listing_cancelled(&creator_id, listing_id);
        Ok(())
    }

    /// Update the price on a lazy listing. Only the creator can update.
    pub(crate) fn internal_update_lazy_listing_price(
        &mut self,
        actor_id: &AccountId,
        listing_id: &str,
        new_price: u128,
    ) -> Result<(), MarketplaceError> {
        let mut listing = self
            .lazy_listings
            .remove(listing_id)
            .ok_or_else(|| MarketplaceError::NotFound("Lazy listing not found".into()))?;

        if &listing.creator_id != actor_id {
            self.lazy_listings.insert(listing_id.to_string(), listing);
            return Err(MarketplaceError::Unauthorized(
                "Only the creator can update listing price".into(),
            ));
        }

        let old_price = listing.price;
        listing.price = new_price;
        let creator_id = listing.creator_id.clone();
        self.lazy_listings.insert(listing_id.to_string(), listing);

        events::emit_lazy_listing_price_updated(&creator_id, listing_id, old_price, new_price);
        Ok(())
    }
}

// ── Purchase (payable, requires attached NEAR) ──────────────────────────────

#[near]
impl Contract {
    /// Purchase a lazy listing: mints the token to the buyer, pays the creator.
    ///
    /// Attached NEAR must cover `listing.price`.
    /// Storage cost is deducted from the payment (Tier 1: price-embedded).
    /// If the listing is free (price == 0), storage falls through to waterfall.
    #[payable]
    #[handle_result]
    pub fn purchase_lazy_listing(
        &mut self,
        listing_id: String,
    ) -> Result<String, MarketplaceError> {
        let listing = self
            .lazy_listings
            .remove(&listing_id)
            .ok_or_else(|| MarketplaceError::NotFound("Lazy listing not found".into()))?;

        // Check expiry
        if let Some(exp) = listing.expires_at {
            if env::block_timestamp() > exp {
                // Put it back (expired but not yet cleaned up)
                self.lazy_listings.insert(listing_id.clone(), listing);
                return Err(MarketplaceError::InvalidState(
                    "Lazy listing has expired".into(),
                ));
            }
        }

        let buyer_id = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        let price = listing.price;

        if deposit < price {
            self.lazy_listings.insert(listing_id.clone(), listing);
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Insufficient payment: required {}, got {}",
                price, deposit
            )));
        }

        let creator_id = listing.creator_id.clone();
        let app_id = listing.app_id.clone();
        let metadata = listing.metadata.clone();
        let royalty = listing.royalty.clone();
        let transferable = listing.transferable;
        let burnable = listing.burnable;

        // Generate token ID using shared counter (checked to prevent overflow)
        let token_num = self.next_token_id;
        self.next_token_id = self.next_token_id.checked_add(1)
            .ok_or_else(|| MarketplaceError::InternalError("Token ID counter overflow".into()))?;
        let token_id = format!("s:{token_num}");

        // ── Mint token to buyer ──────────────────────────────────────
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
        self.internal_mint(token_id.clone(), ctx, metadata, Some(ovr))?;

        let bytes_used = env::storage_usage().saturating_sub(before);

        // ── Payment routing ──────────────────────────────────────────
        let result = self.route_primary_sale(
            price, bytes_used, &creator_id, &buyer_id, app_id.as_ref(),
        )?;

        // Refund excess deposit
        crate::internal::refund_excess(&buyer_id, deposit, price);

        // Listing is already removed — emit events
        let _ = &result; // used for future analytics
        events::emit_lazy_listing_purchased(
            &buyer_id,
            &creator_id,
            &listing_id,
            &token_id,
            price,
        );

        Ok(token_id)
    }
}

// ── View methods ─────────────────────────────────────────────────────────────

#[near]
impl Contract {
    /// Get a specific lazy listing by ID.
    pub fn get_lazy_listing(&self, listing_id: String) -> Option<LazyListingRecord> {
        self.lazy_listings.get(&listing_id).cloned()
    }

    /// List all lazy listings by a specific creator (paginated).
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

    /// List all lazy listings for an app (paginated).
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

    /// Get the total number of active lazy listings.
    pub fn get_lazy_listings_count(&self) -> u64 {
        self.lazy_listings.len() as u64
    }
}
