use near_sdk::AccountId;
use near_sdk::json_types::U128;

use super::LAZY_LISTING;
use super::builder::EventBuilder;
use super::nep171;

pub fn emit_lazy_listing_created(
    creator_id: &AccountId,
    listing_id: &str,
    price: u128,
    copies: u64,
    max_per_purchase: u32,
) {
    EventBuilder::new(LAZY_LISTING, "created", creator_id)
        .field("creator_id", creator_id)
        .field("listing_id", listing_id)
        .field("price", price)
        .field("copies", copies)
        .field("max_per_purchase", max_per_purchase)
        .emit();
}

/// Primary-sale purchase — one event per call (collections-aligned).
/// Fees/`creator_payment` are for the full `total_price`, not per token.
pub struct LazyListingPurchase<'a> {
    pub buyer_id: &'a AccountId,
    pub creator_id: &'a AccountId,
    pub listing_id: &'a str,
    pub quantity: u32,
    pub unit_price: U128,
    pub total_price: U128,
    pub marketplace_fee: U128,
    pub app_pool_amount: U128,
    pub app_commission: U128,
    pub creator_payment: U128,
    pub app_id: Option<&'a AccountId>,
    pub token_ids: &'a [String],
    pub minted_count: u32,
    pub remaining: u32,
}

pub fn emit_lazy_listing_purchased(e: &LazyListingPurchase) {
    nep171::emit_mint(e.buyer_id.as_str(), e.token_ids, None);
    let mut builder = EventBuilder::new(LAZY_LISTING, "purchased", e.buyer_id)
        .field("buyer_id", e.buyer_id)
        .field("creator_id", e.creator_id)
        .field("listing_id", e.listing_id)
        .field("quantity", e.quantity)
        .field("unit_price", e.unit_price)
        .field("total_price", e.total_price)
        // Back-compat: historical indexers read `price` as the sale amount.
        .field("price", e.total_price)
        .field("marketplace_fee", e.marketplace_fee)
        .field("app_pool_amount", e.app_pool_amount)
        .field("app_commission", e.app_commission)
        .field("creator_payment", e.creator_payment)
        .field_opt("app_id", e.app_id)
        .field("token_ids", e.token_ids)
        .field("minted_count", e.minted_count)
        .field("remaining", e.remaining);
    // Back-compat: single-edition buys still expose `token_id`.
    if let Some(token_id) = e.token_ids.first() {
        builder = builder.field("token_id", token_id);
    }
    builder.emit();
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
