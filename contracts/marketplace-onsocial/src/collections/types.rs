//! Data types owned by the collections subsystem.

use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::AccountId;

use crate::scarce::types::ScarceOptions;

/// Entry for allowlist operations.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct AllowlistEntry {
    pub account_id: AccountId,
    pub allocation: u32,
}

/// Immutable after collection creation.
#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RevocationMode {
    #[default]
    None,
    /// Soft revoke: keeps token on-chain with `revoked_at` timestamp.
    Invalidate,
    /// Hard burn: deletes token from storage, freeing space.
    Burn,
}

/// Controls who can mint from a collection. Immutable after creation.
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Debug, PartialEq, Default)]
pub enum MintMode {
    /// Anyone can purchase; creator can also pre-mint / airdrop.
    #[default]
    Open,
    /// Only public purchase allowed — creator cannot pre-mint or airdrop.
    PurchaseOnly,
    /// Only creator can mint/airdrop — no public purchase.
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
    /// Dutch auction start price; decreases linearly to `price_near` over `start_time`→`end_time`.
    #[serde(default)]
    pub start_price: Option<U128>,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub created_at: u64,
    /// App that created this collection (fee routing + pool funding).
    pub app_id: Option<AccountId>,
    /// Creator royalty copied to every minted token (NEP-199). Value = bps.
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// Immutable. Whether tokens can have expiry extended.
    #[serde(default)]
    pub renewable: bool,
    /// How tokens can be revoked. Immutable.
    #[serde(default)]
    pub revocation_mode: RevocationMode,
    /// Max redemptions per token. Immutable. None = not redeemable.
    #[serde(default)]
    pub max_redeems: Option<u32>,
    #[serde(default)]
    pub redeemed_count: u32,
    /// Tokens at `max_redeems`; used for refund pool calculation on cancellation.
    #[serde(default)]
    pub fully_redeemed_count: u32,
    /// Whether holders can burn. Immutable. Default true.
    #[serde(default = "crate::default_true")]
    pub burnable: bool,
    /// Controls who can mint. Immutable.
    #[serde(default)]
    pub mint_mode: MintMode,
    /// Max tokens per wallet. Immutable. None = unlimited.
    #[serde(default)]
    pub max_per_wallet: Option<u32>,
    /// false = soulbound. Immutable. Default true.
    #[serde(default = "crate::default_true")]
    pub transferable: bool,
    /// Minting paused; can be resumed (unlike `cancelled`).
    #[serde(default)]
    pub paused: bool,
    /// Collection cancelled; tokens are refund-eligible.
    #[serde(default)]
    pub cancelled: bool,
    /// yoctoNEAR deposited by organizer for refunds.
    #[serde(default)]
    pub refund_pool: u128,
    /// yoctoNEAR per token; set on cancel.
    #[serde(default)]
    pub refund_per_token: u128,
    #[serde(default)]
    pub refunded_count: u32,
    /// Nanosecond deadline; organizer can withdraw unclaimed pool after.
    #[serde(default)]
    pub refund_deadline: Option<u64>,
    /// yoctoNEAR; cumulative revenue, incremented atomically per purchase.
    #[serde(default)]
    pub total_revenue: u128,
    /// yoctoNEAR; allowlisted wallets pay this price before `start_time`. None = regular price.
    #[serde(default)]
    pub allowlist_price: Option<U128>,
    #[serde(default)]
    pub banned: bool,
    /// Free-form JSON metadata for collection branding & discovery.
    #[serde(default)]
    pub metadata: Option<String>,
    /// App-level metadata; independent of creator's `metadata`.
    #[serde(default)]
    pub app_metadata: Option<String>,
}

/// Parameters for `create_collection`. Options (royalty, app_id, etc.) are flattened from `ScarceOptions`.
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
    /// Allow tokens to be renewed (extend expiry). Default false.
    #[serde(default)]
    pub renewable: bool,
    /// How tokens can be revoked. Default none (irrevocable).
    #[serde(default)]
    pub revocation_mode: RevocationMode,
    /// Max redemptions per token. None = not redeemable.
    #[serde(default)]
    pub max_redeems: Option<u32>,
    /// Controls who can mint. Default open.
    #[serde(default)]
    pub mint_mode: MintMode,
    /// Free-form JSON metadata for collection branding/discovery.
    #[serde(default)]
    pub metadata: Option<String>,
    /// Max tokens per wallet. None = unlimited.
    #[serde(default)]
    pub max_per_wallet: Option<u32>,
    /// Dutch auction start price (decreases linearly to price_near).
    #[serde(default)]
    pub start_price: Option<U128>,
    /// Early-access price for allowlisted wallets.
    #[serde(default)]
    pub allowlist_price: Option<U128>,
}

/// Progress of a collection mint.
#[near(serializers = [json])]
pub struct CollectionProgress {
    pub minted: u32,
    pub total: u32,
    pub remaining: u32,
    /// Integer percentage 0–100; truncated (not rounded).
    pub percentage: u32,
}

/// Full collection statistics for dashboards.
#[near(serializers = [json])]
pub struct CollectionStats {
    pub collection_id: String,
    pub creator_id: AccountId,
    pub app_id: Option<AccountId>,
    pub total_supply: u32,
    pub minted_count: u32,
    pub remaining: u32,
    pub price_near: U128,
    /// `None` = fixed price.
    pub start_price: Option<U128>,
    /// Live price after Dutch auction decay; equals `price_near` for fixed-price collections.
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
    /// Early-access price for allowlisted wallets; `None` = same as regular price.
    pub allowlist_price: Option<U128>,
}
