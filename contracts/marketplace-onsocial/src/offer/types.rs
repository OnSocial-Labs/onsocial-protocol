//! Offer domain types.

use near_sdk::near;
use near_sdk::AccountId;

/// Offer to buy a specific token. NEAR held in escrow. Key: `"{token_id}\0{buyer_id}"`.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Offer {
    pub buyer_id: AccountId,
    /// NEAR deposited (yoctoNEAR).
    pub amount: u128,
    /// Optional expiry (nanoseconds).
    pub expires_at: Option<u64>,
    pub created_at: u64,
}

/// Floor offer for any token in a collection. NEAR held in escrow. Key: `"{collection_id}\0{buyer_id}"`.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CollectionOffer {
    pub buyer_id: AccountId,
    /// NEAR offered per token (yoctoNEAR).
    pub amount: u128,
    /// Optional expiry (nanoseconds).
    pub expires_at: Option<u64>,
    pub created_at: u64,
}
