use crate::pb::rewards::v1::rewards_event::Payload;
use crate::pb::rewards::v1::*;
use crate::rewards_db_out::{accumulate_user_state, write_rewards_event};
use std::collections::HashMap;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;

fn make_event(event_type: &str, account_id: &str, payload: Payload) -> RewardsEvent {
    RewardsEvent {
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
    changes
        .table_changes
        .iter()
        .find(|tc| tc.table == table)
        .and_then(|tc| tc.fields.iter().find(|f| f.name == field_name))
        .map(|f| f.new_value.as_str())
}

fn count_table_rows(changes: &DatabaseChanges, table: &str) -> usize {
    changes
        .table_changes
        .iter()
        .filter(|tc| tc.table == table)
        .count()
}

#[test]
fn test_write_rewards_event_columns() {
    let mut tables = Tables::new();
    let event = make_event(
        "REWARD_CREDITED",
        "alice.near",
        Payload::RewardCredited(RewardCredited {
            amount: "1000000000000000000".to_string(),
            source: "boost".to_string(),
            credited_by: "executor.near".to_string(),
            app_id: "portal".to_string(),
        }),
    );

    write_rewards_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "rewards_events"), 1);
    assert_eq!(
        find_field(&changes, "rewards_events", "account_id"),
        Some("alice.near")
    );
    assert_eq!(
        find_field(&changes, "rewards_events", "event_type"),
        Some("REWARD_CREDITED")
    );
    assert_eq!(
        find_field(&changes, "rewards_events", "amount"),
        Some("1000000000000000000")
    );
    assert_eq!(
        find_field(&changes, "rewards_events", "source"),
        Some("boost")
    );
    assert_eq!(
        find_field(&changes, "rewards_events", "app_id"),
        Some("portal")
    );
    assert_eq!(
        find_field(&changes, "rewards_events", "block_height"),
        Some("100")
    );
}

#[test]
fn test_accumulate_user_state_credit() {
    let mut accum = HashMap::new();
    let event = make_event(
        "REWARD_CREDITED",
        "alice.near",
        Payload::RewardCredited(RewardCredited {
            amount: "5000".to_string(),
            source: "boost".to_string(),
            credited_by: "executor.near".to_string(),
            app_id: "portal".to_string(),
        }),
    );
    accumulate_user_state(&mut accum, &event);

    let state = accum.get("alice.near").unwrap();
    assert_eq!(state.total_earned.as_deref(), Some("5000"));
    assert_eq!(state.last_credit_block.as_deref(), Some("100"));
    assert!(state.total_claimed.is_none());
}

#[test]
fn test_accumulate_user_state_claim() {
    let mut accum = HashMap::new();
    let event = make_event(
        "REWARD_CLAIMED",
        "alice.near",
        Payload::RewardClaimed(RewardClaimed {
            amount: "3000".to_string(),
        }),
    );
    accumulate_user_state(&mut accum, &event);

    let state = accum.get("alice.near").unwrap();
    assert_eq!(state.total_claimed.as_deref(), Some("3000"));
    assert_eq!(state.last_claim_block.as_deref(), Some("100"));
    assert!(state.total_earned.is_none());
}

#[test]
fn test_non_state_event_skips_user_state() {
    let mut accum = HashMap::new();
    let event = make_event(
        "OWNER_CHANGED",
        "owner.near",
        Payload::OwnerChanged(OwnerChanged {
            old_owner: "old.near".to_string(),
            new_owner: "new.near".to_string(),
        }),
    );

    accumulate_user_state(&mut accum, &event);

    assert_eq!(
        accum.len(),
        0,
        "OWNER_CHANGED should not create user_reward_state"
    );
}

#[test]
fn test_write_claim_failed_event() {
    let mut tables = Tables::new();
    let event = make_event(
        "CLAIM_FAILED",
        "alice.near",
        Payload::ClaimFailed(ClaimFailed {
            amount: "100".to_string(),
        }),
    );

    write_rewards_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "rewards_events"), 1);
    assert_eq!(
        find_field(&changes, "rewards_events", "success"),
        Some("false")
    );
    assert_eq!(
        find_field(&changes, "rewards_events", "amount"),
        Some("100")
    );
}

#[test]
fn test_write_pool_deposit_event() {
    let mut tables = Tables::new();
    let event = make_event(
        "POOL_DEPOSIT",
        "funder.near",
        Payload::PoolDeposit(PoolDeposit {
            amount: "10000".to_string(),
            new_balance: "50000".to_string(),
        }),
    );

    write_rewards_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field(&changes, "rewards_events", "amount"),
        Some("10000")
    );
    assert_eq!(
        find_field(&changes, "rewards_events", "new_balance"),
        Some("50000")
    );
}
