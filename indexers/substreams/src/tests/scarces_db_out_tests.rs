use crate::pb::scarces::v1::*;
use crate::scarces_db_out::write_scarces_event;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;

fn make_event(event_type: &str, operation: &str) -> ScarcesEvent {
    ScarcesEvent {
        id: format!("test-0-{}-{}", event_type, operation),
        block_height: 100,
        block_timestamp: 1_000_000_000,
        receipt_id: "receipt_test".to_string(),
        event_type: event_type.to_string(),
        operation: operation.to_string(),
        author: "alice.near".to_string(),
        token_id: "t1".to_string(),
        collection_id: "col-1".to_string(),
        listing_id: "ll-1".to_string(),
        owner_id: "alice.near".to_string(),
        buyer_id: "buyer.near".to_string(),
        seller_id: "seller.near".to_string(),
        price: "5000".to_string(),
        marketplace_fee: "250".to_string(),
        app_pool_amount: "100".to_string(),
        app_id: "my_app".to_string(),
        extra_data: r#"{"operation":"test"}"#.to_string(),
        ..Default::default()
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

// ─── Core column mapping ───────────────────────────────────────────

#[test]
fn test_write_scarces_event_core_columns() {
    let mut tables = Tables::new();
    let event = make_event("SCARCE_UPDATE", "list");

    write_scarces_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_events"), 1);
    assert_eq!(
        find_field(&changes, "scarces_events", "event_type"),
        Some("SCARCE_UPDATE")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "operation"),
        Some("list")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "author"),
        Some("alice.near")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "receipt_id"),
        Some("receipt_test")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "block_height"),
        Some("100")
    );
}

// ─── Identity columns ──────────────────────────────────────────────

#[test]
fn test_write_scarces_event_identity_columns() {
    let mut tables = Tables::new();
    let event = make_event("SCARCE_UPDATE", "purchase");

    write_scarces_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field(&changes, "scarces_events", "owner_id"),
        Some("alice.near")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "buyer_id"),
        Some("buyer.near")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "seller_id"),
        Some("seller.near")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "token_id"),
        Some("t1")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "collection_id"),
        Some("col-1")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "listing_id"),
        Some("ll-1")
    );
}

// ─── Financial columns ─────────────────────────────────────────────

#[test]
fn test_write_scarces_event_financial_columns() {
    let mut tables = Tables::new();
    let event = make_event("SCARCE_UPDATE", "purchase");

    write_scarces_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field(&changes, "scarces_events", "price"),
        Some("5000")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "marketplace_fee"),
        Some("250")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "app_pool_amount"),
        Some("100")
    );
}

// ─── Auction columns ───────────────────────────────────────────────

#[test]
fn test_write_scarces_event_auction_columns() {
    let mut tables = Tables::new();
    let mut event = make_event("SCARCE_UPDATE", "auction_created");
    event.reserve_price = "1000".to_string();
    event.buy_now_price = "5000".to_string();
    event.min_bid_increment = "100".to_string();
    event.expires_at = 1700000000000000000;
    event.anti_snipe_extension_ns = 300000000000;

    write_scarces_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field(&changes, "scarces_events", "reserve_price"),
        Some("1000")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "buy_now_price"),
        Some("5000")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "min_bid_increment"),
        Some("100")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "expires_at"),
        Some("1700000000000000000")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "anti_snipe_extension_ns"),
        Some("300000000000")
    );
}

// ─── App pool columns ──────────────────────────────────────────────

#[test]
fn test_write_scarces_event_app_pool_columns() {
    let mut tables = Tables::new();
    let mut event = make_event("APP_POOL_UPDATE", "register");
    event.app_id = "my_app".to_string();
    event.funder = "funder.near".to_string();
    event.initial_balance = "0".to_string();

    write_scarces_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field(&changes, "scarces_events", "app_id"),
        Some("my_app")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "funder"),
        Some("funder.near")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "initial_balance"),
        Some("0")
    );
}

// ─── Extra data catch-all ──────────────────────────────────────────

#[test]
fn test_write_scarces_event_extra_data() {
    let mut tables = Tables::new();
    let event = make_event("SCARCE_UPDATE", "list");

    write_scarces_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field(&changes, "scarces_events", "extra_data"),
        Some(r#"{"operation":"test"}"#)
    );
}

// ─── Multiple events ───────────────────────────────────────────────

#[test]
fn test_write_multiple_events() {
    let mut tables = Tables::new();
    let event1 = make_event("SCARCE_UPDATE", "list");
    let mut event2 = make_event("COLLECTION_UPDATE", "create");
    event2.id = "test-1-COLLECTION_UPDATE-create".to_string();

    write_scarces_event(&mut tables, &event1);
    write_scarces_event(&mut tables, &event2);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_events"), 2);
}

// ─── Default (empty) fields ────────────────────────────────────────

#[test]
fn test_write_scarces_event_empty_defaults() {
    let mut tables = Tables::new();
    let event = ScarcesEvent {
        id: "test-0-SCARCE_UPDATE-list".to_string(),
        block_height: 1,
        block_timestamp: 1,
        receipt_id: "r".to_string(),
        event_type: "SCARCE_UPDATE".to_string(),
        operation: "list".to_string(),
        author: "a".to_string(),
        ..Default::default()
    };

    write_scarces_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    // Empty strings for unset fields
    assert_eq!(find_field(&changes, "scarces_events", "bidder"), Some(""));
    assert_eq!(
        find_field(&changes, "scarces_events", "winner_id"),
        Some("")
    );
    assert_eq!(find_field(&changes, "scarces_events", "memo"), Some(""));
    // Zero for unset numeric fields
    assert_eq!(
        find_field(&changes, "scarces_events", "quantity"),
        Some("0")
    );
    assert_eq!(
        find_field(&changes, "scarces_events", "expires_at"),
        Some("0")
    );
}
