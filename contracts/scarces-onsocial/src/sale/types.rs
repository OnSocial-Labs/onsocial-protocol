use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::AccountId;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub enum SaleType {
    External {
        scarce_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
    },
    NativeScarce {
        token_id: String,
    },
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct AuctionState {
    pub reserve_price: U128,
    pub min_bid_increment: U128,
    pub highest_bid: U128,
    pub highest_bidder: Option<AccountId>,
    pub bid_count: u32,
    pub auction_duration_ns: Option<u64>,
    pub anti_snipe_extension_ns: u64,
    pub buy_now_price: Option<U128>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Sale {
    pub owner_id: AccountId,
    pub sale_conditions: U128,
    pub sale_type: SaleType,
    pub expires_at: Option<u64>,
    #[serde(default)]
    pub auction: Option<AuctionState>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct AuctionListing {
    pub reserve_price: U128,
    pub min_bid_increment: U128,
    #[serde(default)]
    pub expires_at: Option<u64>,
    #[serde(default)]
    pub auction_duration_ns: Option<u64>,
    #[serde(default)]
    pub anti_snipe_extension_ns: u64,
    #[serde(default)]
    pub buy_now_price: Option<U128>,
}

#[near(serializers = [json])]
pub struct AuctionView {
    pub token_id: String,
    pub seller_id: AccountId,
    pub reserve_price: U128,
    pub min_bid_increment: U128,
    pub highest_bid: U128,
    pub highest_bidder: Option<AccountId>,
    pub bid_count: u32,
    pub expires_at: Option<u64>,
    pub anti_snipe_extension_ns: u64,
    pub buy_now_price: Option<U128>,
    pub is_ended: bool,
    pub reserve_met: bool,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct GasOverrides {
    #[serde(default)]
    pub receiver_tgas: Option<u64>,
    #[serde(default)]
    pub resolve_tgas: Option<u64>,
}
