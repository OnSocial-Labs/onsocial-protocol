use super::{Offer, offer_key};
use crate::storage::storage_byte_cost;
use crate::*;
use near_sdk::json_types::U128;

#[near]
impl Contract {
    pub fn get_offer(&self, token_id: String, buyer_id: AccountId) -> Option<Offer> {
        let key = offer_key(&token_id, &buyer_id);
        self.offers.get(&key).cloned()
    }

    /// Persistence guarantee: expired offers remain queryable until explicit cancellation or acceptance path cleanup.
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

impl Contract {
    pub(crate) fn make_offer(
        &mut self,
        buyer_id: &AccountId,
        token_id: &str,
        amount: u128,
        expires_at: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        let token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;

        if &token.owner_id == buyer_id {
            return Err(MarketplaceError::InvalidInput(
                "Cannot make an offer on your own token".into(),
            ));
        }

        if token.revoked_at.is_some() {
            return Err(MarketplaceError::InvalidState(
                "Cannot offer on a revoked token".into(),
            ));
        }

        if let Some(exp) = expires_at {
            if exp <= env::block_timestamp() {
                return Err(MarketplaceError::InvalidInput(
                    "Offer expiry must be in the future".into(),
                ));
            }
        }

        let key = offer_key(token_id, buyer_id);

        if let Some(old_offer) = self.offers.remove(&key) {
            events::emit_offer_cancelled(buyer_id, token_id, old_offer.amount.0);
            let _ = Promise::new(old_offer.buyer_id)
                .transfer(NearToken::from_yoctonear(old_offer.amount.0));
        }

        let offer = Offer {
            buyer_id: buyer_id.clone(),
            amount: U128(amount),
            expires_at,
            created_at: env::block_timestamp(),
        };

        // Token accounting invariant: offer amount must exceed its storage footprint.
        let before = self.storage_usage_flushed();
        self.offers.insert(key.clone(), offer);
        let bytes_used = self.storage_usage_flushed().saturating_sub(before);
        let storage_cost = (bytes_used as u128) * storage_byte_cost();
        if amount <= storage_cost {
            let removed = self.offers.remove(&key);
            if let Some(o) = removed {
                let _ = Promise::new(o.buyer_id).transfer(NearToken::from_yoctonear(o.amount.0));
            }
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Offer amount must exceed storage cost of {} yoctoNEAR",
                storage_cost
            )));
        }

        events::emit_offer_made(buyer_id, token_id, amount, expires_at);
        Ok(())
    }

    pub(crate) fn cancel_offer(
        &mut self,
        buyer_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        let key = offer_key(token_id, buyer_id);
        let offer = self
            .offers
            .remove(&key)
            .ok_or_else(|| MarketplaceError::NotFound("Offer not found".into()))?;

        let _ = Promise::new(offer.buyer_id).transfer(NearToken::from_yoctonear(offer.amount.0));

        events::emit_offer_cancelled(buyer_id, token_id, offer.amount.0);
        Ok(())
    }

    pub(crate) fn accept_offer(
        &mut self,
        owner_id: &AccountId,
        token_id: &str,
        buyer_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        let token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
        if &token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the token owner can accept offers".into(),
            ));
        }

        let key = offer_key(token_id, buyer_id);
        let offer = self
            .offers
            .remove(&key)
            .ok_or_else(|| MarketplaceError::NotFound("Offer not found".into()))?;

        if let Some(exp) = offer.expires_at {
            if env::block_timestamp() > exp {
                let _ = Promise::new(offer.buyer_id)
                    .transfer(NearToken::from_yoctonear(offer.amount.0));
                return Err(MarketplaceError::InvalidState("Offer has expired".into()));
            }
        }

        let amount = offer.amount.0;

        self.transfer(
            owner_id,
            buyer_id,
            token_id,
            None,
            Some("Offer accepted on OnSocial Marketplace".to_string()),
        )?;

        let result = self.settle_secondary_sale(token_id, amount, owner_id)?;

        events::emit_offer_accepted(buyer_id, owner_id, token_id, amount, &result);
        Ok(())
    }
}
