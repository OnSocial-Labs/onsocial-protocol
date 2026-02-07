//! Database Changes module for staking events
//!
//! Converts StakingOutput to DatabaseChanges for substreams-sink-sql.
//! Writes to: staking_events, staker_state, credit_purchases

use std::collections::HashMap;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;
use crate::pb::staking::v1::*;
use crate::pb::staking::v1::staking_event::Payload;

/// Accumulated staker state fields (one entry per account per block scope).
#[derive(Default)]
pub(crate) struct StakerStateAccum {
    pub(crate) locked_amount: Option<String>,
    pub(crate) effective_stake: Option<String>,
    pub(crate) lock_months: Option<u64>,
    pub(crate) total_claimed: Option<String>,
    pub(crate) total_credits_purchased: Option<String>,
    pub(crate) last_event_type: String,
    pub(crate) last_event_block: String,
    pub(crate) updated_at: String,
}

#[substreams::handlers::map]
pub fn staking_db_out(output: StakingOutput) -> Result<DatabaseChanges, substreams::errors::Error> {
    let mut tables = Tables::new();
    let mut staker_accum: HashMap<String, StakerStateAccum> = HashMap::new();

    for event in &output.events {
        // 1. Write every event to staking_events
        write_staking_event(&mut tables, event);

        // 2. Accumulate staker_state updates (dedup by account_id)
        accumulate_staker_state(&mut staker_accum, event);

        // 3. Write credit purchases to dedicated table
        if event.event_type == "CREDITS_PURCHASE" {
            write_credit_purchase(&mut tables, event);
        }
    }

    // 4. Flush one staker_state row per account
    for (account_id, state) in &staker_accum {
        let row = tables.create_row("staker_state", account_id);
        row.set("account_id", account_id);
        row.set("last_event_type", &state.last_event_type);
        row.set("last_event_block", &state.last_event_block);
        row.set("updated_at", &state.updated_at);
        if let Some(v) = &state.locked_amount { row.set("locked_amount", v); }
        if let Some(v) = &state.effective_stake { row.set("effective_stake", v); }
        if let Some(v) = &state.lock_months { row.set("lock_months", *v); }
        if let Some(v) = &state.total_claimed { row.set("total_claimed", v); }
        if let Some(v) = &state.total_credits_purchased { row.set("total_credits_purchased", v); }
    }

    Ok(tables.to_database_changes())
}

pub(crate) fn write_staking_event(tables: &mut Tables, event: &StakingEvent) {
    let row = tables.create_row("staking_events", &event.id);

    row.set("block_height", event.block_height);
    row.set("block_timestamp", event.block_timestamp);
    row.set("receipt_id", &event.receipt_id);
    row.set("account_id", &event.account_id);
    row.set("event_type", &event.event_type);
    row.set("success", event.success);

    match &event.payload {
        Some(Payload::StakeLock(p)) => {
            row.set("amount", &p.amount);
            row.set("months", p.months);
            row.set("effective_stake", &p.effective_stake);
        }
        Some(Payload::StakeExtend(p)) => {
            row.set("new_months", p.new_months);
            row.set("new_effective", &p.new_effective);
        }
        Some(Payload::StakeUnlock(p)) => {
            row.set("amount", &p.amount);
        }
        Some(Payload::RewardsReleased(p)) => {
            row.set("amount", &p.amount);
            row.set("elapsed_ns", &p.elapsed_ns);
            row.set("total_released", &p.total_released);
            row.set("remaining_pool", &p.remaining_pool);
        }
        Some(Payload::RewardsClaim(p)) => {
            row.set("amount", &p.amount);
        }
        Some(Payload::CreditsPurchase(p)) => {
            row.set("amount", &p.amount);
            row.set("infra_share", &p.infra_share);
            row.set("rewards_share", &p.rewards_share);
        }
        Some(Payload::ScheduledFund(p)) => {
            row.set("amount", &p.amount);
            row.set("total_pool", &p.total_pool);
        }
        Some(Payload::InfraWithdraw(p)) => {
            row.set("amount", &p.amount);
            row.set("receiver_id", &p.receiver_id);
        }
        Some(Payload::OwnerChanged(p)) => {
            row.set("old_owner", &p.old_owner);
            row.set("new_owner", &p.new_owner);
        }
        Some(Payload::ContractUpgrade(p)) => {
            row.set("old_version", p.old_version);
            row.set("new_version", p.new_version);
        }
        Some(Payload::StorageDeposit(p)) => {
            row.set("deposit", &p.deposit);
        }
        Some(Payload::UnlockFailed(p)) => {
            row.set("amount", &p.amount);
        }
        Some(Payload::ClaimFailed(p)) => {
            row.set("amount", &p.amount);
        }
        Some(Payload::WithdrawInfraFailed(p)) => {
            row.set("amount", &p.amount);
        }
        None => {}
    }
}

pub(crate) fn accumulate_staker_state(accum: &mut HashMap<String, StakerStateAccum>, event: &StakingEvent) {
    match &event.payload {
        Some(Payload::StakeLock(p)) => {
            let entry = accum.entry(event.account_id.clone()).or_default();
            entry.last_event_type = event.event_type.clone();
            entry.last_event_block = event.block_height.to_string();
            entry.updated_at = event.block_timestamp.to_string();
            entry.locked_amount = Some(p.amount.clone());
            entry.effective_stake = Some(p.effective_stake.clone());
            entry.lock_months = Some(p.months);
        }
        Some(Payload::StakeExtend(p)) => {
            let entry = accum.entry(event.account_id.clone()).or_default();
            entry.last_event_type = event.event_type.clone();
            entry.last_event_block = event.block_height.to_string();
            entry.updated_at = event.block_timestamp.to_string();
            entry.effective_stake = Some(p.new_effective.clone());
            entry.lock_months = Some(p.new_months);
        }
        Some(Payload::StakeUnlock(_p)) => {
            let entry = accum.entry(event.account_id.clone()).or_default();
            entry.last_event_type = event.event_type.clone();
            entry.last_event_block = event.block_height.to_string();
            entry.updated_at = event.block_timestamp.to_string();
            entry.locked_amount = Some("0".to_string());
            entry.effective_stake = Some("0".to_string());
            entry.lock_months = Some(0);
        }
        Some(Payload::RewardsClaim(p)) => {
            let entry = accum.entry(event.account_id.clone()).or_default();
            entry.last_event_type = event.event_type.clone();
            entry.last_event_block = event.block_height.to_string();
            entry.updated_at = event.block_timestamp.to_string();
            entry.total_claimed = Some(p.amount.clone());
        }
        Some(Payload::CreditsPurchase(p)) => {
            let entry = accum.entry(event.account_id.clone()).or_default();
            entry.last_event_type = event.event_type.clone();
            entry.last_event_block = event.block_height.to_string();
            entry.updated_at = event.block_timestamp.to_string();
            entry.total_credits_purchased = Some(p.amount.clone());
        }
        Some(Payload::UnlockFailed(_)) => {
            // Rollback: state restored in contract, staker_state unchanged
        }
        _ => {}
    }
}

pub(crate) fn write_credit_purchase(tables: &mut Tables, event: &StakingEvent) {
    if let Some(Payload::CreditsPurchase(p)) = &event.payload {
        let row = tables.create_row("credit_purchases", &event.id);
        row.set("block_height", event.block_height);
        row.set("block_timestamp", event.block_timestamp);
        row.set("receipt_id", &event.receipt_id);
        row.set("account_id", &event.account_id);
        row.set("amount", &p.amount);
        row.set("infra_share", &p.infra_share);
        row.set("rewards_share", &p.rewards_share);
    }
}
