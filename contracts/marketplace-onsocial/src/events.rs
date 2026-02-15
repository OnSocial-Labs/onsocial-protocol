//! JSON-encoded events for Substreams/Subgraph indexing.
//!
//! Uses the same `EVENT_JSON:` prefix and envelope shape as core-onsocial
//! so a single Substreams decoder handles both contracts.

use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{self, Map, Value};
use near_sdk::{env, AccountId};
use std::cell::Cell;

// ── Constants ────────────────────────────────────────────────────────────────

const EVENT_STANDARD: &str = "onsocial";
const EVENT_VERSION: &str = "1.0.0";
const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

// Thread-local sequential log index within a transaction.
thread_local! {
    static LOG_INDEX: Cell<u32> = const { Cell::new(0) };
}

fn next_log_index() -> u32 {
    LOG_INDEX.with(|idx| {
        let current = idx.get();
        idx.set(current + 1);
        current
    })
}

// ── Envelope ─────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Event {
    standard: String,
    version: String,
    event: String,
    data: Vec<EventData>,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct EventData {
    operation: String,
    author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    evt_id: Option<String>,
    log_index: u32,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

// ── Internal helpers ─────────────────────────────────────────────────────────

fn emit_json_event(event_type: &str, operation: &str, author: &AccountId, extra: Map<String, Value>) {
    let log_index = next_log_index();
    let evt_id = format!(
        "{}-{}-{}-{}-{}",
        event_type,
        author,
        env::block_height(),
        env::block_timestamp(),
        log_index,
    );

    let event = Event {
        standard: EVENT_STANDARD.into(),
        version: EVENT_VERSION.into(),
        event: event_type.into(),
        data: vec![EventData {
            operation: operation.into(),
            author: author.to_string(),
            evt_id: Some(evt_id),
            log_index,
            extra,
        }],
    };

    if let Ok(json) = serde_json::to_string(&event) {
        env::log_str(&format!("{EVENT_JSON_PREFIX}{json}"));
    }
}

fn val(s: impl ToString) -> Value {
    Value::String(s.to_string())
}

fn val_u128(n: u128) -> Value {
    Value::String(n.to_string())
}

fn val_u32(n: u32) -> Value {
    Value::Number(n.into())
}

// ── Public emit functions ────────────────────────────────────────────────────

pub fn emit_scarce_list(
    owner_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_ids: Vec<String>,
    prices: Vec<U128>,
) {
    let mut m = Map::new();
    m.insert("owner_id".into(), val(owner_id));
    m.insert("scarce_contract_id".into(), val(scarce_contract_id));
    m.insert("token_ids".into(), Value::Array(token_ids.into_iter().map(val).collect()));
    m.insert("prices".into(), Value::Array(prices.into_iter().map(|p| val_u128(p.0)).collect()));
    emit_json_event("scarce_list", "list_scarce", owner_id, m);
}

pub fn emit_scarce_delist(
    owner_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_ids: Vec<String>,
) {
    let mut m = Map::new();
    m.insert("owner_id".into(), val(owner_id));
    m.insert("scarce_contract_id".into(), val(scarce_contract_id));
    m.insert("token_ids".into(), Value::Array(token_ids.into_iter().map(val).collect()));
    emit_json_event("scarce_delist", "delist_scarce", owner_id, m);
}

pub fn emit_scarce_update_price(
    owner_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_id: &str,
    old_price: U128,
    new_price: U128,
) {
    let mut m = Map::new();
    m.insert("owner_id".into(), val(owner_id));
    m.insert("scarce_contract_id".into(), val(scarce_contract_id));
    m.insert("token_id".into(), val(token_id));
    m.insert("old_price".into(), val_u128(old_price.0));
    m.insert("new_price".into(), val_u128(new_price.0));
    emit_json_event("scarce_update_price", "update_price", owner_id, m);
}

pub fn emit_scarce_purchase(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_id: &str,
    price: U128,
    marketplace_fee: u128,
    sponsor_amount: u128,
) {
    let mut m = Map::new();
    m.insert("buyer_id".into(), val(buyer_id));
    m.insert("seller_id".into(), val(seller_id));
    m.insert("scarce_contract_id".into(), val(scarce_contract_id));
    m.insert("token_id".into(), val(token_id));
    m.insert("price".into(), val_u128(price.0));
    m.insert("marketplace_fee".into(), val_u128(marketplace_fee));
    m.insert("sponsor_amount".into(), val_u128(sponsor_amount));
    emit_json_event("scarce_purchase", "buy_scarce", buyer_id, m);
}

pub fn emit_scarce_purchase_failed(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_id: &str,
    attempted_price: U128,
    reason: &str,
) {
    let mut m = Map::new();
    m.insert("buyer_id".into(), val(buyer_id));
    m.insert("seller_id".into(), val(seller_id));
    m.insert("scarce_contract_id".into(), val(scarce_contract_id));
    m.insert("token_id".into(), val(token_id));
    m.insert("attempted_price".into(), val_u128(attempted_price.0));
    m.insert("reason".into(), val(reason));
    emit_json_event("scarce_purchase_failed", "buy_scarce", buyer_id, m);
}

pub fn emit_storage_deposit(account_id: &AccountId, deposit: u128, new_balance: u128) {
    let mut m = Map::new();
    m.insert("account_id".into(), val(account_id));
    m.insert("deposit".into(), val_u128(deposit));
    m.insert("new_balance".into(), val_u128(new_balance));
    emit_json_event("storage_deposit", "storage_deposit", account_id, m);
}

pub fn emit_storage_withdraw(account_id: &AccountId, amount: u128, new_balance: u128) {
    let mut m = Map::new();
    m.insert("account_id".into(), val(account_id));
    m.insert("amount".into(), val_u128(amount));
    m.insert("new_balance".into(), val_u128(new_balance));
    emit_json_event("storage_withdraw", "storage_withdraw", account_id, m);
}

pub fn emit_collection_created(
    creator_id: &AccountId,
    collection_id: &str,
    total_supply: u32,
    price_near: U128,
) {
    let mut m = Map::new();
    m.insert("creator_id".into(), val(creator_id));
    m.insert("collection_id".into(), val(collection_id));
    m.insert("total_supply".into(), val_u32(total_supply));
    m.insert("price_near".into(), val_u128(price_near.0));
    emit_json_event("collection_created", "create_collection", creator_id, m);
}

pub fn emit_collection_purchase(
    buyer_id: &AccountId,
    creator_id: &AccountId,
    collection_id: &str,
    quantity: u32,
    total_price: U128,
    marketplace_fee: U128,
    sponsor_amount: U128,
) {
    let mut m = Map::new();
    m.insert("buyer_id".into(), val(buyer_id));
    m.insert("creator_id".into(), val(creator_id));
    m.insert("collection_id".into(), val(collection_id));
    m.insert("quantity".into(), val_u32(quantity));
    m.insert("total_price".into(), val_u128(total_price.0));
    m.insert("marketplace_fee".into(), val_u128(marketplace_fee.0));
    m.insert("sponsor_amount".into(), val_u128(sponsor_amount.0));
    emit_json_event("collection_purchase", "mint_scarce", buyer_id, m);
}

pub fn emit_scarce_transfer(
    sender_id: &AccountId,
    receiver_id: &AccountId,
    token_id: &str,
    memo: Option<&str>,
) {
    let mut m = Map::new();
    m.insert("sender_id".into(), val(sender_id));
    m.insert("receiver_id".into(), val(receiver_id));
    m.insert("token_id".into(), val(token_id));
    if let Some(memo) = memo {
        m.insert("memo".into(), val(memo));
    }
    emit_json_event("scarce_transfer", "transfer_scarce", sender_id, m);
}

pub fn emit_sponsor_deposit(
    beneficiary: &AccountId,
    amount: u128,
    fund_balance: u128,
) {
    let mut m = Map::new();
    m.insert("beneficiary".into(), val(beneficiary));
    m.insert("amount".into(), val_u128(amount));
    m.insert("fund_balance".into(), val_u128(fund_balance));
    emit_json_event("sponsor_deposit", "sponsor_deposit", beneficiary, m);
}
