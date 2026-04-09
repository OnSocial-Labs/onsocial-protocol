//! Integration tests for the scarces (NFT marketplace) pipeline.
//!
//! Tests: mock Block → block_walker → scarces_decoder → ScarcesOutput

use crate::block_walker::{block_context, for_each_event_log};
use crate::pb::scarces::v1::ScarcesOutput;
use crate::scarces_decoder::decode_scarces_event;
use crate::tests::mock_block::MockBlockBuilder;

const CONTRACT: &str = "scarces.onsocial.near";

fn run_scarces_pipeline(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> ScarcesOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();

    for_each_event_log(block, Some(CONTRACT), |log| {
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

#[test]
fn scarces_list_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"list","author":"alice.near","owner_id":"alice.near","scarce_contract_id":"nft.example.near","token_ids":["t1","t2"],"prices":["1000000000000000000000000","2000000000000000000000000"]}]}"#;
    let block = MockBlockBuilder::new(238_800_000, 1_700_000_000)
        .add_receipt(CONTRACT, &[10, 20], vec![json])
        .build();

    let output = run_scarces_pipeline(&block);
    assert_eq!(output.events.len(), 1);
    assert_eq!(output.block_height, 238_800_000);

    let e = &output.events[0];
    assert_eq!(e.event_type, "SCARCE_UPDATE");
    assert_eq!(e.operation, "list");
    assert_eq!(e.owner_id, "alice.near");
    assert_eq!(e.scarce_contract_id, "nft.example.near");
    assert!(e.token_ids.contains(&"t1".to_string()));
    assert!(e.token_ids.contains(&"t2".to_string()));
}

#[test]
fn scarces_purchase_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"purchase","author":"buyer.near","buyer_id":"buyer.near","seller_id":"seller.near","scarce_contract_id":"nft.example.near","token_id":"t1","price":"5000000000000000000000000","marketplace_fee":"250000000000000000000000","app_pool_amount":"100000000000000000000000"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_scarces_pipeline(&block);
    let e = &output.events[0];
    assert_eq!(e.operation, "purchase");
    assert_eq!(e.buyer_id, "buyer.near");
    assert_eq!(e.seller_id, "seller.near");
    assert_eq!(e.price, "5000000000000000000000000");
    assert_eq!(e.marketplace_fee, "250000000000000000000000");
}

#[test]
fn scarces_auction_created_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"auction_created","author":"alice.near","owner_id":"alice.near","token_id":"t1","reserve_price":"1000","buy_now_price":"5000","expires_at":1700000000000000000,"min_bid_increment":"100","anti_snipe_extension_ns":300000000000}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_scarces_pipeline(&block);
    let e = &output.events[0];
    assert_eq!(e.operation, "auction_created");
    assert_eq!(e.reserve_price, "1000");
    assert_eq!(e.buy_now_price, "5000");
    assert_eq!(e.anti_snipe_extension_ns, 300_000_000_000);
}

#[test]
fn scarces_collection_purchase_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"COLLECTION_UPDATE","data":[{"operation":"purchase","author":"buyer.near","buyer_id":"buyer.near","creator_id":"creator.near","collection_id":"col-1","quantity":2,"total_price":"2000","marketplace_fee":"100","app_pool_amount":"50","app_commission":"25","token_ids":["t1","t2"]}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_scarces_pipeline(&block);
    let e = &output.events[0];
    assert_eq!(e.event_type, "COLLECTION_UPDATE");
    assert_eq!(e.quantity, 2);
    assert_eq!(e.collection_id, "col-1");
    assert_eq!(e.app_commission, "25");
}

#[test]
fn scarces_lazy_listing_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"LAZY_LISTING_UPDATE","data":[{"operation":"purchased","author":"buyer.near","buyer_id":"buyer.near","creator_id":"creator.near","listing_id":"ll-1","token_id":"t1","price":"3000","creator_payment":"2800","marketplace_fee":"100","app_pool_amount":"50","app_commission":"50"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_scarces_pipeline(&block);
    let e = &output.events[0];
    assert_eq!(e.event_type, "LAZY_LISTING_UPDATE");
    assert_eq!(e.creator_payment, "2800");
    assert_eq!(e.listing_id, "ll-1");
}

#[test]
fn scarces_offer_full_pipeline() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"OFFER_UPDATE","data":[{"operation":"offer_accepted","author":"seller.near","buyer_id":"bob.near","seller_id":"seller.near","token_id":"t1","amount":"5000","marketplace_fee":"250","app_pool_amount":"100"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_scarces_pipeline(&block);
    let e = &output.events[0];
    assert_eq!(e.event_type, "OFFER_UPDATE");
    assert_eq!(e.operation, "offer_accepted");
}

#[test]
fn scarces_all_7_event_types_through_pipeline() {
    let events = [
        r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"list","author":"a","owner_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"COLLECTION_UPDATE","data":[{"operation":"create","author":"a","creator_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"LAZY_LISTING_UPDATE","data":[{"operation":"created","author":"a","creator_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPDATE","data":[{"operation":"contract_upgrade","author":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"OFFER_UPDATE","data":[{"operation":"offer_made","author":"a","buyer_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_UPDATE","data":[{"operation":"storage_deposit","author":"a","account_id":"a"}]}"#,
        r#"{"standard":"onsocial","version":"1.0.0","event":"APP_POOL_UPDATE","data":[{"operation":"withdraw","author":"a","account_id":"a"}]}"#,
    ];

    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], events.to_vec())
        .build();

    let output = run_scarces_pipeline(&block);
    assert_eq!(
        output.events.len(),
        7,
        "All 7 scarces event types should decode"
    );
}

#[test]
fn scarces_ignores_non_onsocial() {
    let json = r#"{"standard":"nep171","version":"1.0.0","event":"nft_mint","data":[{}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_scarces_pipeline(&block);
    assert_eq!(output.events.len(), 0);
}

#[test]
fn scarces_preserves_unknown_event_type() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"UNKNOWN_TYPE","data":[{"operation":"x","author":"a"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_scarces_pipeline(&block);
    assert_eq!(
        output.events.len(),
        1,
        "Scarces now preserves unknown events"
    );
    assert_eq!(output.events[0].event_type, "UNKNOWN_TYPE");
}

#[test]
fn scarces_skips_malformed_json() {
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec!["not json"])
        .build();

    let output = run_scarces_pipeline(&block);
    assert_eq!(output.events.len(), 0);
}
