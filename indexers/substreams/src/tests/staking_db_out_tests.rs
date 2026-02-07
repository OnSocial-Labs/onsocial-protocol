use std::collections::HashMap;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;
use crate::pb::staking::v1::*;
use crate::pb::staking::v1::staking_event::Payload;
use crate::staking_db_out::{write_staking_event, accumulate_staker_state, write_credit_purchase};

fn make_event(event_type: &str, account_id: &str, payload: Payload) -> StakingEvent {
    StakingEvent {
        id: format!("test-0-{}", event_type),
        block_height: 100,
        block_timestamp: 1_000_000_000,
        receipt_id: "receipt_test".to_string(),
        account_id: account_id.to_string(),
        event_type: event_type.to_string(),
        success: !event_type.contains("FAILED"),
        payload: Some(payload),
    }
}

fn find_field<'a>(changes: &'a DatabaseChanges, table: &str, field_name: &str) -> Option<&'a str> {
    changes.table_changes.iter()
        .find(|tc| tc.table == table)
        .and_then(|tc| tc.fields.iter().find(|f| f.name == field_name))
        .map(|f| f.new_value.as_str())
}

fn count_table_rows(changes: &DatabaseChanges, table: &str) -> usize {
    changes.table_changes.iter().filter(|tc| tc.table == table).count()
}

#[test]
fn test_write_staking_event_columns() {
    let mut tables = Tables::new();
    let event = make_event("STAKE_LOCK", "alice.near", Payload::StakeLock(StakeLock {
        amount: "75000000000000000000".to_string(),
        months: 48,
        effective_stake: "112500000000000000000".to_string(),
    }));

    write_staking_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "staking_events"), 1);
    assert_eq!(find_field(&changes, "staking_events", "account_id"), Some("alice.near"));
    assert_eq!(find_field(&changes, "staking_events", "event_type"), Some("STAKE_LOCK"));
    assert_eq!(find_field(&changes, "staking_events", "amount"), Some("75000000000000000000"));
    assert_eq!(find_field(&changes, "staking_events", "block_height"), Some("100"));
}

#[test]
fn test_update_staker_state_lock_vs_unlock() {
    // STAKE_LOCK creates staker_state with locked amounts
    let mut accum = HashMap::new();
    let lock_event = make_event("STAKE_LOCK", "alice.near", Payload::StakeLock(StakeLock {
        amount: "100".to_string(),
        months: 12,
        effective_stake: "120".to_string(),
    }));
    accumulate_staker_state(&mut accum, &lock_event);

    // Flush to tables
    let mut tables = Tables::new();
    for (account_id, state) in &accum {
        let row = tables.create_row("staker_state", account_id);
        row.set("account_id", account_id);
        row.set("last_event_type", &state.last_event_type);
        if let Some(v) = &state.locked_amount { row.set("locked_amount", v); }
        if let Some(v) = &state.effective_stake { row.set("effective_stake", v); }
    }
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "staker_state"), 1);
    assert_eq!(find_field(&changes, "staker_state", "locked_amount"), Some("100"));
    assert_eq!(find_field(&changes, "staker_state", "effective_stake"), Some("120"));

    // STAKE_UNLOCK zeros out
    let mut accum2 = HashMap::new();
    let unlock_event = make_event("STAKE_UNLOCK", "alice.near", Payload::StakeUnlock(StakeUnlock {
        amount: "100".to_string(),
    }));
    accumulate_staker_state(&mut accum2, &unlock_event);

    let mut tables2 = Tables::new();
    for (account_id, state) in &accum2 {
        let row = tables2.create_row("staker_state", account_id);
        row.set("account_id", account_id);
        if let Some(v) = &state.locked_amount { row.set("locked_amount", v); }
        if let Some(v) = &state.effective_stake { row.set("effective_stake", v); }
    }
    let changes2 = tables2.to_database_changes();

    assert_eq!(find_field(&changes2, "staker_state", "locked_amount"), Some("0"));
    assert_eq!(find_field(&changes2, "staker_state", "effective_stake"), Some("0"));
}

#[test]
fn test_write_credit_purchase_table() {
    let mut tables = Tables::new();
    let event = make_event("CREDITS_PURCHASE", "buyer.near", Payload::CreditsPurchase(CreditsPurchase {
        amount: "1000".to_string(),
        infra_share: "600".to_string(),
        rewards_share: "400".to_string(),
    }));

    write_credit_purchase(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "credit_purchases"), 1);
    assert_eq!(find_field(&changes, "credit_purchases", "account_id"), Some("buyer.near"));
    assert_eq!(find_field(&changes, "credit_purchases", "amount"), Some("1000"));
    assert_eq!(find_field(&changes, "credit_purchases", "infra_share"), Some("600"));
    assert_eq!(find_field(&changes, "credit_purchases", "rewards_share"), Some("400"));
}

#[test]
fn test_non_state_event_skips_staker_state() {
    let mut accum = HashMap::new();
    let event = make_event("INFRA_WITHDRAW", "owner.near", Payload::InfraWithdraw(InfraWithdraw {
        amount: "500".to_string(),
        receiver_id: "treasury.near".to_string(),
    }));

    accumulate_staker_state(&mut accum, &event);

    assert_eq!(accum.len(), 0, "INFRA_WITHDRAW should not create staker_state");
}
