use near_sdk::AccountId;

use super::builder::EventBuilder;
use super::OFFER;

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
    result: &crate::fees::PrimarySaleResult,
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
    result: &crate::fees::PrimarySaleResult,
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
