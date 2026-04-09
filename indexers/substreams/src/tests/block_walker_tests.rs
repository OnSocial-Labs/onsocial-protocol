//! Integration tests for block_walker.rs
//!
//! Tests the full block → shard → receipt → outcome → log pipeline
//! using mock NEAR blocks.

use crate::block_walker::{
    block_context, for_each_event_log, for_each_event_log_multi, parse_contract_filter,
    parse_multi_contract_filter,
};
use crate::tests::mock_block::MockBlockBuilder;

// =============================================================================
// parse_contract_filter
// =============================================================================

#[test]
fn parse_contract_filter_extracts_value() {
    let filter = parse_contract_filter("contract_id=core.onsocial.near");
    assert_eq!(filter.unwrap(), "core.onsocial.near");
}

#[test]
fn parse_contract_filter_empty_string_returns_none() {
    assert!(parse_contract_filter("").is_none());
}

#[test]
fn parse_contract_filter_no_equals_returns_none() {
    assert!(parse_contract_filter("no_equals_sign").is_none());
}

// =============================================================================
// parse_multi_contract_filter
// =============================================================================

#[test]
fn parse_multi_contract_filter_parses_all() {
    let result = parse_multi_contract_filter(
        "core=core.onsocial.near&boost=boost.onsocial.near&token=token.onsocial.near",
    );
    assert_eq!(result.len(), 3);
    assert_eq!(
        result[0],
        ("core".to_string(), "core.onsocial.near".to_string())
    );
    assert_eq!(
        result[1],
        ("boost".to_string(), "boost.onsocial.near".to_string())
    );
    assert_eq!(
        result[2],
        ("token".to_string(), "token.onsocial.near".to_string())
    );
}

#[test]
fn parse_multi_contract_filter_skips_empty_pairs() {
    let result = parse_multi_contract_filter("core=core.near&&boost=boost.near");
    assert_eq!(result.len(), 2);
}

#[test]
fn parse_multi_contract_filter_empty_string() {
    let result = parse_multi_contract_filter("");
    assert_eq!(result.len(), 0);
}

// =============================================================================
// block_context
// =============================================================================

#[test]
fn block_context_extracts_header_fields() {
    let block = MockBlockBuilder::new(233_084_800, 1_700_000_000_000_000_000).build();
    let ctx = block_context(&block);
    assert_eq!(ctx.block_height, 233_084_800);
    assert_eq!(ctx.block_timestamp, 1_700_000_000_000_000_000);
    assert!(!ctx.block_hash.is_empty());
}

#[test]
fn block_context_handles_missing_header() {
    use substreams_near::pb::sf::near::r#type::v1::Block;
    let block = Block {
        header: None,
        ..Default::default()
    };
    let ctx = block_context(&block);
    assert_eq!(ctx.block_height, 0);
    assert_eq!(ctx.block_timestamp, 0);
    assert!(ctx.block_hash.is_empty());
}

// =============================================================================
// for_each_event_log — single contract filter
// =============================================================================

#[test]
fn event_log_extracts_single_event() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"alice.near","path":"alice.near/post/main"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("core.onsocial.near", &[10, 20], vec![json])
        .build();

    let mut events = Vec::new();
    for_each_event_log(&block, Some("core.onsocial.near"), |log| {
        events.push((
            log.receipt_id.clone(),
            log.json_data.to_string(),
            log.log_index,
        ));
    });

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].2, 0); // log_index
    assert!(events[0].1.contains("DATA_UPDATE"));
}

#[test]
fn event_log_filters_by_contract_id() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("boost.onsocial.near", &[10], vec![json])
        .build();

    let mut count = 0;
    for_each_event_log(&block, Some("core.onsocial.near"), |_| {
        count += 1;
    });
    assert_eq!(count, 0, "Should filter out non-matching contract");
}

#[test]
fn event_log_no_filter_returns_all() {
    let json1 = r#"{"standard":"onsocial","event":"A","data":[]}"#;
    let json2 = r#"{"standard":"onsocial","event":"B","data":[]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("core.onsocial.near", &[10], vec![json1])
        .add_receipt("boost.onsocial.near", &[20], vec![json2])
        .build();

    let mut count = 0;
    for_each_event_log(&block, None, |_| {
        count += 1;
    });
    assert_eq!(count, 2);
}

#[test]
fn event_log_skips_non_event_json_lines() {
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt_raw_logs(
            "core.onsocial.near",
            &[10],
            vec![
                "INFO: processing transaction",
                r#"EVENT_JSON:{"standard":"onsocial","event":"DATA_UPDATE","data":[]}"#,
                "DEBUG: done",
            ],
        )
        .build();

    let mut count = 0;
    for_each_event_log(&block, Some("core.onsocial.near"), |_| {
        count += 1;
    });
    assert_eq!(count, 1, "Only EVENT_JSON: lines should be processed");
}

#[test]
fn event_log_multiple_logs_per_receipt() {
    let json1 = r#"{"standard":"onsocial","event":"A","data":[]}"#;
    let json2 = r#"{"standard":"onsocial","event":"B","data":[]}"#;
    let json3 = r#"{"standard":"onsocial","event":"C","data":[]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("core.onsocial.near", &[10], vec![json1, json2, json3])
        .build();

    let mut indices = Vec::new();
    for_each_event_log(&block, Some("core.onsocial.near"), |log| {
        indices.push(log.log_index);
    });
    assert_eq!(indices, vec![0, 1, 2]);
}

#[test]
fn event_log_empty_block() {
    let block = MockBlockBuilder::new(100, 1000).build();
    let mut count = 0;
    for_each_event_log(&block, None, |_| count += 1);
    assert_eq!(count, 0);
}

#[test]
fn event_log_receipt_id_is_base58() {
    let json = r#"{"event":"A","data":[]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("core.onsocial.near", &[0, 1, 2, 3, 4, 5], vec![json])
        .build();

    let mut receipt_ids = Vec::new();
    for_each_event_log(&block, None, |log| {
        receipt_ids.push(log.receipt_id.clone());
    });
    assert_eq!(receipt_ids.len(), 1);
    // bs58 of [0,1,2,3,4,5]
    let expected = bs58::encode(&[0u8, 1, 2, 3, 4, 5]).into_string();
    assert_eq!(receipt_ids[0], expected);
}

// =============================================================================
// for_each_event_log_multi — multi-contract
// =============================================================================

#[test]
fn multi_event_log_routes_by_label() {
    let core_json = r#"{"standard":"onsocial","event":"DATA_UPDATE","data":[]}"#;
    let boost_json = r#"{"standard":"onsocial","event":"BOOST_LOCK","data":[]}"#;
    let token_json = r#"{"standard":"nep141","event":"ft_mint","data":[]}"#;

    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("core.onsocial.near", &[10], vec![core_json])
        .add_receipt("boost.onsocial.near", &[20], vec![boost_json])
        .add_receipt("token.onsocial.near", &[30], vec![token_json])
        .build();

    let contracts = vec![
        ("core".to_string(), "core.onsocial.near".to_string()),
        ("boost".to_string(), "boost.onsocial.near".to_string()),
        ("token".to_string(), "token.onsocial.near".to_string()),
    ];

    let mut labels = Vec::new();
    for_each_event_log_multi(&block, &contracts, |log| {
        labels.push(log.label.to_string());
    });

    assert_eq!(labels, vec!["core", "boost", "token"]);
}

#[test]
fn multi_event_log_ignores_unregistered_contracts() {
    let json = r#"{"event":"A","data":[]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("unknown.contract.near", &[10], vec![json])
        .build();

    let contracts = vec![("core".to_string(), "core.onsocial.near".to_string())];
    let mut count = 0;
    for_each_event_log_multi(&block, &contracts, |_| count += 1);
    assert_eq!(count, 0);
}

// =============================================================================
// Multi-shard blocks
// =============================================================================

#[test]
fn event_log_across_multiple_shards() {
    let json1 = r#"{"event":"A","data":[]}"#;
    let json2 = r#"{"event":"B","data":[]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("core.onsocial.near", &[10], vec![json1])
        .new_shard()
        .add_receipt("core.onsocial.near", &[20], vec![json2])
        .build();

    let mut count = 0;
    for_each_event_log(&block, Some("core.onsocial.near"), |_| count += 1);
    assert_eq!(count, 2, "Events from both shards should be collected");
}
