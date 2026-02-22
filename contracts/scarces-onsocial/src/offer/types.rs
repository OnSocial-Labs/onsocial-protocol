use near_sdk::near;
use near_sdk::AccountId;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Offer {
    pub buyer_id: AccountId,
    pub amount: u128,
    pub expires_at: Option<u64>,
    pub created_at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CollectionOffer {
    pub buyer_id: AccountId,
    pub amount: u128,
    pub expires_at: Option<u64>,
    pub created_at: u64,
}
