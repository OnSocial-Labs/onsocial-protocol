use crate::core_db_out::{
    apply_posts_current, apply_reactions_current, apply_saves_current, bare_save_content_path,
    core_db_out_impl,
};
use crate::pb::core_onsocial::v1::{DataUpdate, Output};
use substreams_database_change::pb::database::table_change::Operation;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;

fn make_update(data_type: &str, operation: &str) -> DataUpdate {
    DataUpdate {
        id: format!("test-0-{data_type}-{operation}"),
        block_height: 100,
        block_timestamp: 1_000_000_000,
        receipt_id: "receipt_test".to_string(),
        operation: operation.to_string(),
        author: "alice.near".to_string(),
        account_id: "alice.near".to_string(),
        data_type: data_type.to_string(),
        data_id: "post1".to_string(),
        path: "alice.near/post/post1".to_string(),
        value: r#"{"text":"hello"}"#.to_string(),
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

fn find_table_op(changes: &DatabaseChanges, table: &str) -> Option<Operation> {
    changes
        .table_changes
        .iter()
        .find(|tc| tc.table == table)
        .map(|tc| tc.operation())
}

fn count_table_rows(changes: &DatabaseChanges, table: &str) -> usize {
    changes
        .table_changes
        .iter()
        .filter(|tc| tc.table == table)
        .count()
}

#[test]
fn bare_save_content_path_strips_account_prefix() {
    assert_eq!(
        bare_save_content_path("alice.near/saved/bob.near/post/1"),
        "bob.near/post/1"
    );
    assert_eq!(
        bare_save_content_path("saved/bob.near/post/1"),
        "bob.near/post/1"
    );
    assert_eq!(
        bare_save_content_path("scarce/collection/track/1"),
        "scarce/collection/track/1"
    );
}

#[test]
fn post_set_upserts_posts_current() {
    let mut tables = Tables::new();
    let mut update = make_update("post", "set");
    update.channel = "main".into();
    update.kind = "text".into();
    update.parent_path = "bob.near/post/root".into();

    apply_posts_current(&mut tables, &update);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "posts_current"), 1);
    assert_eq!(find_table_op(&changes, "posts_current"), Some(Operation::Upsert));
    assert_eq!(
        find_field(&changes, "posts_current", "post_id"),
        Some("post1")
    );
    assert_eq!(
        find_field(&changes, "posts_current", "channel"),
        Some("main")
    );
    assert_eq!(
        find_field(&changes, "posts_current", "parent_path"),
        Some("bob.near/post/root")
    );
}

#[test]
fn post_remove_deletes_posts_current() {
    let mut tables = Tables::new();
    let update = make_update("post", "remove");

    apply_posts_current(&mut tables, &update);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "posts_current"), 1);
    assert_eq!(find_table_op(&changes, "posts_current"), Some(Operation::Delete));
}

#[test]
fn reaction_set_and_remove_upsert_operation() {
    let mut tables = Tables::new();
    let mut set = make_update("reaction", "set");
    set.path = "alice.near/reaction/bob.near/love/bob.near/post/1".into();
    set.target_account = "bob.near".into();
    set.reaction_kind = "love".into();

    apply_reactions_current(&mut tables, &set);
    let changes = tables.to_database_changes();
    assert_eq!(
        find_field(&changes, "reactions_current", "operation"),
        Some("set")
    );
    assert_eq!(
        find_field(&changes, "reactions_current", "post_owner"),
        Some("bob.near")
    );
    assert_eq!(find_table_op(&changes, "reactions_current"), Some(Operation::Upsert));

    let mut tables = Tables::new();
    let mut remove = set.clone();
    remove.operation = "remove".into();
    apply_reactions_current(&mut tables, &remove);
    let changes = tables.to_database_changes();
    assert_eq!(
        find_field(&changes, "reactions_current", "operation"),
        Some("remove")
    );
    assert_eq!(find_table_op(&changes, "reactions_current"), Some(Operation::Upsert));
}

#[test]
fn save_strips_path_and_upserts() {
    let mut tables = Tables::new();
    let mut update = make_update("saved", "set");
    update.path = "alice.near/saved/bob.near/post/42".into();

    apply_saves_current(&mut tables, &update);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "saves_current"), 1);
    assert_eq!(
        find_field(&changes, "saves_current", "content_path"),
        Some("bob.near/post/42")
    );
    assert_eq!(
        find_field(&changes, "saves_current", "operation"),
        Some("set")
    );
    assert_eq!(find_table_op(&changes, "saves_current"), Some(Operation::Upsert));
}

#[test]
fn core_db_out_impl_materializes_post_alongside_data_updates() {
    let update = make_update("post", "set");
    let changes = core_db_out_impl(Output {
        data_updates: vec![update],
        ..Default::default()
    });

    assert_eq!(count_table_rows(&changes, "data_updates"), 1);
    assert_eq!(count_table_rows(&changes, "posts_current"), 1);
}
