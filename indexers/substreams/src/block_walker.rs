//! Shared EVENT_JSON block walkers.

use substreams_near::pb::sf::near::r#type::v1::Block;

const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

pub struct BlockContext {
    pub block_height: u64,
    pub block_timestamp: u64,
    pub block_hash: String,
}

pub struct EventLog<'a> {
    pub receipt_id: String,
    pub json_data: &'a str,
    pub log_index: usize,
}

/// Extracts the `contract_id` filter from params.
pub fn parse_contract_filter(params: &str) -> Option<String> {
    params.split('=').nth(1).map(|s| s.trim().to_string())
}

/// Extracts labeled contract filters from combined params.
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

/// Iterates EVENT_JSON logs for one optional contract filter.
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

pub struct LabeledEventLog<'a> {
    pub label: &'a str,
    pub receipt_id: String,
    pub json_data: &'a str,
    pub log_index: usize,
}

/// Iterates EVENT_JSON logs matched against multiple contracts.
pub fn for_each_event_log_multi<'a, F>(
    block: &'a Block,
    contracts: &'a [(String, String)],
    mut callback: F,
) where
    F: FnMut(LabeledEventLog<'a>),
{
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
