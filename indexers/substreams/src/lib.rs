//! OnSocial Substreams Module
//! 
//! Decodes NEP-297 JSON events from OnSocial NEAR contract logs.
//! Events have format: `EVENT_JSON:{"standard":"onsocial","version":"1.0.0","event":"...","data":[...]}`
//!
//! Outputs typed protobuf messages for subgraph consumption.

mod pb;
mod decoder;
mod db_out;

use substreams_near::pb::sf::near::r#type::v1::Block;
use pb::onsocial::v1::{
    Output, DataUpdate, StorageUpdate, GroupUpdate, ContractUpdate, PermissionUpdate,
};
use decoder::decode_onsocial_event;
use serde_json::Value;

const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

/// Main Substreams map module - outputs typed events for subgraph
#[substreams::handlers::map]
fn map_onsocial_output(params: String, block: Block) -> Result<Output, substreams::errors::Error> {
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

    let mut data_updates = Vec::new();
    let mut storage_updates = Vec::new();
    let mut group_updates = Vec::new();
    let mut contract_updates = Vec::new();
    let mut permission_updates = Vec::new();

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
            
            if let Some(filter) = contract_filter {
                if receiver_id != filter {
                    continue;
                }
            }

            let receipt_id = receipt.receipt_id.as_ref()
                .map(|id| bs58::encode(&id.bytes).into_string())
                .unwrap_or_default();

            for (log_index, log) in outcome.logs.iter().enumerate() {
                if !log.starts_with(EVENT_JSON_PREFIX) {
                    continue;
                }

                let json_data = &log[EVENT_JSON_PREFIX.len()..];
                
                match decode_onsocial_event(json_data) {
                    Ok(event) => {
                        // Validate standard and version (NEP-297)
                        if event.standard != "onsocial" {
                            continue;
                        }
                        if !event.version.starts_with("1.") {
                            continue; // Only support v1.x.x events
                        }
                        
                        // Route to typed handlers based on event type
                        match event.event.as_str() {
                            "DATA_UPDATE" => {
                                for (data_index, data) in event.data.iter().enumerate() {
                                    if let Some(update) = extract_data_update(
                                        data,
                                        &receipt_id,
                                        log_index as u32,
                                        data_index as u32,
                                        block_height,
                                        block_timestamp,
                                    ) {
                                        data_updates.push(update);
                                    }
                                }
                            }
                            "STORAGE_UPDATE" => {
                                for (data_index, data) in event.data.iter().enumerate() {
                                    if let Some(update) = extract_storage_update(
                                        data,
                                        &receipt_id,
                                        log_index as u32,
                                        data_index as u32,
                                        block_height,
                                        block_timestamp,
                                    ) {
                                        storage_updates.push(update);
                                    }
                                }
                            }
                            "GROUP_UPDATE" => {
                                for (data_index, data) in event.data.iter().enumerate() {
                                    if let Some(update) = extract_group_update(
                                        data,
                                        &receipt_id,
                                        log_index as u32,
                                        data_index as u32,
                                        block_height,
                                        block_timestamp,
                                    ) {
                                        group_updates.push(update);
                                    }
                                }
                            }
                            "CONTRACT_UPDATE" => {
                                for (data_index, data) in event.data.iter().enumerate() {
                                    if let Some(update) = extract_contract_update(
                                        data,
                                        &receipt_id,
                                        log_index as u32,
                                        data_index as u32,
                                        block_height,
                                        block_timestamp,
                                    ) {
                                        contract_updates.push(update);
                                    }
                                }
                            }
                            "PERMISSION_UPDATE" => {
                                for (data_index, data) in event.data.iter().enumerate() {
                                    if let Some(update) = extract_permission_update(
                                        data,
                                        &receipt_id,
                                        log_index as u32,
                                        data_index as u32,
                                        block_height,
                                        block_timestamp,
                                    ) {
                                        permission_updates.push(update);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    Err(_) => {}
                }
            }
        }
    }

    Ok(Output {
        data_updates,
        storage_updates,
        group_updates,
        contract_updates,
        permission_updates,
        block_height,
        block_timestamp,
        block_hash,
    })
}

// =============================================================================
// DATA_UPDATE Extraction
// =============================================================================

fn extract_data_update(
    data: &decoder::EventData,
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
    data: &decoder::EventData,
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
    })
}

// =============================================================================
// GROUP_UPDATE Extraction
// =============================================================================

fn extract_group_update(
    data: &decoder::EventData,
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
        quota_bytes: get_string(&data.extra, "quota_bytes").unwrap_or_default(),
        quota_used: get_string(&data.extra, "quota_used").unwrap_or_default(),
        daily_limit: get_string(&data.extra, "daily_limit").unwrap_or_default(),
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
        participation_quorum: get_i32(&data.extra, "participation_quorum").unwrap_or(0),
        approval_threshold: get_i32(&data.extra, "approval_threshold").unwrap_or(0),
        permission_key: get_string(&data.extra, "permission_key").unwrap_or_default(),
        permission_value: get_string(&data.extra, "permission_value").unwrap_or_default(),
        permission_target: get_string(&data.extra, "permission_target").unwrap_or_default(),
        name: get_string(&data.extra, "name").unwrap_or_default(),
        is_public: get_bool(&data.extra, "is_public").unwrap_or(false),
        creator_role: get_string(&data.extra, "creator_role").unwrap_or_default(),
        storage_allocation: get_string(&data.extra, "storage_allocation").unwrap_or_default(),
    })
}

// =============================================================================
// CONTRACT_UPDATE Extraction
// =============================================================================

fn extract_contract_update(
    data: &decoder::EventData,
    receipt_id: &str,
    log_index: u32,
    data_index: u32,
    block_height: u64,
    block_timestamp: u64,
) -> Option<ContractUpdate> {
    let id = format!("{}-{}-{}-contract", receipt_id, log_index, data_index);
    
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
    })
}

// =============================================================================
// PERMISSION_UPDATE Extraction
// =============================================================================

fn extract_permission_update(
    data: &decoder::EventData,
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
        account_id: get_string(&data.extra, "account_id").unwrap_or_default(),
        permission_type: get_string(&data.extra, "permission_type").unwrap_or_default(),
        target_path: get_string(&data.extra, "target_path").unwrap_or_default(),
        permission_key: get_string(&data.extra, "permission_key").unwrap_or_default(),
        granted: get_bool(&data.extra, "granted").unwrap_or(false),
        value: get_string(&data.extra, "value").unwrap_or_default(),
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
