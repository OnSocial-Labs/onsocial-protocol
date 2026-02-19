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
    // ── Collections ──────────────────────────────────────────────    /// Quick-mint a standalone 1/1 token without creating a collection.
    /// Ideal for casual users (snap a photo → mint). Storage charged via waterfall.
    QuickMint {
        /// NEP-177 metadata for the token (title, media, description, etc.).
        metadata: crate::TokenMetadata,
        /// Unified token-behaviour options (royalty, app_id, transferable, etc.).
        #[serde(flatten)]
        options: crate::ScarceOptions,
    },
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
    /// Creator mints from own collection to self or a recipient.
    /// No payment required — storage charged via waterfall.
    MintFromCollection {
        collection_id: String,
        quantity: u32,
        /// Defaults to the actor (creator) if omitted.
        receiver_id: Option<AccountId>,
    },
    /// Creator airdrops tokens to multiple recipients (one token each).
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
        platform_storage_fee_bps: Option<u16>,
    },

    // ── Token Lifecycle ────────────────────────────────────────────
    /// Renew a token's expiry date (only collection creator).
    RenewToken {
        token_id: String,
        collection_id: String,
        new_expires_at: u64,
    },
    /// Revoke a token (only collection creator).
    RevokeToken {
        token_id: String,
        collection_id: String,
        memo: Option<String>,
    },
    /// Redeem (check-in / use) a token. Token stays on-chain and transferable.
    /// Only collection creator can redeem.
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
    /// Owner voluntarily burns their own token.
    /// For collection tokens, supply `collection_id`. For standalone quick-mint
    /// tokens, omit it (or set to `null`). Respects the burnable flag.
    BurnScarce {
        token_id: String,
        #[serde(default)]
        collection_id: Option<String>,
    },
    /// Delete an empty collection (minted_count == 0). Creator only.
    DeleteCollection {
        collection_id: String,
    },
    /// Temporarily pause minting from a collection. Creator only.
    PauseCollection {
        collection_id: String,
    },
    /// Resume minting from a paused collection. Creator only.
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
        #[serde(flatten)]
        params: crate::AppConfig,
    },
    SetAppConfig {
        app_id: AccountId,
        #[serde(flatten)]
        params: crate::AppConfig,
    },
    /// Transfer app pool ownership to a new account.
    TransferAppOwnership {
        app_id: AccountId,
        new_owner: AccountId,
    },
    /// Add a moderator to an app pool.
    /// Moderators can ban/unban collections and (in curated mode) create
    /// collections. Max 20 per app. Owner only.
    AddModerator {
        app_id: AccountId,
        account_id: AccountId,
    },
    /// Remove a moderator from an app pool. Owner only.
    RemoveModerator {
        app_id: AccountId,
        account_id: AccountId,
    },
    /// Ban a collection from purchases/mints. App owner or moderator.
    /// The collection's `app_id` must match the provided `app_id`.
    BanCollection {
        app_id: AccountId,
        collection_id: String,
        /// Optional human-readable reason (emitted in the event).
        reason: Option<String>,
    },
    /// Unban a previously banned collection. App owner or moderator.
    UnbanCollection {
        app_id: AccountId,
        collection_id: String,
    },

    // ── Collection Metadata ──────────────────────────────────────
    /// Update collection-level metadata. Creator only.
    /// Independent of the token `metadata_template` — this is for
    /// collection branding/discovery (name, icon, description, etc.).
    SetCollectionMetadata {
        collection_id: String,
        /// Free-form JSON metadata (replaces existing metadata entirely).
        metadata: Option<String>,
    },
    /// Set app-level metadata on a collection. App owner or moderator only.
    /// Independent of the creator's `metadata` — used for app branding,
    /// category tags, featured status, etc.
    SetCollectionAppMetadata {
        app_id: AccountId,
        collection_id: String,
        /// Free-form JSON metadata (replaces existing app_metadata entirely).
        metadata: Option<String>,
    },

    // ── Allowlist ─────────────────────────────────────────────────
    /// Add or update allowlist entries for early-access minting.
    /// Before `start_time`, only allowlisted wallets can purchase.
    /// Creator only.
    SetAllowlist {
        collection_id: String,
        /// Each entry maps an account to its max early-access allocation.
        /// Setting allocation to 0 effectively removes the entry.
        entries: Vec<AllowlistEntry>,
    },
    /// Remove wallets from the allowlist. Creator only.
    RemoveFromAllowlist {
        collection_id: String,
        accounts: Vec<AccountId>,
    },

    // ── Offers ──────────────────────────────────────────────────────
    /// Accept an offer on your token (gasless flow).
    AcceptOffer {
        token_id: String,
        buyer_id: AccountId,
    },
    /// Cancel your own offer on a token (gasless flow).
    CancelOffer {
        token_id: String,
    },
    /// Accept a collection-level offer against a specific token you own.
    AcceptCollectionOffer {
        collection_id: String,
        token_id: String,
        buyer_id: AccountId,
    },
    /// Cancel your own collection offer (gasless flow).
    CancelCollectionOffer {
        collection_id: String,
    },

    // ── Lazy Listings (mint-on-purchase) ──────────────────────────
    /// Create a lazy listing: store metadata + price on-chain without minting.
    /// The token is only minted when a buyer purchases.
    CreateLazyListing {
        #[serde(flatten)]
        params: crate::LazyListing,
    },
    /// Cancel (remove) your own lazy listing. No token was minted.
    CancelLazyListing {
        listing_id: String,
    },
    /// Update the price on a lazy listing you own.
    UpdateLazyListingPrice {
        listing_id: String,
        new_price: U128,
    },
    /// Update (or clear) the expiry on a lazy listing you own.
    /// Pass `null` / omit `new_expires_at` to remove the expiry entirely.
    UpdateLazyListingExpiry {
        listing_id: String,
        new_expires_at: Option<u64>,
    },
}

impl Action {
    /// Returns a string identifier for logging/events.
    pub fn action_type(&self) -> &'static str {
        match self {
            Self::QuickMint { .. } => "quick_mint",
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
            Self::TransferAppOwnership { .. } => "transfer_app_ownership",
            Self::AddModerator { .. } => "add_moderator",
            Self::RemoveModerator { .. } => "remove_moderator",
            Self::BanCollection { .. } => "ban_collection",
            Self::UnbanCollection { .. } => "unban_collection",
            Self::SetCollectionMetadata { .. } => "set_collection_metadata",
            Self::SetCollectionAppMetadata { .. } => "set_collection_app_metadata",
            Self::SetAllowlist { .. } => "set_allowlist",
            Self::RemoveFromAllowlist { .. } => "remove_from_allowlist",
            Self::AcceptOffer { .. } => "accept_offer",
            Self::CancelOffer { .. } => "cancel_offer",
            Self::AcceptCollectionOffer { .. } => "accept_collection_offer",
            Self::CancelCollectionOffer { .. } => "cancel_collection_offer",
            Self::CreateLazyListing { .. } => "create_lazy_listing",
            Self::CancelLazyListing { .. } => "cancel_lazy_listing",
            Self::UpdateLazyListingPrice { .. } => "update_lazy_listing_price",
            Self::UpdateLazyListingExpiry { .. } => "update_lazy_listing_expiry",
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
