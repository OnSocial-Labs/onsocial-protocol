//! Tests for member_invite.rs execution
//!
//! Covers:
//! - member_invited event includes member_nonce and member_nonce_path fields
//! - member_invited event includes path field (member storage path)
//!
//! Note: Proposer blacklisted during execution is covered indirectly by
//! join_request_execution_fixes_tests.rs (same has_recoverable_execution_errors path).

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};
use std::path::Path;

use crate::core_onsocial_tests::find_events_by_operation;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

fn load_core_onsocial_wasm() -> anyhow::Result<Vec<u8>> {
    let paths = [
        "../target/near/core_onsocial/core_onsocial.wasm",
        "target/near/core_onsocial/core_onsocial.wasm",
        "/code/target/near/core_onsocial/core_onsocial.wasm",
    ];

    for path in paths {
        if let Ok(wasm) = std::fs::read(Path::new(path)) {
            return Ok(wasm);
        }
    }

    Err(anyhow::anyhow!("Could not find core_onsocial.wasm"))
}

async fn deploy_core_onsocial(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> anyhow::Result<Contract> {
    let wasm = load_core_onsocial_wasm()?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract.call("new").args_json(json!({})).transact().await?.into_result()?;
    contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn create_user(root: &Account, name: &str, balance: NearToken) -> anyhow::Result<Account> {
    let user = root
        .create_subaccount(name)
        .initial_balance(balance)
        .transact()
        .await?
        .into_result()?;
    Ok(user)
}

// =============================================================================
// MEMBER_INVITED EVENT: MEMBER_NONCE AND MEMBER_NONCE_PATH
// =============================================================================

/// Tests that member_invited event includes member_nonce and member_nonce_path fields.
/// This validates parity with join_request_approved event schema.
#[tokio::test]
async fn test_member_invited_event_includes_member_nonce() -> anyhow::Result<()> {
    println!("\n=== Test: member_invited Event Includes member_nonce ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven group (Alice is sole member, proposals auto-execute)
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "invite-nonce-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    println!("   ✓ Group created");

    // Alice invites Bob (auto-executes since Alice is sole member)
    let invite_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invite-nonce-test", "proposal_type": "member_invite", "changes": {
                    "target_user": bob.id().to_string(),
                    "message": "Welcome Bob"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(invite_result.is_success(), "Invite should succeed: {:?}", invite_result.failures());
    println!("   ✓ Invite proposal created and auto-executed");

    // Find member_invited event
    let logs: Vec<String> = invite_result.logs().iter().map(|s| s.to_string()).collect();
    let events = find_events_by_operation(&logs, "member_invited");

    assert!(
        !events.is_empty(),
        "member_invited event should be emitted"
    );
    println!("   ✓ member_invited event emitted");

    let event_data = &events[0].data[0].extra;

    // VERIFICATION 1: member_nonce field exists
    let member_nonce = event_data.get("member_nonce");
    assert!(
        member_nonce.is_some(),
        "Event should include member_nonce field"
    );
    let nonce_value = member_nonce.unwrap().as_u64();
    assert!(
        nonce_value.is_some() && nonce_value.unwrap() > 0,
        "member_nonce should be a positive number, got: {:?}",
        member_nonce
    );
    println!("   ✓ member_nonce: {}", nonce_value.unwrap());

    // VERIFICATION 2: member_nonce_path field exists
    let member_nonce_path = event_data.get("member_nonce_path");
    assert!(
        member_nonce_path.is_some(),
        "Event should include member_nonce_path field"
    );
    let expected_path = format!("groups/invite-nonce-test/member_nonces/{}", bob.id());
    assert_eq!(
        member_nonce_path.unwrap().as_str(),
        Some(expected_path.as_str()),
        "member_nonce_path should match expected format"
    );
    println!("   ✓ member_nonce_path: {}", expected_path);

    // VERIFICATION 3: path field exists (member storage path)
    let path = event_data.get("path");
    assert!(
        path.is_some(),
        "Event should include path field (member storage path)"
    );
    let expected_member_path = format!("groups/invite-nonce-test/members/{}", bob.id());
    assert_eq!(
        path.unwrap().as_str(),
        Some(expected_member_path.as_str()),
        "path should be the member storage path"
    );
    println!("   ✓ path: {}", expected_member_path);

    // VERIFICATION 4: Other expected fields still present
    assert!(event_data.get("group_id").is_some(), "group_id should exist");
    assert!(event_data.get("level").is_some(), "level should exist");
    assert!(event_data.get("target_id").is_some(), "target_id should exist");
    assert!(event_data.get("proposal_id").is_some(), "proposal_id should exist");
    println!("   ✓ All expected event fields present");

    println!("✅ member_invited event includes member nonce fields");
    Ok(())
}
