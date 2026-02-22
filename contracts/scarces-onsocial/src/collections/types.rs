use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::AccountId;

use crate::scarce::types::ScarceOptions;

#[near(serializers = [json])]
#[derive(Clone)]
pub struct AllowlistEntry {
    pub account_id: AccountId,
    pub allocation: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RevocationMode {
    #[default]
    None,
    Invalidate,
    Burn,
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Debug, PartialEq, Default)]
pub enum MintMode {
    #[default]
    Open,
    PurchaseOnly,
    CreatorOnly,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct LazyCollection {
    pub creator_id: AccountId,
    pub collection_id: String,
    pub total_supply: u32,
    pub minted_count: u32,
    pub metadata_template: String,
    pub price_near: U128,
    #[serde(default)]
    pub start_price: Option<U128>,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub created_at: u64,
    pub app_id: Option<AccountId>,
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    #[serde(default)]
    pub renewable: bool,
    #[serde(default)]
    pub revocation_mode: RevocationMode,
    #[serde(default)]
    pub max_redeems: Option<u32>,
    #[serde(default)]
    pub redeemed_count: u32,
    // Refund accounting invariant: excluded from refundable supply on cancellation.
    #[serde(default)]
    pub fully_redeemed_count: u32,
    #[serde(default = "crate::default_true")]
    pub burnable: bool,
    #[serde(default)]
    pub mint_mode: MintMode,
    #[serde(default)]
    pub max_per_wallet: Option<u32>,
    #[serde(default = "crate::default_true")]
    pub transferable: bool,
    // State transition invariant: `paused` is reversible.
    #[serde(default)]
    pub paused: bool,
    // State transition invariant: `cancelled` enables refund flow and is terminal.
    #[serde(default)]
    pub cancelled: bool,
    // Token accounting guarantee: remaining refundable balance.
    #[serde(default)]
    pub refund_pool: u128,
    // Token accounting guarantee: fixed refund amount per eligible token after cancellation.
    #[serde(default)]
    pub refund_per_token: u128,
    #[serde(default)]
    pub refunded_count: u32,
    #[serde(default)]
    pub refund_deadline: Option<u64>,
    // Token accounting guarantee: cumulative primary-sale revenue.
    #[serde(default)]
    pub total_revenue: u128,
    #[serde(default)]
    pub allowlist_price: Option<U128>,
    #[serde(default)]
    pub banned: bool,
    #[serde(default)]
    pub metadata: Option<String>,
    #[serde(default)]
    pub app_metadata: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct CollectionConfig {
    pub collection_id: String,
    pub total_supply: u32,
    pub metadata_template: String,
    pub price_near: U128,
    #[serde(default)]
    pub start_time: Option<u64>,
    #[serde(default)]
    pub end_time: Option<u64>,
    #[serde(flatten)]
    pub options: ScarceOptions,
    #[serde(default)]
    pub renewable: bool,
    #[serde(default)]
    pub revocation_mode: RevocationMode,
    #[serde(default)]
    pub max_redeems: Option<u32>,
    #[serde(default)]
    pub mint_mode: MintMode,
    #[serde(default)]
    pub metadata: Option<String>,
    #[serde(default)]
    pub max_per_wallet: Option<u32>,
    #[serde(default)]
    pub start_price: Option<U128>,
    #[serde(default)]
    pub allowlist_price: Option<U128>,
}

#[near(serializers = [json])]
pub struct CollectionProgress {
    pub minted: u32,
    pub total: u32,
    pub remaining: u32,
    pub percentage: u32,
}

#[near(serializers = [json])]
pub struct CollectionStats {
    pub collection_id: String,
    pub creator_id: AccountId,
    pub app_id: Option<AccountId>,
    pub total_supply: u32,
    pub minted_count: u32,
    pub remaining: u32,
    pub price_near: U128,
    pub start_price: Option<U128>,
    pub current_price: U128,
    pub total_revenue: U128,
    pub creator_revenue: U128,
    pub marketplace_fees: U128,
    pub is_active: bool,
    pub is_sold_out: bool,
    pub cancelled: bool,
    pub created_at: u64,
    pub renewable: bool,
    pub revocation_mode: RevocationMode,
    pub max_redeems: Option<u32>,
    pub redeemed_count: u32,
    pub fully_redeemed_count: u32,
    pub burnable: bool,
    pub mint_mode: MintMode,
    pub max_per_wallet: Option<u32>,
    pub transferable: bool,
    pub paused: bool,
    pub banned: bool,
    pub allowlist_price: Option<U128>,
}
