// --- Imports ---
use crate::{constants::*, errors::*, invalid_input, storage::{fast_hash, sharding::get_shard_subshard, utils::{parse_path, parse_groups_path}}};
use near_sdk::{env, serde_json::Value, AccountId, base64::Engine};
use super::types::*;

// --- Structs ---
pub struct EventBatch {
    events: Vec<(String, String, AccountId, Value)>,
}

// --- Impl ---
impl Default for EventBatch {
    fn default() -> Self {
        Self::new()
    }
}

impl EventBatch {
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    pub fn add(&mut self, event_type: &str, operation: &str, account_id: &AccountId, extra_data: Value) {
        self.events
            .push((event_type.to_string(), operation.to_string(), account_id.clone(), extra_data));
    }



    pub fn emit(
        &mut self,
        config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        if config.as_ref().is_some_and(|c| !c.emit) {
            return Ok(());
        }

        // Cache expensive env calls - call once per batch instead of per event
        let block_height = env::block_height();
        let block_timestamp = env::block_timestamp();

        let block_height_str = block_height.to_string();
        let block_timestamp_str = block_timestamp.to_string();

        // Cache sharding calculations for duplicate paths in batch operations
        // Typical batch operations have 2-5 unique paths across 10+ events
        // This saves ~2,000 gas per duplicate path
        use std::collections::HashMap;
        let mut sharding_cache: HashMap<&str, (u16, u32, u128)> = HashMap::new();

        for (log_index, (event_type, operation, account_id, extra_data)) in self.events.iter().enumerate() {
            let extra = extra_data
                .as_object()
                .ok_or(invalid_input!(ERR_EVENT_DATA_MUST_BE_OBJECT))?;

            // Cache frequently accessed fields to avoid repeated lookups
            let path = extra.get("path").and_then(|v| v.as_str());

            // Calculate actual storage coordinates using the same logic as storage operations
            // Check cache first to avoid redundant calculations for duplicate paths
            let (storage_shard, storage_subshard, storage_path_hash) = if let Some(p) = path {
                // Check if we've already calculated sharding for this path
                if let Some(&cached) = sharding_cache.get(p) {
                    (Some(cached.0), Some(cached.1), Some(cached.2))
                } else {
                    // Calculate sharding and cache for subsequent events with same path
                    let result = if let Some((namespace_id, relative_path)) = parse_groups_path(p) {
                        // Group path: groups/{group_id}/{relative_path}
                        let path_hash = fast_hash(relative_path.as_bytes());
                        let (shard, subshard) = get_shard_subshard(namespace_id, path_hash);
                        (shard, subshard, path_hash)
                    } else if let Some((namespace_id, relative_path)) = parse_path(p) {
                        // Account path: {account_id}/{relative_path}
                        let path_hash = fast_hash(relative_path.as_bytes());
                        let (shard, subshard) = get_shard_subshard(namespace_id, path_hash);
                        (shard, subshard, path_hash)
                    } else {
                        // Invalid path format - fall back to account-based sharding
                        let account_hash = fast_hash(account_id.as_bytes());
                        let shard = (account_hash % crate::constants::NUM_SHARDS as u128) as u16;
                        let subshard = (account_hash % crate::constants::NUM_SUBSHARDS as u128) as u32;
                        (shard, subshard, account_hash)
                    };
                    
                    // Cache for next event with same path
                    sharding_cache.insert(p, result);
                    (Some(result.0), Some(result.1), Some(result.2))
                }
            } else {
                // No path - fall back to account-based sharding (uncached as each event may have different account)
                let account_hash = fast_hash(account_id.as_bytes());
                let shard = (account_hash % crate::constants::NUM_SHARDS as u128) as u16;
                let subshard = (account_hash % crate::constants::NUM_SUBSHARDS as u128) as u32;
                (Some(shard), Some(subshard), None)
            };

            // Direct Borsh processing - optimized to avoid string cloning where possible
            let mut borsh_extras = Vec::with_capacity(extra.len());

            // Process all extras in a single pass with direct Borsh values
            for (k, v) in extra.iter() {
                let borsh_value = match v {
                    Value::String(s) => super::types::BorshValue::String(s.clone()),
                    Value::Number(n) => super::types::BorshValue::Number(n.to_string()),
                    Value::Bool(b) => super::types::BorshValue::Bool(*b),
                    Value::Null => super::types::BorshValue::Null,
                    _ => super::types::BorshValue::String(serde_json::to_string(v).unwrap()),
                };
                borsh_extras.push(super::types::BorshExtra {
                    key: k.to_string(),
                    value: borsh_value,
                });
            }
            let event = Event {
                evt_standard: EVENT_STANDARD.into(),
                version: EVENT_VERSION.into(),
                evt_type: event_type.clone(),
                op_type: operation.clone(),
                data: Some(BaseEventData {
                    block_height,
                    timestamp: block_timestamp,
                    author: account_id.to_string(),
                    shard_id: storage_shard,
                    subshard_id: storage_subshard,
                    path_hash: storage_path_hash,
                    extra: borsh_extras, // Direct Borsh extras
                    // Substreams-compatible fields
                    evt_id: format!("{}-{}-{}-{}-{}", event_type, operation, account_id, block_height_str, block_timestamp_str),
                    log_index: log_index as u32,
                }),
            };

            // Simplified: Serialize immediately (no size limits needed - transaction size constraints prevent oversized events)
            let mut buffer = Vec::new();
            borsh::BorshSerialize::serialize(&event, &mut buffer)
                .map_err(|_| invalid_input!(ERR_FAILED_TO_ENCODE_EVENT))?;

            // Emit immediately instead of collecting - simpler and more efficient
            let encoded_len = buffer.len().div_ceil(3) * 4;
            let mut log_str = String::with_capacity(EVENT_PREFIX.len() + encoded_len);
            log_str.push_str(EVENT_PREFIX);
            near_sdk::base64::engine::general_purpose::STANDARD.encode_string(&buffer, &mut log_str);
            env::log_str(&log_str);
        }
        Ok(())
    }
}
