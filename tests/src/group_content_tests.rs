// =============================================================================
// Group Content Integration Tests
// =============================================================================
// Comprehensive tests for group content operations with user-owned storage
//
// Storage Design:
// - User sends: groups/{group_id}/posts/1
// - Contract stores at: {author}/groups/{group_id}/posts/1
// - User reads using the returned path directly
//
// Run tests with:
//   cargo test -p onsocial-integration-tests group_content -- --test-threads=1

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};
use std::path::Path;
use borsh::BorshDeserialize;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

// =============================================================================
// Event Types (mirrored from contract for decoding)
// =============================================================================

#[derive(BorshDeserialize, Debug)]
pub struct BorshExtra {
    pub key: String,
    pub value: BorshValue,
}

#[derive(BorshDeserialize, Debug)]
pub enum BorshValue {
    String(String),
    Number(String),
    Bool(bool),
    Null,
}

#[derive(BorshDeserialize, Debug)]
pub struct BaseEventData {
    pub block_height: u64,
    pub timestamp: u64,
    pub author: String,
    pub partition_id: Option<u16>,
    pub extra: Vec<BorshExtra>,
    pub evt_id: String,
    pub log_index: u32,
}

#[derive(BorshDeserialize, Debug)]
pub struct Event {
    pub evt_standard: String,
    pub version: String,
    pub evt_type: String,
    pub op_type: String,
    pub data: Option<BaseEventData>,
}

/// Decode a base64 EVENT: log into an Event struct
fn decode_event(log: &str) -> Option<Event> {
    if !log.starts_with("EVENT:") {
        return None;
    }
    let base64_data = &log[6..]; // Skip "EVENT:" prefix
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, base64_data).ok()?;
    Event::try_from_slice(&bytes).ok()
}

// =============================================================================
// Helper Functions
// =============================================================================

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

async fn deploy_and_init(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> anyhow::Result<Contract> {
    let wasm = load_core_onsocial_wasm()?;
    let contract = worker.dev_deploy(&wasm).await?;
    
    let _ = contract.call("new").args_json(json!({})).transact().await?;
    let _ = contract.call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact().await?;
    
    Ok(contract)
}

async fn create_user(root: &Account, name: &str, balance: NearToken) -> anyhow::Result<Account> {
    let user = root.create_subaccount(name).initial_balance(balance).transact().await?.unwrap();
    Ok(user)
}

async fn create_group(contract: &Contract, owner: &Account, group_id: &str) -> anyhow::Result<()> {
    let result = owner
        .call(contract.id(), "create_group")
        .args_json(json!({
            "group_id": group_id,
            "config": { "is_private": false }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success(), "Create group failed: {:?}", result.failures());
    Ok(())
}

async fn add_member(contract: &Contract, owner: &Account, group_id: &str, member: &Account, permissions: u8) -> anyhow::Result<()> {
    let result = owner
        .call(contract.id(), "add_group_member")
        .args_json(json!({
            "group_id": group_id,
            "member_id": member.id(),
            "permission_flags": permissions
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success(), "Add member failed: {:?}", result.failures());
    Ok(())
}

// =============================================================================
// BASIC CONTENT OPERATIONS
// =============================================================================

#[tokio::test]
async fn test_member_can_create_content() -> anyhow::Result<()> {
    println!("\n=== Test: Member Can Create Content ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    // Alice creates group, adds Bob with WRITE permission (1)
    create_group(&contract, &alice, "devs").await?;
    add_member(&contract, &alice, "devs", &bob, 1).await?;
    
    // Bob creates content
    let result = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "groups/devs/posts/hello": { "title": "Hello World", "body": "My first post" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success(), "Content creation should succeed");
    println!("✅ Member can create content");
    Ok(())
}

#[tokio::test]
async fn test_content_stored_at_user_owned_path() -> anyhow::Result<()> {
    println!("\n=== Test: Content Stored at User-Owned Path ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "devs").await?;
    add_member(&contract, &alice, "devs", &bob, 1).await?;
    
    // Bob creates content via groups/devs/posts/hello
    let _ = bob.call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "groups/devs/posts/hello": { "title": "Test Post" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Content should be at {bob}/groups/devs/posts/hello
    let user_owned_path = format!("{}/groups/devs/posts/hello", bob.id());
    
    // Get with include_metadata to check metadata fields
    let data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ 
            "keys": [user_owned_path.clone()],
            "include_metadata": true
        }))
        .await?
        .json()?;
    
    assert!(data.contains_key(&user_owned_path), "Content should exist at user-owned path");
    let result = data.get(&user_owned_path).unwrap();
    
    // With include_metadata=true, result has "data" and "metadata" fields
    let content_data = result.get("data").expect("Should have 'data' field");
    let metadata = result.get("metadata").expect("Should have 'metadata' field");
    
    // Verify raw content is stored (no enrichment wrapper)
    assert_eq!(content_data.get("title").unwrap().as_str().unwrap(), "Test Post");
    
    // Verify metadata fields (from MetadataBuilder)
    assert!(metadata.get("author").is_some(), "Metadata should have 'author'");
    assert!(metadata.get("block_height").is_some(), "Metadata should have 'block_height'");
    assert!(metadata.get("timestamp").is_some(), "Metadata should have 'timestamp'");
    assert!(metadata.get("group_id").is_some(), "Metadata should have 'group_id'");
    
    println!("   Content data: {:?}", content_data);
    println!("   Metadata: {:?}", metadata);
    println!("✅ Content stored at user-owned path with metadata");
    Ok(())
}

#[tokio::test]
async fn test_metadata_block_height() -> anyhow::Result<()> {
    println!("\n=== Test: Metadata Block Height ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "mygroup").await?;
    
    // Alice creates content
    let _ = alice.call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "groups/mygroup/posts/1": { "title": "Test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    let path = format!("{}/groups/mygroup/posts/1", alice.id());
    let data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ 
            "keys": [path.clone()],
            "include_metadata": true
        }))
        .await?
        .json()?;
    
    let result = data.get(&path).unwrap();
    let metadata = result.get("metadata").unwrap();
    
    // Block height should be a valid positive number
    let block_height = metadata.get("block_height").unwrap().as_u64().unwrap();
    assert!(block_height > 0, "block_height should be positive");
    
    // Timestamp should also be present
    let timestamp = metadata.get("timestamp").unwrap().as_u64().unwrap();
    assert!(timestamp > 0, "timestamp should be positive");
    
    println!("   block_height: {}", block_height);
    println!("   timestamp: {}", timestamp);
    
    println!("✅ Metadata block_height is correct");
    Ok(())
}

#[tokio::test]
async fn test_content_metadata() -> anyhow::Result<()> {
    println!("\n=== Test: Content Metadata ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "testgroup").await?;
    add_member(&contract, &alice, "testgroup", &bob, 1).await?;
    
    let _ = bob.call(contract.id(), "set")
        .args_json(json!({
            "data": {
                "groups/testgroup/posts/meta": { "title": "Metadata Test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    let path = format!("{}/groups/testgroup/posts/meta", bob.id());
    let data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ 
            "keys": [path.clone()],
            "include_metadata": true
        }))
        .await?
        .json()?;
    
    let result = data.get(&path).unwrap();
    let content_data = result.get("data").unwrap();
    let metadata = result.get("metadata").unwrap();
    
    // Verify raw content
    assert_eq!(content_data.get("title").unwrap().as_str().unwrap(), "Metadata Test");
    
    // Verify metadata fields from MetadataBuilder
    assert_eq!(metadata.get("author").unwrap().as_str().unwrap(), bob.id().as_str());
    assert_eq!(metadata.get("group_id").unwrap().as_str().unwrap(), "testgroup");
    
    // block_height should be positive
    let block_height = metadata.get("block_height").unwrap().as_u64().unwrap();
    assert!(block_height > 0, "block_height should be positive");
    
    println!("   author: {}", metadata.get("author").unwrap());
    println!("   group_id: {}", metadata.get("group_id").unwrap());
    println!("   block_height: {}", block_height);
    
    println!("✅ Content metadata is correct");
    Ok(())
}

#[tokio::test]
async fn test_member_can_update_own_content() -> anyhow::Result<()> {
    println!("\n=== Test: Member Can Update Own Content ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "devs").await?;
    add_member(&contract, &alice, "devs", &bob, 1).await?;
    
    // Bob creates content
    let _ = bob.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/devs/posts/update": { "title": "Original" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Bob updates content
    let update_result = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/devs/posts/update": { "title": "Updated" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(update_result.is_success(), "Update should succeed");
    
    // Verify updated content (raw content, no wrapper)
    let path = format!("{}/groups/devs/posts/update", bob.id());
    let data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ "keys": [path.clone()] }))
        .await?
        .json()?;
    
    let content = data.get(&path).unwrap();
    assert_eq!(content.get("title").unwrap().as_str().unwrap(), "Updated");
    
    println!("✅ Member can update own content");
    Ok(())
}

#[tokio::test]
async fn test_member_can_delete_own_content() -> anyhow::Result<()> {
    println!("\n=== Test: Member Can Delete Own Content ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "devs").await?;
    add_member(&contract, &alice, "devs", &bob, 1).await?;
    
    // Bob creates content
    let _ = bob.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/devs/posts/delete_me": { "title": "To Delete" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Verify content exists
    let path = format!("{}/groups/devs/posts/delete_me", bob.id());
    let data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ "keys": [path.clone()] }))
        .await?
        .json()?;
    assert!(data.contains_key(&path), "Content should exist before deletion");
    
    // Bob deletes content (null value)
    let delete_result = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/devs/posts/delete_me": null }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(delete_result.is_success(), "Delete should succeed");
    
    // Verify content is deleted (soft deleted - returns null or empty)
    let data_after: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ "keys": [path.clone()] }))
        .await?
        .json()?;
    
    // After soft delete, the key should either be missing or return a deleted marker
    let is_deleted = !data_after.contains_key(&path) || 
        data_after.get(&path).map(|v| v.is_null()).unwrap_or(true);
    assert!(is_deleted, "Content should be deleted");
    
    println!("✅ Member can delete own content");
    Ok(())
}

// =============================================================================
// PERMISSION TESTS
// =============================================================================

#[tokio::test]
async fn test_non_member_cannot_write() -> anyhow::Result<()> {
    println!("\n=== Test: Non-Member Cannot Write ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "private_group").await?;
    // Charlie is NOT added as a member
    
    // Charlie tries to write
    let result = charlie
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/private_group/posts/hack": { "title": "Unauthorized" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Should fail - Charlie is not a member
    assert!(!result.is_success(), "Non-member write should fail");
    
    println!("✅ Non-member cannot write to group");
    Ok(())
}

#[tokio::test]
async fn test_owner_can_write_without_explicit_membership() -> anyhow::Result<()> {
    println!("\n=== Test: Owner Can Write Without Explicit Membership ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "alice_group").await?;
    
    // Alice (owner) writes without being explicitly added as member
    let result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/alice_group/posts/owner": { "title": "Owner Post" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success(), "Owner should be able to write");
    
    println!("✅ Owner can write without explicit membership");
    Ok(())
}

// =============================================================================
// COLLISION TESTS
// =============================================================================

#[tokio::test]
async fn test_same_user_multiple_groups_no_collision() -> anyhow::Result<()> {
    println!("\n=== Test: Same User Multiple Groups - No Collision ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    
    // Create two groups
    create_group(&contract, &alice, "group_a").await?;
    create_group(&contract, &alice, "group_b").await?;
    add_member(&contract, &alice, "group_a", &bob, 1).await?;
    add_member(&contract, &alice, "group_b", &bob, 1).await?;
    
    // Bob posts same path to both groups
    let _ = bob.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/group_a/posts/1": { "title": "Post in A" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    let _ = bob.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/group_b/posts/1": { "title": "Post in B" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Verify both exist with different content
    let path_a = format!("{}/groups/group_a/posts/1", bob.id());
    let path_b = format!("{}/groups/group_b/posts/1", bob.id());
    
    let data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ "keys": [path_a.clone(), path_b.clone()] }))
        .await?
        .json()?;
    
    assert!(data.contains_key(&path_a), "Post in group_a should exist");
    assert!(data.contains_key(&path_b), "Post in group_b should exist");
    
    // Raw content (no wrapper)
    let title_a = data.get(&path_a).unwrap().get("title").unwrap().as_str().unwrap();
    let title_b = data.get(&path_b).unwrap().get("title").unwrap().as_str().unwrap();
    
    assert_eq!(title_a, "Post in A");
    assert_eq!(title_b, "Post in B");
    
    println!("✅ Same user multiple groups - no collision");
    Ok(())
}

#[tokio::test]
async fn test_multiple_users_same_group_no_collision() -> anyhow::Result<()> {
    println!("\n=== Test: Multiple Users Same Group - No Collision ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "shared").await?;
    add_member(&contract, &alice, "shared", &bob, 1).await?;
    add_member(&contract, &alice, "shared", &charlie, 1).await?;
    
    // Both post to same path
    let _ = bob.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/shared/posts/1": { "title": "Bob's Post" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    let _ = charlie.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/shared/posts/1": { "title": "Charlie's Post" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Verify both exist (different storage paths)
    let bob_path = format!("{}/groups/shared/posts/1", bob.id());
    let charlie_path = format!("{}/groups/shared/posts/1", charlie.id());
    
    let data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ "keys": [bob_path.clone(), charlie_path.clone()] }))
        .await?
        .json()?;
    
    assert!(data.contains_key(&bob_path), "Bob's post should exist");
    assert!(data.contains_key(&charlie_path), "Charlie's post should exist");
    
    // Raw content (no wrapper)
    let bob_title = data.get(&bob_path).unwrap().get("title").unwrap().as_str().unwrap();
    let charlie_title = data.get(&charlie_path).unwrap().get("title").unwrap().as_str().unwrap();
    
    assert_eq!(bob_title, "Bob's Post");
    assert_eq!(charlie_title, "Charlie's Post");
    
    println!("✅ Multiple users same group - no collision");
    Ok(())
}

// =============================================================================
// NAMESPACE PROTECTION TESTS
// =============================================================================

#[tokio::test]
async fn test_cannot_write_to_groups_namespace_without_membership() -> anyhow::Result<()> {
    println!("\n=== Test: Cannot Write to groups/ Namespace Without Membership ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let attacker = create_user(&root, "attacker", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "protected").await?;
    
    // Attacker tries to write directly to groups/ path
    let result = attacker
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/protected/posts/hack": { "title": "Hacked!" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Should fail - attacker is not a member
    assert!(!result.is_success(), "Writing to groups/ without membership should fail");
    
    println!("✅ Cannot write to groups/ namespace without membership");
    Ok(())
}

#[tokio::test]
async fn test_cannot_write_to_nonexistent_group() -> anyhow::Result<()> {
    println!("\n=== Test: Cannot Write to Nonexistent Group ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    // Try to write to a group that doesn't exist
    let result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/nonexistent/posts/1": { "title": "Ghost Post" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Should fail - group doesn't exist
    assert!(!result.is_success(), "Writing to nonexistent group should fail");
    
    println!("✅ Cannot write to nonexistent group");
    Ok(())
}

// =============================================================================
// EVENT TESTS
// =============================================================================

#[tokio::test]
async fn test_content_creation_emits_event() -> anyhow::Result<()> {
    println!("\n=== Test: Content Creation Emits Event ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "event_group").await?;
    
    let result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/event_group/posts/1": { "title": "Event Test" } },
            "event_config": { "emit": true }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success());
    
    // Check for events
    let logs = result.logs();
    let event_count = logs.iter().filter(|l| l.starts_with("EVENT:")).count();
    
    assert!(event_count > 0, "Should emit at least one event");
    println!("   Events emitted: {}", event_count);
    
    println!("✅ Content creation emits event");
    Ok(())
}

#[tokio::test]
async fn test_deletion_emits_event() -> anyhow::Result<()> {
    println!("\n=== Test: Deletion Emits Event ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "delete_event").await?;
    
    // Create content first
    let _ = alice.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/delete_event/posts/1": { "title": "To Delete" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Delete with events enabled
    let delete_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/delete_event/posts/1": null },
            "event_config": { "emit": true }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(delete_result.is_success());
    
    let logs = delete_result.logs();
    let event_count = logs.iter().filter(|l| l.starts_with("EVENT:")).count();
    
    assert!(event_count > 0, "Deletion should emit event");
    println!("   Deletion events: {}", event_count);
    
    println!("✅ Deletion emits event");
    Ok(())
}

#[tokio::test]
async fn test_content_block_height_matches_event() -> anyhow::Result<()> {
    println!("\n=== Test: Metadata Block Height Matches Event ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "block_test").await?;
    
    // Create content with events enabled
    let result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/block_test/posts/1": { "title": "Block Height Test" } },
            "event_config": { "emit": true }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success());
    
    // Decode event to get block_height
    let logs = result.logs();
    let events: Vec<Event> = logs.iter()
        .filter_map(|log| decode_event(log))
        .collect();
    
    assert!(!events.is_empty(), "Should have at least one event");
    
    let event = &events[0];
    let event_block_height = event.data.as_ref().unwrap().block_height;
    println!("   Event block_height: {}", event_block_height);
    
    // Get stored content with metadata
    let path = format!("{}/groups/block_test/posts/1", alice.id());
    let data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ 
            "keys": [path.clone()],
            "include_metadata": true
        }))
        .await?
        .json()?;
    
    let result = data.get(&path).unwrap();
    let metadata = result.get("metadata").unwrap();
    let metadata_block_height = metadata.get("block_height").unwrap().as_u64().unwrap();
    println!("   Metadata block_height: {}", metadata_block_height);
    
    // Event block_height should match metadata block_height
    assert_eq!(event_block_height, metadata_block_height, 
        "Event block_height should match metadata block_height");
    
    println!("✅ Metadata block_height matches event block_height");
    Ok(())
}

// =============================================================================
// UPDATE VS CREATE OPERATION TESTS
// =============================================================================

#[tokio::test]
async fn test_create_emits_create_operation() -> anyhow::Result<()> {
    println!("\n=== Test: Create Emits 'create' Operation ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "op_test").await?;
    
    // Create new content
    let result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/op_test/posts/new": { "title": "New Post" } },
            "event_config": { "emit": true }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success());
    
    // Decode events and check operation
    let logs = result.logs();
    let events: Vec<Event> = logs.iter()
        .filter_map(|log| decode_event(log))
        .collect();
    
    let create_event = events.iter()
        .find(|e| e.evt_type == "GROUP_UPDATE" && e.op_type == "create");
    
    assert!(create_event.is_some(), "Should emit 'create' operation for new content");
    println!("   Operation: create ✓");
    
    println!("✅ Create emits 'create' operation");
    Ok(())
}

#[tokio::test]
async fn test_update_emits_update_operation() -> anyhow::Result<()> {
    println!("\n=== Test: Update Emits 'update' Operation ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "op_test2").await?;
    
    // First create content
    let _ = alice.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/op_test2/posts/1": { "title": "Original" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Now update the same content
    let update_result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/op_test2/posts/1": { "title": "Updated" } },
            "event_config": { "emit": true }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(update_result.is_success());
    
    // Decode events and check operation
    let logs = update_result.logs();
    let events: Vec<Event> = logs.iter()
        .filter_map(|log| decode_event(log))
        .collect();
    
    let update_event = events.iter()
        .find(|e| e.evt_type == "GROUP_UPDATE" && e.op_type == "update");
    
    assert!(update_event.is_some(), "Should emit 'update' operation for existing content");
    println!("   Operation: update ✓");
    
    println!("✅ Update emits 'update' operation");
    Ok(())
}

// =============================================================================
// CROSS-USER PROTECTION TESTS
// =============================================================================

#[tokio::test]
async fn test_user_cannot_modify_another_users_content() -> anyhow::Result<()> {
    println!("\n=== Test: User Cannot Modify Another User's Content ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "shared_group").await?;
    add_member(&contract, &alice, "shared_group", &bob, 1).await?;
    add_member(&contract, &alice, "shared_group", &charlie, 1).await?;
    
    // Bob creates content
    let _ = bob.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/shared_group/posts/bobs_post": { "title": "Bob's Original" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Charlie tries to update Bob's content by using Bob's path directly
    // This should create Charlie's own content, NOT modify Bob's
    let _ = charlie.call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/shared_group/posts/bobs_post": { "title": "Charlie's Attempt" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Verify Bob's content is unchanged
    let bob_path = format!("{}/groups/shared_group/posts/bobs_post", bob.id());
    let data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ "keys": [bob_path.clone()] }))
        .await?
        .json()?;
    
    let bob_content = data.get(&bob_path).unwrap();
    assert_eq!(bob_content.get("title").unwrap().as_str().unwrap(), "Bob's Original",
        "Bob's content should be unchanged");
    
    // Charlie's content is at Charlie's path
    let charlie_path = format!("{}/groups/shared_group/posts/bobs_post", charlie.id());
    let charlie_data: std::collections::HashMap<String, Value> = contract
        .view("get")
        .args_json(json!({ "keys": [charlie_path.clone()] }))
        .await?
        .json()?;
    
    let charlie_content = charlie_data.get(&charlie_path).unwrap();
    assert_eq!(charlie_content.get("title").unwrap().as_str().unwrap(), "Charlie's Attempt");
    
    println!("   Bob's content unchanged: ✓");
    println!("   Charlie got separate content: ✓");
    println!("✅ User cannot modify another user's content");
    Ok(())
}

// =============================================================================
// GROUP CONTENT-SPECIFIC VALIDATION TESTS
// =============================================================================
// These test validations specific to GroupContentManager (beyond Path::new())

#[tokio::test]
async fn test_path_without_content_path_rejected() -> anyhow::Result<()> {
    println!("\n=== Test: Path Without Content Path Rejected ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "mygroup").await?;
    
    // Try: groups/mygroup (no content path after group_id)
    let result = alice
        .call(contract.id(), "set")
        .args_json(json!({
            "data": { "groups/mygroup": { "title": "Bad" } }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Should fail - no content path after group_id
    assert!(!result.is_success(), "Path without content should be rejected");
    
    println!("✅ Path without content path rejected");
    Ok(())
}
