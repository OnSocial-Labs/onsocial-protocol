// Token validity, revocation, redemption, and status queries.

use crate::*;

#[near]
impl Contract {
    /// Check if a token is currently valid:
    /// - Exists on-chain
    /// - Not revoked (soft-revoked tokens return false)
    /// - Not redeemed (used tokens return false)
    /// - Not expired (if expires_at is set)
    pub fn is_token_valid(&self, token_id: String) -> bool {
        match self.scarces_by_id.get(&token_id) {
            None => false,
            Some(token) => {
                if token.revoked_at.is_some() {
                    return false;
                }
                let cid = collection_id_from_token_id(&token_id);
                if self.collections.get(cid).and_then(|c| c.max_redeems).is_some_and(|max| token.redeem_count >= max) {
                    return false;
                }
                if token.metadata.expires_at.is_some_and(|exp| env::block_timestamp() >= exp) {
                    return false;
                }
                true
            }
        }
    }

    /// Returns `None` if the token doesn't exist. Reflects soft-revoke only;
    /// hard-burned tokens are absent from storage and return `None`.
    pub fn is_token_revoked(&self, token_id: String) -> Option<bool> {
        self.scarces_by_id
            .get(&token_id)
            .map(|token| token.revoked_at.is_some())
    }

    /// Returns `None` if the token doesn't exist. Returns `Some(false)` for tokens
    /// whose collection has no `max_redeems` limit (non-redeemable tokens are never
    /// considered fully redeemed).
    pub fn is_token_redeemed(&self, token_id: String) -> Option<bool> {
        let token = self.scarces_by_id.get(&token_id)?;
        let cid = collection_id_from_token_id(&token_id);
        Some(self.collections.get(cid).and_then(|c| c.max_redeems).is_some_and(|max| token.redeem_count >= max))
    }

    /// Returns `None` if the token doesn't exist. `max_redeems` is `None` for
    /// non-redeemable tokens (no collection `max_redeems` set).
    pub fn get_redeem_info(&self, token_id: String) -> Option<RedeemInfo> {
        let token = self.scarces_by_id.get(&token_id)?;
        let cid = collection_id_from_token_id(&token_id);
        let max_redeems = self.collections.get(cid).and_then(|c| c.max_redeems);
        Some(RedeemInfo { redeem_count: token.redeem_count, max_redeems })
    }

    /// Aggregate view — avoids the need for multiple round-trips.
    /// Returns `None` if the token doesn't exist.
    pub fn get_token_status(&self, token_id: String) -> Option<TokenStatus> {
        let token = self.scarces_by_id.get(&token_id)?;
        let cid = collection_id_from_token_id(&token_id);
        let collection = self.collections.get(cid);

        let max_redeems = collection.as_ref().and_then(|c| c.max_redeems);
        let is_fully_redeemed = max_redeems.is_some_and(|max| token.redeem_count >= max);
        let is_expired = token
            .metadata
            .expires_at
            .is_some_and(|exp| env::block_timestamp() >= exp);
        let is_revoked = token.revoked_at.is_some();

        Some(TokenStatus {
            token_id: token_id.clone(),
            owner_id: token.owner_id.clone(),
            creator_id: token.creator_id.clone(),
            minter_id: token.minter_id.clone(),
            collection_id: collection.map(|_| cid.to_string()),
            metadata: token.metadata.clone(),
            royalty: token.royalty.clone(),
            is_valid: !is_revoked && !is_fully_redeemed && !is_expired,
            is_revoked,
            revoked_at: token.revoked_at,
            revocation_memo: token.revocation_memo.clone(),
            is_expired,
            redeem_count: token.redeem_count,
            max_redeems,
            is_fully_redeemed,
            redeemed_at: token.redeemed_at,
            is_refunded: token.refunded,
            paid_price: U128(token.paid_price),
        })
    }
}
