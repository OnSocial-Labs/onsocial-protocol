//! Integration tests for proposal validation (validation.rs)
//!
//! Tests all validation scenarios in ProposalType::validate():
//! - Non-member-driven group rejection
//! - Access control (membership, blacklist)
//! - JoinRequest-specific rules
//! - Proposal type field validation
//! - VotingConfigChange parameter ranges
//! - CustomProposal content requirements

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::json;
use std::path::Path;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

/// Helper to load the core-onsocial wasm
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
        "Could not find core_onsocial.wasm. Build it first with: make build-contract-core-onsocial"
    ))
}

/// Deploy and initialize the core-onsocial contract
async fn deploy_core_onsocial(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> anyhow::Result<Contract> {
    let wasm = load_core_onsocial_wasm()?;
    let contract = worker.dev_deploy(&wasm).await?;

    let outcome = contract.call("new").args_json(json!({})).transact().await?;
    if !outcome.is_success() {
        return Err(anyhow::anyhow!(
            "Contract initialization failed: {:?}",
            outcome
        ));
    }

    let outcome = contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    if !outcome.is_success() {
        return Err(anyhow::anyhow!("Contract activation failed: {:?}", outcome));
    }

    Ok(contract)
}

/// Create a user account with some NEAR balance
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
// NON-MEMBER-DRIVEN GROUP REJECTS PROPOSALS (validation.rs:20-22)
// =============================================================================

/// Proposals cannot be created in non-member-driven groups.
#[tokio::test]
async fn test_validation_non_member_driven_group_rejects_proposals() -> anyhow::Result<()> {
    println!("\n=== Test: Non-Member-Driven Group Rejects Proposals ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create NON-member-driven group (traditional ownership model)
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "traditional-group", "config": { "member_driven": false, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Add Bob as member so he can attempt to create proposals
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "traditional-group", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");

    // Bob tries to create a proposal in non-member-driven group (should fail)
    let create_proposal = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "traditional-group", "proposal_type": "custom_proposal", "changes": {
                    "title": "Test proposal",
                    "description": "Should fail",
                    "custom_data": {}
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        create_proposal.is_failure(),
        "Proposals should be rejected in non-member-driven groups"
    );
    let failure_str = format!("{:?}", create_proposal.failures());
    assert!(
        failure_str.contains("member-driven") || failure_str.contains("InvalidInput"),
        "Error should mention member-driven: {}", failure_str
    );
    println!("   ✓ Proposal rejected in non-member-driven group");

    println!("✅ Non-member-driven group rejects proposals (validation.rs:20-22)");
    Ok(())
}

// =============================================================================
// BLACKLISTED MEMBER CANNOT CREATE PROPOSALS (validation.rs:45-48)
// =============================================================================

/// Blacklisted members cannot create non-JoinRequest proposals.
/// Uses a NON-member-driven group for direct blacklist, then switches to member-driven.
#[tokio::test]
async fn test_validation_blacklisted_member_cannot_create_proposal() -> anyhow::Result<()> {
    println!("\n=== Test: Blacklisted Member Cannot Create Proposal ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create NON-member-driven group first (so we can directly blacklist)
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "blacklist-proposal-test", "config": { "member_driven": false, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Add Bob as member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "blacklist-proposal-test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");

    // Alice blacklists Bob (directly in non-member-driven group)
    let blacklist_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "blacklist-proposal-test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(blacklist_bob.is_success(), "Blacklisting Bob should succeed");

    // Verify Bob is blacklisted
    let is_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "blacklist-proposal-test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_blacklisted, "Bob should be blacklisted");
    println!("   ✓ Bob is blacklisted");

    // Now create a MEMBER-DRIVEN group and add Bob (still blacklisted from previous group)
    let create_md_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "blacklist-md-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_md_group.is_success(), "Create member-driven group should succeed");

    // Add Bob to member-driven group
    let add_bob_md = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "blacklist-md-test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob_md.is_success(), "Adding Bob to member-driven group should succeed");

    // Create a second non-member-driven group and blacklist Bob there too to test
    // Actually, let's directly blacklist Bob in the member-driven group using the proposal approach
    // But that's complex. Instead, let's use a simpler approach:
    // Create NON-member-driven group, add+blacklist Bob, then convert to member-driven
    // But that's also complex.

    // Simpler approach: Create TWO member-driven groups. In one, use proposal to ban Bob.
    // But that requires voting. Let's use single-member group where proposal auto-executes.

    // Create single-member member-driven group for direct test
    let create_single = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "blacklist-single-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_single.is_success(), "Create single-member group should succeed");

    // Add Bob so we have 2 members (proposals won't auto-execute)
    let add_bob_single = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "blacklist-single-test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob_single.is_success(), "Adding Bob should succeed");

    // Alice creates ban proposal for Bob (auto-votes as proposer)
    let ban_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "blacklist-single-test", "proposal_type": "group_update", "changes": {
                    "update_type": "ban",
                    "target_user": bob.id().to_string()
                }, "auto_vote": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(ban_proposal.is_success(), "Ban proposal should succeed");
    let ban_proposal_id: String = ban_proposal.json()?;

    // Bob votes to approve his own ban (completes quorum)
    let bob_vote = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "blacklist-single-test", "proposal_id": ban_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(bob_vote.is_success(), "Bob voting should succeed");

    // Verify Bob is now blacklisted
    let is_bob_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "blacklist-single-test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_bob_blacklisted, "Bob should be blacklisted after ban proposal executed");
    println!("   ✓ Bob is blacklisted via governance proposal");

    // Blacklisted Bob tries to create a proposal (should fail)
    let create_proposal = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "blacklist-single-test", "proposal_type": "custom_proposal", "changes": {
                    "title": "Blacklisted proposal",
                    "description": "Should fail",
                    "custom_data": {}
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        create_proposal.is_failure(),
        "Blacklisted member should not be able to create proposals"
    );
    let failure_str = format!("{:?}", create_proposal.failures());
    assert!(
        failure_str.contains("Blacklisted") || failure_str.contains("Permission denied"),
        "Error should mention blacklist: {}", failure_str
    );
    println!("   ✓ Blacklisted member cannot create proposal");

    println!("✅ Blacklisted member cannot create proposal (validation.rs:45-48)");
    Ok(())
}

// =============================================================================
// NON-MEMBER CANNOT CREATE PROPOSALS (validation.rs:39-43)
// =============================================================================

/// Non-members cannot create non-JoinRequest proposals.
#[tokio::test]
async fn test_validation_non_member_cannot_create_proposal() -> anyhow::Result<()> {
    println!("\n=== Test: Non-Member Cannot Create Proposal ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "non-member-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Bob (non-member) tries to create a custom_proposal (should fail)
    let create_proposal = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "non-member-test", "proposal_type": "custom_proposal", "changes": {
                    "title": "Non-member proposal",
                    "description": "Should fail",
                    "custom_data": {}
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        create_proposal.is_failure(),
        "Non-member should not be able to create custom_proposal"
    );
    let failure_str = format!("{:?}", create_proposal.failures());
    assert!(
        failure_str.contains("Permission denied") || failure_str.contains("create_proposal"),
        "Error should be permission denied: {}", failure_str
    );
    println!("   ✓ Non-member cannot create custom_proposal");

    println!("✅ Non-member cannot create proposal (validation.rs:39-43)");
    Ok(())
}

// =============================================================================
// JOINREQUEST PROPOSER != REQUESTER REJECTED (validation.rs:26-29)
// =============================================================================

/// JoinRequest proposer must equal requester field.
#[tokio::test]
async fn test_validation_join_request_proposer_requester_mismatch() -> anyhow::Result<()> {
    println!("\n=== Test: JoinRequest Proposer != Requester Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven private group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "join-mismatch-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Bob tries to create JoinRequest for Charlie (proposer != requester)
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;
    let mismatched_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "join-mismatch-test", "proposal_type": "join_request", "changes": {
                    "requester": charlie.id().to_string(),
                    "message": "Impersonation attempt"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        mismatched_join.is_failure(),
        "JoinRequest with proposer != requester should be rejected"
    );
    let failure_str = format!("{:?}", mismatched_join.failures());
    assert!(
        failure_str.contains("requester") || failure_str.contains("InvalidInput"),
        "Error should mention requester mismatch: {}", failure_str
    );
    println!("   ✓ JoinRequest with proposer != requester rejected");

    println!("✅ JoinRequest proposer/requester mismatch rejected (validation.rs:26-29)");
    Ok(())
}

// =============================================================================
// ALREADY-MEMBER CANNOT CREATE JOINREQUEST (validation.rs:31-33)
// =============================================================================

/// Existing members cannot create JoinRequest proposals.
#[tokio::test]
async fn test_validation_already_member_cannot_join_request() -> anyhow::Result<()> {
    println!("\n=== Test: Already-Member Cannot Create JoinRequest ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "already-member-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Add Bob as member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "already-member-test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");

    // Bob (already member) tries to create JoinRequest (should fail)
    let join_request = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "already-member-test", "proposal_type": "join_request", "changes": {
                    "requester": bob.id().to_string(),
                    "message": "Already a member"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        join_request.is_failure(),
        "Already-member should not be able to create JoinRequest"
    );
    let failure_str = format!("{:?}", join_request.failures());
    assert!(
        failure_str.contains("already") || failure_str.contains("member") || failure_str.contains("InvalidInput"),
        "Error should mention already member: {}", failure_str
    );
    println!("   ✓ Already-member cannot create JoinRequest");

    println!("✅ Already-member cannot create JoinRequest (validation.rs:31-33)");
    Ok(())
}

// =============================================================================
// MEMBERINVITE FOR ALREADY-MEMBER REJECTED (validation.rs:130-132)
// =============================================================================

/// MemberInvite for existing member should be rejected.
#[tokio::test]
async fn test_validation_member_invite_already_member() -> anyhow::Result<()> {
    println!("\n=== Test: MemberInvite For Already-Member Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "invite-member-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Add Bob as member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "invite-member-test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");

    // Alice tries to invite Bob (already member)
    let invite_member = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invite-member-test", "proposal_type": "member_invite", "changes": {
                    "target_user": bob.id().to_string(),
                    "message": "Already a member"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        invite_member.is_failure(),
        "MemberInvite for already-member should be rejected"
    );
    let failure_str = format!("{:?}", invite_member.failures());
    assert!(
        failure_str.contains("already") || failure_str.contains("member") || failure_str.contains("InvalidInput"),
        "Error should mention already member: {}", failure_str
    );
    println!("   ✓ MemberInvite for already-member rejected");

    println!("✅ MemberInvite for already-member rejected (validation.rs:130-132)");
    Ok(())
}

// =============================================================================
// MEMBERINVITE FOR BLACKLISTED TARGET REJECTED (validation.rs:133-135)
// =============================================================================

/// MemberInvite for blacklisted user should be rejected.
/// Uses proposal-based ban to achieve blacklist in member-driven group.
#[tokio::test]
async fn test_validation_member_invite_blacklisted_target() -> anyhow::Result<()> {
    println!("\n=== Test: MemberInvite For Blacklisted Target Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "invite-blacklist-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Add Bob and Charlie as members so we have 3 for voting
    for (user, name) in [(&bob, "bob"), (&charlie, "charlie")] {
        let add_member = alice
            .call(contract.id(), "execute")
            .args_json(json!({
                "request": {
                    "action": { "type": "add_group_member", "group_id": "invite-blacklist-test", "member_id": user.id().to_string() }
                }
            }))
            .deposit(ONE_NEAR)
            .gas(near_workspaces::types::Gas::from_tgas(150))
            .transact()
            .await?;
        assert!(add_member.is_success(), "Adding {} should succeed", name);
    }
    println!("   ✓ Added Bob and Charlie as members");

    // Create ban proposal for Charlie (Alice creates and auto-votes)
    let ban_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invite-blacklist-test", "proposal_type": "group_update", "changes": {
                    "update_type": "ban",
                    "target_user": charlie.id().to_string()
                }, "auto_vote": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(ban_proposal.is_success(), "Ban proposal should succeed");
    let ban_proposal_id: String = ban_proposal.json()?;
    println!("   ✓ Ban proposal created: {}", ban_proposal_id);

    // Bob votes to approve ban (achieves quorum: 2/3)
    let bob_vote = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "invite-blacklist-test", "proposal_id": ban_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(bob_vote.is_success(), "Bob voting should succeed");
    println!("   ✓ Bob voted to approve ban");

    // Verify Charlie is blacklisted
    let is_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "invite-blacklist-test",
            "user_id": charlie.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_blacklisted, "Charlie should be blacklisted");
    println!("   ✓ Charlie is blacklisted via governance");

    // Alice tries to invite blacklisted Charlie
    let invite_blacklisted = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invite-blacklist-test", "proposal_type": "member_invite", "changes": {
                    "target_user": charlie.id().to_string(),
                    "message": "Inviting blacklisted user"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        invite_blacklisted.is_failure(),
        "MemberInvite for blacklisted user should be rejected"
    );
    let failure_str = format!("{:?}", invite_blacklisted.failures());
    assert!(
        failure_str.contains("blacklisted") || failure_str.contains("InvalidInput"),
        "Error should mention blacklisted: {}", failure_str
    );
    println!("   ✓ MemberInvite for blacklisted target rejected");

    println!("✅ MemberInvite for blacklisted target rejected (validation.rs:133-135)");
    Ok(())
}

// =============================================================================
// PERMISSIONCHANGE WITH INVALID LEVEL REJECTED (validation.rs:96-97)
// =============================================================================

/// PermissionChange with invalid permission level should be rejected.
#[tokio::test]
async fn test_validation_permission_change_invalid_level() -> anyhow::Result<()> {
    println!("\n=== Test: PermissionChange With Invalid Level Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "invalid-level-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Add Bob as member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "invalid-level-test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");

    // Try PermissionChange with invalid level (5 is not valid: 0=NONE, 1=WRITE, 2=MODERATE, 3=MANAGE)
    let invalid_level = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-level-test", "proposal_type": "permission_change", "changes": {
                    "target_user": bob.id().to_string(),
                    "level": 5,
                    "reason": "Invalid level"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        invalid_level.is_failure(),
        "PermissionChange with invalid level should be rejected"
    );
    let failure_str = format!("{:?}", invalid_level.failures());
    assert!(
        failure_str.contains("Invalid permission level") || failure_str.contains("InvalidInput"),
        "Error should mention invalid level: {}", failure_str
    );
    println!("   ✓ PermissionChange with invalid level (5) rejected");

    println!("✅ PermissionChange with invalid level rejected (validation.rs:96-97)");
    Ok(())
}

// =============================================================================
// VOTINGCONFIGCHANGE WITH INVALID QUORUM REJECTED (validation.rs:148-154)
// =============================================================================

/// VotingConfigChange with quorum_bps outside valid range should be rejected.
#[tokio::test]
async fn test_validation_voting_config_invalid_quorum() -> anyhow::Result<()> {
    println!("\n=== Test: VotingConfigChange With Invalid Quorum Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "invalid-quorum-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Try VotingConfigChange with quorum too low (< 100 = 1%)
    let quorum_too_low = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-quorum-test", "proposal_type": "voting_config_change", "changes": {
                    "participation_quorum_bps": 50
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        quorum_too_low.is_failure(),
        "VotingConfigChange with quorum < 100 should be rejected"
    );
    println!("   ✓ VotingConfigChange with quorum_bps=50 rejected");

    // Try VotingConfigChange with quorum too high (> 10000)
    let quorum_too_high = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-quorum-test", "proposal_type": "voting_config_change", "changes": {
                    "participation_quorum_bps": 15000
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        quorum_too_high.is_failure(),
        "VotingConfigChange with quorum > 10000 should be rejected"
    );
    println!("   ✓ VotingConfigChange with quorum_bps=15000 rejected");

    println!("✅ VotingConfigChange with invalid quorum rejected (validation.rs:148-154)");
    Ok(())
}

// =============================================================================
// VOTINGCONFIGCHANGE WITH INVALID THRESHOLD REJECTED (validation.rs:156-162)
// =============================================================================

/// VotingConfigChange with threshold_bps outside valid range should be rejected.
#[tokio::test]
async fn test_validation_voting_config_invalid_threshold() -> anyhow::Result<()> {
    println!("\n=== Test: VotingConfigChange With Invalid Threshold Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "invalid-threshold-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Try VotingConfigChange with threshold too low (< 5001 = 50.01%)
    let threshold_too_low = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-threshold-test", "proposal_type": "voting_config_change", "changes": {
                    "majority_threshold_bps": 5000
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        threshold_too_low.is_failure(),
        "VotingConfigChange with threshold < 5001 should be rejected"
    );
    println!("   ✓ VotingConfigChange with threshold_bps=5000 rejected");

    // Try VotingConfigChange with threshold too high (> 10000)
    let threshold_too_high = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-threshold-test", "proposal_type": "voting_config_change", "changes": {
                    "majority_threshold_bps": 11000
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        threshold_too_high.is_failure(),
        "VotingConfigChange with threshold > 10000 should be rejected"
    );
    println!("   ✓ VotingConfigChange with threshold_bps=11000 rejected");

    println!("✅ VotingConfigChange with invalid threshold rejected (validation.rs:156-162)");
    Ok(())
}

// =============================================================================
// VOTINGCONFIGCHANGE WITH INVALID PERIOD REJECTED (validation.rs:165-170)
// =============================================================================

/// VotingConfigChange with voting_period outside valid range should be rejected.
#[tokio::test]
async fn test_validation_voting_config_invalid_period() -> anyhow::Result<()> {
    println!("\n=== Test: VotingConfigChange With Invalid Period Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "invalid-period-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Try VotingConfigChange with period too short (< 1 hour in nanoseconds)
    // MIN_VOTING_PERIOD = 60 * 60 * 1_000_000_000 = 3_600_000_000_000 ns
    let period_too_short = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-period-test", "proposal_type": "voting_config_change", "changes": {
                    "voting_period": 1_000_000_000_u64  // 1 second
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        period_too_short.is_failure(),
        "VotingConfigChange with period < 1 hour should be rejected"
    );
    println!("   ✓ VotingConfigChange with voting_period=1s rejected");

    // Try VotingConfigChange with period too long (> 365 days in nanoseconds)
    // MAX_VOTING_PERIOD = 365 * 24 * 60 * 60 * 1_000_000_000 = 31_536_000_000_000_000 ns
    let period_too_long = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-period-test", "proposal_type": "voting_config_change", "changes": {
                    "voting_period": 40_000_000_000_000_000_u64  // > 365 days
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        period_too_long.is_failure(),
        "VotingConfigChange with period > 365 days should be rejected"
    );
    println!("   ✓ VotingConfigChange with voting_period > 365 days rejected");

    println!("✅ VotingConfigChange with invalid period rejected (validation.rs:165-170)");
    Ok(())
}

// =============================================================================
// CUSTOMPROPOSAL WITH EMPTY TITLE/DESCRIPTION REJECTED (validation.rs:177-179)
// =============================================================================

/// CustomProposal with empty title or description should be rejected.
#[tokio::test]
async fn test_validation_custom_proposal_empty_title_description() -> anyhow::Result<()> {
    println!("\n=== Test: CustomProposal With Empty Title/Description Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "empty-content-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Try CustomProposal with empty title
    let empty_title = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "empty-content-test", "proposal_type": "custom_proposal", "changes": {
                    "title": "",
                    "description": "Valid description",
                    "custom_data": {}
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        empty_title.is_failure(),
        "CustomProposal with empty title should be rejected"
    );
    println!("   ✓ CustomProposal with empty title rejected");

    // Try CustomProposal with empty description
    let empty_desc = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "empty-content-test", "proposal_type": "custom_proposal", "changes": {
                    "title": "Valid title",
                    "description": "",
                    "custom_data": {}
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        empty_desc.is_failure(),
        "CustomProposal with empty description should be rejected"
    );
    println!("   ✓ CustomProposal with empty description rejected");

    // Try CustomProposal with whitespace-only title
    let whitespace_title = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "empty-content-test", "proposal_type": "custom_proposal", "changes": {
                    "title": "   ",
                    "description": "Valid description",
                    "custom_data": {}
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        whitespace_title.is_failure(),
        "CustomProposal with whitespace-only title should be rejected"
    );
    println!("   ✓ CustomProposal with whitespace-only title rejected");

    // Valid CustomProposal should succeed
    let valid_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "empty-content-test", "proposal_type": "custom_proposal", "changes": {
                    "title": "Valid title",
                    "description": "Valid description",
                    "custom_data": {}
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        valid_proposal.is_success(),
        "Valid CustomProposal should succeed"
    );
    println!("   ✓ Valid CustomProposal accepted");

    println!("✅ CustomProposal empty title/description rejected (validation.rs:177-179)");
    Ok(())
}

// =============================================================================
// PATH PERMISSION OUTSIDE GROUP REJECTED (validation.rs:111-113, 124-126)
// =============================================================================

/// PathPermission proposals for paths outside the group should be rejected.
#[tokio::test]
async fn test_validation_path_permission_outside_group() -> anyhow::Result<()> {
    println!("\n=== Test: PathPermission Outside Group Rejected ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "path-scope-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Add Bob as member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "path-scope-test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");

    // Try PathPermissionGrant for path in different group
    let different_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "path-scope-test", "proposal_type": "path_permission_grant", "changes": {
                    "target_user": bob.id().to_string(),
                    "path": "groups/other-group/content",
                    "level": 2,
                    "reason": "Trying to grant outside group"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        different_group.is_failure(),
        "PathPermissionGrant for different group should be rejected"
    );
    let failure_str = format!("{:?}", different_group.failures());
    assert!(
        failure_str.contains("within this group") || failure_str.contains("InvalidInput"),
        "Error should mention path scope: {}", failure_str
    );
    println!("   ✓ PathPermissionGrant for different group rejected");

    // Try PathPermissionRevoke for path in different group
    let different_group_revoke = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "path-scope-test", "proposal_type": "path_permission_revoke", "changes": {
                    "target_user": bob.id().to_string(),
                    "path": "groups/other-group/content",
                    "reason": "Trying to revoke outside group"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        different_group_revoke.is_failure(),
        "PathPermissionRevoke for different group should be rejected"
    );
    println!("   ✓ PathPermissionRevoke for different group rejected");

    // Valid path within group should succeed
    let valid_path = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "path-scope-test", "proposal_type": "path_permission_grant", "changes": {
                    "target_user": bob.id().to_string(),
                    "path": "groups/path-scope-test/content/posts",
                    "level": 2,
                    "reason": "Valid path within group"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        valid_path.is_success(),
        "PathPermissionGrant for valid path should succeed"
    );
    println!("   ✓ Valid path within group accepted");

    println!("✅ PathPermission outside group rejected (validation.rs:111-113, 124-126)");
    Ok(())
}

// =============================================================================
// JOINREQUEST FROM BLACKLISTED NON-MEMBER (validation.rs:33-35)
// =============================================================================

/// A blacklisted non-member cannot submit a JoinRequest.
/// Uses non-member-driven group for direct blacklist, then tests JoinRequest in member-driven group.
#[tokio::test]
async fn test_validation_join_request_blacklisted_requester() -> anyhow::Result<()> {
    println!("\n=== Test: JoinRequest From Blacklisted Requester ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "join-blacklist-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Add Bob as member so we can ban him via governance
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "join-blacklist-test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");

    // Create ban proposal for Bob (in 2-member group, Alice's auto-vote + Bob's vote = quorum)
    let ban_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "join-blacklist-test", "proposal_type": "group_update", "changes": {
                    "update_type": "ban",
                    "target_user": bob.id().to_string()
                }, "auto_vote": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(ban_proposal.is_success(), "Ban proposal should succeed");
    let ban_proposal_id: String = ban_proposal.json()?;

    // Bob votes to complete quorum (bans himself)
    let bob_vote = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "join-blacklist-test", "proposal_id": ban_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(bob_vote.is_success(), "Bob voting should succeed");

    // Verify Bob is blacklisted
    let is_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "join-blacklist-test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_blacklisted, "Bob should be blacklisted");
    println!("   ✓ Bob is blacklisted via governance");

    // Blacklisted Bob tries to create JoinRequest (should fail)
    let join_request = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "join-blacklist-test", "proposal_type": "join_request", "changes": {
                    "requester": bob.id().to_string(),
                    "message": "Please let me back in"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        join_request.is_failure(),
        "Blacklisted user should not be able to create JoinRequest"
    );
    let failure_str = format!("{:?}", join_request.failures());
    assert!(
        failure_str.contains("blacklisted") || failure_str.contains("Blacklisted"),
        "Error should mention blacklist: {}", failure_str
    );
    println!("   ✓ Blacklisted user cannot create JoinRequest");

    println!("✅ JoinRequest from blacklisted requester rejected (validation.rs:33-35)");
    Ok(())
}

// =============================================================================
// PERMISSIONCHANGE TARGET NOT MEMBER (validation.rs:90-92)
// =============================================================================

/// PermissionChange for a non-member target should be rejected.
#[tokio::test]
async fn test_validation_permission_change_target_not_member() -> anyhow::Result<()> {
    println!("\n=== Test: PermissionChange Target Not Member ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create member-driven group (Alice is only member)
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "perm-nonmember-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Alice tries to create PermissionChange for Bob (not a member)
    let perm_change = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "perm-nonmember-test", "proposal_type": "permission_change", "changes": {
                    "target_user": bob.id().to_string(),
                    "level": 2,
                    "reason": "Promote non-member"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        perm_change.is_failure(),
        "PermissionChange for non-member should fail"
    );
    let failure_str = format!("{:?}", perm_change.failures());
    assert!(
        failure_str.contains("must be a member") || failure_str.contains("Target user"),
        "Error should mention target must be member: {}", failure_str
    );
    println!("   ✓ PermissionChange for non-member rejected");

    println!("✅ PermissionChange target not member rejected (validation.rs:90-92)");
    Ok(())
}

// =============================================================================
// VOTINGCONFIGCHANGE EMPTY PARAMS (validation.rs:144-148)
// =============================================================================

/// VotingConfigChange with no parameters should be rejected.
#[tokio::test]
async fn test_validation_voting_config_empty_params() -> anyhow::Result<()> {
    println!("\n=== Test: VotingConfigChange Empty Params ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "voting-empty-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Alice tries to create VotingConfigChange with no parameters
    let empty_config = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "voting-empty-test", "proposal_type": "voting_config_change", "changes": {
                    "participation_quorum_bps": null,
                    "majority_threshold_bps": null,
                    "voting_period": null
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        empty_config.is_failure(),
        "VotingConfigChange with no parameters should fail"
    );
    let failure_str = format!("{:?}", empty_config.failures());
    assert!(
        failure_str.contains("At least one") || failure_str.contains("must be specified") || failure_str.contains("parameter"),
        "Error should mention at least one parameter required: {}", failure_str
    );
    println!("   ✓ VotingConfigChange with no parameters rejected");

    println!("✅ VotingConfigChange empty params rejected (validation.rs:144-148)");
    Ok(())
}
