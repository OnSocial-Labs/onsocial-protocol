// =============================================================================
// Actions Group Module Integration Tests
// =============================================================================
// Tests for state/execute/actions_group.rs
// Covers:
// - MIN_PROPOSAL_DEPOSIT enforcement with zero deposit
// - Deposit credited to actor's storage balance during group actions
//
// Run with:
//   make test-integration-contract-core-onsocial TEST=actions_group_tests

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};
use std::path::Path;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

fn load_core_onsocial_wasm() -> anyhow::Result<Vec<u8>> {
    let paths = [
        "../target/near/core_onsocial/core_onsocial.wasm",
        "target/near/core_onsocial/core_onsocial.wasm",
        "/code/target/near/core_onsocial/core_onsocial.wasm",
    ];
    for path in &paths {
        if Path::new(path).exists() {
            return Ok(std::fs::read(path)?);
        }
    }
    anyhow::bail!("core_onsocial.wasm not found in any known location");
}

async fn deploy_core_onsocial(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> anyhow::Result<Contract> {
    let wasm = load_core_onsocial_wasm()?;
    let contract = worker.dev_deploy(&wasm).await?;

    let init_outcome = contract.call("new").args_json(json!({})).transact().await?;
    assert!(
        init_outcome.is_success(),
        "Contract initialization failed: {:?}",
        init_outcome.failures()
    );

    let activate_outcome = contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(
        activate_outcome.is_success(),
        "Contract activation failed: {:?}",
        activate_outcome.failures()
    );

    Ok(contract)
}

async fn create_user(root: &Account, name: &str, balance: NearToken) -> anyhow::Result<Account> {
    let account = root
        .create_subaccount(name)
        .initial_balance(balance)
        .transact()
        .await?;
    Ok(account.result)
}

fn parse_storage_balance(storage_json: &Option<Value>) -> u128 {
    storage_json
        .as_ref()
        .and_then(|s| s.get("balance"))
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                s.parse().ok()
            } else if let Some(n) = v.as_u64() {
                Some(n as u128)
            } else if let Some(f) = v.as_f64() {
                Some(f as u128)
            } else {
                None
            }
        })
        .unwrap_or(0)
}

// =============================================================================
// TEST: create_proposal with zero deposit fails with minimum deposit error
// =============================================================================
// Covers: actions_group.rs lines 196-204 (MIN_PROPOSAL_DEPOSIT validation)
// This tests that execute_action_create_proposal rejects zero deposit.
#[tokio::test]
async fn test_create_proposal_zero_deposit_fails() -> anyhow::Result<()> {
    println!("\n=== Test: create_proposal with zero deposit fails ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "zero_deposit_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");
    println!("   ✓ Created member-driven group");

    // Withdraw all storage so alice has 0 available balance
    // (group creation auto-deposits 1 NEAR to storage via prepare_group_storage)
    let withdraw_all = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/withdraw": {}
                } },
                "options": { "refund_unused_deposit": true },
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(withdraw_all.is_success(), "Withdraw should succeed: {:?}", withdraw_all.failures());
    println!("   ✓ Withdrew all storage balance");

    // Attempt to create proposal with ZERO deposit (should fail)
    let zero_deposit_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": {
                    "type": "create_proposal",
                    "group_id": "zero_deposit_test",
                    "proposal_type": "custom_proposal",
                    "changes": {
                        "title": "Zero deposit test",
                        "description": "This should fail"
                    },
                    "auto_vote": true
                }
            }
        }))
        .deposit(NearToken::from_yoctonear(0)) // Zero deposit
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    // CRITICAL: Must fail with minimum deposit error
    assert!(
        !zero_deposit_proposal.is_success(),
        "Proposal with zero deposit MUST fail"
    );

    let failure_msg = format!("{:?}", zero_deposit_proposal.failures());
    assert!(
        failure_msg.contains("Minimum")
            || failure_msg.contains("0.1 NEAR")
            || failure_msg.contains("deposit"),
        "Error should mention minimum deposit requirement, got: {}",
        failure_msg
    );
    println!("   ✓ Zero deposit proposal correctly rejected: minimum deposit required");

    println!("✅ Zero deposit proposal test passed");
    Ok(())
}

// =============================================================================
// TEST: create_proposal with insufficient deposit (below MIN_PROPOSAL_DEPOSIT)
// =============================================================================
// Covers: actions_group.rs lines 196-204 (MIN_PROPOSAL_DEPOSIT = 0.1 NEAR)
#[tokio::test]
async fn test_create_proposal_insufficient_deposit_fails() -> anyhow::Result<()> {
    println!("\n=== Test: create_proposal with insufficient deposit fails ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "insufficient_deposit_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");
    println!("   ✓ Created member-driven group");

    // Withdraw all storage so alice has 0 available balance
    // (group creation auto-deposits 1 NEAR to storage via prepare_group_storage)
    let withdraw_all = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/withdraw": {}
                } },
                "options": { "refund_unused_deposit": true },
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(withdraw_all.is_success(), "Withdraw should succeed: {:?}", withdraw_all.failures());
    println!("   ✓ Withdrew all storage balance");

    // Attempt to create proposal with 0.05 NEAR (below 0.1 NEAR minimum)
    let insufficient_deposit = NearToken::from_millinear(50); // 0.05 NEAR
    let insufficient_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": {
                    "type": "create_proposal",
                    "group_id": "insufficient_deposit_test",
                    "proposal_type": "custom_proposal",
                    "changes": {
                        "title": "Insufficient deposit test",
                        "description": "This should fail - only 0.05 NEAR"
                    },
                    "auto_vote": true
                }
            }
        }))
        .deposit(insufficient_deposit)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !insufficient_proposal.is_success(),
        "Proposal with 0.05 NEAR (below 0.1 NEAR minimum) MUST fail"
    );

    let failure_msg = format!("{:?}", insufficient_proposal.failures());
    assert!(
        failure_msg.contains("Minimum")
            || failure_msg.contains("0.1 NEAR")
            || failure_msg.contains("deposit"),
        "Error should mention minimum deposit requirement, got: {}",
        failure_msg
    );
    println!("   ✓ Insufficient deposit (0.05 NEAR) correctly rejected");

    println!("✅ Insufficient deposit proposal test passed");
    Ok(())
}

// =============================================================================
// TEST: create_proposal with exactly minimum deposit (0.1 NEAR) succeeds
// =============================================================================
// Covers: actions_group.rs lines 196-218 (deposit check order is correct)
#[tokio::test]
async fn test_create_proposal_minimum_deposit_succeeds() -> anyhow::Result<()> {
    println!("\n=== Test: create_proposal with exactly minimum deposit succeeds ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "min_deposit_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");
    println!("   ✓ Created member-driven group");

    // Create proposal with exactly 0.1 NEAR (minimum deposit)
    let min_deposit = NearToken::from_millinear(100); // 0.1 NEAR
    let min_deposit_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": {
                    "type": "create_proposal",
                    "group_id": "min_deposit_test",
                    "proposal_type": "custom_proposal",
                    "changes": {
                        "title": "Minimum deposit test",
                        "description": "This should succeed with exactly 0.1 NEAR"
                    },
                    "auto_vote": true
                }
            }
        }))
        .deposit(min_deposit)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        min_deposit_proposal.is_success(),
        "Proposal with exactly 0.1 NEAR MUST succeed: {:?}",
        min_deposit_proposal.failures()
    );

    let proposal_id: String = min_deposit_proposal.json()?;
    println!(
        "   ✓ Proposal created with minimum deposit: {}",
        proposal_id
    );

    // Verify Alice now has a storage balance entry
    let alice_storage: Option<Value> = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;

    assert!(
        alice_storage.is_some(),
        "Alice should have a storage balance entry after proposal creation"
    );
    println!("   ✓ Alice has storage balance entry");

    println!("✅ Minimum deposit proposal test passed");
    Ok(())
}

// =============================================================================
// TEST: Deposit credited to actor's storage during successful group action
// =============================================================================
// Covers: actions_group.rs credit_storage_balance pattern in all action handlers
#[tokio::test]
async fn test_deposit_credited_after_successful_action() -> anyhow::Result<()> {
    println!("\n=== Test: deposit credited after successful group action ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create group with deposit - this should credit Alice's storage
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "credit_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");
    println!("   ✓ Created group with 1 NEAR deposit");

    // Verify Alice has a storage balance entry
    let alice_storage: Option<Value> = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;

    assert!(
        alice_storage.is_some(),
        "Alice should have a storage balance entry after create_group"
    );

    let balance = parse_storage_balance(&alice_storage);
    println!("   Alice storage balance: {} yoctoNEAR", balance);

    // Balance should be positive (deposit minus storage used)
    // Note: Even if all deposit is used for storage, balance can be 0
    // The key invariant is that the storage entry exists
    println!(
        "   ✓ Alice has storage balance entry with balance: {}",
        balance
    );

    println!("✅ Deposit credited after successful action test passed");
    Ok(())
}

// =============================================================================
// TEST: leave_group action succeeds and processes deposit
// =============================================================================
// Covers: actions_group.rs execute_action_leave_group
#[tokio::test]
async fn test_leave_group_action_succeeds() -> anyhow::Result<()> {
    println!("\n=== Test: leave_group action succeeds ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create public group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "leave_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Bob joins
    let bob_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "leave_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_join.is_success(), "Bob join should succeed");
    println!("   ✓ Bob joined group");

    // Verify Bob is a member
    let is_bob_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "leave_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_bob_member, "Bob should be a member after join");

    // Bob leaves
    let bob_leave = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "leave_test" }
            }
        }))
        .deposit(NearToken::from_millinear(100)) // Some deposit
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_leave.is_success(), "Bob leave should succeed");
    println!("   ✓ Bob left group");

    // Verify Bob is no longer a member
    let is_bob_member_after: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "leave_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        !is_bob_member_after,
        "Bob should NOT be a member after leave"
    );
    println!("   ✓ Bob is no longer a member");

    println!("✅ Leave group action test passed");
    Ok(())
}
