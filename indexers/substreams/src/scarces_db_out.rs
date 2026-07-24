//! Database changes writer for scarces events, active listings, and open offers.

use crate::pb::scarces::v1::*;
use serde_json::Value;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;

#[substreams::handlers::map]
pub fn scarces_db_out(output: ScarcesOutput) -> Result<DatabaseChanges, substreams::errors::Error> {
    Ok(scarces_db_out_impl(output))
}

pub(crate) fn scarces_db_out_impl(output: ScarcesOutput) -> DatabaseChanges {
    let mut tables = Tables::new();

    for event in &output.events {
        write_scarces_event(&mut tables, event);
        apply_active_listing(&mut tables, event);
        apply_active_offer(&mut tables, event);
    }

    tables.to_database_changes()
}

pub(crate) fn write_scarces_event(tables: &mut Tables, e: &ScarcesEvent) {
    let row = tables.create_row("scarces_events", &e.id);

    // Core fields
    row.set("block_height", e.block_height);
    row.set("block_timestamp", e.block_timestamp);
    row.set("receipt_id", &e.receipt_id);
    row.set("event_type", &e.event_type);
    row.set("operation", &e.operation);
    row.set("author", &e.author);

    // Identity / routing
    row.set("token_id", &e.token_id);
    row.set("collection_id", &e.collection_id);
    row.set("listing_id", &e.listing_id);
    row.set("owner_id", &e.owner_id);
    row.set("creator_id", &e.creator_id);
    row.set("buyer_id", &e.buyer_id);
    row.set("seller_id", &e.seller_id);
    row.set("bidder", &e.bidder);
    row.set("winner_id", &e.winner_id);
    row.set("sender_id", &e.sender_id);
    row.set("receiver_id", &e.receiver_id);
    row.set("account_id", &e.account_id);
    row.set("contract_id", &e.contract_id);

    // NFT contract reference
    row.set("scarce_contract_id", &e.scarce_contract_id);

    // Financial
    row.set("amount", &e.amount);
    row.set("price", &e.price);
    row.set("old_price", &e.old_price);
    row.set("new_price", &e.new_price);
    row.set("bid_amount", &e.bid_amount);
    row.set("attempted_price", &e.attempted_price);
    row.set("marketplace_fee", &e.marketplace_fee);
    row.set("app_pool_amount", &e.app_pool_amount);
    row.set("app_commission", &e.app_commission);
    row.set("creator_payment", &e.creator_payment);
    row.set("revenue", &e.revenue);
    row.set("new_balance", &e.new_balance);
    row.set("initial_balance", &e.initial_balance);
    row.set("refunded_amount", &e.refunded_amount);
    row.set("refund_per_token", &e.refund_per_token);
    row.set("refund_pool", &e.refund_pool);

    // Quantity / count
    row.set("quantity", e.quantity);
    row.set("total_supply", e.total_supply);
    row.set("redeem_count", e.redeem_count);
    row.set("max_redeems", e.max_redeems);
    row.set("bid_count", e.bid_count);
    row.set("refundable_count", e.refundable_count);

    // Auction
    row.set("reserve_price", &e.reserve_price);
    row.set("buy_now_price", &e.buy_now_price);
    row.set("min_bid_increment", &e.min_bid_increment);
    row.set("winning_bid", &e.winning_bid);
    row.set("expires_at", e.expires_at);
    row.set("auction_duration_ns", e.auction_duration_ns);
    row.set("anti_snipe_extension_ns", e.anti_snipe_extension_ns);

    // App pool
    row.set("app_id", &e.app_id);
    row.set("funder", &e.funder);

    // Ownership / transfers
    row.set("old_owner", &e.old_owner);
    row.set("new_owner", &e.new_owner);
    row.set("old_recipient", &e.old_recipient);
    row.set("new_recipient", &e.new_recipient);

    // Misc
    row.set("reason", &e.reason);
    row.set("mode", &e.mode);
    row.set("memo", &e.memo);

    // Array fields (JSON strings)
    row.set("token_ids", &e.token_ids);
    row.set("prices", &e.prices);
    row.set("receivers", &e.receivers);
    row.set("accounts", &e.accounts);

    // Contract config
    row.set("old_version", &e.old_version);
    row.set("new_version", &e.new_version);
    row.set("total_fee_bps", e.total_fee_bps);
    row.set("app_pool_fee_bps", e.app_pool_fee_bps);
    row.set("platform_storage_fee_bps", e.platform_storage_fee_bps);

    // Timing
    row.set("start_time", e.start_time);
    row.set("end_time", e.end_time);
    row.set("new_expires_at", e.new_expires_at);
    row.set("old_expires_at", e.old_expires_at);

    // Approval
    row.set("approval_id", e.approval_id);

    // Storage
    row.set("deposit", &e.deposit);
    row.set("remaining_balance", &e.remaining_balance);
    row.set("cap", &e.cap);

    // Full JSON catch-all
    row.set("extra_data", &e.extra_data);
}

fn lazy_key(listing_id: &str) -> String {
    format!("lazy:{listing_id}")
}

fn native_key(token_id: &str) -> String {
    format!("native:{token_id}")
}

fn non_empty(s: &str) -> Option<&str> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn json_str(data: &Value, key: &str) -> Option<String> {
    data.get(key).and_then(|v| match v {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    })
}

fn json_u32(data: &Value, key: &str) -> Option<u32> {
    data.get(key).and_then(|v| match v {
        Value::Number(n) => n.as_u64().map(|n| n as u32),
        Value::String(s) => s.parse().ok(),
        _ => None,
    })
}

fn json_u64(data: &Value, key: &str) -> Option<u64> {
    data.get(key).and_then(|v| match v {
        Value::Number(n) => n.as_u64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    })
}

fn parse_extra_blob(data: &Value) -> Option<Value> {
    let raw = json_str(data, "extra")?;
    serde_json::from_str(&raw).ok()
}

fn source_post_path(data: &Value) -> Option<String> {
    let extra = parse_extra_blob(data)?;
    if let Some(path) = json_str(&extra, "postPath").or_else(|| json_str(&extra, "sourcePostPath"))
    {
        return Some(path);
    }
    let nested = extra.get("sourcePost")?;
    if let Some(path) = json_str(nested, "path") {
        return Some(path);
    }
    let author = json_str(nested, "author")?;
    let post_id = json_str(nested, "postId")?;
    Some(format!("{author}/post/{post_id}"))
}

fn card_bg(data: &Value) -> Option<String> {
    let extra = parse_extra_blob(data)?;
    let theme = extra.get("theme")?;
    json_str(theme, "bg")
}

fn seller_hint(e: &ScarcesEvent) -> &str {
    non_empty(&e.creator_id)
        .or_else(|| non_empty(&e.seller_id))
        .or_else(|| non_empty(&e.owner_id))
        .or_else(|| non_empty(&e.author))
        .unwrap_or("unknown")
}

/// Identity fields required by `scarces_active_listings` NOT NULL columns.
/// Partial update events (price/purchase/bid) must still set these so an
/// INSERT-on-miss cannot crash the combined sink when create was never
/// materialised (catalog table added mid-stream).
fn set_listing_identity(tables: &mut Tables, key: &str, kind: &str, e: &ScarcesEvent) {
    let row = tables.upsert_row("scarces_active_listings", key);
    row.set("listing_key", key);
    row.set("kind", kind);
    row.set("seller_id", seller_hint(e));
}

fn set_browse_meta(tables: &mut Tables, key: &str, data: &Value) {
    let row = tables.upsert_row("scarces_active_listings", key);
    if let Some(title) = json_str(data, "title") {
        row.set("title", title);
    }
    if let Some(media) = json_str(data, "media") {
        row.set("media", media);
    }
    if let Some(path) = source_post_path(data) {
        row.set("source_post_path", path);
    }
    if let Some(bg) = card_bg(data) {
        row.set("card_bg", bg);
    }
    if let Some(extra) = json_str(data, "extra") {
        row.set("extra_json", extra);
    }
}

fn set_updated(tables: &mut Tables, key: &str, e: &ScarcesEvent) {
    let row = tables.upsert_row("scarces_active_listings", key);
    row.set("updated_block_height", e.block_height);
    row.set("updated_block_timestamp", e.block_timestamp);
}

pub(crate) fn apply_active_listing(tables: &mut Tables, e: &ScarcesEvent) {
    let event_type = e.event_type.as_str();
    let operation = e.operation.as_str();
    let data: Value = serde_json::from_str(&e.extra_data).unwrap_or(Value::Null);

    match (event_type, operation) {
        ("LAZY_LISTING_UPDATE", "created") => {
            let Some(listing_id) = non_empty(&e.listing_id) else {
                return;
            };
            let seller = non_empty(&e.creator_id)
                .or_else(|| non_empty(&e.author))
                .unwrap_or("");
            if seller.is_empty() {
                return;
            }
            let copies = json_u32(&data, "copies").unwrap_or(1);
            let key = lazy_key(listing_id);
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("listing_key", &key);
                row.set("kind", "lazy");
                row.set("listing_id", listing_id);
                row.set("seller_id", seller);
                row.set("creator_id", seller);
                if let Some(price) = non_empty(&e.price) {
                    row.set("price", price);
                }
                row.set("copies", copies);
                row.set("remaining", copies);
                row.set("minted_count", 0u32);
                if e.expires_at > 0 {
                    row.set("expires_at", e.expires_at);
                } else if let Some(exp) = json_u64(&data, "expires_at") {
                    row.set("expires_at", exp);
                }
                row.set("listed_block_height", e.block_height);
                row.set("listed_block_timestamp", e.block_timestamp);
            }
            set_browse_meta(tables, &key, &data);
            set_updated(tables, &key, e);
        }
        ("LAZY_LISTING_UPDATE", "price_updated") => {
            let Some(listing_id) = non_empty(&e.listing_id) else {
                return;
            };
            let key = lazy_key(listing_id);
            set_listing_identity(tables, &key, "lazy", e);
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("listing_id", listing_id);
                if let Some(price) = non_empty(&e.new_price).or_else(|| non_empty(&e.price)) {
                    row.set("price", price);
                }
            }
            set_updated(tables, &key, e);
        }
        ("LAZY_LISTING_UPDATE", "expiry_updated") => {
            let Some(listing_id) = non_empty(&e.listing_id) else {
                return;
            };
            let key = lazy_key(listing_id);
            set_listing_identity(tables, &key, "lazy", e);
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("listing_id", listing_id);
                if e.new_expires_at > 0 {
                    row.set("expires_at", e.new_expires_at);
                }
            }
            set_updated(tables, &key, e);
        }
        ("LAZY_LISTING_UPDATE", "purchased") => {
            let Some(listing_id) = non_empty(&e.listing_id) else {
                return;
            };
            let remaining = json_u32(&data, "remaining").unwrap_or(0);
            let key = lazy_key(listing_id);
            if remaining == 0 {
                tables.delete_row("scarces_active_listings", &key);
                return;
            }
            set_listing_identity(tables, &key, "lazy", e);
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("listing_id", listing_id);
                row.set("remaining", remaining);
                if let Some(minted) = json_u32(&data, "minted_count") {
                    row.set("minted_count", minted);
                }
            }
            set_updated(tables, &key, e);
        }
        ("LAZY_LISTING_UPDATE", "cancelled" | "expired") => {
            if let Some(listing_id) = non_empty(&e.listing_id) {
                tables.delete_row("scarces_active_listings", lazy_key(listing_id));
            }
        }
        ("SCARCE_UPDATE", "list_native") => {
            let Some(token_id) = non_empty(&e.token_id) else {
                return;
            };
            let seller = non_empty(&e.owner_id)
                .or_else(|| non_empty(&e.author))
                .unwrap_or("");
            if seller.is_empty() {
                return;
            }
            let key = native_key(token_id);
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("listing_key", &key);
                row.set("kind", "native");
                row.set("token_id", token_id);
                row.set("seller_id", seller);
                if let Some(price) = non_empty(&e.price) {
                    row.set("price", price);
                }
                if e.expires_at > 0 {
                    row.set("expires_at", e.expires_at);
                } else if let Some(exp) = json_u64(&data, "expires_at") {
                    row.set("expires_at", exp);
                }
                row.set("listed_block_height", e.block_height);
                row.set("listed_block_timestamp", e.block_timestamp);
            }
            set_browse_meta(tables, &key, &data);
            set_updated(tables, &key, e);
        }
        ("SCARCE_UPDATE", "auction_created") => {
            let Some(token_id) = non_empty(&e.token_id) else {
                return;
            };
            let seller = non_empty(&e.owner_id)
                .or_else(|| non_empty(&e.author))
                .unwrap_or("");
            if seller.is_empty() {
                return;
            }
            let key = native_key(token_id);
            let reserve = non_empty(&e.reserve_price).unwrap_or("");
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("listing_key", &key);
                row.set("kind", "auction");
                row.set("token_id", token_id);
                row.set("seller_id", seller);
                if !reserve.is_empty() {
                    row.set("reserve_price", reserve);
                    row.set("price", reserve);
                }
                if let Some(buy_now) = non_empty(&e.buy_now_price) {
                    row.set("buy_now_price", buy_now);
                }
                row.set("highest_bid", "0");
                row.set("bid_count", 0u32);
                if e.expires_at > 0 {
                    row.set("expires_at", e.expires_at);
                }
                row.set("listed_block_height", e.block_height);
                row.set("listed_block_timestamp", e.block_timestamp);
            }
            set_browse_meta(tables, &key, &data);
            set_updated(tables, &key, e);
        }
        ("SCARCE_UPDATE", "auction_bid") => {
            let Some(token_id) = non_empty(&e.token_id) else {
                return;
            };
            let key = native_key(token_id);
            set_listing_identity(tables, &key, "auction", e);
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("token_id", token_id);
                if let Some(bid) = non_empty(&e.bid_amount) {
                    row.set("highest_bid", bid);
                    row.set("price", bid);
                }
                if e.bid_count > 0 {
                    row.set("bid_count", e.bid_count);
                }
                if e.new_expires_at > 0 {
                    row.set("expires_at", e.new_expires_at);
                }
            }
            set_updated(tables, &key, e);
        }
        ("SCARCE_UPDATE", "update_price") => {
            let Some(token_id) = non_empty(&e.token_id) else {
                return;
            };
            let key = native_key(token_id);
            set_listing_identity(tables, &key, "native", e);
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("token_id", token_id);
                if let Some(price) = non_empty(&e.new_price) {
                    row.set("price", price);
                }
            }
            set_updated(tables, &key, e);
        }
        (
            "SCARCE_UPDATE",
            "delist_native"
            | "auto_delist"
            | "purchase"
            | "auction_settled"
            | "auction_cancelled",
        ) => {
            if let Some(token_id) = non_empty(&e.token_id) {
                tables.delete_row("scarces_active_listings", native_key(token_id));
            }
        }
        _ => {}
    }
}

fn token_offer_key(token_id: &str, buyer_id: &str) -> String {
    format!("token:{token_id}:{buyer_id}")
}

fn collection_offer_key(collection_id: &str, buyer_id: &str) -> String {
    format!("collection:{collection_id}:{buyer_id}")
}

fn set_offer_updated(tables: &mut Tables, key: &str, e: &ScarcesEvent) {
    let row = tables.upsert_row("scarces_active_offers", key);
    row.set("updated_block_height", e.block_height);
    row.set("updated_block_timestamp", e.block_timestamp);
}

fn upsert_open_offer(
    tables: &mut Tables,
    key: &str,
    kind: &str,
    e: &ScarcesEvent,
    token_id: Option<&str>,
    collection_id: Option<&str>,
    buyer_id: &str,
    amount: &str,
) {
    {
        let row = tables.upsert_row("scarces_active_offers", key);
        row.set("offer_key", key);
        row.set("kind", kind);
        row.set("buyer_id", buyer_id);
        row.set("amount", amount);
        if let Some(token_id) = token_id {
            row.set("token_id", token_id);
        }
        if let Some(collection_id) = collection_id {
            row.set("collection_id", collection_id);
        }
        if e.expires_at > 0 {
            row.set("expires_at", e.expires_at);
        }
        row.set("created_block_height", e.block_height);
        row.set("created_block_timestamp", e.block_timestamp);
    }
    set_offer_updated(tables, key, e);
}

pub(crate) fn apply_active_offer(tables: &mut Tables, e: &ScarcesEvent) {
    if e.event_type != "OFFER_UPDATE" {
        return;
    }

    let buyer = non_empty(&e.buyer_id)
        .or_else(|| non_empty(&e.author))
        .unwrap_or("");
    if buyer.is_empty() {
        return;
    }

    match e.operation.as_str() {
        "offer_made" => {
            let Some(token_id) = non_empty(&e.token_id) else {
                return;
            };
            let amount = non_empty(&e.amount)
                .or_else(|| non_empty(&e.price))
                .unwrap_or("");
            if amount.is_empty() {
                return;
            }
            let key = token_offer_key(token_id, buyer);
            upsert_open_offer(
                tables,
                &key,
                "token",
                e,
                Some(token_id),
                None,
                buyer,
                amount,
            );
        }
        "offer_cancelled" | "offer_accepted" => {
            let Some(token_id) = non_empty(&e.token_id) else {
                return;
            };
            tables.delete_row("scarces_active_offers", token_offer_key(token_id, buyer));
        }
        "collection_offer_made" => {
            let Some(collection_id) = non_empty(&e.collection_id) else {
                return;
            };
            let amount = non_empty(&e.amount)
                .or_else(|| non_empty(&e.price))
                .unwrap_or("");
            if amount.is_empty() {
                return;
            }
            let key = collection_offer_key(collection_id, buyer);
            upsert_open_offer(
                tables,
                &key,
                "collection",
                e,
                None,
                Some(collection_id),
                buyer,
                amount,
            );
        }
        "collection_offer_cancelled" | "collection_offer_accepted" => {
            let Some(collection_id) = non_empty(&e.collection_id) else {
                return;
            };
            tables.delete_row(
                "scarces_active_offers",
                collection_offer_key(collection_id, buyer),
            );
        }
        _ => {}
    }
}
