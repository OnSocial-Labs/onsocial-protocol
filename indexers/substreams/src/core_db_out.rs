//! Database Changes module for core-onsocial contract
//!
//! Converts core OnSocial events to DatabaseChanges format for PostgreSQL.

use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;
use crate::pb::core::v1::Output;

/// Convert typed Output to DatabaseChanges for SQL sink
#[substreams::handlers::map]
pub fn core_db_out(output: Output) -> Result<DatabaseChanges, substreams::errors::Error> {
    let mut tables = Tables::new();

    // Process DataUpdates
    for update in output.data_updates {
        let row = tables.create_row("data_updates", &update.id);
        
        row.set("block_height", update.block_height);
        row.set("block_timestamp", update.block_timestamp);
        row.set("receipt_id", &update.receipt_id);
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partition_id", update.partition_id);
        row.set("path", &update.path);
        row.set("value", &update.value);
        row.set("account_id", &update.account_id);
        row.set("data_type", &update.data_type);
        row.set("data_id", &update.data_id);
        row.set("group_id", &update.group_id);
        row.set("group_path", &update.group_path);
        row.set("is_group_content", update.is_group_content);
        row.set("target_account", &update.target_account);
        row.set("parent_path", &update.parent_path);
        row.set("parent_author", &update.parent_author);
        row.set("parent_type", &update.parent_type);
        row.set("ref_path", &update.ref_path);
        row.set("ref_author", &update.ref_author);
        row.set("ref_type", &update.ref_type);
        row.set("refs", update.refs.join(","));
        row.set("ref_authors", update.ref_authors.join(","));
        row.set("derived_id", &update.derived_id);
        row.set("derived_type", &update.derived_type);
        row.set("writes", &update.writes);
    }

    // Process StorageUpdates
    for update in output.storage_updates {
        let row = tables.create_row("storage_updates", &update.id);
        
        row.set("block_height", update.block_height);
        row.set("block_timestamp", update.block_timestamp);
        row.set("receipt_id", &update.receipt_id);
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partition_id", update.partition_id);
        row.set("amount", &update.amount);
        row.set("previous_balance", &update.previous_balance);
        row.set("new_balance", &update.new_balance);
        row.set("pool_id", &update.pool_id);
        row.set("pool_key", &update.pool_key);
        row.set("group_id", &update.group_id);
        row.set("reason", &update.reason);
        row.set("auth_type", &update.auth_type);
        row.set("actor_id", &update.actor_id);
        row.set("payer_id", &update.payer_id);
        row.set("target_id", &update.target_id);
        row.set("donor", &update.donor);
        row.set("payer", &update.payer);
        row.set("extra_data", &update.extra_data);
    }

    // Process GroupUpdates
    for update in output.group_updates {
        let row = tables.create_row("group_updates", &update.id);
        
        row.set("block_height", update.block_height);
        row.set("block_timestamp", update.block_timestamp);
        row.set("receipt_id", &update.receipt_id);
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partition_id", update.partition_id);
        row.set("group_id", &update.group_id);
        row.set("member_id", &update.member_id);
        row.set("role", &update.role);
        row.set("level", update.level);
        row.set("path", &update.path);
        row.set("value", &update.value);
        row.set("proposal_id", &update.proposal_id);
        row.set("proposal_type", &update.proposal_type);
        row.set("status", &update.status);
        row.set("sequence_number", update.sequence_number);
        row.set("title", &update.title);
        row.set("description", &update.description);
        row.set("auto_vote", update.auto_vote);
        row.set("created_at", update.created_at);
        row.set("locked_member_count", update.locked_member_count);
        row.set("locked_deposit", &update.locked_deposit);
        row.set("expires_at", update.expires_at);
        row.set("voter", &update.voter);
        row.set("approve", update.approve);
        row.set("total_votes", update.total_votes);
        row.set("yes_votes", update.yes_votes);
        row.set("no_votes", update.no_votes);
        row.set("should_execute", update.should_execute);
        row.set("should_reject", update.should_reject);
        row.set("voted_at", update.voted_at);
        row.set("member_nonce", update.member_nonce);
        row.set("extra_data", &update.extra_data);
    }

    // Process ContractUpdates
    for update in output.contract_updates {
        let row = tables.create_row("contract_updates", &update.id);
        
        row.set("block_height", update.block_height);
        row.set("block_timestamp", update.block_timestamp);
        row.set("receipt_id", &update.receipt_id);
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partition_id", update.partition_id);
        row.set("path", &update.path);
        row.set("derived_id", &update.derived_id);
        row.set("derived_type", &update.derived_type);
        row.set("target_id", &update.target_id);
        row.set("auth_type", &update.auth_type);
        row.set("actor_id", &update.actor_id);
        row.set("payer_id", &update.payer_id);
        row.set("extra_data", &update.extra_data);
    }

    // Process PermissionUpdates
    for update in output.permission_updates {
        let row = tables.create_row("permission_updates", &update.id);
        
        row.set("block_height", update.block_height);
        row.set("block_timestamp", update.block_timestamp);
        row.set("receipt_id", &update.receipt_id);
        row.set("operation", &update.operation);
        row.set("author", &update.author);
        row.set("partition_id", update.partition_id);
        row.set("path", &update.path);
        row.set("target_id", &update.target_id);
        row.set("public_key", &update.public_key);
        row.set("level", update.level);
        row.set("expires_at", update.expires_at);
        row.set("value", &update.value);
        row.set("deleted", update.deleted);
        row.set("derived_id", &update.derived_id);
        row.set("derived_type", &update.derived_type);
        row.set("permission_nonce", update.permission_nonce);
    }

    Ok(tables.to_database_changes())
}
