//! Integration tests for the social-spend pipeline.
//!
//! Tests: mock Block -> block_walker -> social_spend_decoder -> SocialSpendOutput

use crate::block_walker::{block_context, for_each_event_log};
use crate::pb::social_spend::v1::SocialSpendOutput;
use crate::social_spend_decoder::decode_social_spend_event;
use crate::tests::mock_block::MockBlockBuilder;

const CONTRACT: &str = "social-spend.onsocial.near";

fn run_social_spend_pipeline(
    block: &substreams_near::pb::sf::near::r#type::v1::Block,
) -> SocialSpendOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();

    for_each_event_log(block, Some(CONTRACT), |log| {
        if let Some(event) = decode_social_spend_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(event);
        }
    });

    SocialSpendOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    }
}

#[test]
fn social_spent_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SOCIAL_SPENT","data":[{"spender_id":"alice.near","amount":"1000000000000000000","app_id":"portal","action":"join_rally","target_type":"rally","target_id":"season0","treasury_amount":"100000000000000000","season_amount":"900000000000000000","target_amount":"0","season_id":"season0","tag":"first-spend","account_id":"alice.near"}]}"#;
    let block = MockBlockBuilder::new(251_120_000, 1_700_000_000)
        .add_receipt(CONTRACT, &[10, 20], vec![json])
        .build();

    let output = run_social_spend_pipeline(&block);
    assert_eq!(output.events.len(), 1);
    assert_eq!(output.block_height, 251_120_000);

    let event = &output.events[0];
    assert_eq!(event.event_type, "SOCIAL_SPENT");
    assert_eq!(event.action, "join_rally");
    assert_eq!(event.season_id, "season0");
    assert_eq!(event.season_amount, "900000000000000000");
}

#[test]
fn social_spend_ignores_other_contracts() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SOCIAL_SPENT","data":[{"account_id":"alice.near"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("core.onsocial.near", &[1], vec![json])
        .build();

    let output = run_social_spend_pipeline(&block);
    assert_eq!(output.events.len(), 0);
}
