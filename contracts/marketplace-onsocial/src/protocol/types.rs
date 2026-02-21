//! Protocol types: Action enum, Request envelope, Options.

use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::AccountId;

use super::AllowlistEntry;
use super::TransferItem;
use onsocial_auth::Auth;

// Marketplace actions dispatched via `execute()`.
// Actions requiring attached NEAR (buying, minting) are separate #[payable] methods — incompatible with the gasless relayer flow.
#[near(serializers = [json])]
#[serde(tag = "type", rename_all = "snake_case")]
#[derive(Clone)]
pub enum Action {
    // --- Collections ---
    // Mint a standalone 1/1 token without a collection. Storage charged via waterfall.
    QuickMint {
        metadata: crate::TokenMetadata,
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
    // Storage charged via waterfall.
    MintFromCollection {
        collection_id: String,
        quantity: u32,
        // Defaults to the actor (creator) if omitted.
        receiver_id: Option<AccountId>,
    },
    // Storage charged via waterfall. Duplicates allowed.
    AirdropFromCollection {
        collection_id: String,
        receivers: Vec<AccountId>,
    },

    // --- Listing ---
    // No cross-contract approval required; marketplace contract owns token data.
    ListNativeScarce {
        token_id: String,
        price: U128,
        expires_at: Option<u64>,
    },
    DelistNativeScarce {
        token_id: String,
    },
    // English auction.
    ListNativeScarceAuction {
        token_id: String,
        #[serde(flatten)]
        params: crate::AuctionListing,
    },
    // Callable by anyone.
    SettleAuction {
        token_id: String,
    },
    // Seller only; only valid before any bids are placed.
    CancelAuction {
        token_id: String,
    },

    // --- Listing (external Scarces) ---
    DelistScarce {
        scarce_contract_id: AccountId,
        token_id: String,
    },
    UpdatePrice {
        scarce_contract_id: AccountId,
        token_id: String,
        price: U128,
    },

    // --- Transfers (native scarces, NEP-171) ---
    TransferScarce {
        receiver_id: AccountId,
        token_id: String,
        memo: Option<String>,
    },

    // --- Approvals (NEP-178) ---
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

    // --- Admin ---
    SetFeeRecipient {
        fee_recipient: AccountId,
    },
    UpdateFeeConfig {
        total_fee_bps: Option<u16>,
        app_pool_fee_bps: Option<u16>,
        platform_storage_fee_bps: Option<u16>,
    },

    // --- Token Lifecycle ---
    // Collection creator only.
    RenewToken {
        token_id: String,
        collection_id: String,
        new_expires_at: u64,
    },
    // Collection creator only.
    RevokeToken {
        token_id: String,
        collection_id: String,
        memo: Option<String>,
    },
    // Token remains on-chain and transferable. Collection creator only.
    RedeemToken {
        token_id: String,
        collection_id: String,
    },
    // Caller must be the token holder.
    ClaimRefund {
        token_id: String,
        collection_id: String,
    },
    // Respects the `burnable` flag.
    BurnScarce {
        token_id: String,
        #[serde(default)]
        collection_id: Option<String>,
    },
    // Panics if minted_count > 0. Creator only.
    DeleteCollection {
        collection_id: String,
    },
    // Creator only.
    PauseCollection {
        collection_id: String,
    },
    // Creator only.
    ResumeCollection {
        collection_id: String,
    },
    // Max 20 transfers per call.
    BatchTransfer {
        transfers: Vec<TransferItem>,
    },

    // --- App Pool ---
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
    TransferAppOwnership {
        app_id: AccountId,
        new_owner: AccountId,
    },
    // Moderators can ban/unban collections and (in curated mode) create collections. Max 20 per app. Owner only.
    AddModerator {
        app_id: AccountId,
        account_id: AccountId,
    },
    // Owner only.
    RemoveModerator {
        app_id: AccountId,
        account_id: AccountId,
    },
    // App owner or moderator only. collection.app_id must match app_id.
    BanCollection {
        app_id: AccountId,
        collection_id: String,
        // Emitted in the event log.
        reason: Option<String>,
    },
    // App owner or moderator only.
    UnbanCollection {
        app_id: AccountId,
        collection_id: String,
    },

    // --- Collection Metadata ---
    // Creator only. Replaces existing metadata entirely.
    SetCollectionMetadata {
        collection_id: String,
        metadata: Option<String>,
    },
    // App owner or moderator only. Replaces existing app_metadata entirely.
    SetCollectionAppMetadata {
        app_id: AccountId,
        collection_id: String,
        metadata: Option<String>,
    },

    // --- Allowlist ---
    // Before start_time, only allowlisted wallets can purchase. Creator only.
    SetAllowlist {
        collection_id: String,
        // Allocation of 0 removes the entry.
        entries: Vec<AllowlistEntry>,
    },
    // Creator only.
    RemoveFromAllowlist {
        collection_id: String,
        accounts: Vec<AccountId>,
    },

    // --- Offers ---
    AcceptOffer {
        token_id: String,
        buyer_id: AccountId,
    },
    CancelOffer {
        token_id: String,
    },
    // Collection-level floor offer accepted against a specific token.
    AcceptCollectionOffer {
        collection_id: String,
        token_id: String,
        buyer_id: AccountId,
    },
    // Cancel your own collection floor offer.
    CancelCollectionOffer {
        collection_id: String,
    },

    // --- Lazy Listings (mint-on-purchase) ---
    // Token stored without minting; minted on purchase.
    CreateLazyListing {
        #[serde(flatten)]
        params: crate::LazyListing,
    },
    // No token was minted.
    CancelLazyListing {
        listing_id: String,
    },
    UpdateLazyListingPrice {
        listing_id: String,
        new_price: U128,
    },
    // Pass null to remove the expiry.
    UpdateLazyListingExpiry {
        listing_id: String,
        new_expires_at: Option<u64>,
    },
}

impl Action {
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

// Request envelope for `execute()`.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Request {
    // Defaults to actor for `Auth::Direct`.
    pub target_account: Option<AccountId>,
    pub action: Action,
    // Defaults to `Auth::Direct`.
    pub auth: Option<Auth>,
    pub options: Option<Options>,
}

#[near(serializers = [json])]
#[derive(Default, Clone)]
pub struct Options {
    // Refund unused deposit to payer instead of crediting actor's storage.
    #[serde(default)]
    pub refund_unused_deposit: bool,
}
