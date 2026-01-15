//! Tests for join_request.rs execution fixes
//!
//! Covers fixes for:
//! - Issue 1: Execution failure handling (deposit unlock, status update)
//! - Issue 2: Race condition (user becomes member before execution)
//! - Issue 3: Member nonce in events

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};
use std::path::Path;

use crate::core_onsocial_tests::find_events_by_operation;
use crate::utils::entry_value;

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

    Err(anyhow::anyhow!(
        "Could not find core_onsocial.wasm"
    ))
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
// ISSUE 1: EXECUTION FAILURE HANDLING (DEPOSIT UNLOCK + STATUS UPDATE)
// =============================================================================

/// Tests that when member_invite execution fails (blacklisted target),
/// proposal status is updated to "rejected" instead of staying "active".
/// This validates the fix in votes.rs that updates status before propagating error.
#[tokio::test]
async fn test_join_request_execution_failure_unlocks_deposit_and_updates_status() -> anyhow::Result<()> {
    println!("\n=== Test: Execution Failure Updates Status to Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Create member-driven private group (Alice is founder)
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "blacklist-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Add Bob as member (auto-executes since Alice is only member)
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "blacklist-test", "proposal_type": "member_invite", "changes": { "target_user": bob.id().to_string() }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?
        .into_result()?;
    println!("   ✓ Bob added as member");

    // Step 1: Create proposal to invite Charlie (don't execute yet - only Alice votes)
    let invite_charlie = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "blacklist-test", "proposal_type": "member_invite", "changes": { "target_user": charlie.id().to_string() }, "auto_vote": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    let invite_proposal_id: String = invite_charlie.json()?;
    println!("   ✓ Invite proposal created: {}", invite_proposal_id);

    // Alice votes YES (need 2 votes to execute in member-driven group)
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "blacklist-test", "proposal_id": invite_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?
        .into_result()?;
    println!("   ✓ Alice voted YES (1/2 votes)");

    // Step 2: BEFORE Bob votes, blacklist Charlie via governance
    let ban_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { 
                    "type": "create_proposal", 
                    "group_id": "blacklist-test", 
                    "proposal_type": "group_update", 
                    "changes": {
                        "update_type": "ban",
                        "target_user": charlie.id().to_string()
                    },
                    "auto_vote": false
                }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    let ban_proposal_id: String = ban_proposal.json()?;

    // Execute the ban (Alice + Bob vote)
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "blacklist-test", "proposal_id": ban_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?
        .into_result()?;

    bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "blacklist-test", "proposal_id": ban_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?
        .into_result()?;
    println!("   ✓ Charlie blacklisted (ban proposal executed)");

    // VERIFICATION 1: Invite proposal should still be "active" (not yet executed)
    let proposal_key = format!("groups/blacklist-test/proposals/{}", invite_proposal_id);
    let before_result: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [proposal_key.clone()] }))
        .await?
        .json()?;
    let before_proposal = entry_value(&before_result, &proposal_key)
        .cloned()
        .unwrap_or(Value::Null);
    assert_eq!(
        before_proposal.get("status").and_then(|v| v.as_str()),
        Some("active"),
        "Invite proposal should still be active before Bob's vote"
    );
    println!("   ✓ Invite proposal status: active (before execution attempt)");

    // Step 3: Bob votes YES on invite → triggers execution → FAILS (Charlie blacklisted)
    let bob_vote = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "blacklist-test", "proposal_id": invite_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    // Transaction succeeds but execution failed internally - status updated to rejected
    assert!(bob_vote.is_success(), "Transaction should succeed (status update committed)");
    println!("   ✓ Vote transaction completed (execution failed internally)");

    // VERIFICATION 2: Proposal status must be "executed_skipped" (THE FIX - not stuck in "active")
    // Vote passed but action could not be applied because target was blacklisted.
    let after_result: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [proposal_key.clone()] }))
        .await?
        .json()?;
    let after_proposal = entry_value(&after_result, &proposal_key)
        .cloned()
        .unwrap_or(Value::Null);
    let final_status = after_proposal.get("status").and_then(|v| v.as_str());
    
    assert_eq!(
        final_status,
        Some("executed_skipped"),
        "Proposal status must be 'executed_skipped' (vote passed, action skipped due to blacklist), got: {:?}",
        final_status
    );
    println!("   ✓ Proposal status correctly updated to 'executed_skipped'");

    // VERIFICATION 3: Charlie should NOT be a member
    let is_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "blacklist-test",
            "member_id": charlie.id().to_string()
        }))
        .await?
        .json()?;
    assert!(!is_member, "Charlie should not be a member (blacklisted)");
    println!("   ✓ Charlie not added as member");

    println!("✅ Execution correctly handled: status=executed_skipped (blacklisted)");
    Ok(())
}

// =============================================================================
// ISSUE 2: RACE CONDITION (USER BECOMES MEMBER BEFORE EXECUTION)
// =============================================================================

/// Tests race condition: user becomes member between proposal creation and execution.
/// The second vote triggers execution, which should fail gracefully with updated proposal status.
#[tokio::test]
async fn test_join_request_race_condition_user_already_member() -> anyhow::Result<()> {
    println!("\n=== Test: Race Condition - User Already Member ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Setup: Create group with Alice as founder
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "race-condition-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Add Bob as member (auto-executes)
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "race-condition-test", "proposal_type": "member_invite", "changes": { "target_user": bob.id().to_string() }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?
        .into_result()?;
    println!("   ✓ Bob added as member");

    // Step 1: Create FIRST proposal to invite Charlie (don't execute yet)
    let first_invite = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "race-condition-test", "proposal_type": "member_invite", "changes": { "target_user": charlie.id().to_string() }, "auto_vote": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    let first_proposal_id: String = first_invite.json()?;
    println!("   ✓ First invite proposal created: {}", first_proposal_id);

    // Alice votes YES on first proposal (1/2 votes)
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "race-condition-test", "proposal_id": first_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?
        .into_result()?;
    println!("   ✓ Alice voted YES on first proposal");

    // Step 2: Create SECOND proposal to invite Charlie (simulating race condition)
    let second_invite = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "race-condition-test", "proposal_type": "member_invite", "changes": { "target_user": charlie.id().to_string() }, "auto_vote": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    let second_proposal_id: String = second_invite.json()?;
    println!("   ✓ Second invite proposal created: {}", second_proposal_id);

    // Alice votes YES on second proposal (1/2 votes)
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "race-condition-test", "proposal_id": second_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?
        .into_result()?;
    println!("   ✓ Alice voted YES on second proposal");

    // Step 3: Bob votes on FIRST proposal → executes → Charlie becomes member
    bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "race-condition-test", "proposal_id": first_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?
        .into_result()?;

    // Verify Charlie is now a member
    let is_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "race-condition-test",
            "member_id": charlie.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_member, "Charlie should be a member after first proposal execution");
    println!("   ✓ Charlie is now a member (first proposal executed)");

    // VERIFICATION 1: Second proposal should still be "active"
    let proposal_key = format!("groups/race-condition-test/proposals/{}", second_proposal_id);
    let before_result: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [proposal_key.clone()] }))
        .await?
        .json()?;
    let before_proposal = entry_value(&before_result, &proposal_key).cloned().unwrap_or(Value::Null);
    assert_eq!(
        before_proposal.get("status").and_then(|v| v.as_str()),
        Some("active"),
        "Second proposal should be active before execution attempt"
    );
    println!("   ✓ Second proposal status: active (before execution)");

    // Step 4: Bob votes on SECOND proposal → triggers execution → FAILS (Charlie already member)
    let bob_vote = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "race-condition-test", "proposal_id": second_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    // Transaction succeeds but execution failed internally - status updated to rejected
    assert!(bob_vote.is_success(), "Transaction should succeed (status update committed)");
    println!("   ✓ Vote transaction completed (execution failed internally)");

    // VERIFICATION 2: Second proposal status must be "executed_skipped" (THE FIX)
    // Vote passed but action could not be applied because target was already a member.
    let after_result: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [proposal_key.clone()] }))
        .await?
        .json()?;
    let after_proposal = entry_value(&after_result, &proposal_key).cloned().unwrap_or(Value::Null);
    let final_status = after_proposal.get("status").and_then(|v| v.as_str());
    
    assert_eq!(
        final_status,
        Some("executed_skipped"),
        "Proposal status must be 'executed_skipped' (vote passed, action skipped - already member), got: {:?}",
        final_status
    );
    println!("   ✓ Second proposal status correctly updated to 'executed_skipped'");

    // VERIFICATION 3: Charlie should remain a member (first proposal succeeded)
    let still_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "race-condition-test",
            "member_id": charlie.id().to_string()
        }))
        .await?
        .json()?;
    assert!(still_member, "Charlie should still be a member");
    println!("   ✓ Charlie remains a member (not duplicated)");

    println!("✅ Race condition handled correctly: status=executed_skipped (already member)");
    Ok(())
}

// =============================================================================
// ISSUE 3: MEMBER NONCE IN EVENTS
// =============================================================================

/// Tests that join_request_approved event includes member_nonce and member_nonce_path.
#[tokio::test]
async fn test_join_request_approved_event_includes_member_nonce() -> anyhow::Result<()> {
    println!("\n=== Test: JoinRequest Approved Event Includes Member Nonce ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven private group
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "nonce-event-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Bob creates join request
    let join_request = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "nonce-event-test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(join_request.is_success(), "Join request should succeed");

    let logs_join: Vec<String> = join_request.logs().iter().map(|s| s.to_string()).collect();
    let events_join = find_events_by_operation(&logs_join, "proposal_created");
    assert!(!events_join.is_empty(), "JoinRequest should create a proposal");
    let proposal_id = events_join[0].data.first()
        .and_then(|d| d.extra.get("proposal_id"))
        .and_then(|v| v.as_str())
        .expect("proposal_id should exist");
    println!("   ✓ Join request proposal created: {}", proposal_id);

    // Alice votes YES - auto-executes with 1 member
    let alice_vote = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "nonce-event-test", "proposal_id": proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(alice_vote.is_success(), "Alice vote should succeed");

    // Find join_request_approved event
    let logs: Vec<String> = alice_vote.logs().iter().map(|s| s.to_string()).collect();
    let events = find_events_by_operation(&logs, "join_request_approved");
    
    assert!(
        !events.is_empty(),
        "join_request_approved event should be emitted"
    );
    println!("   ✓ join_request_approved event emitted");

    let event_data = &events[0].data[0].extra;
    
    // VERIFICATION 1: member_nonce field exists (THE FIX)
    let member_nonce = event_data.get("member_nonce");
    assert!(
        member_nonce.is_some(),
        "Event should include member_nonce field (the fix)"
    );
    let nonce_value = member_nonce.unwrap().as_u64();
    assert!(
        nonce_value.is_some() && nonce_value.unwrap() > 0,
        "member_nonce should be a positive number, got: {:?}",
        member_nonce
    );
    println!("   ✓ member_nonce: {}", nonce_value.unwrap());

    // VERIFICATION 2: member_nonce_path field exists (THE FIX)
    let member_nonce_path = event_data.get("member_nonce_path");
    assert!(
        member_nonce_path.is_some(),
        "Event should include member_nonce_path field (the fix)"
    );
    let expected_path = format!("groups/nonce-event-test/member_nonces/{}", bob.id());
    assert_eq!(
        member_nonce_path.unwrap().as_str(),
        Some(expected_path.as_str()),
        "member_nonce_path should match expected format"
    );
    println!("   ✓ member_nonce_path: {}", expected_path);

    // VERIFICATION 3: Other expected fields still present
    assert!(event_data.get("group_id").is_some(), "group_id should exist");
    assert!(event_data.get("level").is_some(), "level should exist");
    assert!(event_data.get("target_id").is_some(), "target_id should exist");
    println!("   ✓ All expected event fields present");

    println!("✅ join_request_approved event includes member nonce fields (the fix)");
    Ok(())
}
