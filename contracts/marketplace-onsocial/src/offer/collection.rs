//! Collection-level floor offer entry points and internal logic.

use crate::guards::check_at_least_one_yocto;
use crate::storage::storage_byte_cost;
use crate::*;
use super::{collection_offer_key, CollectionOffer};

// --- Public entry points ---

#[near]
impl Contract {
    /// Replaces any prior collection offer from the caller. Panics if deposit < 1 yoctoNEAR.
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

    #[handle_result]
    pub fn cancel_collection_offer(
        &mut self,
        collection_id: String,
    ) -> Result<(), MarketplaceError> {
        let buyer_id = env::predecessor_account_id();
        self.internal_cancel_collection_offer(&buyer_id, &collection_id)
    }

    /// Only the token owner can call. Panics if deposit != 1 yoctoNEAR.
    #[payable]
    #[handle_result]
    pub fn accept_collection_offer(
        &mut self,
        collection_id: String,
        token_id: String,
        buyer_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
        let owner_id = env::predecessor_account_id();
        self.internal_accept_collection_offer(&owner_id, &collection_id, &token_id, &buyer_id)
    }

    pub fn get_collection_offer(
        &self,
        collection_id: String,
        buyer_id: AccountId,
    ) -> Option<CollectionOffer> {
        let key = collection_offer_key(&collection_id, &buyer_id);
        self.collection_offers.get(&key).cloned()
    }

    /// Expired offers are included until explicitly cancelled.
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

// --- Internal implementations ---

impl Contract {
    pub(crate) fn internal_make_collection_offer(
        &mut self,
        buyer_id: &AccountId,
        collection_id: &str,
        amount: u128,
        expires_at: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        if !self.collections.contains_key(collection_id) {
            return Err(MarketplaceError::NotFound("Collection not found".into()));
        }

        if let Some(exp) = expires_at {
            if exp <= env::block_timestamp() {
                return Err(MarketplaceError::InvalidInput(
                    "Offer expiry must be in the future".into(),
                ));
            }
        }

        let key = collection_offer_key(collection_id, buyer_id);

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

        // post-insert: amount must exceed storage cost
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
            Promise::new(offer.buyer_id).transfer(NearToken::from_yoctonear(offer.amount));

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
        check_token_in_collection(token_id, collection_id)?;

        let token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
        if &token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the token owner can accept collection offers".into(),
            ));
        }

        if buyer_id == owner_id {
            return Err(MarketplaceError::InvalidInput(
                "Cannot accept your own collection offer".into(),
            ));
        }

        let key = collection_offer_key(collection_id, buyer_id);
        let offer = self
            .collection_offers
            .remove(&key)
            .ok_or_else(|| MarketplaceError::NotFound("Collection offer not found".into()))?;

        if let Some(exp) = offer.expires_at {
            if env::block_timestamp() > exp {
                let _ = Promise::new(offer.buyer_id)
                    .transfer(NearToken::from_yoctonear(offer.amount));
                return Err(MarketplaceError::InvalidState(
                    "Collection offer has expired".into(),
                ));
            }
        }

        let amount = offer.amount;

        self.internal_transfer(
            owner_id,
            buyer_id,
            token_id,
            None,
            Some("Collection offer accepted on OnSocial Marketplace".to_string()),
        )?;

        let result = self.settle_secondary_sale(token_id, amount, owner_id)?;

        events::emit_collection_offer_accepted(buyer_id, owner_id, collection_id, token_id, amount, &result);
        Ok(())
    }
}
