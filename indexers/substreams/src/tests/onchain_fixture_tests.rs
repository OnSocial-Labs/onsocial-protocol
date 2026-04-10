//! On-chain fixture tests — real EVENT_JSON logs from testnet transactions.
//!
//! These tests feed actual on-chain event logs (captured from NEAR testnet)
//! through the full Substreams pipeline to verify correct decoding.
//!
//! Unlike the synthetic mock tests, every JSON string below was emitted by
//! a real smart contract. The source tx hash is noted for provenance.
//!
//! To capture more fixtures:
//!   NEAR_RPC=https://archival-rpc.testnet.near.org \
//!     ./scripts/capture_event_fixtures.sh <tx_hash> <signer>

use crate::block_walker::{block_context, for_each_event_log, for_each_event_log_multi};
use crate::boost_decoder::decode_boost_event;
use crate::pb::boost::v1::BoostOutput;
use crate::pb::boost::v1::boost_event::Payload;
use crate::pb::core_onsocial::v1::*;
use crate::pb::rewards::v1::RewardsOutput;
use crate::pb::scarces::v1::ScarcesOutput;
use crate::pb::token::v1::TokenOutput;
use crate::process_core_log;
use crate::rewards_decoder::decode_rewards_event;
use crate::scarces_decoder::decode_scarces_event;
use crate::tests::mock_block::MockBlockBuilder;
use crate::token_decoder::decode_token_events;

// =============================================================================
// Helper pipelines (same as production map handlers)
// =============================================================================

fn run_core(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> Output {
    let filter = Some("core.onsocial.testnet");
    let ctx = block_context(block);
    let mut data_updates = Vec::new();
    let mut storage_updates = Vec::new();
    let mut group_updates = Vec::new();
    let mut contract_updates = Vec::new();
    let mut permission_updates = Vec::new();
    for_each_event_log(block, filter, |log| {
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
        if let Some(e) = decode_boost_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(e);
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
        if let Some(e) = decode_rewards_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(e);
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

// =============================================================================
// CORE — DATA_UPDATE (real testnet event)
// =============================================================================

// Source: tx=GGfzaUHkvQ3WNNVJxsMbVzwDB6G3wHEzCBpFZG5vUbpt
// Block: 239416067  Contract: core.onsocial.testnet
const REAL_DATA_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"test01.onsocial.testnet","partition_id":3797,"path":"test01.onsocial.testnet/profile/jwt_test","id":"jwt_test","type":"profile","value":"JWT gasless write at 2026-03-03T16:20:01.000Z"}]}"#;

#[test]
fn onchain_core_data_update_profile() {
    let block = MockBlockBuilder::new(239_416_067, 1_772_000_000)
        .add_receipt("core.onsocial.testnet", &[1, 2, 3], vec![REAL_DATA_UPDATE])
        .build();
    let out = run_core(&block);
    assert_eq!(out.data_updates.len(), 1);
    let du = &out.data_updates[0];
    assert_eq!(du.operation, "set");
    assert_eq!(du.author, "test01.onsocial.testnet");
    assert_eq!(du.account_id, "test01.onsocial.testnet");
    assert_eq!(du.data_type, "profile");
    assert_eq!(du.data_id, "jwt_test");
    assert_eq!(du.path, "test01.onsocial.testnet/profile/jwt_test");
    assert!(du.value.contains("JWT gasless write"));
}

// =============================================================================
// CORE — STORAGE_UPDATE (real testnet event)
// =============================================================================

// Source: tx=F1dFnhQBcLKsBmjgw8pcWLjiDfGUmFtDEQRWDggzYcpM
// Block: 239245143  Contract: core.onsocial.testnet
const REAL_STORAGE_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_UPDATE","data":[{"operation":"storage_tip","author":"test01.onsocial.testnet","partition_id":3797,"target_id":"test02.onsocial.testnet","amount":"1000000000000000000000","sender_previous_balance":"13669000000000000000000019","sender_new_balance":"13668000000000000000000019","recipient_previous_balance":"1190000000000000000000003","recipient_new_balance":"1191000000000000000000003"}]}"#;

#[test]
fn onchain_core_storage_update_tip() {
    let block = MockBlockBuilder::new(239_245_143, 1_772_000_000)
        .add_receipt(
            "core.onsocial.testnet",
            &[4, 5, 6],
            vec![REAL_STORAGE_UPDATE],
        )
        .build();
    let out = run_core(&block);
    assert_eq!(out.storage_updates.len(), 1);
    let su = &out.storage_updates[0];
    assert_eq!(su.operation, "storage_tip");
    assert_eq!(su.author, "test01.onsocial.testnet");
    assert_eq!(su.amount, "1000000000000000000000");
}

// =============================================================================
// CORE — GROUP_UPDATE — proposal_created + vote_cast + add_member (real)
// =============================================================================

// Source: tx=2AikAt9otd1JJcAuDLjL8LdFsuRmHbUqGbsiqQjqzkeC
// Block: 239239773  Contract: core.onsocial.testnet
const REAL_GROUP_UPDATE_ADD_MEMBER: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"GROUP_UPDATE","data":[{"operation":"add_member","author":"test01.onsocial.testnet","partition_id":1561,"target_id":"test02.onsocial.testnet","path":"groups/vote-test/members/test02.onsocial.testnet","id":"test02.onsocial.testnet","type":"members","group_id":"vote-test","group_path":"members/test02.onsocial.testnet","is_group_content":true,"value":{"level":0,"joined_at":"1772454720920968222"},"member_nonce":1,"member_nonce_path":"groups/vote-test/member_nonces/test02.onsocial.testnet","default_permissions":[{"path":"content","level":1}]}]}"#;

const REAL_GROUP_UPDATE_VOTE_CAST: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"GROUP_UPDATE","data":[{"operation":"vote_cast","author":"test01.onsocial.testnet","partition_id":1561,"group_id":"vote-test","proposal_id":"vote-test_1_239239793_test01.onsocial.testnet_2502622973","voter":"test01.onsocial.testnet","approve":true,"total_votes":1,"yes_votes":1,"no_votes":0,"locked_member_count":1,"participation_bps":10000,"approval_bps":10000,"should_execute":true,"should_reject":false,"path":"groups/vote-test/votes/vote-test_1_239239793_test01.onsocial.testnet_2502622973/test01.onsocial.testnet","id":"test01.onsocial.testnet","type":"votes","group_path":"votes/vote-test_1_239239793_test01.onsocial.testnet_2502622973/test01.onsocial.testnet","is_group_content":true,"value":{"voter":"test01.onsocial.testnet","approve":true,"timestamp":"1772454720920968222"},"tally_path":"groups/vote-test/votes/vote-test_1_239239793_test01.onsocial.testnet_2502622973","voted_at":"1772454720920968222","writes":[{"path":"groups/vote-test/votes/vote-test_1_239239793_test01.onsocial.testnet_2502622973","value":{"yes_votes":1,"total_votes":1,"created_at":"1772454720920968222","locked_member_count":1}}]}]}"#;

const REAL_GROUP_UPDATE_PROPOSAL_CANCELLED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"GROUP_UPDATE","data":[{"operation":"proposal_status_updated","author":"test01.onsocial.testnet","partition_id":1561,"group_id":"vote-test","proposal_id":"vote-test_3_239240133_test01.onsocial.testnet_2232764448","proposer":"test01.onsocial.testnet","status":"cancelled","final_total_votes":0,"final_yes_votes":0,"final_no_votes":0,"locked_member_count":2,"unlocked_deposit":"50000000000000000000000","updated_at":"1772454937930572547","path":"groups/vote-test/proposals/vote-test_3_239240133_test01.onsocial.testnet_2232764448","id":"vote-test_3_239240133_test01.onsocial.testnet_2232764448","type":"proposals","group_path":"proposals/vote-test_3_239240133_test01.onsocial.testnet_2232764448","is_group_content":true,"value":{"id":"vote-test_3_239240133_test01.onsocial.testnet_2232764448","sequence_number":3,"title":"Cancel me","description":"","type":"custom_proposal","proposer":"test01.onsocial.testnet","target":"test01.onsocial.testnet","data":{"CustomProposal":{"title":"Cancel me","description":"This will be cancelled","custom_data":{}}},"created_at":"1772454920243722389","status":"cancelled","voting_config":{"participation_quorum_bps":5100,"majority_threshold_bps":5001,"voting_period":"604800000000000"},"locked_deposit":"50000000000000000000000","updated_at":"1772454937930572547"}}]}"#;

#[test]
fn onchain_core_group_update_add_member() {
    let block = MockBlockBuilder::new(239_239_773, 1_772_000_000)
        .add_receipt(
            "core.onsocial.testnet",
            &[7, 8],
            vec![REAL_GROUP_UPDATE_ADD_MEMBER],
        )
        .build();
    let out = run_core(&block);
    assert_eq!(out.group_updates.len(), 1);
    let gu = &out.group_updates[0];
    assert_eq!(gu.operation, "add_member");
    assert_eq!(gu.group_id, "vote-test");
    assert_eq!(gu.member_id, "test02.onsocial.testnet");
}

#[test]
fn onchain_core_group_update_vote_cast() {
    let block = MockBlockBuilder::new(239_239_773, 1_772_000_000)
        .add_receipt(
            "core.onsocial.testnet",
            &[7, 9],
            vec![REAL_GROUP_UPDATE_VOTE_CAST],
        )
        .build();
    let out = run_core(&block);
    assert_eq!(out.group_updates.len(), 1);
    let gu = &out.group_updates[0];
    assert_eq!(gu.operation, "vote_cast");
    assert_eq!(
        gu.proposal_id,
        "vote-test_1_239239793_test01.onsocial.testnet_2502622973"
    );
    assert_eq!(gu.voter, "test01.onsocial.testnet");
    assert!(gu.approve);
    assert_eq!(gu.yes_votes, 1);
    assert_eq!(gu.no_votes, 0);
}

#[test]
fn onchain_core_group_update_proposal_cancelled() {
    let block = MockBlockBuilder::new(239_240_161, 1_772_000_000)
        .add_receipt(
            "core.onsocial.testnet",
            &[7, 10],
            vec![REAL_GROUP_UPDATE_PROPOSAL_CANCELLED],
        )
        .build();
    let out = run_core(&block);
    assert_eq!(out.group_updates.len(), 1);
    let gu = &out.group_updates[0];
    assert_eq!(gu.operation, "proposal_status_updated");
    assert_eq!(gu.status, "cancelled");
    assert_eq!(gu.author, "test01.onsocial.testnet");
}

// =============================================================================
// CORE — CONTRACT_UPDATE (real testnet event)
// =============================================================================

// Source: tx=7svezQKXXLirHzWMD1rm9ixgg7Ab5GmLRmD126HxoW6A
// Block: 244693759  Contract: core.onsocial.testnet
const REAL_CONTRACT_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPDATE","data":[{"operation":"contract_upgrade","author":"core.onsocial.testnet","partition_id":2162,"path":"core.onsocial.testnet/contract/upgrade","id":"upgrade","type":"contract","old_version":"0.1.0","new_version":"0.1.0"}]}"#;

// Source: tx=D2JXs6x3WfD6qsHvXW9XvAr5k7ZisKx2VLzpb7S1NS8T
// Block: 239409202  Contract: core.onsocial.testnet — meta_tx
const REAL_CONTRACT_UPDATE_META_TX: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPDATE","data":[{"operation":"set","author":"relayer.onsocial.testnet","partition_id":3797,"path":"test01.onsocial.testnet/meta_tx","id":"meta_tx","type":"meta_tx","target_id":"test01.onsocial.testnet","auth_type":"intent","actor_id":"test01.onsocial.testnet","payer_id":"relayer.onsocial.testnet"}]}"#;

#[test]
fn onchain_core_contract_update_upgrade() {
    let block = MockBlockBuilder::new(244_693_759, 1_775_000_000)
        .add_receipt(
            "core.onsocial.testnet",
            &[11, 12],
            vec![REAL_CONTRACT_UPDATE],
        )
        .build();
    let out = run_core(&block);
    assert_eq!(out.contract_updates.len(), 1);
    let cu = &out.contract_updates[0];
    assert_eq!(cu.operation, "contract_upgrade");
    assert_eq!(cu.author, "core.onsocial.testnet");
}

#[test]
fn onchain_core_contract_update_meta_tx() {
    let block = MockBlockBuilder::new(239_409_202, 1_772_000_000)
        .add_receipt(
            "core.onsocial.testnet",
            &[13, 14],
            vec![REAL_CONTRACT_UPDATE_META_TX],
        )
        .build();
    let out = run_core(&block);
    assert_eq!(out.contract_updates.len(), 1);
    let cu = &out.contract_updates[0];
    assert_eq!(cu.operation, "set");
}

// =============================================================================
// CORE — PERMISSION_UPDATE (real testnet event)
// =============================================================================

// Source: tx=2AikAt9otd1JJcAuDLjL8LdFsuRmHbUqGbsiqQjqzkeC
// Block: 239239773  Contract: core.onsocial.testnet
const REAL_PERMISSION_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"PERMISSION_UPDATE","data":[{"operation":"grant","author":"test01.onsocial.testnet","partition_id":1561,"target_id":"test02.onsocial.testnet","path":"groups/vote-test/content","id":"content","type":"content","group_id":"vote-test","group_path":"content","is_group_content":true,"level":1,"expires_at":"0","permission_nonce":1}]}"#;

#[test]
fn onchain_core_permission_update_grant() {
    let block = MockBlockBuilder::new(239_239_773, 1_772_000_000)
        .add_receipt(
            "core.onsocial.testnet",
            &[15, 16],
            vec![REAL_PERMISSION_UPDATE],
        )
        .build();
    let out = run_core(&block);
    assert_eq!(out.permission_updates.len(), 1);
    let pu = &out.permission_updates[0];
    assert_eq!(pu.operation, "grant");
    assert_eq!(pu.target_id, "test02.onsocial.testnet");
    assert_eq!(pu.level, 1);
    assert_eq!(pu.permission_nonce, 1);
}

// =============================================================================
// CORE — Multi-event receipt (real testnet: meta_tx + data_update in one receipt)
// =============================================================================

#[test]
fn onchain_core_multi_event_receipt() {
    // From tx=D2JXs6x3WfD6qsHvXW9XvAr5k7ZisKx2VLzpb7S1NS8T
    // This tx emits CONTRACT_UPDATE (meta_tx) + DATA_UPDATE (profile) in one receipt.
    let data_update = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"test01.onsocial.testnet","partition_id":3797,"path":"test01.onsocial.testnet/profile/jwt_test","id":"jwt_test","type":"profile","value":"JWT gasless write at 2026-03-03T15:15:36.000Z"}]}"#;

    let block = MockBlockBuilder::new(239_409_202, 1_772_000_000)
        .add_receipt(
            "core.onsocial.testnet",
            &[20, 21],
            vec![REAL_CONTRACT_UPDATE_META_TX, data_update],
        )
        .build();
    let out = run_core(&block);
    assert_eq!(out.contract_updates.len(), 1);
    assert_eq!(out.data_updates.len(), 1);
    assert_eq!(out.contract_updates[0].operation, "set");
    assert_eq!(out.data_updates[0].data_type, "profile");
}

// =============================================================================
// BOOST — BOOST_LOCK (real testnet event)
// =============================================================================

// Source: tx=FqBq8AJDKivYdgTEUFvwGMpqaSwPmKaNWs6zKXqg6wV8
// Block: 244426030  Contract: boost.onsocial.testnet
const REAL_BOOST_LOCK: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"1000000000000000000","months":1,"effective_boost":"4200000000000000000","account_id":"test06.onsocial.testnet"}]}"#;

#[test]
fn onchain_boost_lock() {
    let block = MockBlockBuilder::new(244_426_030, 1_775_000_000)
        .add_receipt("boost.onsocial.testnet", &[30, 31], vec![REAL_BOOST_LOCK])
        .build();
    let out = run_boost(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "BOOST_LOCK");
    assert_eq!(e.account_id, "test06.onsocial.testnet");
    assert!(e.success);
    match e.payload.as_ref().unwrap() {
        Payload::BoostLock(p) => {
            assert_eq!(p.amount, "1000000000000000000");
            assert_eq!(p.months, 1);
            assert_eq!(p.effective_boost, "4200000000000000000");
        }
        other => panic!("Expected BoostLock, got {:?}", other),
    }
}

// =============================================================================
// BOOST — REWARDS_RELEASED (real testnet event)
// =============================================================================

// Source: tx=HQWUYaxkpsqndQgQc7QbpLkfUjq93oP7b5do19kPuHWU
// Block: 244683113  Contract: boost.onsocial.testnet
const REAL_REWARDS_RELEASED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARDS_RELEASED","data":[{"amount":"2045740631251145543857","elapsed_ns":"82489320144115","total_released":"11243098652826223335309","remaining_pool":"149988756901347173776664691","account_id":"boost.onsocial.testnet"}]}"#;

#[test]
fn onchain_boost_rewards_released() {
    let block = MockBlockBuilder::new(244_683_113, 1_775_000_000)
        .add_receipt(
            "boost.onsocial.testnet",
            &[32, 33],
            vec![REAL_REWARDS_RELEASED],
        )
        .build();
    let out = run_boost(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "REWARDS_RELEASED");
    match e.payload.as_ref().unwrap() {
        Payload::RewardsReleased(p) => {
            assert_eq!(p.amount, "2045740631251145543857");
            assert_eq!(p.elapsed_ns, "82489320144115");
            assert_eq!(p.total_released, "11243098652826223335309");
            assert_eq!(p.remaining_pool, "149988756901347173776664691");
        }
        other => panic!("Expected RewardsReleased, got {:?}", other),
    }
}

// =============================================================================
// BOOST — REWARDS_CLAIM (real testnet event)
// =============================================================================

// Source: tx=HQWUYaxkpsqndQgQc7QbpLkfUjq93oP7b5do19kPuHWU
// Block: 244683113  Contract: boost.onsocial.testnet
const REAL_REWARDS_CLAIM: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARDS_CLAIM","data":[{"amount":"1823675236833784553922","account_id":"greenghost.onsocial.testnet"}]}"#;

#[test]
fn onchain_boost_rewards_claim() {
    let block = MockBlockBuilder::new(244_683_113, 1_775_000_000)
        .add_receipt(
            "boost.onsocial.testnet",
            &[34, 35],
            vec![REAL_REWARDS_CLAIM],
        )
        .build();
    let out = run_boost(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "REWARDS_CLAIM");
    assert_eq!(e.account_id, "greenghost.onsocial.testnet");
    match e.payload.as_ref().unwrap() {
        Payload::RewardsClaim(p) => {
            assert_eq!(p.amount, "1823675236833784553922");
        }
        other => panic!("Expected RewardsClaim, got {:?}", other),
    }
}

// =============================================================================
// REWARDS — POOL_DEPOSIT (real testnet event)
// =============================================================================

// Source: tx=98RpPuJ4itPPD1FpnrxzhNLAvwyA9GT8P2TDgooFpYem
// Block: 244059146  Contract: rewards.onsocial.testnet
const REAL_POOL_DEPOSIT: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"POOL_DEPOSIT","data":[{"amount":"399999911750000000000000000","new_balance":"400000000000000000000000000","account_id":"governance.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_pool_deposit() {
    let block = MockBlockBuilder::new(244_059_146, 1_775_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[40, 41],
            vec![REAL_POOL_DEPOSIT],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "POOL_DEPOSIT");
    assert_eq!(e.account_id, "governance.onsocial.testnet");
}

// =============================================================================
// REWARDS — CONTRACT_UPGRADE (real testnet event)
// =============================================================================

// Source: tx=GnHcp6HjWL2fdmwT84wy8D4drJpJkUZBy65DJUoc8cUP
// Block: 244545819  Contract: rewards.onsocial.testnet
const REAL_REWARDS_CONTRACT_UPGRADE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPGRADE","data":[{"old_version":"0.1.0","new_version":"0.1.0","account_id":"governance.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_contract_upgrade() {
    let block = MockBlockBuilder::new(244_545_819, 1_775_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[42, 43],
            vec![REAL_REWARDS_CONTRACT_UPGRADE],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "CONTRACT_UPGRADE");
}

// =============================================================================
// REWARDS — APP_REGISTERED (real testnet event — hits unknown catch-all)
// =============================================================================

// Source: tx=BPh5KvzZkPU2n9GkPDi2ppbT6tMH1kLzATH1HyAf4qia
// Block: 244386524  Contract: rewards.onsocial.testnet
const REAL_APP_REGISTERED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"APP_REGISTERED","data":[{"app_id":"test_community_02","daily_cap":"1000000000000000000","reward_per_action":"100000000000000000","total_budget":"750000000000000000000000","daily_budget":"7500000000000000000000","account_id":"governance.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_app_registered() {
    // APP_REGISTERED is now a typed payload in the rewards decoder.
    let block = MockBlockBuilder::new(244_386_524, 1_775_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[44, 45],
            vec![REAL_APP_REGISTERED],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "APP_REGISTERED");
    assert_eq!(e.account_id, "governance.onsocial.testnet");
    match e.payload.as_ref().unwrap() {
        crate::pb::rewards::v1::rewards_event::Payload::AppRegistered(p) => {
            assert_eq!(p.app_id, "test_community_02");
            assert_eq!(p.daily_cap, "1000000000000000000");
            assert_eq!(p.reward_per_action, "100000000000000000");
            assert_eq!(p.total_budget, "750000000000000000000000");
            assert_eq!(p.daily_budget, "7500000000000000000000");
        }
        other => panic!("Expected AppRegistered, got {:?}", other),
    }
}

// =============================================================================
// TOKEN — ft_transfer (real testnet event from boost claim flow)
// =============================================================================

// Source: tx=HQWUYaxkpsqndQgQc7QbpLkfUjq93oP7b5do19kPuHWU
// Block: 244683113  Contract: token.onsocial.testnet
const REAL_FT_TRANSFER: &str = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"boost.onsocial.testnet","new_owner_id":"greenghost.onsocial.testnet","amount":"1823675236833784553922"}]}"#;

#[test]
fn onchain_token_ft_transfer() {
    let block = MockBlockBuilder::new(244_683_113, 1_775_000_000)
        .add_receipt("token.onsocial.testnet", &[50, 51], vec![REAL_FT_TRANSFER])
        .build();
    let out = run_token(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "ft_transfer");
}

// =============================================================================
// TOKEN — ft_transfer for credits purchase (real testnet)
// =============================================================================

// Source: tx=FqBq8AJDKivYdgTEUFvwGMpqaSwPmKaNWs6zKXqg6wV8
// Block: 244426030  Contract: token.onsocial.testnet
const REAL_FT_TRANSFER_PURCHASE: &str = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"test06.onsocial.testnet","new_owner_id":"boost.onsocial.testnet","amount":"1000000000000000000"}]}"#;

#[test]
fn onchain_token_ft_transfer_to_boost() {
    let block = MockBlockBuilder::new(244_426_030, 1_775_000_000)
        .add_receipt(
            "token.onsocial.testnet",
            &[52, 53],
            vec![REAL_FT_TRANSFER_PURCHASE],
        )
        .build();
    let out = run_token(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "ft_transfer");
}

// =============================================================================
// TOKEN — ft_transfer for pool deposit (real testnet)
// =============================================================================

// Source: tx=98RpPuJ4itPPD1FpnrxzhNLAvwyA9GT8P2TDgooFpYem
// Block: 244059146  Contract: token.onsocial.testnet
const REAL_FT_TRANSFER_POOL: &str = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"governance.onsocial.testnet","new_owner_id":"rewards.onsocial.testnet","amount":"399999911750000000000000000"}]}"#;

#[test]
fn onchain_token_ft_transfer_to_rewards_pool() {
    let block = MockBlockBuilder::new(244_059_146, 1_775_000_000)
        .add_receipt(
            "token.onsocial.testnet",
            &[54, 55],
            vec![REAL_FT_TRANSFER_POOL],
        )
        .build();
    let out = run_token(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "ft_transfer");
}

// =============================================================================
// COMBINED — Multi-contract block from a single claim_rewards flow (real testnet)
// =============================================================================

#[test]
fn onchain_combined_claim_rewards_flow() {
    // tx=HQWUYaxkpsqndQgQc7QbpLkfUjq93oP7b5do19kPuHWU produces events across
    // boost.onsocial.testnet (REWARDS_RELEASED, REWARDS_CLAIM) and
    // token.onsocial.testnet (ft_transfer) in one block.
    let block = MockBlockBuilder::new(244_683_113, 1_775_000_000)
        .add_receipt("boost.onsocial.testnet", &[60], vec![REAL_REWARDS_RELEASED])
        .add_receipt("token.onsocial.testnet", &[61], vec![REAL_FT_TRANSFER])
        .add_receipt("boost.onsocial.testnet", &[62], vec![REAL_REWARDS_CLAIM])
        .build();

    let contracts = vec![
        ("core".to_string(), "core.onsocial.testnet".to_string()),
        ("boost".to_string(), "boost.onsocial.testnet".to_string()),
        (
            "rewards".to_string(),
            "rewards.onsocial.testnet".to_string(),
        ),
        ("token".to_string(), "token.onsocial.testnet".to_string()),
        (
            "scarces".to_string(),
            "scarces.onsocial.testnet".to_string(),
        ),
    ];
    let ctx = block_context(&block);

    let mut boost_events = Vec::new();
    let mut token_events = Vec::new();

    for_each_event_log_multi(&block, &contracts, |log| match log.label {
        "boost" => {
            if let Some(e) = decode_boost_event(
                log.json_data,
                &log.receipt_id,
                ctx.block_height,
                ctx.block_timestamp,
                log.log_index,
            ) {
                boost_events.push(e);
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
        _ => {}
    });

    // Boost should see REWARDS_RELEASED + REWARDS_CLAIM
    assert_eq!(boost_events.len(), 2);
    assert_eq!(boost_events[0].event_type, "REWARDS_RELEASED");
    assert_eq!(boost_events[1].event_type, "REWARDS_CLAIM");

    // Token should see ft_transfer
    assert_eq!(token_events.len(), 1);
    assert_eq!(token_events[0].event_type, "ft_transfer");
}

// =============================================================================
// SCARCES helper pipeline
// =============================================================================

fn run_scarces(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> ScarcesOutput {
    let ctx = block_context(block);
    let mut events = Vec::new();
    for_each_event_log(block, Some("scarces.onsocial.testnet"), |log| {
        if let Some(e) = decode_scarces_event(
            log.json_data,
            &log.receipt_id,
            ctx.block_height,
            ctx.block_timestamp,
            log.log_index,
        ) {
            events.push(e);
        }
    });
    ScarcesOutput {
        events,
        block_height: ctx.block_height,
        block_timestamp: ctx.block_timestamp,
        block_hash: ctx.block_hash,
    }
}

// =============================================================================
// REWARDS — EXECUTOR_ADDED (real testnet event)
// =============================================================================

// Source: tx=3nbfqASEJbGM8VzT5n3CtAazuqDdL5ehYB176XZpBH5t
// Contract: rewards.onsocial.testnet
const REAL_EXECUTOR_ADDED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"EXECUTOR_ADDED","data":[{"executor":"test-executor.testnet","account_id":"governance.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_executor_added() {
    let block = MockBlockBuilder::new(245_000_001, 1_776_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[70, 71],
            vec![REAL_EXECUTOR_ADDED],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "EXECUTOR_ADDED");
    assert_eq!(e.account_id, "governance.onsocial.testnet");
    match e.payload.as_ref().unwrap() {
        crate::pb::rewards::v1::rewards_event::Payload::ExecutorAdded(p) => {
            assert_eq!(p.executor, "test-executor.testnet");
        }
        other => panic!("Expected ExecutorAdded, got {:?}", other),
    }
}

// =============================================================================
// REWARDS — EXECUTOR_REMOVED (real testnet event)
// =============================================================================

// Source: tx=7jKzMZcQAWFrDeXsFdD9ywVZpdETAbJfZpquSh9HfHah
const REAL_EXECUTOR_REMOVED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"EXECUTOR_REMOVED","data":[{"executor":"test-executor.testnet","account_id":"governance.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_executor_removed() {
    let block = MockBlockBuilder::new(245_000_002, 1_776_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[72, 73],
            vec![REAL_EXECUTOR_REMOVED],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "EXECUTOR_REMOVED");
    match e.payload.as_ref().unwrap() {
        crate::pb::rewards::v1::rewards_event::Payload::ExecutorRemoved(p) => {
            assert_eq!(p.executor, "test-executor.testnet");
        }
        other => panic!("Expected ExecutorRemoved, got {:?}", other),
    }
}

// =============================================================================
// REWARDS — CALLER_ADDED (real testnet event)
// =============================================================================

// Source: tx=84XRgU8mYh2YG4sd8fuCh3anUdp5i8oLC37gZUFqcC4u
const REAL_CALLER_ADDED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"CALLER_ADDED","data":[{"caller":"test-caller.testnet","account_id":"governance.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_caller_added() {
    let block = MockBlockBuilder::new(245_000_003, 1_776_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[74, 75],
            vec![REAL_CALLER_ADDED],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "CALLER_ADDED");
    match e.payload.as_ref().unwrap() {
        crate::pb::rewards::v1::rewards_event::Payload::CallerAdded(p) => {
            assert_eq!(p.caller, "test-caller.testnet");
        }
        other => panic!("Expected CallerAdded, got {:?}", other),
    }
}

// =============================================================================
// REWARDS — CALLER_REMOVED (real testnet event)
// =============================================================================

// Source: tx=2wYKrm2766cuJan8T9gzdoHEB4UudZBe9GJ5GPLocRFy
const REAL_CALLER_REMOVED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"CALLER_REMOVED","data":[{"caller":"test-caller.testnet","account_id":"governance.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_caller_removed() {
    let block = MockBlockBuilder::new(245_000_004, 1_776_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[76, 77],
            vec![REAL_CALLER_REMOVED],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "CALLER_REMOVED");
    match e.payload.as_ref().unwrap() {
        crate::pb::rewards::v1::rewards_event::Payload::CallerRemoved(p) => {
            assert_eq!(p.caller, "test-caller.testnet");
        }
        other => panic!("Expected CallerRemoved, got {:?}", other),
    }
}

// =============================================================================
// REWARDS — MAX_DAILY_UPDATED (real testnet event)
// =============================================================================

// Source: tx=FsHqRabh8KJpeQiodJCnJYjpWYtdH76taJwJqCSFDPHR
const REAL_MAX_DAILY_UPDATED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"MAX_DAILY_UPDATED","data":[{"old_max":"1000000000000000000","new_max":"2000000000000000000","account_id":"governance.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_max_daily_updated() {
    let block = MockBlockBuilder::new(245_000_005, 1_776_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[78, 79],
            vec![REAL_MAX_DAILY_UPDATED],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "MAX_DAILY_UPDATED");
    match e.payload.as_ref().unwrap() {
        crate::pb::rewards::v1::rewards_event::Payload::MaxDailyUpdated(p) => {
            assert_eq!(p.old_max, "1000000000000000000");
            assert_eq!(p.new_max, "2000000000000000000");
        }
        other => panic!("Expected MaxDailyUpdated, got {:?}", other),
    }
}

// =============================================================================
// REWARDS — APP_UPDATED (real testnet event)
// =============================================================================

// Source: tx=G2DvdFpxZb3DNAfNQWYkubAXw5o5sXToXfgDmfjquaDe
const REAL_APP_UPDATED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"APP_UPDATED","data":[{"app_id":"test_community_02","daily_cap":"2000000000000000000","reward_per_action":"200000000000000000","active":true,"total_budget":"750000000000000000000000","daily_budget":"7500000000000000000000","account_id":"governance.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_app_updated() {
    let block = MockBlockBuilder::new(245_000_006, 1_776_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[80, 81],
            vec![REAL_APP_UPDATED],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "APP_UPDATED");
    assert_eq!(e.account_id, "governance.onsocial.testnet");
    match e.payload.as_ref().unwrap() {
        crate::pb::rewards::v1::rewards_event::Payload::AppUpdated(p) => {
            assert_eq!(p.app_id, "test_community_02");
            assert_eq!(p.daily_cap, "2000000000000000000");
            assert_eq!(p.reward_per_action, "200000000000000000");
            assert!(p.active);
            assert_eq!(p.total_budget, "750000000000000000000000");
            assert_eq!(p.daily_budget, "7500000000000000000000");
        }
        other => panic!("Expected AppUpdated, got {:?}", other),
    }
}

// =============================================================================
// REWARDS — REWARD_CREDITED (real testnet event)
// =============================================================================

// Source: tx=6oeaZxj7FjDpRbfgtP1CmTBvk1wdkqJvYb5i6ct5We7S
const REAL_REWARD_CREDITED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CREDITED","data":[{"amount":"100000000000000000","source":"engagement","credited_by":"governance.onsocial.testnet","app_id":"test_community_02","account_id":"test03.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_reward_credited() {
    let block = MockBlockBuilder::new(245_000_007, 1_776_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[82, 83],
            vec![REAL_REWARD_CREDITED],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "REWARD_CREDITED");
    assert_eq!(e.account_id, "test03.onsocial.testnet");
    match e.payload.as_ref().unwrap() {
        crate::pb::rewards::v1::rewards_event::Payload::RewardCredited(p) => {
            assert_eq!(p.amount, "100000000000000000");
            assert_eq!(p.source, "engagement");
            assert_eq!(p.credited_by, "governance.onsocial.testnet");
            assert_eq!(p.app_id, "test_community_02");
        }
        other => panic!("Expected RewardCredited, got {:?}", other),
    }
}

// =============================================================================
// REWARDS — REWARD_CLAIMED (real testnet event)
// =============================================================================

// Source: tx=2L31r5nYeTKL26VvwuNppHiZCPpmAWMDTkfYMQJBSiKz
const REAL_REWARD_CLAIMED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CLAIMED","data":[{"amount":"100000000000000000","account_id":"test01.onsocial.testnet"}]}"#;

#[test]
fn onchain_rewards_reward_claimed() {
    let block = MockBlockBuilder::new(245_000_008, 1_776_000_000)
        .add_receipt(
            "rewards.onsocial.testnet",
            &[84, 85],
            vec![REAL_REWARD_CLAIMED],
        )
        .build();
    let out = run_rewards(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "REWARD_CLAIMED");
    assert_eq!(e.account_id, "test01.onsocial.testnet");
    match e.payload.as_ref().unwrap() {
        crate::pb::rewards::v1::rewards_event::Payload::RewardClaimed(p) => {
            assert_eq!(p.amount, "100000000000000000");
        }
        other => panic!("Expected RewardClaimed, got {:?}", other),
    }
}

// =============================================================================
// TOKEN — ft_burn (real testnet event)
// =============================================================================

// Source: tx=83rKvzeGzz4L7PXTuL3Z2SYAKEvo1hFgv1bJrYJ3mfau
const REAL_FT_BURN: &str = r#"{"standard":"nep141","version":"1.0.0","event":"ft_burn","data":[{"owner_id":"test01.onsocial.testnet","amount":"1000000000000000000","memo":"User burn"}]}"#;

#[test]
fn onchain_token_ft_burn() {
    let block = MockBlockBuilder::new(245_000_009, 1_776_000_000)
        .add_receipt("token.onsocial.testnet", &[86, 87], vec![REAL_FT_BURN])
        .build();
    let out = run_token(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "ft_burn");
}

// =============================================================================
// TOKEN — ft_transfer from rewards claim (real testnet event)
// =============================================================================

// Source: tx=2L31r5nYeTKL26VvwuNppHiZCPpmAWMDTkfYMQJBSiKz
const REAL_FT_TRANSFER_CLAIM: &str = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"rewards.onsocial.testnet","new_owner_id":"test01.onsocial.testnet","amount":"100000000000000000"}]}"#;

#[test]
fn onchain_token_ft_transfer_from_rewards_claim() {
    let block = MockBlockBuilder::new(245_000_010, 1_776_000_000)
        .add_receipt(
            "token.onsocial.testnet",
            &[88, 89],
            vec![REAL_FT_TRANSFER_CLAIM],
        )
        .build();
    let out = run_token(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "ft_transfer");
}

// =============================================================================
// BOOST — STORAGE_DEPOSIT (real testnet event)
// =============================================================================

// Source: tx=EiY9aCoHxNLQ1Wx7ATgKy1B9oEMpNQFo5zB5CTeSorzY
const REAL_BOOST_STORAGE_DEPOSIT: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_DEPOSIT","data":[{"deposit":"5000000000000000000000","account_id":"test02.onsocial.testnet"}]}"#;

#[test]
fn onchain_boost_storage_deposit() {
    let block = MockBlockBuilder::new(245_000_011, 1_776_000_000)
        .add_receipt(
            "boost.onsocial.testnet",
            &[90, 91],
            vec![REAL_BOOST_STORAGE_DEPOSIT],
        )
        .build();
    let out = run_boost(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "STORAGE_DEPOSIT");
    assert_eq!(e.account_id, "test02.onsocial.testnet");
    assert!(e.success);
    match e.payload.as_ref().unwrap() {
        Payload::StorageDeposit(p) => {
            assert_eq!(p.deposit, "5000000000000000000000");
        }
        other => panic!("Expected StorageDeposit, got {:?}", other),
    }
}

// =============================================================================
// BOOST — CREDITS_PURCHASE (real testnet event)
// =============================================================================

// Source: tx=GTH59mi3Lsa2VVSd7xhVvUyDrcB4jmSvnxib2GHwMq6K
const REAL_CREDITS_PURCHASE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"CREDITS_PURCHASE","data":[{"amount":"1000000000000000000","infra_share":"600000000000000000","rewards_share":"400000000000000000","account_id":"test01.onsocial.testnet"}]}"#;

#[test]
fn onchain_boost_credits_purchase() {
    let block = MockBlockBuilder::new(245_000_012, 1_776_000_000)
        .add_receipt(
            "boost.onsocial.testnet",
            &[92, 93],
            vec![REAL_CREDITS_PURCHASE],
        )
        .build();
    let out = run_boost(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "CREDITS_PURCHASE");
    assert_eq!(e.account_id, "test01.onsocial.testnet");
    assert!(e.success);
    match e.payload.as_ref().unwrap() {
        Payload::CreditsPurchase(p) => {
            assert_eq!(p.amount, "1000000000000000000");
            assert_eq!(p.infra_share, "600000000000000000");
            assert_eq!(p.rewards_share, "400000000000000000");
        }
        other => panic!("Expected CreditsPurchase, got {:?}", other),
    }
}

// =============================================================================
// BOOST — BOOST_EXTEND (real testnet event)
// =============================================================================

// Source: tx=7pm4HiVinKvQcZCzZjE9V3SVxEeX2aUstQNSYZhNgP96
const REAL_BOOST_EXTEND: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_EXTEND","data":[{"new_months":6,"new_effective_boost":"4400000000000000000","account_id":"test06.onsocial.testnet"}]}"#;

#[test]
fn onchain_boost_extend() {
    let block = MockBlockBuilder::new(245_000_013, 1_776_000_000)
        .add_receipt("boost.onsocial.testnet", &[94, 95], vec![REAL_BOOST_EXTEND])
        .build();
    let out = run_boost(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "BOOST_EXTEND");
    assert_eq!(e.account_id, "test06.onsocial.testnet");
    assert!(e.success);
    match e.payload.as_ref().unwrap() {
        Payload::BoostExtend(p) => {
            assert_eq!(p.new_months, 6);
            assert_eq!(p.new_effective_boost, "4400000000000000000");
        }
        other => panic!("Expected BoostExtend, got {:?}", other),
    }
}

// =============================================================================
// BOOST — INFRA_WITHDRAW (real testnet event)
// =============================================================================

// Source: tx=6jw5VyzDR2ZJhMqxM4ZTXd61vgxvLDzKJoJA1crGET7
const REAL_INFRA_WITHDRAW: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"INFRA_WITHDRAW","data":[{"amount":"100000000000000000","receiver_id":"onsocial.testnet","account_id":"onsocial.testnet"}]}"#;

#[test]
fn onchain_boost_infra_withdraw() {
    let block = MockBlockBuilder::new(245_000_014, 1_776_000_000)
        .add_receipt(
            "boost.onsocial.testnet",
            &[96, 97],
            vec![REAL_INFRA_WITHDRAW],
        )
        .build();
    let out = run_boost(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "INFRA_WITHDRAW");
    assert_eq!(e.account_id, "onsocial.testnet");
    assert!(e.success);
    match e.payload.as_ref().unwrap() {
        Payload::InfraWithdraw(p) => {
            assert_eq!(p.amount, "100000000000000000");
            assert_eq!(p.receiver_id, "onsocial.testnet");
        }
        other => panic!("Expected InfraWithdraw, got {:?}", other),
    }
}

// =============================================================================
// BOOST — SCHEDULED_FUND (real testnet event)
// =============================================================================

// Source: tx=8MATospz18uo8tEBBi2s4jTkjqoRz2HKbwDMjc8RT1KA
const REAL_SCHEDULED_FUND: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"SCHEDULED_FUND","data":[{"amount":"1000000000000000000","total_pool":"149984378419894505520788876","account_id":"onsocial.testnet"}]}"#;

#[test]
fn onchain_boost_scheduled_fund() {
    let block = MockBlockBuilder::new(245_000_015, 1_776_000_000)
        .add_receipt(
            "boost.onsocial.testnet",
            &[98, 99],
            vec![REAL_SCHEDULED_FUND],
        )
        .build();
    let out = run_boost(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "SCHEDULED_FUND");
    assert_eq!(e.account_id, "onsocial.testnet");
    assert!(e.success);
    match e.payload.as_ref().unwrap() {
        Payload::ScheduledFund(p) => {
            assert_eq!(p.amount, "1000000000000000000");
            assert_eq!(p.total_pool, "149984378419894505520788876");
        }
        other => panic!("Expected ScheduledFund, got {:?}", other),
    }
}

// =============================================================================
// SCARCES — STORAGE_UPDATE (real testnet event)
// =============================================================================

// Source: tx=eZfnTJVJja2LrNLaRGptVJWw5JC7XeY7PMWqPXLUUDc
const REAL_SCARCES_STORAGE_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_UPDATE","data":[{"operation":"storage_deposit","author":"test01.onsocial.testnet","account_id":"test01.onsocial.testnet","deposit":"100000000000000000000000","new_balance":"2350000000000000000000014"}]}"#;

#[test]
fn onchain_scarces_storage_update() {
    let block = MockBlockBuilder::new(245_000_016, 1_776_000_000)
        .add_receipt(
            "scarces.onsocial.testnet",
            &[100, 101],
            vec![REAL_SCARCES_STORAGE_UPDATE],
        )
        .build();
    let out = run_scarces(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "STORAGE_UPDATE");
    assert_eq!(e.operation, "storage_deposit");
    assert_eq!(e.author, "test01.onsocial.testnet");
    assert_eq!(e.account_id, "test01.onsocial.testnet");
    assert_eq!(e.deposit, "100000000000000000000000");
    assert_eq!(e.new_balance, "2350000000000000000000014");
}

// =============================================================================
// SCARCES — SCARCE_UPDATE (real testnet event — quick_mint)
// =============================================================================

// Source: tx=7BqsNJANWzJequSo5wczxTa64BbrpYY53ivGMBZyido3
const REAL_SCARCE_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"SCARCE_UPDATE","data":[{"operation":"quick_mint","author":"test01.onsocial.testnet","token_id":"s:15","owner_id":"test01.onsocial.testnet"}]}"#;

#[test]
fn onchain_scarces_scarce_update_quick_mint() {
    let block = MockBlockBuilder::new(245_000_017, 1_776_000_000)
        .add_receipt(
            "scarces.onsocial.testnet",
            &[102, 103],
            vec![REAL_SCARCE_UPDATE],
        )
        .build();
    let out = run_scarces(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "SCARCE_UPDATE");
    assert_eq!(e.operation, "quick_mint");
    assert_eq!(e.author, "test01.onsocial.testnet");
    assert_eq!(e.token_id, "s:15");
    assert_eq!(e.owner_id, "test01.onsocial.testnet");
}

// =============================================================================
// SCARCES — COLLECTION_UPDATE (real testnet event — create)
// =============================================================================

// Source: tx=EEpCQ1ATBeb5KFrPzajk1FeMArShYuENPkFMgMffTF7q
const REAL_COLLECTION_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"COLLECTION_UPDATE","data":[{"operation":"create","author":"test01.onsocial.testnet","creator_id":"test01.onsocial.testnet","collection_id":"fixture_test_coll","total_supply":10,"price_near":"100000000000000000000000"}]}"#;

#[test]
fn onchain_scarces_collection_update_create() {
    let block = MockBlockBuilder::new(245_000_018, 1_776_000_000)
        .add_receipt(
            "scarces.onsocial.testnet",
            &[104, 105],
            vec![REAL_COLLECTION_UPDATE],
        )
        .build();
    let out = run_scarces(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "COLLECTION_UPDATE");
    assert_eq!(e.operation, "create");
    assert_eq!(e.creator_id, "test01.onsocial.testnet");
    assert_eq!(e.collection_id, "fixture_test_coll");
    assert_eq!(e.total_supply, 10);
    assert_eq!(e.price, "100000000000000000000000");
}

// =============================================================================
// SCARCES — LAZY_LISTING_UPDATE (real testnet event — created)
// =============================================================================

// Source: tx=AP2TYFRBmtypbbBuRpseFt45hNG1jJyDckQp7GM6bYb2
const REAL_LAZY_LISTING_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"LAZY_LISTING_UPDATE","data":[{"operation":"created","author":"test01.onsocial.testnet","creator_id":"test01.onsocial.testnet","listing_id":"ll:16","price":"500000000000000000000000"}]}"#;

#[test]
fn onchain_scarces_lazy_listing_update_created() {
    let block = MockBlockBuilder::new(245_000_019, 1_776_000_000)
        .add_receipt(
            "scarces.onsocial.testnet",
            &[106, 107],
            vec![REAL_LAZY_LISTING_UPDATE],
        )
        .build();
    let out = run_scarces(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "LAZY_LISTING_UPDATE");
    assert_eq!(e.operation, "created");
    assert_eq!(e.creator_id, "test01.onsocial.testnet");
    assert_eq!(e.listing_id, "ll:16");
    assert_eq!(e.price, "500000000000000000000000");
}

// =============================================================================
// SCARCES — OFFER_UPDATE (real testnet event — offer_made)
// =============================================================================

// Source: tx=C38cxnxEF2AVNQVfzNNoTcNUS1Aj79XKmvyqQ2TXJLrN
const REAL_OFFER_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"OFFER_UPDATE","data":[{"operation":"offer_made","author":"test03.onsocial.testnet","buyer_id":"test03.onsocial.testnet","token_id":"s:15","amount":"100000000000000000000000","expires_at":"1800000000000000000"}]}"#;

#[test]
fn onchain_scarces_offer_update_made() {
    let block = MockBlockBuilder::new(245_000_020, 1_776_000_000)
        .add_receipt(
            "scarces.onsocial.testnet",
            &[108, 109],
            vec![REAL_OFFER_UPDATE],
        )
        .build();
    let out = run_scarces(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "OFFER_UPDATE");
    assert_eq!(e.operation, "offer_made");
    assert_eq!(e.buyer_id, "test03.onsocial.testnet");
    assert_eq!(e.token_id, "s:15");
    assert_eq!(e.amount, "100000000000000000000000");
    assert_eq!(e.expires_at, 1_800_000_000_000_000_000);
}

// =============================================================================
// SCARCES — APP_POOL_UPDATE (real testnet event — register)
// =============================================================================

// Source: tx=7QS9bcRqBT3mMV9f23jRw97srWyWnm2kmRb5VkQp4fUL
const REAL_APP_POOL_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"APP_POOL_UPDATE","data":[{"operation":"register","author":"test01.onsocial.testnet","owner_id":"test01.onsocial.testnet","app_id":"test01.onsocial.testnet","initial_balance":"1000000000000000000000000"}]}"#;

#[test]
fn onchain_scarces_app_pool_update_register() {
    let block = MockBlockBuilder::new(245_000_021, 1_776_000_000)
        .add_receipt(
            "scarces.onsocial.testnet",
            &[110, 111],
            vec![REAL_APP_POOL_UPDATE],
        )
        .build();
    let out = run_scarces(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "APP_POOL_UPDATE");
    assert_eq!(e.operation, "register");
    assert_eq!(e.owner_id, "test01.onsocial.testnet");
    assert_eq!(e.app_id, "test01.onsocial.testnet");
    assert_eq!(e.initial_balance, "1000000000000000000000000");
}

// =============================================================================
// SCARCES — CONTRACT_UPDATE (real testnet event — add_intents_executor)
// =============================================================================

// Source: tx=Bm4ZTenmcS1G4NCjDVEuMrpAvok8Dmbfnt59238bE2NQ
const REAL_SCARCES_CONTRACT_UPDATE: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPDATE","data":[{"operation":"add_intents_executor","author":"onsocial.testnet","executor":"test-executor.testnet"}]}"#;

#[test]
fn onchain_scarces_contract_update_add_executor() {
    let block = MockBlockBuilder::new(245_000_022, 1_776_000_000)
        .add_receipt(
            "scarces.onsocial.testnet",
            &[112, 113],
            vec![REAL_SCARCES_CONTRACT_UPDATE],
        )
        .build();
    let out = run_scarces(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "CONTRACT_UPDATE");
    assert_eq!(e.operation, "add_intents_executor");
    assert_eq!(e.author, "onsocial.testnet");
    assert_eq!(e.executor, "test-executor.testnet");
}

// =============================================================================
// SCARCES — credit_unused_deposit (real testnet event from QuickMint flow)
// =============================================================================

// Source: tx=7BqsNJANWzJequSo5wczxTa64BbrpYY53ivGMBZyido3
const REAL_SCARCES_CREDIT_UNUSED: &str = r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_UPDATE","data":[{"operation":"credit_unused_deposit","author":"test01.onsocial.testnet","account_id":"test01.onsocial.testnet","amount":"10000000000000000000000","new_balance":"2360000000000000000000014"}]}"#;

#[test]
fn onchain_scarces_storage_credit_unused_deposit() {
    let block = MockBlockBuilder::new(245_000_023, 1_776_000_000)
        .add_receipt(
            "scarces.onsocial.testnet",
            &[114, 115],
            vec![REAL_SCARCES_CREDIT_UNUSED],
        )
        .build();
    let out = run_scarces(&block);
    assert_eq!(out.events.len(), 1);
    let e = &out.events[0];
    assert_eq!(e.event_type, "STORAGE_UPDATE");
    assert_eq!(e.operation, "credit_unused_deposit");
    assert_eq!(e.amount, "10000000000000000000000");
    assert_eq!(e.new_balance, "2360000000000000000000014");
}
