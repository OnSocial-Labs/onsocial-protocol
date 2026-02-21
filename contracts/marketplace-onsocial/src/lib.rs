//! OnSocial Marketplace — 3-tier storage (T1 app pool, T2 platform pool, T3 user balance), relayer-compatible auth, JSON events.

use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    env, near, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};

// --- Modules ---

mod admin;
mod app_pool;
pub mod constants;
mod dispatch;
mod errors;
mod events;
mod external;
mod internal;
mod offer;
mod protocol;
mod sale;
mod sale_auction;
mod sale_views;
mod storage;
pub mod types;

mod external_scarce_views;
mod scarce_approval;
mod scarce_approval_callbacks;
mod scarce_core;
mod scarce_enumeration;
mod scarce_lifecycle;
mod scarce_metadata;
mod scarce_native_views;
mod scarce_payout;
mod scarce_collection_purchase;
mod scarce_collection_refunds;
mod scarce_collection_views;
mod scarce_collections;
mod lazy_listing;

pub use constants::*;
pub use errors::MarketplaceError;
pub use protocol::{Action, Auth, Options, Request};
pub use types::*;

// --- Helpers ---

pub fn default_true() -> bool {
    true
}

// Token ID format: `"collection_id:serial"`; returns `""` for standalone tokens.
pub(crate) fn collection_id_from_token_id(token_id: &str) -> &str {
    token_id.split_once(':').map_or("", |(prefix, _)| prefix)
}

pub(crate) fn check_token_in_collection(
    token_id: &str,
    collection_id: &str,
) -> Result<(), MarketplaceError> {
    if !token_id.starts_with(&format!("{}:", collection_id)) {
        return Err(MarketplaceError::InvalidInput(
            "Token does not belong to specified collection".into(),
        ));
    }
    Ok(())
}

// --- Storage Keys ---

#[near]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    Sales,
    ByOwnerId,
    ByOwnerIdInner { account_id_hash: Vec<u8> },
    ByScarceContractId,
    ByScarceContractIdInner { account_id_hash: Vec<u8> },
    ScarcesPerOwner,
    ScarcesPerOwnerInner { account_id_hash: Vec<u8> },
    ScarcesById,
    ScarceMetadataById,
    ScarceApprovalsById,
    Collections,
    CollectionsByCreator,
    CollectionsByCreatorInner { account_id_hash: Vec<u8> },
    AppPools,
    AppUserUsage,
    UserStorage,
    CollectionMintCounts,
    CollectionAllowlist,
    Offers,
    CollectionOffers,
    LazyListings,
    ApprovedNftContracts,
}

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
    /// From Cargo.toml; updated on each migration.
    pub version: String,

    pub owner_id: AccountId,
    pub fee_recipient: AccountId,
    pub sales: IterableMap<String, Sale>,
    pub by_owner_id: LookupMap<AccountId, IterableSet<String>>,
    pub by_scarce_contract_id: LookupMap<AccountId, IterableSet<String>>,

    pub scarces_per_owner: LookupMap<AccountId, IterableSet<String>>,
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
    pub app_user_usage: LookupMap<String, u64>,
    /// T2: platform pool; funded by `platform_storage_fee_bps` on every sale.
    pub platform_storage_balance: u128,
    /// T3: per-user manual deposits.
    pub user_storage: LookupMap<AccountId, UserStorageBalance>,

    /// Key: "collection_id:account_id"; enforces `max_per_wallet` and allowlist quotas.
    pub collection_mint_counts: LookupMap<String, u32>,
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
}

// --- execute ---

#[near]
impl Contract {
    /// Authenticated entry point; accepts Direct, SignedPayload, DelegateAction, and Intent auth.
    #[payable]
    #[handle_result]
    pub fn execute(&mut self, request: Request) -> Result<Value, MarketplaceError> {
        let Request {
            target_account,
            action,
            auth,
            options,
        } = request;

        let auth = auth.unwrap_or_default();
        let options = options.unwrap_or_default();

        let action_json = near_sdk::serde_json::to_value(&action)
            .map_err(|_| MarketplaceError::InternalError("Failed to serialize action".into()))?;

        let auth_ctx = onsocial_auth::authenticate(
            &auth,
            target_account.as_ref(),
            &action_json,
            protocol::NONCE_PREFIX,
            &self.intents_executors,
            protocol::DOMAIN_PREFIX,
        )
        .map_err(|e| MarketplaceError::Unauthorized(format!("Auth failed: {:?}", e)))?;

        let actor_id = auth_ctx.actor_id.clone();
        let deposit_owner = auth_ctx.deposit_owner.clone();
        let mut attached_balance = auth_ctx.attached_balance;

        if let Some((ref owner, ref public_key, nonce)) = auth_ctx.signed_nonce {
            let new_bytes =
                onsocial_auth::nonce::record_nonce(protocol::NONCE_PREFIX, owner, public_key, nonce);
            if new_bytes > 0 {
                let cost = new_bytes as u128 * env::storage_byte_cost().as_yoctonear();
                attached_balance = attached_balance.saturating_sub(cost);
            }
        }

        let result = self.dispatch_action(action, &actor_id)?;

        if attached_balance > 0 {
            self.finalize_unused_deposit(attached_balance, &deposit_owner, &options);
        }

        Ok(result)
    }
}
