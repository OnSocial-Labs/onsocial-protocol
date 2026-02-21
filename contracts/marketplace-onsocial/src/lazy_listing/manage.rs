//! Lazy listing create, cancel, and update logic.

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
            crate::validation::validate_royalty(r)?;
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
