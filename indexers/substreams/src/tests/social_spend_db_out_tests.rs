use crate::pb::social_spend::v1::*;
use crate::social_spend_db_out::write_social_spend_event;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;

fn make_event(event_type: &str) -> SocialSpendEvent {
    SocialSpendEvent {
        id: format!("test-0-{event_type}"),
        block_height: 100,
        block_timestamp: 1_000_000_000,
        receipt_id: "receipt_test".to_string(),
        account_id: "alice.near".to_string(),
        event_type: event_type.to_string(),
        success: event_type != "SOCIAL_TRANSFER_FAILED",
        spender_id: "alice.near".to_string(),
        amount: "1000000000000000000".to_string(),
        app_id: "portal".to_string(),
        action: "join_rally".to_string(),
        target_type: "rally".to_string(),
        target_id: "season0".to_string(),
        season_id: "season0".to_string(),
        tag: "first-spend".to_string(),
        treasury_amount: "100000000000000000".to_string(),
        season_amount: "900000000000000000".to_string(),
        metadata: r#"{"source":"test"}"#.to_string(),
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

#[test]
fn write_social_spend_event_columns() {
    let mut tables = Tables::new();
    let event = make_event("SOCIAL_SPENT");

    write_social_spend_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(changes.table_changes.len(), 1);
    assert_eq!(
        find_field(&changes, "social_spend_events", "event_type"),
        Some("SOCIAL_SPENT")
    );
    assert_eq!(
        find_field(&changes, "social_spend_events", "account_id"),
        Some("alice.near")
    );
    assert_eq!(
        find_field(&changes, "social_spend_events", "season_amount"),
        Some("900000000000000000")
    );
    assert_eq!(
        find_field(&changes, "social_spend_events", "success"),
        Some("true")
    );
}

#[test]
fn write_failed_transfer_success_flag() {
    let mut tables = Tables::new();
    let event = make_event("SOCIAL_TRANSFER_FAILED");

    write_social_spend_event(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field(&changes, "social_spend_events", "success"),
        Some("false")
    );
}
