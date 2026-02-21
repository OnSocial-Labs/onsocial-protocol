use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{near, AccountId};

use crate::constants::*;

// --- Enums ---

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

// --- Structs ---

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

// --- Token-behaviour options ---

/// Token-behaviour options shared by all minting paths. Flattened into parent structs.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct ScarceOptions {
    /// Creator royalty (NEP-199). Key = payee, value = bps.
    #[serde(default)]
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// App pool to sponsor storage and receive fee split.
    #[serde(default)]
    pub app_id: Option<AccountId>,
    /// false = soulbound. Default true.
    #[serde(default = "crate::default_true")]
    pub transferable: bool,
    /// Whether the holder can burn. Default true.
    #[serde(default = "crate::default_true")]
    pub burnable: bool,
}

#[derive(Clone)]
pub struct MintContext {
    pub owner_id: AccountId,
    /// Immutable after mint.
    pub creator_id: AccountId,
    /// Immutable after mint. Buyer on purchase; creator on airdrop/pre-mint.
    pub minter_id: AccountId,
}

/// Optional per-token overrides applied inside `internal_mint`.
#[derive(Clone, Default)]
pub struct ScarceOverrides {
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub app_id: Option<AccountId>,
    pub transferable: Option<bool>,
    pub burnable: Option<bool>,
    pub paid_price: u128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Scarce {
    pub owner_id: AccountId,
    /// Immutable after mint.
    pub creator_id: AccountId,
    /// Immutable after mint. Buyer on purchase; creator on airdrop/pre-mint.
    pub minter_id: AccountId,
    pub metadata: TokenMetadata,
    pub approved_account_ids: std::collections::HashMap<AccountId, u64>,
    /// Creator royalty (NEP-199). Key = payee, value = bps.
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// Nanosecond timestamp of soft revocation; None = active.
    #[serde(default)]
    pub revoked_at: Option<u64>,
    #[serde(default)]
    pub revocation_memo: Option<String>,
    /// Nanosecond timestamp of the last redemption. Redeemed tokens remain transferable.
    #[serde(default)]
    pub redeemed_at: Option<u64>,
    #[serde(default)]
    pub redeem_count: u32,
    /// yoctoNEAR; used for refund claims.
    #[serde(default)]
    pub paid_price: u128,
    #[serde(default)]
    pub refunded: bool,
    /// None = inherit from collection.
    #[serde(default)]
    pub transferable: Option<bool>,
    /// None = inherit from collection.
    #[serde(default)]
    pub burnable: Option<bool>,
    /// None for collection tokens (inherit from collection).
    #[serde(default)]
    pub app_id: Option<AccountId>,
}

/// Token metadata (NEP-177)
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<Base64VecU8>,
    pub copies: Option<u64>,
    pub issued_at: Option<u64>,
    pub expires_at: Option<u64>,
    pub starts_at: Option<u64>,
    pub updated_at: Option<u64>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
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

/// Payout structure (NEP-199).
#[near(serializers = [json])]
pub struct Payout {
    pub payout: std::collections::HashMap<AccountId, U128>,
}

/// Comprehensive token status — single view call for app developers.
#[near(serializers = [json])]
pub struct TokenStatus {
    pub token_id: String,
    pub owner_id: AccountId,
    /// Immutable after mint.
    pub creator_id: AccountId,
    pub minter_id: AccountId,
    pub collection_id: Option<String>,
    pub metadata: TokenMetadata,
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub is_valid: bool,
    pub is_revoked: bool,
    pub revoked_at: Option<u64>,
    pub revocation_memo: Option<String>,
    pub is_expired: bool,
    pub redeem_count: u32,
    pub max_redeems: Option<u32>,
    pub is_fully_redeemed: bool,
    pub redeemed_at: Option<u64>,
    pub is_refunded: bool,
    pub paid_price: U128,
}

#[near(serializers = [json])]
pub struct RedeemInfo {
    pub redeem_count: u32,
    pub max_redeems: Option<u32>,
}

// --- Parameter structs ---

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

// --- Offer types ---

/// An offer to buy a specific token that is not currently listed for sale.
/// NEAR is held in escrow until the offer is accepted, cancelled, or expires.
/// Key: `"{token_id}\0{buyer_id}"`.
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

/// A floor offer to buy any token from a specific collection.
/// NEAR is held in escrow per offer.
/// Key: `"{collection_id}\0{buyer_id}"`.
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

// --- Fee / pool types ---

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct FeeConfig {
    /// 200 = 2.0%.
    pub total_fee_bps: u16,
    /// Portion of `total_fee_bps` to app pool (50 = 0.5%). Applied only when a pool is registered.
    pub app_pool_fee_bps: u16,
    /// Portion of `total_fee_bps` (no app_id) to platform storage pool (50 = 0.5%).
    pub platform_storage_fee_bps: u16,
}

impl Default for FeeConfig {
    fn default() -> Self {
        Self {
            total_fee_bps: DEFAULT_TOTAL_FEE_BPS,
            app_pool_fee_bps: DEFAULT_APP_POOL_FEE_BPS,
            platform_storage_fee_bps: DEFAULT_PLATFORM_STORAGE_FEE_BPS,
        }
    }
}

/// Per-app isolated storage pool.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct AppPool {
    pub owner_id: AccountId,
    /// yoctoNEAR.
    pub balance: u128,
    pub used_bytes: u64,
    /// Per-user lifetime cap (bytes).
    pub max_user_bytes: u64,
    /// Default royalty for all app collections; merged with creator royalties, capped at MAX_ROYALTY_BPS.
    pub default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// Primary sale commission in bps; paid to app owner directly. Max 5000.
    pub primary_sale_bps: u16,
    /// Authorised to ban/create collections (curated mode). Max 20; only owner can modify.
    #[serde(default)]
    pub moderators: Vec<AccountId>,
    /// true = only owner/moderator can create collections; false = anyone can.
    #[serde(default)]
    pub curated: bool,
    /// Free-form JSON metadata.
    #[serde(default)]
    pub metadata: Option<String>,
}

/// Parameters for `RegisterApp` / `SetAppConfig`.
#[near(serializers = [json])]
#[derive(Clone, Default)]
pub struct AppConfig {
    pub max_user_bytes: Option<u64>,
    pub default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub primary_sale_bps: Option<u16>,
    pub curated: Option<bool>,
    pub metadata: Option<String>,
}

/// On-chain lazy listing; token is minted on purchase. Creator pays ~0.5 KB upfront.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct LazyListingRecord {
    pub creator_id: AccountId,
    /// Stamped onto the token at mint time.
    pub metadata: TokenMetadata,
    /// yoctoNEAR. 0 = free.
    pub price: u128,
    /// NEP-199; baked into the minted token.
    #[serde(default)]
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// App pool to sponsor storage and receive fee split.
    #[serde(default)]
    pub app_id: Option<AccountId>,
    /// false = soulbound. Default true.
    #[serde(default = "crate::default_true")]
    pub transferable: bool,
    /// Whether the holder can burn. Default true.
    #[serde(default = "crate::default_true")]
    pub burnable: bool,
    /// Nanoseconds; listing cannot be purchased after.
    #[serde(default)]
    pub expires_at: Option<u64>,
    /// Nanoseconds.
    pub created_at: u64,
}

/// Parameters for lazy listing creation.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct LazyListing {
    pub metadata: TokenMetadata,
    pub price: U128,
    #[serde(flatten)]
    pub options: ScarceOptions,
    /// Nanoseconds. Listing cannot be purchased after.
    #[serde(default)]
    pub expires_at: Option<u64>,
}

/// Per-user storage balance (manual deposits).
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct UserStorageBalance {
    /// yoctoNEAR.
    pub balance: u128,
    /// Bytes consumed from user's own balance (Tier 3).
    pub used_bytes: u64,
    /// Bytes consumed from platform pool (Tier 2).
    #[serde(default)]
    pub tier2_used_bytes: u64,
}
