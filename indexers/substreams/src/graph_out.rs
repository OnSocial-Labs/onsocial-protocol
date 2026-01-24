//! Entity Changes module for Substreams-powered Subgraph
//! 
//! Converts OnSocial events to EntityChanges format that The Graph can consume directly.

use substreams_entity_change::pb::entity::EntityChanges;
use substreams_entity_change::tables::Tables;
use crate::pb::onsocial::v1::Output;
use std::collections::HashMap;

/// Convert typed Output to EntityChanges for subgraph
#[substreams::handlers::map]
pub fn graph_out(output: Output) -> Result<EntityChanges, substreams::errors::Error> {
    let mut tables = Tables::new();
    
    // Track accounts and groups to create/update
    // Key: account_id, Value: (latest_timestamp, is_data_update)
    let mut accounts: HashMap<String, (u64, bool)> = HashMap::new();
    // Key: group_id, Value: (creator, latest_timestamp)
    let mut groups: HashMap<String, (String, u64)> = HashMap::new();
    
    // Process DataUpdates - collect accounts and groups
    for update in &output.data_updates {
        let entry = accounts.entry(update.account_id.clone()).or_insert((0, false));
        if update.block_timestamp > entry.0 {
            entry.0 = update.block_timestamp;
        }
        entry.1 = true;
        
        if !update.group_id.is_empty() {
            let entry = groups.entry(update.group_id.clone()).or_insert((String::new(), 0));
            if update.block_timestamp > entry.1 {
                entry.0 = update.author.clone();
                entry.1 = update.block_timestamp;
            }
        }
    }
    
    // Process StorageUpdates - collect accounts
    for update in &output.storage_updates {
        let entry = accounts.entry(update.author.clone()).or_insert((0, false));
        if update.block_timestamp > entry.0 {
            entry.0 = update.block_timestamp;
        }
    }
    
    // Process GroupUpdates - collect accounts and groups
    for update in &output.group_updates {
        let entry = accounts.entry(update.author.clone()).or_insert((0, false));
        if update.block_timestamp > entry.0 {
            entry.0 = update.block_timestamp;
        }
        
        if !update.group_id.is_empty() {
            let entry = groups.entry(update.group_id.clone()).or_insert((String::new(), 0));
            if update.block_timestamp > entry.1 {
                entry.0 = update.author.clone();
                entry.1 = update.block_timestamp;
            }
        }
    }
    
    // Process ContractUpdates - collect accounts
    for update in &output.contract_updates {
        let entry = accounts.entry(update.author.clone()).or_insert((0, false));
        if update.block_timestamp > entry.0 {
            entry.0 = update.block_timestamp;
        }
    }
    
    // Process PermissionUpdates - collect accounts
    for update in &output.permission_updates {
        let entry = accounts.entry(update.author.clone()).or_insert((0, false));
        if update.block_timestamp > entry.0 {
            entry.0 = update.block_timestamp;
        }
    }
    
    // Create Account entities
    for (account_id, (timestamp, _is_data_update)) in &accounts {
        let row = tables.update_row("Account", account_id);
        row.set_bigint("lastActiveAt", &timestamp.to_string());
    }
    
    // Create Group entities
    for (group_id, (creator, timestamp)) in &groups {
        let row = tables.update_row("Group", group_id);
        row.set("creator", creator);
        row.set_bigint("lastActivityAt", &timestamp.to_string());
    }
    
    // Process DataUpdates - create entities
    for update in output.data_updates {
        let row = tables.create_row("DataUpdate", &update.id);
        
        row.set_bigint("blockHeight", &update.block_height.to_string());
        row.set_bigint("blockTimestamp", &update.block_timestamp.to_string());
        row.set("receiptId", &update.receipt_id);
        
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partitionId", update.partition_id as i32);
        
        row.set("path", &update.path);
        if !update.value.is_empty() {
            row.set("value", &update.value);
        }
        
        row.set("accountId", &update.account_id);
        if !update.data_type.is_empty() {
            row.set("dataType", &update.data_type);
        }
        if !update.data_id.is_empty() {
            row.set("dataId", &update.data_id);
        }
        
        if !update.group_id.is_empty() {
            row.set("groupId", &update.group_id);
            row.set("group", &update.group_id);
        }
        if !update.group_path.is_empty() {
            row.set("groupPath", &update.group_path);
        }
        row.set("isGroupContent", update.is_group_content);
        
        if !update.target_account.is_empty() {
            row.set("targetAccount", &update.target_account);
        }
        
        // Reference fields
        if !update.parent_path.is_empty() {
            row.set("parentPath", &update.parent_path);
        }
        if !update.parent_author.is_empty() {
            row.set("parentAuthor", &update.parent_author);
        }
        if !update.parent_type.is_empty() {
            row.set("parentType", &update.parent_type);
        }
        
        if !update.ref_path.is_empty() {
            row.set("refPath", &update.ref_path);
        }
        if !update.ref_author.is_empty() {
            row.set("refAuthor", &update.ref_author);
        }
        if !update.ref_type.is_empty() {
            row.set("refType", &update.ref_type);
        }
        
        if !update.refs.is_empty() {
            row.set("refs", update.refs.join(","));
        }
        if !update.ref_authors.is_empty() {
            row.set("refAuthors", update.ref_authors.join(","));
        }
        
        if !update.derived_id.is_empty() {
            row.set("derivedId", &update.derived_id);
        }
        if !update.derived_type.is_empty() {
            row.set("derivedType", &update.derived_type);
        }
        if !update.writes.is_empty() {
            row.set("writes", &update.writes);
        }
        
        row.set("account", &update.account_id);
    }
    
    // Process StorageUpdates - create entities
    for update in output.storage_updates {
        let row = tables.create_row("StorageUpdate", &update.id);
        
        row.set_bigint("blockHeight", &update.block_height.to_string());
        row.set_bigint("blockTimestamp", &update.block_timestamp.to_string());
        row.set("receiptId", &update.receipt_id);
        
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partitionId", update.partition_id as i32);
        
        if !update.amount.is_empty() {
            row.set_bigint("amount", &update.amount);
        }
        if !update.previous_balance.is_empty() {
            row.set_bigint("previousBalance", &update.previous_balance);
        }
        if !update.new_balance.is_empty() {
            row.set_bigint("newBalance", &update.new_balance);
        }
        
        if !update.pool_id.is_empty() {
            row.set("poolId", &update.pool_id);
        }
        if !update.pool_key.is_empty() {
            row.set("poolKey", &update.pool_key);
        }
        if !update.group_id.is_empty() {
            row.set("groupId", &update.group_id);
        }
        if !update.reason.is_empty() {
            row.set("reason", &update.reason);
        }
        if !update.auth_type.is_empty() {
            row.set("authType", &update.auth_type);
        }
        if !update.actor_id.is_empty() {
            row.set("actorId", &update.actor_id);
        }
        if !update.payer_id.is_empty() {
            row.set("payerId", &update.payer_id);
        }
        if !update.target_id.is_empty() {
            row.set("targetId", &update.target_id);
        }
        if !update.donor.is_empty() {
            row.set("donor", &update.donor);
        }
        if !update.payer.is_empty() {
            row.set("payer", &update.payer);
        }
        
        row.set("account", &update.author);
    }
    
    // Process GroupUpdates - create entities
    for update in output.group_updates {
        let row = tables.create_row("GroupUpdate", &update.id);
        
        row.set_bigint("blockHeight", &update.block_height.to_string());
        row.set_bigint("blockTimestamp", &update.block_timestamp.to_string());
        row.set("receiptId", &update.receipt_id);
        
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partitionId", update.partition_id as i32);
        
        if !update.group_id.is_empty() {
            row.set("groupId", &update.group_id);
            row.set("group", &update.group_id);
        }
        if !update.member_id.is_empty() {
            row.set("memberId", &update.member_id);
        }
        if !update.role.is_empty() {
            row.set("role", &update.role);
        }
        if update.level != 0 {
            row.set("level", update.level);
        }
        if !update.path.is_empty() {
            row.set("path", &update.path);
        }
        if !update.value.is_empty() {
            row.set("value", &update.value);
        }
        
        if !update.proposal_id.is_empty() {
            row.set("proposalId", &update.proposal_id);
        }
        if !update.proposal_type.is_empty() {
            row.set("proposalType", &update.proposal_type);
        }
        if !update.status.is_empty() {
            row.set("status", &update.status);
        }
        if !update.description.is_empty() {
            row.set("description", &update.description);
        }
        
        if !update.voter.is_empty() {
            row.set("voter", &update.voter);
        }
        row.set("approve", update.approve);
        if update.total_votes != 0 {
            row.set("totalVotes", update.total_votes);
        }
        if update.yes_votes != 0 {
            row.set("yesVotes", update.yes_votes);
        }
        if update.no_votes != 0 {
            row.set("noVotes", update.no_votes);
        }
        
        row.set("account", &update.author);
    }
    
    // Process ContractUpdates - create entities
    for update in output.contract_updates {
        let row = tables.create_row("ContractUpdate", &update.id);
        
        row.set_bigint("blockHeight", &update.block_height.to_string());
        row.set_bigint("blockTimestamp", &update.block_timestamp.to_string());
        row.set("receiptId", &update.receipt_id);
        
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partitionId", update.partition_id as i32);
        
        if !update.path.is_empty() {
            row.set("path", &update.path);
        }
        if !update.derived_id.is_empty() {
            row.set("derivedId", &update.derived_id);
        }
        if !update.derived_type.is_empty() {
            row.set("derivedType", &update.derived_type);
        }
        if !update.target_id.is_empty() {
            row.set("targetId", &update.target_id);
        }
        if !update.auth_type.is_empty() {
            row.set("authType", &update.auth_type);
        }
        if !update.actor_id.is_empty() {
            row.set("actorId", &update.actor_id);
        }
        if !update.payer_id.is_empty() {
            row.set("payerId", &update.payer_id);
        }
        
        row.set("account", &update.author);
    }
    
    // Process PermissionUpdates - create entities
    for update in output.permission_updates {
        let row = tables.create_row("PermissionUpdate", &update.id);
        
        row.set_bigint("blockHeight", &update.block_height.to_string());
        row.set_bigint("blockTimestamp", &update.block_timestamp.to_string());
        row.set("receiptId", &update.receipt_id);
        
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partitionId", update.partition_id as i32);
        
        if !update.path.is_empty() {
            row.set("path", &update.path);
        }
        if !update.account_id.is_empty() {
            row.set("accountId", &update.account_id);
        }
        if !update.permission_type.is_empty() {
            row.set("permissionType", &update.permission_type);
        }
        if !update.target_path.is_empty() {
            row.set("targetPath", &update.target_path);
        }
        if !update.permission_key.is_empty() {
            row.set("permissionKey", &update.permission_key);
        }
        row.set("granted", update.granted);
        if !update.value.is_empty() {
            row.set("value", &update.value);
        }
        
        row.set("account", &update.author);
    }
    
    Ok(tables.to_entity_changes())
}
