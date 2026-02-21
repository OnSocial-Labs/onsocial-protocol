//! OnSocial Marketplace — 3-tier storage (T1 app pool, T2 platform pool, T3 user balance), relayer-compatible auth, JSON events.

use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};

// --- Modules ---

// Infrastructure
pub mod constants;
mod errors;
mod guards;
mod validation;

// Protocol & events
mod events;
mod external;
mod protocol;

// Domain
mod collections;
mod lazy_listing;
mod offer;
mod sale;
mod scarce;

// Cross-cutting
mod app_pool;
mod fees;
mod royalties;
mod storage;

// Entry points
mod admin;
mod dispatch;
mod execute;
mod upgrade;

pub use constants::*;
pub use errors::MarketplaceError;
pub use protocol::{Action, Auth, Options, Request};
// Types re-exported from their owning modules
pub use sale::{AuctionListing, AuctionState, AuctionView, GasOverrides, Sale, SaleType};
pub use offer::{CollectionOffer, Offer};
pub use lazy_listing::{LazyListing, LazyListingRecord};
pub use fees::FeeConfig;
pub use app_pool::{AppConfig, AppPool};
pub use storage::{StorageKey, UserStorageBalance};
pub use royalties::Payout;
pub use collections::{AllowlistEntry, CollectionConfig, CollectionProgress, CollectionStats, LazyCollection, MintMode, RevocationMode};
pub use scarce::types::{MintContext, RedeemInfo, Scarce, ScarceOptions, ScarceOverrides, TokenMetadata, TokenStatus};
pub use validation::default_true;
pub(crate) use guards::{check_token_in_collection, collection_id_from_token_id};

// --- Contract State ---

#[near(
    contract_state,
    contract_metadata(
        version = "0.1.0",
        link = "https://github.com/OnSocial-Labs/onsocial-protocol",
        standard(standard = "nep171", version = "1.0.0"),
        standard(standard = "nep177", version = "2.0.0"),
        standard(standard = "nep178", version = "1.0.0"),
        standard(standard = "nep181", version = "1.0.0"),
        standard(standard = "nep199", version = "1.0.0"),
        standard(standard = "nep297", version = "1.0.0"),
    )
)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub version: String,

    pub owner_id: AccountId,
    pub fee_recipient: AccountId,
    pub sales: IterableMap<String, Sale>,
    pub(crate) by_owner_id: LookupMap<AccountId, IterableSet<String>>,
    pub(crate) by_scarce_contract_id: LookupMap<AccountId, IterableSet<String>>,

    pub(crate) scarces_per_owner: LookupMap<AccountId, IterableSet<String>>,
    pub scarces_by_id: IterableMap<String, Scarce>,
    pub next_approval_id: u64,
    /// Shared by quick-mints and lazy listings.
    pub next_token_id: u64,

    pub collections: IterableMap<String, LazyCollection>,
    pub collections_by_creator: LookupMap<AccountId, IterableSet<String>>,

    pub fee_config: FeeConfig,

    /// T1: per-app pool; key = app_id.
    pub app_pools: LookupMap<AccountId, AppPool>,
    /// T1: per-(user, app) byte usage; key = "user_id:app_id".
    pub(crate) app_user_usage: LookupMap<String, u64>,
    /// T2: platform pool; funded by `platform_storage_fee_bps` on every sale.
    pub platform_storage_balance: u128,
    /// T3: per-user manual deposits.
    pub user_storage: LookupMap<AccountId, UserStorageBalance>,

    /// Key: "collection_id:account_id"; enforces `max_per_wallet` and allowlist quotas.
    pub(crate) collection_mint_counts: LookupMap<String, u32>,
    /// Key: "{collection_id}:al:{account_id}"; non-zero = wallet may mint before `start_time`.
    pub collection_allowlist: LookupMap<String, u32>,

    /// Per-token offers; key = "{token_id}\0{buyer_id}"; NEAR held in escrow.
    pub offers: IterableMap<String, Offer>,
    /// Per-collection floor offers; key = "{collection_id}\0{buyer_id}".
    pub collection_offers: IterableMap<String, CollectionOffer>,

    /// Key: "ll:{next_token_id}"; minted on purchase; counter shared with QuickMint.
    pub lazy_listings: IterableMap<String, LazyListingRecord>,

    pub intents_executors: Vec<AccountId>,

    /// NEP-177 contract metadata; updatable by owner.
    pub contract_metadata: external::ScarceContractMetadata,

    /// External NFT contracts allowed to call `nft_on_approve`.
    pub approved_nft_contracts: IterableSet<AccountId>,

    /// Transient; always 0 at rest; never serialised.
    #[borsh(skip)]
    pub pending_attached_balance: u128,
}
