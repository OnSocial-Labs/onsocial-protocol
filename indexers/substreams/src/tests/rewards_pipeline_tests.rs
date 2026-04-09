//! Integration tests for the rewards pipeline.
//!
//! Tests: mock Block → block_walker → rewards_decoder → RewardsOutput

use crate::block_walker::{block_context, for_each_event_log};
use crate::pb::rewards::v1::RewardsOutput;
use crate::pb::rewards::v1::rewards_event::Payload;
use crate::rewards_decoder::decode_rewards_event;
use crate::tests::mock_block::MockBlockBuilder;

const CONTRACT: &str = "rewards.onsocial.near";

fn run_rewards_pipeline(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> RewardsOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();

    for_each_event_log(block, Some(CONTRACT), |log| {
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

#[test]
fn rewards_credit_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CREDITED","data":[{"amount":"1000000000000000000","source":"boost","credited_by":"executor.near","app_id":"portal","account_id":"alice.near"}]}"#;
    let block = MockBlockBuilder::new(238_800_000, 1_700_000_000)
        .add_receipt(CONTRACT, &[10, 20], vec![json])
        .build();

    let output = run_rewards_pipeline(&block);
    assert_eq!(output.events.len(), 1);
    assert_eq!(output.block_height, 238_800_000);

    let e = &output.events[0];
    assert_eq!(e.event_type, "REWARD_CREDITED");
    assert_eq!(e.account_id, "alice.near");
    assert!(e.success);
    match e.payload.as_ref().unwrap() {
        Payload::RewardCredited(p) => {
            assert_eq!(p.amount, "1000000000000000000");
            assert_eq!(p.source, "boost");
            assert_eq!(p.credited_by, "executor.near");
            assert_eq!(p.app_id, "portal");
        }
        _ => panic!("Expected RewardCredited payload"),
    }
}

#[test]
fn rewards_claim_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CLAIMED","data":[{"amount":"5000000000000000000","account_id":"alice.near"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_rewards_pipeline(&block);
    let e = &output.events[0];
    assert!(e.success);
    match e.payload.as_ref().unwrap() {
        Payload::RewardClaimed(p) => assert_eq!(p.amount, "5000000000000000000"),
        _ => panic!("Expected RewardClaimed"),
    }
}

#[test]
fn rewards_claim_failed_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"CLAIM_FAILED","data":[{"amount":"100","account_id":"alice.near"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_rewards_pipeline(&block);
    assert!(!output.events[0].success);
}

#[test]
fn rewards_pool_deposit_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"POOL_DEPOSIT","data":[{"amount":"10000","new_balance":"50000","account_id":"owner.near"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_rewards_pipeline(&block);
    match output.events[0].payload.as_ref().unwrap() {
        Payload::PoolDeposit(p) => {
            assert_eq!(p.amount, "10000");
            assert_eq!(p.new_balance, "50000");
        }
        _ => panic!("Expected PoolDeposit"),
    }
}

#[test]
fn rewards_all_11_events_through_pipeline() {
    let events = vec![
        r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CREDITED","data":[{"amount":"1","source":"boost","credited_by":"e","app_id":"p","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CLAIMED","data":[{"amount":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"CLAIM_FAILED","data":[{"amount":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"POOL_DEPOSIT","data":[{"amount":"1","new_balance":"1","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"OWNER_CHANGED","data":[{"old_owner":"a","new_owner":"b","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"MAX_DAILY_UPDATED","data":[{"old_max":"1","new_max":"2","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"EXECUTOR_ADDED","data":[{"executor":"e","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"EXECUTOR_REMOVED","data":[{"executor":"e","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"CALLER_ADDED","data":[{"caller":"c","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"CALLER_REMOVED","data":[{"caller":"c","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPGRADE","data":[{"old_version":"1.0.0","new_version":"2.0.0","account_id":"a"}]}"#,
    ];

    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], events.to_vec())
        .build();

    let output = run_rewards_pipeline(&block);
    assert_eq!(
        output.events.len(),
        11,
        "All 11 rewards event types should decode"
    );
}

#[test]
fn rewards_ignores_non_onsocial() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_rewards_pipeline(&block);
    assert_eq!(output.events.len(), 0);
}

#[test]
fn rewards_skips_malformed_json() {
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec!["not json"])
        .build();

    let output = run_rewards_pipeline(&block);
    assert_eq!(output.events.len(), 0);
}
