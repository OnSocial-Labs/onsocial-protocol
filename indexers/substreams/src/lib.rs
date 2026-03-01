//! OnSocial Substreams Module
//!
//! Decodes NEP-297 JSON events from OnSocial NEAR contract logs.
//! Each contract gets its own `map_*_output` handler that delegates
//! block-walking to the shared `block_walker` module.
//!
//! Adding a new contract:
//!   1. proto/<contract>.proto   — message types
//!   2. src/<contract>_decoder.rs — event decoding
//!   3. src/<contract>_db_out.rs  — DatabaseChanges mapping
//!   4. Wire a `map_<contract>_output` handler below (5-10 lines)
//!   5. substreams.yaml module + params + schema

mod pb;
mod block_walker;
mod core_decoder;
mod core_db_out;
mod staking_decoder;
mod staking_db_out;
mod token_decoder;
mod token_db_out;

#[cfg(test)]
mod tests;

use substreams_near::pb::sf::near::r#type::v1::Block;
use pb::core::v1::{
    Output, DataUpdate, StorageUpdate, GroupUpdate, ContractUpdate, PermissionUpdate,
};
use pb::staking::v1::StakingOutput;
use pb::token::v1::TokenOutput;
use block_walker::{parse_contract_filter, block_context, for_each_event_log};
use core_decoder::decode_onsocial_event;
use staking_decoder::decode_staking_event;
use token_decoder::decode_token_events;
use serde_json::Value;

// =============================================================================
// Core-OnSocial Map Module
// =============================================================================

/// Core map module - routes onsocial-standard events to typed outputs
#[substreams::handlers::map]
fn map_core_output(params: String, block: Block) -> Result<Output, substreams::errors::Error> {
    let filter = parse_contract_filter(&params);
    let ctx = block_context(&block);

    let mut data_updates = Vec::new();
    let mut storage_updates = Vec::new();
    let mut group_updates = Vec::new();
    let mut contract_updates = Vec::new();
    let mut permission_updates = Vec::new();

    for_each_event_log(&block, filter.as_deref(), |log| {
        let event = match decode_onsocial_event(log.json_data) {
            Ok(e) => e,
            Err(_) => return,
        };

        if event.standard != "onsocial" || !event.version.starts_with("1.") {
            return;
        }

        match event.event.as_str() {
            "DATA_UPDATE" => {
                for (i, data) in event.data.iter().enumerate() {
                    if let Some(u) = extract_data_update(data, &log.receipt_id, log.log_index as u32, i as u32, ctx.block_height, ctx.block_timestamp) {
                        data_updates.push(u);
                    }
                }
            }
            "STORAGE_UPDATE" => {
                for (i, data) in event.data.iter().enumerate() {
                    if let Some(u) = extract_storage_update(data, &log.receipt_id, log.log_index as u32, i as u32, ctx.block_height, ctx.block_timestamp) {
                        storage_updates.push(u);
                    }
                }
            }
            "GROUP_UPDATE" => {
                for (i, data) in event.data.iter().enumerate() {
                    if let Some(u) = extract_group_update(data, &log.receipt_id, log.log_index as u32, i as u32, ctx.block_height, ctx.block_timestamp) {
                        group_updates.push(u);
                    }
                }
            }
            "CONTRACT_UPDATE" => {
                for (i, data) in event.data.iter().enumerate() {
                    if let Some(u) = extract_contract_update(data, &log.receipt_id, log.log_index as u32, i as u32, ctx.block_height, ctx.block_timestamp) {
                        contract_updates.push(u);
                    }
                }
            }
            "PERMISSION_UPDATE" => {
                for (i, data) in event.data.iter().enumerate() {
                    if let Some(u) = extract_permission_update(data, &log.receipt_id, log.log_index as u32, i as u32, ctx.block_height, ctx.block_timestamp) {
                        permission_updates.push(u);
                    }
                }
            }
            _ => {}
        }
    });

    Ok(Output {
        data_updates,
        storage_updates,
        group_updates,
        contract_updates,
        permission_updates,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    })
}

// =============================================================================
// Staking Map Module
// =============================================================================

/// Staking map module - outputs typed staking events for DB sink
#[substreams::handlers::map]
fn map_staking_output(params: String, block: Block) -> Result<StakingOutput, substreams::errors::Error> {
    let filter = parse_contract_filter(&params);
    let ctx = block_context(&block);
    let mut events = Vec::new();

    for_each_event_log(&block, filter.as_deref(), |log| {
        if let Some(event) = decode_staking_event(
            log.json_data, &log.receipt_id, ctx.block_height, ctx.block_timestamp, log.log_index,
        ) {
            events.push(event);
        }
    });

    Ok(StakingOutput { events, block_height: ctx.block_height, block_timestamp: ctx.block_timestamp, block_hash: ctx.block_hash })
}

// =============================================================================
// Token (NEP-141) Map Module
// =============================================================================

/// Token map module - outputs typed NEP-141 events for DB sink
#[substreams::handlers::map]
fn map_token_output(params: String, block: Block) -> Result<TokenOutput, substreams::errors::Error> {
    let filter = parse_contract_filter(&params);
    let ctx = block_context(&block);
    let mut events = Vec::new();

    for_each_event_log(&block, filter.as_deref(), |log| {
        events.extend(decode_token_events(
            log.json_data, &log.receipt_id, ctx.block_height, ctx.block_timestamp, log.log_index,
        ));
    });

    Ok(TokenOutput { events, block_height: ctx.block_height, block_timestamp: ctx.block_timestamp, block_hash: ctx.block_hash })
}

// =============================================================================
// DATA_UPDATE Extraction
// =============================================================================

fn extract_data_update(
    data: &core_decoder::EventData,
    receipt_id: &str,
    log_index: u32,
    data_index: u32,
    block_height: u64,
    block_timestamp: u64,
) -> Option<DataUpdate> {
    let id = format!("{}-{}-{}-data", receipt_id, log_index, data_index);
    
    let path = get_string(&data.extra, "path")?;
    let path_parts: Vec<&str> = path.split('/').collect();
    
    // Derive account_id and data_type from path
    let account_id = path_parts.first().map(|s| s.to_string()).unwrap_or_default();
    let data_type = path_parts.get(1).map(|s| s.to_string());
    let data_id = path_parts.get(2).map(|s| s.to_string());
    
    // Check for group content
    let group_id = get_string(&data.extra, "group_id");
    let group_path = get_string(&data.extra, "group_path");
    let is_group_content = get_bool(&data.extra, "is_group_content").unwrap_or(false);
    
    // Target account for graph/* paths
    let target_account = if path_parts.len() >= 4 && path_parts.get(1) == Some(&"graph") {
        path_parts.get(3).map(|s| s.to_string())
    } else {
        None
    };
    
    // Get value and extract reference fields
    let value = get_string(&data.extra, "value");
    let value_json: Option<Value> = value.as_ref()
        .and_then(|v| serde_json::from_str(v).ok());
    
    // Extract reference fields from value JSON
    let (parent_path, parent_author, parent_type) = extract_parent_refs(&value_json);
    let (ref_path, ref_author, ref_type) = extract_ref_refs(&value_json);
    let (refs, ref_authors) = extract_refs_array(&value_json);
    
    Some(DataUpdate {
        id,
        block_height,
        block_timestamp,
        receipt_id: receipt_id.to_string(),
        operation: data.operation.clone(),
        author: data.author.clone(),
        partition_id: data.partition_id.unwrap_or(0) as u32,
        path,
        value: value.unwrap_or_default(),
        account_id,
        data_type: data_type.unwrap_or_default(),
        data_id: data_id.unwrap_or_default(),
        group_id: group_id.unwrap_or_default(),
        group_path: group_path.unwrap_or_default(),
        is_group_content,
        target_account: target_account.unwrap_or_default(),
        parent_path: parent_path.unwrap_or_default(),
        parent_author: parent_author.unwrap_or_default(),
        parent_type: parent_type.unwrap_or_default(),
        ref_path: ref_path.unwrap_or_default(),
        ref_author: ref_author.unwrap_or_default(),
        ref_type: ref_type.unwrap_or_default(),
        refs,
        ref_authors,
        derived_id: get_string(&data.extra, "id").unwrap_or_default(),
        derived_type: get_string(&data.extra, "type").unwrap_or_default(),
        writes: get_string(&data.extra, "writes").unwrap_or_default(),
    })
}

fn extract_parent_refs(value: &Option<Value>) -> (Option<String>, Option<String>, Option<String>) {
    let obj = match value {
        Some(Value::Object(o)) => o,
        _ => return (None, None, None),
    };
    
    let parent_path = obj.get("parent").and_then(|v| v.as_str()).map(|s| s.to_string());
    let parent_author = parent_path.as_ref().and_then(|p| p.split('/').next()).map(|s| s.to_string());
    let parent_type = obj.get("parentType").and_then(|v| v.as_str()).map(|s| s.to_string());
    
    (parent_path, parent_author, parent_type)
}

fn extract_ref_refs(value: &Option<Value>) -> (Option<String>, Option<String>, Option<String>) {
    let obj = match value {
        Some(Value::Object(o)) => o,
        _ => return (None, None, None),
    };
    
    let ref_path = obj.get("ref").and_then(|v| v.as_str()).map(|s| s.to_string());
    let ref_author = ref_path.as_ref().and_then(|p| p.split('/').next()).map(|s| s.to_string());
    let ref_type = obj.get("refType").and_then(|v| v.as_str()).map(|s| s.to_string());
    
    (ref_path, ref_author, ref_type)
}

fn extract_refs_array(value: &Option<Value>) -> (Vec<String>, Vec<String>) {
    let obj = match value {
        Some(Value::Object(o)) => o,
        _ => return (vec![], vec![]),
    };
    
    let refs_array = match obj.get("refs") {
        Some(Value::Array(arr)) => arr,
        _ => return (vec![], vec![]),
    };
    
    let mut refs = Vec::new();
    let mut ref_authors = Vec::new();
    
    for item in refs_array {
        if let Some(path) = item.as_str() {
            refs.push(path.to_string());
            if let Some(author) = path.split('/').next() {
                ref_authors.push(author.to_string());
            }
        }
    }
    
    (refs, ref_authors)
}

// =============================================================================
// STORAGE_UPDATE Extraction
// =============================================================================

fn extract_storage_update(
    data: &core_decoder::EventData,
    receipt_id: &str,
    log_index: u32,
    data_index: u32,
    block_height: u64,
    block_timestamp: u64,
) -> Option<StorageUpdate> {
    let id = format!("{}-{}-{}-storage", receipt_id, log_index, data_index);
    
    Some(StorageUpdate {
        id,
        block_height,
        block_timestamp,
        receipt_id: receipt_id.to_string(),
        operation: data.operation.clone(),
        author: data.author.clone(),
        partition_id: data.partition_id.unwrap_or(0) as u32,
        amount: get_string(&data.extra, "amount").unwrap_or_default(),
        previous_balance: get_string(&data.extra, "previous_balance").unwrap_or_default(),
        new_balance: get_string(&data.extra, "new_balance").unwrap_or_default(),
        pool_id: get_string(&data.extra, "pool_id").unwrap_or_default(),
        pool_key: get_string(&data.extra, "pool_key").unwrap_or_default(),
        previous_pool_balance: get_string(&data.extra, "previous_pool_balance").unwrap_or_default(),
        new_pool_balance: get_string(&data.extra, "new_pool_balance").unwrap_or_default(),
        group_id: get_string(&data.extra, "group_id").unwrap_or_default(),
        bytes: get_string(&data.extra, "bytes").unwrap_or_default(),
        remaining_allowance: get_string(&data.extra, "remaining_allowance").unwrap_or_default(),
        pool_account: get_string(&data.extra, "pool_account").unwrap_or_default(),
        reason: get_string(&data.extra, "reason").unwrap_or_default(),
        auth_type: get_string(&data.extra, "auth_type").unwrap_or_default(),
        actor_id: get_string(&data.extra, "actor_id").unwrap_or_default(),
        payer_id: get_string(&data.extra, "payer_id").unwrap_or_default(),
        target_id: get_string(&data.extra, "target_id").unwrap_or_default(),
        available_balance: get_string(&data.extra, "available_balance").unwrap_or_default(),
        donor: get_string(&data.extra, "donor").unwrap_or_default(),
        payer: get_string(&data.extra, "payer").unwrap_or_default(),
        max_bytes: get_string(&data.extra, "max_bytes").unwrap_or_default(),
        new_shared_bytes: get_string(&data.extra, "new_shared_bytes").unwrap_or_default(),
        new_used_bytes: get_string(&data.extra, "new_used_bytes").unwrap_or_default(),
        pool_available_bytes: get_string(&data.extra, "pool_available_bytes").unwrap_or_default(),
        used_bytes: get_string(&data.extra, "used_bytes").unwrap_or_default(),
        // Capture all fields as JSON so nothing is ever lost
        extra_data: serde_json::to_string(&data.extra).unwrap_or_default(),
    })
}

// =============================================================================
// GROUP_UPDATE Extraction
// =============================================================================

fn extract_group_update(
    data: &core_decoder::EventData,
    receipt_id: &str,
    log_index: u32,
    data_index: u32,
    block_height: u64,
    block_timestamp: u64,
) -> Option<GroupUpdate> {
    let id = format!("{}-{}-{}-group", receipt_id, log_index, data_index);
    
    Some(GroupUpdate {
        id,
        block_height,
        block_timestamp,
        receipt_id: receipt_id.to_string(),
        operation: data.operation.clone(),
        author: data.author.clone(),
        partition_id: data.partition_id.unwrap_or(0) as u32,
        group_id: get_string(&data.extra, "group_id").unwrap_or_default(),
        member_id: get_string(&data.extra, "target_id").or_else(|| get_string(&data.extra, "member_id")).unwrap_or_default(),
        member_nonce: get_u64(&data.extra, "member_nonce").unwrap_or(0),
        member_nonce_path: get_string(&data.extra, "member_nonce_path").unwrap_or_default(),
        role: get_string(&data.extra, "role").unwrap_or_default(),
        level: get_i32(&data.extra, "level").unwrap_or(0),
        path: get_string(&data.extra, "path").unwrap_or_default(),
        value: get_string(&data.extra, "value").unwrap_or_default(),
        pool_key: get_string(&data.extra, "pool_key").unwrap_or_default(),
        amount: get_string(&data.extra, "amount").unwrap_or_default(),
        previous_pool_balance: get_string(&data.extra, "previous_pool_balance").unwrap_or_default(),
        new_pool_balance: get_string(&data.extra, "new_pool_balance").unwrap_or_default(),
        quota_bytes: get_string(&data.extra, "allowance_max_bytes").unwrap_or_default(),
        quota_used: get_string(&data.extra, "used_bytes").unwrap_or_default(),
        daily_limit: get_string(&data.extra, "daily_refill_bytes").unwrap_or_default(),
        previously_enabled: get_bool(&data.extra, "previously_enabled").unwrap_or(false),
        proposal_id: get_string(&data.extra, "proposal_id").unwrap_or_default(),
        proposal_type: get_string(&data.extra, "proposal_type").unwrap_or_default(),
        status: get_string(&data.extra, "status").unwrap_or_default(),
        sequence_number: get_u64(&data.extra, "sequence_number").unwrap_or(0),
        description: get_string(&data.extra, "description").unwrap_or_default(),
        auto_vote: get_bool(&data.extra, "auto_vote").unwrap_or(false),
        created_at: get_u64(&data.extra, "created_at").unwrap_or(0),
        locked_member_count: get_i32(&data.extra, "locked_member_count").unwrap_or(0),
        locked_deposit: get_string(&data.extra, "locked_deposit").unwrap_or_default(),
        expires_at: get_u64(&data.extra, "expires_at").unwrap_or(0),
        tally_path: get_string(&data.extra, "tally_path").unwrap_or_default(),
        counter_path: get_string(&data.extra, "counter_path").unwrap_or_default(),
        voter: get_string(&data.extra, "voter").unwrap_or_default(),
        approve: get_bool(&data.extra, "approve").unwrap_or(false),
        total_votes: get_i32(&data.extra, "total_votes").unwrap_or(0),
        yes_votes: get_i32(&data.extra, "yes_votes").unwrap_or(0),
        no_votes: get_i32(&data.extra, "no_votes").unwrap_or(0),
        should_execute: get_bool(&data.extra, "should_execute").unwrap_or(false),
        should_reject: get_bool(&data.extra, "should_reject").unwrap_or(false),
        voted_at: get_u64(&data.extra, "voted_at").unwrap_or(0),
        voting_period: get_u64(&data.extra, "voting_period").unwrap_or(0),
        participation_quorum: get_i32(&data.extra, "participation_quorum_bps").unwrap_or(0),
        approval_threshold: get_i32(&data.extra, "majority_threshold_bps").unwrap_or(0),
        permission_key: get_string(&data.extra, "permission_key").unwrap_or_default(),
        permission_value: get_string(&data.extra, "permission_value").unwrap_or_default(),
        permission_target: get_string(&data.extra, "permission_target").unwrap_or_default(),
        name: get_string(&data.extra, "name").unwrap_or_default(),
        is_public: get_bool(&data.extra, "is_public").unwrap_or(false),
        creator_role: get_string(&data.extra, "creator_role").unwrap_or_default(),
        storage_allocation: get_string(&data.extra, "storage_allocation").unwrap_or_default(),
        // Capture all fields as JSON so nothing is ever lost
        extra_data: serde_json::to_string(&data.extra).unwrap_or_default(),
    })
}

// =============================================================================
// CONTRACT_UPDATE Extraction
// =============================================================================

fn extract_contract_update(
    data: &core_decoder::EventData,
    receipt_id: &str,
    log_index: u32,
    data_index: u32,
    block_height: u64,
    block_timestamp: u64,
) -> Option<ContractUpdate> {
    let id = format!("{}-{}-{}-contract", receipt_id, log_index, data_index);
    
    // Capture event-specific fields (old_config, new_manager, executor, etc.) as JSON
    let extra_keys: Vec<&str> = vec![
        "old_config", "new_config", "old_manager", "new_manager",
        "executor", "previous", "new", "public_key", "nonce",
        "wnear_account_id",
    ];
    let extra_data = {
        let mut map = serde_json::Map::new();
        for key in &extra_keys {
            if let Some(val) = data.extra.get(*key) {
                map.insert(key.to_string(), val.clone());
            }
        }
        if map.is_empty() { String::new() } else { serde_json::Value::Object(map).to_string() }
    };
    
    Some(ContractUpdate {
        id,
        block_height,
        block_timestamp,
        receipt_id: receipt_id.to_string(),
        operation: data.operation.clone(),
        author: data.author.clone(),
        partition_id: data.partition_id.unwrap_or(0) as u32,
        path: get_string(&data.extra, "path").unwrap_or_default(),
        derived_id: get_string(&data.extra, "id").unwrap_or_default(),
        derived_type: get_string(&data.extra, "type").unwrap_or_default(),
        target_id: get_string(&data.extra, "target_id").unwrap_or_default(),
        auth_type: get_string(&data.extra, "auth_type").unwrap_or_default(),
        actor_id: get_string(&data.extra, "actor_id").unwrap_or_default(),
        payer_id: get_string(&data.extra, "payer_id").unwrap_or_default(),
        extra_data,
    })
}

// =============================================================================
// PERMISSION_UPDATE Extraction
// =============================================================================

fn extract_permission_update(
    data: &core_decoder::EventData,
    receipt_id: &str,
    log_index: u32,
    data_index: u32,
    block_height: u64,
    block_timestamp: u64,
) -> Option<PermissionUpdate> {
    let id = format!("{}-{}-{}-permission", receipt_id, log_index, data_index);
    
    Some(PermissionUpdate {
        id,
        block_height,
        block_timestamp,
        receipt_id: receipt_id.to_string(),
        operation: data.operation.clone(),
        author: data.author.clone(),
        partition_id: data.partition_id.unwrap_or(0) as u32,
        path: get_string(&data.extra, "path").unwrap_or_default(),
        target_id: get_string(&data.extra, "target_id").unwrap_or_default(),
        public_key: get_string(&data.extra, "public_key").unwrap_or_default(),
        level: get_i32(&data.extra, "level").unwrap_or(0),
        expires_at: get_u64(&data.extra, "expires_at").unwrap_or(0),
        value: get_string(&data.extra, "value").unwrap_or_default(),
        deleted: get_bool(&data.extra, "deleted").unwrap_or(false),
        derived_id: get_string(&data.extra, "id").unwrap_or_default(),
        derived_type: get_string(&data.extra, "type").unwrap_or_default(),
        permission_nonce: get_u64(&data.extra, "permission_nonce").unwrap_or(0),
    })
}

// =============================================================================
// Helper Functions
// =============================================================================

fn get_string(extra: &serde_json::Map<String, Value>, key: &str) -> Option<String> {
    extra.get(key).and_then(|v| match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Object(_) | Value::Array(_) => Some(v.to_string()),
        Value::Null => None,
    })
}

fn get_bool(extra: &serde_json::Map<String, Value>, key: &str) -> Option<bool> {
    extra.get(key).and_then(|v| v.as_bool())
}

fn get_u64(extra: &serde_json::Map<String, Value>, key: &str) -> Option<u64> {
    extra.get(key).and_then(|v| v.as_u64())
}

fn get_i32(extra: &serde_json::Map<String, Value>, key: &str) -> Option<i32> {
    extra.get(key).and_then(|v| v.as_i64()).map(|n| n as i32)
}
