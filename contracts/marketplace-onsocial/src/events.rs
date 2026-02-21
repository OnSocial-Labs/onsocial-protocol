//! Event infrastructure for marketplace-onsocial.
//!
//! Follows core-onsocial's EventBuilder pattern, simplified for marketplace
//! (no partition_id, no EventBatch, no path routing).
//!
//! Single `onsocial` 1.0.0 standard — NEP-297 compliant envelope.
//! A single Substreams decoder handles both core and marketplace events.
//!
//! Event categories:
//!   - `SCARCE_UPDATE`     – list, delist, transfer, burn, auction, approval
//!   - `COLLECTION_UPDATE` – create, mint, pause, cancel, refund
//!   - `STORAGE_UPDATE`    – deposit, withdraw
//!   - `APP_POOL_UPDATE`   – register, fund, withdraw, config
//!   - `CONTRACT_UPDATE`   – upgrade, owner transfer
//!   - `OFFER_UPDATE`      – make, cancel, accept (token & collection)

use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{self, Map, Value};
use near_sdk::{env, AccountId};
use near_sdk_macros::NearSchema;

// ── Constants ────────────────────────────────────────────────────────────────

const STANDARD: &str = "onsocial";
const VERSION: &str = "1.0.0";
const PREFIX: &str = "EVENT_JSON:";

const SCARCE: &str = "SCARCE_UPDATE";
const COLLECTION: &str = "COLLECTION_UPDATE";
const STORAGE: &str = "STORAGE_UPDATE";
const APP_POOL: &str = "APP_POOL_UPDATE";
const CONTRACT: &str = "CONTRACT_UPDATE";
const OFFER: &str = "OFFER_UPDATE";
const LAZY_LISTING: &str = "LAZY_LISTING_UPDATE";

// ── Types (NearSchema → ABI-visible) ────────────────────────────────────────

#[derive(NearSchema, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub(crate) struct Event {
    standard: String,
    version: String,
    event: String,
    data: Vec<EventData>,
}

#[derive(NearSchema, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub(crate) struct EventData {
    operation: String,
    author: String,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

// ── Value conversion ─────────────────────────────────────────────────────────

pub(crate) trait IntoEventValue {
    fn into_event_value(self) -> Value;
}

impl IntoEventValue for &str {
    fn into_event_value(self) -> Value {
        Value::String(self.to_string())
    }
}

impl IntoEventValue for String {
    fn into_event_value(self) -> Value {
        Value::String(self)
    }
}

impl IntoEventValue for &String {
    fn into_event_value(self) -> Value {
        Value::String(self.clone())
    }
}

impl IntoEventValue for &AccountId {
    fn into_event_value(self) -> Value {
        Value::String(self.to_string())
    }
}

impl IntoEventValue for u32 {
    fn into_event_value(self) -> Value {
        Value::Number(self.into())
    }
}

impl IntoEventValue for u64 {
    fn into_event_value(self) -> Value {
        Value::String(self.to_string())
    }
}

impl IntoEventValue for u128 {
    fn into_event_value(self) -> Value {
        Value::String(self.to_string())
    }
}

impl IntoEventValue for U128 {
    fn into_event_value(self) -> Value {
        Value::String(self.0.to_string())
    }
}

impl IntoEventValue for bool {
    fn into_event_value(self) -> Value {
        Value::Bool(self)
    }
}

impl IntoEventValue for Value {
    fn into_event_value(self) -> Value {
        self
    }
}

impl IntoEventValue for Vec<String> {
    fn into_event_value(self) -> Value {
        Value::Array(self.into_iter().map(Value::String).collect())
    }
}

impl IntoEventValue for &[String] {
    fn into_event_value(self) -> Value {
        Value::Array(self.iter().map(|s| Value::String(s.clone())).collect())
    }
}

impl IntoEventValue for &[AccountId] {
    fn into_event_value(self) -> Value {
        Value::Array(self.iter().map(|a| Value::String(a.to_string())).collect())
    }
}

// ── EventBuilder ─────────────────────────────────────────────────────────────

pub(crate) struct EventBuilder {
    event_type: &'static str,
    operation: &'static str,
    author: String,
    fields: Map<String, Value>,
}

impl EventBuilder {
    fn new(event_type: &'static str, operation: &'static str, author: &AccountId) -> Self {
        Self {
            event_type,
            operation,
            author: author.to_string(),
            fields: Map::new(),
        }
    }

    fn field(mut self, key: &str, value: impl IntoEventValue) -> Self {
        self.fields.insert(key.into(), value.into_event_value());
        self
    }

    fn field_opt(mut self, key: &str, value: Option<impl IntoEventValue>) -> Self {
        if let Some(v) = value {
            self.fields.insert(key.into(), v.into_event_value());
        }
        self
    }

    fn emit(self) {
        let event = Event {
            standard: STANDARD.into(),
            version: VERSION.into(),
            event: self.event_type.into(),
            data: vec![EventData {
                operation: self.operation.into(),
                author: self.author,
                extra: self.fields,
            }],
        };
        if let Ok(json) = serde_json::to_string(&event) {
            env::log_str(&format!("{PREFIX}{json}"));
        }
    }
}

// ── SCARCE_UPDATE — marketplace ──────────────────────────────────────────────

pub fn emit_scarce_list(
    owner_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_ids: Vec<String>,
    prices: Vec<U128>,
) {
    let prices_arr = Value::Array(
        prices
            .into_iter()
            .map(|p| Value::String(p.0.to_string()))
            .collect(),
    );
    EventBuilder::new(SCARCE, "list", owner_id)
        .field("owner_id", owner_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_ids", token_ids)
        .field("prices", prices_arr)
        .emit();
}

pub fn emit_scarce_delist(
    owner_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_ids: Vec<String>,
) {
    EventBuilder::new(SCARCE, "delist", owner_id)
        .field("owner_id", owner_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_ids", token_ids)
        .emit();
}

pub fn emit_scarce_update_price(
    owner_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_id: &str,
    old_price: U128,
    new_price: U128,
) {
    EventBuilder::new(SCARCE, "update_price", owner_id)
        .field("owner_id", owner_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_id", token_id)
        .field("old_price", old_price)
        .field("new_price", new_price)
        .emit();
}

pub fn emit_scarce_purchase(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_id: &str,
    price: U128,
    marketplace_fee: u128,
    app_pool_amount: u128,
) {
    EventBuilder::new(SCARCE, "purchase", buyer_id)
        .field("buyer_id", buyer_id)
        .field("seller_id", seller_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_id", token_id)
        .field("price", price)
        .field("marketplace_fee", marketplace_fee)
        .field("app_pool_amount", app_pool_amount)
        .emit();
}

pub fn emit_scarce_purchase_failed(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_id: &str,
    attempted_price: U128,
    reason: &str,
) {
    EventBuilder::new(SCARCE, "purchase_failed", buyer_id)
        .field("buyer_id", buyer_id)
        .field("seller_id", seller_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_id", token_id)
        .field("attempted_price", attempted_price)
        .field("reason", reason)
        .emit();
}

pub fn emit_scarce_transfer(
    sender_id: &AccountId,
    receiver_id: &AccountId,
    token_id: &str,
    memo: Option<&str>,
) {
    EventBuilder::new(SCARCE, "transfer", sender_id)
        .field("sender_id", sender_id)
        .field("receiver_id", receiver_id)
        .field("token_id", token_id)
        .field_opt("memo", memo)
        .emit();
}

pub fn emit_native_scarce_listed(owner_id: &AccountId, token_id: &str, price: U128) {
    EventBuilder::new(SCARCE, "list_native", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field("price", price)
        .emit();
}

pub fn emit_native_scarce_delisted(owner_id: &AccountId, token_id: &str) {
    EventBuilder::new(SCARCE, "delist_native", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .emit();
}

pub fn emit_auto_delisted(token_id: &str, owner_id: &AccountId, reason: &str) {
    EventBuilder::new(SCARCE, "auto_delist", owner_id)
        .field("token_id", token_id)
        .field("owner_id", owner_id)
        .field("reason", reason)
        .emit();
}

// ── SCARCE_UPDATE — lifecycle ────────────────────────────────────────────────

pub fn emit_token_renewed(
    actor_id: &AccountId,
    token_id: &str,
    collection_id: &str,
    owner_id: &AccountId,
    new_expires_at: u64,
) {
    EventBuilder::new(SCARCE, "renew", actor_id)
        .field("token_id", token_id)
        .field("collection_id", collection_id)
        .field("owner_id", owner_id)
        .field("new_expires_at", new_expires_at)
        .emit();
}

pub fn emit_token_revoked(
    actor_id: &AccountId,
    token_id: &str,
    collection_id: &str,
    owner_id: &AccountId,
    mode: &str,
    memo: Option<&str>,
) {
    EventBuilder::new(SCARCE, "revoke", actor_id)
        .field("token_id", token_id)
        .field("collection_id", collection_id)
        .field("owner_id", owner_id)
        .field("mode", mode)
        .field_opt("memo", memo)
        .emit();
}

pub fn emit_token_redeemed(
    actor_id: &AccountId,
    token_id: &str,
    collection_id: &str,
    owner_id: &AccountId,
    redeem_count: u32,
    max_redeems: u32,
) {
    EventBuilder::new(SCARCE, "redeem", actor_id)
        .field("token_id", token_id)
        .field("collection_id", collection_id)
        .field("owner_id", owner_id)
        .field("redeem_count", redeem_count)
        .field("max_redeems", max_redeems)
        .emit();
}

pub fn emit_scarce_burned(owner_id: &AccountId, token_id: &str, collection_id: &str) {
    EventBuilder::new(SCARCE, "burn", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field("collection_id", collection_id)
        .emit();
}

// ── SCARCE_UPDATE — approvals ────────────────────────────────────────────────

pub fn emit_approval_granted(
    owner_id: &AccountId,
    token_id: &str,
    account_id: &AccountId,
    approval_id: u64,
) {
    EventBuilder::new(SCARCE, "approval_granted", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field("account_id", account_id)
        .field("approval_id", approval_id)
        .emit();
}

pub fn emit_approval_revoked(owner_id: &AccountId, token_id: &str, account_id: &AccountId) {
    EventBuilder::new(SCARCE, "approval_revoked", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field("account_id", account_id)
        .emit();
}

pub fn emit_all_approvals_revoked(owner_id: &AccountId, token_id: &str) {
    EventBuilder::new(SCARCE, "all_approvals_revoked", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .emit();
}

// ── SCARCE_UPDATE — auctions ─────────────────────────────────────────────────

pub fn emit_auction_created(
    owner_id: &AccountId,
    token_id: &str,
    auction: &crate::types::AuctionState,
    expires_at: Option<u64>,
) {
    EventBuilder::new(SCARCE, "auction_created", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field("reserve_price", auction.reserve_price)
        .field_opt("buy_now_price", auction.buy_now_price)
        .field_opt("expires_at", expires_at)
        .field_opt("auction_duration_ns", auction.auction_duration_ns)
        .field("min_bid_increment", auction.min_bid_increment)
        .field("anti_snipe_extension_ns", auction.anti_snipe_extension_ns)
        .emit();
}

pub fn emit_auction_bid(bidder: &AccountId, token_id: &str, bid_amount: u128, bid_count: u32, new_expires_at: Option<u64>) {
    EventBuilder::new(SCARCE, "auction_bid", bidder)
        .field("bidder", bidder)
        .field("token_id", token_id)
        .field("bid_amount", bid_amount)
        .field("bid_count", bid_count)
        .field_opt("new_expires_at", new_expires_at)
        .emit();
}

pub fn emit_auction_settled(
    winner_id: &AccountId,
    seller_id: &AccountId,
    token_id: &str,
    winning_bid: u128,
    revenue: u128,
    app_pool_amount: u128,
) {
    EventBuilder::new(SCARCE, "auction_settled", winner_id)
        .field("winner_id", winner_id)
        .field("seller_id", seller_id)
        .field("token_id", token_id)
        .field("winning_bid", winning_bid)
        .field("revenue", revenue)
        .field("app_pool_amount", app_pool_amount)
        .emit();
}

pub fn emit_auction_cancelled(actor_id: &AccountId, token_id: &str, reason: &str) {
    EventBuilder::new(SCARCE, "auction_cancelled", actor_id)
        .field("token_id", token_id)
        .field("reason", reason)
        .emit();
}

// ── COLLECTION_UPDATE ────────────────────────────────────────────────────────

pub fn emit_collection_created(
    creator_id: &AccountId,
    collection_id: &str,
    total_supply: u32,
    price_near: U128,
) {
    EventBuilder::new(COLLECTION, "create", creator_id)
        .field("creator_id", creator_id)
        .field("collection_id", collection_id)
        .field("total_supply", total_supply)
        .field("price_near", price_near)
        .emit();
}

pub(crate) struct CollectionPurchase<'a> {
    pub buyer_id: &'a AccountId,
    pub creator_id: &'a AccountId,
    pub collection_id: &'a str,
    pub quantity: u32,
    pub total_price: U128,
    pub marketplace_fee: U128,
    pub app_pool_amount: U128,
    pub app_commission: U128,
    pub token_ids: &'a [String],
}

pub fn emit_collection_purchase(e: &CollectionPurchase) {
    EventBuilder::new(COLLECTION, "purchase", e.buyer_id)
        .field("buyer_id", e.buyer_id)
        .field("creator_id", e.creator_id)
        .field("collection_id", e.collection_id)
        .field("quantity", e.quantity)
        .field("total_price", e.total_price)
        .field("marketplace_fee", e.marketplace_fee)
        .field("app_pool_amount", e.app_pool_amount)
        .field("app_commission", e.app_commission)
        .field("token_ids", e.token_ids)
        .emit();
}

pub fn emit_collection_metadata_update(actor_id: &AccountId, collection_id: &str) {
    EventBuilder::new(COLLECTION, "metadata_update", actor_id)
        .field("actor_id", actor_id)
        .field("collection_id", collection_id)
        .emit();
}

pub fn emit_collection_app_metadata_update(
    actor_id: &AccountId,
    app_id: &AccountId,
    collection_id: &str,
) {
    EventBuilder::new(COLLECTION, "app_metadata_update", actor_id)
        .field("actor_id", actor_id)
        .field("app_id", app_id)
        .field("collection_id", collection_id)
        .emit();
}

pub fn emit_collection_mint(
    actor_id: &AccountId,
    receiver_id: &AccountId,
    collection_id: &str,
    quantity: u32,
    token_ids: &[String],
) {
    EventBuilder::new(COLLECTION, "creator_mint", actor_id)
        .field("receiver_id", receiver_id)
        .field("collection_id", collection_id)
        .field("quantity", quantity)
        .field("token_ids", token_ids)
        .emit();
}

pub fn emit_quick_mint(actor_id: &AccountId, token_id: &str) {
    EventBuilder::new(SCARCE, "quick_mint", actor_id)
        .field("token_id", token_id)
        .emit();
}

pub fn emit_collection_airdrop(
    actor_id: &AccountId,
    collection_id: &str,
    quantity: u32,
    token_ids: &[String],
    receivers: &[AccountId],
) {
    EventBuilder::new(COLLECTION, "airdrop", actor_id)
        .field("collection_id", collection_id)
        .field("quantity", quantity)
        .field("token_ids", token_ids)
        .field("receivers", receivers)
        .emit();
}

pub fn emit_collection_cancelled(
    actor_id: &AccountId,
    collection_id: &str,
    refund_per_token: u128,
    refund_pool: u128,
    refundable_count: u32,
) {
    EventBuilder::new(COLLECTION, "cancel", actor_id)
        .field("collection_id", collection_id)
        .field("refund_per_token", refund_per_token)
        .field("refund_pool", refund_pool)
        .field("refundable_count", refundable_count)
        .emit();
}

pub fn emit_refund_claimed(
    holder_id: &AccountId,
    token_id: &str,
    collection_id: &str,
    refund_amount: u128,
) {
    EventBuilder::new(COLLECTION, "refund_claimed", holder_id)
        .field("token_id", token_id)
        .field("collection_id", collection_id)
        .field("refund_amount", refund_amount)
        .emit();
}

pub fn emit_refund_pool_withdrawn(actor_id: &AccountId, collection_id: &str, amount: u128) {
    EventBuilder::new(COLLECTION, "refund_pool_withdrawn", actor_id)
        .field("collection_id", collection_id)
        .field("amount", amount)
        .emit();
}

pub fn emit_collection_deleted(actor_id: &AccountId, collection_id: &str, creator_id: &AccountId) {
    EventBuilder::new(COLLECTION, "delete", actor_id)
        .field("collection_id", collection_id)
        .field("creator_id", creator_id)
        .emit();
}

pub fn emit_collection_paused(actor_id: &AccountId, collection_id: &str) {
    EventBuilder::new(COLLECTION, "pause", actor_id)
        .field("collection_id", collection_id)
        .emit();
}

pub fn emit_collection_resumed(actor_id: &AccountId, collection_id: &str) {
    EventBuilder::new(COLLECTION, "resume", actor_id)
        .field("collection_id", collection_id)
        .emit();
}

pub fn emit_collection_banned(app_owner: &AccountId, collection_id: &str, reason: Option<&str>) {
    EventBuilder::new(COLLECTION, "ban", app_owner)
        .field("collection_id", collection_id)
        .field_opt("reason", reason)
        .emit();
}

pub fn emit_collection_unbanned(app_owner: &AccountId, collection_id: &str) {
    EventBuilder::new(COLLECTION, "unban", app_owner)
        .field("collection_id", collection_id)
        .emit();
}

pub fn emit_allowlist_updated(
    actor_id: &AccountId,
    collection_id: &str,
    accounts: &[AccountId],
    entries_count: u32,
) {
    EventBuilder::new(COLLECTION, "allowlist_update", actor_id)
        .field("collection_id", collection_id)
        .field("accounts", accounts)
        .field("entries_count", entries_count)
        .emit();
}

pub fn emit_allowlist_removed(
    actor_id: &AccountId,
    collection_id: &str,
    accounts: &[AccountId],
) {
    EventBuilder::new(COLLECTION, "allowlist_remove", actor_id)
        .field("collection_id", collection_id)
        .field("accounts", accounts)
        .emit();
}

pub fn emit_collection_price_updated(
    actor_id: &AccountId,
    collection_id: &str,
    old_price: U128,
    new_price: U128,
) {
    EventBuilder::new(COLLECTION, "price_update", actor_id)
        .field("collection_id", collection_id)
        .field("old_price", old_price)
        .field("new_price", new_price)
        .emit();
}

pub fn emit_collection_timing_updated(
    actor_id: &AccountId,
    collection_id: &str,
    start_time: Option<u64>,
    end_time: Option<u64>,
) {
    EventBuilder::new(COLLECTION, "timing_update", actor_id)
        .field("collection_id", collection_id)
        .field_opt("start_time", start_time)
        .field_opt("end_time", end_time)
        .emit();
}

// ── STORAGE_UPDATE ───────────────────────────────────────────────────────────

pub fn emit_storage_deposit(account_id: &AccountId, deposit: u128, new_balance: u128) {
    EventBuilder::new(STORAGE, "storage_deposit", account_id)
        .field("account_id", account_id)
        .field("deposit", deposit)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_storage_withdraw(account_id: &AccountId, amount: u128, new_balance: u128) {
    EventBuilder::new(STORAGE, "storage_withdraw", account_id)
        .field("account_id", account_id)
        .field("amount", amount)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_storage_refund(account_id: &AccountId, amount: u128) {
    EventBuilder::new(STORAGE, "refund_unused_deposit", account_id)
        .field("account_id", account_id)
        .field("amount", amount)
        .emit();
}

// ── APP_POOL_UPDATE ──────────────────────────────────────────────────────────

pub fn emit_app_pool_register(owner_id: &AccountId, app_id: &AccountId, initial_balance: u128) {
    EventBuilder::new(APP_POOL, "register", owner_id)
        .field("owner_id", owner_id)
        .field("app_id", app_id)
        .field("initial_balance", initial_balance)
        .emit();
}

pub fn emit_app_pool_fund(funder: &AccountId, app_id: &AccountId, amount: u128, new_balance: u128) {
    EventBuilder::new(APP_POOL, "fund", funder)
        .field("funder", funder)
        .field("app_id", app_id)
        .field("amount", amount)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_app_pool_withdraw(
    owner_id: &AccountId,
    app_id: &AccountId,
    amount: u128,
    new_balance: u128,
) {
    EventBuilder::new(APP_POOL, "withdraw", owner_id)
        .field("owner_id", owner_id)
        .field("app_id", app_id)
        .field("amount", amount)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_app_config_update(owner_id: &AccountId, app_id: &AccountId) {
    EventBuilder::new(APP_POOL, "config_update", owner_id)
        .field("owner_id", owner_id)
        .field("app_id", app_id)
        .emit();
}

pub fn emit_app_owner_transferred(
    old_owner: &AccountId,
    new_owner: &AccountId,
    app_id: &AccountId,
) {
    EventBuilder::new(APP_POOL, "owner_transferred", old_owner)
        .field("app_id", app_id)
        .field("old_owner", old_owner)
        .field("new_owner", new_owner)
        .emit();
}

pub fn emit_moderator_added(owner_id: &AccountId, app_id: &AccountId, account_id: &AccountId) {
    EventBuilder::new(APP_POOL, "moderator_added", owner_id)
        .field("app_id", app_id)
        .field("account_id", account_id)
        .emit();
}

pub fn emit_moderator_removed(owner_id: &AccountId, app_id: &AccountId, account_id: &AccountId) {
    EventBuilder::new(APP_POOL, "moderator_removed", owner_id)
        .field("app_id", app_id)
        .field("account_id", account_id)
        .emit();
}

// ── CONTRACT_UPDATE ──────────────────────────────────────────────────────────

pub fn emit_contract_upgraded(contract_id: &AccountId, old_version: &str, new_version: &str) {
    EventBuilder::new(CONTRACT, "contract_upgrade", contract_id)
        .field("old_version", old_version)
        .field("new_version", new_version)
        .emit();
}

pub fn emit_owner_transferred(old_owner: &AccountId, new_owner: &AccountId) {
    EventBuilder::new(CONTRACT, "owner_transferred", old_owner)
        .field("old_owner", old_owner)
        .field("new_owner", new_owner)
        .emit();
}

pub fn emit_fee_recipient_changed(owner_id: &AccountId, new_recipient: &AccountId) {
    EventBuilder::new(CONTRACT, "fee_recipient_changed", owner_id)
        .field("new_recipient", new_recipient)
        .emit();
}

pub fn emit_fee_config_updated(
    owner_id: &AccountId,
    total_fee_bps: u16,
    app_pool_fee_bps: u16,
    platform_storage_fee_bps: u16,
) {
    EventBuilder::new(CONTRACT, "fee_config_updated", owner_id)
        .field("total_fee_bps", total_fee_bps as u32)
        .field("app_pool_fee_bps", app_pool_fee_bps as u32)
        .field("platform_storage_fee_bps", platform_storage_fee_bps as u32)
        .emit();
}

pub fn emit_intents_executors_updated(owner_id: &AccountId, executors: &[AccountId]) {
    EventBuilder::new(CONTRACT, "intents_executors_updated", owner_id)
        .field("executors", executors)
        .emit();
}

pub fn emit_contract_metadata_updated(owner_id: &AccountId) {
    EventBuilder::new(CONTRACT, "contract_metadata_updated", owner_id).emit();
}

// ── OFFER_UPDATE ─────────────────────────────────────────────────────────────

pub fn emit_offer_made(
    buyer_id: &AccountId,
    token_id: &str,
    amount: u128,
    expires_at: Option<u64>,
) {
    EventBuilder::new(OFFER, "offer_made", buyer_id)
        .field("buyer_id", buyer_id)
        .field("token_id", token_id)
        .field("amount", amount)
        .field_opt("expires_at", expires_at)
        .emit();
}

pub fn emit_offer_cancelled(buyer_id: &AccountId, token_id: &str, amount: u128) {
    EventBuilder::new(OFFER, "offer_cancelled", buyer_id)
        .field("buyer_id", buyer_id)
        .field("token_id", token_id)
        .field("refunded_amount", amount)
        .emit();
}

pub fn emit_offer_accepted(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    token_id: &str,
    amount: u128,
    result: &crate::internal::PrimarySaleResult,
) {
    EventBuilder::new(OFFER, "offer_accepted", buyer_id)
        .field("buyer_id", buyer_id)
        .field("seller_id", seller_id)
        .field("token_id", token_id)
        .field("amount", amount)
        .field("marketplace_fee", result.revenue)
        .field("app_pool_amount", result.app_pool_amount)
        .emit();
}

pub fn emit_collection_offer_made(
    buyer_id: &AccountId,
    collection_id: &str,
    amount: u128,
    expires_at: Option<u64>,
) {
    EventBuilder::new(OFFER, "collection_offer_made", buyer_id)
        .field("buyer_id", buyer_id)
        .field("collection_id", collection_id)
        .field("amount", amount)
        .field_opt("expires_at", expires_at)
        .emit();
}

pub fn emit_collection_offer_cancelled(buyer_id: &AccountId, collection_id: &str, amount: u128) {
    EventBuilder::new(OFFER, "collection_offer_cancelled", buyer_id)
        .field("buyer_id", buyer_id)
        .field("collection_id", collection_id)
        .field("refunded_amount", amount)
        .emit();
}

pub fn emit_collection_offer_accepted(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    collection_id: &str,
    token_id: &str,
    amount: u128,
    result: &crate::internal::PrimarySaleResult,
) {
    EventBuilder::new(OFFER, "collection_offer_accepted", buyer_id)
        .field("buyer_id", buyer_id)
        .field("seller_id", seller_id)
        .field("collection_id", collection_id)
        .field("token_id", token_id)
        .field("amount", amount)
        .field("marketplace_fee", result.revenue)
        .field("app_pool_amount", result.app_pool_amount)
        .emit();
}

// ── Lazy Listing Events ──────────────────────────────────────────────────────

pub fn emit_lazy_listing_created(creator_id: &AccountId, listing_id: &str, price: u128) {
    EventBuilder::new(LAZY_LISTING, "created", creator_id)
        .field("creator_id", creator_id)
        .field("listing_id", listing_id)
        .field("price", price)
        .emit();
}

pub fn emit_lazy_listing_purchased(
    buyer_id: &AccountId,
    creator_id: &AccountId,
    listing_id: &str,
    token_id: &str,
    price: u128,
    result: &crate::internal::PrimarySaleResult,
) {
    EventBuilder::new(LAZY_LISTING, "purchased", buyer_id)
        .field("buyer_id", buyer_id)
        .field("creator_id", creator_id)
        .field("listing_id", listing_id)
        .field("token_id", token_id)
        .field("price", price)
        .field("creator_payment", result.creator_payment)
        .field("marketplace_fee", result.revenue)
        .field("app_pool_amount", result.app_pool_amount)
        .field("app_commission", result.app_commission)
        .emit();
}

pub fn emit_lazy_listing_cancelled(creator_id: &AccountId, listing_id: &str) {
    EventBuilder::new(LAZY_LISTING, "cancelled", creator_id)
        .field("listing_id", listing_id)
        .emit();
}

pub fn emit_lazy_listing_expired(creator_id: &AccountId, listing_id: &str) {
    EventBuilder::new(LAZY_LISTING, "expired", creator_id)
        .field("listing_id", listing_id)
        .emit();
}

pub fn emit_lazy_listing_expiry_updated(
    creator_id: &AccountId,
    listing_id: &str,
    old_expires_at: Option<u64>,
    new_expires_at: Option<u64>,
) {
    EventBuilder::new(LAZY_LISTING, "expiry_updated", creator_id)
        .field("listing_id", listing_id)
        .field_opt("old_expires_at", old_expires_at)
        .field_opt("new_expires_at", new_expires_at)
        .emit();
}

pub fn emit_lazy_listing_price_updated(
    creator_id: &AccountId,
    listing_id: &str,
    old_price: u128,
    new_price: u128,
) {
    EventBuilder::new(LAZY_LISTING, "price_updated", creator_id)
        .field("listing_id", listing_id)
        .field("old_price", old_price)
        .field("new_price", new_price)
        .emit();
}
