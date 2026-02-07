//! Database Changes module for NEP-141 token events
//!
//! Converts TokenOutput to DatabaseChanges for substreams-sink-sql.
//! Writes to: token_events, token_balances

use std::collections::HashMap;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;
use crate::pb::token::v1::*;
use crate::pb::token::v1::token_event::Payload;

/// Accumulated token balance fields (one entry per account per block scope).
#[derive(Default)]
pub(crate) struct BalanceAccum {
    pub(crate) last_event_type: String,
    pub(crate) last_event_block: String,
    pub(crate) updated_at: String,
}

#[substreams::handlers::map]
pub fn token_db_out(output: TokenOutput) -> Result<DatabaseChanges, substreams::errors::Error> {
    let mut tables = Tables::new();
    let mut balance_accum: HashMap<String, BalanceAccum> = HashMap::new();

    for event in &output.events {
        // 1. Write every event to token_events
        write_token_event(&mut tables, event);

        // 2. Accumulate token_balances updates (dedup by account_id)
        accumulate_token_balances(&mut balance_accum, event);
    }

    // 3. Flush one token_balances row per account
    for (account_id, state) in &balance_accum {
        let row = tables.create_row("token_balances", account_id);
        row.set("account_id", account_id);
        row.set("last_event_type", &state.last_event_type);
        row.set("last_event_block", &state.last_event_block);
        row.set("updated_at", &state.updated_at);
    }

    Ok(tables.to_database_changes())
}

pub(crate) fn write_token_event(tables: &mut Tables, event: &TokenEvent) {
    let row = tables.create_row("token_events", &event.id);

    row.set("block_height", event.block_height);
    row.set("block_timestamp", event.block_timestamp);
    row.set("receipt_id", &event.receipt_id);
    row.set("event_type", &event.event_type);

    match &event.payload {
        Some(Payload::FtMint(p)) => {
            row.set("owner_id", &p.owner_id);
            row.set("amount", &p.amount);
            row.set("memo", &p.memo);
        }
        Some(Payload::FtBurn(p)) => {
            row.set("owner_id", &p.owner_id);
            row.set("amount", &p.amount);
            row.set("memo", &p.memo);
        }
        Some(Payload::FtTransfer(p)) => {
            row.set("old_owner_id", &p.old_owner_id);
            row.set("new_owner_id", &p.new_owner_id);
            row.set("amount", &p.amount);
            row.set("memo", &p.memo);
        }
        None => {}
    }
}

pub(crate) fn accumulate_token_balances(accum: &mut HashMap<String, BalanceAccum>, event: &TokenEvent) {
    let mut touch = |account_id: &str, event_type: &str| {
        if account_id.is_empty() { return; }
        let entry = accum.entry(account_id.to_string()).or_default();
        entry.last_event_type = event_type.to_string();
        entry.last_event_block = event.block_height.to_string();
        entry.updated_at = event.block_timestamp.to_string();
    };

    match &event.payload {
        Some(Payload::FtMint(p)) => {
            touch(&p.owner_id, "ft_mint");
        }
        Some(Payload::FtBurn(p)) => {
            touch(&p.owner_id, "ft_burn");
        }
        Some(Payload::FtTransfer(p)) => {
            touch(&p.old_owner_id, "ft_transfer_out");
            touch(&p.new_owner_id, "ft_transfer_in");
        }
        None => {}
    }
}
