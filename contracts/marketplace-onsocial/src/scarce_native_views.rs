// Native scarce view methods
//
// Token validity, revocation, redemption, and status queries.
// Extracted from scarce_core.rs to separate domain-specific view
// methods from NEP-171 core token mechanics.

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
                // Revoked?
                if token.revoked_at.is_some() {
                    return false;
                }
                // Fully redeemed?
                let cid = collection_id_from_token_id(&token_id);
                if let Some(collection) = self.collections.get(cid) {
                    if let Some(max) = collection.max_redeems {
                        if token.redeem_count >= max {
                            return false;
                        }
                    }
                }
                // Expired?
                if let Some(expires_at) = token.metadata.expires_at {
                    if env::block_timestamp() >= expires_at {
                        return false;
                    }
                }
                true
            }
        }
    }

    /// Check if a token has been revoked (soft revoke).
    /// Returns None if token doesn't exist, Some(false) if active, Some(true) if revoked.
    pub fn is_token_revoked(&self, token_id: String) -> Option<bool> {
        self.scarces_by_id
            .get(&token_id)
            .map(|token| token.revoked_at.is_some())
    }

    /// Check if a token is fully redeemed (all uses consumed).
    /// Returns None if token doesn't exist.
    /// Returns Some(false) if unused or partially used.
    /// Returns Some(true) if all redemptions consumed.
    pub fn is_token_redeemed(&self, token_id: String) -> Option<bool> {
        let token = self.scarces_by_id.get(&token_id)?;
        let cid = collection_id_from_token_id(&token_id);
        if let Some(collection) = self.collections.get(cid) {
            if let Some(max) = collection.max_redeems {
                return Some(token.redeem_count >= max);
            }
        }
        // Not redeemable → not redeemed
        Some(false)
    }

    /// Get the number of times a token has been redeemed and the max allowed.
    /// Returns None if token doesn't exist.
    pub fn get_redeem_info(&self, token_id: String) -> Option<(u32, Option<u32>)> {
        let token = self.scarces_by_id.get(&token_id)?;
        let cid = collection_id_from_token_id(&token_id);
        let max_redeems = self.collections.get(cid).and_then(|c| c.max_redeems);
        Some((token.redeem_count, max_redeems))
    }

    /// Get full token status in a single view call.
    /// Returns all ownership, validity, redemption, revocation, expiry,
    /// and refund info — eliminating the need for multiple separate calls.
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
