use near_sdk::AccountId;
use near_sdk::json_types::U128;
use near_sdk::near;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Offer {
    pub buyer_id: AccountId,
    pub amount: U128,
    pub expires_at: Option<u64>,
    pub created_at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CollectionOffer {
    pub buyer_id: AccountId,
    pub amount: U128,
    pub expires_at: Option<u64>,
    pub created_at: u64,
}
