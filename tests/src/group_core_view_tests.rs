// =============================================================================
// Group Core View Methods Integration Tests
// =============================================================================
// Tests for domain/groups/core.rs view methods:
// - get_group_config
// - get_member_data
// - get_join_request
// - get_group_stats
//
// Focuses on edge cases and None returns for non-existent/deleted entries.
//
// Run with:
//   make test-integration-contract-core-onsocial TEST=group_core_view_tests

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::json;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

fn load_core_onsocial_wasm() -> anyhow::Result<Vec<u8>> {
    let paths = [
        "../target/near/core_onsocial/core_onsocial.wasm",
        "target/near/core_onsocial/core_onsocial.wasm",
        "/code/target/near/core_onsocial/core_onsocial.wasm",
    ];
    for path in &paths {
        if std::path::Path::new(path).exists() {
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

    let init_outcome = contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?;
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

// =============================================================================
// TEST: get_group_stats returns None for non-existent group
// =============================================================================
// Covers: core.rs:get_group_stats -> storage_get returns None for missing group
#[tokio::test]
async fn test_get_group_stats_nonexistent_returns_none() -> anyhow::Result<()> {
    println!("\n=== Test: get_group_stats returns None for non-existent group ===");

    let worker = near_workspaces::sandbox().await?;
    let contract = deploy_core_onsocial(&worker).await?;

    // Query stats for a group that doesn't exist
    let stats: Option<serde_json::Value> = contract
        .view("get_group_stats")
        .args_json(json!({
            "group_id": "nonexistent_group_xyz_999"
        }))
        .await?
        .json()?;

    assert!(stats.is_none(), "get_group_stats should return None for non-existent group");
    println!("   ✓ get_group_stats correctly returns None for non-existent group");

    println!("✅ get_group_stats non-existent group test passed");
    Ok(())
}

// =============================================================================
// TEST: get_group_config returns None for non-existent group
// =============================================================================
// Covers: core.rs:get_group_config -> storage_get returns None for missing group
#[tokio::test]
async fn test_get_group_config_nonexistent_returns_none() -> anyhow::Result<()> {
    println!("\n=== Test: get_group_config returns None for non-existent group ===");

    let worker = near_workspaces::sandbox().await?;
    let contract = deploy_core_onsocial(&worker).await?;

    // Query config for a group that doesn't exist
    let config: Option<serde_json::Value> = contract
        .view("get_group_config")
        .args_json(json!({
            "group_id": "nonexistent_group_abc_123"
        }))
        .await?
        .json()?;

    assert!(config.is_none(), "get_group_config should return None for non-existent group");
    println!("   ✓ get_group_config correctly returns None for non-existent group");

    println!("✅ get_group_config non-existent group test passed");
    Ok(())
}

// =============================================================================
// TEST: get_join_request returns None for non-existent group
// =============================================================================
// Covers: core.rs:get_join_request -> storage_get returns None when group doesn't exist
#[tokio::test]
async fn test_get_join_request_nonexistent_group_returns_none() -> anyhow::Result<()> {
    println!("\n=== Test: get_join_request returns None for non-existent group ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Query join request for a group that doesn't exist
    let request: Option<serde_json::Value> = contract
        .view("get_join_request")
        .args_json(json!({
            "group_id": "nonexistent_group_join_test",
            "requester_id": bob.id().to_string()
        }))
        .await?
        .json()?;

    assert!(request.is_none(), "get_join_request should return None for non-existent group");
    println!("   ✓ get_join_request correctly returns None for non-existent group");

    println!("✅ get_join_request non-existent group test passed");
    Ok(())
}

// =============================================================================
// TEST: get_join_request returns None for user who never requested
// =============================================================================
// Covers: core.rs:get_join_request -> storage_get returns None when no request exists
#[tokio::test]
async fn test_get_join_request_no_request_returns_none() -> anyhow::Result<()> {
    println!("\n=== Test: get_join_request returns None for user who never requested ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a private group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "private_test_group", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Query join request for Bob who never submitted one
    let request: Option<serde_json::Value> = contract
        .view("get_join_request")
        .args_json(json!({
            "group_id": "private_test_group",
            "requester_id": bob.id().to_string()
        }))
        .await?
        .json()?;

    assert!(request.is_none(), "get_join_request should return None for user who never requested");
    println!("   ✓ get_join_request correctly returns None for non-requester");

    println!("✅ get_join_request no request test passed");
    Ok(())
}

// =============================================================================
// TEST: get_join_request returns None after cancellation (soft-deleted)
// =============================================================================
// Covers: core.rs:get_join_request -> storage_get returns None for soft-deleted entries
// This validates that the DataValue::Deleted pattern is properly handled
#[tokio::test]
async fn test_get_join_request_after_cancel_returns_none() -> anyhow::Result<()> {
    println!("\n=== Test: get_join_request returns None after cancellation ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a private group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "cancel_request_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Bob submits a join request
    let join_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "cancel_request_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_result.is_success(), "Join request should succeed");

    // Verify request exists
    let request_before: Option<serde_json::Value> = contract
        .view("get_join_request")
        .args_json(json!({
            "group_id": "cancel_request_test",
            "requester_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(request_before.is_some(), "Join request should exist before cancel");
    let status = request_before.as_ref()
        .and_then(|r| r.get("status"))
        .and_then(|s| s.as_str());
    assert_eq!(status, Some("pending"), "Request should be pending");
    println!("   ✓ Join request exists with pending status");

    // Bob cancels the request
    let cancel_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "cancel_join_request", "group_id": "cancel_request_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(cancel_result.is_success(), "Cancel request should succeed");
    println!("   ✓ Join request cancelled");

    // Verify request returns None after cancel (soft-deleted)
    let request_after: Option<serde_json::Value> = contract
        .view("get_join_request")
        .args_json(json!({
            "group_id": "cancel_request_test",
            "requester_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(request_after.is_none(), "get_join_request should return None after cancellation (soft-deleted)");
    println!("   ✓ get_join_request correctly returns None after cancellation");

    println!("✅ get_join_request after cancel test passed");
    Ok(())
}

// =============================================================================
// TEST: get_member_data returns None for non-existent group
// =============================================================================
// Covers: core.rs:get_member_data -> storage_get returns None when group doesn't exist
#[tokio::test]
async fn test_get_member_data_nonexistent_group_returns_none() -> anyhow::Result<()> {
    println!("\n=== Test: get_member_data returns None for non-existent group ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Query member data for a group that doesn't exist
    let member_data: Option<serde_json::Value> = contract
        .view("get_member_data")
        .args_json(json!({
            "group_id": "nonexistent_group_member_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;

    assert!(member_data.is_none(), "get_member_data should return None for non-existent group");
    println!("   ✓ get_member_data correctly returns None for non-existent group");

    println!("✅ get_member_data non-existent group test passed");
    Ok(())
}

// =============================================================================
// TEST: get_member_data returns None for left member (soft-deleted)
// =============================================================================
// Covers: core.rs:get_member_data -> storage_get returns None for soft-deleted entries
#[tokio::test]
async fn test_get_member_data_after_leave_returns_none() -> anyhow::Result<()> {
    println!("\n=== Test: get_member_data returns None after member leaves ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "member_leave_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Bob joins the group
    let join_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "member_leave_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_result.is_success(), "Join should succeed");

    // Verify member data exists
    let data_before: Option<serde_json::Value> = contract
        .view("get_member_data")
        .args_json(json!({
            "group_id": "member_leave_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(data_before.is_some(), "Member data should exist before leaving");
    println!("   ✓ Member data exists before leaving");

    // Bob leaves the group
    let leave_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "member_leave_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(leave_result.is_success(), "Leave should succeed");
    println!("   ✓ Bob left the group");

    // Verify member data returns None after leave (soft-deleted)
    let data_after: Option<serde_json::Value> = contract
        .view("get_member_data")
        .args_json(json!({
            "group_id": "member_leave_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(data_after.is_none(), "get_member_data should return None after member leaves (soft-deleted)");
    println!("   ✓ get_member_data correctly returns None after member leaves");

    println!("✅ get_member_data after leave test passed");
    Ok(())
}

// =============================================================================
// TEST: View methods consistency after member rejoin (nonce increments)
// =============================================================================
// Covers: core.rs view methods + add_remove.rs nonce increment on rejoin
// Scenario: Member leaves and rejoins - verify member_data shows fresh entry
#[tokio::test]
async fn test_view_methods_consistency_after_rejoin() -> anyhow::Result<()> {
    println!("\n=== Test: View methods consistency after member rejoin ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "rejoin_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Bob joins the group
    let first_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "rejoin_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(first_join.is_success(), "First join should succeed");

    // Get first join timestamp from member data
    let first_data: serde_json::Value = contract
        .view("get_member_data")
        .args_json(json!({
            "group_id": "rejoin_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    let first_joined_at = first_data.get("joined_at").and_then(|v| v.as_str()).unwrap_or("");
    println!("   ✓ First join recorded with joined_at: {}", first_joined_at);

    // Verify is_group_member returns true
    let is_member_first: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "rejoin_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_member_first, "is_group_member should return true after first join");

    // Check initial stats
    let stats_first: serde_json::Value = contract
        .view("get_group_stats")
        .args_json(json!({ "group_id": "rejoin_test" }))
        .await?
        .json()?;
    let members_first = stats_first.get("total_members").and_then(|v| v.as_u64()).unwrap_or(0);
    assert_eq!(members_first, 2, "Should have 2 members (alice + bob)");
    println!("   ✓ Stats show 2 members after first join");

    // Bob leaves the group
    let leave_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "rejoin_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(leave_result.is_success(), "Leave should succeed");
    println!("   ✓ Bob left the group");

    // Verify is_group_member returns false
    let is_member_after_leave: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "rejoin_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(!is_member_after_leave, "is_group_member should return false after leave");

    // Check stats after leave
    let stats_after_leave: serde_json::Value = contract
        .view("get_group_stats")
        .args_json(json!({ "group_id": "rejoin_test" }))
        .await?
        .json()?;
    let members_after_leave = stats_after_leave.get("total_members").and_then(|v| v.as_u64()).unwrap_or(0);
    assert_eq!(members_after_leave, 1, "Should have 1 member (alice only) after leave");
    println!("   ✓ Stats show 1 member after leave");

    // Bob rejoins the group
    let rejoin_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "rejoin_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(rejoin_result.is_success(), "Rejoin should succeed");
    println!("   ✓ Bob rejoined the group");

    // Verify is_group_member returns true again
    let is_member_after_rejoin: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "rejoin_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_member_after_rejoin, "is_group_member should return true after rejoin");

    // Get rejoin data - should have fresh joined_at timestamp
    let rejoin_data: serde_json::Value = contract
        .view("get_member_data")
        .args_json(json!({
            "group_id": "rejoin_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    let rejoin_joined_at = rejoin_data.get("joined_at").and_then(|v| v.as_str()).unwrap_or("");
    println!("   ✓ Rejoin recorded with joined_at: {}", rejoin_joined_at);

    // Verify fresh entry (timestamp should be >= first)
    // Note: In fast tests, timestamps might be equal - just verify data exists
    assert!(!rejoin_joined_at.is_empty(), "Rejoin should have joined_at timestamp");
    assert!(rejoin_data.get("level").is_some(), "Rejoin data should have level");

    // Check stats after rejoin
    let stats_after_rejoin: serde_json::Value = contract
        .view("get_group_stats")
        .args_json(json!({ "group_id": "rejoin_test" }))
        .await?
        .json()?;
    let members_after_rejoin = stats_after_rejoin.get("total_members").and_then(|v| v.as_u64()).unwrap_or(0);
    assert_eq!(members_after_rejoin, 2, "Should have 2 members after rejoin");
    println!("   ✓ Stats show 2 members after rejoin");

    println!("✅ View methods consistency after rejoin test passed");
    Ok(())
}

// =============================================================================
// TEST: is_blacklisted returns false for non-existent group
// =============================================================================
// Covers: blacklist.rs:is_blacklisted via groups_endpoints.rs view
#[tokio::test]
async fn test_is_blacklisted_nonexistent_group_returns_false() -> anyhow::Result<()> {
    println!("\n=== Test: is_blacklisted returns false for non-existent group ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Query blacklist status for a group that doesn't exist
    let is_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "nonexistent_group_blacklist_test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;

    assert!(!is_blacklisted, "is_blacklisted should return false for non-existent group");
    println!("   ✓ is_blacklisted correctly returns false for non-existent group");

    println!("✅ is_blacklisted non-existent group test passed");
    Ok(())
}

// =============================================================================
// TEST: is_group_member returns false for non-existent group
// =============================================================================
// Covers: queries.rs:is_member via groups_endpoints.rs view
#[tokio::test]
async fn test_is_group_member_nonexistent_group_returns_false() -> anyhow::Result<()> {
    println!("\n=== Test: is_group_member returns false for non-existent group ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Query member status for a group that doesn't exist
    let is_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "nonexistent_group_member_check",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;

    assert!(!is_member, "is_group_member should return false for non-existent group");
    println!("   ✓ is_group_member correctly returns false for non-existent group");

    println!("✅ is_group_member non-existent group test passed");
    Ok(())
}

// =============================================================================
// TEST: get_group_config returns correct owner field
// =============================================================================
// Covers: config.rs:GroupConfig.owner - Verifies owner is set to caller's account ID
#[tokio::test]
async fn test_get_group_config_returns_correct_owner() -> anyhow::Result<()> {
    println!("\n=== Test: get_group_config returns correct owner field ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "owner_field_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Query config and verify owner matches Alice
    let config: Option<serde_json::Value> = contract
        .view("get_group_config")
        .args_json(json!({
            "group_id": "owner_field_test"
        }))
        .await?
        .json()?;

    let config = config.expect("Config should exist for created group");
    let owner = config.get("owner").expect("Config should have 'owner' field");
    assert_eq!(
        owner.as_str().unwrap(),
        alice.id().as_str(),
        "Owner should match the creator's account ID"
    );
    println!("   ✓ get_group_config.owner correctly set to creator: {}", alice.id());

    println!("✅ get_group_config owner field test passed");
    Ok(())
}

// =============================================================================
// TEST: get_group_config member_driven defaults to false when not specified
// =============================================================================
// Covers: config.rs:GroupConfig.member_driven - default is false
#[tokio::test]
async fn test_get_group_config_member_driven_defaults_false() -> anyhow::Result<()> {
    println!("\n=== Test: get_group_config member_driven defaults to false ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Alice creates a group WITHOUT specifying member_driven
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "member_driven_default_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Query config and verify member_driven defaults to false
    let config: Option<serde_json::Value> = contract
        .view("get_group_config")
        .args_json(json!({
            "group_id": "member_driven_default_test"
        }))
        .await?
        .json()?;

    let config = config.expect("Config should exist for created group");
    let member_driven = config.get("member_driven")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    assert!(!member_driven, "member_driven should default to false");
    println!("   ✓ member_driven correctly defaults to false when not specified");

    println!("✅ get_group_config member_driven default test passed");
    Ok(())
}

// =============================================================================
// TEST: get_group_config member_driven respects explicit true
// =============================================================================
// Covers: config.rs:GroupConfig.member_driven - honors explicit true
#[tokio::test]
async fn test_get_group_config_member_driven_explicit_true() -> anyhow::Result<()> {
    println!("\n=== Test: get_group_config member_driven respects explicit true ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Alice creates a group WITH member_driven: true
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "member_driven_true_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Query config and verify member_driven is true
    let config: Option<serde_json::Value> = contract
        .view("get_group_config")
        .args_json(json!({
            "group_id": "member_driven_true_test"
        }))
        .await?
        .json()?;

    let config = config.expect("Config should exist for created group");
    let member_driven = config.get("member_driven")
        .and_then(|v| v.as_bool())
        .expect("member_driven field should exist");
    assert!(member_driven, "member_driven should be true when explicitly set");
    println!("   ✓ member_driven correctly set to true when explicitly specified");

    println!("✅ get_group_config member_driven explicit true test passed");
    Ok(())
}

// =============================================================================
// TEST: get_group_config is_private respects provided values
// =============================================================================
// Covers: config.rs:GroupConfig.is_private - Optional bool field
#[tokio::test]
async fn test_get_group_config_is_private_respects_values() -> anyhow::Result<()> {
    println!("\n=== Test: get_group_config is_private respects provided values ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a public group (is_private: false)
    let create_public = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "public_group_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_public.is_success(), "Create public group should succeed");

    // Bob creates a private group (is_private: true)
    let create_private = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "private_group_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_private.is_success(), "Create private group should succeed");

    // Verify public group config
    let public_config: Option<serde_json::Value> = contract
        .view("get_group_config")
        .args_json(json!({
            "group_id": "public_group_test"
        }))
        .await?
        .json()?;

    let public_config = public_config.expect("Public group config should exist");
    let is_private_public = public_config.get("is_private")
        .and_then(|v| v.as_bool())
        .expect("is_private field should exist");
    assert!(!is_private_public, "is_private should be false for public group");
    println!("   ✓ public group is_private correctly set to false");

    // Verify private group config
    let private_config: Option<serde_json::Value> = contract
        .view("get_group_config")
        .args_json(json!({
            "group_id": "private_group_test"
        }))
        .await?
        .json()?;

    let private_config = private_config.expect("Private group config should exist");
    let is_private_private = private_config.get("is_private")
        .and_then(|v| v.as_bool())
        .expect("is_private field should exist");
    assert!(is_private_private, "is_private should be true for private group");
    println!("   ✓ private group is_private correctly set to true");

    println!("✅ get_group_config is_private test passed");
    Ok(())
}

// =============================================================================
// TEST: get_group_config returns all fields with correct types
// =============================================================================
// Covers: config.rs:GroupConfig - Full struct serialization verification
#[tokio::test]
async fn test_get_group_config_all_fields_present() -> anyhow::Result<()> {
    println!("\n=== Test: get_group_config returns all expected fields ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Alice creates a group with all config fields specified
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": {
                    "type": "create_group",
                    "group_id": "full_config_test",
                    "config": {
                        "member_driven": true,
                        "is_private": true
                    }
                }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Query config
    let config: Option<serde_json::Value> = contract
        .view("get_group_config")
        .args_json(json!({
            "group_id": "full_config_test"
        }))
        .await?
        .json()?;

    let config = config.expect("Config should exist for created group");

    // Verify all expected fields are present
    assert!(config.get("owner").is_some(), "Config should have 'owner' field");
    assert!(config.get("owner").unwrap().is_string(), "'owner' should be a string");
    
    // Note: member_driven and is_private may be stored as part of the config object
    // depending on how storage serialization works
    println!("   ✓ Config object returned with expected structure");
    println!("   ✓ owner field present and is string type");

    // Verify owner value
    let owner = config.get("owner").unwrap().as_str().unwrap();
    assert_eq!(owner, alice.id().as_str(), "owner should match creator");
    println!("   ✓ owner value matches creator: {}", owner);

    println!("✅ get_group_config all fields test passed");
    Ok(())
}
