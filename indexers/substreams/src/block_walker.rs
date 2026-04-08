//! Shared block-walking utilities for all Substreams map modules.
//!
//! Eliminates the duplicated shard → receipt → outcome → log iteration
//! that every per-contract handler previously copied.

use substreams_near::pb::sf::near::r#type::v1::Block;

const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

/// Parsed block header metadata shared across all handlers.
pub struct BlockContext {
    pub block_height: u64,
    pub block_timestamp: u64,
    pub block_hash: String,
}

/// A single EVENT_JSON log line with its receipt context.
pub struct EventLog<'a> {
    pub receipt_id: String,
    pub json_data: &'a str,
    pub log_index: usize,
}

/// Extract the contract_id filter from Substreams params string.
///
/// Params format: `contract_id=core.onsocial.testnet`
pub fn parse_contract_filter(params: &str) -> Option<String> {
    params.split('=').nth(1).map(|s| s.trim().to_string())
}

/// Parse multiple contract filters from a combined params string.
///
/// Format: `core=core.onsocial.testnet&boost=boost.onsocial.testnet&...`
/// Returns a Vec of (label, contract_id) pairs.
pub fn parse_multi_contract_filter(params: &str) -> Vec<(String, String)> {
    params
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let label = parts.next()?.trim().to_string();
            let contract_id = parts.next()?.trim().to_string();
            if label.is_empty() || contract_id.is_empty() {
                None
            } else {
                Some((label, contract_id))
            }
        })
        .collect()
}

/// Extract block metadata from block header.
pub fn block_context(block: &Block) -> BlockContext {
    BlockContext {
        block_height: block.header.as_ref().map(|h| h.height).unwrap_or(0),
        block_timestamp: block
            .header
            .as_ref()
            .map(|h| h.timestamp_nanosec)
            .unwrap_or(0),
        block_hash: block
            .header
            .as_ref()
            .and_then(|h| h.hash.as_ref())
            .map(|hash| bs58::encode(&hash.bytes).into_string())
            .unwrap_or_default(),
    }
}

/// Iterate all EVENT_JSON log lines from a block, filtered by contract_id.
///
/// This is the single place that walks shards → receipts → outcomes → logs.
/// Each map handler calls this and only provides its own decode logic.
///
/// ```ignore
/// for_each_event_log(&block, filter.as_deref(), |log| {
///     // decode log.json_data into typed events
/// });
/// ```
pub fn for_each_event_log<F>(block: &Block, contract_filter: Option<&str>, mut callback: F)
where
    F: FnMut(EventLog<'_>),
{
    for shard in &block.shards {
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

            if contract_filter.is_some_and(|filter| receiver_id != filter) {
                continue;
            }

            let receipt_id = receipt
                .receipt_id
                .as_ref()
                .map(|id| bs58::encode(&id.bytes).into_string())
                .unwrap_or_default();

            for (log_index, log) in outcome.logs.iter().enumerate() {
                if !log.starts_with(EVENT_JSON_PREFIX) {
                    continue;
                }

                let json_data = &log[EVENT_JSON_PREFIX.len()..];

                callback(EventLog {
                    receipt_id: receipt_id.clone(),
                    json_data,
                    log_index,
                });
            }
        }
    }
}

/// A single EVENT_JSON log line with its receipt context and the matched contract label.
pub struct LabeledEventLog<'a> {
    pub label: &'a str,
    pub receipt_id: String,
    pub json_data: &'a str,
    pub log_index: usize,
}

/// Iterate all EVENT_JSON log lines from a block, matched against multiple contracts.
///
/// `contracts` is a slice of (label, contract_id) pairs.
/// The callback receives a `LabeledEventLog` containing the label of the matched contract.
pub fn for_each_event_log_multi<'a, F>(
    block: &'a Block,
    contracts: &'a [(String, String)],
    mut callback: F,
) where
    F: FnMut(LabeledEventLog<'a>),
{
    // Build a lookup from contract_id → label
    let contract_map: std::collections::HashMap<&str, &str> = contracts
        .iter()
        .map(|(label, id)| (id.as_str(), label.as_str()))
        .collect();

    for shard in &block.shards {
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

            let label = match contract_map.get(receiver_id.as_str()) {
                Some(l) => *l,
                None => continue,
            };

            let receipt_id = receipt
                .receipt_id
                .as_ref()
                .map(|id| bs58::encode(&id.bytes).into_string())
                .unwrap_or_default();

            for (log_index, log) in outcome.logs.iter().enumerate() {
                if !log.starts_with(EVENT_JSON_PREFIX) {
                    continue;
                }

                let json_data = &log[EVENT_JSON_PREFIX.len()..];

                callback(LabeledEventLog {
                    label,
                    receipt_id: receipt_id.clone(),
                    json_data,
                    log_index,
                });
            }
        }
    }
}
