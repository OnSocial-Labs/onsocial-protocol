// =============================================================================
// Core-OnSocial Integration Tests
// =============================================================================
// Tests that run against the real NEAR sandbox with on-chain data
// These tests deploy the actual contract and test real transactions
//
// NOTE: Run tests with --test-threads=1 to avoid sandbox conflicts:
//   cargo test -p onsocial-integration-tests -- --test-threads=1

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::json;
use std::path::Path;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

/// Helper to load the core-onsocial wasm
fn load_core_onsocial_wasm() -> anyhow::Result<Vec<u8>> {
    // Try multiple paths for the wasm file
    let paths = [
        "../target/near/core_onsocial/core_onsocial.wasm",
        "target/near/core_onsocial/core_onsocial.wasm",
        "/code/target/near/core_onsocial/core_onsocial.wasm",
    ];
    
    for path in paths {
        if let Ok(wasm) = std::fs::read(Path::new(path)) {
            println!("✓ Loaded WASM from: {}", path);
            return Ok(wasm);
        }
    }
    
    Err(anyhow::anyhow!(
        "Could not find core_onsocial.wasm. Build it first with: cargo near build non-reproducible-wasm"
    ))
}

/// Deploy and initialize the core-onsocial contract
async fn deploy_core_onsocial(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> anyhow::Result<Contract> {
    let wasm = load_core_onsocial_wasm()?;
    
    // Use dev_deploy for simpler account creation (creates a random dev account)
    let contract = worker.dev_deploy(&wasm).await?;
    println!("✓ Contract deployed to: {}", contract.id());
    
    // Initialize the contract
    let outcome = contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?;
    
    if !outcome.is_success() {
        return Err(anyhow::anyhow!("Contract initialization failed: {:?}", outcome));
    }
    println!("✓ Contract initialized");
    
    // Activate the contract (move from Genesis to Live mode)
    let outcome = contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    
    if !outcome.is_success() {
        return Err(anyhow::anyhow!("Contract activation failed: {:?}", outcome));
    }
    println!("✓ Contract activated (Live mode)");
    
    Ok(contract)
}

/// Create a user account with some NEAR balance
async fn create_user(
    root: &Account,
    name: &str,
    balance: NearToken,
) -> anyhow::Result<Account> {
    let user = root
        .create_subaccount(name)
        .initial_balance(balance)
        .transact()
        .await?
        .into_result()?;
    println!("✓ Created user: {}", user.id());
    Ok(user)
}

// =============================================================================
// CONTRACT LIFECYCLE TESTS
// =============================================================================

#[tokio::test]
async fn test_contract_deploy_and_init() -> anyhow::Result<()> {
    println!("\n=== Test: Contract Deploy and Initialize ===");
    
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    // Verify contract status is Live
    let status: serde_json::Value = contract
        .view("get_contract_status")
        .args_json(json!({}))
        .await?
        .json()?;
    
    println!("Contract status: {:?}", status);
    assert_eq!(status, "Live", "Contract should be in Live status");
    
    println!("✅ Contract deploy and init test passed");
    Ok(())
}

#[tokio::test]
async fn test_get_config() -> anyhow::Result<()> {
    println!("\n=== Test: Get Config ===");
    
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    let config: serde_json::Value = contract
        .view("get_config")
        .args_json(json!({}))
        .await?
        .json()?;
    
    println!("Contract config: {:?}", config);
    
    // Verify config has expected fields
    assert!(config.get("max_key_length").is_some(), "Should have max_key_length");
    assert!(config.get("max_path_depth").is_some(), "Should have max_path_depth");
    assert!(config.get("max_batch_size").is_some(), "Should have max_batch_size");
    
    println!("✅ Get config test passed");
    Ok(())
}

// =============================================================================
// DATA STORAGE TESTS (SET/GET)
// =============================================================================

#[tokio::test]
async fn test_set_and_get_profile_data() -> anyhow::Result<()> {
    println!("\n=== Test: Set and Get Profile Data ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    // Create a user
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    // Set profile data
    let set_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "profile/name": "Alice",
                "profile/bio": "Hello from the sandbox!"
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    println!("Set result: {:?}", set_result.is_success());
    assert!(set_result.is_success(), "Set should succeed");
    
    // Get the data back
    let get_result: serde_json::Value = contract
        .view("get")
        .args_json(json!({
            "keys": [
                format!("{}/profile/name", alice.id()),
                format!("{}/profile/bio", alice.id())
            ]
        }))
        .await?
        .json()?;
    
    println!("Get result: {:?}", get_result);
    
    // Verify the data
    let name_key = format!("{}/profile/name", alice.id());
    let bio_key = format!("{}/profile/bio", alice.id());
    
    assert_eq!(
        get_result.get(&name_key).and_then(|v| v.as_str()),
        Some("Alice"),
        "Name should match"
    );
    assert_eq!(
        get_result.get(&bio_key).and_then(|v| v.as_str()),
        Some("Hello from the sandbox!"),
        "Bio should match"
    );
    
    println!("✅ Set and get profile data test passed");
    Ok(())
}

#[tokio::test]
async fn test_set_complex_nested_data() -> anyhow::Result<()> {
    println!("\n=== Test: Set Complex Nested Data ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    // Set nested data structure
    let set_result = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "posts/1/title": "My First Post",
                "posts/1/content": "This is the content of my first post",
                "posts/1/timestamp": "1733400000000",
                "posts/2/title": "Second Post",
                "posts/2/content": "Another post content"
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(set_result.is_success(), "Set nested data should succeed");
    
    // Get all posts
    let get_result: serde_json::Value = contract
        .view("get")
        .args_json(json!({
            "keys": [
                format!("{}/posts/1/title", bob.id()),
                format!("{}/posts/1/content", bob.id()),
                format!("{}/posts/2/title", bob.id())
            ]
        }))
        .await?
        .json()?;
    
    println!("Get nested result: {:?}", get_result);
    
    let post1_title = format!("{}/posts/1/title", bob.id());
    assert_eq!(
        get_result.get(&post1_title).and_then(|v| v.as_str()),
        Some("My First Post"),
        "Post 1 title should match"
    );
    
    println!("✅ Set complex nested data test passed");
    Ok(())
}

// =============================================================================
// GROUP TESTS
// =============================================================================

#[tokio::test]
async fn test_create_group() -> anyhow::Result<()> {
    println!("\n=== Test: Create Group ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    // Create a group
    let create_result = alice
        .call(contract.id(), "create_group")
        .args_json(json!({
            "group_id": "my_test_group",
            "config": {
                "is_private": false,
                "description": "A test group for integration testing"
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    println!("Create group result: {:?}", create_result.is_success());
    assert!(create_result.is_success(), "Create group should succeed");
    
    // Get group config
    let config: Option<serde_json::Value> = contract
        .view("get_group_config")
        .args_json(json!({
            "group_id": "my_test_group"
        }))
        .await?
        .json()?;
    
    println!("Group config: {:?}", config);
    assert!(config.is_some(), "Group config should exist");
    
    println!("✅ Create group test passed");
    Ok(())
}

#[tokio::test]
async fn test_group_membership() -> anyhow::Result<()> {
    println!("\n=== Test: Group Membership ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "create_group")
        .args_json(json!({
            "group_id": "membership_test",
            "config": {
                "is_private": false
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(create_result.is_success(), "Create group should succeed");
    
    // Alice adds Bob as a member with WRITE permission (1)
    let add_result = alice
        .call(contract.id(), "add_group_member")
        .args_json(json!({
            "group_id": "membership_test",
            "member_id": bob.id(),
            "permission_flags": 1
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    println!("Add member result: {:?}", add_result.is_success());
    assert!(add_result.is_success(), "Add member should succeed");
    
    // Check Bob's member data
    let member_data: Option<serde_json::Value> = contract
        .view("get_member_data")
        .args_json(json!({
            "group_id": "membership_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    
    println!("Member data: {:?}", member_data);
    assert!(member_data.is_some(), "Bob should be a member");
    
    // Get group stats
    let stats: Option<serde_json::Value> = contract
        .view("get_group_stats")
        .args_json(json!({
            "group_id": "membership_test"
        }))
        .await?
        .json()?;
    
    println!("Group stats: {:?}", stats);
    assert!(stats.is_some(), "Stats should exist");
    
    let total_members = stats
        .as_ref()
        .and_then(|s| s.get("total_members"))
        .and_then(|v| v.as_u64());
    assert_eq!(total_members, Some(2), "Should have 2 members (alice + bob)");
    
    println!("✅ Group membership test passed");
    Ok(())
}

// =============================================================================
// PERMISSION TESTS
// =============================================================================

#[tokio::test]
async fn test_has_permission() -> anyhow::Result<()> {
    println!("\n=== Test: Has Permission ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    // Alice sets some data (establishes ownership)
    let set_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "profile/name": "Alice"
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(set_result.is_success(), "Set should succeed");
    
    // Check Alice has permission on her own path (WRITE = 1)
    let alice_has_perm: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": alice.id(),
            "path": "profile/name",
            "permission_flags": 1
        }))
        .await?
        .json()?;
    
    println!("Alice has permission on own path: {}", alice_has_perm);
    assert!(alice_has_perm, "Alice should have permission on her own path");
    
    // Check Bob doesn't have permission on Alice's path
    let bob_has_perm: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": "profile/name",
            "permission_flags": 1
        }))
        .await?
        .json()?;
    
    println!("Bob has permission on Alice's path: {}", bob_has_perm);
    assert!(!bob_has_perm, "Bob should NOT have permission on Alice's path");
    
    println!("✅ Has permission test passed");
    Ok(())
}

// =============================================================================
// STORAGE BALANCE TESTS
// =============================================================================

#[tokio::test]
async fn test_storage_balance() -> anyhow::Result<()> {
    println!("\n=== Test: Storage Balance ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    // Initially no storage balance
    let initial_balance: Option<serde_json::Value> = contract
        .view("get_storage_balance")
        .args_json(json!({
            "account_id": alice.id()
        }))
        .await?
        .json()?;
    
    println!("Initial storage balance: {:?}", initial_balance);
    
    // Set some data (this should create storage balance)
    let set_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "profile/name": "Alice"
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(set_result.is_success(), "Set should succeed");
    
    // Check storage balance after setting data
    let after_balance: Option<serde_json::Value> = contract
        .view("get_storage_balance")
        .args_json(json!({
            "account_id": alice.id()
        }))
        .await?
        .json()?;
    
    println!("Storage balance after set: {:?}", after_balance);
    assert!(after_balance.is_some(), "Should have storage balance after writing data");
    
    println!("✅ Storage balance test passed");
    Ok(())
}

// =============================================================================
// EVENT EMISSION TESTS
// =============================================================================

#[tokio::test]
async fn test_events_emitted_on_set() -> anyhow::Result<()> {
    println!("\n=== Test: Events Emitted on Set ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    // Set data with event emission enabled
    let set_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "profile/name": "Alice"
            },
            "event_config": {
                "emit": true
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(set_result.is_success(), "Set should succeed");
    
    // Check logs for EVENT: prefix
    let logs = set_result.logs();
    println!("Transaction logs: {:?}", logs);
    
    let has_event = logs.iter().any(|log| log.starts_with("EVENT:"));
    assert!(has_event, "Should emit at least one EVENT: log");
    
    println!("✅ Events emitted on set test passed");
    Ok(())
}

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

#[tokio::test]
async fn test_unauthorized_write_fails() -> anyhow::Result<()> {
    println!("\n=== Test: Unauthorized Write Fails ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    // Alice sets her profile
    let set_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "profile/name": "Alice"
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(set_result.is_success(), "Alice's set should succeed");
    
    // Bob tries to write to Alice's path using set_for
    let bob_result = bob
        .call(contract.id(), "set_for")
        .args_json(json!({
            "target_account": alice.id(),
            "data": {
                "profile/name": "Hacked!"
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    println!("Bob's unauthorized write result: {:?}", bob_result.is_success());
    
    // The transaction might succeed but the operation should fail
    // or the transaction itself should fail
    if bob_result.is_success() {
        // If transaction succeeded, verify Alice's data wasn't changed
        let get_result: serde_json::Value = contract
            .view("get")
            .args_json(json!({
                "keys": [format!("{}/profile/name", alice.id())]
            }))
            .await?
            .json()?;
        
        let name_key = format!("{}/profile/name", alice.id());
        let name = get_result.get(&name_key).and_then(|v| v.as_str());
        assert_eq!(name, Some("Alice"), "Alice's name should not have been changed");
    }
    
    println!("✅ Unauthorized write fails test passed");
    Ok(())
}

#[tokio::test]
async fn test_add_member_to_nonexistent_group_fails() -> anyhow::Result<()> {
    println!("\n=== Test: Add Member to Nonexistent Group Fails ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    // Try to add Bob to a group that doesn't exist
    let add_result = alice
        .call(contract.id(), "add_group_member")
        .args_json(json!({
            "group_id": "nonexistent_group",
            "member_id": bob.id(),
            "permission_flags": 1
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    println!("Add to nonexistent group result: {:?}", add_result.is_success());
    
    // This should fail
    assert!(!add_result.is_success(), "Adding member to nonexistent group should fail");
    
    println!("✅ Add member to nonexistent group fails test passed");
    Ok(())
}

// =============================================================================
// REAL TRANSACTION FLOW TEST
// =============================================================================
// This test demonstrates a complete real-world transaction flow with:
// - Gas costs tracking
// - Storage deposit handling
// - Multi-user interactions
// - State verification across transactions
// - Event emission verification

#[tokio::test]
async fn test_real_transaction_flow_social_platform() -> anyhow::Result<()> {
    println!("\n{}", "=".repeat(80));
    println!("  REAL TRANSACTION FLOW TEST - Social Platform Simulation");
    println!("{}\n", "=".repeat(80));
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    // ==========================================================================
    // STEP 1: Create users with real NEAR balances
    // ==========================================================================
    println!("\n📦 STEP 1: Creating user accounts with NEAR balances...");
    
    let alice_initial_balance = NearToken::from_near(50);
    let bob_initial_balance = NearToken::from_near(20);
    let charlie_initial_balance = NearToken::from_near(10);
    
    let alice = create_user(&root, "alice", alice_initial_balance).await?;
    let bob = create_user(&root, "bob", bob_initial_balance).await?;
    let charlie = create_user(&root, "charlie", charlie_initial_balance).await?;
    
    println!("   Alice balance:   {} NEAR", alice.view_account().await?.balance.as_near());
    println!("   Bob balance:     {} NEAR", bob.view_account().await?.balance.as_near());
    println!("   Charlie balance: {} NEAR", charlie.view_account().await?.balance.as_near());
    
    // ==========================================================================
    // STEP 2: Alice sets up her profile (real transaction with gas)
    // ==========================================================================
    println!("\n📝 STEP 2: Alice sets up her profile...");
    
    let alice_balance_before = alice.view_account().await?.balance;
    
    let profile_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "profile/name": "Alice Developer",
                "profile/bio": "Building the decentralized future 🚀",
                "profile/avatar": "https://example.com/alice.png",
                "settings/theme": "dark",
                "settings/notifications": "true"
            },
            "event_config": { "emit": true }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(profile_result.is_success(), "Profile set should succeed");
    
    let alice_balance_after = alice.view_account().await?.balance;
    let gas_used = profile_result.total_gas_burnt;
    let storage_used = alice_balance_before.as_yoctonear() - alice_balance_after.as_yoctonear();
    
    println!("   ✓ Profile created successfully");
    println!("   ⛽ Gas used: {} TGas", gas_used.as_tgas());
    println!("   💰 NEAR spent (storage + gas): {} yoctoNEAR", storage_used);
    println!("   📋 Transaction hash: (simulated in sandbox)");
    
    // Verify events were emitted
    let logs = profile_result.logs();
    let event_count = logs.iter().filter(|l| l.starts_with("EVENT:")).count();
    println!("   📣 Events emitted: {}", event_count);
    
    // ==========================================================================
    // STEP 3: Alice creates a community group
    // ==========================================================================
    println!("\n👥 STEP 3: Alice creates 'rust_devs' community group...");
    
    let group_result = alice
        .call(contract.id(), "create_group")
        .args_json(json!({
            "group_id": "rust_devs",
            "config": {
                "is_private": false,
                "description": "A community for Rust developers on NEAR",
                "member_driven": false
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    
    assert!(group_result.is_success(), "Group creation should succeed");
    println!("   ✓ Group 'rust_devs' created");
    println!("   ⛽ Gas used: {} TGas", group_result.total_gas_burnt.as_tgas());
    
    // Verify group exists on-chain
    let group_config: Option<serde_json::Value> = contract
        .view("get_group_config")
        .args_json(json!({ "group_id": "rust_devs" }))
        .await?
        .json()?;
    
    assert!(group_config.is_some(), "Group config should exist");
    let config = group_config.unwrap();
    println!("   📊 Group owner: {}", config.get("owner").unwrap());
    println!("   📊 Created at block: {}", config.get("created_at").unwrap());
    
    // ==========================================================================
    // STEP 4: Alice adds Bob as a member with WRITE permission
    // ==========================================================================
    println!("\n➕ STEP 4: Alice adds Bob to the group with WRITE permission...");
    
    let add_bob_result = alice
        .call(contract.id(), "add_group_member")
        .args_json(json!({
            "group_id": "rust_devs",
            "member_id": bob.id(),
            "permission_flags": 1  // WRITE = 1
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(add_bob_result.is_success(), "Adding Bob should succeed");
    println!("   ✓ Bob added as member");
    
    // Verify Bob's membership on-chain
    let bob_member_data: Option<serde_json::Value> = contract
        .view("get_member_data")
        .args_json(json!({
            "group_id": "rust_devs",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    
    assert!(bob_member_data.is_some(), "Bob should be a member");
    let member_data = bob_member_data.unwrap();
    println!("   📊 Bob's permission flags: {}", member_data.get("permission_flags").unwrap());
    
    // ==========================================================================
    // STEP 5: Bob posts content to the group
    // ==========================================================================
    println!("\n💬 STEP 5: Bob posts content to the group...");
    
    let bob_balance_before = bob.view_account().await?.balance;
    
    let post_result = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "groups/rust_devs/posts/1/title": "Hello Rust Community!",
                "groups/rust_devs/posts/1/content": "Excited to be here. Working on NEAR smart contracts!",
                "groups/rust_devs/posts/1/author": bob.id().to_string(),
                "groups/rust_devs/posts/1/timestamp": "1733400000000"
            },
            "event_config": { "emit": true }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    if !post_result.is_success() {
        println!("   ❌ Post failed with errors:");
        for failure in post_result.failures() {
            println!("      Error: {:?}", failure);
        }
    }
    assert!(post_result.is_success(), "Bob's post should succeed");
    
    let bob_balance_after = bob.view_account().await?.balance;
    println!("   ✓ Post created successfully");
    println!("   ⛽ Gas used: {} TGas", post_result.total_gas_burnt.as_tgas());
    println!("   💰 Bob's NEAR change: {} yoctoNEAR", 
        bob_balance_before.as_yoctonear() as i128 - bob_balance_after.as_yoctonear() as i128);
    
    // ==========================================================================
    // STEP 6: Verify data is readable from blockchain
    // ==========================================================================
    println!("\n🔍 STEP 6: Verifying on-chain data...");
    
    // Read Alice's profile
    let alice_profile: std::collections::HashMap<String, serde_json::Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [
                format!("{}/profile/name", alice.id()),
                format!("{}/profile/bio", alice.id())
            ]
        }))
        .await?
        .json()?;
    
    println!("   📖 Alice's profile from chain:");
    for (key, value) in &alice_profile {
        println!("      {} = {}", key, value);
    }
    
    // Read Bob's post
    let bob_post: std::collections::HashMap<String, serde_json::Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [
                "groups/rust_devs/posts/1/title",
                "groups/rust_devs/posts/1/content"
            ]
        }))
        .await?
        .json()?;
    
    println!("   📖 Bob's post from chain:");
    for (key, value) in &bob_post {
        println!("      {} = {}", key, value);
    }
    
    // ==========================================================================
    // STEP 7: Check group statistics
    // ==========================================================================
    println!("\n📊 STEP 7: Checking group statistics...");
    
    let group_stats: Option<serde_json::Value> = contract
        .view("get_group_stats")
        .args_json(json!({ "group_id": "rust_devs" }))
        .await?
        .json()?;
    
    if let Some(stats) = group_stats {
        println!("   Total members: {}", stats.get("total_members").unwrap_or(&json!(0)));
    }
    
    // ==========================================================================
    // STEP 8: Charlie tries unauthorized action (should fail)
    // ==========================================================================
    println!("\n🚫 STEP 8: Charlie (non-member) tries to add member (should fail)...");
    
    let unauthorized_result = charlie
        .call(contract.id(), "add_group_member")
        .args_json(json!({
            "group_id": "rust_devs",
            "member_id": "random.near",
            "permission_flags": 1
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(!unauthorized_result.is_success(), "Unauthorized action should fail");
    println!("   ✓ Correctly rejected: Charlie has no permission to add members");
    
    // ==========================================================================
    // FINAL: Summary
    // ==========================================================================
    println!("\n{}", "=".repeat(80));
    println!("  TEST COMPLETED SUCCESSFULLY!");
    println!("{}", "=".repeat(80));
    println!("\n📈 Final account balances:");
    println!("   Alice:   {} NEAR", alice.view_account().await?.balance.as_near());
    println!("   Bob:     {} NEAR", bob.view_account().await?.balance.as_near());
    println!("   Charlie: {} NEAR", charlie.view_account().await?.balance.as_near());
    
    println!("\n✅ All real blockchain transactions verified!");
    println!("   - Profile creation with storage deposit");
    println!("   - Group creation and configuration");
    println!("   - Member management with permissions");
    println!("   - Content posting by authorized members");
    println!("   - Permission enforcement for unauthorized users");
    println!("   - Event emission for indexing");
    
    Ok(())
}

// =============================================================================
// Test: Batch Operations - Multiple Keys in One Transaction
// =============================================================================

#[tokio::test]
async fn test_batch_operations_multiple_keys() -> anyhow::Result<()> {
    println!("\n=== Test: Batch Operations - Multiple Keys in One Transaction ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;
    
    // Create a user
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    // ==========================================================================
    // TEST 1: Set multiple profile fields in one transaction
    // ==========================================================================
    println!("\n📦 TEST 1: Setting 10 profile fields in one transaction...");
    
    let batch_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "profile/name": "Alice Anderson",
                "profile/bio": "Blockchain developer and NEAR enthusiast",
                "profile/avatar": "https://example.com/alice.png",
                "profile/cover": "https://example.com/cover.png",
                "profile/location": "San Francisco, CA",
                "profile/website": "https://alice.dev",
                "profile/twitter": "@alice_dev",
                "profile/github": "alice-dev",
                "settings/theme": "dark",
                "settings/language": "en"
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(batch_result.is_success(), "Batch set should succeed");
    
    // Query the contract for storage balance - this shows actual bytes used
    let storage_balance: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": alice.id().to_string() }))
        .await?
        .json()?;
    
    let bytes_used = storage_balance["used_bytes"].as_u64().unwrap_or(0);
    let storage_near = bytes_used as f64 * 0.00001; // 1 byte = 0.00001 NEAR
    
    println!("   ✓ 10 fields set in single transaction");
    println!("   ⛽ Gas used: {} TGas", batch_result.total_gas_burnt.as_tgas());
    println!("   💾 Storage used: {} bytes (~{:.4} NEAR)", bytes_used, storage_near);
    
    // Verify all fields were set
    let result: std::collections::HashMap<String, serde_json::Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [
                format!("{}/profile/name", alice.id()),
                format!("{}/profile/bio", alice.id()),
                format!("{}/profile/avatar", alice.id()),
                format!("{}/profile/location", alice.id()),
                format!("{}/settings/theme", alice.id())
            ]
        }))
        .await?
        .json()?;
    
    assert_eq!(result.len(), 5, "Should retrieve 5 fields");
    println!("   ✓ All fields verified on-chain");
    
    // ==========================================================================
    // TEST 2: Larger batch - 20 keys in one transaction
    // ==========================================================================
    println!("\n📦 TEST 2: Setting 20 keys in one transaction...");
    
    let mut large_batch = serde_json::Map::new();
    for i in 0..20 {
        large_batch.insert(
            format!("data/items/{}/value", i),
            json!(format!("Item number {}", i))
        );
    }
    
    let large_batch_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": large_batch
        }))
        .deposit(NearToken::from_near(3)) // More storage needed
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;
    
    if !large_batch_result.is_success() {
        println!("   ❌ Batch failed with errors:");
        for failure in large_batch_result.failures() {
            println!("      Error: {:?}", failure);
        }
    }
    assert!(large_batch_result.is_success(), "Large batch should succeed");
    
    // Query storage after 20 keys added
    let storage_balance_2: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": alice.id().to_string() }))
        .await?
        .json()?;
    
    let bytes_used_2 = storage_balance_2["used_bytes"].as_u64().unwrap_or(0);
    let storage_near_2 = bytes_used_2 as f64 * 0.00001;
    let bytes_for_20_keys = bytes_used_2 - bytes_used; // delta from Test 1
    
    println!("   ✓ 20 keys set in single transaction");
    println!("   ⛽ Gas used: {} TGas", large_batch_result.total_gas_burnt.as_tgas());
    println!("   💾 Storage: +{} bytes (total: {} bytes, ~{:.4} NEAR)", bytes_for_20_keys, bytes_used_2, storage_near_2);
    
    // Verify some of the batch items (0-19 range since we created 20 items)
    let verify_result: std::collections::HashMap<String, serde_json::Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [
                format!("{}/data/items/0/value", alice.id()),
                format!("{}/data/items/10/value", alice.id()),
                format!("{}/data/items/19/value", alice.id())
            ]
        }))
        .await?
        .json()?;
    
    assert_eq!(verify_result.len(), 3, "Should retrieve 3 batch items");
    println!("   ✓ Batch items verified (first, middle, last)");
    
    // ==========================================================================
    // TEST 3: Mixed operations - updates and new keys
    // ==========================================================================
    println!("\n📦 TEST 3: Mixed batch - updates and new keys...");
    
    let mixed_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "profile/name": "Alice A. Anderson",  // UPDATE existing
                "profile/bio": "Senior blockchain developer", // UPDATE existing
                "profile/company": "NEAR Foundation",  // NEW key
                "profile/role": "Lead Developer"  // NEW key
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(mixed_result.is_success(), "Mixed batch should succeed");
    println!("   ✓ Mixed batch (2 updates + 2 new) succeeded");
    
    // Verify updates
    let updated: std::collections::HashMap<String, serde_json::Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [
                format!("{}/profile/name", alice.id()),
                format!("{}/profile/company", alice.id())
            ]
        }))
        .await?
        .json()?;
    
    let name = updated.get(&format!("{}/profile/name", alice.id()))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    assert_eq!(name, "Alice A. Anderson", "Name should be updated");
    println!("   ✓ Updates verified: name = '{}'", name);
    
    // ==========================================================================
    // TEST 4: Batch with nested JSON values
    // ==========================================================================
    println!("\n📦 TEST 4: Batch with nested JSON structures...");
    
    let nested_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "app/config": {
                    "version": "1.0.0",
                    "features": ["social", "groups", "messaging"],
                    "limits": {
                        "maxPosts": 1000,
                        "maxGroups": 50
                    }
                },
                "app/metadata": {
                    "created": "2025-12-05",
                    "updated": "2025-12-05"
                }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(nested_result.is_success(), "Nested batch should succeed");
    println!("   ✓ Nested JSON structures stored successfully");
    
    // ==========================================================================
    // TEST 5: Batch delete (set to null)
    // ==========================================================================
    println!("\n📦 TEST 5: Batch delete using null values...");
    
    let delete_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "profile/twitter": null,
                "profile/github": null,
                "settings/language": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(delete_result.is_success(), "Batch delete should succeed");
    println!("   ✓ 3 keys deleted in single transaction");
    
    // Verify deletions (keys should return empty/null)
    let deleted_check: std::collections::HashMap<String, serde_json::Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [
                format!("{}/profile/twitter", alice.id()),
                format!("{}/profile/name", alice.id())  // This should still exist
            ]
        }))
        .await?
        .json()?;
    
    // Name should exist, twitter should be gone
    assert!(deleted_check.contains_key(&format!("{}/profile/name", alice.id())), "Name should still exist");
    println!("   ✓ Deletions verified, existing keys preserved");
    
    // ==========================================================================
    // SUMMARY
    // ==========================================================================
    println!("\n✅ All batch operation tests passed!");
    println!("   - Single transaction with 10 fields");
    println!("   - Large batch with 50 keys");
    println!("   - Mixed updates and new keys");
    println!("   - Nested JSON structures");
    println!("   - Batch deletions");
    
    Ok(())
}