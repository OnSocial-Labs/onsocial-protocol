// --- Imports ---
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::store::{LookupMap, IterableMap, IterableSet};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue, NearToken, Gas,
};

mod external;
mod internal;
mod nft_callbacks;
mod sale;
mod sale_views;
mod storage;
mod events;
mod nft_views;

// Native NFT modules
mod nft_core;
mod nft_metadata;
mod nft_approval;
mod nft_enumeration;

// Lazy collection modules
mod collections;
mod collection_purchase;
mod collection_views;

// --- Constants ---
/// Storage cost per sale in yoctoNEAR (0.01 NEAR)
pub const STORAGE_PER_SALE: u128 = 10_000_000_000_000_000_000_000;

/// Maximum token ID length - prevents storage DoS while supporting all current and future NFT standards
pub const MAX_TOKEN_ID_LEN: usize = 256;

/// Marketplace fee in basis points (250 = 2.5%)
pub const MARKETPLACE_FEE_BPS: u16 = 250;

/// Basis points denominator (10,000 = 100%)
pub const BASIS_POINTS: u16 = 10_000;

/// Delimiter for unique sale ID
pub const DELIMETER: &str = ".";

/// No deposit required for view calls, 1 yoctoNEAR for security on writes
pub const NO_DEPOSIT: NearToken = NearToken::from_yoctonear(0);
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

// Native NFT constants
/// Maximum collection size (prevents storage DoS)
pub const MAX_COLLECTION_SUPPLY: u32 = 100_000;

/// Maximum metadata length (prevents storage DoS)
pub const MAX_METADATA_LEN: usize = 16_384; // 16KB

/// Maximum batch mint size per transaction
pub const MAX_BATCH_MINT: u32 = 10;

// Gas constants for cross-contract calls (in TGas)
// These are sensible defaults - NEAR runtime will handle insufficient gas gracefully
/// Default gas for callbacks (approval, transfer receiver, etc.)
pub const DEFAULT_CALLBACK_GAS: u64 = 50;

/// Default gas for NFT transfer with payout
pub const DEFAULT_NFT_TRANSFER_GAS: u64 = 50;

/// Default gas for resolve purchase with 10 payout recipients
pub const DEFAULT_RESOLVE_PURCHASE_GAS: u64 = 125;

/// Gas for resolve purchase with 20 payout recipients
pub const MAX_RESOLVE_PURCHASE_GAS: u64 = 200;

// --- Storage Keys ---
#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    // Marketplace storage
    Sales,
    ByOwnerId,
    ByOwnerIdInner { account_id_hash: Vec<u8> },
    ByNFTContractId,
    ByNFTContractIdInner { account_id_hash: Vec<u8> },
    StorageDeposits,
    
    // Native NFT storage
    NativeTokensPerOwner,
    NativeTokensPerOwnerInner { account_id_hash: Vec<u8> },
    NativeTokensById,
    NativeTokenMetadataById,
    NativeTokenApprovalsById,
    
    // Collection storage
    Collections,
    CollectionsByCreator,
    CollectionsByCreatorInner { account_id_hash: Vec<u8> },
}

// --- Data Structures ---

/// Type of sale listing
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
#[derive(near_sdk::NearSchema)]
pub enum SaleType {
    /// Pre-minted NFT from external contract
    External {
        nft_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
    },
    /// Lazy-minted collection from this contract
    LazyCollection {
        collection_id: String,
    },
}

/// Information about a sale
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
#[derive(near_sdk::NearSchema)]
pub struct Sale {
    /// Owner/seller of the NFT
    pub owner_id: AccountId,
    /// Sale price in yoctoNEAR
    pub sale_conditions: U128,
    /// Type of sale (external NFT or lazy collection)
    pub sale_type: SaleType,
    /// Optional expiration timestamp (nanoseconds since Unix epoch)
    /// If None, sale never expires. If Some(timestamp), sale expires at that time.
    pub expires_at: Option<u64>,
}

/// Native NFT token
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
#[derive(near_sdk::NearSchema)]
pub struct NativeToken {
    pub owner_id: AccountId,
    pub metadata: TokenMetadata,
    pub approved_account_ids: std::collections::HashMap<AccountId, u64>,
}

/// Token metadata (NEP-177)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
#[derive(near_sdk::NearSchema)]
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
    pub extra: Option<String>, // Flexible JSON for seats, times, attributes
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

/// Lazy collection configuration
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
#[derive(near_sdk::NearSchema)]
pub struct LazyCollection {
    /// Creator of the collection
    pub creator_id: AccountId,
    /// Unique collection identifier
    pub collection_id: String,
    /// Total supply of items
    pub total_supply: u32,
    /// Number already minted
    pub minted_count: u32,
    /// Base metadata template (JSON with placeholders)
    pub metadata_template: String,
    /// Price per item in yoctoNEAR
    pub price_near: U128,
    /// Optional: Start time (nanoseconds)
    pub start_time: Option<u64>,
    /// Optional: End time (nanoseconds)
    pub end_time: Option<u64>,
    /// Created at timestamp
    pub created_at: u64,
}

/// Payout structure from NFT contract
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Payout {
    pub payout: std::collections::HashMap<AccountId, U128>,
}

/// Contract state
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    // ===== MARKETPLACE STATE =====
    /// Contract owner
    pub owner_id: AccountId,
    
    /// Account that receives marketplace fees (default: owner_id)
    pub fee_recipient: AccountId,
    
    /// Map of sale ID -> Sale
    pub sales: IterableMap<String, Sale>,
    
    /// Map of owner -> Set of sale IDs
    pub by_owner_id: LookupMap<AccountId, IterableSet<String>>,
    
    /// Map of NFT contract -> Set of sale IDs
    pub by_nft_contract_id: LookupMap<AccountId, IterableSet<String>>,
    
    /// Map of account -> storage deposit balance
    pub storage_deposits: LookupMap<AccountId, u128>,
    
    // ===== NATIVE NFT STATE =====
    /// Map of owner -> Set of native token IDs
    pub native_tokens_per_owner: LookupMap<AccountId, IterableSet<String>>,
    
    /// Map of token ID -> Token data (IterableMap for enumeration support)
    pub native_tokens_by_id: IterableMap<String, NativeToken>,
    
    /// Counter for approval IDs
    pub next_approval_id: u64,
    
    // ===== COLLECTION STATE =====
    /// Map of collection ID -> Collection data (IterableMap for view queries)
    pub collections: IterableMap<String, LazyCollection>,
    
    /// Map of creator -> Set of collection IDs
    pub collections_by_creator: LookupMap<AccountId, IterableSet<String>>,
}

// --- Contract Implementation ---
#[near]
impl Contract {
    /// Initialize the contract
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            // Marketplace state
            fee_recipient: owner_id.clone(),
            owner_id,
            sales: IterableMap::new(StorageKey::Sales),
            by_owner_id: LookupMap::new(StorageKey::ByOwnerId),
            by_nft_contract_id: LookupMap::new(StorageKey::ByNFTContractId),
            storage_deposits: LookupMap::new(StorageKey::StorageDeposits),
            
            // Native NFT state
            native_tokens_per_owner: LookupMap::new(StorageKey::NativeTokensPerOwner),
            native_tokens_by_id: IterableMap::new(StorageKey::NativeTokensById),
            next_approval_id: 0,
            
            // Collection state
            collections: IterableMap::new(StorageKey::Collections),
            collections_by_creator: LookupMap::new(StorageKey::CollectionsByCreator),
        }
    }
    
    // --- Admin Functions ---
    
    /// Update the fee recipient account (only owner)
    pub fn set_fee_recipient(&mut self, fee_recipient: AccountId) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "Only contract owner can set fee recipient"
        );
        self.fee_recipient = fee_recipient;
        env::log_str(&format!("Fee recipient updated to: {}", self.fee_recipient));
    }
    
    // --- View Functions ---
    
    /// Get the current marketplace fee in basis points
    pub fn get_marketplace_fee_bps(&self) -> u16 {
        MARKETPLACE_FEE_BPS
    }
    
    /// Get the fee recipient account
    pub fn get_fee_recipient(&self) -> AccountId {
        self.fee_recipient.clone()
    }
    
    /// Calculate marketplace fee for a given price
    pub fn calculate_marketplace_fee(&self, price: U128) -> U128 {
        let fee = (price.0 * MARKETPLACE_FEE_BPS as u128) / BASIS_POINTS as u128;
        U128(fee)
    }
}

// --- Helper Functions ---
impl Contract {
    /// Generate unique sale ID from contract and token
    pub(crate) fn make_sale_id(nft_contract_id: &AccountId, token_id: &str) -> String {
        format!("{}{}{}", nft_contract_id, DELIMETER, token_id)
    }
    
    /// Get internal storage balance for an account
    pub(crate) fn internal_storage_balance_of(&self, account_id: &AccountId) -> u128 {
        self.storage_deposits.get(account_id).copied().unwrap_or(0)
    }
}
