//! NEP-141 token event decoder
//!
//! Decodes NEP-141 standard events from token.onsocial contract logs.
//! Events: ft_mint, ft_burn, ft_transfer
//!
//! Format: `EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{...}]}`

use crate::pb::token::v1::*;
use crate::pb::token::v1::token_event::Payload;
use serde_json::Value;

/// Decode a single NEP-141 event log into one or more TokenEvents.
///
/// NEP-141 data arrays can contain multiple entries per log line
/// (e.g. a batch transfer), so we return a Vec.
pub fn decode_token_events(
    json_data: &str,
    receipt_id: &str,
    block_height: u64,
    block_timestamp: u64,
    log_index: usize,
) -> Vec<TokenEvent> {
    let mut events = Vec::new();

    let parsed: Value = match serde_json::from_str(json_data) {
        Ok(v) => v,
        Err(_) => return events,
    };

    let standard = match parsed.get("standard").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return events,
    };

    if standard != "nep141" {
        return events;
    }

    let event_type = match parsed.get("event").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return events,
    };

    let data_arr = match parsed.get("data").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return events,
    };

    for (data_index, data) in data_arr.iter().enumerate() {
        let id = format!("{}-{}-{}-token", receipt_id, log_index, data_index);

        let payload = match event_type {
            "ft_mint" => {
                let owner_id = str_field(data, "owner_id");
                let amount = str_field(data, "amount");
                let memo = str_field(data, "memo");
                Some(Payload::FtMint(FtMint { owner_id, amount, memo }))
            }
            "ft_burn" => {
                let owner_id = str_field(data, "owner_id");
                let amount = str_field(data, "amount");
                let memo = str_field(data, "memo");
                Some(Payload::FtBurn(FtBurn { owner_id, amount, memo }))
            }
            "ft_transfer" => {
                let old_owner_id = str_field(data, "old_owner_id");
                let new_owner_id = str_field(data, "new_owner_id");
                let amount = str_field(data, "amount");
                let memo = str_field(data, "memo");
                Some(Payload::FtTransfer(FtTransfer {
                    old_owner_id,
                    new_owner_id,
                    amount,
                    memo,
                }))
            }
            _ => None,
        };

        if let Some(payload) = payload {
            events.push(TokenEvent {
                id,
                block_height,
                block_timestamp,
                receipt_id: receipt_id.to_string(),
                event_type: event_type.to_string(),
                payload: Some(payload),
            });
        }
    }

    events
}

fn str_field(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}
