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
        apply_app_pool(&mut tables, event);
        apply_collections_current(&mut tables, event);
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

fn json_bool(data: &Value, key: &str) -> Option<bool> {
    data.get(key).and_then(|v| match v {
        Value::Bool(b) => Some(*b),
        Value::String(s) => match s.as_str() {
            "true" | "1" => Some(true),
            "false" | "0" => Some(false),
            _ => None,
        },
        _ => None,
    })
}

fn parse_extra_blob(data: &Value) -> Option<Value> {
    match data.get("extra")? {
        Value::String(raw) => serde_json::from_str(raw).ok(),
        Value::Object(_) => Some(data.get("extra")?.clone()),
        _ => None,
    }
}

fn extra_json_blob(data: &Value) -> Option<String> {
    match data.get("extra")? {
        Value::String(raw) => Some(raw.clone()),
        obj if obj.is_object() => serde_json::to_string(obj).ok(),
        _ => None,
    }
}

fn extra_has_source_post(extra: &Value) -> bool {
    extra.get("sourcePost").is_some()
        || json_str(extra, "postPath").is_some()
        || json_str(extra, "sourcePostPath").is_some()
}

fn extra_playable_mime_prefix(extra: &Value, prefix: &str) -> bool {
    let Some(Value::Array(items)) = extra.get("playable") else {
        return false;
    };
    items.iter().any(|item| {
        json_str(item, "mime")
            .map(|mime| mime.to_ascii_lowercase().starts_with(prefix))
            .unwrap_or(false)
    })
}

/// Mint stamp (`extra.kind`), else infer from a source post like from-post mint.
fn infer_listing_medium_kind(extra: &Value) -> Option<String> {
    if let Some(kind) = medium_kind_from_extra(extra) {
        return Some(kind);
    }
    if !extra_has_source_post(extra) {
        return None;
    }
    if extra_playable_mime_prefix(extra, "video/") {
        return Some("video".into());
    }
    if extra_playable_mime_prefix(extra, "audio/") {
        return Some("audio".into());
    }
    if extra.get("mediaCid").and_then(|v| v.as_str()).is_some()
        || extra
            .get("mediaCids")
            .and_then(|v| v.as_array())
            .is_some_and(|items| !items.is_empty())
    {
        return Some("art".into());
    }
    Some("thought".into())
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

/// Normalize NEP-177 `extra.kind` for Market discovery (`music` → `audio`).
fn medium_kind_from_extra(extra: &Value) -> Option<String> {
    let raw = json_str(extra, "kind")?;
    let key = raw.trim().to_ascii_lowercase();
    if key.is_empty() {
        return None;
    }
    if key == "music" {
        return Some("audio".into());
    }
    Some(key)
}

fn audio_format_from_extra(extra: &Value) -> Option<String> {
    let raw = json_str(extra, "audioFormat")?;
    let key = raw.trim().to_ascii_lowercase();
    if key.is_empty() {
        None
    } else {
        Some(key)
    }
}

/// Closed-vocab facet ids from `extra.facets` (lowercase, de-duped, ordered).
fn facets_from_extra(extra: &Value) -> Vec<String> {
    let Some(Value::Array(items)) = extra.get("facets") else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in items {
        let Some(raw) = item.as_str() else {
            continue;
        };
        let key = raw.trim().to_ascii_lowercase();
        if key.is_empty() || out.iter().any(|existing| existing == &key) {
            continue;
        }
        out.push(key);
    }
    out
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
    if let Some(extra) = extra_json_blob(data) {
        row.set("extra_json", extra);
    }
    if let Some(extra) = parse_extra_blob(data) {
        if let Some(medium) = infer_listing_medium_kind(&extra) {
            row.set("medium_kind", medium);
        }
        if let Some(format) = audio_format_from_extra(&extra) {
            row.set("audio_format", format);
        }
        let facets = facets_from_extra(&extra);
        if !facets.is_empty() {
            row.set_psql_array("facets", facets);
        }
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
                if let Some(app_id) = non_empty(&e.app_id) {
                    row.set("app_id", app_id);
                }
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
            // Mint creator (not seller) — Market “by …” provenance.
            let mint_creator = non_empty(&e.creator_id);
            let key = native_key(token_id);
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("listing_key", &key);
                row.set("kind", "native");
                row.set("token_id", token_id);
                row.set("seller_id", seller);
                if let Some(creator) = mint_creator {
                    row.set("creator_id", creator);
                }
                if let Some(app_id) = non_empty(&e.app_id) {
                    row.set("app_id", app_id);
                }
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
            let mint_creator = non_empty(&e.creator_id);
            let key = native_key(token_id);
            let reserve = non_empty(&e.reserve_price).unwrap_or("");
            {
                let row = tables.upsert_row("scarces_active_listings", &key);
                row.set("listing_key", &key);
                row.set("kind", "auction");
                row.set("token_id", token_id);
                row.set("seller_id", seller);
                if let Some(creator) = mint_creator {
                    row.set("creator_id", creator);
                }
                if let Some(app_id) = non_empty(&e.app_id) {
                    row.set("app_id", app_id);
                }
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

const ROLE_MODERATOR: &str = "moderator";
const ROLE_APPROVED_CREATOR: &str = "approved_creator";

fn app_creator_key(app_id: &str, role: &str, account_id: &str) -> String {
    format!("{app_id}:{role}:{account_id}")
}

/// Profile columns shared by `register` and `config_update`.
fn set_app_profile(tables: &mut Tables, app_id: &str, e: &ScarcesEvent) {
    let row = tables.upsert_row("scarces_apps", app_id);
    row.set("primary_sale_bps", e.primary_sale_bps);
    row.set("curated", e.curated);
    if let Some(access) = non_empty(&e.creator_access) {
        row.set("creator_access", access);
    }
    if let Some(metadata) = non_empty(&e.metadata) {
        row.set("metadata", metadata);
    }
}

fn set_app_updated(tables: &mut Tables, app_id: &str, e: &ScarcesEvent) {
    let row = tables.upsert_row("scarces_apps", app_id);
    row.set("app_id", app_id);
    row.set("updated_block_height", e.block_height);
    row.set("updated_block_timestamp", e.block_timestamp);
}

fn upsert_app_creator(tables: &mut Tables, app_id: &str, role: &str, e: &ScarcesEvent) {
    let Some(account_id) = non_empty(&e.account_id) else {
        return;
    };
    let key = app_creator_key(app_id, role, account_id);
    let row = tables.upsert_row("scarces_app_creators", &key);
    row.set("id", &key);
    row.set("app_id", app_id);
    row.set("account_id", account_id);
    row.set("role", role);
    row.set("added_block_height", e.block_height);
    row.set("added_block_timestamp", e.block_timestamp);
}

fn delete_app_creator(tables: &mut Tables, app_id: &str, role: &str, e: &ScarcesEvent) {
    let Some(account_id) = non_empty(&e.account_id) else {
        return;
    };
    tables.delete_row(
        "scarces_app_creators",
        app_creator_key(app_id, role, account_id),
    );
}

fn set_collection_identity(tables: &mut Tables, collection_id: &str, e: &ScarcesEvent) {
    let row = tables.upsert_row("scarces_collections_current", collection_id);
    row.set("collection_id", collection_id);
    let creator = non_empty(&e.creator_id)
        .or_else(|| non_empty(&e.author))
        .unwrap_or("unknown");
    row.set("creator_id", creator);
}

fn set_collection_updated(tables: &mut Tables, collection_id: &str, e: &ScarcesEvent) {
    let row = tables.upsert_row("scarces_collections_current", collection_id);
    row.set("updated_block_height", e.block_height);
    row.set("updated_block_timestamp", e.block_timestamp);
}

/// Extra blob for a collection create/update event — top-level `extra` /
/// `extra_json`, else NEP-177 `metadata_template.extra` (string or object).
fn collection_extra_blob(data: &Value) -> Option<Value> {
    if let Some(extra) = parse_extra_blob(data) {
        return Some(extra);
    }
    if let Some(raw) = json_str(data, "extra_json") {
        if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
            return Some(parsed);
        }
    }
    let template_raw = json_str(data, "metadata_template")?;
    let template: Value = serde_json::from_str(&template_raw).ok()?;
    match template.get("extra") {
        Some(Value::String(s)) => serde_json::from_str(s).ok(),
        Some(obj) if obj.is_object() => Some(obj.clone()),
        _ => None,
    }
}

fn collection_source_post_path(data: &Value) -> Option<String> {
    if let Some(path) = source_post_path(data) {
        return Some(path);
    }
    let extra = collection_extra_blob(data)?;
    if let Some(path) =
        json_str(&extra, "postPath").or_else(|| json_str(&extra, "sourcePostPath"))
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

fn set_collection_browse(tables: &mut Tables, collection_id: &str, data: &Value) {
    let row = tables.upsert_row("scarces_collections_current", collection_id);
    if let Some(title) = json_str(data, "title") {
        row.set("title", title);
    }
    if let Some(media) = json_str(data, "media") {
        row.set("media", media);
    }
    if let Some(description) = json_str(data, "description") {
        row.set("description", description);
    }
    if let Some(kind) = json_str(data, "kind") {
        row.set("kind", kind);
    }
    if let Some(template) = json_str(data, "metadata_template") {
        row.set("metadata_template", template);
    }
    if let Some(metadata) = json_str(data, "metadata") {
        row.set("metadata", metadata);
    }
    if let Some(royalty) = json_str(data, "royalty_json") {
        row.set("royalty_json", royalty);
    }
    // Prefer explicit extra_json; else store template.extra for facets/kind fallback.
    if let Some(extra) = json_str(data, "extra_json").or_else(|| json_str(data, "extra")) {
        row.set("extra_json", extra);
    }
    if let Some(path) = collection_source_post_path(data) {
        row.set("source_post_path", path);
    }
    // medium_kind: top-level kind, else extra.kind (music → audio).
    let medium = json_str(data, "kind")
        .and_then(|raw| {
            let key = raw.trim().to_ascii_lowercase();
            if key.is_empty() {
                None
            } else if key == "music" {
                Some("audio".into())
            } else {
                Some(key)
            }
        })
        .or_else(|| {
            collection_extra_blob(data).and_then(|extra| medium_kind_from_extra(&extra))
        });
    if let Some(medium) = medium {
        row.set("medium_kind", medium);
    }
}

/// Live drop catalog — first-paint shell for drop/player pages.
pub(crate) fn apply_collections_current(tables: &mut Tables, e: &ScarcesEvent) {
    if e.event_type != "COLLECTION_UPDATE" {
        return;
    }
    let Some(collection_id) = non_empty(&e.collection_id) else {
        return;
    };
    let data: Value = serde_json::from_str(&e.extra_data).unwrap_or(Value::Null);

    match e.operation.as_str() {
        "create" => {
            set_collection_identity(tables, collection_id, e);
            {
                let row = tables.upsert_row("scarces_collections_current", collection_id);
                let total_supply = if e.total_supply > 0 {
                    e.total_supply
                } else {
                    json_u32(&data, "total_supply").unwrap_or(0)
                };
                let minted = json_u32(&data, "minted_count").unwrap_or(0);
                let remaining = json_u32(&data, "remaining").unwrap_or(total_supply);
                let price = non_empty(&e.price)
                    .map(|s| s.to_string())
                    .or_else(|| json_str(&data, "price_near"))
                    .or_else(|| json_str(&data, "price"))
                    .unwrap_or_default();
                row.set("total_supply", total_supply);
                row.set("minted_count", minted);
                row.set("remaining", remaining);
                if !price.is_empty() {
                    row.set("price", price);
                }
                if let Some(alp) = json_str(&data, "allowlist_price") {
                    row.set("allowlist_price", alp);
                }
                let start = if e.start_time > 0 {
                    Some(e.start_time)
                } else {
                    json_u64(&data, "start_time")
                };
                if let Some(v) = start {
                    row.set("start_time", v);
                }
                let end = if e.end_time > 0 {
                    Some(e.end_time)
                } else {
                    json_u64(&data, "end_time")
                };
                if let Some(v) = end {
                    row.set("end_time", v);
                }
                if let Some(created_at) = json_u64(&data, "created_at") {
                    row.set("created_at", created_at);
                } else {
                    row.set("created_at", e.block_timestamp);
                }
                if let Some(mode) = json_str(&data, "mint_mode") {
                    row.set("mint_mode", mode);
                }
                if let Some(max) = json_u32(&data, "max_per_wallet") {
                    row.set("max_per_wallet", max);
                }
                if let Some(v) = json_bool(&data, "transferable") {
                    row.set("transferable", v);
                }
                if let Some(v) = json_bool(&data, "renewable") {
                    row.set("renewable", v);
                }
                if let Some(max) = json_u32(&data, "max_redeems") {
                    row.set("max_redeems", max);
                }
                if let Some(v) = json_bool(&data, "random_assignment") {
                    row.set("random_assignment", v);
                } else {
                    row.set("random_assignment", false);
                }
                row.set("paused", false);
                row.set("cancelled", false);
                row.set("banned", false);
                let app_owned = json_str(&data, "app_id");
                if let Some(app) = non_empty(&e.app_id).or(app_owned.as_deref()) {
                    row.set("app_id", app);
                }
                if let Some(v) = json_u32(&data, "app_commission_bps") {
                    row.set("app_commission_bps", v);
                }
                row.set("created_block_height", e.block_height);
                row.set("created_block_timestamp", e.block_timestamp);
            }
            set_collection_browse(tables, collection_id, &data);
            set_collection_updated(tables, collection_id, e);
        }
        "purchase" | "creator_mint" | "airdrop" => {
            set_collection_identity(tables, collection_id, e);
            {
                let row = tables.upsert_row("scarces_collections_current", collection_id);
                if let Some(minted) = json_u32(&data, "minted_count") {
                    row.set("minted_count", minted);
                }
                if let Some(remaining) = json_u32(&data, "remaining") {
                    row.set("remaining", remaining);
                }
            }
            set_collection_updated(tables, collection_id, e);
        }
        "price_update" => {
            set_collection_identity(tables, collection_id, e);
            {
                let row = tables.upsert_row("scarces_collections_current", collection_id);
                let price = non_empty(&e.new_price)
                    .map(|s| s.to_string())
                    .or_else(|| json_str(&data, "new_price"))
                    .unwrap_or_default();
                if !price.is_empty() {
                    row.set("price", price);
                }
            }
            set_collection_updated(tables, collection_id, e);
        }
        "timing_update" => {
            set_collection_identity(tables, collection_id, e);
            {
                let row = tables.upsert_row("scarces_collections_current", collection_id);
                let start = if e.start_time > 0 {
                    Some(e.start_time)
                } else {
                    json_u64(&data, "start_time")
                };
                if let Some(v) = start {
                    row.set("start_time", v);
                }
                let end = if e.end_time > 0 {
                    Some(e.end_time)
                } else {
                    json_u64(&data, "end_time")
                };
                if let Some(v) = end {
                    row.set("end_time", v);
                }
            }
            set_collection_updated(tables, collection_id, e);
        }
        "pause" => {
            set_collection_identity(tables, collection_id, e);
            {
                let row = tables.upsert_row("scarces_collections_current", collection_id);
                row.set("paused", true);
            }
            set_collection_updated(tables, collection_id, e);
        }
        "resume" => {
            set_collection_identity(tables, collection_id, e);
            {
                let row = tables.upsert_row("scarces_collections_current", collection_id);
                row.set("paused", false);
            }
            set_collection_updated(tables, collection_id, e);
        }
        "cancel" => {
            set_collection_identity(tables, collection_id, e);
            {
                let row = tables.upsert_row("scarces_collections_current", collection_id);
                row.set("cancelled", true);
            }
            set_collection_updated(tables, collection_id, e);
        }
        "ban" => {
            set_collection_identity(tables, collection_id, e);
            {
                let row = tables.upsert_row("scarces_collections_current", collection_id);
                row.set("banned", true);
            }
            set_collection_updated(tables, collection_id, e);
        }
        "unban" => {
            set_collection_identity(tables, collection_id, e);
            {
                let row = tables.upsert_row("scarces_collections_current", collection_id);
                row.set("banned", false);
            }
            set_collection_updated(tables, collection_id, e);
        }
        "metadata_update" => {
            set_collection_identity(tables, collection_id, e);
            set_collection_browse(tables, collection_id, &data);
            set_collection_updated(tables, collection_id, e);
        }
        "delete" => {
            tables.delete_row("scarces_collections_current", collection_id);
        }
        _ => {}
    }
}

/// Live app catalog + membership roster. `fund`/`withdraw` stay events-only —
/// the pool balance is not mirrored in `scarces_apps`.
pub(crate) fn apply_app_pool(tables: &mut Tables, e: &ScarcesEvent) {
    if e.event_type != "APP_POOL_UPDATE" {
        return;
    }

    let Some(app_id) = non_empty(&e.app_id) else {
        return;
    };

    match e.operation.as_str() {
        "register" => {
            set_app_updated(tables, app_id, e);
            set_app_profile(tables, app_id, e);
            let row = tables.upsert_row("scarces_apps", app_id);
            if let Some(owner) = non_empty(&e.owner_id).or_else(|| non_empty(&e.author)) {
                row.set("owner_id", owner);
            }
            row.set("created_block_height", e.block_height);
            row.set("created_block_timestamp", e.block_timestamp);
        }
        "config_update" => {
            set_app_updated(tables, app_id, e);
            set_app_profile(tables, app_id, e);
            if let Some(owner) = non_empty(&e.owner_id) {
                let row = tables.upsert_row("scarces_apps", app_id);
                row.set("owner_id", owner);
            }
        }
        "owner_transferred" => {
            set_app_updated(tables, app_id, e);
            if let Some(owner) = non_empty(&e.new_owner) {
                let row = tables.upsert_row("scarces_apps", app_id);
                row.set("owner_id", owner);
            }
        }
        "moderator_added" => upsert_app_creator(tables, app_id, ROLE_MODERATOR, e),
        "moderator_removed" => delete_app_creator(tables, app_id, ROLE_MODERATOR, e),
        "approved_creator_added" => upsert_app_creator(tables, app_id, ROLE_APPROVED_CREATOR, e),
        "approved_creator_removed" => delete_app_creator(tables, app_id, ROLE_APPROVED_CREATOR, e),
        _ => {}
    }
}
