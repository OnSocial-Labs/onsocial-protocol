//! Integration tests for the token (NEP-141) pipeline.
//!
//! Tests: mock Block → block_walker → token_decoder → TokenOutput

use crate::block_walker::{block_context, for_each_event_log};
use crate::pb::token::v1::TokenOutput;
use crate::pb::token::v1::token_event::Payload;
use crate::tests::mock_block::MockBlockBuilder;
use crate::token_decoder::decode_token_events;

const CONTRACT: &str = "token.onsocial.near";

fn run_token_pipeline(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> TokenOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();

    for_each_event_log(block, Some(CONTRACT), |log| {
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

#[test]
fn token_ft_mint_full_pipeline() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{"owner_id":"alice.near","amount":"1000000000000000000000000000","memo":"Initial mint"}]}"#;
    let block = MockBlockBuilder::new(234_337_349, 1_700_000_000)
        .add_receipt(CONTRACT, &[10, 20], vec![json])
        .build();

    let output = run_token_pipeline(&block);
    assert_eq!(output.events.len(), 1);
    assert_eq!(output.block_height, 234_337_349);

    let e = &output.events[0];
    assert_eq!(e.event_type, "ft_mint");
    match e.payload.as_ref().unwrap() {
        Payload::FtMint(p) => {
            assert_eq!(p.owner_id, "alice.near");
            assert_eq!(p.amount, "1000000000000000000000000000");
            assert_eq!(p.memo, "Initial mint");
        }
        _ => panic!("Expected FtMint"),
    }
}

#[test]
fn token_ft_burn_full_pipeline() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_burn","data":[{"owner_id":"bob.near","amount":"500000000000000000","memo":"User burn"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_token_pipeline(&block);
    let e = &output.events[0];
    assert_eq!(e.event_type, "ft_burn");
    match e.payload.as_ref().unwrap() {
        Payload::FtBurn(p) => {
            assert_eq!(p.owner_id, "bob.near");
            assert_eq!(p.amount, "500000000000000000");
        }
        _ => panic!("Expected FtBurn"),
    }
}

#[test]
fn token_ft_transfer_full_pipeline() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"alice.near","new_owner_id":"bob.near","amount":"100000000000000000000","memo":"payment"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_token_pipeline(&block);
    let e = &output.events[0];
    match e.payload.as_ref().unwrap() {
        Payload::FtTransfer(p) => {
            assert_eq!(p.old_owner_id, "alice.near");
            assert_eq!(p.new_owner_id, "bob.near");
            assert_eq!(p.amount, "100000000000000000000");
            assert_eq!(p.memo, "payment");
        }
        _ => panic!("Expected FtTransfer"),
    }
}

#[test]
fn token_batch_transfer_full_pipeline() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"alice.near","new_owner_id":"bob.near","amount":"100","memo":""},{"old_owner_id":"alice.near","new_owner_id":"carol.near","amount":"200","memo":""}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_token_pipeline(&block);
    assert_eq!(output.events.len(), 2);

    match output.events[0].payload.as_ref().unwrap() {
        Payload::FtTransfer(p) => assert_eq!(p.new_owner_id, "bob.near"),
        _ => panic!("Expected FtTransfer"),
    }
    match output.events[1].payload.as_ref().unwrap() {
        Payload::FtTransfer(p) => assert_eq!(p.new_owner_id, "carol.near"),
        _ => panic!("Expected FtTransfer"),
    }
}

#[test]
fn token_ignores_onsocial_standard() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_token_pipeline(&block);
    assert_eq!(output.events.len(), 0);
}

#[test]
fn token_skips_malformed_json() {
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec!["not json"])
        .build();

    let output = run_token_pipeline(&block);
    assert_eq!(output.events.len(), 0);
}

#[test]
fn token_unknown_nep141_event() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_unknown","data":[{"owner_id":"x","foo":"bar"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_token_pipeline(&block);
    assert_eq!(output.events.len(), 1);
    assert_eq!(output.events[0].event_type, "ft_unknown");
    match output.events[0].payload.as_ref().unwrap() {
        Payload::UnknownEvent(p) => assert!(p.extra_data.contains("foo")),
        _ => panic!("Expected UnknownEvent"),
    }
}

#[test]
fn token_multiple_receipts_in_block() {
    let json1 = r#"{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{"owner_id":"alice.near","amount":"1000","memo":""}]}"#;
    let json2 = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"alice.near","new_owner_id":"bob.near","amount":"500","memo":""}]}"#;

    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json1])
        .add_receipt(CONTRACT, &[2], vec![json2])
        .build();

    let output = run_token_pipeline(&block);
    assert_eq!(output.events.len(), 2);
    assert_eq!(output.events[0].event_type, "ft_mint");
    assert_eq!(output.events[1].event_type, "ft_transfer");
}
