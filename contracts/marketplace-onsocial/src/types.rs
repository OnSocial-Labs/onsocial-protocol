//! Marketplace data types — Sale, Scarce, LazyCollection, metadata, etc.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

use crate::constants::*;

// ── Enums ────────────────────────────────────────────────────────────────────

/// Revocation mode for a collection's tokens.
/// Immutable after collection creation.
#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RevocationMode {
    /// Tokens cannot be revoked (default for art/collectibles).
    None,
    /// Soft revoke: token stays on-chain with `revoked_at` timestamp.
    /// Provides an audit trail for certificates, licenses, subscriptions.
    Invalidate,
    /// Hard burn: token is deleted from storage.
    /// Frees storage. Good for temporary passes, tickets after events.
    Burn,
}

impl Default for RevocationMode {
    fn default() -> Self {
        Self::None
    }
}

/// Controls who can mint from a collection. Immutable after creation.
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Debug, PartialEq)]
pub enum MintMode {
    /// Anyone can purchase; creator can also pre-mint / airdrop. (default)
    Open,
    /// Only public purchase allowed — creator cannot pre-mint or airdrop.
    /// Guarantees a fair launch.
    PurchaseOnly,
    /// Only creator/app-owner can mint/airdrop — no public purchase.
    /// Ideal for loyalty tokens, credentials, airdrops.
    CreatorOnly,
}

impl Default for MintMode {
    fn default() -> Self {
        Self::Open
    }
}

/// Type of sale listing
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub enum SaleType {
    External {
        scarce_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
    },
    LazyCollection { collection_id: String },
    /// A native marketplace-minted scarce listed for secondary sale.
    NativeScarce { token_id: String },
}

// ── Structs ──────────────────────────────────────────────────────────────────

/// English auction state — lives alongside a Sale.
/// `Sale.auction = Some(...)` → auction mode, `None` → fixed-price (existing behavior).
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct AuctionState {
    /// Minimum price to settle. 0 = no reserve.
    pub reserve_price: u128,
    /// Minimum absolute increment over previous bid (prevents 1-yocto griefing).
    pub min_bid_increment: u128,
    /// Current highest bid (yoctoNEAR).
    pub highest_bid: u128,
    /// Current highest bidder. None if no bids yet.
    pub highest_bidder: Option<AccountId>,
    /// Number of bids placed.
    pub bid_count: u32,
    /// If set AND Sale.expires_at is initially None → Foundation-style reserve auction:
    /// the timer starts on the first qualifying bid.
    pub auction_duration_ns: Option<u64>,
    /// If a bid arrives within `anti_snipe_extension_ns` of `expires_at`,
    /// `expires_at` is extended by this amount. 0 = disabled.
    pub anti_snipe_extension_ns: u64,
    /// Optional instant-purchase price. A bid >= this triggers immediate settlement.
    pub buy_now_price: Option<u128>,
}

/// Information about a sale
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Sale {
    pub owner_id: AccountId,
    pub sale_conditions: U128,
    pub sale_type: SaleType,
    pub expires_at: Option<u64>,
    /// English auction state. None = fixed-price sale (default).
    #[serde(default)]
    pub auction: Option<AuctionState>,
}

/// Native Scarce token (Scarce)
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Scarce {
    pub owner_id: AccountId,
    pub metadata: TokenMetadata,
    pub approved_account_ids: std::collections::HashMap<AccountId, u64>,
    /// Creator royalty in basis points (NEP-199). Key = payee, value = bps.
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// Nanosecond timestamp when this token was revoked (soft revoke).
    /// None = active. Some = invalidated.
    #[serde(default)]
    pub revoked_at: Option<u64>,
    /// Human-readable reason for revocation.
    #[serde(default)]
    pub revocation_memo: Option<String>,
    /// Nanosecond timestamp of the most recent redemption (check-in/use).
    /// Redeemed tokens are still transferable (collectibles).
    #[serde(default)]
    pub redeemed_at: Option<u64>,
    /// Number of times this token has been redeemed.
    #[serde(default)]
    pub redeem_count: u32,
    /// Price the buyer paid for this token (yoctoNEAR). Used for refund claims.
    #[serde(default)]
    pub paid_price: u128,
    /// Whether this token's refund has been claimed.
    #[serde(default)]
    pub refunded: bool,
}

/// Token metadata (NEP-177)
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub copies: Option<u64>,
    pub issued_at: Option<u64>,
    pub expires_at: Option<u64>,
    pub starts_at: Option<u64>,
    pub updated_at: Option<u64>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

/// Lazy collection configuration
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct LazyCollection {
    pub creator_id: AccountId,
    pub collection_id: String,
    pub total_supply: u32,
    pub minted_count: u32,
    pub metadata_template: String,
    pub price_near: U128,
    /// Dutch auction start price. If set (and > price_near), price decreases
    /// linearly from start_price → price_near over the start_time → end_time window.
    /// None = fixed price (existing behavior).
    #[serde(default)]
    pub start_price: Option<U128>,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub created_at: u64,
    /// App that created this collection (fee routing + pool funding)
    pub app_id: Option<AccountId>,
    /// Creator royalty copied to every minted token (NEP-199)
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// Whether tokens from this collection can be renewed (extend expiry).
    /// Immutable after creation. Default false.
    #[serde(default)]
    pub renewable: bool,
    /// How tokens from this collection can be revoked.
    /// Immutable after creation. Default None (irrevocable).
    #[serde(default)]
    pub revocation_mode: RevocationMode,
    /// Maximum number of redemptions per token. Immutable after creation.
    /// None = not redeemable, Some(1) = single-use ticket, Some(5) = 5-use meal pass.
    #[serde(default)]
    pub max_redeems: Option<u32>,
    /// Total number of individual redemptions across this collection.
    #[serde(default)]
    pub redeemed_count: u32,
    /// Number of tokens fully redeemed (redeem_count == max_redeems).
    /// Used for accurate refund pool calculation on cancellation.
    #[serde(default)]
    pub fully_redeemed_count: u32,
    /// Whether token holders can voluntarily burn their own tokens.
    /// Immutable after creation. Default true.
    #[serde(default = "crate::default_true")]
    pub burnable: bool,
    /// Controls who can mint: open (default), purchase_only, creator_only.
    /// Immutable after creation.
    #[serde(default)]
    pub mint_mode: MintMode,
    /// Max tokens any single wallet can mint from this collection.
    /// None = unlimited. Immutable after creation.
    #[serde(default)]
    pub max_per_wallet: Option<u32>,
    /// Whether tokens from this collection are transferable.
    /// false = soulbound (non-transferable). Immutable after creation. Default true.
    #[serde(default = "crate::default_true")]
    pub transferable: bool,
    /// Whether minting from this collection is temporarily paused.
    /// Unlike `cancelled`, paused collections can be resumed.
    #[serde(default)]
    pub paused: bool,
    /// Whether the collection has been cancelled (refund-eligible).
    #[serde(default)]
    pub cancelled: bool,
    /// NEAR deposited by organizer for refunds.
    #[serde(default)]
    pub refund_pool: u128,
    /// Refund amount per token (set by organizer on cancel).
    #[serde(default)]
    pub refund_per_token: u128,
    /// Number of tokens that have claimed refunds.
    #[serde(default)]
    pub refunded_count: u32,
    /// Deadline (ns) after which organizer can withdraw unclaimed refund pool.
    #[serde(default)]
    pub refund_deadline: Option<u64>,

    /// Optional early-access price for allowlisted wallets.
    /// If set, allowlisted buyers pay this during the pre-start_time phase.
    /// None = WL buyers pay the regular (or Dutch) price.
    #[serde(default)]
    pub allowlist_price: Option<U128>,

    /// Free-form JSON metadata for collection branding & discovery.
    /// Lets individual creators define their collection identity
    /// independent of app-level and profile-level metadata.
    /// Recommended keys: `name`, `icon`, `description`, `base_uri`, `website`.
    #[serde(default)]
    pub metadata: Option<String>,
}

/// Payout structure from Scarce contract
#[near(serializers = [json])]
pub struct Payout {
    pub payout: std::collections::HashMap<AccountId, U128>,
}

/// Comprehensive token status — single view call for app developers.
/// Combines ownership, validity, redemption, revocation, and metadata
/// into one response, eliminating the need for multiple view calls.
#[near(serializers = [json])]
pub struct TokenStatus {
    pub token_id: String,
    pub owner_id: AccountId,
    pub collection_id: Option<String>,
    pub metadata: TokenMetadata,
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    // ── Validity ──
    pub is_valid: bool,
    // ── Revocation ──
    pub is_revoked: bool,
    pub revoked_at: Option<u64>,
    pub revocation_memo: Option<String>,
    // ── Expiry ──
    pub is_expired: bool,
    // ── Redemption ──
    pub redeem_count: u32,
    pub max_redeems: Option<u32>,
    pub is_fully_redeemed: bool,
    pub redeemed_at: Option<u64>,
    // ── Refund ──
    pub is_refunded: bool,
    pub paid_price: U128,
}

// ── Parameter structs ────────────────────────────────────────────────────────

/// Parameters for creating a new lazy-minted scarce collection.
/// Used by both the public `create_collection` method and the gasless
/// `Action::CreateCollection` dispatch path.
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
    #[serde(default)]
    pub app_id: Option<AccountId>,
    #[serde(default)]
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// Allow tokens to be renewed (extend expiry). Default false.
    #[serde(default)]
    pub renewable: bool,
    /// How tokens can be revoked. Default "none" (irrevocable).
    #[serde(default)]
    pub revocation_mode: RevocationMode,
    /// Max redemptions per token. None = not redeemable.
    #[serde(default)]
    pub max_redeems: Option<u32>,
    /// Allow voluntary burns. Default true.
    #[serde(default = "crate::default_true")]
    pub burnable: bool,
    /// Controls who can mint. Default "open".
    #[serde(default)]
    pub mint_mode: MintMode,
    /// Free-form JSON metadata for collection branding/discovery.
    #[serde(default)]
    pub metadata: Option<String>,
    /// Max tokens any single wallet can mint. None = unlimited.
    #[serde(default)]
    pub max_per_wallet: Option<u32>,
    /// Whether tokens are transferable. false = soulbound. Default true.
    #[serde(default = "crate::default_true")]
    pub transferable: bool,
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
    /// Optional instant-purchase price.
    #[serde(default)]
    pub buy_now_price: Option<U128>,
}

/// Optional gas overrides for `nft_transfer_call`.
/// When omitted, sensible defaults are used.
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

// ── Fee / pool types ─────────────────────────────────────────────────────────

/// Fee configuration
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct FeeConfig {
    /// Total marketplace fee in basis points (250 = 2.5%)
    pub total_fee_bps: u16,
    /// Portion of total_fee_bps routed to the originating app's pool (100 = 1%)
    /// When no app is involved, the full fee goes to platform revenue.
    pub app_pool_fee_bps: u16,
}

impl Default for FeeConfig {
    fn default() -> Self {
        Self {
            total_fee_bps: DEFAULT_TOTAL_FEE_BPS,
            app_pool_fee_bps: DEFAULT_APP_POOL_FEE_BPS,
        }
    }
}

/// Per-app isolated storage pool
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct AppPool {
    /// App developer who controls this pool
    pub owner_id: AccountId,
    /// NEAR balance available for storage funding
    pub balance: u128,
    /// Total bytes consumed by users through this pool
    pub used_bytes: u64,
    /// Maximum bytes any single user can consume from this pool (lifetime)
    pub max_user_bytes: u64,
    /// Default royalty added to every collection created through this app.
    /// Creators can add their own royalties on top; the contract merges both
    /// and validates the total doesn't exceed MAX_ROYALTY_BPS.
    pub default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// Commission the app owner takes on every primary sale (basis points).
    /// Paid directly to app owner's wallet, separate from the storage pool.
    /// Max 5000 bps (50%). Default 0.
    pub primary_sale_bps: u16,

    /// Free-form JSON metadata for app branding & discovery.
    /// Devs define their own schema — recommended keys:
    /// `name`, `icon`, `description`, `base_uri`, `website`, `category`.
    /// Consistent with core-onsocial's schemaless KV approach.
    #[serde(default)]
    pub metadata: Option<String>,
}

/// Per-user storage balance (manual deposits)
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct UserStorageBalance {
    /// NEAR deposited by the user
    pub balance: u128,
    /// Bytes consumed against user's own balance
    pub used_bytes: u64,
}
