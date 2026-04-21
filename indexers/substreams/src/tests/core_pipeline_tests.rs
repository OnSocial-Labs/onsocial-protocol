//! Integration tests for the core-onsocial pipeline.
//!
//! Tests: mock Block → block_walker → core_decoder → process_core_log → Output
//! Verifies that contract EVENT_JSON logs produce correct typed protobuf output.

use crate::block_walker::{block_context, for_each_event_log};
use crate::pb::core_onsocial::v1::*;
use crate::process_core_log;
use crate::tests::mock_block::MockBlockBuilder;

const CONTRACT: &str = "core.onsocial.near";

/// Run the full core pipeline on a mock block and return the Output.
fn run_core_pipeline(block: &substreams_near::pb::sf::near::r#type::v1::Block) -> Output {
    let filter = Some(CONTRACT);
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

// =============================================================================
// DATA_UPDATE
// =============================================================================

#[test]
fn core_data_update_post() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"alice.near","path":"alice.near/post/main","value":"{\"text\":\"Hello world\"}"}]}"#;
    let block = MockBlockBuilder::new(233_085_000, 1_700_000_000)
        .add_receipt(CONTRACT, &[10, 20, 30], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.data_updates.len(), 1);
    assert_eq!(output.block_height, 233_085_000);

    let du = &output.data_updates[0];
    assert_eq!(du.operation, "set");
    assert_eq!(du.author, "alice.near");
    assert_eq!(du.account_id, "alice.near");
    assert_eq!(du.data_type, "post");
    assert_eq!(du.data_id, "main");
    assert_eq!(du.path, "alice.near/post/main");
    assert!(du.value.contains("Hello world"));
    assert!(!du.id.is_empty());
    assert!(du.id.ends_with("-data"));
}

#[test]
fn core_data_update_profile() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"bob.near","path":"bob.near/profile","value":"{\"name\":\"Bob\"}"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let du = &output.data_updates[0];
    assert_eq!(du.account_id, "bob.near");
    assert_eq!(du.data_type, "profile");
}

#[test]
fn core_data_update_with_graph_target() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"alice.near","path":"alice.near/graph/follow/bob.near","value":""}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let du = &output.data_updates[0];
    assert_eq!(du.target_account, "bob.near");
}

#[test]
fn core_data_update_batch() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"alice.near","path":"alice.near/post/1","value":"a"},{"operation":"set","author":"alice.near","path":"alice.near/post/2","value":"b"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.data_updates.len(), 2);
    assert_eq!(output.data_updates[0].data_id, "1");
    assert_eq!(output.data_updates[1].data_id, "2");
}

#[test]
fn core_data_update_with_parent_ref() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"bob.near","path":"bob.near/post/reply1","value":"{\"parent\":\"alice.near/post/main\",\"parentType\":\"post\",\"text\":\"reply\"}"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let du = &output.data_updates[0];
    assert_eq!(du.parent_path, "alice.near/post/main");
    assert_eq!(du.parent_author, "alice.near");
    assert_eq!(du.parent_type, "post");
}

#[test]
fn core_data_update_with_group_content() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"alice.near","path":"alice.near/post/g1","value":"content","group_id":"my_group","group_path":"groups/my_group","is_group_content":true}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let du = &output.data_updates[0];
    assert_eq!(du.group_id, "my_group");
    assert_eq!(du.group_path, "groups/my_group");
    assert!(du.is_group_content);
}

#[test]
fn core_data_update_with_group_content_path_is_classified_as_post() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"alice.near","path":"alice.near/groups/my_group/content/post/g1","value":"{\"text\":\"hello\"}","group_id":"my_group","group_path":"content/post/g1","is_group_content":true}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let du = &output.data_updates[0];
    assert_eq!(du.account_id, "alice.near");
    assert_eq!(du.data_type, "post");
    assert_eq!(du.data_id, "g1");
    assert_eq!(du.group_id, "my_group");
    assert_eq!(du.group_path, "content/post/g1");
}

#[test]
fn core_group_update_group_post_also_materializes_as_data_update() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"GROUP_UPDATE","data":[{"operation":"create","author":"alice.near","path":"alice.near/groups/my_group/content/post/g1","value":{"text":"hello"},"id":"g1","type":"content","group_id":"my_group","group_path":"content/post/g1","is_group_content":true}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.group_updates.len(), 1);
    assert_eq!(output.data_updates.len(), 1);

    let du = &output.data_updates[0];
    assert_eq!(du.operation, "set");
    assert_eq!(du.account_id, "alice.near");
    assert_eq!(du.data_type, "post");
    assert_eq!(du.data_id, "g1");
    assert_eq!(du.group_id, "my_group");
    assert!(du.is_group_content);
}

#[test]
fn core_data_update_remove_operation() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"remove","author":"alice.near","path":"alice.near/post/old"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let du = &output.data_updates[0];
    assert_eq!(du.operation, "remove");
}

// =============================================================================
// STORAGE_UPDATE
// =============================================================================

#[test]
fn core_storage_update_deposit() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_UPDATE","data":[{"operation":"storage_deposit","author":"alice.near","amount":"5000000000000000000000","previous_balance":"0","new_balance":"5000000000000000000000"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.storage_updates.len(), 1);
    let su = &output.storage_updates[0];
    assert_eq!(su.operation, "storage_deposit");
    assert_eq!(su.amount, "5000000000000000000000");
    assert_eq!(su.previous_balance, "0");
    assert_eq!(su.new_balance, "5000000000000000000000");
    assert!(su.id.ends_with("-storage"));
}

#[test]
fn core_storage_update_pool_operations() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_UPDATE","data":[{"operation":"pool_deposit","author":"sponsor.near","pool_id":"p1","pool_key":"sponsor.near","amount":"100","previous_pool_balance":"0","new_pool_balance":"100","pool_account":"sponsored.near"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let su = &output.storage_updates[0];
    assert_eq!(su.pool_id, "p1");
    assert_eq!(su.pool_key, "sponsor.near");
    assert_eq!(su.pool_account, "sponsored.near");
    assert_eq!(su.new_pool_balance, "100");
}

// =============================================================================
// GROUP_UPDATE
// =============================================================================

#[test]
fn core_group_update_create() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"GROUP_UPDATE","data":[{"operation":"create_group","author":"alice.near","group_id":"dao1","name":"My DAO","is_public":true,"creator_role":"admin","storage_allocation":"50000"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.group_updates.len(), 1);
    let gu = &output.group_updates[0];
    assert_eq!(gu.operation, "create_group");
    assert_eq!(gu.group_id, "dao1");
    assert_eq!(gu.name, "My DAO");
    assert!(gu.is_public);
    assert_eq!(gu.creator_role, "admin");
    assert!(gu.id.ends_with("-group"));
}

#[test]
fn core_group_update_add_member() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"GROUP_UPDATE","data":[{"operation":"add_member","author":"alice.near","group_id":"dao1","target_id":"bob.near","role":"member","level":1}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let gu = &output.group_updates[0];
    assert_eq!(gu.member_id, "bob.near");
    assert_eq!(gu.role, "member");
    assert_eq!(gu.level, 1);
}

#[test]
fn core_group_update_proposal_vote() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"GROUP_UPDATE","data":[{"operation":"vote","author":"charlie.near","group_id":"dao1","proposal_id":"p1","voter":"charlie.near","approve":true,"yes_votes":3,"no_votes":1,"should_execute":false}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let gu = &output.group_updates[0];
    assert_eq!(gu.proposal_id, "p1");
    assert_eq!(gu.voter, "charlie.near");
    assert!(gu.approve);
    assert_eq!(gu.yes_votes, 3);
    assert_eq!(gu.no_votes, 1);
    assert!(!gu.should_execute);
}

// =============================================================================
// CONTRACT_UPDATE
// =============================================================================

#[test]
fn core_contract_update_meta_tx() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPDATE","data":[{"operation":"meta_tx","author":"relayer.near","target_id":"alice.near","auth_type":"delegate","actor_id":"alice.near","payer_id":"relayer.near"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.contract_updates.len(), 1);
    let cu = &output.contract_updates[0];
    assert_eq!(cu.operation, "meta_tx");
    assert_eq!(cu.target_id, "alice.near");
    assert_eq!(cu.auth_type, "delegate");
    assert!(cu.id.ends_with("-contract"));
}

// =============================================================================
// PERMISSION_UPDATE
// =============================================================================

#[test]
fn core_permission_update_grant() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"PERMISSION_UPDATE","data":[{"operation":"grant","author":"alice.near","target_id":"bob.near","path":"alice.near/post","level":2,"expires_at":1700000000000000000}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.permission_updates.len(), 1);
    let pu = &output.permission_updates[0];
    assert_eq!(pu.operation, "grant");
    assert_eq!(pu.target_id, "bob.near");
    assert_eq!(pu.level, 2);
    assert_eq!(pu.expires_at, 1_700_000_000_000_000_000);
    assert!(pu.id.ends_with("-permission"));
}

#[test]
fn core_permission_update_revoke() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"PERMISSION_UPDATE","data":[{"operation":"revoke","author":"alice.near","target_id":"bob.near","path":"alice.near/post","deleted":true}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let pu = &output.permission_updates[0];
    assert_eq!(pu.operation, "revoke");
    assert!(pu.deleted);
}

// =============================================================================
// Filtering & edge cases
// =============================================================================

#[test]
fn core_ignores_non_onsocial_standard() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"a","new_owner_id":"b","amount":"100"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.data_updates.len(), 0);
    assert_eq!(output.storage_updates.len(), 0);
}

#[test]
fn core_ignores_wrong_version() {
    let json = r#"{"standard":"onsocial","version":"2.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"a","path":"a/b"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(
        output.data_updates.len(),
        0,
        "Version 2.x should be ignored"
    );
}

#[test]
fn core_ignores_unknown_event_types() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"UNKNOWN_EVENT","data":[{"operation":"test","author":"a"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.data_updates.len(), 0);
    assert_eq!(output.storage_updates.len(), 0);
    assert_eq!(output.group_updates.len(), 0);
}

#[test]
fn core_skips_malformed_json() {
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec!["not valid json at all"])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.data_updates.len(), 0);
}

#[test]
fn core_mixed_event_types_in_one_block() {
    let data_json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"a.near","path":"a.near/post/1","value":"x"}]}"#;
    let storage_json = r#"{"standard":"onsocial","version":"1.0.0","event":"STORAGE_UPDATE","data":[{"operation":"storage_deposit","author":"a.near","amount":"100","previous_balance":"0","new_balance":"100"}]}"#;
    let group_json = r#"{"standard":"onsocial","version":"1.0.0","event":"GROUP_UPDATE","data":[{"operation":"create_group","author":"a.near","group_id":"g1"}]}"#;

    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![data_json, storage_json, group_json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.data_updates.len(), 1);
    assert_eq!(output.storage_updates.len(), 1);
    assert_eq!(output.group_updates.len(), 1);
}

#[test]
fn core_filters_other_contracts_events() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"a.near","path":"a.near/post/1","value":"x"}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt("boost.onsocial.near", &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    assert_eq!(output.data_updates.len(), 0);
}

#[test]
fn core_extra_data_preserves_all_fields() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{"operation":"set","author":"alice.near","path":"alice.near/post/1","value":"x","custom_field":"custom_value","another":42}]}"#;
    let block = MockBlockBuilder::new(100, 1000)
        .add_receipt(CONTRACT, &[1], vec![json])
        .build();

    let output = run_core_pipeline(&block);
    let du = &output.data_updates[0];
    assert!(du.extra_data.contains("custom_field"));
    assert!(du.extra_data.contains("custom_value"));
}
