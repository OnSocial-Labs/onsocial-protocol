//! Offer/bid system for unlisted tokens and collection-level floor bids.
//!
//! Token offers:   buyer deposits NEAR → owner accepts → token transfers + payment
//! Collection offers: buyer deposits NEAR → any holder in collection accepts
//!
//! NEAR is held in escrow until accepted, cancelled, or expired.

use crate::internal::check_at_least_one_yocto;
use crate::*;

// ── Offer key helpers ────────────────────────────────────────────────────────

fn offer_key(token_id: &str, buyer_id: &AccountId) -> String {
    format!("{}\0{}", token_id, buyer_id)
}

fn collection_offer_key(collection_id: &str, buyer_id: &AccountId) -> String {
    format!("{}\0{}", collection_id, buyer_id)
}

// ── Token Offers ─────────────────────────────────────────────────────────────

#[near]
impl Contract {
    /// Place an offer on a specific token (listed or unlisted).
    /// Attached NEAR is the offer amount and is held in escrow.
    /// Replaces any existing offer from the same buyer on the same token.
    #[payable]
    #[handle_result]
    pub fn make_offer(
        &mut self,
        token_id: String,
        expires_at: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        check_at_least_one_yocto()?;
        let buyer_id = env::predecessor_account_id();
        let amount = env::attached_deposit().as_yoctonear();

        self.internal_make_offer(&buyer_id, &token_id, amount, expires_at)
    }

    /// Cancel an existing offer and reclaim escrowed NEAR.
    #[payable]
    #[handle_result]
    pub fn cancel_offer(&mut self, token_id: String) -> Result<(), MarketplaceError> {
        let buyer_id = env::predecessor_account_id();
        self.internal_cancel_offer(&buyer_id, &token_id)
    }

    /// Accept an offer on your token. Transfers the token and pays the seller.
    /// Requires 1 yoctoNEAR. Only the token owner can accept.
    #[payable]
    #[handle_result]
    pub fn accept_offer(
        &mut self,
        token_id: String,
        buyer_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        let owner_id = env::predecessor_account_id();
        self.internal_accept_offer(&owner_id, &token_id, &buyer_id)
    }

    // ── Views ────────────────────────────────────────────────────────

    /// Get a specific offer on a token.
    pub fn get_offer(&self, token_id: String, buyer_id: AccountId) -> Option<Offer> {
        let key = offer_key(&token_id, &buyer_id);
        self.offers.get(&key).cloned()
    }

    /// Get all active offers on a token (paginated).
    pub fn get_offers_for_token(
        &self,
        token_id: String,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Offer> {
        let prefix = format!("{}\0", token_id);
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;

        self.offers
            .iter()
            .filter(|(k, _)| k.starts_with(&prefix))
            .skip(start)
            .take(limit)
            .map(|(_, o)| o.clone())
            .collect()
    }
}

// ── Collection Offers ────────────────────────────────────────────────────────

#[near]
impl Contract {
    /// Place a floor offer on any token from a collection.
    /// Attached NEAR is the per-token offer amount, held in escrow.
    /// Replaces any existing collection offer from the same buyer.
    #[payable]
    #[handle_result]
    pub fn make_collection_offer(
        &mut self,
        collection_id: String,
        expires_at: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        check_at_least_one_yocto()?;
        let buyer_id = env::predecessor_account_id();
        let amount = env::attached_deposit().as_yoctonear();

        self.internal_make_collection_offer(&buyer_id, &collection_id, amount, expires_at)
    }

    /// Cancel an existing collection offer and reclaim escrowed NEAR.
    #[payable]
    #[handle_result]
    pub fn cancel_collection_offer(
        &mut self,
        collection_id: String,
    ) -> Result<(), MarketplaceError> {
        let buyer_id = env::predecessor_account_id();
        self.internal_cancel_collection_offer(&buyer_id, &collection_id)
    }

    /// Accept a collection offer against a specific token you own.
    /// Requires 1 yoctoNEAR. Only the token owner can accept.
    #[payable]
    #[handle_result]
    pub fn accept_collection_offer(
        &mut self,
        collection_id: String,
        token_id: String,
        buyer_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::internal::check_one_yocto()?;
        let owner_id = env::predecessor_account_id();
        self.internal_accept_collection_offer(&owner_id, &collection_id, &token_id, &buyer_id)
    }

    // ── Views ────────────────────────────────────────────────────────

    /// Get a specific collection offer.
    pub fn get_collection_offer(
        &self,
        collection_id: String,
        buyer_id: AccountId,
    ) -> Option<CollectionOffer> {
        let key = collection_offer_key(&collection_id, &buyer_id);
        self.collection_offers.get(&key).cloned()
    }

    /// Get all active collection offers (paginated).
    pub fn get_collection_offers(
        &self,
        collection_id: String,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<CollectionOffer> {
        let prefix = format!("{}\0", collection_id);
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;

        self.collection_offers
            .iter()
            .filter(|(k, _)| k.starts_with(&prefix))
            .skip(start)
            .take(limit)
            .map(|(_, o)| o.clone())
            .collect()
    }
}

// ── Internal implementations ─────────────────────────────────────────────────

impl Contract {
    pub(crate) fn internal_make_offer(
        &mut self,
        buyer_id: &AccountId,
        token_id: &str,
        amount: u128,
        expires_at: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        // Validate token exists
        let token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;

        // Cannot offer on your own token
        if &token.owner_id == buyer_id {
            return Err(MarketplaceError::InvalidInput(
                "Cannot make an offer on your own token".into(),
            ));
        }

        // Cannot offer on revoked tokens
        if token.revoked_at.is_some() {
            return Err(MarketplaceError::InvalidState(
                "Cannot offer on a revoked token".into(),
            ));
        }

        // Validate expiry
        if let Some(exp) = expires_at {
            if exp <= env::block_timestamp() {
                return Err(MarketplaceError::InvalidInput(
                    "Offer expiry must be in the future".into(),
                ));
            }
        }

        let key = offer_key(token_id, buyer_id);

        // If replacing an existing offer, refund the old amount
        if let Some(old_offer) = self.offers.remove(&key) {
            events::emit_offer_cancelled(buyer_id, token_id, old_offer.amount);
            let _ = Promise::new(old_offer.buyer_id)
                .transfer(NearToken::from_yoctonear(old_offer.amount));
        }

        let offer = Offer {
            buyer_id: buyer_id.clone(),
            amount,
            expires_at,
            created_at: env::block_timestamp(),
        };

        // Measure storage and ensure the offer amount covers it
        let before = env::storage_usage();
        self.offers.insert(key.clone(), offer);
        let bytes_used = env::storage_usage().saturating_sub(before);
        let storage_cost = (bytes_used as u128) * storage_byte_cost();
        if amount <= storage_cost {
            // Offer amount is too small to even cover storage — reject
            let removed = self.offers.remove(&key);
            if let Some(o) = removed {
                let _ = Promise::new(o.buyer_id).transfer(NearToken::from_yoctonear(o.amount));
            }
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Offer amount must exceed storage cost of {} yoctoNEAR",
                storage_cost
            )));
        }

        events::emit_offer_made(buyer_id, token_id, amount, expires_at);
        Ok(())
    }

    pub(crate) fn internal_cancel_offer(
        &mut self,
        buyer_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        let key = offer_key(token_id, buyer_id);
        let offer = self
            .offers
            .remove(&key)
            .ok_or_else(|| MarketplaceError::NotFound("Offer not found".into()))?;

        // Refund escrowed NEAR
        let _ =
            Promise::new(offer.buyer_id.clone()).transfer(NearToken::from_yoctonear(offer.amount));

        events::emit_offer_cancelled(buyer_id, token_id, offer.amount);
        Ok(())
    }

    pub(crate) fn internal_accept_offer(
        &mut self,
        owner_id: &AccountId,
        token_id: &str,
        buyer_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        // Verify ownership
        let token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
        if &token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the token owner can accept offers".into(),
            ));
        }

        // Find and remove the offer
        let key = offer_key(token_id, buyer_id);
        let offer = self
            .offers
            .remove(&key)
            .ok_or_else(|| MarketplaceError::NotFound("Offer not found".into()))?;

        // Check expiry
        if let Some(exp) = offer.expires_at {
            if env::block_timestamp() > exp {
                // Refund expired offer
                let _ = Promise::new(offer.buyer_id.clone())
                    .transfer(NearToken::from_yoctonear(offer.amount));
                return Err(MarketplaceError::InvalidState("Offer has expired".into()));
            }
        }

        let amount = offer.amount;

        // Transfer token to buyer
        self.internal_transfer(
            owner_id,
            buyer_id,
            token_id,
            None,
            Some("Offer accepted on OnSocial Marketplace".to_string()),
        )?;

        // Settle secondary sale
        self.settle_secondary_sale(token_id, amount, owner_id)?;

        events::emit_offer_accepted(buyer_id, owner_id, token_id, amount);
        Ok(())
    }

    pub(crate) fn internal_make_collection_offer(
        &mut self,
        buyer_id: &AccountId,
        collection_id: &str,
        amount: u128,
        expires_at: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        // Validate collection exists
        if !self.collections.contains_key(collection_id) {
            return Err(MarketplaceError::NotFound("Collection not found".into()));
        }

        // Validate expiry
        if let Some(exp) = expires_at {
            if exp <= env::block_timestamp() {
                return Err(MarketplaceError::InvalidInput(
                    "Offer expiry must be in the future".into(),
                ));
            }
        }

        let key = collection_offer_key(collection_id, buyer_id);

        // If replacing, refund old amount
        if let Some(old_offer) = self.collection_offers.remove(&key) {
            events::emit_collection_offer_cancelled(buyer_id, collection_id, old_offer.amount);
            let _ = Promise::new(old_offer.buyer_id)
                .transfer(NearToken::from_yoctonear(old_offer.amount));
        }

        let offer = CollectionOffer {
            buyer_id: buyer_id.clone(),
            amount,
            expires_at,
            created_at: env::block_timestamp(),
        };

        // Measure storage and ensure the offer amount covers it
        let before = env::storage_usage();
        self.collection_offers.insert(key.clone(), offer);
        let bytes_used = env::storage_usage().saturating_sub(before);
        let storage_cost = (bytes_used as u128) * storage_byte_cost();
        if amount <= storage_cost {
            let removed = self.collection_offers.remove(&key);
            if let Some(o) = removed {
                let _ = Promise::new(o.buyer_id).transfer(NearToken::from_yoctonear(o.amount));
            }
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Offer amount must exceed storage cost of {} yoctoNEAR",
                storage_cost
            )));
        }

        events::emit_collection_offer_made(buyer_id, collection_id, amount, expires_at);
        Ok(())
    }

    pub(crate) fn internal_cancel_collection_offer(
        &mut self,
        buyer_id: &AccountId,
        collection_id: &str,
    ) -> Result<(), MarketplaceError> {
        let key = collection_offer_key(collection_id, buyer_id);
        let offer = self
            .collection_offers
            .remove(&key)
            .ok_or_else(|| MarketplaceError::NotFound("Collection offer not found".into()))?;

        let _ =
            Promise::new(offer.buyer_id.clone()).transfer(NearToken::from_yoctonear(offer.amount));

        events::emit_collection_offer_cancelled(buyer_id, collection_id, offer.amount);
        Ok(())
    }

    pub(crate) fn internal_accept_collection_offer(
        &mut self,
        owner_id: &AccountId,
        collection_id: &str,
        token_id: &str,
        buyer_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        // Verify token belongs to collection
        check_token_in_collection(token_id, collection_id)?;

        // Verify ownership
        let token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
        if &token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the token owner can accept collection offers".into(),
            ));
        }

        // Find and remove the collection offer
        let key = collection_offer_key(collection_id, buyer_id);
        let offer = self
            .collection_offers
            .remove(&key)
            .ok_or_else(|| MarketplaceError::NotFound("Collection offer not found".into()))?;

        // Check expiry
        if let Some(exp) = offer.expires_at {
            if env::block_timestamp() > exp {
                let _ = Promise::new(offer.buyer_id.clone())
                    .transfer(NearToken::from_yoctonear(offer.amount));
                return Err(MarketplaceError::InvalidState(
                    "Collection offer has expired".into(),
                ));
            }
        }

        let amount = offer.amount;

        // Transfer token to buyer
        self.internal_transfer(
            owner_id,
            buyer_id,
            token_id,
            None,
            Some("Collection offer accepted on OnSocial Marketplace".to_string()),
        )?;

        // Settle secondary sale
        self.settle_secondary_sale(token_id, amount, owner_id)?;

        events::emit_collection_offer_accepted(buyer_id, owner_id, collection_id, token_id, amount);
        Ok(())
    }
}
