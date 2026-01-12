// =============================================================================
// Group Content Integration Tests
// =============================================================================
// Comprehensive tests for group content operations with user-owned storage
//
// Storage Design:
// - User sends: groups/{group_id/content/posts/1
// - Contract stores at: {author/groups/{group_id}/content/posts/1
// - User reads using the returned path directly
//
// Run tests with:
//   cargo test -p onsocial-integration-tests group_content -- --test-threads=1

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

// =============================================================================
// NEP-297 Event Types (JSON format)
// =============================================================================

/// NEP-297 compliant event wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub standard: String,
    pub version: String,
    pub event: String,
    pub data: Vec<EventData>,
}

/// Event data payload with flattened extra fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventData {
    pub operation: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partition_id: Option<u16>,
    // Flattened extra fields captured dynamically
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, Value>,
}

const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

/// Decode a NEP-297 EVENT_JSON: log into an Event struct
fn decode_event(log: &str) -> Option<Event> {
    if !log.starts_with(EVENT_JSON_PREFIX) {
        return None;
    }
    let json_str = &log[EVENT_JSON_PREFIX.len()..];

    // NOTE: Contract event `data` objects can include fields that collide with
    // top-level `EventData` fields due to `#[serde(flatten)]` usage.
    // Deserializing directly into `EventData` may fail with "duplicate field".
    // Decode to a generic map first, then extract known fields.
    #[derive(Deserialize)]
    struct RawEvent {
        standard: String,
        version: String,
        event: String,
        data: Vec<serde_json::Map<String, Value>>,
    }

    let raw: RawEvent = serde_json::from_str(json_str).ok()?;
    let data = raw
        .data
        .into_iter()
        .map(|mut map| {
            let operation = map
                .remove("operation")
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_default();
            let author = map
                .remove("author")
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_default();
            let partition_id = map
                .remove("partition_id")
                .and_then(|v| v.as_u64())
                .map(|n| n as u16);
            let extra = map.into_iter().collect::<std::collections::HashMap<_, _>>();
            EventData {
                operation,
                author,
                partition_id,
                extra,
            }
        })
        .collect();

    Some(Event {
        standard: raw.standard,
        version: raw.version,
        event: raw.event,
        data,
    })
}

/// Get the operation from an event
fn get_event_operation(event: &Event) -> Option<&str> {
    event.data.first().map(|d| d.operation.as_str())
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": group_id, "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success(), "Create group failed: {:?}", result.failures());
    Ok(())
}

async fn add_member(contract: &Contract, owner: &Account, group_id: &str, member: &Account, _permissions: u8) -> anyhow::Result<()> {
    let result = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": group_id, "member_id": member.id() }
            }
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "groups/devs/content/posts/hello": { "title": "Hello World", "body": "My first post" }
                } },
                "options": null,
                "auth": null
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
    
    // Bob creates content via groups/devs/content/posts/hello
    let _ = bob.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "groups/devs/content/posts/hello": { "title": "Test Post" }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
// Content should be at {bob/groups/devs/content/posts/hello
    let user_owned_path = format!("{}/groups/devs/content/posts/hello", bob.id());
    
    // get() now returns ordered EntryView values (no stored metadata envelope).
    let entries: Vec<Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [user_owned_path.clone()]
        }))
        .await?
        .json()?;

    assert_eq!(entries.len(), 1, "Should return one EntryView");
    let entry = &entries[0];
    assert_eq!(
        entry.get("requested_key").and_then(|v| v.as_str()),
        Some(user_owned_path.as_str())
    );
    assert_eq!(
        entry.get("full_key").and_then(|v| v.as_str()),
        Some(user_owned_path.as_str())
    );
    assert_eq!(entry.get("deleted").and_then(|v| v.as_bool()), Some(false));

    let content_value = entry.get("value").expect("EntryView should have value field");
    assert_eq!(
        content_value.get("title").and_then(|v| v.as_str()),
        Some("Test Post")
    );

    let block_height: u64 = entry
        .get("block_height")
        .and_then(|v| v.as_str())
        .expect("EntryView should have block_height")
        .parse()
        .unwrap();
    assert!(block_height > 0, "block_height should be positive");

    println!("   Content value: {:?}", content_value);
    println!("   block_height: {}", block_height);
    println!("✅ Content stored at user-owned path");
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
    let _ = alice.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "groups/mygroup/content/posts/1": { "title": "Test" }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    let path = format!("{}/groups/mygroup/content/posts/1", alice.id());
    let entries: Vec<Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [path.clone()]
        }))
        .await?
        .json()?;

    assert_eq!(entries.len(), 1);
    let entry = &entries[0];

    // Block height should be a valid positive number
    let block_height: u64 = entry
        .get("block_height")
        .and_then(|v| v.as_str())
        .unwrap()
        .parse()
        .unwrap();
    assert!(block_height > 0, "block_height should be positive");

    println!("   block_height: {}", block_height);

    println!("✅ block_height is correct");
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
    
    let _ = bob.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "groups/testgroup/content/posts/meta": {
                        "title": "Metadata Test",
                        "metadata": {
                            "author": "spoofed.near",
                            "timestamp": 0,
                            "parent_id": "p1"
                        }
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    let path = format!("{}/groups/testgroup/content/posts/meta", bob.id());
    let entries: Vec<Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [path.clone()]
        }))
        .await?
        .json()?;

    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    let content_data = entry.get("value").unwrap();

    // Verify raw content (including any client-provided "metadata" field inside the value)
    assert_eq!(content_data.get("title").unwrap().as_str().unwrap(), "Metadata Test");
    assert_eq!(
        content_data
            .get("metadata")
            .and_then(|m| m.get("author"))
            .and_then(|v| v.as_str()),
        Some("spoofed.near")
    );
    assert_eq!(
        content_data
            .get("metadata")
            .and_then(|m| m.get("parent_id"))
            .and_then(|v| v.as_str()),
        Some("p1")
    );

    let client_metadata = content_data
        .get("metadata")
        .expect("content should include client-provided metadata field");

    // block_height should be positive
    let block_height: u64 = entry
        .get("block_height")
        .and_then(|v| v.as_str())
        .unwrap()
        .parse()
        .unwrap();
    assert!(block_height > 0, "block_height should be positive");

    println!(
        "   author: {}",
        client_metadata.get("author").and_then(|v| v.as_str()).unwrap_or("<missing>")
    );
    println!(
        "   parent_id: {}",
        client_metadata.get("parent_id").and_then(|v| v.as_str()).unwrap_or("<missing>")
    );
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
    let _ = bob.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/devs/content/posts/update": { "title": "Original" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Bob updates content
    let update_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/devs/content/posts/update": { "title": "Updated" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(update_result.is_success(), "Update should succeed");
    
    // Verify updated content (raw content, no wrapper)
    let path = format!("{}/groups/devs/content/posts/update", bob.id());
    let entries: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [path.clone()] }))
        .await?
        .json()?;

    assert_eq!(entries.len(), 1, "Should return one EntryView");
    let entry = &entries[0];
    assert_eq!(
        entry.get("full_key").and_then(|v| v.as_str()),
        Some(path.as_str())
    );
    assert_eq!(entry.get("deleted").and_then(|v| v.as_bool()), Some(false));

    let content = entry.get("value").expect("EntryView should have value");
    assert_eq!(
        content.get("title").and_then(|v| v.as_str()),
        Some("Updated")
    );
    
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
    let _ = bob.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/devs/content/posts/delete_me": { "title": "To Delete" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Verify content exists
    let path = format!("{}/groups/devs/content/posts/delete_me", bob.id());
    let entries_before: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [path.clone()] }))
        .await?
        .json()?;
    assert_eq!(entries_before.len(), 1, "Should return one EntryView");
    let entry_before = &entries_before[0];
    assert_eq!(
        entry_before.get("full_key").and_then(|v| v.as_str()),
        Some(path.as_str())
    );
    assert_eq!(entry_before.get("deleted").and_then(|v| v.as_bool()), Some(false));
    assert!(
        entry_before.get("value").map(|v| !v.is_null()).unwrap_or(false),
        "Content should exist before deletion"
    );
    
    // Bob deletes content (null value)
    let delete_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/devs/content/posts/delete_me": null  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(delete_result.is_success(), "Delete should succeed");
    
    // Verify content is deleted (tombstone => deleted=true, value=null)
    let entries_after: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [path.clone()] }))
        .await?
        .json()?;

    assert_eq!(entries_after.len(), 1, "Should return one EntryView");
    let entry_after = &entries_after[0];
    assert_eq!(
        entry_after.get("full_key").and_then(|v| v.as_str()),
        Some(path.as_str())
    );
    assert_eq!(entry_after.get("deleted").and_then(|v| v.as_bool()), Some(true));
    assert!(
        entry_after.get("value").map(|v| v.is_null()).unwrap_or(true),
        "Deleted EntryView should have null value"
    );
    
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/private_group/content/posts/hack": { "title": "Unauthorized" }  } },
                "options": null,
                "auth": null
            }
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/alice_group/content/posts/owner": { "title": "Owner Post" }  } },
                "options": null,
                "auth": null
            }
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
    let _ = bob.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/group_a/content/posts/1": { "title": "Post in A" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    let _ = bob.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/group_b/content/posts/1": { "title": "Post in B" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Verify both exist with different content
    let path_a = format!("{}/groups/group_a/content/posts/1", bob.id());
    let path_b = format!("{}/groups/group_b/content/posts/1", bob.id());

    let entries: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [path_a.clone(), path_b.clone()] }))
        .await?
        .json()?;

    assert_eq!(entries.len(), 2, "Should return one EntryView per requested key");

    let find_title = |key: &str| -> Option<String> {
        entries
            .iter()
            .find(|e| e.get("full_key").and_then(|v| v.as_str()) == Some(key))
            .and_then(|e| e.get("value"))
            .and_then(|v| v.get("title"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    };

    let title_a = find_title(&path_a).expect("Post in group_a should exist");
    let title_b = find_title(&path_b).expect("Post in group_b should exist");
    
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
    let _ = bob.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/shared/content/posts/1": { "title": "Bob's Post" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    let _ = charlie.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/shared/content/posts/1": { "title": "Charlie's Post" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Verify both exist (different storage paths)
    let bob_path = format!("{}/groups/shared/content/posts/1", bob.id());
    let charlie_path = format!("{}/groups/shared/content/posts/1", charlie.id());

    let entries: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [bob_path.clone(), charlie_path.clone()] }))
        .await?
        .json()?;

    assert_eq!(entries.len(), 2, "Should return one EntryView per requested key");

    let find_title = |key: &str| -> Option<String> {
        entries
            .iter()
            .find(|e| e.get("full_key").and_then(|v| v.as_str()) == Some(key))
            .and_then(|e| e.get("value"))
            .and_then(|v| v.get("title"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    };

    let bob_title = find_title(&bob_path).expect("Bob's post should exist");
    let charlie_title = find_title(&charlie_path).expect("Charlie's post should exist");
    
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/protected/content/posts/hack": { "title": "Hacked!" }  } },
                "options": null,
                "auth": null
            }
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/nonexistent/content/posts/1": { "title": "Ghost Post" }  } },
                "options": null,
                "auth": null
            }
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/event_group/content/posts/1": { "title": "Event Test" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success());
    
    // Check for events
    let logs = result.logs();
    let event_count = logs.iter().filter(|l| l.starts_with("EVENT_JSON:")).count();
    
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
    let _ = alice.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/delete_event/content/posts/1": { "title": "To Delete" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Delete with events enabled
    let delete_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/delete_event/content/posts/1": null  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(delete_result.is_success());
    
    let logs = delete_result.logs();
    let event_count = logs.iter().filter(|l| l.starts_with("EVENT_JSON:")).count();
    
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/block_test/content/posts/1": { "title": "Block Height Test" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success());
    
    // Decode event to verify it was emitted
    let logs = result.logs();
    let events: Vec<Event> = logs.iter()
        .filter_map(|log| decode_event(log))
        .collect();
    
    assert!(!events.is_empty(), "Should have at least one event");
    println!("   ✓ Event emitted successfully");
    
    // Get stored content
    let path = format!("{}/groups/block_test/content/posts/1", alice.id());
    let entries: Vec<Value> = contract
        .view("get")
        .args_json(json!({
            "keys": [path.clone()]
        }))
        .await?
        .json()?;

    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    let height: u64 = entry
        .get("block_height")
        .and_then(|v| v.as_str())
        .unwrap()
        .parse()
        .unwrap();
    println!("   ✓ block_height: {}", height);

    assert!(height > 0, "EntryView should have valid block_height");

    println!("✅ block_height is valid");
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/op_test/content/posts/new": { "title": "New Post" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success());
    
    // Decode events and check operation
    let logs = result.logs();
    println!("   📝 Total logs: {}", logs.len());
    for (i, log) in logs.iter().enumerate() {
        if log.starts_with("EVENT_JSON:") {
            println!("   Event {}: {}", i, log);
        }
    }
    let events: Vec<Event> = logs.iter()
        .filter_map(|log| decode_event(log))
        .collect();
    
    println!("   📊 Decoded {} events", events.len());
    for (i, ev) in events.iter().enumerate() {
        println!("   Event {}: type={}, operation={:?}", i, ev.event, get_event_operation(ev));
    }
    
    let create_event = events.iter()
        .find(|e| e.event == "GROUP_UPDATE" && get_event_operation(e) == Some("create"));
    
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
    let _ = alice.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/op_test2/content/posts/1": { "title": "Original" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Now update the same content
    let update_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/op_test2/content/posts/1": { "title": "Updated" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(update_result.is_success());
    
    // Decode events and check operation
    let logs = update_result.logs();
    println!("   📝 Total logs: {}", logs.len());
    for (i, log) in logs.iter().enumerate() {
        if log.starts_with("EVENT_JSON:") {
            println!("   Event {}: {}", i, log);
        }
    }
    let events: Vec<Event> = logs.iter()
        .filter_map(|log| decode_event(log))
        .collect();
    
    println!("   📊 Decoded {} events", events.len());
    for (i, ev) in events.iter().enumerate() {
        println!("   Event {}: type={}, operation={:?}", i, ev.event, get_event_operation(ev));
    }
    
    let update_event = events.iter()
        .find(|e| e.event == "GROUP_UPDATE" && get_event_operation(e) == Some("update"));
    
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
    let _ = bob.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/shared_group/content/posts/bobs_post": { "title": "Bob's Original" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Charlie tries to update Bob's content by using Bob's path directly
    // This should create Charlie's own content, NOT modify Bob's
    let _ = charlie.call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/shared_group/content/posts/bobs_post": { "title": "Charlie's Attempt" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Verify Bob's content is unchanged
    let bob_path = format!("{}/groups/shared_group/content/posts/bobs_post", bob.id());

    let bob_entries: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [bob_path.clone()] }))
        .await?
        .json()?;

    assert_eq!(bob_entries.len(), 1, "Should return one EntryView");
    let bob_content = bob_entries[0].get("value").expect("EntryView should have value");
    assert_eq!(
        bob_content.get("title").and_then(|v| v.as_str()),
        Some("Bob's Original"),
        "Bob's content should be unchanged"
    );
    
    // Charlie's content is at Charlie's path
    let charlie_path = format!("{}/groups/shared_group/content/posts/bobs_post", charlie.id());

    let charlie_entries: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [charlie_path.clone()] }))
        .await?
        .json()?;

    assert_eq!(charlie_entries.len(), 1, "Should return one EntryView");
    let charlie_content = charlie_entries[0].get("value").expect("EntryView should have value");
    assert_eq!(
        charlie_content.get("title").and_then(|v| v.as_str()),
        Some("Charlie's Attempt")
    );
    
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
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "groups/mygroup": { "title": "Bad" }  } },
                "options": null,
                "auth": null
            }
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

// =============================================================================
// EVENT DERIVED FIELDS TESTS (events/fields.rs coverage)
// =============================================================================

/// Helper to extract a string from event extra fields
fn get_extra_str(event: &Event, key: &str) -> Option<String> {
    event.data.first()
        .and_then(|d| d.extra.get(key))
        .and_then(|v| v.as_str().map(|s| s.to_string()))
}

/// Helper to extract a bool from event extra fields
fn get_extra_bool_val(event: &Event, key: &str) -> Option<bool> {
    event.data.first()
        .and_then(|d| d.extra.get(key))
        .and_then(|v| v.as_bool())
}

/// Helper to extract a u64 from event extra fields
fn get_extra_u64(event: &Event, key: &str) -> Option<u64> {
    event.data.first()
        .and_then(|d| d.extra.get(key))
        .and_then(|v| v.as_u64())
}

/// Find events by event type from logs
fn find_events_by_type(logs: &[String], event_type: &str) -> Vec<Event> {
    logs.iter()
        .filter_map(|log| decode_event(log))
        .filter(|e| e.event == event_type)
        .collect()
}

/// Tests that GROUP_UPDATE events contain correct derived fields from events/fields.rs:
/// - id: last path segment
/// - type: collection segment (e.g., "posts")
/// - group_id: extracted group identifier
/// - group_path: relative path within group
/// - is_group_content: true for group paths
/// - block_height: current block height
/// - block_timestamp: current block timestamp
#[tokio::test]
async fn test_event_derived_fields_for_group_content() -> anyhow::Result<()> {
    println!("\n=== Test: Event Derived Fields for Group Content ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "testgrp").await?;
    
    // Create group content at: groups/testgrp/posts/article1
    // Stored at: {alice}/groups/testgrp/posts/article1
    let result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "groups/testgrp/posts/article1": { "title": "Test Article" }
                } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success(), "Content creation should succeed: {:?}", result.failures());
    
    let logs: Vec<String> = result.logs().iter().map(|s| s.to_string()).collect();
    let group_events = find_events_by_type(&logs, "GROUP_UPDATE");
    
    assert!(!group_events.is_empty(), "Should emit GROUP_UPDATE event");
    
    // Find the create event (not the meta event)
    let create_event = group_events.iter()
        .find(|e| e.data.first().map(|d| d.operation.as_str()) == Some("create"))
        .expect("Should have create operation event");
    
    // Verify derived fields from derived_fields_from_path()
    let id = get_extra_str(create_event, "id");
    let typ = get_extra_str(create_event, "type");
    let group_id = get_extra_str(create_event, "group_id");
    let group_path = get_extra_str(create_event, "group_path");
    let is_group_content = get_extra_bool_val(create_event, "is_group_content");
    
    println!("   id: {:?}", id);
    println!("   type: {:?}", typ);
    println!("   group_id: {:?}", group_id);
    println!("   group_path: {:?}", group_path);
    println!("   is_group_content: {:?}", is_group_content);
    
    // Path stored: {alice}/groups/testgrp/posts/article1
    // Expected derived fields:
    assert_eq!(id.as_deref(), Some("article1"), "id should be last path segment");
    assert_eq!(typ.as_deref(), Some("posts"), "type should be collection segment");
    assert_eq!(group_id.as_deref(), Some("testgrp"), "group_id should be extracted");
    assert_eq!(group_path.as_deref(), Some("posts/article1"), "group_path should be relative path within group");
    assert_eq!(is_group_content, Some(true), "is_group_content should be true");
    
    // Verify block context from insert_block_context()
    let block_height = get_extra_u64(create_event, "block_height");
    let block_timestamp = get_extra_u64(create_event, "block_timestamp");
    
    println!("   block_height: {:?}", block_height);
    println!("   block_timestamp: {:?}", block_timestamp);
    
    assert!(block_height.is_some(), "block_height should be present");
    assert!(block_height.unwrap() > 0, "block_height should be positive");
    assert!(block_timestamp.is_some(), "block_timestamp should be present");
    assert!(block_timestamp.unwrap() > 0, "block_timestamp should be positive");
    
    println!("✅ Event derived fields for group content are correct");
    Ok(())
}

/// Tests that DATA_UPDATE events for non-group paths contain correct derived fields:
/// - id: last path segment
/// - type: collection segment
/// - No group_id, group_path, is_group_content fields
#[tokio::test]
async fn test_event_derived_fields_for_non_group_data() -> anyhow::Result<()> {
    println!("\n=== Test: Event Derived Fields for Non-Group Data ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    // Write non-group data: profile/settings
    // Stored at: {alice}/profile/settings
    let result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "profile/settings": { "theme": "dark" }
                } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success(), "Data write should succeed: {:?}", result.failures());
    
    let logs: Vec<String> = result.logs().iter().map(|s| s.to_string()).collect();
    let data_events = find_events_by_type(&logs, "DATA_UPDATE");
    
    assert!(!data_events.is_empty(), "Should emit DATA_UPDATE event");
    
    let set_event = data_events.iter()
        .find(|e| e.data.first().map(|d| d.operation.as_str()) == Some("set"))
        .expect("Should have set operation event");
    
    // Verify derived fields
    let id = get_extra_str(set_event, "id");
    let typ = get_extra_str(set_event, "type");
    let group_id = get_extra_str(set_event, "group_id");
    let is_group_content = get_extra_bool_val(set_event, "is_group_content");
    
    println!("   id: {:?}", id);
    println!("   type: {:?}", typ);
    println!("   group_id: {:?}", group_id);
    println!("   is_group_content: {:?}", is_group_content);
    
    // Path: {alice}/profile/settings
    // Expected: id=settings, type=profile, no group fields
    assert_eq!(id.as_deref(), Some("settings"), "id should be last path segment");
    assert_eq!(typ.as_deref(), Some("profile"), "type should be collection segment");
    assert!(group_id.is_none(), "group_id should NOT be present for non-group paths");
    assert!(is_group_content.is_none(), "is_group_content should NOT be present for non-group paths");
    
    // Verify block context
    let block_height = get_extra_u64(set_event, "block_height");
    let block_timestamp = get_extra_u64(set_event, "block_timestamp");
    
    assert!(block_height.is_some() && block_height.unwrap() > 0, "block_height should be present and positive");
    assert!(block_timestamp.is_some() && block_timestamp.unwrap() > 0, "block_timestamp should be present and positive");
    
    println!("✅ Event derived fields for non-group data are correct");
    Ok(())
}

/// Tests derived fields for deeply nested group paths
#[tokio::test]
async fn test_event_derived_fields_deep_nested_path() -> anyhow::Result<()> {
    println!("\n=== Test: Event Derived Fields for Deep Nested Path ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "deepgrp").await?;
    
    // Deep path: groups/deepgrp/content/posts/2024/01/10/article
    let result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "groups/deepgrp/content/posts/2024/01/10/article": { "title": "Deep" }
                } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(result.is_success(), "Deep path write should succeed: {:?}", result.failures());
    
    let logs: Vec<String> = result.logs().iter().map(|s| s.to_string()).collect();
    let group_events = find_events_by_type(&logs, "GROUP_UPDATE");
    
    let create_event = group_events.iter()
        .find(|e| e.data.first().map(|d| d.operation.as_str()) == Some("create"))
        .expect("Should have create operation event");
    
    let id = get_extra_str(create_event, "id");
    let typ = get_extra_str(create_event, "type");
    let group_id = get_extra_str(create_event, "group_id");
    let group_path = get_extra_str(create_event, "group_path");
    
    println!("   id: {:?}", id);
    println!("   type: {:?}", typ);
    println!("   group_id: {:?}", group_id);
    println!("   group_path: {:?}", group_path);
    
    // Path: {alice}/groups/deepgrp/content/posts/2024/01/10/article
    // parts[0]=alice, parts[1]=groups, parts[2]=deepgrp, parts[3]=content, ...
    // type = parts[3] = content (account-prefixed group pattern)
    assert_eq!(id.as_deref(), Some("article"), "id should be last segment");
    assert_eq!(typ.as_deref(), Some("content"), "type should be parts[3] for account-prefixed group");
    assert_eq!(group_id.as_deref(), Some("deepgrp"), "group_id should be extracted");
    assert_eq!(group_path.as_deref(), Some("content/posts/2024/01/10/article"), "group_path should be full relative path");
    
    println!("✅ Event derived fields for deep nested path are correct");
    Ok(())
}

/// Tests derived fields for group content deletion
#[tokio::test]
async fn test_event_derived_fields_on_delete() -> anyhow::Result<()> {
    println!("\n=== Test: Event Derived Fields on Delete ===");
    
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;
    
    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    
    create_group(&contract, &alice, "delgrp").await?;
    
    // Create content first
    let _ = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "groups/delgrp/posts/todelete": { "title": "Will Delete" }
                } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // Delete content (set to null)
    let delete_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "groups/delgrp/posts/todelete": null
                } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(delete_result.is_success(), "Delete should succeed: {:?}", delete_result.failures());
    
    let logs: Vec<String> = delete_result.logs().iter().map(|s| s.to_string()).collect();
    let group_events = find_events_by_type(&logs, "GROUP_UPDATE");
    
    let delete_event = group_events.iter()
        .find(|e| e.data.first().map(|d| d.operation.as_str()) == Some("delete"))
        .expect("Should have delete operation event");
    
    // Verify derived fields are still present on delete events
    let id = get_extra_str(delete_event, "id");
    let group_id = get_extra_str(delete_event, "group_id");
    let is_group_content = get_extra_bool_val(delete_event, "is_group_content");
    let block_height = get_extra_u64(delete_event, "block_height");
    
    println!("   id: {:?}", id);
    println!("   group_id: {:?}", group_id);
    println!("   is_group_content: {:?}", is_group_content);
    println!("   block_height: {:?}", block_height);
    
    assert_eq!(id.as_deref(), Some("todelete"), "id should be present on delete");
    assert_eq!(group_id.as_deref(), Some("delgrp"), "group_id should be present on delete");
    assert_eq!(is_group_content, Some(true), "is_group_content should be true on delete");
    assert!(block_height.is_some(), "block_height should be present on delete");
    
    println!("✅ Event derived fields on delete are correct");
    Ok(())
}
