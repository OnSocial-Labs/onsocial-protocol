//! OnSocial Substreams Module
//! 
//! Decodes NEP-297 JSON events from OnSocial NEAR contract logs.
//! Events have format: `EVENT_JSON:{"standard":"onsocial","version":"1.0.0","event":"...","data":[...]}`

mod pb;
mod decoder;

use substreams_near::pb::sf::near::r#type::v1::Block;
use pb::onsocial::v1::{Events, Event, EventData, ExtraField, ExtraValue};
use decoder::decode_onsocial_event;
use serde_json::Value;

const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

/// Main Substreams map module
/// Extracts and decodes OnSocial events from NEAR block logs
#[substreams::handlers::map]
fn map_onsocial_events(params: String, block: Block) -> Result<Events, substreams::errors::Error> {
    // Parse contract filter from params (format: "contract_id=xxx")
    let contract_filter: Option<&str> = params
        .split('=')
        .nth(1)
        .map(|s| s.trim());

    let block_height = block.header.as_ref().map(|h| h.height).unwrap_or(0);
    let block_timestamp = block.header.as_ref().map(|h| h.timestamp_nanosec).unwrap_or(0);
    let block_hash = block.header.as_ref()
        .and_then(|h| h.hash.as_ref())
        .map(|hash| bs58::encode(&hash.bytes).into_string())
        .unwrap_or_default();

    let mut events = Vec::new();

    // Iterate through all shards
    for shard in &block.shards {
        // receipt_execution_outcomes is on the shard directly
        for receipt_execution in &shard.receipt_execution_outcomes {
            let receipt = match &receipt_execution.receipt {
                Some(r) => r,
                None => continue,
            };

            let outcome = match &receipt_execution.execution_outcome {
                Some(eo) => match &eo.outcome {
                    Some(o) => o,
                    None => continue,
                },
                None => continue,
            };

            let receiver_id = &receipt.receiver_id;
            
            // Filter by contract if specified
            if let Some(filter) = contract_filter {
                if receiver_id != filter {
                    continue;
                }
            }

            let receipt_id = receipt.receipt_id.as_ref()
                .map(|id| bs58::encode(&id.bytes).into_string())
                .unwrap_or_default();
            let predecessor_id = receipt.predecessor_id.clone();

            // Process logs from this receipt
            for (log_index, log) in outcome.logs.iter().enumerate() {
                if !log.starts_with(EVENT_JSON_PREFIX) {
                    continue;
                }

                // Extract JSON payload after prefix
                let json_data = &log[EVENT_JSON_PREFIX.len()..];
                
                // Decode the event
                match decode_onsocial_event(json_data) {
                    Ok(onsocial_event) => {
                        // Only process OnSocial events (ignore other NEP-297 events)
                        if onsocial_event.standard != "onsocial" {
                            continue;
                        }
                        events.push(convert_to_proto(
                            onsocial_event,
                            receipt_id.clone(),
                            predecessor_id.clone(),
                            receiver_id.clone(),
                            block_height,
                            block_timestamp,
                            log_index as u32,
                        ));
                    }
                    Err(_) => {
                        // Silently skip non-OnSocial events (they have different schema)
                    }
                }
            }
        }
    }

    Ok(Events {
        events,
        block_height,
        block_timestamp,
        block_hash,
    })
}

/// Convert decoded JSON event to Protobuf message
fn convert_to_proto(
    event: decoder::OnSocialEvent,
    receipt_id: String,
    predecessor_id: String,
    receiver_id: String,
    block_height: u64,
    block_timestamp: u64,
    log_index: u32,
) -> Event {
    // Convert each EventData from JSON to Proto
    let data: Vec<EventData> = event.data.into_iter().map(|d| {
        let extra: Vec<ExtraField> = d.extra
            .into_iter()
            .map(|(key, value)| ExtraField {
                key,
                value: Some(json_value_to_proto(&value)),
            })
            .collect();

        EventData {
            operation: d.operation,
            author: d.author,
            partition_id: d.partition_id.unwrap_or(0) as u32,
            has_partition_id: d.partition_id.is_some(),
            extra,
        }
    }).collect();

    Event {
        standard: event.standard,
        version: event.version,
        event: event.event,
        data,
        receipt_id,
        predecessor_id,
        receiver_id,
        block_height,
        block_timestamp,
        log_index,
    }
}

/// Convert serde_json::Value to proto ExtraValue
fn json_value_to_proto(value: &Value) -> ExtraValue {
    match value {
        Value::String(s) => ExtraValue {
            value: Some(pb::onsocial::v1::extra_value::Value::StringValue(s.clone())),
        },
        Value::Number(n) => ExtraValue {
            value: Some(pb::onsocial::v1::extra_value::Value::NumberValue(n.as_f64().unwrap_or(0.0))),
        },
        Value::Bool(b) => ExtraValue {
            value: Some(pb::onsocial::v1::extra_value::Value::BoolValue(*b)),
        },
        Value::Null => ExtraValue {
            value: Some(pb::onsocial::v1::extra_value::Value::IsNull(true)),
        },
        // For arrays/objects, serialize to string
        _ => ExtraValue {
            value: Some(pb::onsocial::v1::extra_value::Value::StringValue(value.to_string())),
        },
    }
}
