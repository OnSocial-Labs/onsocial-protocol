//! Scarces event decoder
//!
//! Decodes NEP-297 events from scarces.onsocial contract logs.
//! Event types: SCARCE_UPDATE, COLLECTION_UPDATE, LAZY_LISTING_UPDATE,
//!              CONTRACT_UPDATE, OFFER_UPDATE, STORAGE_UPDATE, APP_POOL_UPDATE
//!
//! Uses a flat extraction approach: all known fields are pulled from the
//! JSON `data[0]` object into named proto fields, with the full JSON
//! preserved in `extra_data` so nothing is ever lost.

use crate::pb::scarces::v1::*;
use serde_json::Value;

/// Known onsocial-standard event types emitted by the scarces contract.
/// New event types still pass through (with operation + extra_data preserved).
pub fn decode_scarces_event(
    json_data: &str,
    receipt_id: &str,
    block_height: u64,
    block_timestamp: u64,
    log_index: usize,
) -> Option<ScarcesEvent> {
    let parsed: Value = serde_json::from_str(json_data).ok()?;

    let standard = parsed.get("standard")?.as_str()?;
    if standard != "onsocial" {
        return None;
    }

    let event_type = parsed.get("event")?.as_str()?;

    let data_arr = parsed.get("data")?.as_array()?;
    let data = data_arr.first()?;

    let operation = str_field(data, "operation");
    let author = str_field(data, "author");
    let id = format!("{}-{}-{}-{}", receipt_id, log_index, event_type, &operation);

    Some(ScarcesEvent {
        id,
        block_height,
        block_timestamp,
        receipt_id: receipt_id.to_string(),
        event_type: event_type.to_string(),
        operation,
        author,

        // Identity / routing
        token_id: str_field(data, "token_id"),
        collection_id: str_field(data, "collection_id"),
        listing_id: str_field(data, "listing_id"),
        owner_id: str_field(data, "owner_id"),
        creator_id: str_field(data, "creator_id"),
        buyer_id: str_field(data, "buyer_id"),
        seller_id: str_field(data, "seller_id"),
        bidder: str_field(data, "bidder"),
        winner_id: str_field(data, "winner_id"),
        sender_id: str_field(data, "sender_id"),
        receiver_id: str_field(data, "receiver_id"),
        account_id: str_field(data, "account_id"),
        executor: str_field(data, "executor"),
        contract_id: str_field(data, "contract_id"),

        // NFT contract reference
        scarce_contract_id: str_field(data, "scarce_contract_id"),

        // Financial
        amount: str_field(data, "amount"),
        price: str_field_any(data, &["price", "price_near", "total_price"]),
        old_price: str_field(data, "old_price"),
        new_price: str_field(data, "new_price"),
        bid_amount: str_field(data, "bid_amount"),
        attempted_price: str_field(data, "attempted_price"),
        marketplace_fee: str_field(data, "marketplace_fee"),
        app_pool_amount: str_field(data, "app_pool_amount"),
        app_commission: str_field(data, "app_commission"),
        creator_payment: str_field(data, "creator_payment"),
        revenue: str_field(data, "revenue"),
        new_balance: str_field(data, "new_balance"),
        initial_balance: str_field(data, "initial_balance"),
        refunded_amount: str_field_any(data, &["refunded_amount", "refund_amount"]),
        refund_per_token: str_field(data, "refund_per_token"),
        refund_pool: str_field(data, "refund_pool"),

        // Quantity / count
        quantity: u32_field(data, "quantity"),
        total_supply: u32_field(data, "total_supply"),
        redeem_count: u32_field(data, "redeem_count"),
        max_redeems: u32_field(data, "max_redeems"),
        bid_count: u32_field(data, "bid_count"),
        refundable_count: u32_field(data, "refundable_count"),

        // Auction
        reserve_price: str_field(data, "reserve_price"),
        buy_now_price: str_field(data, "buy_now_price"),
        min_bid_increment: str_field(data, "min_bid_increment"),
        winning_bid: str_field(data, "winning_bid"),
        expires_at: u64_field(data, "expires_at"),
        auction_duration_ns: u64_field(data, "auction_duration_ns"),
        anti_snipe_extension_ns: u64_field(data, "anti_snipe_extension_ns"),

        // App pool
        app_id: str_field(data, "app_id"),
        funder: str_field(data, "funder"),

        // Ownership / transfers
        old_owner: str_field_any(data, &["old_owner", "old_owner_id"]),
        new_owner: str_field(data, "new_owner"),
        old_recipient: str_field(data, "old_recipient"),
        new_recipient: str_field(data, "new_recipient"),

        // Misc
        reason: str_field(data, "reason"),
        mode: str_field(data, "mode"),
        memo: str_field(data, "memo"),

        // Array fields (serialized as JSON strings)
        token_ids: json_array_field(data, "token_ids"),
        prices: json_array_field(data, "prices"),
        receivers: json_array_field(data, "receivers"),
        accounts: json_array_field(data, "accounts"),

        // Contract config
        old_version: str_field(data, "old_version"),
        new_version: str_field(data, "new_version"),
        total_fee_bps: u32_field(data, "total_fee_bps"),
        app_pool_fee_bps: u32_field(data, "app_pool_fee_bps"),
        platform_storage_fee_bps: u32_field(data, "platform_storage_fee_bps"),

        // Timing
        start_time: u64_field(data, "start_time"),
        end_time: u64_field(data, "end_time"),
        new_expires_at: u64_field(data, "new_expires_at"),
        old_expires_at: u64_field(data, "old_expires_at"),

        // Approval
        approval_id: u64_field(data, "approval_id"),

        // Storage
        deposit: str_field(data, "deposit"),
        remaining_balance: str_field(data, "remaining_balance"),
        cap: str_field(data, "cap"),

        // Full JSON catch-all
        extra_data: data.to_string(),
    })
}

// =============================================================================
// Helper Functions
// =============================================================================

fn str_field(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| match v {
            Value::String(s) => Some(s.clone()),
            Value::Number(n) => Some(n.to_string()),
            Value::Bool(b) => Some(b.to_string()),
            Value::Null => None,
            _ => Some(v.to_string()),
        })
        .unwrap_or_default()
}

/// Try multiple keys in order, returning the first non-empty value.
/// Used to handle field name mismatches between contract versions.
fn str_field_any(data: &Value, keys: &[&str]) -> String {
    for key in keys {
        let val = str_field(data, key);
        if !val.is_empty() {
            return val;
        }
    }
    String::new()
}

fn u64_field(data: &Value, key: &str) -> u64 {
    data.get(key)
        .and_then(|v| match v {
            Value::Number(n) => n.as_u64(),
            Value::String(s) => s.parse().ok(),
            _ => None,
        })
        .unwrap_or(0)
}

fn u32_field(data: &Value, key: &str) -> u32 {
    data.get(key)
        .and_then(|v| match v {
            Value::Number(n) => n.as_u64().map(|n| n as u32),
            Value::String(s) => s.parse().ok(),
            _ => None,
        })
        .unwrap_or(0)
}

/// Serialize an array field as a JSON string for storage.
fn json_array_field(data: &Value, key: &str) -> String {
    match data.get(key) {
        Some(v @ Value::Array(_)) => v.to_string(),
        _ => String::new(),
    }
}
