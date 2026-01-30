// Borsh-encoded Events for Substreams Indexing
// Provides efficient event emission with binary serialization

use near_sdk::json_types::U128;
use near_sdk::{
    base64::Engine,
    borsh::{BorshDeserialize, BorshSerialize},
    env, AccountId,
};
use near_sdk_macros::NearSchema;
use std::cell::Cell;

// --- Constants ---

const EVENT_STANDARD: &str = "onsocial";
const EVENT_VERSION: &str = "1.0.0";
const EVENT_PREFIX: &str = "EVENT:";

// --- Thread-local log index for unique event IDs within a transaction ---
thread_local! {
    static LOG_INDEX: Cell<u32> = Cell::new(0);
}

/// Get the next log index for the current transaction
fn get_next_log_index() -> u32 {
    LOG_INDEX.with(|idx| {
        let current = idx.get();
        idx.set(current + 1);
        current
    })
}

// --- Event Data Structures ---

/// Marketplace event data variants for different operations
#[derive(
    NearSchema, serde::Serialize, serde::Deserialize, Clone, BorshSerialize, BorshDeserialize,
)]
#[abi(json, borsh)]
pub enum MarketplaceEventData {
    NftList {
        owner_id: String,
        nft_contract_id: String,
        token_ids: Vec<String>,
        prices: Vec<String>, // Store as strings for consistency
    },
    NftDelist {
        owner_id: String,
        nft_contract_id: String,
        token_ids: Vec<String>,
    },
    NftUpdatePrice {
        owner_id: String,
        nft_contract_id: String,
        token_id: String,
        old_price: String,
        new_price: String,
    },
    NftPurchase {
        buyer_id: String,
        seller_id: String,
        nft_contract_id: String,
        token_id: String,
        price: String,
        marketplace_fee: String,
    },
    NftPurchaseFailed {
        buyer_id: String,
        seller_id: String,
        nft_contract_id: String,
        token_id: String,
        attempted_price: String,
        reason: String,
    },
    StorageDeposit {
        account_id: String,
        deposit: String,
        new_balance: String,
    },
    StorageWithdraw {
        account_id: String,
        amount: String,
        new_balance: String,
    },
    CollectionCreated {
        creator_id: String,
        collection_id: String,
        total_supply: u32,
        price_near: String,
    },
    CollectionPurchase {
        buyer_id: String,
        creator_id: String,
        collection_id: String,
        quantity: u32,
        total_price: String,
        marketplace_fee: String,
    },
}

/// Main marketplace event structure
#[derive(
    NearSchema, serde::Serialize, serde::Deserialize, Clone, BorshSerialize, BorshDeserialize,
)]
#[abi(json, borsh)]
pub struct MarketplaceEvent {
    pub evt_standard: String,
    pub version: String,
    pub evt_type: String,
    pub evt_id: String,
    pub log_index: u32,
    pub block_height: u64,
    pub timestamp: u64,
    pub data: MarketplaceEventData,
}

// --- Helper Functions ---

/// Generate a unique event ID for Substreams tracking
/// Format: {event_type}-{account}-{block_height}-{timestamp}-{log_index}
fn generate_event_id(event_type: &str, account_id: &AccountId, log_index: u32) -> String {
    format!(
        "{}-{}-{}-{}-{}",
        event_type,
        account_id,
        env::block_height(),
        env::block_timestamp(),
        log_index
    )
}

/// Emit a Borsh-encoded NFT list event
pub fn emit_nft_list_event(
    owner_id: &AccountId,
    nft_contract_id: &AccountId,
    token_ids: Vec<String>,
    prices: Vec<U128>,
) {
    let log_index = get_next_log_index();
    let event = MarketplaceEvent {
        evt_standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        evt_type: "nft_list".to_string(),
        evt_id: generate_event_id("nft_list", owner_id, log_index),
        log_index,
        block_height: env::block_height(),
        timestamp: env::block_timestamp(),
        data: MarketplaceEventData::NftList {
            owner_id: owner_id.to_string(),
            nft_contract_id: nft_contract_id.to_string(),
            token_ids,
            prices: prices.into_iter().map(|p| p.0.to_string()).collect(),
        },
    };

    emit_borsh_event(event);
}

/// Emit a Borsh-encoded NFT delist event
pub fn emit_nft_delist_event(
    owner_id: &AccountId,
    nft_contract_id: &AccountId,
    token_ids: Vec<String>,
) {
    let log_index = get_next_log_index();
    let event = MarketplaceEvent {
        evt_standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        evt_type: "nft_delist".to_string(),
        evt_id: generate_event_id("nft_delist", owner_id, log_index),
        log_index,
        block_height: env::block_height(),
        timestamp: env::block_timestamp(),
        data: MarketplaceEventData::NftDelist {
            owner_id: owner_id.to_string(),
            nft_contract_id: nft_contract_id.to_string(),
            token_ids,
        },
    };

    emit_borsh_event(event);
}

/// Emit a Borsh-encoded NFT price update event
pub fn emit_nft_update_price_event(
    owner_id: &AccountId,
    nft_contract_id: &AccountId,
    token_id: &str,
    old_price: U128,
    new_price: U128,
) {
    let log_index = get_next_log_index();
    let event = MarketplaceEvent {
        evt_standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        evt_type: "nft_update_price".to_string(),
        evt_id: generate_event_id("nft_update_price", owner_id, log_index),
        log_index,
        block_height: env::block_height(),
        timestamp: env::block_timestamp(),
        data: MarketplaceEventData::NftUpdatePrice {
            owner_id: owner_id.to_string(),
            nft_contract_id: nft_contract_id.to_string(),
            token_id: token_id.to_string(),
            old_price: old_price.0.to_string(),
            new_price: new_price.0.to_string(),
        },
    };

    emit_borsh_event(event);
}

/// Emit a Borsh-encoded NFT purchase event
pub fn emit_nft_purchase_event(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    nft_contract_id: &AccountId,
    token_id: &str,
    price: U128,
    marketplace_fee: u128,
) {
    let log_index = get_next_log_index();
    let event = MarketplaceEvent {
        evt_standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        evt_type: "nft_purchase".to_string(),
        evt_id: generate_event_id("nft_purchase", buyer_id, log_index),
        log_index,
        block_height: env::block_height(),
        timestamp: env::block_timestamp(),
        data: MarketplaceEventData::NftPurchase {
            buyer_id: buyer_id.to_string(),
            seller_id: seller_id.to_string(),
            nft_contract_id: nft_contract_id.to_string(),
            token_id: token_id.to_string(),
            price: price.0.to_string(),
            marketplace_fee: marketplace_fee.to_string(),
        },
    };

    emit_borsh_event(event);
}

/// Emit a Borsh-encoded storage deposit event
pub fn emit_storage_deposit_event(account_id: &AccountId, deposit: u128, new_balance: u128) {
    let log_index = get_next_log_index();
    let event = MarketplaceEvent {
        evt_standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        evt_type: "storage_deposit".to_string(),
        evt_id: generate_event_id("storage_deposit", account_id, log_index),
        log_index,
        block_height: env::block_height(),
        timestamp: env::block_timestamp(),
        data: MarketplaceEventData::StorageDeposit {
            account_id: account_id.to_string(),
            deposit: deposit.to_string(),
            new_balance: new_balance.to_string(),
        },
    };

    emit_borsh_event(event);
}

/// Emit a Borsh-encoded storage withdraw event
pub fn emit_storage_withdraw_event(account_id: &AccountId, amount: u128, new_balance: u128) {
    let log_index = get_next_log_index();
    let event = MarketplaceEvent {
        evt_standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        evt_type: "storage_withdraw".to_string(),
        evt_id: generate_event_id("storage_withdraw", account_id, log_index),
        log_index,
        block_height: env::block_height(),
        timestamp: env::block_timestamp(),
        data: MarketplaceEventData::StorageWithdraw {
            account_id: account_id.to_string(),
            amount: amount.to_string(),
            new_balance: new_balance.to_string(),
        },
    };

    emit_borsh_event(event);
}

/// Emit a Borsh-encoded NFT purchase failed event
/// Useful for analytics and debugging purchase flow
pub fn emit_nft_purchase_failed_event(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    nft_contract_id: &AccountId,
    token_id: &str,
    attempted_price: U128,
    reason: &str,
) {
    let log_index = get_next_log_index();
    let event = MarketplaceEvent {
        evt_standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        evt_type: "nft_purchase_failed".to_string(),
        evt_id: generate_event_id("nft_purchase_failed", buyer_id, log_index),
        log_index,
        block_height: env::block_height(),
        timestamp: env::block_timestamp(),
        data: MarketplaceEventData::NftPurchaseFailed {
            buyer_id: buyer_id.to_string(),
            seller_id: seller_id.to_string(),
            nft_contract_id: nft_contract_id.to_string(),
            token_id: token_id.to_string(),
            attempted_price: attempted_price.0.to_string(),
            reason: reason.to_string(),
        },
    };

    emit_borsh_event(event);
}

/// Emit a Borsh-encoded collection created event
pub fn emit_collection_created_event(
    creator_id: &AccountId,
    collection_id: &str,
    total_supply: u32,
    price_near: U128,
) {
    let log_index = get_next_log_index();
    let event = MarketplaceEvent {
        evt_standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        evt_type: "collection_created".to_string(),
        evt_id: generate_event_id("collection_created", creator_id, log_index),
        log_index,
        block_height: env::block_height(),
        timestamp: env::block_timestamp(),
        data: MarketplaceEventData::CollectionCreated {
            creator_id: creator_id.to_string(),
            collection_id: collection_id.to_string(),
            total_supply,
            price_near: price_near.0.to_string(),
        },
    };

    emit_borsh_event(event);
}

/// Emit a Borsh-encoded collection purchase event
pub fn emit_collection_purchase_event(
    buyer_id: &AccountId,
    creator_id: &AccountId,
    collection_id: &str,
    quantity: u32,
    total_price: U128,
    marketplace_fee: U128,
) {
    let log_index = get_next_log_index();
    let event = MarketplaceEvent {
        evt_standard: EVENT_STANDARD.to_string(),
        version: EVENT_VERSION.to_string(),
        evt_type: "collection_purchase".to_string(),
        evt_id: generate_event_id("collection_purchase", buyer_id, log_index),
        log_index,
        block_height: env::block_height(),
        timestamp: env::block_timestamp(),
        data: MarketplaceEventData::CollectionPurchase {
            buyer_id: buyer_id.to_string(),
            creator_id: creator_id.to_string(),
            collection_id: collection_id.to_string(),
            quantity,
            total_price: total_price.0.to_string(),
            marketplace_fee: marketplace_fee.0.to_string(),
        },
    };

    emit_borsh_event(event);
}

/// Internal helper to emit Borsh-encoded events with base64 encoding
/// Matches core-onsocial contract pattern for consistency
fn emit_borsh_event(event: MarketplaceEvent) {
    // Serialize to Borsh format
    let mut buffer = Vec::new();
    event
        .serialize(&mut buffer)
        .expect("Failed to serialize event");

    // Calculate capacity for base64 encoding
    let encoded_len = buffer.len().div_ceil(3) * 4;
    let mut log_str = String::with_capacity(EVENT_PREFIX.len() + encoded_len);

    // Add prefix and base64-encode the Borsh data
    log_str.push_str(EVENT_PREFIX);
    near_sdk::base64::engine::general_purpose::STANDARD.encode_string(&buffer, &mut log_str);

    // Emit the log
    env::log_str(&log_str);
}
