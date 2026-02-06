//! Database Changes module for staking events
//!
//! Converts StakingOutput to DatabaseChanges for substreams-sink-sql.
//! Writes to: staking_events, staker_state, credit_purchases

use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;
use crate::pb::staking::v1::*;
use crate::pb::staking::v1::staking_event::Payload;

#[substreams::handlers::map]
pub fn staking_db_out(output: StakingOutput) -> Result<DatabaseChanges, substreams::errors::Error> {
    let mut tables = Tables::new();

    for event in &output.events {
        // 1. Write every event to staking_events
        write_staking_event(&mut tables, event);

        // 2. Update staker_state for relevant events
        update_staker_state(&mut tables, event);

        // 3. Write credit purchases to dedicated table
        if event.event_type == "CREDITS_PURCHASE" {
            write_credit_purchase(&mut tables, event);
        }
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

pub(crate) fn update_staker_state(tables: &mut Tables, event: &StakingEvent) {
    match &event.payload {
        Some(Payload::StakeLock(p)) => {
            let row = tables.create_row("staker_state", &event.account_id);
            row.set("account_id", &event.account_id);
            row.set("locked_amount", &p.amount);
            row.set("effective_stake", &p.effective_stake);
            row.set("lock_months", p.months);
            row.set("last_event_type", &event.event_type);
            row.set("last_event_block", event.block_height);
            row.set("updated_at", event.block_timestamp);
        }
        Some(Payload::StakeExtend(p)) => {
            let row = tables.create_row("staker_state", &event.account_id);
            row.set("account_id", &event.account_id);
            row.set("effective_stake", &p.new_effective);
            row.set("lock_months", p.new_months);
            row.set("last_event_type", &event.event_type);
            row.set("last_event_block", event.block_height);
            row.set("updated_at", event.block_timestamp);
        }
        Some(Payload::StakeUnlock(p)) => {
            let row = tables.create_row("staker_state", &event.account_id);
            row.set("account_id", &event.account_id);
            row.set("locked_amount", "0");
            row.set("effective_stake", "0");
            row.set("lock_months", 0u64);
            row.set("last_event_type", &event.event_type);
            row.set("last_event_block", event.block_height);
            row.set("updated_at", event.block_timestamp);
            // amount field for audit trail
            let _ = p;
        }
        Some(Payload::RewardsClaim(p)) => {
            let row = tables.create_row("staker_state", &event.account_id);
            row.set("account_id", &event.account_id);
            row.set("total_claimed", &p.amount);
            row.set("last_event_type", &event.event_type);
            row.set("last_event_block", event.block_height);
            row.set("updated_at", event.block_timestamp);
        }
        Some(Payload::CreditsPurchase(p)) => {
            let row = tables.create_row("staker_state", &event.account_id);
            row.set("account_id", &event.account_id);
            row.set("total_credits_purchased", &p.amount);
            row.set("last_event_type", &event.event_type);
            row.set("last_event_block", event.block_height);
            row.set("updated_at", event.block_timestamp);
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
