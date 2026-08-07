use crate::pb::scarces::v1::*;
use crate::scarces_db_out::{
    apply_active_listing, apply_active_offer, apply_app_pool, apply_collections_current,
    scarces_db_out_impl, write_scarces_event,
};
use substreams_database_change::pb::database::table_change::Operation;
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

fn find_table_op(changes: &DatabaseChanges, table: &str) -> Option<Operation> {
    changes
        .table_changes
        .iter()
        .find(|tc| tc.table == table)
        .map(|tc| tc.operation())
}

fn find_field_for_pk<'a>(
    changes: &'a DatabaseChanges,
    table: &str,
    pk_contains: &str,
    field_name: &str,
) -> Option<&'a str> {
    changes
        .table_changes
        .iter()
        .find(|tc| {
            tc.table == table
                && format!("{:?}", tc.primary_key).contains(pk_contains)
        })
        .and_then(|tc| tc.fields.iter().find(|f| f.name == field_name))
        .map(|f| f.new_value.as_str())
}

#[test]
fn active_listing_lazy_create_upserts_catalog() {
    let mut tables = Tables::new();
    let event = ScarcesEvent {
        id: "r-0-LAZY_LISTING_UPDATE-created".into(),
        block_height: 10,
        block_timestamp: 100,
        receipt_id: "r".into(),
        event_type: "LAZY_LISTING_UPDATE".into(),
        operation: "created".into(),
        author: "creator.near".into(),
        listing_id: "ll:1".into(),
        creator_id: "creator.near".into(),
        price: "1000000000000000000000000".into(),
        extra_data: r#"{"listing_id":"ll:1","creator_id":"creator.near","price":"1000000000000000000000000","copies":3,"title":"Drop","media":"ipfs://x","extra":"{\"sourcePost\":{\"path\":\"a.near/post/1\"},\"theme\":{\"bg\":\"dusk\"}}"}"#.into(),
        ..Default::default()
    };
    apply_active_listing(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_active_listings"), 1);
    assert_eq!(
        find_field_for_pk(&changes, "scarces_active_listings", "lazy:ll:1", "kind"),
        Some("lazy")
    );
    assert_eq!(
        find_field_for_pk(&changes, "scarces_active_listings", "lazy:ll:1", "remaining"),
        Some("3")
    );
    assert_eq!(
        find_field_for_pk(&changes, "scarces_active_listings", "lazy:ll:1", "title"),
        Some("Drop")
    );
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_active_listings",
            "lazy:ll:1",
            "source_post_path"
        ),
        Some("a.near/post/1")
    );
}

#[test]
fn active_listing_purchase_sold_out_deletes() {
    let output = ScarcesOutput {
        block_height: 1,
        block_timestamp: 1,
        block_hash: String::new(),
        events: vec![
            ScarcesEvent {
                id: "r-0-LAZY_LISTING_UPDATE-created".into(),
                block_height: 10,
                block_timestamp: 100,
                receipt_id: "r0".into(),
                event_type: "LAZY_LISTING_UPDATE".into(),
                operation: "created".into(),
                author: "creator.near".into(),
                listing_id: "ll:9".into(),
                creator_id: "creator.near".into(),
                price: "1".into(),
                extra_data: r#"{"listing_id":"ll:9","copies":1,"price":"1"}"#.into(),
                ..Default::default()
            },
            ScarcesEvent {
                id: "r-1-LAZY_LISTING_UPDATE-purchased".into(),
                block_height: 11,
                block_timestamp: 110,
                receipt_id: "r1".into(),
                event_type: "LAZY_LISTING_UPDATE".into(),
                operation: "purchased".into(),
                author: "buyer.near".into(),
                listing_id: "ll:9".into(),
                extra_data: r#"{"listing_id":"ll:9","remaining":0,"minted_count":1}"#.into(),
                ..Default::default()
            },
        ],
    };
    let changes = scarces_db_out_impl(output);
    // Create+delete same key in one block → delete cancels create (Unspecified/skipped)
    // or emits Delete after Upsert. Either way no live upsert of remaining=0.
    let active = changes
        .table_changes
        .iter()
        .filter(|tc| tc.table == "scarces_active_listings")
        .collect::<Vec<_>>();
    assert!(
        active.is_empty()
            || active
                .iter()
                .all(|tc| matches!(tc.operation(), Operation::Delete))
    );
}

#[test]
fn active_listing_purchase_without_prior_create_sets_identity() {
    // Mid-stream catalog tables: purchase can arrive before any create was
    // materialised. Upsert must still set NOT NULL kind/seller_id.
    let mut tables = Tables::new();
    let purchased = ScarcesEvent {
        id: "r-0-LAZY_LISTING_UPDATE-purchased".into(),
        block_height: 260593105,
        block_timestamp: 1784825520231508209,
        receipt_id: "r0".into(),
        event_type: "LAZY_LISTING_UPDATE".into(),
        operation: "purchased".into(),
        author: "buyer.near".into(),
        listing_id: "ll:324".into(),
        creator_id: "seller.near".into(),
        extra_data: r#"{"listing_id":"ll:324","remaining":3,"minted_count":2}"#.into(),
        ..Default::default()
    };
    apply_active_listing(&mut tables, &purchased);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_active_listings",
            "lazy:ll:324",
            "kind"
        ),
        Some("lazy")
    );
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_active_listings",
            "lazy:ll:324",
            "seller_id"
        ),
        Some("seller.near")
    );
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_active_listings",
            "lazy:ll:324",
            "remaining"
        ),
        Some("3")
    );
}

#[test]
fn active_listing_auction_bid_updates_high() {
    let mut tables = Tables::new();
    let created = ScarcesEvent {
        id: "r-0-SCARCE_UPDATE-auction_created".into(),
        block_height: 1,
        block_timestamp: 1,
        receipt_id: "r0".into(),
        event_type: "SCARCE_UPDATE".into(),
        operation: "auction_created".into(),
        author: "seller.near".into(),
        owner_id: "seller.near".into(),
        token_id: "s:7".into(),
        reserve_price: "100".into(),
        extra_data: r#"{"token_id":"s:7","owner_id":"seller.near","reserve_price":"100","title":"Bid me"}"#.into(),
        ..Default::default()
    };
    let bid = ScarcesEvent {
        id: "r-1-SCARCE_UPDATE-auction_bid".into(),
        block_height: 2,
        block_timestamp: 2,
        receipt_id: "r1".into(),
        event_type: "SCARCE_UPDATE".into(),
        operation: "auction_bid".into(),
        author: "bidder.near".into(),
        token_id: "s:7".into(),
        bid_amount: "150".into(),
        bid_count: 1,
        new_expires_at: 999,
        extra_data: r#"{"token_id":"s:7","bid_amount":"150","bid_count":1}"#.into(),
        ..Default::default()
    };
    apply_active_listing(&mut tables, &created);
    apply_active_listing(&mut tables, &bid);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field_for_pk(&changes, "scarces_active_listings", "native:s:7", "kind"),
        Some("auction")
    );
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_active_listings",
            "native:s:7",
            "highest_bid"
        ),
        Some("150")
    );
    assert_eq!(
        find_field_for_pk(&changes, "scarces_active_listings", "native:s:7", "price"),
        Some("150")
    );
}

#[test]
fn active_listing_delist_deletes() {
    let mut tables = Tables::new();
    let listed = ScarcesEvent {
        id: "r-0-SCARCE_UPDATE-list_native".into(),
        block_height: 1,
        block_timestamp: 1,
        receipt_id: "r0".into(),
        event_type: "SCARCE_UPDATE".into(),
        operation: "list_native".into(),
        author: "seller.near".into(),
        owner_id: "seller.near".into(),
        token_id: "s:3".into(),
        price: "5".into(),
        extra_data: r#"{"token_id":"s:3","price":"5"}"#.into(),
        ..Default::default()
    };
    let delist = ScarcesEvent {
        id: "r-1-SCARCE_UPDATE-delist_native".into(),
        block_height: 2,
        block_timestamp: 2,
        receipt_id: "r1".into(),
        event_type: "SCARCE_UPDATE".into(),
        operation: "delist_native".into(),
        author: "seller.near".into(),
        owner_id: "seller.near".into(),
        token_id: "s:3".into(),
        extra_data: r#"{"token_id":"s:3"}"#.into(),
        ..Default::default()
    };
    apply_active_listing(&mut tables, &listed);
    apply_active_listing(&mut tables, &delist);
    let changes = tables.to_database_changes();
    let active = changes
        .table_changes
        .iter()
        .filter(|tc| tc.table == "scarces_active_listings")
        .collect::<Vec<_>>();
    assert!(
        active.is_empty()
            || active
                .iter()
                .all(|tc| matches!(tc.operation(), Operation::Delete))
    );
    let _ = find_table_op(&changes, "scarces_active_listings");
}

#[test]
fn active_offer_made_upserts_catalog() {
    let mut tables = Tables::new();
    let event = ScarcesEvent {
        id: "r-0-OFFER_UPDATE-offer_made".into(),
        block_height: 10,
        block_timestamp: 100,
        receipt_id: "r".into(),
        event_type: "OFFER_UPDATE".into(),
        operation: "offer_made".into(),
        author: "buyer.near".into(),
        buyer_id: "buyer.near".into(),
        token_id: "s:9".into(),
        amount: "2500000000000000000000000".into(),
        expires_at: 999,
        extra_data: r#"{"token_id":"s:9","buyer_id":"buyer.near","amount":"2500000000000000000000000"}"#
            .into(),
        ..Default::default()
    };
    apply_active_offer(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_active_offers"), 1);
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_active_offers",
            "token:s:9:buyer.near",
            "kind"
        ),
        Some("token")
    );
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_active_offers",
            "token:s:9:buyer.near",
            "amount"
        ),
        Some("2500000000000000000000000")
    );
}

#[test]
fn active_offer_accepted_deletes() {
    let mut tables = Tables::new();
    let made = ScarcesEvent {
        id: "r-0-OFFER_UPDATE-offer_made".into(),
        block_height: 1,
        block_timestamp: 1,
        receipt_id: "r0".into(),
        event_type: "OFFER_UPDATE".into(),
        operation: "offer_made".into(),
        author: "buyer.near".into(),
        buyer_id: "buyer.near".into(),
        token_id: "s:9".into(),
        amount: "100".into(),
        extra_data: r#"{"token_id":"s:9","amount":"100"}"#.into(),
        ..Default::default()
    };
    let accepted = ScarcesEvent {
        id: "r-1-OFFER_UPDATE-offer_accepted".into(),
        block_height: 2,
        block_timestamp: 2,
        receipt_id: "r1".into(),
        event_type: "OFFER_UPDATE".into(),
        operation: "offer_accepted".into(),
        author: "buyer.near".into(),
        buyer_id: "buyer.near".into(),
        seller_id: "seller.near".into(),
        token_id: "s:9".into(),
        amount: "100".into(),
        extra_data: r#"{"token_id":"s:9","amount":"100"}"#.into(),
        ..Default::default()
    };
    apply_active_offer(&mut tables, &made);
    apply_active_offer(&mut tables, &accepted);
    let changes = tables.to_database_changes();
    let offers = changes
        .table_changes
        .iter()
        .filter(|tc| tc.table == "scarces_active_offers")
        .collect::<Vec<_>>();
    assert!(
        offers.is_empty()
            || offers
                .iter()
                .all(|tc| matches!(tc.operation(), Operation::Delete))
    );
}

// ─── App catalog + roster ──────────────────────────────────────────

fn app_pool_event(operation: &str) -> ScarcesEvent {
    ScarcesEvent {
        id: format!("r-0-APP_POOL_UPDATE-{operation}"),
        block_height: 500,
        block_timestamp: 5_000,
        receipt_id: "r0".into(),
        event_type: "APP_POOL_UPDATE".into(),
        operation: operation.into(),
        author: "owner.near".into(),
        app_id: "my_app".into(),
        extra_data: "{}".into(),
        ..Default::default()
    }
}

#[test]
fn app_pool_register_upserts_catalog() {
    let mut tables = Tables::new();
    let mut event = app_pool_event("register");
    event.owner_id = "owner.near".into();
    event.initial_balance = "1000".into();
    event.primary_sale_bps = 750;
    event.creator_access = "approval".into();
    event.curated = true;
    event.metadata = "{\"name\":\"My App\"}".into();

    apply_app_pool(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_apps"), 1);
    assert_eq!(
        find_field(&changes, "scarces_apps", "app_id"),
        Some("my_app")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "owner_id"),
        Some("owner.near")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "primary_sale_bps"),
        Some("750")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "creator_access"),
        Some("approval")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "curated"),
        Some("true")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "metadata"),
        Some("{\"name\":\"My App\"}")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "created_block_height"),
        Some("500")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "updated_block_timestamp"),
        Some("5000")
    );
}

#[test]
fn app_pool_config_update_keeps_created_block() {
    let mut tables = Tables::new();
    let mut event = app_pool_event("config_update");
    event.block_height = 900;
    event.block_timestamp = 9_000;
    event.owner_id = "owner.near".into();
    event.primary_sale_bps = 250;
    event.creator_access = "open".into();
    event.curated = false;

    apply_app_pool(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_apps"), 1);
    assert_eq!(
        find_field(&changes, "scarces_apps", "primary_sale_bps"),
        Some("250")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "creator_access"),
        Some("open")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "curated"),
        Some("false")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "updated_block_height"),
        Some("900")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "created_block_height"),
        None
    );
}

#[test]
fn app_pool_owner_transferred_updates_owner() {
    let mut tables = Tables::new();
    let mut event = app_pool_event("owner_transferred");
    event.old_owner = "owner.near".into();
    event.new_owner = "next.near".into();

    apply_app_pool(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field(&changes, "scarces_apps", "owner_id"),
        Some("next.near")
    );
    assert_eq!(
        find_field(&changes, "scarces_apps", "created_block_height"),
        None
    );
}

#[test]
fn app_pool_fund_and_withdraw_leave_catalog_untouched() {
    let mut tables = Tables::new();
    let mut funded = app_pool_event("fund");
    funded.funder = "funder.near".into();
    funded.amount = "10".into();
    funded.new_balance = "10".into();
    let mut withdrawn = app_pool_event("withdraw");
    withdrawn.owner_id = "owner.near".into();
    withdrawn.amount = "5".into();
    withdrawn.new_balance = "5".into();

    apply_app_pool(&mut tables, &funded);
    apply_app_pool(&mut tables, &withdrawn);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_apps"), 0);
}

#[test]
fn app_pool_moderator_added_upserts_roster() {
    let mut tables = Tables::new();
    let mut event = app_pool_event("moderator_added");
    event.account_id = "mod.near".into();

    apply_app_pool(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_app_creators"), 1);
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_app_creators",
            "my_app:moderator:mod.near",
            "role"
        ),
        Some("moderator")
    );
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_app_creators",
            "my_app:moderator:mod.near",
            "account_id"
        ),
        Some("mod.near")
    );
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_app_creators",
            "my_app:moderator:mod.near",
            "added_block_height"
        ),
        Some("500")
    );
}

#[test]
fn app_pool_moderator_removed_deletes_roster_row() {
    let mut tables = Tables::new();
    let mut removed = app_pool_event("moderator_removed");
    removed.account_id = "mod.near".into();

    apply_app_pool(&mut tables, &removed);
    let changes = tables.to_database_changes();

    let rows = changes
        .table_changes
        .iter()
        .filter(|tc| tc.table == "scarces_app_creators")
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 1);
    assert!(matches!(rows[0].operation(), Operation::Delete));
    assert!(format!("{:?}", rows[0].primary_key).contains("my_app:moderator:mod.near"));
}

#[test]
fn app_pool_approved_creator_added_upserts_roster() {
    let mut tables = Tables::new();
    let mut added = app_pool_event("approved_creator_added");
    added.account_id = "creator.near".into();

    apply_app_pool(&mut tables, &added);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_app_creators"), 1);
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_app_creators",
            "my_app:approved_creator:creator.near",
            "role"
        ),
        Some("approved_creator")
    );
    assert_eq!(
        find_field_for_pk(
            &changes,
            "scarces_app_creators",
            "my_app:approved_creator:creator.near",
            "id"
        ),
        Some("my_app:approved_creator:creator.near")
    );
}

#[test]
fn app_pool_approved_creator_add_then_remove_cancels_out() {
    let mut tables = Tables::new();
    let mut added = app_pool_event("approved_creator_added");
    added.account_id = "creator.near".into();
    let mut removed = app_pool_event("approved_creator_removed");
    removed.account_id = "creator.near".into();

    apply_app_pool(&mut tables, &added);
    apply_app_pool(&mut tables, &removed);
    let changes = tables.to_database_changes();
    let rows = changes
        .table_changes
        .iter()
        .filter(|tc| tc.table == "scarces_app_creators")
        .collect::<Vec<_>>();
    assert!(
        rows.is_empty()
            || rows
                .iter()
                .all(|tc| matches!(tc.operation(), Operation::Delete))
    );
}

#[test]
fn app_pool_without_app_id_is_ignored() {
    let mut tables = Tables::new();
    let mut event = app_pool_event("register");
    event.app_id = String::new();

    apply_app_pool(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_apps"), 0);
}

#[test]
fn active_listing_create_tags_app_id() {
    let mut tables = Tables::new();
    let event = ScarcesEvent {
        id: "r-0-LAZY_LISTING_UPDATE-created".into(),
        block_height: 10,
        block_timestamp: 100,
        receipt_id: "r".into(),
        event_type: "LAZY_LISTING_UPDATE".into(),
        operation: "created".into(),
        author: "creator.near".into(),
        listing_id: "ll:app".into(),
        creator_id: "creator.near".into(),
        app_id: "my_app".into(),
        price: "1".into(),
        extra_data: r#"{"listing_id":"ll:app","app_id":"my_app","copies":1,"price":"1"}"#.into(),
        ..Default::default()
    };
    apply_active_listing(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field_for_pk(&changes, "scarces_active_listings", "lazy:ll:app", "app_id"),
        Some("my_app")
    );
}

#[test]
fn active_listing_create_without_app_id_leaves_column_unset() {
    let mut tables = Tables::new();
    let event = ScarcesEvent {
        id: "r-0-SCARCE_UPDATE-list_native".into(),
        block_height: 10,
        block_timestamp: 100,
        receipt_id: "r".into(),
        event_type: "SCARCE_UPDATE".into(),
        operation: "list_native".into(),
        author: "seller.near".into(),
        owner_id: "seller.near".into(),
        token_id: "s:1".into(),
        price: "1".into(),
        extra_data: r#"{"token_id":"s:1","price":"1"}"#.into(),
        ..Default::default()
    };
    apply_active_listing(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field_for_pk(&changes, "scarces_active_listings", "native:s:1", "app_id"),
        None
    );
}

#[test]
fn collections_current_create_upserts_shell() {
    let mut tables = Tables::new();
    let event = ScarcesEvent {
        id: "r-0-COLLECTION_UPDATE-create".into(),
        block_height: 20,
        block_timestamp: 200,
        receipt_id: "r".into(),
        event_type: "COLLECTION_UPDATE".into(),
        operation: "create".into(),
        author: "creator.near".into(),
        collection_id: "drop-1".into(),
        creator_id: "creator.near".into(),
        price: "1000".into(),
        total_supply: 10,
        extra_data: r#"{"collection_id":"drop-1","creator_id":"creator.near","total_supply":10,"price_near":"1000","minted_count":0,"remaining":10,"mint_mode":"open","title":"Shell","media":"ipfs://x","kind":"audio","metadata_template":"{\"title\":\"Shell\"}"}"#.into(),
        ..Default::default()
    };
    apply_collections_current(&mut tables, &event);
    let changes = tables.to_database_changes();

    assert_eq!(count_table_rows(&changes, "scarces_collections_current"), 1);
    assert_eq!(
        find_field_for_pk(&changes, "scarces_collections_current", "drop-1", "title"),
        Some("Shell")
    );
    assert_eq!(
        find_field_for_pk(&changes, "scarces_collections_current", "drop-1", "kind"),
        Some("audio")
    );
    assert_eq!(
        find_field_for_pk(&changes, "scarces_collections_current", "drop-1", "remaining"),
        Some("10")
    );
    assert_eq!(
        find_field_for_pk(&changes, "scarces_collections_current", "drop-1", "mint_mode"),
        Some("open")
    );
}

#[test]
fn collections_current_purchase_updates_minted() {
    let mut tables = Tables::new();
    let create = ScarcesEvent {
        id: "r-0-COLLECTION_UPDATE-create".into(),
        block_height: 20,
        block_timestamp: 200,
        receipt_id: "r0".into(),
        event_type: "COLLECTION_UPDATE".into(),
        operation: "create".into(),
        author: "creator.near".into(),
        collection_id: "drop-2".into(),
        creator_id: "creator.near".into(),
        price: "1".into(),
        total_supply: 5,
        extra_data: r#"{"collection_id":"drop-2","total_supply":5,"minted_count":0,"remaining":5,"title":"A"}"#.into(),
        ..Default::default()
    };
    let purchase = ScarcesEvent {
        id: "r-1-COLLECTION_UPDATE-purchase".into(),
        block_height: 21,
        block_timestamp: 210,
        receipt_id: "r1".into(),
        event_type: "COLLECTION_UPDATE".into(),
        operation: "purchase".into(),
        author: "buyer.near".into(),
        collection_id: "drop-2".into(),
        extra_data: r#"{"collection_id":"drop-2","minted_count":2,"remaining":3,"quantity":2}"#.into(),
        ..Default::default()
    };
    apply_collections_current(&mut tables, &create);
    apply_collections_current(&mut tables, &purchase);
    let changes = tables.to_database_changes();

    assert_eq!(
        find_field_for_pk(&changes, "scarces_collections_current", "drop-2", "minted_count"),
        Some("2")
    );
    assert_eq!(
        find_field_for_pk(&changes, "scarces_collections_current", "drop-2", "remaining"),
        Some("3")
    );
}

#[test]
fn collections_current_ban_and_delete() {
    let mut tables = Tables::new();
    let create = ScarcesEvent {
        id: "r-0-COLLECTION_UPDATE-create".into(),
        block_height: 1,
        block_timestamp: 1,
        receipt_id: "r0".into(),
        event_type: "COLLECTION_UPDATE".into(),
        operation: "create".into(),
        author: "creator.near".into(),
        collection_id: "drop-3".into(),
        creator_id: "creator.near".into(),
        total_supply: 1,
        extra_data: r#"{"collection_id":"drop-3","total_supply":1,"remaining":1}"#.into(),
        ..Default::default()
    };
    apply_collections_current(&mut tables, &create);
    let ban = ScarcesEvent {
        id: "r-1-COLLECTION_UPDATE-ban".into(),
        block_height: 2,
        block_timestamp: 2,
        receipt_id: "r1".into(),
        event_type: "COLLECTION_UPDATE".into(),
        operation: "ban".into(),
        author: "owner.near".into(),
        collection_id: "drop-3".into(),
        extra_data: r#"{"collection_id":"drop-3"}"#.into(),
        ..Default::default()
    };
    apply_collections_current(&mut tables, &ban);
    let changes = tables.to_database_changes();
    assert_eq!(
        find_field_for_pk(&changes, "scarces_collections_current", "drop-3", "banned"),
        Some("true")
    );

    let mut tables = Tables::new();
    apply_collections_current(&mut tables, &create);
    let delete = ScarcesEvent {
        id: "r-2-COLLECTION_UPDATE-delete".into(),
        block_height: 3,
        block_timestamp: 3,
        receipt_id: "r2".into(),
        event_type: "COLLECTION_UPDATE".into(),
        operation: "delete".into(),
        author: "creator.near".into(),
        collection_id: "drop-3".into(),
        extra_data: r#"{"collection_id":"drop-3"}"#.into(),
        ..Default::default()
    };
    apply_collections_current(&mut tables, &delete);
    let changes = tables.to_database_changes();
    let deleted = changes.table_changes.iter().any(|tc| {
        tc.table == "scarces_collections_current"
            && format!("{:?}", tc.primary_key).contains("drop-3")
            && matches!(tc.operation(), Operation::Delete)
    });
    assert!(deleted, "expected delete for drop-3");
}
