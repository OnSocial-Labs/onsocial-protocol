use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, env, near};

pub mod constants;
mod errors;
mod guards;
mod validation;

mod events;
mod external;
mod protocol;

mod collections;
mod lazy_listing;
mod offer;
mod sale;
mod scarce;

mod app_pool;
mod fees;
mod royalties;
mod storage;

mod admin;
mod dispatch;
mod execute;
mod ft_receiver;
mod upgrade;

#[cfg(test)]
mod tests;

pub use app_pool::{AppConfig, AppPool};
pub use collections::{
    AllowlistEntry, CollectionConfig, CollectionProgress, CollectionStats, LazyCollection,
    MintMode, RevocationMode,
};
pub use constants::*;
pub use errors::MarketplaceError;
pub use fees::{FeeConfig, FeeConfigUpdate};
pub(crate) use guards::{check_token_in_collection, collection_id_from_token_id};
pub use lazy_listing::{LazyListing, LazyListingRecord};
pub use offer::{CollectionOffer, Offer};
pub use protocol::{Action, Auth, Options, Request};
pub use royalties::Payout;
pub use sale::{AuctionListing, AuctionState, AuctionView, GasOverrides, Sale, SaleType};
pub use scarce::types::{
    MintContext, RedeemInfo, Scarce, ScarceOptions, ScarceOverrides, TokenMetadata, TokenStatus,
};
pub use storage::{StorageKey, UserStorageBalance};
pub use validation::default_true;

#[near(
    contract_state,
    contract_metadata(
        version = "0.1.0",
        link = "https://github.com/OnSocial-Labs/onsocial-protocol",
        standard(standard = "nep171", version = "1.2.0"),
        standard(standard = "nep177", version = "2.0.0"),
        standard(standard = "nep178", version = "1.0.0"),
        standard(standard = "nep181", version = "1.0.0"),
        standard(standard = "nep199", version = "2.1.0"),
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
    // Storage key invariant: shared counter ensures unique IDs across standalone mints and lazy listings.
    pub next_token_id: u64,

    pub collections: IterableMap<String, LazyCollection>,
    pub collections_by_creator: LookupMap<AccountId, IterableSet<String>>,

    pub fee_config: FeeConfig,

    pub app_pools: LookupMap<AccountId, AppPool>,
    pub app_pool_ids: IterableSet<AccountId>,
    // Storage/accounting invariant: tracks per-(user, app) byte attribution for tiered storage reversal.
    pub(crate) app_user_usage: LookupMap<String, u64>,
    pub platform_storage_balance: u128,
    pub user_storage: LookupMap<AccountId, UserStorageBalance>,

    pub(crate) collection_mint_counts: LookupMap<String, u32>,
    pub collection_allowlist: LookupMap<String, u32>,

    pub offers: IterableMap<String, Offer>,
    pub collection_offers: IterableMap<String, CollectionOffer>,

    pub lazy_listings: IterableMap<String, LazyListingRecord>,

    pub intents_executors: Vec<AccountId>,

    pub contract_metadata: external::ScarceContractMetadata,

    // Security boundary: only allowlisted external NFT contracts may use approval callback listing flow.
    pub approved_nft_contracts: IterableSet<AccountId>,

    // Cross-contract boundary: accepted FT receiver source for unwrap-and-credit flow.
    pub wnear_account_id: Option<AccountId>,

    // Persistence invariant: transient execution balance is non-persistent and excluded from serialization.
    #[borsh(skip)]
    pub pending_attached_balance: u128,
}
