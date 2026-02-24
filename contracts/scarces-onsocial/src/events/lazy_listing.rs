use near_sdk::AccountId;

use super::LAZY_LISTING;
use super::builder::EventBuilder;
use super::nep171;

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
    result: &crate::fees::PrimarySaleResult,
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
    nep171::emit_mint(buyer_id.as_str(), &[token_id.to_string()], None);
}

pub fn emit_lazy_listing_cancelled(creator_id: &AccountId, listing_id: &str) {
    EventBuilder::new(LAZY_LISTING, "cancelled", creator_id)
        .field("creator_id", creator_id)
        .field("listing_id", listing_id)
        .emit();
}

pub fn emit_lazy_listing_expired(creator_id: &AccountId, listing_id: &str) {
    EventBuilder::new(LAZY_LISTING, "expired", creator_id)
        .field("creator_id", creator_id)
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
