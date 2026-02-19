//! OnSocial Marketplace — Scarce marketplace with relayer-compatible auth,
//! 3-tier byte-accurate storage (app pool [T1] → platform pool [T2] → user balance [T3]),
//! and JSON events.

use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    env, near, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};

// ── Modules ──────────────────────────────────────────────────────────────────

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

// Scarce modules (native scarces)
mod external_scarce_views;
mod scarce_approval;
mod scarce_approval_callbacks;
mod scarce_core;
mod scarce_enumeration;
mod scarce_lifecycle;
mod scarce_metadata;
mod scarce_native_views;
mod scarce_payout;

// Scarce collection modules
mod scarce_collection_purchase;
mod scarce_collection_refunds;
mod scarce_collection_views;
mod scarce_collections;

// Lazy listing (mint-on-purchase)
mod lazy_listing;

pub use constants::*;
pub use errors::MarketplaceError;
pub use protocol::{Action, Auth, Options, Request};
pub use types::*;

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Serde helper – returns `true` for `#[serde(default = "default_true")]`.
pub fn default_true() -> bool {
    true
}

/// Extract collection ID from a token ID (format: "collection_id:serial").
/// Returns `""` for standalone tokens (no `:` separator), which safely
/// produces no-match on collection lookups.
pub(crate) fn collection_id_from_token_id(token_id: &str) -> &str {
    match token_id.find(':') {
        Some(pos) => &token_id[..pos],
        None => "",
    }
}

/// Check that a token ID belongs to the specified collection.
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

// ── Storage Keys ─────────────────────────────────────────────────────────────

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
}

// ── Contract State ───────────────────────────────────────────────────────────

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
    // ===== CONTRACT VERSION =====
    /// Semantic version from Cargo.toml, updated on each migration.
    pub version: String,

    // ===== MARKETPLACE STATE =====
    pub owner_id: AccountId,
    pub fee_recipient: AccountId,
    pub sales: IterableMap<String, Sale>,
    pub by_owner_id: LookupMap<AccountId, IterableSet<String>>,
    pub by_scarce_contract_id: LookupMap<AccountId, IterableSet<String>>,

    // ===== NATIVE SCARCE STATE =====
    pub scarces_per_owner: LookupMap<AccountId, IterableSet<String>>,
    pub scarces_by_id: IterableMap<String, Scarce>,
    pub next_approval_id: u64,
    /// Auto-incrementing ID for standalone (non-collection) quick mints.
    pub next_token_id: u64,

    // ===== COLLECTION STATE =====
    pub collections: IterableMap<String, LazyCollection>,
    pub collections_by_creator: LookupMap<AccountId, IterableSet<String>>,

    // ===== FEE CONFIG =====
    pub fee_config: FeeConfig,

    // ===== STORAGE: 3-TIER SYSTEM =====
    /// Tier 1: Per-app isolated storage pools
    pub app_pools: LookupMap<AccountId, AppPool>,
    /// Tier 1: Per-(user, app) byte usage tracking — key: "user_id:app_id"
    pub app_user_usage: LookupMap<String, u64>,
    /// Tier 2: Platform storage pool funded by platform_storage_fee_bps on each sale.
    /// Sponsors storage for standalone (no-app) operations so users never pay hidden storage costs.
    pub platform_storage_balance: u128,
    /// Tier 3: Per-user manual storage deposits
    pub user_storage: LookupMap<AccountId, UserStorageBalance>,

    // ===== COLLECTION MINT TRACKING =====
    /// Per-(collection, wallet) mint count for max_per_wallet enforcement.
    /// Key: "collection_id:account_id", Value: number of tokens minted.
    pub collection_mint_counts: LookupMap<String, u32>,

    // ===== ALLOWLIST =====
    /// Per-(collection, wallet) allowlist allocation.
    /// Key: "{collection_id}:al:{account_id}", Value: max tokens this wallet can mint early.
    /// Before `start_time`, only wallets with allocation > 0 can purchase.
    pub collection_allowlist: LookupMap<String, u32>,

    // ===== OFFERS =====
    /// Per-token offers — key: "{token_id}\0{buyer_id}".
    /// NEAR is held in escrow until accepted, cancelled, or expired.
    pub offers: IterableMap<String, Offer>,
    /// Per-collection floor offers — key: "{collection_id}\0{buyer_id}".
    pub collection_offers: IterableMap<String, CollectionOffer>,

    // ===== LAZY LISTINGS =====
    /// Lazy listings: metadata + price stored; token minted on purchase.
    /// Key: `"ll:{next_token_id}"` (shares the counter with QuickMint).
    pub lazy_listings: IterableMap<String, LazyListingRecord>,

    // ===== AUTH =====
    pub intents_executors: Vec<AccountId>,

    // ===== NFT CONTRACT METADATA (NEP-177) =====
    /// Configurable contract-level metadata: name, symbol, icon, base_uri.
    /// Returned by nft_metadata(). Updatable by contract owner.
    pub contract_metadata: external::ScarceContractMetadata,
}

// ── Unified execute() entry point ────────────────────────────────────────────

#[near]
impl Contract {
    /// Unified entry point for all authenticated operations.
    ///
    /// Supports all 4 auth models via `onsocial-auth`:
    /// - `Direct`: User signs transaction directly
    /// - `SignedPayload`: Off-chain signed payload (for relayer)
    /// - `DelegateAction`: NEP-366 meta-transactions
    /// - `Intent`: Intent executor pattern
    #[payable]
    #[handle_result]
    pub fn execute(&mut self, request: Request) -> Result<Value, MarketplaceError> {
        let Request {
            target_account,
            action,
            auth,
            options: _options,
        } = request;

        let auth = auth.unwrap_or_default();

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

        // Record nonce if signed auth was used
        if let Some((ref owner, ref public_key, nonce)) = auth_ctx.signed_nonce {
            onsocial_auth::nonce::record_nonce(protocol::NONCE_PREFIX, owner, public_key, nonce);
        }

        self.dispatch_action(action, &actor_id)
    }
}
