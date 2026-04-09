//! Integration tests for the boost pipeline.
//!
//! Tests: mock Block → block_walker → boost_decoder → BoostOutput
//! Verifies that boost contract EVENT_JSON logs produce correct typed protobuf output.

use crate::block_walker::{block_context, for_each_event_log};
use crate::boost_decoder::decode_boost_event;
use crate::pb::boost::v1::BoostOutput;
use crate::pb::boost::v1::boost_event::Payload;
use crate::tests::mock_block::MockBlockBuilder;

const CONTRACT: &str = "boost.onsocial.near";

fn run_boost_pipeline(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> BoostOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();

    for_each_event_log(block, Some(CONTRACT), |log| {
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

#[test]
fn boost_lock_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"75000000000000000000","months":48,"effective_boost":"112500000000000000000","account_id":"alice.near"}]}"#;
    let block = MockBlockBuilder::new(238_800_000, 1_700_000_000)
        .add_receipt(CONTRACT, &[10, 20], vec![json])
        .build();

    let output = run_boost_pipeline(&block);
    assert_eq!(output.events.len(), 1);
    assert_eq!(output.block_height, 238_800_000);

    let e = &output.events[0];
    assert_eq!(e.event_type, "BOOST_LOCK");
    assert_eq!(e.account_id, "alice.near");
    assert!(e.success);
    match e.payload.as_ref().unwrap() {
        Payload::BoostLock(p) => {
            assert_eq!(p.amount, "75000000000000000000");
            assert_eq!(p.months, 48);
            assert_eq!(p.effective_boost, "112500000000000000000");
        }
        _ => panic!("Expected BoostLock payload"),
    }
}

#[test]
fn boost_credits_purchase_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"CREDITS_PURCHASE","data":[{"amount":"100000000000000000000","infra_share":"60000000000000000000","rewards_share":"40000000000000000000","account_id":"buyer.near"}]}"#;
    let block = MockBlockBuilder::new(238_800_100, 1_700_000_100)
        .add_receipt(CONTRACT, &[30, 40], vec![json])
        .build();

    let output = run_boost_pipeline(&block);
    let e = &output.events[0];
    assert_eq!(e.event_type, "CREDITS_PURCHASE");
    match e.payload.as_ref().unwrap() {
        Payload::CreditsPurchase(p) => {
            assert_eq!(p.amount, "100000000000000000000");
            assert_eq!(p.infra_share, "60000000000000000000");
            assert_eq!(p.rewards_share, "40000000000000000000");
        }
        _ => panic!("Expected CreditsPurchase payload"),
    }
}

#[test]
fn boost_failure_event_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"UNLOCK_FAILED","data":[{"amount":"50000000000000000000","account_id":"alice.near"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_boost_pipeline(&block);
    let e = &output.events[0];
    assert!(!e.success);
    assert_eq!(e.event_type, "UNLOCK_FAILED");
}

#[test]
fn boost_rewards_released_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARDS_RELEASED","data":[{"amount":"4396703581071053","elapsed_ns":"1322741073698","total_released":"46857292777208385","remaining_pool":"1005153142707222791615","account_id":"boost.onsocial.near"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_boost_pipeline(&block);
    let e = &output.events[0];
    match e.payload.as_ref().unwrap() {
        Payload::RewardsReleased(p) => {
            assert_eq!(p.amount, "4396703581071053");
            assert_eq!(p.elapsed_ns, "1322741073698");
            assert_eq!(p.remaining_pool, "1005153142707222791615");
        }
        _ => panic!("Expected RewardsReleased payload"),
    }
}

#[test]
fn boost_multiple_events_in_block() {
    let lock_json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"100","months":6,"effective_boost":"120","account_id":"alice.near"}]}"#;
    let extend_json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_EXTEND","data":[{"new_months":12,"new_effective_boost":"200","account_id":"alice.near"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![lock_json, extend_json])
        .build();

    let output = run_boost_pipeline(&block);
    assert_eq!(output.events.len(), 2);
    assert_eq!(output.events[0].event_type, "BOOST_LOCK");
    assert_eq!(output.events[1].event_type, "BOOST_EXTEND");
}

#[test]
fn boost_ignores_nep141_events() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"a","new_owner_id":"b","amount":"100"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_boost_pipeline(&block);
    assert_eq!(output.events.len(), 0);
}

#[test]
fn boost_skips_malformed_json() {
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec!["not valid json"])
        .build();

    let output = run_boost_pipeline(&block);
    assert_eq!(output.events.len(), 0);
}

#[test]
fn boost_unknown_event_captured() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"FUTURE_EVENT","data":[{"account_id":"a.near","new_field":"value"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_boost_pipeline(&block);
    let e = &output.events[0];
    assert_eq!(e.event_type, "FUTURE_EVENT");
    match e.payload.as_ref().unwrap() {
        Payload::UnknownEvent(p) => {
            assert!(p.extra_data.contains("new_field"));
        }
        _ => panic!("Expected UnknownEvent payload"),
    }
}

#[test]
fn boost_all_14_event_types_through_pipeline() {
    let events = vec![
        r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"1","months":6,"effective_boost":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_EXTEND","data":[{"new_months":12,"new_effective_boost":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_UNLOCK","data":[{"amount":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"REWARDS_RELEASED","data":[{"amount":"1","elapsed_ns":"1","total_released":"1","remaining_pool":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"REWARDS_CLAIM","data":[{"amount":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"CREDITS_PURCHASE","data":[{"amount":"1","infra_share":"1","rewards_share":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"SCHEDULED_FUND","data":[{"amount":"1","total_pool":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"INFRA_WITHDRAW","data":[{"amount":"1","receiver_id":"b","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"OWNER_CHANGED","data":[{"old_owner":"a","new_owner":"b","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPGRADE","data":[{"old_version":"0.1.0","new_version":"0.2.0","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_DEPOSIT","data":[{"deposit":"5000","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"UNLOCK_FAILED","data":[{"amount":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"CLAIM_FAILED","data":[{"amount":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"WITHDRAW_INFRA_FAILED","data":[{"amount":"1","account_id":"a"}]}"#,
    ];

    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], events.to_vec())
        .build();

    let output = run_boost_pipeline(&block);
    assert_eq!(
        output.events.len(),
        14,
        "All 14 boost event types should decode"
    );
}
