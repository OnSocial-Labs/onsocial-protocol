//! JSON-encoded events for Substreams/Subgraph indexing.
//!
//! Matches core-onsocial envelope shape: `{ standard, version, event, data }`.
//! A single Substreams decoder handles both contracts.
//!
//! Event types follow core's `SCREAMING_CASE` categorical pattern:
//!   - `SCARCE_UPDATE`     – list, delist, update_price, purchase, purchase_failed, transfer
//!   - `COLLECTION_UPDATE` – create, mint
//!   - `STORAGE_UPDATE`    – storage_deposit, storage_withdraw
//!   - `SPONSOR_UPDATE`    – deposit

use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{self, Map, Value};
use near_sdk::{env, AccountId};

// ── Constants (same as core-onsocial) ────────────────────────────────────────

const EVENT_STANDARD: &str = "onsocial";
const EVENT_VERSION: &str = "1.0.0";
const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

// Event type categories (matches core's SCREAMING_CASE pattern)
const EVENT_TYPE_SCARCE_UPDATE: &str = "SCARCE_UPDATE";
const EVENT_TYPE_COLLECTION_UPDATE: &str = "COLLECTION_UPDATE";
const EVENT_TYPE_STORAGE_UPDATE: &str = "STORAGE_UPDATE";
const EVENT_TYPE_SPONSOR_UPDATE: &str = "SPONSOR_UPDATE";

// ── Envelope (matches core-onsocial shape) ───────────────────────────────────

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
    #[serde(flatten)]
    extra: Map<String, Value>,
}

// ── Internal helpers ─────────────────────────────────────────────────────────

fn emit_json_event(event_type: &str, operation: &str, author: &AccountId, extra: Map<String, Value>) {
    let event = Event {
        standard: EVENT_STANDARD.into(),
        version: EVENT_VERSION.into(),
        event: event_type.into(),
        data: vec![EventData {
            operation: operation.into(),
            author: author.to_string(),
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

// ── SCARCE_UPDATE ────────────────────────────────────────────────────────────

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
    emit_json_event(EVENT_TYPE_SCARCE_UPDATE, "list", owner_id, m);
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
    emit_json_event(EVENT_TYPE_SCARCE_UPDATE, "delist", owner_id, m);
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
    emit_json_event(EVENT_TYPE_SCARCE_UPDATE, "update_price", owner_id, m);
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
    emit_json_event(EVENT_TYPE_SCARCE_UPDATE, "purchase", buyer_id, m);
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
    emit_json_event(EVENT_TYPE_SCARCE_UPDATE, "purchase_failed", buyer_id, m);
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
    emit_json_event(EVENT_TYPE_SCARCE_UPDATE, "transfer", sender_id, m);
}

// ── COLLECTION_UPDATE ────────────────────────────────────────────────────────

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
    emit_json_event(EVENT_TYPE_COLLECTION_UPDATE, "create", creator_id, m);
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
    emit_json_event(EVENT_TYPE_COLLECTION_UPDATE, "mint", buyer_id, m);
}

// ── STORAGE_UPDATE ───────────────────────────────────────────────────────────

pub fn emit_storage_deposit(account_id: &AccountId, deposit: u128, new_balance: u128) {
    let mut m = Map::new();
    m.insert("account_id".into(), val(account_id));
    m.insert("deposit".into(), val_u128(deposit));
    m.insert("new_balance".into(), val_u128(new_balance));
    emit_json_event(EVENT_TYPE_STORAGE_UPDATE, "storage_deposit", account_id, m);
}

pub fn emit_storage_withdraw(account_id: &AccountId, amount: u128, new_balance: u128) {
    let mut m = Map::new();
    m.insert("account_id".into(), val(account_id));
    m.insert("amount".into(), val_u128(amount));
    m.insert("new_balance".into(), val_u128(new_balance));
    emit_json_event(EVENT_TYPE_STORAGE_UPDATE, "storage_withdraw", account_id, m);
}

// ── SPONSOR_UPDATE ───────────────────────────────────────────────────────────

pub fn emit_sponsor_deposit(
    beneficiary: &AccountId,
    amount: u128,
    fund_balance: u128,
) {
    let mut m = Map::new();
    m.insert("beneficiary".into(), val(beneficiary));
    m.insert("amount".into(), val_u128(amount));
    m.insert("fund_balance".into(), val_u128(fund_balance));
    emit_json_event(EVENT_TYPE_SPONSOR_UPDATE, "deposit", beneficiary, m);
}
