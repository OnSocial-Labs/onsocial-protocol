use near_sdk::AccountId;
use near_sdk::json_types::U128;

use super::COLLECTION;
use super::builder::EventBuilder;
use super::nep171;

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

pub struct CollectionPurchase<'a> {
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
    nep171::emit_mint(e.buyer_id.as_str(), e.token_ids, None);
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
        .field("actor_id", actor_id)
        .field("receiver_id", receiver_id)
        .field("collection_id", collection_id)
        .field("quantity", quantity)
        .field("token_ids", token_ids)
        .emit();
    nep171::emit_mint(receiver_id.as_str(), token_ids, None);
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
    // Emission invariant: NEP-171 `nft_mint` is owner-scoped; airdrops emit per recipient.
    for (token_id, receiver) in token_ids.iter().zip(receivers.iter()) {
        nep171::emit_mint(receiver.as_str(), &[token_id.clone()], None);
    }
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
