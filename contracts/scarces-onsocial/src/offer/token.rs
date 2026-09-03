use super::{Offer, offer_key};
use crate::storage::storage_byte_cost;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;

fn token_offer_prefix(token_id: &str) -> String {
    format!("{}\0", token_id)
}

fn offer_is_expired(expires_at: Option<u64>, now: u64) -> bool {
    matches!(expires_at, Some(exp) if now > exp)
}

#[near]
impl Contract {
    pub fn get_offer(&self, token_id: String, buyer_id: AccountId) -> Option<Offer> {
        let key = offer_key(&token_id, &buyer_id);
        self.offers.get(&key).cloned()
    }

    /// Expired offers stay in the map until cancel, a later make, or accept/sale cleanup.
    pub fn get_offers_for_token(
        &self,
        token_id: String,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Offer> {
        let prefix = token_offer_prefix(&token_id);
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
    fn token_offer_count_store() -> LookupMap<String, u32> {
        LookupMap::new(StorageKey::TokenOfferCounts)
    }

    fn token_offer_count(&self, token_id: &str) -> Option<u32> {
        Self::token_offer_count_store()
            .get(&token_id.to_string())
            .copied()
    }

    fn set_token_offer_count(&self, token_id: &str, count: u32) {
        let mut store = Self::token_offer_count_store();
        store.insert(token_id.to_string(), count);
    }

    fn refund_offer(&self, token_id: &str, offer: Offer) {
        events::emit_offer_cancelled(&offer.buyer_id, token_id, offer.amount.0);
        let _ = Promise::new(offer.buyer_id).transfer(NearToken::from_yoctonear(offer.amount.0));
    }

    /// First touch prefix-scans once and stores live count. Later calls sweep expired.
    fn touch_token_offer_book(&mut self, token_id: &str) -> u32 {
        let now = env::block_timestamp();
        let prefix = token_offer_prefix(token_id);
        if let Some(count) = self.token_offer_count(token_id) {
            let expired_keys: Vec<String> = self
                .offers
                .iter()
                .filter(|(k, offer)| {
                    k.starts_with(&prefix) && offer_is_expired(offer.expires_at, now)
                })
                .map(|(k, _)| k.clone())
                .collect();
            let refunded = expired_keys.len() as u32;
            for key in expired_keys {
                if let Some(offer) = self.offers.remove(&key) {
                    self.refund_offer(token_id, offer);
                }
            }
            let live = count.saturating_sub(refunded);
            if refunded > 0 {
                self.set_token_offer_count(token_id, live);
            }
            return live;
        }

        let mut live = 0u32;
        let mut expired_keys = Vec::new();
        for (key, offer) in self.offers.iter() {
            if !key.starts_with(&prefix) {
                continue;
            }
            if offer_is_expired(offer.expires_at, now) {
                expired_keys.push(key.clone());
            } else {
                live += 1;
            }
        }
        for key in expired_keys {
            if let Some(offer) = self.offers.remove(&key) {
                self.refund_offer(token_id, offer);
            }
        }
        self.set_token_offer_count(token_id, live);
        live
    }

    fn decrement_live_token_offer_count(&self, token_id: &str) {
        if let Some(count) = self.token_offer_count(token_id) {
            self.set_token_offer_count(token_id, count.saturating_sub(1));
        }
    }

    pub(crate) fn refund_remaining_token_offers(&mut self, token_id: &str) {
        let prefix = token_offer_prefix(token_id);
        let keys: Vec<String> = self
            .offers
            .iter()
            .filter(|(k, _)| k.starts_with(&prefix))
            .map(|(k, _)| k.clone())
            .collect();
        for key in keys {
            if let Some(offer) = self.offers.remove(&key) {
                self.refund_offer(token_id, offer);
            }
        }
        self.set_token_offer_count(token_id, 0);
    }

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

        let live = self.touch_token_offer_book(token_id);
        let key = offer_key(token_id, buyer_id);
        let replacing = self.offers.get(&key).is_some();
        if !replacing && live >= MAX_TOKEN_OFFERS {
            return Err(MarketplaceError::InvalidState(format!(
                "This scarce already has {} offers.",
                MAX_TOKEN_OFFERS
            )));
        }

        if let Some(old_offer) = self.offers.remove(&key) {
            self.refund_offer(token_id, old_offer);
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
            if replacing {
                self.decrement_live_token_offer_count(token_id);
            }
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Offer amount must exceed storage cost of {} yoctoNEAR",
                storage_cost
            )));
        }

        if !replacing {
            self.set_token_offer_count(token_id, live.saturating_add(1));
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

        if !offer_is_expired(offer.expires_at, env::block_timestamp()) {
            self.decrement_live_token_offer_count(token_id);
        }

        self.refund_offer(token_id, offer);
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
                self.refund_offer(token_id, offer);
                self.decrement_live_token_offer_count(token_id);
                return Err(MarketplaceError::InvalidState("Offer has expired".into()));
            }
        }

        let amount = offer.amount.0;
        self.refund_remaining_token_offers(token_id);

        self.transfer(
            owner_id,
            buyer_id,
            token_id,
            None,
            Some("Offer accepted on OnSocial Marketplace".to_string()),
        )?;

        let result = self.settle_secondary_sale(token_id, amount, owner_id, buyer_id)?;

        events::emit_offer_accepted(buyer_id, owner_id, token_id, amount, &result);
        Ok(())
    }
}
