use crate::*;

#[near]
impl Contract {
    pub fn is_token_valid(&self, token_id: String) -> bool {
        let Some(token) = self.scarces_by_id.get(&token_id) else {
            return false;
        };
        if token.revoked_at.is_some() {
            return false;
        }
        let cid = collection_id_from_token_id(&token_id);
        if self
            .collections
            .get(cid)
            .and_then(|c| c.max_redeems)
            .is_some_and(|max| token.redeem_count >= max)
        {
            return false;
        }
        if token
            .metadata
            .expires_at
            .is_some_and(|exp| env::block_timestamp() >= exp)
        {
            return false;
        }
        true
    }

    /// `None` for hard-burned tokens (removed from storage); `Some(true)` only for soft-revoked tokens.
    pub fn is_token_revoked(&self, token_id: String) -> Option<bool> {
        self.scarces_by_id
            .get(&token_id)
            .map(|token| token.revoked_at.is_some())
    }

    /// Returns `Some(false)` when the collection has no `max_redeems` limit.
    pub fn is_token_redeemed(&self, token_id: String) -> Option<bool> {
        let token = self.scarces_by_id.get(&token_id)?;
        let cid = collection_id_from_token_id(&token_id);
        let max_redeems = self.collections.get(cid).and_then(|c| c.max_redeems);
        Some(max_redeems.is_some_and(|max| token.redeem_count >= max))
    }

    /// `max_redeems` is `None` for collections without a redemption cap.
    pub fn get_redeem_info(&self, token_id: String) -> Option<RedeemInfo> {
        let token = self.scarces_by_id.get(&token_id)?;
        let cid = collection_id_from_token_id(&token_id);
        let max_redeems = self.collections.get(cid).and_then(|c| c.max_redeems);
        Some(RedeemInfo {
            redeem_count: token.redeem_count,
            max_redeems,
        })
    }

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
            paid_price: token.paid_price,
        })
    }
}
