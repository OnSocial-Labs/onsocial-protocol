//! Sale domain types.

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
    /// A native marketplace-minted scarce listed for secondary sale.
    NativeScarce {
        token_id: String,
    },
}

/// English auction state — lives alongside a Sale.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct AuctionState {
    /// yoctoNEAR. 0 = no reserve.
    pub reserve_price: u128,
    /// Minimum increment over the previous bid; prevents 1-yocto griefing. yoctoNEAR.
    pub min_bid_increment: u128,
    /// yoctoNEAR.
    pub highest_bid: u128,
    pub highest_bidder: Option<AccountId>,
    pub bid_count: u32,
    /// Duration (ns) from first qualifying bid; starts the timer in reserve-trigger mode.
    pub auction_duration_ns: Option<u64>,
    /// Extends `expires_at` by this ns if a bid arrives in the final window. 0 = disabled.
    pub anti_snipe_extension_ns: u64,
    /// Bid >= this triggers immediate settlement.
    pub buy_now_price: Option<u128>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Sale {
    pub owner_id: AccountId,
    /// yoctoNEAR.
    pub sale_conditions: U128,
    pub sale_type: SaleType,
    pub expires_at: Option<u64>,
    /// None = fixed-price sale.
    #[serde(default)]
    pub auction: Option<AuctionState>,
}

/// Parameters for listing a native scarce as an English auction.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct AuctionListing {
    pub reserve_price: U128,
    pub min_bid_increment: U128,
    /// Fixed end time. Omit for reserve-trigger mode.
    #[serde(default)]
    pub expires_at: Option<u64>,
    /// Duration in ns after first qualifying bid (reserve-trigger mode).
    #[serde(default)]
    pub auction_duration_ns: Option<u64>,
    /// Extend auction by this ns if bid in final window. 0 = disabled.
    #[serde(default)]
    pub anti_snipe_extension_ns: u64,
    #[serde(default)]
    pub buy_now_price: Option<U128>,
}

/// View projection of an active auction (JSON-only, not stored on-chain).
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

/// Optional gas overrides for `nft_transfer_call`.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct GasOverrides {
    /// Gas (TGas) for the receiver's `nft_on_transfer` callback.
    #[serde(default)]
    pub receiver_tgas: Option<u64>,
    /// Gas (TGas) for the `nft_resolve_transfer` resolution.
    #[serde(default)]
    pub resolve_tgas: Option<u64>,
}
