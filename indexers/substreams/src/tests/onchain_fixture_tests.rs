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
use crate::pb::token::v1::TokenOutput;
use crate::process_core_log;
use crate::rewards_decoder::decode_rewards_event;
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
