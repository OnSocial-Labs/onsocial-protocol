use std::collections::HashMap;
use crate::token_db_out::{write_token_event, accumulate_token_balances};
use crate::pb::token::v1::*;
use crate::pb::token::v1::token_event::Payload;
use substreams_database_change::tables::Tables;

fn make_event(event_type: &str, payload: Payload) -> TokenEvent {
    TokenEvent {
        id: format!("test-{}", event_type),
        block_height: 100,
        block_timestamp: 1000,
        receipt_id: "receipt123".to_string(),
        event_type: event_type.to_string(),
        payload: Some(payload),
    }
}

#[test]
fn test_write_ft_mint_event() {
    let mut tables = Tables::new();
    let event = make_event("ft_mint", Payload::FtMint(FtMint {
        owner_id: "alice.near".to_string(),
        amount: "1000".to_string(),
        memo: "Initial mint".to_string(),
    }));
    write_token_event(&mut tables, &event);
    let changes = tables.to_database_changes();
    assert_eq!(changes.table_changes.len(), 1);
    assert_eq!(changes.table_changes[0].table, "token_events");
}

#[test]
fn test_write_ft_transfer_event() {
    let mut tables = Tables::new();
    let event = make_event("ft_transfer", Payload::FtTransfer(FtTransfer {
        old_owner_id: "alice.near".to_string(),
        new_owner_id: "bob.near".to_string(),
        amount: "500".to_string(),
        memo: "payment".to_string(),
    }));
    write_token_event(&mut tables, &event);
    let changes = tables.to_database_changes();
    assert_eq!(changes.table_changes.len(), 1);
}

#[test]
fn test_update_balances_ft_mint() {
    let mut accum = HashMap::new();
    let event = make_event("ft_mint", Payload::FtMint(FtMint {
        owner_id: "alice.near".to_string(),
        amount: "1000".to_string(),
        memo: "".to_string(),
    }));
    accumulate_token_balances(&mut accum, &event);

    let mut tables = Tables::new();
    for (account_id, state) in &accum {
        let row = tables.create_row("token_balances", account_id);
        row.set("account_id", account_id);
        row.set("last_event_type", &state.last_event_type);
    }
    let changes = tables.to_database_changes();
    assert_eq!(changes.table_changes.len(), 1);
    assert_eq!(changes.table_changes[0].table, "token_balances");
}

#[test]
fn test_update_balances_ft_transfer_creates_two_rows() {
    let mut accum = HashMap::new();
    let event = make_event("ft_transfer", Payload::FtTransfer(FtTransfer {
        old_owner_id: "alice.near".to_string(),
        new_owner_id: "bob.near".to_string(),
        amount: "100".to_string(),
        memo: "".to_string(),
    }));
    accumulate_token_balances(&mut accum, &event);

    let mut tables = Tables::new();
    for (account_id, state) in &accum {
        let row = tables.create_row("token_balances", account_id);
        row.set("account_id", account_id);
        row.set("last_event_type", &state.last_event_type);
    }
    let changes = tables.to_database_changes();
    // Should create balance rows for both sender and receiver
    assert_eq!(changes.table_changes.len(), 2);
}

#[test]
fn test_update_balances_skips_empty_owner() {
    let mut accum = HashMap::new();
    let event = make_event("ft_mint", Payload::FtMint(FtMint {
        owner_id: "".to_string(),
        amount: "1000".to_string(),
        memo: "".to_string(),
    }));
    accumulate_token_balances(&mut accum, &event);
    assert_eq!(accum.len(), 0);
}
