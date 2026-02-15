//! OnSocial Marketplace — Scarce marketplace with relayer-compatible auth,
//! split-fee sponsorship fund, and JSON events.

use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    env, near, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};

mod events;
mod external;
mod internal;
mod protocol;
mod sale;
mod sale_views;
mod sponsor;
mod storage;

// Scarce modules (native scarces)
mod scarce_approval;
mod scarce_callbacks;
mod scarce_core;
mod scarce_enumeration;
mod scarce_metadata;
mod scarce_views;

// Scarce collection modules
mod scarce_collection_purchase;
mod scarce_collection_views;
mod scarce_collections;

pub use protocol::{Action, Auth, Options, Request};

// ── Constants ────────────────────────────────────────────────────────────────

/// Storage cost per sale in yoctoNEAR (0.01 NEAR)
pub const STORAGE_PER_SALE: u128 = 10_000_000_000_000_000_000_000;

/// Maximum token ID length
pub const MAX_TOKEN_ID_LEN: usize = 256;

/// Default total marketplace fee in basis points (250 = 2.5%)
pub const DEFAULT_TOTAL_FEE_BPS: u16 = 250;

/// Default sponsor split in basis points (100 = 1% of sale price)
pub const DEFAULT_SPONSOR_SPLIT_BPS: u16 = 100;

/// Default sponsor fund cap (10 NEAR — enough for ~1000 storage deposits)
pub const DEFAULT_SPONSOR_FUND_CAP: u128 = 10_000_000_000_000_000_000_000_000;

/// Default max sponsored per user (0.01 NEAR = 1 sale slot)
pub const DEFAULT_MAX_SPONSORED_PER_USER: u128 = STORAGE_PER_SALE;

/// Basis points denominator (10,000 = 100%)
pub const BASIS_POINTS: u16 = 10_000;

/// Delimiter for unique sale ID
pub const DELIMETER: &str = ".";

/// No deposit / 1 yocto
pub const NO_DEPOSIT: NearToken = NearToken::from_yoctonear(0);
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

// Native Scarce constants
pub const MAX_COLLECTION_SUPPLY: u32 = 100_000;
pub const MAX_METADATA_LEN: usize = 16_384;
pub const MAX_BATCH_MINT: u32 = 10;

// Gas constants (TGas)
pub const DEFAULT_CALLBACK_GAS: u64 = 50;
pub const DEFAULT_SCARCE_TRANSFER_GAS: u64 = 50;
pub const DEFAULT_RESOLVE_PURCHASE_GAS: u64 = 125;
pub const MAX_RESOLVE_PURCHASE_GAS: u64 = 200;

// ── Storage Keys ─────────────────────────────────────────────────────────────

#[near]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    Sales,
    ByOwnerId,
    ByOwnerIdInner { account_id_hash: Vec<u8> },
    ByScarceContractId,
    ByScarceContractIdInner { account_id_hash: Vec<u8> },
    StorageDeposits,
    ScarcesPerOwner,
    ScarcesPerOwnerInner { account_id_hash: Vec<u8> },
    ScarcesById,
    ScarceMetadataById,
    ScarceApprovalsById,
    Collections,
    CollectionsByCreator,
    CollectionsByCreatorInner { account_id_hash: Vec<u8> },
    SponsoredAccounts,
}

// ── Data Structures ──────────────────────────────────────────────────────────

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
}

/// Information about a sale
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Sale {
    pub owner_id: AccountId,
    pub sale_conditions: U128,
    pub sale_type: SaleType,
    pub expires_at: Option<u64>,
}

/// Native Scarce token (Scarce)
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Scarce {
    pub owner_id: AccountId,
    pub metadata: TokenMetadata,
    pub approved_account_ids: std::collections::HashMap<AccountId, u64>,
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
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub created_at: u64,
}

/// Payout structure from Scarce contract
#[near(serializers = [json])]
pub struct Payout {
    pub payout: std::collections::HashMap<AccountId, U128>,
}

/// Fee configuration with split between revenue and sponsor fund
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct FeeConfig {
    /// Total marketplace fee in basis points (250 = 2.5%)
    pub total_fee_bps: u16,
    /// Portion of total_fee_bps routed to sponsor fund (100 = 1.0%)
    pub sponsor_split_bps: u16,
    /// Once sponsor fund reaches this cap, overflow goes to revenue
    pub sponsor_fund_cap: u128,
    /// Maximum storage sponsored per new user
    pub max_sponsored_per_user: u128,
}

impl Default for FeeConfig {
    fn default() -> Self {
        Self {
            total_fee_bps: DEFAULT_TOTAL_FEE_BPS,
            sponsor_split_bps: DEFAULT_SPONSOR_SPLIT_BPS,
            sponsor_fund_cap: DEFAULT_SPONSOR_FUND_CAP,
            max_sponsored_per_user: DEFAULT_MAX_SPONSORED_PER_USER,
        }
    }
}

// ── Contract State ───────────────────────────────────────────────────────────

#[near(contract_state, contract_metadata(
    version = "0.1.0",
    link = "https://github.com/OnSocial-Labs/onsocial-protocol",
    standard(standard = "nep171", version = "1.0.0"),
    standard(standard = "nep177", version = "2.0.0"),
    standard(standard = "nep178", version = "1.0.0"),
    standard(standard = "nep181", version = "1.0.0"),
    standard(standard = "nep199", version = "1.0.0"),
    standard(standard = "nep297", version = "1.0.0"),
))]
#[derive(PanicOnDefault)]
pub struct Contract {
    // ===== MARKETPLACE STATE =====
    pub owner_id: AccountId,
    pub fee_recipient: AccountId,
    pub sales: IterableMap<String, Sale>,
    pub by_owner_id: LookupMap<AccountId, IterableSet<String>>,
    pub by_scarce_contract_id: LookupMap<AccountId, IterableSet<String>>,
    pub storage_deposits: LookupMap<AccountId, u128>,

    // ===== NATIVE SCARCE STATE =====
    pub scarces_per_owner: LookupMap<AccountId, IterableSet<String>>,
    pub scarces_by_id: IterableMap<String, Scarce>,
    pub next_approval_id: u64,

    // ===== COLLECTION STATE =====
    pub collections: IterableMap<String, LazyCollection>,
    pub collections_by_creator: LookupMap<AccountId, IterableSet<String>>,

    // ===== FEE & SPONSORSHIP =====
    pub fee_config: FeeConfig,
    pub sponsor_fund_balance: u128,
    pub sponsored_accounts: LookupMap<AccountId, u128>,

    // ===== AUTH =====
    pub intents_executors: Vec<AccountId>,
}

// ── Init & Admin ─────────────────────────────────────────────────────────────

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            fee_recipient: owner_id.clone(),
            owner_id,
            sales: IterableMap::new(StorageKey::Sales),
            by_owner_id: LookupMap::new(StorageKey::ByOwnerId),
            by_scarce_contract_id: LookupMap::new(StorageKey::ByScarceContractId),
            storage_deposits: LookupMap::new(StorageKey::StorageDeposits),
            scarces_per_owner: LookupMap::new(StorageKey::ScarcesPerOwner),
            scarces_by_id: IterableMap::new(StorageKey::ScarcesById),
            next_approval_id: 0,
            collections: IterableMap::new(StorageKey::Collections),
            collections_by_creator: LookupMap::new(StorageKey::CollectionsByCreator),
            fee_config: FeeConfig::default(),
            sponsor_fund_balance: 0,
            sponsored_accounts: LookupMap::new(StorageKey::SponsoredAccounts),
            intents_executors: Vec::new(),
        }
    }

    // ── Admin ────────────────────────────────────────────────────────────

    pub fn set_fee_recipient(&mut self, fee_recipient: AccountId) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "Only contract owner can set fee recipient"
        );
        self.fee_recipient = fee_recipient;
    }

    pub fn set_intents_executors(&mut self, executors: Vec<AccountId>) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "Only contract owner can set intents executors"
        );
        self.intents_executors = executors;
    }

    // ── Fee views ────────────────────────────────────────────────────────

    pub fn get_fee_config(&self) -> &FeeConfig {
        &self.fee_config
    }

    pub fn get_fee_recipient(&self) -> AccountId {
        self.fee_recipient.clone()
    }

    pub fn get_sponsor_fund_balance(&self) -> U128 {
        U128(self.sponsor_fund_balance)
    }

    pub fn get_sponsored_amount(&self, account_id: AccountId) -> U128 {
        U128(self.sponsored_accounts.get(&account_id).copied().unwrap_or(0))
    }

    /// Calculate the fee split for a given sale price.
    /// Returns (revenue_to_platform, amount_to_sponsor_fund).
    pub fn calculate_fee_split(&self, price: U128) -> (U128, U128) {
        self.internal_calculate_fee_split(price.0)
    }
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
    pub fn execute(&mut self, request: Request) -> Value {
        let Request {
            target_account,
            action,
            auth,
            options: _options,
        } = request;

        let auth = auth.unwrap_or_default();

        let action_json = near_sdk::serde_json::to_value(&action)
            .unwrap_or_else(|_| env::panic_str("Failed to serialize action"));

        let auth_ctx = onsocial_auth::authenticate(
            &auth,
            target_account.as_ref(),
            &action_json,
            protocol::NONCE_PREFIX,
            &self.intents_executors,
            protocol::DOMAIN_PREFIX,
        )
        .unwrap_or_else(|e| {
            env::panic_str(&format!("Auth failed: {:?}", e));
        });

        let actor_id = auth_ctx.actor_id.clone();

        // Record nonce if signed auth was used
        if let Some((ref owner, ref public_key, nonce)) = auth_ctx.signed_nonce {
            onsocial_auth::nonce::record_nonce(
                protocol::NONCE_PREFIX,
                owner,
                public_key,
                nonce,
            );
        }

        self.dispatch_action(action, &actor_id)
    }
}

// ── Action dispatch ──────────────────────────────────────────────────────────

impl Contract {
    fn dispatch_action(&mut self, action: Action, actor_id: &AccountId) -> Value {
        match action {
            // ── Collections ──────────────────────────────────────────
            Action::CreateCollection {
                collection_id,
                total_supply,
                metadata_template,
                price_near,
                start_time,
                end_time,
            } => {
                self.internal_create_collection(
                    actor_id, collection_id, total_supply,
                    metadata_template, price_near, start_time, end_time,
                );
                Value::Null
            }
            Action::UpdateCollectionPrice { collection_id, new_price_near } => {
                self.internal_update_collection_price(actor_id, collection_id, new_price_near);
                Value::Null
            }
            Action::UpdateCollectionTiming { collection_id, start_time, end_time } => {
                self.internal_update_collection_timing(actor_id, collection_id, start_time, end_time);
                Value::Null
            }

            // ── Listing ──────────────────────────────────────────────
            // NOTE: ListScarce requires cross-contract verification, so it cannot
            // be fully resolved in execute(). The actor must still use the
            // #[payable] list_scarce_for_sale() method with deposit.
            // We handle the gasless-compatible actions here.
            Action::ListScarce { .. } => {
                env::panic_str(
                    "ListScarce requires cross-contract approval checks. \
                     Use list_scarce_for_sale() with attached deposit instead."
                );
            }
            Action::DelistScarce { scarce_contract_id, token_id } => {
                self.internal_delist_scarce(actor_id, &scarce_contract_id, &token_id);
                Value::Null
            }
            Action::UpdatePrice { scarce_contract_id, token_id, price } => {
                self.internal_update_price(actor_id, &scarce_contract_id, &token_id, price);
                Value::Null
            }

            // ── Transfers ────────────────────────────────────────────
            Action::TransferScarce { receiver_id, token_id, memo } => {
                self.internal_transfer(actor_id, &receiver_id, &token_id, None, memo.clone());
                events::emit_scarce_transfer(
                    actor_id, &receiver_id, &token_id, memo.as_deref(),
                );
                Value::Null
            }

            // ── Approvals ────────────────────────────────────────────
            Action::ApproveScarce { token_id, account_id, msg } => {
                self.internal_approve(actor_id, &token_id, &account_id, msg);
                Value::Null
            }
            Action::RevokeScarce { token_id, account_id } => {
                self.internal_revoke(actor_id, &token_id, &account_id);
                Value::Null
            }
            Action::RevokeAllScarce { token_id } => {
                self.internal_revoke_all(actor_id, &token_id);
                Value::Null
            }

            // ── Admin ────────────────────────────────────────────────
            Action::SetFeeRecipient { fee_recipient } => {
                assert_eq!(actor_id, &self.owner_id, "Only owner");
                self.fee_recipient = fee_recipient;
                Value::Null
            }
            Action::UpdateFeeConfig {
                total_fee_bps,
                sponsor_split_bps,
                sponsor_fund_cap,
                max_sponsored_per_user,
            } => {
                assert_eq!(actor_id, &self.owner_id, "Only owner");
                self.internal_update_fee_config(
                    total_fee_bps, sponsor_split_bps,
                    sponsor_fund_cap, max_sponsored_per_user,
                );
                Value::Null
            }
        }
    }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

impl Contract {
    pub(crate) fn make_sale_id(scarce_contract_id: &AccountId, token_id: &str) -> String {
        format!("{}{}{}", scarce_contract_id, DELIMETER, token_id)
    }

    pub(crate) fn internal_storage_balance_of(&self, account_id: &AccountId) -> u128 {
        self.storage_deposits.get(account_id).copied().unwrap_or(0)
    }

    /// Calculate fee split: returns (revenue_amount, sponsor_amount).
    /// If sponsor fund is at cap, all fee goes to revenue.
    pub(crate) fn internal_calculate_fee_split(&self, price: u128) -> (U128, U128) {
        let total_fee = (price * self.fee_config.total_fee_bps as u128) / BASIS_POINTS as u128;

        // If fund is at/above cap, all fee is revenue
        if self.sponsor_fund_balance >= self.fee_config.sponsor_fund_cap {
            return (U128(total_fee), U128(0));
        }

        let sponsor_amount = (price * self.fee_config.sponsor_split_bps as u128) / BASIS_POINTS as u128;

        // Don't overfill the fund
        let headroom = self.fee_config.sponsor_fund_cap.saturating_sub(self.sponsor_fund_balance);
        let sponsor_amount = sponsor_amount.min(headroom);

        let revenue = total_fee.saturating_sub(sponsor_amount);

        (U128(revenue), U128(sponsor_amount))
    }

    /// Delist a scarce (used by execute dispatch and remove_sale)
    pub(crate) fn internal_delist_scarce(
        &mut self,
        actor_id: &AccountId,
        scarce_contract_id: &AccountId,
        token_id: &str,
    ) {
        let sale_id = Self::make_sale_id(scarce_contract_id, token_id);
        let sale = self.sales.get(&sale_id).expect("No sale found");
        assert_eq!(actor_id, &sale.owner_id, "Only owner can delist");
        let owner_id = sale.owner_id.clone();
        self.internal_remove_sale(scarce_contract_id.clone(), token_id.to_string());
        events::emit_scarce_delist(&owner_id, scarce_contract_id, vec![token_id.to_string()]);
    }

    /// Update listing price (used by execute dispatch and update_price)
    pub(crate) fn internal_update_price(
        &mut self,
        actor_id: &AccountId,
        scarce_contract_id: &AccountId,
        token_id: &str,
        price: U128,
    ) {
        let sale_id = Self::make_sale_id(scarce_contract_id, token_id);
        let sale = self.sales.get(&sale_id).expect("No sale found");
        assert_eq!(actor_id, &sale.owner_id, "Only owner can update price");
        assert!(price.0 > 0, "Price must be greater than 0");
        let old_price = sale.sale_conditions;
        let mut sale = sale.clone();
        sale.sale_conditions = price;
        self.sales.insert(sale_id, sale.clone());
        events::emit_scarce_update_price(
            &sale.owner_id, scarce_contract_id, token_id, old_price, price,
        );
    }

    /// Internal approve (used by execute dispatch)
    pub(crate) fn internal_approve(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        account_id: &AccountId,
        _msg: Option<String>,
    ) {
        let mut token = self
            .scarces_by_id
            .get(token_id)
            .expect("Token not found")
            .clone();
        assert_eq!(actor_id, &token.owner_id, "Only owner can approve");
        let approval_id = self.next_approval_id;
        self.next_approval_id += 1;
        token.approved_account_ids.insert(account_id.clone(), approval_id);
        self.scarces_by_id.insert(token_id.to_string(), token);
    }

    /// Internal revoke (used by execute dispatch)
    pub(crate) fn internal_revoke(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        account_id: &AccountId,
    ) {
        let mut token = self
            .scarces_by_id
            .get(token_id)
            .expect("Token not found")
            .clone();
        assert_eq!(actor_id, &token.owner_id, "Only owner can revoke");
        token.approved_account_ids.remove(account_id);
        self.scarces_by_id.insert(token_id.to_string(), token);
    }

    /// Internal revoke all (used by execute dispatch)
    pub(crate) fn internal_revoke_all(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
    ) {
        let mut token = self
            .scarces_by_id
            .get(token_id)
            .expect("Token not found")
            .clone();
        assert_eq!(actor_id, &token.owner_id, "Only owner can revoke all");
        token.approved_account_ids.clear();
        self.scarces_by_id.insert(token_id.to_string(), token);
    }

    /// Update fee config with validation
    pub(crate) fn internal_update_fee_config(
        &mut self,
        total_fee_bps: Option<u16>,
        sponsor_split_bps: Option<u16>,
        sponsor_fund_cap: Option<U128>,
        max_sponsored_per_user: Option<U128>,
    ) {
        if let Some(bps) = total_fee_bps {
            assert!(bps <= 1000, "Total fee cannot exceed 10%");
            self.fee_config.total_fee_bps = bps;
        }
        if let Some(bps) = sponsor_split_bps {
            assert!(
                bps <= self.fee_config.total_fee_bps,
                "Sponsor split cannot exceed total fee"
            );
            self.fee_config.sponsor_split_bps = bps;
        }
        if let Some(cap) = sponsor_fund_cap {
            self.fee_config.sponsor_fund_cap = cap.0;
        }
        if let Some(max) = max_sponsored_per_user {
            self.fee_config.max_sponsored_per_user = max.0;
        }
    }
}
