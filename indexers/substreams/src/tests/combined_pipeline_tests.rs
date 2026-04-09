//! Integration tests for the combined (multi-contract) pipeline.
//!
//! Tests: mock Block → block_walker (multi) → all decoders → CombinedOutput
//! Verifies that a single block with events from multiple contracts
//! produces correctly routed output in all 5 sub-outputs.

use crate::block_walker::{block_context, for_each_event_log_multi};
use crate::boost_decoder::decode_boost_event;
use crate::pb::boost::v1::BoostOutput;
use crate::pb::combined::v1::CombinedOutput;
use crate::pb::core_onsocial::v1::*;
use crate::pb::rewards::v1::RewardsOutput;
use crate::pb::scarces::v1::ScarcesOutput;
use crate::pb::token::v1::TokenOutput;
use crate::process_core_log;
use crate::rewards_decoder::decode_rewards_event;
use crate::scarces_decoder::decode_scarces_event;
use crate::tests::mock_block::MockBlockBuilder;
use crate::token_decoder::decode_token_events;

const CORE: &str = "core.onsocial.near";
const BOOST: &str = "boost.onsocial.near";
const REWARDS: &str = "rewards.onsocial.near";
const TOKEN: &str = "token.onsocial.near";
const SCARCES: &str = "scarces.onsocial.near";

fn run_combined_pipeline(
    block: &substreams_near::pb::sf::near::r#type::v1::Block,
) -> CombinedOutput {
    let contracts = vec![
        ("core".to_string(), CORE.to_string()),
        ("boost".to_string(), BOOST.to_string()),
        ("rewards".to_string(), REWARDS.to_string()),
        ("token".to_string(), TOKEN.to_string()),
        ("scarces".to_string(), SCARCES.to_string()),
    ];
    let ctx = block_context(block);

    let mut data_updates = Vec::new();
    let mut storage_updates = Vec::new();
    let mut group_updates = Vec::new();
    let mut contract_updates = Vec::new();
    let mut permission_updates = Vec::new();
    let mut boost_events = Vec::new();
    let mut rewards_events = Vec::new();
    let mut token_events = Vec::new();
    let mut scarces_events = Vec::new();

    for_each_event_log_multi(block, &contracts, |log| match log.label {
        "core" => {
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
        }
        "boost" => {
            if let Some(event) = decode_boost_event(
                log.json_data,
                &log.receipt_id,
                ctx.block_height,
                ctx.block_timestamp,
                log.log_index,
            ) {
                boost_events.push(event);
            }
        }
        "rewards" => {
            if let Some(event) = decode_rewards_event(
                log.json_data,
                &log.receipt_id,
                ctx.block_height,
                ctx.block_timestamp,
                log.log_index,
            ) {
                rewards_events.push(event);
            }
        }
        "token" => {
            token_events.extend(decode_token_events(
                log.json_data,
                &log.receipt_id,
                ctx.block_height,
                ctx.block_timestamp,
                log.log_index,
            ));
        }
        "scarces" => {
            if let Some(event) = decode_scarces_event(
                log.json_data,
                &log.receipt_id,
                ctx.block_height,
                ctx.block_timestamp,
                log.log_index,
            ) {
                scarces_events.push(event);
            }
        }
        _ => {}
    });

    CombinedOutput {
        core: Some(Output {
            data_updates,
            storage_updates,
            group_updates,
            contract_updates,
            permission_updates,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash.clone(),
        }),
        boost: Some(BoostOutput {
            events: boost_events,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash.clone(),
        }),
        rewards: Some(RewardsOutput {
            events: rewards_events,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash.clone(),
        }),
        token: Some(TokenOutput {
            events: token_events,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash.clone(),
        }),
        scarces: Some(ScarcesOutput {
            events: scarces_events,
            block_height: ctx.block_height,
            block_timestamp: ctx.block_timestamp,
            block_hash: ctx.block_hash,
        }),
    }
}

#[test]
fn combined_routes_all_5_contracts() {
    let core_json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"alice.near","path":"alice.near/post/1","value":"hello"}]}"#;
    let boost_json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"100","months":6,"effective_boost":"120","account_id":"alice.near"}]}"#;
    let rewards_json = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CREDITED","data":[{"amount":"50","source":"boost","credited_by":"bot.near","app_id":"portal","account_id":"alice.near"}]}"#;
    let token_json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{"owner_id":"alice.near","amount":"1000","memo":""}]}"#;
    let scarces_json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"list","author":"alice.near","owner_id":"alice.near"}]}"#;

    let block = MockBlockBuilder::new(238_800_000, 1_700_000_000)
        .add_receipt(CORE, &[1], vec![core_json])
        .add_receipt(BOOST, &[2], vec![boost_json])
        .add_receipt(REWARDS, &[3], vec![rewards_json])
        .add_receipt(TOKEN, &[4], vec![token_json])
        .add_receipt(SCARCES, &[5], vec![scarces_json])
        .build();

    let output = run_combined_pipeline(&block);

    // Core
    let core = output.core.as_ref().unwrap();
    assert_eq!(core.data_updates.len(), 1);
    assert_eq!(core.data_updates[0].author, "alice.near");

    // Boost
    let boost = output.boost.as_ref().unwrap();
    assert_eq!(boost.events.len(), 1);
    assert_eq!(boost.events[0].event_type, "BOOST_LOCK");

    // Rewards
    let rewards = output.rewards.as_ref().unwrap();
    assert_eq!(rewards.events.len(), 1);
    assert_eq!(rewards.events[0].event_type, "REWARD_CREDITED");

    // Token
    let token = output.token.as_ref().unwrap();
    assert_eq!(token.events.len(), 1);
    assert_eq!(token.events[0].event_type, "ft_mint");

    // Scarces
    let scarces = output.scarces.as_ref().unwrap();
    assert_eq!(scarces.events.len(), 1);
    assert_eq!(scarces.events[0].operation, "list");
}

#[test]
fn combined_no_cross_contamination() {
    // Boost event should NOT appear in core output
    let boost_json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"100","months":6,"effective_boost":"120","account_id":"alice.near"}]}"#;

    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(BOOST, &[1], vec![boost_json])
        .build();

    let output = run_combined_pipeline(&block);

    let core = output.core.as_ref().unwrap();
    assert_eq!(core.data_updates.len(), 0);
    assert_eq!(core.storage_updates.len(), 0);
    assert_eq!(core.group_updates.len(), 0);

    let boost = output.boost.as_ref().unwrap();
    assert_eq!(boost.events.len(), 1);
}

#[test]
fn combined_ignores_unregistered_contracts() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"a","path":"a/b"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("unknown.contract.near", &[1], vec![json])
        .build();

    let output = run_combined_pipeline(&block);
    let core = output.core.as_ref().unwrap();
    assert_eq!(core.data_updates.len(), 0);
}

#[test]
fn combined_multiple_events_per_contract() {
    let data1 = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"a.near","path":"a.near/post/1","value":"x"}]}"#;
    let data2 = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"a.near","path":"a.near/post/2","value":"y"}]}"#;
    let storage = r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_UPDATE","data":[{"operation":"deposit","author":"a.near","amount":"100","previous_balance":"0","new_balance":"100"}]}"#;

    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CORE, &[1], vec![data1, data2, storage])
        .build();

    let output = run_combined_pipeline(&block);
    let core = output.core.as_ref().unwrap();
    assert_eq!(core.data_updates.len(), 2);
    assert_eq!(core.storage_updates.len(), 1);
}

#[test]
fn combined_empty_block_all_outputs_exist() {
    let block = MockBlockBuilder::new(100, 1000).build();
    let output = run_combined_pipeline(&block);

    assert!(output.core.is_some());
    assert!(output.boost.is_some());
    assert!(output.rewards.is_some());
    assert!(output.token.is_some());
    assert!(output.scarces.is_some());

    assert_eq!(output.core.unwrap().data_updates.len(), 0);
    assert_eq!(output.boost.unwrap().events.len(), 0);
}

#[test]
fn combined_block_metadata_consistent() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"1","months":1,"effective_boost":"1","account_id":"a"}]}"#;
    let block = MockBlockBuilder::new(999_999, 1_234_567_890)
        .add_receipt(BOOST, &[1], vec![json])
        .build();

    let output = run_combined_pipeline(&block);
    assert_eq!(output.core.as_ref().unwrap().block_height, 999_999);
    assert_eq!(output.boost.as_ref().unwrap().block_height, 999_999);
    assert_eq!(output.rewards.as_ref().unwrap().block_height, 999_999);
    assert_eq!(output.core.as_ref().unwrap().block_timestamp, 1_234_567_890);
    assert_eq!(
        output.core.as_ref().unwrap().block_hash,
        output.boost.as_ref().unwrap().block_hash
    );
}
