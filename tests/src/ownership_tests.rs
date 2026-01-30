// =============================================================================
// Ownership Module Integration Tests
// =============================================================================
// Tests for domain/groups/members/ownership.rs
// Covers edge cases for GroupStorage::is_owner():
// - Non-existent group returns false
// - Empty group_id returns false
// - Ownership transfer correctly updates owner
// - Owner protection (cannot be removed/blacklisted by MANAGE users)
//
// Run with:
//   make test-integration-contract-core-onsocial TEST=ownership_tests

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

// =============================================================================
// TEST: is_group_owner returns false for non-existent group
// =============================================================================
// Covers: ownership.rs line 10-11 (storage_get returns None -> false)
#[tokio::test]
async fn test_is_owner_nonexistent_group_returns_false() -> anyhow::Result<()> {
    println!("\n=== Test: is_owner returns false for non-existent group ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Query is_group_owner for a group that doesn't exist
    let is_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "nonexistent_group_xyz_123",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;

    assert!(
        !is_owner,
        "is_owner should return false for non-existent group"
    );
    println!("   ✓ is_owner correctly returns false for non-existent group");

    Ok(())
}

// =============================================================================
// TEST: is_group_owner returns false for empty group_id
// =============================================================================
// Covers: ownership.rs edge case - empty string path handling
#[tokio::test]
async fn test_is_owner_empty_group_id_returns_false() -> anyhow::Result<()> {
    println!("\n=== Test: is_owner returns false for empty group_id ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Query is_group_owner with empty group_id
    let is_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;

    assert!(!is_owner, "is_owner should return false for empty group_id");
    println!("   ✓ is_owner correctly returns false for empty group_id");

    Ok(())
}

// =============================================================================
// TEST: is_group_owner correctly identifies owner vs non-owner
// =============================================================================
// Covers: ownership.rs lines 12-14 (cfg.owner == *user_id comparison)
#[tokio::test]
async fn test_is_owner_distinguishes_owner_from_non_owner() -> anyhow::Result<()> {
    println!("\n=== Test: is_owner distinguishes owner from non-owner ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "owner_test_group", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob as a member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "owner_test_group", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");

    // Test 1: Alice (creator) should be owner
    let is_alice_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "owner_test_group",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_alice_owner, "Alice should be the owner");
    println!("   ✓ Alice (creator) is correctly identified as owner");

    // Test 2: Bob (member) should NOT be owner
    let is_bob_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "owner_test_group",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(!is_bob_owner, "Bob should NOT be the owner");
    println!("   ✓ Bob (member) is correctly identified as non-owner");

    // Test 3: Charlie (not a member) should NOT be owner
    let is_charlie_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "owner_test_group",
            "user_id": charlie.id().to_string()
        }))
        .await?
        .json()?;
    assert!(!is_charlie_owner, "Charlie should NOT be the owner");
    println!("   ✓ Charlie (non-member) is correctly identified as non-owner");

    Ok(())
}

// =============================================================================
// TEST: Ownership transfer correctly updates is_owner results
// =============================================================================
// Covers: ownership.rs - verifies is_owner reflects config changes after transfer
#[tokio::test]
async fn test_ownership_transfer_updates_is_owner() -> anyhow::Result<()> {
    println!("\n=== Test: Ownership transfer correctly updates is_owner ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "transfer_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob as a member (required for transfer)
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "transfer_test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");

    // Verify initial state: Alice is owner, Bob is not
    let alice_owner_before: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "transfer_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(alice_owner_before, "Alice should be owner before transfer");

    let bob_owner_before: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "transfer_test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(!bob_owner_before, "Bob should NOT be owner before transfer");
    println!("   ✓ Initial state verified: Alice=owner, Bob=not owner");

    // Transfer ownership to Bob
    let transfer_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "transfer_group_ownership", "group_id": "transfer_test", "new_owner": bob.id().to_string(), "remove_old_owner": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(transfer_result.is_success(), "Transfer should succeed");
    println!("   ✓ Ownership transferred from Alice to Bob");

    // Verify new state: Bob is owner, Alice is NOT
    let alice_owner_after: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "transfer_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        !alice_owner_after,
        "Alice should NOT be owner after transfer"
    );
    println!("   ✓ Alice is correctly NO LONGER owner after transfer");

    let bob_owner_after: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "transfer_test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(bob_owner_after, "Bob should be owner after transfer");
    println!("   ✓ Bob is correctly owner after transfer");

    Ok(())
}

// =============================================================================
// TEST: Owner cannot be blacklisted
// =============================================================================
// Covers: blacklist.rs line 33 - is_owner check prevents blacklisting owner
#[tokio::test]
async fn test_owner_cannot_be_blacklisted() -> anyhow::Result<()> {
    println!("\n=== Test: Owner cannot be blacklisted ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "blacklist_owner_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob as a member with MANAGE permission
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "blacklist_owner_test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");

    // Grant Bob MANAGE permission
    let grant_manage = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": bob.id().to_string(), "path": "groups/blacklist_owner_test/config", "level": 3, "expires_at": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(grant_manage.is_success(), "Grant MANAGE should succeed");
    println!("   ✓ Bob granted MANAGE permission");

    // Bob (with MANAGE) tries to blacklist Alice (owner) - SHOULD FAIL
    let blacklist_attempt = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "blacklist_owner_test", "member_id": alice.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(
        !blacklist_attempt.is_success(),
        "Blacklisting owner should fail"
    );
    println!("   ✓ Blacklist owner attempt correctly rejected");

    // Verify Alice is NOT blacklisted
    let is_alice_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "blacklist_owner_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(!is_alice_blacklisted, "Owner should NOT be blacklisted");
    println!("   ✓ Owner remains not blacklisted");

    // Verify Alice is still owner
    let is_alice_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "blacklist_owner_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_alice_owner, "Alice should still be owner");
    println!("   ✓ Alice is still the owner");

    Ok(())
}

// =============================================================================
// TEST: Owner cannot be removed by MANAGE users
// =============================================================================
// Covers: add_remove.rs line 232 - is_owner check prevents removal
#[tokio::test]
async fn test_owner_cannot_be_removed_by_manage() -> anyhow::Result<()> {
    println!("\n=== Test: Owner cannot be removed by MANAGE users ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "remove_owner_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob as a member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "remove_owner_test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");

    // Grant Bob MANAGE permission
    let grant_manage = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": bob.id().to_string(), "path": "groups/remove_owner_test/config", "level": 3, "expires_at": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(grant_manage.is_success(), "Grant MANAGE should succeed");
    println!("   ✓ Bob granted MANAGE permission");

    // Bob (with MANAGE) tries to remove Alice (owner) - SHOULD FAIL
    let remove_attempt = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "remove_group_member", "group_id": "remove_owner_test", "member_id": alice.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!remove_attempt.is_success(), "Removing owner should fail");
    println!("   ✓ Remove owner attempt correctly rejected");

    // Verify Alice is still a member
    let is_alice_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "remove_owner_test",
            "member_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_alice_member, "Owner should still be a member");
    println!("   ✓ Owner remains a member");

    // Verify Alice is still owner
    let is_alice_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "remove_owner_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_alice_owner, "Alice should still be owner");
    println!("   ✓ Alice is still the owner");

    Ok(())
}

// =============================================================================
// TEST: Owner cannot leave group (must transfer first)
// =============================================================================
// Covers: add_remove.rs line 232 - is_owner check in leave_group
#[tokio::test]
async fn test_owner_cannot_leave_group() -> anyhow::Result<()> {
    println!("\n=== Test: Owner cannot leave group ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "owner_leave_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Verify Alice is owner
    let is_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "owner_leave_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_owner, "Alice should be the owner");

    // Alice tries to leave - SHOULD FAIL
    let leave_attempt = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "owner_leave_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!leave_attempt.is_success(), "Owner leaving should fail");
    println!("   ✓ Owner leave attempt correctly rejected");

    // Verify Alice is still owner and member
    let still_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "owner_leave_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(still_owner, "Alice should still be owner");

    let still_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "owner_leave_test",
            "member_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(still_member, "Alice should still be a member");
    println!("   ✓ Owner remains as member and owner");

    Ok(())
}

// =============================================================================
// TEST: is_owner with special characters in group_id
// =============================================================================
// Covers: ownership.rs - path construction with special characters
#[tokio::test]
async fn test_is_owner_special_characters_group_id() -> anyhow::Result<()> {
    println!("\n=== Test: is_owner with special characters in group_id ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Try group_id with path traversal attempt (should be rejected or safe)
    let is_owner_path_traversal: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "../../../config",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        !is_owner_path_traversal,
        "Path traversal group_id should return false"
    );
    println!("   ✓ Path traversal attempt returns false");

    // Try group_id with slashes
    let is_owner_slashes: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "group/with/slashes",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        !is_owner_slashes,
        "Group ID with slashes should return false (invalid group)"
    );
    println!("   ✓ Group ID with slashes returns false");

    // Create a valid group with underscores and hyphens
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "valid-group_123", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(
        create_result.is_success(),
        "Create group with valid special chars should succeed"
    );

    let is_owner_valid: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "valid-group_123",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        is_owner_valid,
        "Owner check for valid group should return true"
    );
    println!("   ✓ Valid group_id with hyphens/underscores works correctly");

    Ok(())
}

// =============================================================================
// TEST: is_owner is used correctly in can_grant_permissions
// =============================================================================
// Covers: queries.rs line 16 - is_owner check in permission granting
#[tokio::test]
async fn test_is_owner_in_permission_granting() -> anyhow::Result<()> {
    println!("\n=== Test: is_owner used correctly in permission granting ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "perm_grant_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob and Charlie as members
    for (user, name) in [(&bob, "bob"), (&charlie, "charlie")] {
        let add_result = alice
            .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "perm_grant_test", "member_id": user.id().to_string() }
            }
        }))
            .deposit(ONE_NEAR)
            .gas(near_workspaces::types::Gas::from_tgas(100))
            .transact()
            .await?;
        assert!(add_result.is_success(), "Add {} should succeed", name);
    }

    // Alice (owner) can grant permissions
    let owner_grant = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": bob.id().to_string(), "path": "groups/perm_grant_test/content", "level": 1, "expires_at": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(owner_grant.is_success(), "Owner should be able to grant");
    println!("   ✓ Owner can grant permissions");

    // Bob (non-owner, no MANAGE) cannot grant to Charlie
    let non_owner_grant = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": charlie.id().to_string(), "path": "groups/perm_grant_test/content", "level": 1, "expires_at": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(
        !non_owner_grant.is_success(),
        "Non-owner without MANAGE should not grant"
    );
    println!("   ✓ Non-owner without MANAGE cannot grant permissions");

    Ok(())
}

// =============================================================================
// TEST: Transfer to blacklisted member fails
// =============================================================================
// Covers: ownership.rs lines 69-70 - is_blacklisted check
// Note: Blacklisting removes membership, so we test by adding back to blacklist
// then attempting transfer (blacklist takes precedence over membership)
#[tokio::test]
async fn test_transfer_to_blacklisted_member_fails() -> anyhow::Result<()> {
    println!("\n=== Test: Transfer to blacklisted member fails ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "blacklist_transfer_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob as a member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "blacklist_transfer_test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");

    // Blacklist Bob (this also removes membership)
    let blacklist_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "blacklist_transfer_test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(blacklist_bob.is_success(), "Blacklist Bob should succeed");
    println!("   ✓ Bob blacklisted");

    // Verify Bob is blacklisted
    let is_bob_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "blacklist_transfer_test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_bob_blacklisted, "Bob should be blacklisted");

    // Try to transfer ownership to blacklisted Bob - SHOULD FAIL
    // Either due to membership check (blacklist removes membership) or blacklist check
    let transfer_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "transfer_group_ownership", "group_id": "blacklist_transfer_test", "new_owner": bob.id().to_string(), "remove_old_owner": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(
        !transfer_result.is_success(),
        "Transfer to blacklisted member should fail"
    );

    // Verify error - either "not a member" (blacklist removes membership) or "blacklisted"
    let error_msg = format!("{:?}", transfer_result.failures());
    assert!(
        error_msg.contains("member") || error_msg.contains("blacklist"),
        "Error should mention member or blacklist: {}",
        error_msg
    );
    println!("   ✓ Transfer to blacklisted member correctly rejected");

    // Verify Alice is still owner
    let is_alice_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "blacklist_transfer_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_alice_owner, "Alice should still be owner");
    println!("   ✓ Ownership unchanged after failed transfer");

    Ok(())
}

// =============================================================================
// TEST: Member-driven group creates proposal instead of direct transfer
// =============================================================================
// Covers: ownership.rs lines 55-56 - member_driven check (via routing)
// For member-driven groups, transfer_group_ownership creates a proposal
// rather than directly transferring ownership.
#[tokio::test]
async fn test_member_driven_group_creates_transfer_proposal() -> anyhow::Result<()> {
    println!("\n=== Test: Member-driven group creates transfer proposal ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a member-driven group (must be private)
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "member_driven_transfer_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    if !create_result.is_success() {
        println!("   ⚠ Create failed: {:?}", create_result.failures());
    }
    assert!(create_result.is_success(), "Create group should succeed");
    println!("   ✓ Member-driven group created");

    // Add Bob via proposal (member-driven groups require proposals for member changes)
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "member_driven_transfer_test", "proposal_type": "member_invite", "changes": {
                "target_user": bob.id().to_string(),
                "message": "Add Bob"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    if !add_bob.is_success() {
        println!("   ⚠ Add Bob failed: {:?}", add_bob.failures());
    }
    assert!(add_bob.is_success(), "Add Bob should succeed");
    println!("   ✓ Bob added via proposal");

    // Alice calls transfer_group_ownership - for member-driven, this creates a PROPOSAL
    let transfer_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "transfer_group_ownership", "group_id": "member_driven_transfer_test", "new_owner": bob.id().to_string(), "remove_old_owner": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // For member-driven groups, this creates a proposal (succeeds)
    assert!(
        transfer_result.is_success(),
        "Transfer call should succeed (creates proposal)"
    );
    println!("   ✓ Transfer proposal created");

    // Verify Alice is STILL owner (proposal not yet executed)
    let is_alice_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "member_driven_transfer_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        is_alice_owner,
        "Alice should still be owner (proposal pending)"
    );
    println!("   ✓ Ownership NOT transferred (proposal pending)");

    // Verify Bob is NOT owner yet
    let is_bob_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "member_driven_transfer_test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        !is_bob_owner,
        "Bob should not be owner yet (proposal pending)"
    );
    println!("   ✓ Bob is not owner yet - governance process required");

    Ok(())
}

// =============================================================================
// TEST: Governance proposal execution path (from_governance=true)
// =============================================================================
// Covers: ownership.rs lines 77-100 - transfer_ownership_internal with from_governance=true
// This tests the complete governance flow: create proposal -> vote -> execute -> verify transfer
#[tokio::test]
async fn test_governance_proposal_executes_ownership_transfer() -> anyhow::Result<()> {
    println!("\n=== Test: Governance proposal executes ownership transfer ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a member-driven group (must be private)
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "gov_transfer_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");
    println!("   ✓ Member-driven group created");

    // Add Bob via proposal (Alice auto-approves as proposer in 1-member group)
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "gov_transfer_test", "proposal_type": "member_invite", "changes": {
                "target_user": bob.id().to_string(),
                "message": "Add Bob"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");
    println!("   ✓ Bob added to group");

    // Add Charlie via proposal - Alice creates, Bob votes
    let add_charlie = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "gov_transfer_test", "proposal_type": "member_invite", "changes": {
                "target_user": charlie.id().to_string(),
                "message": "Add Charlie"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        add_charlie.is_success(),
        "Add Charlie proposal should succeed"
    );
    let charlie_proposal_id: String = add_charlie.json()?;

    // Bob votes to pass Charlie's invite
    let bob_vote_charlie = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "gov_transfer_test", "proposal_id": charlie_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(bob_vote_charlie.is_success(), "Bob's vote should succeed");
    println!("   ✓ Charlie added to group (3 members: Alice, Bob, Charlie)");

    // Alice creates transfer proposal to Bob using create_group_proposal
    // (transfer_group_ownership for member-driven groups returns () not proposal ID)
    let transfer_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "gov_transfer_test", "proposal_type": "group_update", "changes": {
                "update_type": "transfer_ownership",
                "new_owner": bob.id().to_string(),
                "remove_old_owner": false,
                "action": "transfer_ownership"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        transfer_proposal.is_success(),
        "Transfer proposal should succeed"
    );
    let proposal_id: String = transfer_proposal.json()?;
    println!("   ✓ Transfer ownership proposal created: {}", proposal_id);

    // Verify Alice is still owner before voting completes
    let is_alice_owner_before: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "gov_transfer_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        is_alice_owner_before,
        "Alice should still be owner before vote"
    );

    // Bob votes YES on transfer proposal
    // Since Alice auto-votes as proposer, Bob's vote reaches 2/3 quorum
    let bob_vote = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "gov_transfer_test", "proposal_id": proposal_id.clone(), "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        bob_vote.is_success(),
        "Bob's vote on transfer should succeed"
    );
    println!("   ✓ Bob voted YES on transfer proposal (quorum reached: Alice + Bob = 2/3)");

    // Verify Bob is NOW the owner (governance executed transfer_ownership_internal with from_governance=true)
    let is_bob_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "gov_transfer_test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        is_bob_owner,
        "Bob should now be owner after governance execution"
    );
    println!("   ✓ Bob is now the owner");

    // Verify Alice is no longer owner (remove_old_owner was false, but only one owner allowed)
    let is_alice_owner_after: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "gov_transfer_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    // Note: remove_old_owner=false means Alice should remain a member, but ownership transferred
    println!("   📊 Alice is owner after: {}", is_alice_owner_after);
    assert!(!is_alice_owner_after, "Alice should no longer be owner");
    println!("   ✓ Ownership transferred via governance (from_governance=true path verified)");

    // Verify Alice is still a member (remove_old_owner was false)
    let is_alice_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "gov_transfer_test",
            "member_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(
        is_alice_member,
        "Alice should still be a member (remove_old_owner=false)"
    );
    println!("   ✓ Alice remains as member (not removed)");

    Ok(())
}

// =============================================================================
// TEST: Governance proposal validation rejects non-member new_owner (Issue #2)
// =============================================================================
// Covers: validation.rs TransferOwnership case - new_owner must be a member
#[tokio::test]
async fn test_governance_proposal_rejects_non_member_new_owner() -> anyhow::Result<()> {
    println!("\n=== Test: Governance proposal rejects non-member new_owner ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a member-driven group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "validate_non_member_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob as member (so we have 2 members for voting)
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "validate_non_member_test", "proposal_type": "member_invite", "changes": { "target_user": bob.id().to_string() }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");
    println!("   ✓ Bob added to group");

    // Try to create transfer proposal to Charlie (NOT a member) - SHOULD FAIL
    let transfer_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "validate_non_member_test", "proposal_type": "group_update", "changes": {
                "update_type": "transfer_ownership",
                "new_owner": charlie.id().to_string(),
                "remove_old_owner": false
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !transfer_proposal.is_success(),
        "Proposal to transfer to non-member should fail"
    );
    let error_msg = format!("{:?}", transfer_proposal.failures());
    assert!(
        error_msg.contains("member"),
        "Error should mention membership: {}",
        error_msg
    );
    println!("   ✓ Proposal correctly rejected - new_owner must be a member");

    Ok(())
}

// =============================================================================
// TEST: Governance proposal validation rejects blacklisted new_owner (Issue #2)
// =============================================================================
// Covers: validation.rs TransferOwnership case - new_owner cannot be blacklisted
#[tokio::test]
async fn test_governance_proposal_rejects_blacklisted_new_owner() -> anyhow::Result<()> {
    println!("\n=== Test: Governance proposal rejects blacklisted new_owner ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a member-driven group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "validate_blacklist_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob and Charlie as members
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "validate_blacklist_test", "proposal_type": "member_invite", "changes": { "target_user": bob.id().to_string() }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");

    let add_charlie = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "validate_blacklist_test", "proposal_type": "member_invite", "changes": { "target_user": charlie.id().to_string() }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_charlie.is_success(), "Add Charlie should succeed");
    let charlie_proposal_id: String = add_charlie.json()?;

    // Bob votes to pass Charlie's invite
    let bob_vote = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "validate_blacklist_test", "proposal_id": charlie_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(bob_vote.is_success(), "Bob's vote should succeed");
    println!("   ✓ Charlie added as member");

    // Now ban Charlie via proposal
    let ban_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "validate_blacklist_test", "proposal_type": "group_update", "changes": {
                "update_type": "ban",
                "target_user": charlie.id().to_string()
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(ban_proposal.is_success(), "Ban proposal should succeed");
    let ban_proposal_id: String = ban_proposal.json()?;

    // Bob votes to pass the ban
    let bob_vote_ban = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "validate_blacklist_test", "proposal_id": ban_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(bob_vote_ban.is_success(), "Bob's ban vote should succeed");
    println!("   ✓ Charlie blacklisted");

    // Verify Charlie is blacklisted
    let is_charlie_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "validate_blacklist_test",
            "user_id": charlie.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_charlie_blacklisted, "Charlie should be blacklisted");

    // Try to create transfer proposal to blacklisted Charlie - SHOULD FAIL
    let transfer_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "validate_blacklist_test", "proposal_type": "group_update", "changes": {
                "update_type": "transfer_ownership",
                "new_owner": charlie.id().to_string(),
                "remove_old_owner": false
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !transfer_proposal.is_success(),
        "Proposal to transfer to blacklisted member should fail"
    );
    let error_msg = format!("{:?}", transfer_proposal.failures());
    assert!(
        error_msg.contains("blacklist") || error_msg.contains("member"),
        "Error should mention blacklist or member: {}",
        error_msg
    );
    println!("   ✓ Proposal correctly rejected - cannot transfer to blacklisted user");

    Ok(())
}

// =============================================================================
// TEST: Transfer event includes triggered_by and from_governance fields (Issue #3)
// =============================================================================
// Covers: ownership.rs lines 98-99 - new event fields
#[tokio::test]
async fn test_transfer_event_includes_triggered_by_and_from_governance() -> anyhow::Result<()> {
    println!("\n=== Test: Transfer event includes triggered_by and from_governance ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "event_fields_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob as member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "event_fields_test", "member_id": bob.id().to_string() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");

    // Transfer ownership (direct, not governance)
    let transfer_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "transfer_group_ownership", "group_id": "event_fields_test", "new_owner": bob.id().to_string(), "remove_old_owner": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(transfer_result.is_success(), "Transfer should succeed");

    // Check event logs for new fields
    let logs = transfer_result.logs();
    let transfer_event = logs
        .iter()
        .find(|log| log.starts_with("EVENT_JSON:") && log.contains("transfer_ownership"));

    assert!(
        transfer_event.is_some(),
        "Should emit transfer_ownership event"
    );
    let event_json = transfer_event.unwrap();

    // Verify triggered_by field exists
    assert!(
        event_json.contains("triggered_by"),
        "Event should contain triggered_by field"
    );
    println!("   ✓ Event contains triggered_by field");

    // Verify from_governance field exists
    assert!(
        event_json.contains("from_governance"),
        "Event should contain from_governance field"
    );
    println!("   ✓ Event contains from_governance field");

    // Verify from_governance is false for direct transfer
    assert!(
        event_json.contains("\"from_governance\":false")
            || event_json.contains("\"from_governance\": false"),
        "from_governance should be false for direct transfer"
    );
    println!("   ✓ from_governance=false for direct transfer");

    // Verify triggered_by contains alice's account
    assert!(
        event_json.contains(alice.id().as_str()),
        "triggered_by should reference the caller (Alice)"
    );
    println!("   ✓ triggered_by correctly identifies Alice as caller");

    Ok(())
}

// =============================================================================
// TEST: Governance transfer event includes from_governance=true (Issue #3)
// =============================================================================
// Covers: ownership.rs - from_governance field is true for governance-driven transfers
#[tokio::test]
async fn test_governance_transfer_event_has_from_governance_true() -> anyhow::Result<()> {
    println!("\n=== Test: Governance transfer event has from_governance=true ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a member-driven group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "gov_event_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob via proposal (Alice auto-approves)
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "gov_event_test", "proposal_type": "member_invite", "changes": { "target_user": bob.id().to_string() }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");

    // Add Charlie via proposal
    let add_charlie = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "gov_event_test", "proposal_type": "member_invite", "changes": { "target_user": charlie.id().to_string() }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_charlie.is_success(), "Add Charlie should succeed");
    let charlie_proposal_id: String = add_charlie.json()?;

    // Bob votes to pass Charlie's invite
    let bob_vote = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "gov_event_test", "proposal_id": charlie_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(bob_vote.is_success(), "Bob's vote should succeed");
    println!("   ✓ 3 members in group: Alice, Bob, Charlie");

    // Create transfer ownership proposal to Bob
    let transfer_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "gov_event_test", "proposal_type": "group_update", "changes": {
                "update_type": "transfer_ownership",
                "new_owner": bob.id().to_string(),
                "remove_old_owner": false
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        transfer_proposal.is_success(),
        "Transfer proposal should succeed"
    );
    let proposal_id: String = transfer_proposal.json()?;
    println!("   ✓ Transfer proposal created");

    // Bob votes YES - this reaches quorum (Alice + Bob = 2/3) and executes
    let bob_vote_transfer = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "gov_event_test", "proposal_id": proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(bob_vote_transfer.is_success(), "Bob's vote should succeed");

    // Check event logs for from_governance=true
    let logs = bob_vote_transfer.logs();
    let transfer_event = logs
        .iter()
        .find(|log| log.starts_with("EVENT_JSON:") && log.contains("transfer_ownership"));

    assert!(
        transfer_event.is_some(),
        "Should emit transfer_ownership event"
    );
    let event_json = transfer_event.unwrap();

    // Verify from_governance is true for governance-driven transfer
    assert!(
        event_json.contains("\"from_governance\":true")
            || event_json.contains("\"from_governance\": true"),
        "from_governance should be true for governance transfer: {}",
        event_json
    );
    println!("   ✓ from_governance=true for governance transfer");

    // Verify triggered_by contains Alice (the proposer who initiated the transfer)
    // Note: executor is now the proposer, not the final voter
    assert!(
        event_json.contains(alice.id().as_str()),
        "triggered_by should reference Alice (proposer who initiated transfer)"
    );
    println!("   ✓ triggered_by correctly identifies Alice as initiator");

    Ok(())
}

// =============================================================================
// TEST: Proposal validation rejects missing new_owner field (Issue #2)
// =============================================================================
// Covers: validation.rs - new_owner is required error
#[tokio::test]
async fn test_governance_proposal_rejects_missing_new_owner() -> anyhow::Result<()> {
    println!("\n=== Test: Governance proposal rejects missing new_owner ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a member-driven group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "missing_owner_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob as member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "missing_owner_test", "proposal_type": "member_invite", "changes": { "target_user": bob.id().to_string() }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Add Bob should succeed");

    // Try to create transfer proposal WITHOUT new_owner field - SHOULD FAIL
    let transfer_proposal = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "missing_owner_test", "proposal_type": "group_update", "changes": {
                "update_type": "transfer_ownership",
                "remove_old_owner": false
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !transfer_proposal.is_success(),
        "Proposal without new_owner should fail"
    );
    let error_msg = format!("{:?}", transfer_proposal.failures());
    assert!(
        error_msg.contains("new_owner") || error_msg.contains("required"),
        "Error should mention new_owner is required: {}",
        error_msg
    );
    println!("   ✓ Proposal correctly rejected - new_owner is required");

    Ok(())
}
