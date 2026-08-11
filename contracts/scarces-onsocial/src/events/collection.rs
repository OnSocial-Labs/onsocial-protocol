use near_sdk::AccountId;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, Value};

use super::COLLECTION;
use super::builder::EventBuilder;
use super::nep171;
use crate::collections::MintMode;

/// Browse + shell fields for materialised drop catalog (indexer).
pub struct CollectionBrowseMeta<'a> {
    pub title: Option<&'a str>,
    pub media: Option<&'a str>,
    pub description: Option<&'a str>,
    pub kind: Option<&'a str>,
    pub metadata_template: Option<&'a str>,
    pub metadata: Option<&'a str>,
    pub royalty_json: Option<&'a str>,
}

pub struct CollectionCreated<'a> {
    pub creator_id: &'a AccountId,
    pub collection_id: &'a str,
    pub total_supply: u32,
    pub price_near: U128,
    pub allowlist_price: Option<U128>,
    pub start_time: Option<u64>,
    pub end_time: Option<u64>,
    pub created_at: u64,
    pub mint_mode: &'a str,
    pub max_per_wallet: Option<u32>,
    pub transferable: bool,
    pub renewable: bool,
    pub max_redeems: Option<u32>,
    pub random_assignment: bool,
    pub minted_count: u32,
    pub remaining: u32,
    pub app_id: Option<&'a str>,
    pub app_commission_bps: u16,
    pub browse: CollectionBrowseMeta<'a>,
}

pub fn mint_mode_label(mode: &MintMode) -> &'static str {
    match mode {
        MintMode::Open => "open",
        MintMode::PurchaseOnly => "purchase_only",
        MintMode::CreatorOnly => "creator_only",
    }
}

/// Best-effort `kind` from TokenMetadata.extra JSON.
pub fn kind_from_extra(extra: Option<&str>) -> Option<String> {
    let raw = extra?.trim();
    if raw.is_empty() {
        return None;
    }
    let value: Value = serde_json::from_str(raw).ok()?;
    value
        .get("kind")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn emit_collection_created(e: &CollectionCreated<'_>) {
    EventBuilder::new(COLLECTION, "create", e.creator_id)
        .field("creator_id", e.creator_id)
        .field("collection_id", e.collection_id)
        .field("total_supply", e.total_supply)
        .field("price_near", e.price_near)
        .field_opt("allowlist_price", e.allowlist_price)
        .field_opt("start_time", e.start_time)
        .field_opt("end_time", e.end_time)
        .field("created_at", e.created_at)
        .field("mint_mode", e.mint_mode)
        .field_opt("max_per_wallet", e.max_per_wallet)
        .field("transferable", e.transferable)
        .field("renewable", e.renewable)
        .field_opt("max_redeems", e.max_redeems)
        .field("random_assignment", e.random_assignment)
        .field("minted_count", e.minted_count)
        .field("remaining", e.remaining)
        .field_opt("app_id", e.app_id)
        .field("app_commission_bps", e.app_commission_bps as u32)
        .field_opt("title", e.browse.title)
        .field_opt("media", e.browse.media)
        .field_opt("description", e.browse.description)
        .field_opt("kind", e.browse.kind)
        .field_opt("metadata_template", e.browse.metadata_template)
        .field_opt("metadata", e.browse.metadata)
        .field_opt("royalty_json", e.browse.royalty_json)
        .emit();
}

pub struct CollectionPurchase<'a> {
    pub buyer_id: &'a AccountId,
    pub creator_id: &'a AccountId,
    pub collection_id: &'a str,
    pub quantity: u32,
    pub total_price: U128,
    pub marketplace_fee: U128,
    pub app_pool_amount: U128,
    pub app_commission: U128,
    pub app_id: Option<&'a str>,
    pub token_ids: &'a [String],
    pub minted_count: u32,
    pub remaining: u32,
}

pub fn emit_collection_purchase(e: &CollectionPurchase) {
    nep171::emit_mint(e.buyer_id.as_str(), e.token_ids, None);
    EventBuilder::new(COLLECTION, "purchase", e.buyer_id)
        .field("buyer_id", e.buyer_id)
        .field("creator_id", e.creator_id)
        .field("collection_id", e.collection_id)
        .field("quantity", e.quantity)
        .field("total_price", e.total_price)
        .field("marketplace_fee", e.marketplace_fee)
        .field("app_pool_amount", e.app_pool_amount)
        .field("app_commission", e.app_commission)
        .field_opt("app_id", e.app_id)
        .field("token_ids", e.token_ids)
        .field("minted_count", e.minted_count)
        .field("remaining", e.remaining)
        .emit();
}

pub fn emit_collection_metadata_update(
    actor_id: &AccountId,
    collection_id: &str,
    browse: CollectionBrowseMeta<'_>,
) {
    EventBuilder::new(COLLECTION, "metadata_update", actor_id)
        .field("actor_id", actor_id)
        .field("collection_id", collection_id)
        .field_opt("title", browse.title)
        .field_opt("media", browse.media)
        .field_opt("description", browse.description)
        .field_opt("kind", browse.kind)
        .field_opt("metadata_template", browse.metadata_template)
        .field_opt("metadata", browse.metadata)
        .field_opt("royalty_json", browse.royalty_json)
        .emit();
}

pub fn emit_collection_app_metadata_update(
    actor_id: &AccountId,
    app_id: &str,
    collection_id: &str,
    app_metadata: Option<&str>,
) {
    EventBuilder::new(COLLECTION, "app_metadata_update", actor_id)
        .field("actor_id", actor_id)
        .field("app_id", app_id)
        .field("collection_id", collection_id)
        .field_opt("app_metadata", app_metadata)
        .emit();
}

pub fn emit_collection_mint(
    actor_id: &AccountId,
    receiver_id: &AccountId,
    collection_id: &str,
    quantity: u32,
    token_ids: &[String],
    minted_count: u32,
    remaining: u32,
) {
    nep171::emit_mint(receiver_id.as_str(), token_ids, None);
    EventBuilder::new(COLLECTION, "creator_mint", actor_id)
        .field("actor_id", actor_id)
        .field("receiver_id", receiver_id)
        .field("collection_id", collection_id)
        .field("quantity", quantity)
        .field("token_ids", token_ids)
        .field("minted_count", minted_count)
        .field("remaining", remaining)
        .emit();
}

pub fn emit_collection_airdrop(
    actor_id: &AccountId,
    collection_id: &str,
    quantity: u32,
    token_ids: &[String],
    receivers: &[AccountId],
    minted_count: u32,
    remaining: u32,
) {
    // Emission invariant: NEP-171 `nft_mint` is owner-scoped; airdrops emit per recipient.
    for (token_id, receiver) in token_ids.iter().zip(receivers.iter()) {
        nep171::emit_mint(receiver.as_str(), &[token_id.clone()], None);
    }
    EventBuilder::new(COLLECTION, "airdrop", actor_id)
        .field("collection_id", collection_id)
        .field("quantity", quantity)
        .field("token_ids", token_ids)
        .field("receivers", receivers)
        .field("minted_count", minted_count)
        .field("remaining", remaining)
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

pub fn emit_allowlist_removed(actor_id: &AccountId, collection_id: &str, accounts: &[AccountId]) {
    EventBuilder::new(COLLECTION, "allowlist_remove", actor_id)
        .field("collection_id", collection_id)
        .field("accounts", accounts)
        .emit();
}

pub fn emit_redeemer_added(actor_id: &AccountId, collection_id: &str, account_id: &AccountId) {
    EventBuilder::new(COLLECTION, "redeemer_added", actor_id)
        .field("collection_id", collection_id)
        .field("account_id", account_id)
        .emit();
}

pub fn emit_redeemer_removed(actor_id: &AccountId, collection_id: &str, account_id: &AccountId) {
    EventBuilder::new(COLLECTION, "redeemer_removed", actor_id)
        .field("collection_id", collection_id)
        .field("account_id", account_id)
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
