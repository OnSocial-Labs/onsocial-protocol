//! Integration tests for domain/groups/request_parsing/governance.rs
//!
//! Tests the parsing and delegation logic in create_group_proposal, vote_on_proposal, cancel_proposal.
//! Focuses on edge cases in the proposal_type match arms and field parsing.
//! Also covers validate_group_id enforcement in governance operations.

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};
use std::path::Path;

use crate::utils::entry_value;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

// =============================================================================
// GOVERNANCE OPERATIONS VALIDATE GROUP_ID FORMAT (Issue #1 fix)
// =============================================================================
// Covers: governance.rs L18, L97, L111 - validate_group_id() calls
// These tests would FAIL on pre-fix code where validation was missing

/// Tests that create_proposal, vote_on_proposal, and cancel_proposal all validate group_id format.
/// Invalid group_ids (special chars, empty, oversized) must be rejected with proper validation errors.
#[tokio::test]
async fn test_governance_operations_validate_group_id_format() -> anyhow::Result<()> {
    println!("\n=== Test: Governance Operations Validate group_id Format ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create a valid member-driven group for testing
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "gov_validate_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Add Bob so we have 2 members for proposal tests
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "gov_validate_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");
    println!("   ✓ Created member-driven group with 2 members");

    // =========================================================================
    // TEST 1: create_proposal with invalid group_id (special characters)
    // =========================================================================
    println!("\n📦 TEST 1: create_proposal with special characters in group_id...");

    let create_invalid = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "bad@group#id", "proposal_type": "custom_proposal", "changes": {
                    "title": "Test",
                    "description": "Test proposal"
                }}
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !create_invalid.is_success(),
        "create_proposal with invalid group_id should fail"
    );
    let err = format!("{:?}", create_invalid.failures());
    assert!(
        err.contains("alphanumeric") || err.contains("Group ID"),
        "Error should mention group_id validation, got: {}",
        err
    );
    println!("   ✓ create_proposal with special characters rejected");

    // =========================================================================
    // TEST 2: create_proposal with empty group_id
    // =========================================================================
    println!("\n📦 TEST 2: create_proposal with empty group_id...");

    let create_empty = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "", "proposal_type": "custom_proposal", "changes": {
                    "title": "Test",
                    "description": "Test proposal"
                }}
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !create_empty.is_success(),
        "create_proposal with empty group_id should fail"
    );
    let err = format!("{:?}", create_empty.failures());
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention length validation, got: {}",
        err
    );
    println!("   ✓ create_proposal with empty group_id rejected");

    // =========================================================================
    // TEST 3: create_proposal with oversized group_id (>64 chars)
    // =========================================================================
    println!("\n📦 TEST 3: create_proposal with oversized group_id...");

    let long_id = "x".repeat(65);
    let create_long = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": long_id, "proposal_type": "custom_proposal", "changes": {
                    "title": "Test",
                    "description": "Test proposal"
                }}
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !create_long.is_success(),
        "create_proposal with oversized group_id should fail"
    );
    let err = format!("{:?}", create_long.failures());
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention length validation, got: {}",
        err
    );
    println!("   ✓ create_proposal with oversized group_id rejected");

    // =========================================================================
    // TEST 4: vote_on_proposal with invalid group_id (special characters)
    // =========================================================================
    println!("\n📦 TEST 4: vote_on_proposal with special characters in group_id...");

    let vote_invalid = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "../traversal", "proposal_id": "fake_id", "approve": true }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !vote_invalid.is_success(),
        "vote_on_proposal with invalid group_id should fail"
    );
    let err = format!("{:?}", vote_invalid.failures());
    assert!(
        err.contains("alphanumeric") || err.contains("Group ID"),
        "Error should mention group_id validation, got: {}",
        err
    );
    println!("   ✓ vote_on_proposal with special characters rejected");

    // =========================================================================
    // TEST 5: vote_on_proposal with empty group_id
    // =========================================================================
    println!("\n📦 TEST 5: vote_on_proposal with empty group_id...");

    let vote_empty = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "", "proposal_id": "fake_id", "approve": true }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !vote_empty.is_success(),
        "vote_on_proposal with empty group_id should fail"
    );
    let err = format!("{:?}", vote_empty.failures());
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention length validation, got: {}",
        err
    );
    println!("   ✓ vote_on_proposal with empty group_id rejected");

    // =========================================================================
    // TEST 6: cancel_proposal with invalid group_id (special characters)
    // =========================================================================
    println!("\n📦 TEST 6: cancel_proposal with special characters in group_id...");

    let cancel_invalid = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "cancel_proposal", "group_id": "bad!id@here", "proposal_id": "fake_id" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !cancel_invalid.is_success(),
        "cancel_proposal with invalid group_id should fail"
    );
    let err = format!("{:?}", cancel_invalid.failures());
    assert!(
        err.contains("alphanumeric") || err.contains("Group ID"),
        "Error should mention group_id validation, got: {}",
        err
    );
    println!("   ✓ cancel_proposal with special characters rejected");

    // =========================================================================
    // TEST 7: cancel_proposal with empty group_id
    // =========================================================================
    println!("\n📦 TEST 7: cancel_proposal with empty group_id...");

    let cancel_empty = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "cancel_proposal", "group_id": "", "proposal_id": "fake_id" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !cancel_empty.is_success(),
        "cancel_proposal with empty group_id should fail"
    );
    let err = format!("{:?}", cancel_empty.failures());
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention length validation, got: {}",
        err
    );
    println!("   ✓ cancel_proposal with empty group_id rejected");

    println!("\n✅ Governance operations group_id validation test passed");
    Ok(())
}

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
// UNKNOWN PROPOSAL TYPE REJECTION (governance.rs:75)
// =============================================================================

/// Unknown proposal_type values must be rejected with "Unknown proposal type" error.
/// Tests line 75: `_ => return Err(invalid_input!("Unknown proposal type"))`
#[tokio::test]
async fn test_unknown_proposal_type_rejected() -> anyhow::Result<()> {
    println!("\n=== Test: Unknown Proposal Type Rejected (governance.rs:75) ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "unknown-type-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Try creating proposal with unknown type
    let unknown_type = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "unknown-type-test", "proposal_type": "completely_invalid_type_xyz", "changes": {
                    "some_field": "some_value"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        unknown_type.is_failure(),
        "Unknown proposal_type should be rejected"
    );
    let failure_str = format!("{:?}", unknown_type.failures());
    assert!(
        failure_str.contains("Unknown proposal type") || failure_str.contains("InvalidInput"),
        "Error should mention 'Unknown proposal type': {}",
        failure_str
    );
    println!("   ✓ Unknown proposal_type 'completely_invalid_type_xyz' rejected");

    // Try another invalid type to verify catch-all
    let another_invalid = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "unknown-type-test", "proposal_type": "", "changes": {}, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        another_invalid.is_failure(),
        "Empty proposal_type should be rejected"
    );
    println!("   ✓ Empty proposal_type '' rejected");

    println!("✅ Unknown proposal type rejection verified (governance.rs:75)");
    Ok(())
}

// =============================================================================
// GROUP_UPDATE MISSING UPDATE_TYPE (governance.rs:21-23)
// =============================================================================

/// group_update proposal must include update_type field.
/// Tests lines 21-23: `changes.get("update_type")...ok_or_else()`
#[tokio::test]
async fn test_group_update_missing_update_type_rejected() -> anyhow::Result<()> {
    println!("\n=== Test: group_update Missing update_type Rejected (governance.rs:21-23) ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "missing-update-type-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Try creating group_update proposal WITHOUT update_type
    let missing_update_type = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "missing-update-type-test", "proposal_type": "group_update", "changes": {
                    "changes": { "description": "New description" }
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        missing_update_type.is_failure(),
        "group_update without update_type should be rejected"
    );
    let failure_str = format!("{:?}", missing_update_type.failures());
    assert!(
        failure_str.contains("update_type required") || failure_str.contains("InvalidInput"),
        "Error should mention update_type required: {}",
        failure_str
    );
    println!("   ✓ group_update without update_type rejected");

    // Test with null update_type (should also fail)
    let null_update_type = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "missing-update-type-test", "proposal_type": "group_update", "changes": {
                    "update_type": null,
                    "changes": { "description": "New description" }
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        null_update_type.is_failure(),
        "group_update with null update_type should be rejected"
    );
    println!("   ✓ group_update with null update_type rejected");

    println!("✅ group_update missing update_type rejection verified (governance.rs:21-23)");
    Ok(())
}

// =============================================================================
// CUSTOM_PROPOSAL MISSING REQUIRED FIELDS (governance.rs:62-67)
// =============================================================================

/// custom_proposal must include title and description fields.
/// Tests lines 62-67: `changes.get("title")...ok_or_else()`, `changes.get("description")...ok_or_else()`
#[tokio::test]
async fn test_custom_proposal_missing_fields_rejected() -> anyhow::Result<()> {
    println!("\n=== Test: custom_proposal Missing Fields Rejected (governance.rs:62-67) ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "missing-fields-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Test 1: Missing title field entirely
    println!("   🔍 Test 1: Missing title field...");
    let missing_title = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "missing-fields-test", "proposal_type": "custom_proposal", "changes": {
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
        missing_title.is_failure(),
        "custom_proposal without title should be rejected"
    );
    let failure_str = format!("{:?}", missing_title.failures());
    assert!(
        failure_str.contains("title required") || failure_str.contains("InvalidInput"),
        "Error should mention title required: {}",
        failure_str
    );
    println!("   ✓ Missing title field rejected");

    // Test 2: Missing description field entirely
    println!("   🔍 Test 2: Missing description field...");
    let missing_desc = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "missing-fields-test", "proposal_type": "custom_proposal", "changes": {
                    "title": "Valid title",
                    "custom_data": {}
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        missing_desc.is_failure(),
        "custom_proposal without description should be rejected"
    );
    let failure_str = format!("{:?}", missing_desc.failures());
    assert!(
        failure_str.contains("description required") || failure_str.contains("InvalidInput"),
        "Error should mention description required: {}",
        failure_str
    );
    println!("   ✓ Missing description field rejected");

    // Test 3: null title (should also fail)
    println!("   🔍 Test 3: null title...");
    let null_title = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "missing-fields-test", "proposal_type": "custom_proposal", "changes": {
                    "title": null,
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
        null_title.is_failure(),
        "custom_proposal with null title should be rejected"
    );
    println!("   ✓ null title rejected");

    // Test 4: Missing custom_data field (should use default empty object - SUCCESS)
    println!("   🔍 Test 4: Missing custom_data field (should succeed with default)...");
    let missing_custom_data = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "missing-fields-test", "proposal_type": "custom_proposal", "changes": {
                    "title": "Valid title",
                    "description": "Valid description"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        missing_custom_data.is_success(),
        "custom_proposal without custom_data should succeed (uses default empty object)"
    );
    println!("   ✓ Missing custom_data uses default empty object");

    println!("✅ custom_proposal field validation verified (governance.rs:62-68)");
    Ok(())
}

// =============================================================================
// VOTING_CONFIG_CHANGE STRING PARSING (governance.rs:35-47)
// =============================================================================

/// voting_config_change should accept bps values as strings (JavaScript interop).
/// Tests lines 43-44: string-to-u16 parsing
#[tokio::test]
async fn test_voting_config_change_string_bps_accepted() -> anyhow::Result<()> {
    println!("\n=== Test: voting_config_change String BPS Accepted (governance.rs:43-44) ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "string-bps-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Create voting_config_change with string-formatted bps values
    let string_bps = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "string-bps-test", "proposal_type": "voting_config_change", "changes": {
                    "participation_quorum_bps": "6000",
                    "majority_threshold_bps": "5500"
                }, "auto_vote": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        string_bps.is_success(),
        "voting_config_change with string bps values should succeed"
    );
    let proposal_id: String = string_bps.json()?;
    println!(
        "   ✓ String bps values '6000' and '5500' accepted, proposal_id: {}",
        proposal_id
    );

    // Verify the proposal was created correctly
    let key = format!("groups/string-bps-test/proposals/{}", proposal_id);
    let get_result: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [key.clone()] }))
        .await?
        .json()?;
    let proposal = entry_value(&get_result, &key)
        .cloned()
        .unwrap_or(Value::Null);

    // Verify proposal data contains the parsed values
    let data = proposal.get("data").expect("proposal.data exists");
    if let Some(voting_config) = data.get("VotingConfigChange") {
        let quorum = voting_config.get("participation_quorum_bps");
        let threshold = voting_config.get("majority_threshold_bps");
        assert_eq!(
            quorum.and_then(|v| v.as_u64()),
            Some(6000),
            "Quorum should be 6000"
        );
        assert_eq!(
            threshold.and_then(|v| v.as_u64()),
            Some(5500),
            "Threshold should be 5500"
        );
        println!("   ✓ Verified parsed values: quorum=6000, threshold=5500");
    }

    println!("✅ voting_config_change string bps parsing verified (governance.rs:43-44)");
    Ok(())
}

/// voting_config_change should reject invalid string bps values.
/// Tests line 46: `Err(invalid_input!(format!("Invalid {key}")))`
#[tokio::test]
async fn test_voting_config_change_invalid_bps_rejected() -> anyhow::Result<()> {
    println!("\n=== Test: voting_config_change Invalid BPS Rejected (governance.rs:46) ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "invalid-bps-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Test 1: Non-numeric string for participation_quorum_bps
    println!("   🔍 Test 1: Non-numeric string bps...");
    let invalid_string = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-bps-test", "proposal_type": "voting_config_change", "changes": {
                    "participation_quorum_bps": "not_a_number"
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        invalid_string.is_failure(),
        "voting_config_change with invalid string bps should be rejected"
    );
    let failure_str = format!("{:?}", invalid_string.failures());
    assert!(
        failure_str.contains("Invalid participation_quorum_bps")
            || failure_str.contains("InvalidInput"),
        "Error should mention invalid field: {}",
        failure_str
    );
    println!("   ✓ Non-numeric string 'not_a_number' rejected");

    // Test 2: Negative number (can't fit in u16)
    println!("   🔍 Test 2: Negative number...");
    let negative = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-bps-test", "proposal_type": "voting_config_change", "changes": {
                    "majority_threshold_bps": -100
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        negative.is_failure(),
        "voting_config_change with negative bps should be rejected"
    );
    println!("   ✓ Negative number -100 rejected");

    // Test 3: Value too large for u16 (>65535)
    println!("   🔍 Test 3: Value too large for u16...");
    let too_large = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-bps-test", "proposal_type": "voting_config_change", "changes": {
                    "participation_quorum_bps": 100000
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        too_large.is_failure(),
        "voting_config_change with bps > 65535 should be rejected"
    );
    println!("   ✓ Value 100000 (>65535) rejected");

    // Test 4: Object instead of number/string
    println!("   🔍 Test 4: Object instead of number/string...");
    let object_value = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "invalid-bps-test", "proposal_type": "voting_config_change", "changes": {
                    "participation_quorum_bps": { "value": 5000 }
                }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        object_value.is_failure(),
        "voting_config_change with object bps should be rejected"
    );
    println!("   ✓ Object value rejected");

    println!("✅ voting_config_change invalid bps rejection verified (governance.rs:46)");
    Ok(())
}

/// voting_config_change with explicit null values should treat them as None.
/// Tests lines 38-39: `if value.is_null() { return Ok(None); }`
#[tokio::test]
async fn test_voting_config_change_null_bps_treated_as_none() -> anyhow::Result<()> {
    println!("\n=== Test: voting_config_change null BPS Treated as None (governance.rs:38-39) ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "null-bps-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // Create voting_config_change with explicit null for one field and valid for another
    let null_bps = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "null-bps-test", "proposal_type": "voting_config_change", "changes": {
                    "participation_quorum_bps": null,
                    "majority_threshold_bps": 6000
                }, "auto_vote": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        null_bps.is_success(),
        "voting_config_change with null bps should succeed (treated as None)"
    );
    let proposal_id: String = null_bps.json()?;
    println!(
        "   ✓ Explicit null for participation_quorum_bps accepted, proposal_id: {}",
        proposal_id
    );

    // Verify the proposal data
    let key = format!("groups/null-bps-test/proposals/{}", proposal_id);
    let get_result: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [key.clone()] }))
        .await?
        .json()?;
    let proposal = entry_value(&get_result, &key)
        .cloned()
        .unwrap_or(Value::Null);

    let data = proposal.get("data").expect("proposal.data exists");
    if let Some(voting_config) = data.get("VotingConfigChange") {
        // null should become None (not present or null in JSON)
        let quorum = voting_config.get("participation_quorum_bps");
        let threshold = voting_config.get("majority_threshold_bps");
        assert!(
            quorum.is_none() || quorum == Some(&Value::Null),
            "participation_quorum_bps should be None/null"
        );
        assert_eq!(
            threshold.and_then(|v| v.as_u64()),
            Some(6000),
            "Threshold should be 6000"
        );
        println!("   ✓ Verified: quorum=None, threshold=6000");
    }

    println!("✅ voting_config_change null bps handling verified (governance.rs:38-39)");
    Ok(())
}

// =============================================================================
// VOTING_CONFIG_CHANGE STRING VOTING_PERIOD (governance.rs:52-53)
// =============================================================================

/// voting_config_change should accept voting_period as string.
/// Tests line 53: `v.as_str().and_then(|s| s.parse::<u64>().ok())`
#[tokio::test]
async fn test_voting_config_change_string_voting_period_accepted() -> anyhow::Result<()> {
    println!(
        "\n=== Test: voting_config_change String voting_period Accepted (governance.rs:52-53) ==="
    );

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create member-driven group
    let create_group = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "string-period-test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_group.is_success(), "Create group should succeed");

    // 7 days in nanoseconds as string
    let seven_days_ns = "604800000000000";

    // Create voting_config_change with string voting_period
    let string_period = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "string-period-test", "proposal_type": "voting_config_change", "changes": {
                    "voting_period": seven_days_ns
                }, "auto_vote": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        string_period.is_success(),
        "voting_config_change with string voting_period should succeed"
    );
    let proposal_id: String = string_period.json()?;
    println!(
        "   ✓ String voting_period '{}' accepted, proposal_id: {}",
        seven_days_ns, proposal_id
    );

    // Verify the proposal data
    let key = format!("groups/string-period-test/proposals/{}", proposal_id);
    let get_result: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [key.clone()] }))
        .await?
        .json()?;
    let proposal = entry_value(&get_result, &key)
        .cloned()
        .unwrap_or(Value::Null);

    let data = proposal.get("data").expect("proposal.data exists");
    if let Some(voting_config) = data.get("VotingConfigChange") {
        let period = voting_config.get("voting_period");
        assert_eq!(
            period.and_then(|v| v.as_u64()),
            Some(604800000000000u64),
            "voting_period should be 604800000000000"
        );
        println!("   ✓ Verified parsed voting_period: 604800000000000");
    }

    println!("✅ voting_config_change string voting_period parsing verified (governance.rs:52-53)");
    Ok(())
}
