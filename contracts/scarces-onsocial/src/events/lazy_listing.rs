use near_sdk::AccountId;
use near_sdk::json_types::U128;

use super::LAZY_LISTING;
use super::builder::EventBuilder;
use super::nep171;

/// Optional browse fields for materialised Market catalog (indexer).
pub struct ListingBrowseMeta<'a> {
    pub title: Option<&'a str>,
    pub media: Option<&'a str>,
    pub extra: Option<&'a str>,
}

/// Primary-sale lazy listing. `browse` feeds the Market catalog.
pub struct LazyListingCreated<'a> {
    pub creator_id: &'a AccountId,
    pub listing_id: &'a str,
    pub price: u128,
    pub copies: u64,
    pub max_per_purchase: u32,
    pub expires_at: Option<u64>,
    pub browse: ListingBrowseMeta<'a>,
    pub app_id: Option<&'a str>,
    pub app_commission_bps: u16,
    /// Dollar sticker in millionths. Empty when the ask is NEAR.
    pub usd_e6: Option<u128>,
}

pub fn emit_lazy_listing_created(e: &LazyListingCreated) {
    EventBuilder::new(LAZY_LISTING, "created", e.creator_id)
        .field("creator_id", e.creator_id)
        .field("listing_id", e.listing_id)
        .field("price", e.price)
        .field("copies", e.copies)
        .field("max_per_purchase", e.max_per_purchase)
        .field_opt("title", e.browse.title)
        .field_opt("media", e.browse.media)
        .field_opt("extra", e.browse.extra)
        .field_opt("expires_at", e.expires_at)
        .field_opt("app_id", e.app_id)
        .field("app_commission_bps", e.app_commission_bps as u32)
        .field_opt("usd_e6", e.usd_e6)
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
    pub app_id: Option<&'a str>,
    pub token_ids: &'a [String],
    pub minted_count: u32,
    pub remaining: u32,
    /// Dollar sticker the mint settled against, when it had one.
    pub usd_e6: Option<u128>,
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
        .field("remaining", e.remaining)
        .field_opt("usd_e6", e.usd_e6);
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
    usd_e6: Option<u128>,
) {
    EventBuilder::new(LAZY_LISTING, "price_updated", creator_id)
        .field("listing_id", listing_id)
        .field("old_price", old_price)
        .field("new_price", new_price)
        .field_opt("usd_e6", usd_e6)
        .emit();
}
