//! Decoder for social-spend contract event logs.

use crate::pb::social_spend::v1::*;
use serde_json::Value;

pub fn decode_social_spend_event(
    json_data: &str,
    receipt_id: &str,
    block_height: u64,
    block_timestamp: u64,
    log_index: usize,
) -> Option<SocialSpendEvent> {
    let parsed: Value = serde_json::from_str(json_data).ok()?;

    let standard = parsed.get("standard")?.as_str()?;
    if standard != "onsocial" {
        return None;
    }

    let event_type = parsed.get("event")?.as_str()?;
    let data_arr = parsed.get("data")?.as_array()?;
    let data = data_arr.first()?;
    let account_id = str_field(data, "account_id");
    let id = format!("{}-{}-{}", receipt_id, log_index, event_type);

    Some(SocialSpendEvent {
        id,
        block_height,
        block_timestamp,
        receipt_id: receipt_id.to_string(),
        account_id,
        event_type: event_type.to_string(),
        success: event_type != "SOCIAL_TRANSFER_FAILED",

        spender_id: str_field(data, "spender_id"),
        amount: str_field(data, "amount"),
        app_id: str_field(data, "app_id"),
        action: str_field(data, "action"),
        target_type: str_field(data, "target_type"),
        target_id: str_field(data, "target_id"),
        season_id: str_field(data, "season_id"),
        tag: str_field(data, "tag"),
        recipient_id: str_field(data, "recipient_id"),
        treasury_amount: str_field(data, "treasury_amount"),
        season_amount: str_field(data, "season_amount"),
        target_amount: str_field(data, "target_amount"),
        metadata: json_field(data, "metadata"),

        label: str_field(data, "label"),
        active: bool_field(data, "active"),
        starts_at_ns: u64_field(data, "starts_at_ns"),
        ends_at_ns: u64_field(data, "ends_at_ns"),
        claim_starts_at_ns: u64_field(data, "claim_starts_at_ns"),
        root: str_field(data, "root"),
        total_amount: str_field(data, "total_amount"),

        paused: bool_field(data, "paused"),
        old_treasury_id: str_field(data, "old_treasury_id"),
        treasury_id: str_field(data, "treasury_id"),
        settlement_publisher: str_field(data, "settlement_publisher"),
        owner_id: str_field(data, "owner_id"),
        old_version: str_field(data, "old_version"),
        new_version: str_field(data, "new_version"),

        extra_data: data.to_string(),
    })
}

fn str_field(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|value| match value {
            Value::String(s) => Some(s.clone()),
            Value::Number(n) => Some(n.to_string()),
            Value::Bool(b) => Some(b.to_string()),
            Value::Null => None,
            _ => Some(value.to_string()),
        })
        .unwrap_or_default()
}

fn json_field(data: &Value, key: &str) -> String {
    data.get(key).map(Value::to_string).unwrap_or_default()
}

fn bool_field(data: &Value, key: &str) -> bool {
    data.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn u64_field(data: &Value, key: &str) -> u64 {
    data.get(key)
        .and_then(|value| match value {
            Value::Number(n) => n.as_u64(),
            Value::String(s) => s.parse::<u64>().ok(),
            _ => None,
        })
        .unwrap_or(0)
}
