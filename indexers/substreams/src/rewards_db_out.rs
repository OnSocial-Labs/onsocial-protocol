//! Database Changes module for rewards events
//!
//! Converts RewardsOutput to DatabaseChanges for substreams-sink-sql.
//! Writes to: rewards_events, user_reward_state

use crate::pb::rewards::v1::rewards_event::Payload;
use crate::pb::rewards::v1::*;
use std::collections::HashMap;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;

/// Accumulated user reward state (one entry per account per block scope).
#[derive(Default)]
pub(crate) struct UserRewardAccum {
    pub(crate) total_earned: Option<String>,
    pub(crate) total_claimed: Option<String>,
    pub(crate) last_credit_block: Option<String>,
    pub(crate) last_claim_block: Option<String>,
    pub(crate) updated_at: String,
}

#[substreams::handlers::map]
pub fn rewards_db_out(output: RewardsOutput) -> Result<DatabaseChanges, substreams::errors::Error> {
    Ok(rewards_db_out_impl(output))
}

/// Core logic shared by both per-contract and combined db_out.
pub(crate) fn rewards_db_out_impl(output: RewardsOutput) -> DatabaseChanges {
    let mut tables = Tables::new();
    let mut user_accum: HashMap<String, UserRewardAccum> = HashMap::new();

    for event in &output.events {
        write_rewards_event(&mut tables, event);
        accumulate_user_state(&mut user_accum, event);
    }

    for (account_id, state) in &user_accum {
        let row = tables.upsert_row("user_reward_state", account_id);
        row.set("account_id", account_id);
        row.set("updated_at", &state.updated_at);
        if let Some(v) = &state.total_earned {
            row.set("total_earned", v);
        }
        if let Some(v) = &state.total_claimed {
            row.set("total_claimed", v);
        }
        if let Some(v) = &state.last_credit_block {
            row.set("last_credit_block", v);
        }
        if let Some(v) = &state.last_claim_block {
            row.set("last_claim_block", v);
        }
    }

    tables.to_database_changes()
}

pub(crate) fn write_rewards_event(tables: &mut Tables, event: &RewardsEvent) {
    let row = tables.create_row("rewards_events", &event.id);

    row.set("block_height", event.block_height);
    row.set("block_timestamp", event.block_timestamp);
    row.set("receipt_id", &event.receipt_id);
    row.set("account_id", &event.account_id);
    row.set("event_type", &event.event_type);
    row.set("success", event.success);

    match &event.payload {
        Some(Payload::RewardCredited(p)) => {
            row.set("amount", &p.amount);
            row.set("source", &p.source);
            row.set("credited_by", &p.credited_by);
            row.set("app_id", &p.app_id);
        }
        Some(Payload::RewardClaimed(p)) => {
            row.set("amount", &p.amount);
        }
        Some(Payload::ClaimFailed(p)) => {
            row.set("amount", &p.amount);
        }
        Some(Payload::PoolDeposit(p)) => {
            row.set("amount", &p.amount);
            row.set("new_balance", &p.new_balance);
        }
        Some(Payload::OwnerChanged(p)) => {
            row.set("old_owner", &p.old_owner);
            row.set("new_owner", &p.new_owner);
        }
        Some(Payload::MaxDailyUpdated(p)) => {
            row.set("old_max", &p.old_max);
            row.set("new_max", &p.new_max);
        }
        Some(Payload::ExecutorAdded(p)) => {
            row.set("executor", &p.executor);
        }
        Some(Payload::ExecutorRemoved(p)) => {
            row.set("executor", &p.executor);
        }
        Some(Payload::CallerAdded(p)) => {
            row.set("caller", &p.caller);
        }
        Some(Payload::CallerRemoved(p)) => {
            row.set("caller", &p.caller);
        }
        Some(Payload::ContractUpgrade(p)) => {
            row.set("old_version", &p.old_version);
            row.set("new_version", &p.new_version);
        }
        Some(Payload::UnknownEvent(p)) => {
            row.set("extra_data", &p.extra_data);
        }
        None => {}
    }
}

pub(crate) fn accumulate_user_state(
    accum: &mut HashMap<String, UserRewardAccum>,
    event: &RewardsEvent,
) {
    match &event.payload {
        Some(Payload::RewardCredited(p)) => {
            let entry = accum.entry(event.account_id.clone()).or_default();
            entry.updated_at = event.block_timestamp.to_string();
            entry.total_earned = Some(p.amount.clone());
            entry.last_credit_block = Some(event.block_height.to_string());
        }
        Some(Payload::RewardClaimed(p)) => {
            let entry = accum.entry(event.account_id.clone()).or_default();
            entry.updated_at = event.block_timestamp.to_string();
            entry.total_claimed = Some(p.amount.clone());
            entry.last_claim_block = Some(event.block_height.to_string());
        }
        _ => {}
    }
}
