//! Protocol types for the marketplace unified execute API.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

/// Re-export the shared Auth enum from onsocial-auth.
pub use onsocial_auth::Auth;

/// A single transfer within a batch.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct TransferItem {
    pub receiver_id: AccountId,
    pub token_id: String,
    pub memo: Option<String>,
}

/// Allowlist entry: wallet + max early-access mint allocation.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct AllowlistEntry {
    pub account_id: AccountId,
    pub allocation: u32,
}

/// Nonce storage prefix — distinct from core-onsocial (0x05).
pub const NONCE_PREFIX: u8 = 0x06;

/// Domain prefix for signed-payload verification.
pub const DOMAIN_PREFIX: &str = "onsocial:marketplace";

/// Marketplace actions dispatched via the unified execute API.
///
/// Actions that require attached NEAR payment (buying, minting) remain
/// as separate `#[payable]` methods — they cannot work through a gasless
/// relayer flow.  Everything else goes through `execute()`.
#[near(serializers = [json])]
#[serde(tag = "type", rename_all = "snake_case")]
#[derive(Clone)]
pub enum Action {
    // ── Collections ──────────────────────────────────────────────
    CreateCollection {
        #[serde(flatten)]
        params: crate::CollectionConfig,
    },
    UpdateCollectionPrice {
        collection_id: String,
        new_price_near: U128,
    },
    UpdateCollectionTiming {
        collection_id: String,
        start_time: Option<u64>,
        end_time: Option<u64>,
    },
    /// Creator/app-owner mints from own collection to self or a recipient.
    /// No payment required — storage charged via waterfall.
    MintFromCollection {
        collection_id: String,
        quantity: u32,
        /// Defaults to the actor (creator) if omitted.
        receiver_id: Option<AccountId>,
    },
    /// Creator/app-owner airdrops tokens to multiple recipients (one token each).
    /// No payment required — storage charged via waterfall.
    AirdropFromCollection {
        collection_id: String,
        /// One token minted per entry. Duplicates OK (same user gets multiple).
        receivers: Vec<AccountId>,
    },

    // ── Listing ──────────────────────────────────────────────────────
    /// List a native (marketplace-minted) scarce for sale. No cross-contract
    /// approval needed — the marketplace already owns the token data.
    ListNativeScarce {
        token_id: String,
        price: U128,
        expires_at: Option<u64>,
    },
    /// Delist a native scarce from sale.
    DelistNativeScarce {
        token_id: String,
    },
    /// List a native scarce as an English auction.
    ListNativeScarceAuction {
        token_id: String,
        #[serde(flatten)]
        params: crate::AuctionListing,
    },
    /// Settle an auction after it ends. Anyone can call.
    SettleAuction {
        token_id: String,
    },
    /// Cancel an auction (seller only, only if no bids placed).
    CancelAuction {
        token_id: String,
    },

    // ── Listing (external Scarces) ──────────────────────────────────
    ListScarce {
        scarce_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>,
    },
    DelistScarce {
        scarce_contract_id: AccountId,
        token_id: String,
    },
    UpdatePrice {
        scarce_contract_id: AccountId,
        token_id: String,
        price: U128,
    },

    // ── Transfers (native scarces, NEP-171) ──────────────────────
    TransferScarce {
        receiver_id: AccountId,
        token_id: String,
        memo: Option<String>,
    },

    // ── Approvals (NEP-178) ──────────────────────────────────────
    ApproveScarce {
        token_id: String,
        account_id: AccountId,
        msg: Option<String>,
    },
    RevokeScarce {
        token_id: String,
        account_id: AccountId,
    },
    RevokeAllScarce {
        token_id: String,
    },

    // ── Admin ────────────────────────────────────────────────────
    SetFeeRecipient {
        fee_recipient: AccountId,
    },
    UpdateFeeConfig {
        total_fee_bps: Option<u16>,
        app_pool_fee_bps: Option<u16>,
    },

    // ── Token Lifecycle ────────────────────────────────────────────
    /// Renew a token's expiry date (only collection creator or app owner).
    RenewToken {
        token_id: String,
        collection_id: String,
        new_expires_at: u64,
    },
    /// Revoke (burn) a token (only collection creator or app owner).
    RevokeToken {
        token_id: String,
        collection_id: String,
        memo: Option<String>,
    },
    /// Redeem (check-in / use) a token. Token stays on-chain and transferable.
    /// Only collection creator or app owner can redeem.
    RedeemToken {
        token_id: String,
        collection_id: String,
    },
    /// Claim refund for a token from a cancelled collection.
    /// Caller must be the token holder.
    ClaimRefund {
        token_id: String,
        collection_id: String,
    },
    /// Owner voluntarily burns their own token (requires collection.burnable == true).
    BurnScarce {
        token_id: String,
        collection_id: String,
    },
    /// Delete an empty collection (minted_count == 0). Creator/app owner only.
    DeleteCollection {
        collection_id: String,
    },
    /// Temporarily pause minting from a collection. Creator/app owner only.
    PauseCollection {
        collection_id: String,
    },
    /// Resume minting from a paused collection. Creator/app owner only.
    ResumeCollection {
        collection_id: String,
    },
    /// Transfer multiple native scarces in one call (max 20).
    BatchTransfer {
        transfers: Vec<crate::protocol::TransferItem>,
    },

    // ── App Pool ─────────────────────────────────────────────────
    RegisterApp {
        app_id: AccountId,
        max_user_bytes: Option<u64>,
        default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
        primary_sale_bps: Option<u16>,
        /// Free-form JSON metadata for app branding.
        metadata: Option<String>,
    },
    SetAppConfig {
        app_id: AccountId,
        max_user_bytes: Option<u64>,
        default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
        primary_sale_bps: Option<u16>,
        /// Free-form JSON metadata (replaces existing metadata entirely).
        metadata: Option<String>,
    },

    // ── Collection Metadata ──────────────────────────────────────
    /// Update collection-level metadata. Creator or app owner only.
    /// Independent of the token `metadata_template` — this is for
    /// collection branding/discovery (name, icon, description, etc.).
    SetCollectionMetadata {
        collection_id: String,
        /// Free-form JSON metadata (replaces existing metadata entirely).
        metadata: Option<String>,
    },

    // ── Allowlist ─────────────────────────────────────────────────
    /// Add or update allowlist entries for early-access minting.
    /// Before `start_time`, only allowlisted wallets can purchase.
    /// Creator or app owner only.
    SetAllowlist {
        collection_id: String,
        /// Each entry maps an account to its max early-access allocation.
        /// Setting allocation to 0 effectively removes the entry.
        entries: Vec<AllowlistEntry>,
    },
    /// Remove wallets from the allowlist. Creator or app owner only.
    RemoveFromAllowlist {
        collection_id: String,
        accounts: Vec<AccountId>,
    },
}

impl Action {
    /// Returns a string identifier for logging/events.
    pub fn action_type(&self) -> &'static str {
        match self {
            Self::CreateCollection { .. } => "create_collection",
            Self::UpdateCollectionPrice { .. } => "update_collection_price",
            Self::UpdateCollectionTiming { .. } => "update_collection_timing",
            Self::MintFromCollection { .. } => "mint_from_collection",
            Self::AirdropFromCollection { .. } => "airdrop_from_collection",
            Self::ListNativeScarce { .. } => "list_native_scarce",
            Self::DelistNativeScarce { .. } => "delist_native_scarce",
            Self::ListNativeScarceAuction { .. } => "list_native_scarce_auction",
            Self::SettleAuction { .. } => "settle_auction",
            Self::CancelAuction { .. } => "cancel_auction",
            Self::ListScarce { .. } => "list_scarce",
            Self::DelistScarce { .. } => "delist_scarce",
            Self::UpdatePrice { .. } => "update_price",
            Self::TransferScarce { .. } => "transfer_scarce",
            Self::ApproveScarce { .. } => "approve_scarce",
            Self::RevokeScarce { .. } => "revoke_scarce",
            Self::RevokeAllScarce { .. } => "revoke_all_scarce",
            Self::RenewToken { .. } => "renew_token",
            Self::RevokeToken { .. } => "revoke_token",
            Self::RedeemToken { .. } => "redeem_token",
            Self::ClaimRefund { .. } => "claim_refund",
            Self::BurnScarce { .. } => "burn_scarce",
            Self::DeleteCollection { .. } => "delete_collection",
            Self::PauseCollection { .. } => "pause_collection",
            Self::ResumeCollection { .. } => "resume_collection",
            Self::BatchTransfer { .. } => "batch_transfer",
            Self::SetFeeRecipient { .. } => "set_fee_recipient",
            Self::UpdateFeeConfig { .. } => "update_fee_config",
            Self::RegisterApp { .. } => "register_app",
            Self::SetAppConfig { .. } => "set_app_config",
            Self::SetCollectionMetadata { .. } => "set_collection_metadata",
            Self::SetAllowlist { .. } => "set_allowlist",
            Self::RemoveFromAllowlist { .. } => "remove_from_allowlist",
        }
    }
}

/// Incoming request envelope (mirrors core-onsocial pattern).
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Request {
    /// Defaults to actor for `Auth::Direct`.
    pub target_account: Option<AccountId>,
    pub action: Action,
    /// Defaults to `Auth::Direct`.
    pub auth: Option<Auth>,
    pub options: Option<Options>,
}

/// Execute options.
#[near(serializers = [json])]
#[derive(Default, Clone)]
pub struct Options {
    /// Refund unused deposit to payer instead of crediting actor's storage.
    #[serde(default)]
    pub refund_unused_deposit: bool,
}
