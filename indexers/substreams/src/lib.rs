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

// The #[substreams::handlers::map] macro generates raw-pointer FFI glue
// that clippy flags. This is safe — the substreams runtime guarantees
// valid pointers.
#![allow(clippy::not_unsafe_ptr_arg_deref)]

mod block_walker;
mod boost_db_out;
mod boost_decoder;
mod combined_db_out;
mod core_db_out;
mod core_decoder;
mod pb;
mod rewards_db_out;
mod rewards_decoder;
mod scarces_db_out;
mod scarces_decoder;
mod token_db_out;
mod token_decoder;

#[cfg(test)]
mod tests;

use block_walker::{
    block_context, for_each_event_log, for_each_event_log_multi, parse_contract_filter,
    parse_multi_contract_filter,
};
use boost_decoder::decode_boost_event;
use core_decoder::decode_onsocial_event;
use pb::boost::v1::BoostOutput;
use pb::combined::v1::CombinedOutput;
use pb::core_onsocial::v1::{
    ContractUpdate, DataUpdate, GroupUpdate, Output, PermissionUpdate, StorageUpdate,
};
use pb::rewards::v1::RewardsOutput;
use pb::scarces::v1::ScarcesOutput;
use pb::token::v1::TokenOutput;
use rewards_decoder::decode_rewards_event;
use scarces_decoder::decode_scarces_event;
use serde_json::Value;
use substreams_near::pb::sf::near::r#type::v1::Block;
use token_decoder::decode_token_events;

// =============================================================================
// Core-OnSocial Map Module
// =============================================================================

/// Process a single core-onsocial log line, appending decoded events to the accumulators.
/// Shared by both `map_core_output` (per-contract) and `map_combined_output`.
#[allow(clippy::too_many_arguments)]
fn process_core_log(
    json_data: &str,
    receipt_id: &str,
    log_index: usize,
    block_height: u64,
    block_timestamp: u64,
    data_updates: &mut Vec<DataUpdate>,
    storage_updates: &mut Vec<StorageUpdate>,
    group_updates: &mut Vec<GroupUpdate>,
    contract_updates: &mut Vec<ContractUpdate>,
    permission_updates: &mut Vec<PermissionUpdate>,
) {
    let event = match decode_onsocial_event(json_data) {
        Ok(e) => e,
        Err(_) => return,
    };

    if event.standard != "onsocial" || !event.version.starts_with("1.") {
        return;
    }

    match event.event.as_str() {
        "DATA_UPDATE" => {
            for (i, data) in event.data.iter().enumerate() {
                if let Some(u) = extract_data_update(
                    data,
                    receipt_id,
                    log_index as u32,
                    i as u32,
                    block_height,
                    block_timestamp,
                ) {
                    data_updates.push(u);
                }
            }
        }
        "STORAGE_UPDATE" => {
            for (i, data) in event.data.iter().enumerate() {
                if let Some(u) = extract_storage_update(
                    data,
                    receipt_id,
                    log_index as u32,
                    i as u32,
                    block_height,
                    block_timestamp,
                ) {
                    storage_updates.push(u);
                }
            }
        }
        "GROUP_UPDATE" => {
            for (i, data) in event.data.iter().enumerate() {
                if let Some(u) = synthesize_data_update_from_group_update(
                    data,
                    receipt_id,
                    log_index as u32,
                    i as u32,
                    block_height,
                    block_timestamp,
                ) {
                    data_updates.push(u);
                }
                if let Some(u) = extract_group_update(
                    data,
                    receipt_id,
                    log_index as u32,
                    i as u32,
                    block_height,
                    block_timestamp,
                ) {
                    group_updates.push(u);
                }
            }
        }
        "CONTRACT_UPDATE" => {
            for (i, data) in event.data.iter().enumerate() {
                if let Some(u) = extract_contract_update(
                    data,
                    receipt_id,
                    log_index as u32,
                    i as u32,
                    block_height,
                    block_timestamp,
                ) {
                    contract_updates.push(u);
                }
            }
        }
        "PERMISSION_UPDATE" => {
            for (i, data) in event.data.iter().enumerate() {
                if let Some(u) = extract_permission_update(
                    data,
                    receipt_id,
                    log_index as u32,
                    i as u32,
                    block_height,
                    block_timestamp,
                ) {
                    permission_updates.push(u);
                }
            }
        }
        _ => {}
    }
}

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
        process_core_log(
            log.json_data,
            &log.receipt_id,
            log.log_index,
            ctx.block_height,
            ctx.block_timestamp,
            &mut data_updates,
            &mut storage_updates,
            &mut group_updates,
            &mut contract_updates,
            &mut permission_updates,
        );
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
// Boost Map Module
// =============================================================================

/// Boost map module - outputs typed boost events for DB sink
#[substreams::handlers::map]
fn map_boost_output(
    params: String,
    block: Block,
) -> Result<BoostOutput, substreams::errors::Error> {
    let filter = parse_contract_filter(&params);
    let ctx = block_context(&block);
    let mut events = Vec::new();

    for_each_event_log(&block, filter.as_deref(), |log| {
        if let Some(event) = decode_boost_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(event);
        }
    });

    Ok(BoostOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    })
}

// =============================================================================
// Rewards Map Module
// =============================================================================

/// Rewards map module - outputs typed rewards events for DB sink
#[substreams::handlers::map]
fn map_rewards_output(
    params: String,
    block: Block,
) -> Result<RewardsOutput, substreams::errors::Error> {
    let filter = parse_contract_filter(&params);
    let ctx = block_context(&block);
    let mut events = Vec::new();

    for_each_event_log(&block, filter.as_deref(), |log| {
        if let Some(event) = decode_rewards_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(event);
        }
    });

    Ok(RewardsOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    })
}

// =============================================================================
// Token (NEP-141) Map Module
// =============================================================================

/// Token map module - outputs typed NEP-141 events for DB sink
#[substreams::handlers::map]
fn map_token_output(
    params: String,
    block: Block,
) -> Result<TokenOutput, substreams::errors::Error> {
    let filter = parse_contract_filter(&params);
    let ctx = block_context(&block);
    let mut events = Vec::new();

    for_each_event_log(&block, filter.as_deref(), |log| {
        events.extend(decode_token_events(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ));
    });

    Ok(TokenOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    })
}

// =============================================================================
// Scarces (NFT Marketplace) Map Module
// =============================================================================

/// Scarces map module - outputs typed marketplace events for DB sink
#[substreams::handlers::map]
fn map_scarces_output(
    params: String,
    block: Block,
) -> Result<ScarcesOutput, substreams::errors::Error> {
    let filter = parse_contract_filter(&params);
    let ctx = block_context(&block);
    let mut events = Vec::new();

    for_each_event_log(&block, filter.as_deref(), |log| {
        if let Some(event) = decode_scarces_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(event);
        }
    });

    Ok(ScarcesOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    })
}

// =============================================================================
// Combined Map Module — All contracts in a single stream
// =============================================================================

/// Combined map module — processes all 5 contracts in a single block pass.
///
/// Params format: `core=core.onsocial.testnet&boost=boost.onsocial.testnet&...`
/// Each key is the contract label used to dispatch to the correct decoder.
#[substreams::handlers::map]
fn map_combined_output(
    params: String,
    block: Block,
) -> Result<CombinedOutput, substreams::errors::Error> {
    let contracts = parse_multi_contract_filter(&params);
    let ctx = block_context(&block);

    // Core accumulators
    let mut data_updates = Vec::new();
    let mut storage_updates = Vec::new();
    let mut group_updates = Vec::new();
    let mut contract_updates = Vec::new();
    let mut permission_updates = Vec::new();

    // Per-contract event accumulators
    let mut boost_events = Vec::new();
    let mut rewards_events = Vec::new();
    let mut token_events = Vec::new();
    let mut scarces_events = Vec::new();

    for_each_event_log_multi(&block, &contracts, |log| match log.label {
        "core" => {
            process_core_log(
                log.json_data,
                &log.receipt_id,
                log.log_index,
                ctx.block_height,
                ctx.block_timestamp,
                &mut data_updates,
                &mut storage_updates,
                &mut group_updates,
                &mut contract_updates,
                &mut permission_updates,
            );
        }
        "boost" => {
            if let Some(event) = decode_boost_event(
                log.json_data,
                &log.receipt_id,
                ctx.block_height,
                ctx.block_timestamp,
                log.log_index,
            ) {
                boost_events.push(event);
            }
        }
        "rewards" => {
            if let Some(event) = decode_rewards_event(
                log.json_data,
                &log.receipt_id,
                ctx.block_height,
                ctx.block_timestamp,
                log.log_index,
            ) {
                rewards_events.push(event);
            }
        }
        "token" => {
            token_events.extend(decode_token_events(
                log.json_data,
                &log.receipt_id,
                ctx.block_height,
                ctx.block_timestamp,
                log.log_index,
            ));
        }
        "scarces" => {
            if let Some(event) = decode_scarces_event(
                log.json_data,
                &log.receipt_id,
                ctx.block_height,
                ctx.block_timestamp,
                log.log_index,
            ) {
                scarces_events.push(event);
            }
        }
        _ => {}
    });

    Ok(CombinedOutput {
        core: Some(Output {
            data_updates,
            storage_updates,
            group_updates,
            contract_updates,
            permission_updates,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash.clone(),
        }),
        boost: Some(BoostOutput {
            events: boost_events,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash.clone(),
        }),
        rewards: Some(RewardsOutput {
            events: rewards_events,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash.clone(),
        }),
        token: Some(TokenOutput {
            events: token_events,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash.clone(),
        }),
        scarces: Some(ScarcesOutput {
            events: scarces_events,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash.clone(),
        }),
    })
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

    // Check for group content
    let group_id = get_string(&data.extra, "group_id");
    let group_path = get_string(&data.extra, "group_path");
    let is_group_content = get_bool(&data.extra, "is_group_content").unwrap_or(false);

    let (account_id, data_type, data_id) = classify_data_path(
        &path_parts,
        group_id.as_deref(),
        group_path.as_deref(),
        is_group_content,
    );

    // Target account for social graph paths.
    // Generic rule: if parts[2] looks like a NEAR account (contains '.')
    // for any relationship type (standing, reaction, endorsement, delegate,
    // mentor, etc.), extract it as target_account.
    // Special case: graph/follow/{target} at parts[3] for NEAR Social compat.
    let target_account = if path_parts.len() >= 4 && path_parts.get(1) == Some(&"graph") {
        // Legacy NEAR Social DB: {account}/graph/{verb}/{target}
        path_parts
            .get(3)
            .filter(|s| s.contains('.'))
            .map(|s| s.to_string())
    } else if path_parts.len() >= 3 {
        // Generic: {account}/{relationship}/{target}[/...]
        path_parts
            .get(2)
            .filter(|s| s.contains('.'))
            .map(|s| s.to_string())
    } else {
        None
    };

    // Reaction kind: schema v1 uses reaction/<owner>/<kind>/<contentPath>.
    // For data_type == "reaction", parts[3] is the kind ("like", "bookmark", etc.).
    let reaction_kind = if data_type == "reaction" {
        path_parts
            .get(3)
            .filter(|s| !s.is_empty() && !s.contains('.'))
            .map(|s| s.to_string())
    } else {
        None
    };

    // Get value and extract reference fields
    let value = get_string(&data.extra, "value");
    let value_json: Option<Value> = value.as_ref().and_then(|v| serde_json::from_str(v).ok());

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
        data_type,
        data_id,
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
        // Capture all fields as JSON so nothing is ever lost
        extra_data: serde_json::to_string(&data.extra).unwrap_or_default(),
        reaction_kind: reaction_kind.unwrap_or_default(),
    })
}

fn classify_data_path(
    path_parts: &[&str],
    group_id: Option<&str>,
    group_path: Option<&str>,
    is_group_content: bool,
) -> (String, String, String) {
    let account_id = path_parts
        .first()
        .map(|s| (*s).to_string())
        .unwrap_or_default();

    if is_group_content {
        if let Some((data_type, data_id)) = classify_group_content_type(path_parts, group_path) {
            return (account_id, data_type, data_id);
        }

        if let Some(group_id) = group_id {
            return (
                account_id,
                "group_content".to_string(),
                group_id.to_string(),
            );
        }
    }

    (
        account_id,
        path_parts
            .get(1)
            .map(|s| (*s).to_string())
            .unwrap_or_default(),
        path_parts
            .get(2)
            .map(|s| (*s).to_string())
            .unwrap_or_default(),
    )
}

fn classify_group_content_type(
    path_parts: &[&str],
    group_path: Option<&str>,
) -> Option<(String, String)> {
    if let Some(group_path) = group_path {
        let rel_parts: Vec<&str> = group_path.split('/').filter(|s| !s.is_empty()).collect();
        if let Some((data_type, data_id)) = classify_group_content_segments(&rel_parts) {
            return Some((data_type.to_string(), data_id.to_string()));
        }
    }

    if path_parts.len() >= 6 && path_parts.get(1) == Some(&"groups") {
        return classify_group_content_segments(&path_parts[3..])
            .map(|(data_type, data_id)| (data_type.to_string(), data_id.to_string()));
    }

    if path_parts.len() >= 5 && path_parts.first() == Some(&"groups") {
        return classify_group_content_segments(&path_parts[2..])
            .map(|(data_type, data_id)| (data_type.to_string(), data_id.to_string()));
    }

    None
}

fn classify_group_content_segments<'a>(segments: &'a [&'a str]) -> Option<(&'a str, &'a str)> {
    if segments.len() >= 3 && segments.first() == Some(&"content") {
        return Some((segments[1], segments[2]));
    }

    if segments.len() >= 2 {
        let data_type = match segments[0] {
            "posts" => "post",
            "replies" => "post",
            "quotes" => "post",
            other => other,
        };
        return Some((data_type, segments[1]));
    }

    None
}

fn extract_parent_refs(value: &Option<Value>) -> (Option<String>, Option<String>, Option<String>) {
    let obj = match value {
        Some(Value::Object(o)) => o,
        _ => return (None, None, None),
    };

    let parent_path = obj
        .get("parent")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let parent_author = parent_path
        .as_ref()
        .and_then(|p| p.split('/').next())
        .map(|s| s.to_string());
    let parent_type = obj
        .get("parentType")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    (parent_path, parent_author, parent_type)
}

fn extract_ref_refs(value: &Option<Value>) -> (Option<String>, Option<String>, Option<String>) {
    let obj = match value {
        Some(Value::Object(o)) => o,
        _ => return (None, None, None),
    };

    let ref_path = obj
        .get("ref")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let ref_author = ref_path
        .as_ref()
        .and_then(|p| p.split('/').next())
        .map(|s| s.to_string());
    let ref_type = obj
        .get("refType")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

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
        member_id: get_string(&data.extra, "target_id")
            .or_else(|| get_string(&data.extra, "member_id"))
            .unwrap_or_default(),
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
        title: get_string(&data.extra, "title").unwrap_or_default(),
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

fn synthesize_data_update_from_group_update(
    data: &core_decoder::EventData,
    receipt_id: &str,
    log_index: u32,
    data_index: u32,
    block_height: u64,
    block_timestamp: u64,
) -> Option<DataUpdate> {
    let path = get_string(&data.extra, "path")?;
    let group_path = get_string(&data.extra, "group_path");
    let path_parts: Vec<&str> = path.split('/').collect();

    let (data_type, data_id) = classify_group_content_type(&path_parts, group_path.as_deref())?;

    if data_type != "post" {
        return None;
    }

    let value = get_string(&data.extra, "value");
    let value_json: Option<Value> = value.as_ref().and_then(|v| serde_json::from_str(v).ok());
    let (parent_path, parent_author, parent_type) = extract_parent_refs(&value_json);
    let (ref_path, ref_author, ref_type) = extract_ref_refs(&value_json);
    let (refs, ref_authors) = extract_refs_array(&value_json);

    Some(DataUpdate {
        id: format!("{}-{}-{}-data", receipt_id, log_index, data_index),
        block_height,
        block_timestamp,
        receipt_id: receipt_id.to_string(),
        operation: match data.operation.as_str() {
            "delete" => "remove".to_string(),
            _ => "set".to_string(),
        },
        author: data.author.clone(),
        partition_id: data.partition_id.unwrap_or(0) as u32,
        path,
        value: value.unwrap_or_default(),
        account_id: data.author.clone(),
        data_type,
        data_id,
        group_id: get_string(&data.extra, "group_id").unwrap_or_default(),
        group_path: group_path.unwrap_or_default(),
        is_group_content: get_bool(&data.extra, "is_group_content").unwrap_or(false),
        target_account: String::new(),
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
        extra_data: serde_json::to_string(&data.extra).unwrap_or_default(),
        reaction_kind: String::new(),
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
        "old_config",
        "new_config",
        "old_manager",
        "new_manager",
        "executor",
        "previous",
        "new",
        "public_key",
        "nonce",
        "wnear_account_id",
    ];
    let extra_data = {
        let mut map = serde_json::Map::new();
        for key in &extra_keys {
            if let Some(val) = data.extra.get(*key) {
                map.insert(key.to_string(), val.clone());
            }
        }
        if map.is_empty() {
            String::new()
        } else {
            serde_json::Value::Object(map).to_string()
        }
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
