use crate::block_walker::{block_context, for_each_event_log};
use crate::boost_db_out::boost_db_out_impl;
use crate::boost_decoder::decode_boost_event;
use crate::core_db_out::core_db_out_impl;
use crate::pb::boost::v1::BoostOutput;
use crate::pb::core_onsocial::v1::Output;
use crate::pb::rewards::v1::RewardsOutput;
use crate::pb::scarces::v1::ScarcesOutput;
use crate::pb::token::v1::TokenOutput;
use crate::process_core_log;
use crate::rewards_db_out::rewards_db_out_impl;
use crate::rewards_decoder::decode_rewards_event;
use crate::scarces_db_out::scarces_db_out_impl;
use crate::scarces_decoder::decode_scarces_event;
use crate::tests::mock_block::MockBlockBuilder;
use crate::token_db_out::token_db_out_impl;
use crate::token_decoder::decode_token_events;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use substreams_database_change::pb::database::{DatabaseChanges, TableChange};

const GOLDEN_DB_FIXTURES: &str = include_str!("../../tests/golden_db_fixtures.json");

fn run_core(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> Output {
    let ctx = block_context(block);
    let mut data_updates = Vec::new();
    let mut storage_updates = Vec::new();
    let mut group_updates = Vec::new();
    let mut contract_updates = Vec::new();
    let mut permission_updates = Vec::new();

    for_each_event_log(block, Some("core.onsocial.testnet"), |log| {
        process_core_log(
            log.json_data,
            &log.receipt_id,
            log.log_index,
            ctx.block_height,
            ctx.block_timestamp,
            &mut data_updates,
            &mut storage_updates,
            &mut group_updates,
            &mut contract_updates,
            &mut permission_updates,
        );
    });

    Output {
        data_updates,
        storage_updates,
        group_updates,
        contract_updates,
        permission_updates,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    }
}

fn run_boost(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> BoostOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();
    for_each_event_log(block, Some("boost.onsocial.testnet"), |log| {
        if let Some(event) = decode_boost_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(event);
        }
    });

    BoostOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    }
}

fn run_rewards(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> RewardsOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();
    for_each_event_log(block, Some("rewards.onsocial.testnet"), |log| {
        if let Some(event) = decode_rewards_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(event);
        }
    });

    RewardsOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    }
}

fn run_token(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> TokenOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();
    for_each_event_log(block, Some("token.onsocial.testnet"), |log| {
        events.extend(decode_token_events(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ));
    });

    TokenOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    }
}

fn run_scarces(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> ScarcesOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();
    for_each_event_log(block, Some("scarces.onsocial.testnet"), |log| {
        if let Some(event) = decode_scarces_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(event);
        }
    });

    ScarcesOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    }
}

fn fixture_name(fixture: &Value) -> &str {
    fixture["name"].as_str().unwrap()
}

fn fixture_u64(fixture: &Value, key: &str) -> u64 {
    fixture[key]
        .as_u64()
        .unwrap_or_else(|| panic!("{}: missing numeric {}", fixture_name(fixture), key))
}

fn fixture_str<'a>(fixture: &'a Value, key: &str) -> &'a str {
    fixture[key]
        .as_str()
        .unwrap_or_else(|| panic!("{}: missing string {}", fixture_name(fixture), key))
}

fn build_block(fixture: &Value) -> substreams_near::pb::sf::near::r#type::v1::Block {
    let logs: Vec<String> = fixture["logs"]
        .as_array()
        .unwrap_or_else(|| panic!("{}: logs must be an array", fixture_name(fixture)))
        .iter()
        .map(|log| serde_json::to_string(log).unwrap())
        .collect();
    let log_refs: Vec<&str> = logs.iter().map(String::as_str).collect();
    let receipt_seed: Vec<u8> = fixture["receipt_seed"]
        .as_array()
        .unwrap_or_else(|| panic!("{}: receipt_seed must be an array", fixture_name(fixture)))
        .iter()
        .map(|byte| byte.as_u64().unwrap() as u8)
        .collect();

    MockBlockBuilder::new(
        fixture_u64(fixture, "block_height"),
        fixture_u64(fixture, "block_timestamp"),
    )
    .add_receipt(fixture_str(fixture, "receiver_id"), &receipt_seed, log_refs)
    .build()
}

fn changes_for_fixture(fixture: &Value) -> DatabaseChanges {
    let block = build_block(fixture);
    match fixture_str(fixture, "contract") {
        "core" => core_db_out_impl(run_core(&block)),
        "boost" => boost_db_out_impl(run_boost(&block)),
        "rewards" => rewards_db_out_impl(run_rewards(&block)),
        "token" => token_db_out_impl(run_token(&block)),
        "scarces" => scarces_db_out_impl(run_scarces(&block)),
        other => panic!("{}: unsupported contract {}", fixture_name(fixture), other),
    }
}

fn expected_string(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::Null => String::new(),
        _ => serde_json::to_string(value).unwrap(),
    }
}

fn table_fields(row: &TableChange) -> BTreeMap<&str, &str> {
    row.fields
        .iter()
        .map(|field| (field.name.as_str(), field.new_value.as_str()))
        .collect()
}

fn row_matches(row: &TableChange, table_name: &str, expected_fields: &Value) -> bool {
    if row.table != table_name {
        return false;
    }

    let actual = table_fields(row);
    expected_fields
        .as_object()
        .unwrap()
        .iter()
        .all(|(field_name, expected_value)| {
            let expected = expected_string(expected_value);
            actual.get(field_name.as_str()).copied() == Some(expected.as_str())
        })
}

fn count_rows(changes: &DatabaseChanges, table_name: &str) -> usize {
    changes
        .table_changes
        .iter()
        .filter(|row| row.table == table_name)
        .count()
}

fn fixtures() -> Vec<Value> {
    serde_json::from_str(GOLDEN_DB_FIXTURES).unwrap()
}

#[test]
fn golden_db_fixtures_are_unique() {
    let mut names = BTreeSet::new();
    for fixture in fixtures() {
        assert!(
            names.insert(fixture_name(&fixture).to_string()),
            "duplicate golden fixture name: {}",
            fixture_name(&fixture)
        );
    }
}

#[test]
fn golden_db_fixtures_cover_all_sink_tables() {
    let required_tables = BTreeSet::from([
        "data_updates",
        "storage_updates",
        "group_updates",
        "contract_updates",
        "permission_updates",
        "boost_events",
        "booster_state",
        "boost_credit_purchases",
        "rewards_events",
        "user_reward_state",
        "token_events",
        "token_balances",
        "scarces_events",
    ]);

    let mut covered_tables = BTreeSet::new();
    for fixture in fixtures() {
        for expected_row in fixture["expected_rows"].as_array().unwrap() {
            covered_tables.insert(expected_row["table"].as_str().unwrap().to_string());
        }
    }

    let missing_tables: Vec<&str> = required_tables
        .iter()
        .copied()
        .filter(|table_name| !covered_tables.contains(*table_name))
        .collect();
    assert!(
        missing_tables.is_empty(),
        "missing golden table coverage: {missing_tables:?}"
    );
}

#[test]
fn golden_db_fixtures_match_expected_rows() {
    for fixture in fixtures() {
        let fixture_name = fixture_name(&fixture);
        let changes = changes_for_fixture(&fixture);

        for (table_name, expected_count) in fixture["expected_table_counts"].as_object().unwrap() {
            assert_eq!(
                count_rows(&changes, table_name),
                expected_count.as_u64().unwrap() as usize,
                "{fixture_name}: unexpected row count for {table_name}"
            );
        }

        for expected_row in fixture["expected_rows"].as_array().unwrap() {
            let table_name = expected_row["table"].as_str().unwrap();
            let expected_fields = &expected_row["fields"];
            assert!(
                changes.table_changes.iter().any(|row| row_matches(
                    row,
                    table_name,
                    expected_fields
                )),
                "{fixture_name}: expected {table_name} row with fields {expected_fields:?}; actual changes: {changes:?}"
            );
        }
    }
}
