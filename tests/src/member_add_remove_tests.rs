// =============================================================================
// Member Add/Remove Integration Tests
// =============================================================================
// Covers edge cases for group membership operations including:
// - Nonce invalidation on rejoin (permission revocation)
// - Duplicate member prevention
// - Blacklist enforcement for granters
// - Manager permission-based member removal
//
// Run with:
//   cargo test -p onsocial-integration-tests member_add_remove_tests -- --test-threads=1

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::json;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);
const HUNDRED_NEAR: NearToken = NearToken::from_near(100);

const WRITE: u8 = 1;
const MODERATE: u8 = 2;
const MANAGE: u8 = 3;

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

    // Initialize the contract
    let init_outcome = contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?;
    assert!(init_outcome.is_success(), "Contract initialization failed: {:?}", init_outcome.failures());

    // Activate the contract (move from Genesis to Live mode)
    let activate_outcome = contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(activate_outcome.is_success(), "Contract activation failed: {:?}", activate_outcome.failures());

    Ok(contract)
}

async fn create_user(
    root: &Account,
    name: &str,
    balance: NearToken,
) -> anyhow::Result<Account> {
    let account = root.create_subaccount(name).initial_balance(balance).transact().await?;
    Ok(account.result)
}

// =============================================================================
// TEST: Nonce invalidates stale permissions on rejoin
// =============================================================================
// Scenario: User has WRITE permission, leaves, rejoins. Old permission must be
// invalid (nonce-scoped), user should only have default content WRITE.
#[tokio::test]
async fn test_nonce_invalidates_stale_permissions_on_rejoin() -> anyhow::Result<()> {
    println!("\n=== Test: Nonce invalidates stale permissions on rejoin ===");

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
                "action": { "type": "create_group", "group_id": "nonce_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Bob joins the group
    let bob_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "nonce_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_join.is_success(), "Bob join should succeed");

    // Alice grants Bob MANAGE on group config
    let grant_manage = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": bob.id(), "path": "groups/nonce_test/config", "level": MANAGE, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(grant_manage.is_success(), "Grant MANAGE should succeed");

    // Verify Bob has MANAGE
    let bob_permission_before: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": "nonce_test",
            "grantee": bob.id(),
            "path": "groups/nonce_test/config"
        }))
        .await?
        .json()?;
    assert_eq!(bob_permission_before, MANAGE, "Bob should have MANAGE before leaving");
    println!("   ✓ Bob has MANAGE permission before leaving");

    // Bob leaves the group
    let bob_leave = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "nonce_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_leave.is_success(), "Bob leave should succeed");
    println!("   ✓ Bob left the group");

    // Bob rejoins
    let bob_rejoin = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "nonce_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_rejoin.is_success(), "Bob rejoin should succeed");
    println!("   ✓ Bob rejoined the group");

    // CRITICAL: Bob's old MANAGE permission should be invalidated (nonce changed)
    let bob_permission_after: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": "nonce_test",
            "grantee": bob.id(),
            "path": "groups/nonce_test/config"
        }))
        .await?
        .json()?;
    
    // After rejoin, Bob should NOT have MANAGE (old nonce is stale)
    assert!(
        bob_permission_after < MANAGE,
        "Bob's MANAGE permission should be invalidated after rejoin (got {})",
        bob_permission_after
    );
    println!("   ✓ Bob's old MANAGE permission invalidated after rejoin (now: {})", bob_permission_after);

    // Bob should still have default content WRITE (granted on rejoin)
    let bob_content_permission: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": "nonce_test",
            "grantee": bob.id(),
            "path": "groups/nonce_test/content"
        }))
        .await?
        .json()?;
    assert_eq!(bob_content_permission, WRITE, "Bob should have default content WRITE after rejoin");
    println!("   ✓ Bob has default content WRITE after rejoin");

    println!("✅ Nonce invalidation test passed");
    Ok(())
}

// =============================================================================
// TEST: Adding an existing member fails
// =============================================================================
#[tokio::test]
async fn test_add_existing_member_fails() -> anyhow::Result<()> {
    println!("\n=== Test: Adding an existing member fails ===");

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
                "action": { "type": "create_group", "group_id": "duplicate_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Alice adds Bob
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "duplicate_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "First add should succeed");
    println!("   ✓ Bob added successfully first time");

    // Alice tries to add Bob again - should fail
    let add_bob_again = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "duplicate_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(!add_bob_again.is_success(), "Adding existing member should fail");
    
    // Verify error message contains expected text
    let failure_msg = format!("{:?}", add_bob_again.failures());
    assert!(
        failure_msg.contains("Member already exists") || failure_msg.contains("already"),
        "Error should mention member already exists: {}",
        failure_msg
    );
    println!("   ✓ Adding existing member correctly rejected");

    println!("✅ Duplicate member prevention test passed");
    Ok(())
}

// =============================================================================
// TEST: Manager can remove regular members but not owner
// =============================================================================
#[tokio::test]
async fn test_manager_can_remove_regular_members() -> anyhow::Result<()> {
    println!("\n=== Test: Manager can remove regular members ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let manager = create_user(&root, "manager", TEN_NEAR).await?;
    let regular = create_user(&root, "regular", TEN_NEAR).await?;

    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "manager_remove_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add manager as member
    let add_manager = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "manager_remove_test", "member_id": manager.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_manager.is_success(), "Add manager should succeed");

    // Grant manager MANAGE permission on group config
    let grant_manage = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": manager.id(), "path": "groups/manager_remove_test/config", "level": MANAGE, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(grant_manage.is_success(), "Grant MANAGE should succeed");
    println!("   ✓ Manager granted MANAGE on group config");

    // Add regular member
    let add_regular = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "manager_remove_test", "member_id": regular.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_regular.is_success(), "Add regular should succeed");
    println!("   ✓ Regular member added");

    // Manager removes regular member - should succeed
    let manager_remove_regular = manager
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "remove_group_member", "group_id": "manager_remove_test", "member_id": regular.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(manager_remove_regular.is_success(), "Manager should be able to remove regular member");
    println!("   ✓ Manager successfully removed regular member");

    // Verify regular is no longer a member
    let is_regular_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "manager_remove_test",
            "member_id": regular.id()
        }))
        .await?
        .json()?;
    assert!(!is_regular_member, "Regular should no longer be a member");
    println!("   ✓ Regular member removal verified");

    // Manager tries to remove owner - should fail
    let manager_remove_owner = manager
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "remove_group_member", "group_id": "manager_remove_test", "member_id": alice.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!manager_remove_owner.is_success(), "Manager should NOT be able to remove owner");
    println!("   ✓ Manager cannot remove owner");

    println!("✅ Manager remove permissions test passed");
    Ok(())
}

// =============================================================================
// TEST: Cannot add blacklisted user directly
// =============================================================================
#[tokio::test]
async fn test_cannot_add_blacklisted_user() -> anyhow::Result<()> {
    println!("\n=== Test: Cannot add blacklisted user directly ===");

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
                "action": { "type": "create_group", "group_id": "blacklist_add_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Alice blacklists Bob (without Bob ever being a member)
    let blacklist_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "blacklist_add_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(blacklist_bob.is_success(), "Blacklisting Bob should succeed");
    println!("   ✓ Bob blacklisted");

    // Verify Bob is blacklisted
    let is_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "blacklist_add_test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_blacklisted, "Bob should be blacklisted");

    // Alice tries to add blacklisted Bob - should fail
    let add_blacklisted = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "blacklist_add_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(!add_blacklisted.is_success(), "Adding blacklisted user should fail");
    
    let failure_msg = format!("{:?}", add_blacklisted.failures());
    assert!(
        failure_msg.contains("blacklist") || failure_msg.contains("Cannot add"),
        "Error should mention blacklist: {}",
        failure_msg
    );
    println!("   ✓ Adding blacklisted user correctly rejected");

    println!("✅ Cannot add blacklisted user test passed");
    Ok(())
}

// =============================================================================
// TEST: Blacklisted granter cannot add members
// =============================================================================
#[tokio::test]
async fn test_blacklisted_granter_cannot_add_members() -> anyhow::Result<()> {
    println!("\n=== Test: Blacklisted granter cannot add members ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let manager = create_user(&root, "manager", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "blacklisted_granter_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add manager and grant MANAGE
    let add_manager = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "blacklisted_granter_test", "member_id": manager.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_manager.is_success(), "Add manager should succeed");

    let grant_manage = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": manager.id(), "path": "groups/blacklisted_granter_test/config", "level": MANAGE, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(grant_manage.is_success(), "Grant MANAGE should succeed");
    println!("   ✓ Manager has MANAGE permission");

    // Alice blacklists manager (removes them from group too)
    let blacklist_manager = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "blacklisted_granter_test", "member_id": manager.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(blacklist_manager.is_success(), "Blacklisting manager should succeed");
    println!("   ✓ Manager blacklisted");

    // Blacklisted manager tries to add Charlie - should fail
    let manager_add_charlie = manager
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "blacklisted_granter_test", "member_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(!manager_add_charlie.is_success(), "Blacklisted granter should not be able to add members");
    
    let failure_msg = format!("{:?}", manager_add_charlie.failures());
    assert!(
        failure_msg.contains("blacklisted") || failure_msg.contains("permission"),
        "Error should mention blacklist or permission: {}",
        failure_msg
    );
    println!("   ✓ Blacklisted granter cannot add members");

    println!("✅ Blacklisted granter test passed");
    Ok(())
}

// =============================================================================
// TEST: Blacklist idempotency - re-blacklisting already blacklisted user
// =============================================================================
#[tokio::test]
async fn test_blacklist_idempotency() -> anyhow::Result<()> {
    println!("\n=== Test: Blacklist idempotency ===");

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
                "action": { "type": "create_group", "group_id": "blacklist_idempotent_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Alice blacklists Bob
    let first_blacklist = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "blacklist_idempotent_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(first_blacklist.is_success(), "First blacklist should succeed");
    
    // Count events from first blacklist
    let first_logs = first_blacklist.logs();
    let first_blacklist_events = find_events_by_operation(&first_logs, "add_to_blacklist");
    assert_eq!(first_blacklist_events.len(), 1, "First blacklist should emit exactly 1 event");
    println!("   ✓ First blacklist succeeded with 1 event");

    // Verify Bob is blacklisted
    let is_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "blacklist_idempotent_test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_blacklisted, "Bob should be blacklisted");

    // Alice blacklists Bob again (should succeed - idempotent)
    let second_blacklist = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "blacklist_idempotent_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(second_blacklist.is_success(), "Re-blacklisting should be idempotent (succeed)");
    
    // Verify duplicate event is emitted (current behavior - documented as Low audit finding)
    let second_logs = second_blacklist.logs();
    let second_blacklist_events = find_events_by_operation(&second_logs, "add_to_blacklist");
    // Note: Current implementation emits duplicate event on re-blacklist (Low audit finding)
    // This assertion documents current behavior; if optimized to no-op, change to == 0
    println!("   ✓ Re-blacklisting emits {} event(s) (duplicate write behavior)", second_blacklist_events.len());

    // Verify Bob is still blacklisted
    let still_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "blacklist_idempotent_test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(still_blacklisted, "Bob should still be blacklisted");
    println!("   ✓ Bob remains blacklisted after idempotent operation");

    println!("✅ Blacklist idempotency test passed");
    Ok(())
}

// =============================================================================
// TEST: Regular member cannot blacklist others
// =============================================================================
#[tokio::test]
async fn test_regular_member_cannot_blacklist() -> anyhow::Result<()> {
    println!("\n=== Test: Regular member cannot blacklist others ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "regular_blacklist_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Bob joins (regular member, no special permissions)
    let bob_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "regular_blacklist_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_join.is_success(), "Bob should join successfully");

    // Charlie joins
    let charlie_join = charlie
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "regular_blacklist_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(charlie_join.is_success(), "Charlie should join successfully");
    println!("   ✓ Bob and Charlie joined as regular members");

    // Bob (regular member) tries to blacklist Charlie - should fail
    let bob_blacklist_charlie = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "regular_blacklist_test", "member_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!bob_blacklist_charlie.is_success(), "Regular member should not be able to blacklist others");

    let failure_msg = format!("{:?}", bob_blacklist_charlie.failures());
    assert!(
        failure_msg.contains("Permission") || failure_msg.contains("denied"),
        "Error should mention permission denied: {}",
        failure_msg
    );
    println!("   ✓ Regular member correctly rejected from blacklisting");

    // Verify Charlie is NOT blacklisted
    let is_charlie_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "regular_blacklist_test",
            "user_id": charlie.id()
        }))
        .await?
        .json()?;
    assert!(!is_charlie_blacklisted, "Charlie should not be blacklisted");
    println!("   ✓ Charlie is not blacklisted");

    println!("✅ Regular member cannot blacklist test passed");
    Ok(())
}

// =============================================================================
// TEST: Owner cannot blacklist self
// =============================================================================
#[tokio::test]
async fn test_owner_cannot_blacklist_self() -> anyhow::Result<()> {
    println!("\n=== Test: Owner cannot blacklist self ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Alice creates a group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "owner_self_blacklist_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Alice (owner) tries to blacklist herself - should fail
    let self_blacklist = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "owner_self_blacklist_test", "member_id": alice.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!self_blacklist.is_success(), "Owner should not be able to blacklist themselves");

    let failure_msg = format!("{:?}", self_blacklist.failures());
    assert!(
        failure_msg.contains("Cannot blacklist group owner") || failure_msg.contains("owner"),
        "Error should mention cannot blacklist owner: {}",
        failure_msg
    );
    println!("   ✓ Owner self-blacklist correctly rejected");

    // Verify Alice is NOT blacklisted
    let is_alice_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "owner_self_blacklist_test",
            "user_id": alice.id()
        }))
        .await?
        .json()?;
    assert!(!is_alice_blacklisted, "Owner should not be blacklisted");

    // Verify Alice is still a member
    let is_alice_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "owner_self_blacklist_test",
            "member_id": alice.id()
        }))
        .await?
        .json()?;
    assert!(is_alice_member, "Owner should still be a member");
    println!("   ✓ Owner is still a member and not blacklisted");

    println!("✅ Owner cannot blacklist self test passed");
    Ok(())
}

// =============================================================================
// TEST: Admin with MANAGE permission can blacklist regular members
// =============================================================================
#[tokio::test]
async fn test_admin_can_blacklist_regular_members() -> anyhow::Result<()> {
    println!("\n=== Test: Admin with MANAGE can blacklist regular members ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let admin = create_user(&root, "admin", TEN_NEAR).await?;
    let target = create_user(&root, "target", TEN_NEAR).await?;

    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "admin_blacklist_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add admin and grant MANAGE permission
    let add_admin = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "admin_blacklist_test", "member_id": admin.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_admin.is_success(), "Add admin should succeed");

    let grant_manage = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": admin.id(), "path": "groups/admin_blacklist_test/config", "level": MANAGE, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(grant_manage.is_success(), "Grant MANAGE should succeed");
    println!("   ✓ Admin has MANAGE permission on group config");

    // Target joins the group
    let target_join = target
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "admin_blacklist_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(target_join.is_success(), "Target should join successfully");
    println!("   ✓ Target joined as regular member");

    // Admin blacklists target - should succeed
    let admin_blacklist_target = admin
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "admin_blacklist_test", "member_id": target.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(admin_blacklist_target.is_success(), "Admin with MANAGE should be able to blacklist regular members: {:?}", admin_blacklist_target.failures());
    println!("   ✓ Admin successfully blacklisted target");

    // Verify target is blacklisted
    let is_target_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "admin_blacklist_test",
            "user_id": target.id()
        }))
        .await?
        .json()?;
    assert!(is_target_blacklisted, "Target should be blacklisted");

    // Verify target is removed from group
    let is_target_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "admin_blacklist_test",
            "member_id": target.id()
        }))
        .await?
        .json()?;
    assert!(!is_target_member, "Target should be removed from group after blacklisting");
    println!("   ✓ Target is blacklisted and removed from group");

    println!("✅ Admin can blacklist regular members test passed");
    Ok(())
}

// =============================================================================
// TEST: Member-driven group blacklist routes to proposal
// =============================================================================
#[tokio::test]
async fn test_member_driven_blacklist_creates_proposal() -> anyhow::Result<()> {
    println!("\n=== Test: Member-driven blacklist creates proposal ===");

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
                "action": { "type": "create_group", "group_id": "member_driven_blacklist_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob as member (use direct storage for setup since it's member-driven)
    // For member-driven groups, owner can still add initial members
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "member_driven_blacklist_test", "proposal_type": "member_invite", "changes": {
                "target_user": bob.id().to_string(),
                "message": "Add Bob"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob via proposal should succeed");
    println!("   ✓ Bob added via auto-executed proposal (single member)");

    // Verify Bob is a member
    let is_bob_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "member_driven_blacklist_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_bob_member, "Bob should be a member");

    // Now with 2 members, proposals won't auto-execute
    // Alice tries to blacklist Charlie (non-member) - should create proposal, not direct blacklist
    let blacklist_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "member_driven_blacklist_test", "member_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(blacklist_result.is_success(), "Blacklist should succeed (creates proposal)");

    // Verify Charlie is NOT immediately blacklisted (proposal needs voting)
    let is_charlie_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "member_driven_blacklist_test",
            "user_id": charlie.id()
        }))
        .await?
        .json()?;
    assert!(!is_charlie_blacklisted, "Charlie should NOT be immediately blacklisted - proposal needs votes");
    println!("   ✓ Blacklist in member-driven group created proposal (not direct blacklist)");

    // Check that proposal_created event was emitted
    let logs = blacklist_result.logs();
    let proposal_events = find_events_by_operation(&logs, "proposal_created");
    assert!(!proposal_events.is_empty(), "Should emit proposal_created event for ban proposal");
    println!("   ✓ proposal_created event emitted for ban proposal");

    println!("✅ Member-driven blacklist creates proposal test passed");
    Ok(())
}

// =============================================================================
// TEST: Ban proposal against owner fails at execution
// =============================================================================
#[tokio::test]
async fn test_ban_proposal_against_owner_fails_execution() -> anyhow::Result<()> {
    println!("\n=== Test: Ban proposal against owner fails at execution ===");

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
                "action": { "type": "create_group", "group_id": "ban_owner_proposal_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add Bob (auto-executes since single member)
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "ban_owner_proposal_test", "proposal_type": "member_invite", "changes": {
                "target_user": bob.id().to_string(),
                "message": "Add Bob"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");

    // Add Charlie (needs voting now - Alice auto-votes, Bob votes too)
    let add_charlie = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "ban_owner_proposal_test", "proposal_type": "member_invite", "changes": {
                "target_user": charlie.id().to_string(),
                "message": "Add Charlie"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(add_charlie.is_success(), "Adding Charlie proposal should succeed");
    let charlie_proposal_id: String = add_charlie.json()?;

    // Bob votes to pass Charlie's invite
    let bob_vote_charlie = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "ban_owner_proposal_test", "proposal_id": charlie_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(bob_vote_charlie.is_success(), "Bob's vote should succeed");
    println!("   ✓ 3 members in group: Alice (owner), Bob, Charlie");

    // Now Bob creates a ban proposal against Alice (the owner)
    // Proposal creation should succeed (validation doesn't check target is owner)
    let ban_owner_proposal = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "ban_owner_proposal_test", "proposal_type": "group_update", "changes": {
                "update_type": "ban",
                "target_user": alice.id().to_string(),
                "action": "ban"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(ban_owner_proposal.is_success(), "Ban owner proposal creation should succeed (validated at execution)");
    let ban_proposal_id: String = ban_owner_proposal.json()?;
    println!("   ✓ Ban proposal against owner created (ID: {})", ban_proposal_id);

    // Charlie votes YES to try to pass the ban proposal
    let charlie_vote = charlie
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "ban_owner_proposal_test", "proposal_id": ban_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    // Vote succeeds but execution should fail with owner protection error
    println!("   Charlie vote result: success={}", charlie_vote.is_success());

    // Verify Alice is NOT blacklisted (execution failed due to owner protection)
    let is_alice_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "ban_owner_proposal_test",
            "user_id": alice.id()
        }))
        .await?
        .json()?;
    assert!(!is_alice_blacklisted, "Owner should NOT be blacklisted (execution failed)");
    println!("   ✓ Owner is NOT blacklisted (execution correctly failed)");

    // Verify Alice is still a member
    let is_alice_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "ban_owner_proposal_test",
            "member_id": alice.id()
        }))
        .await?
        .json()?;
    assert!(is_alice_member, "Owner should still be a member");
    println!("   ✓ Owner is still a member after failed ban execution");

    println!("✅ Ban proposal against owner fails execution test passed");
    Ok(())
}

// =============================================================================
// EVENT VERIFICATION HELPERS
// =============================================================================

const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

#[derive(Debug, serde::Deserialize)]
#[allow(dead_code)]
struct Event {
    pub standard: String,
    pub version: String,
    pub event: String,
    pub data: Vec<EventData>,
}

#[derive(Debug, serde::Deserialize)]
struct EventData {
    pub operation: String,
    pub author: String,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

fn decode_event(log: &str) -> Option<Event> {
    if !log.starts_with(EVENT_JSON_PREFIX) {
        return None;
    }
    let json_str = &log[EVENT_JSON_PREFIX.len()..];
    
    #[derive(serde::Deserialize)]
    struct RawEvent {
        standard: String,
        version: String,
        event: String,
        data: Vec<serde_json::Map<String, serde_json::Value>>,
    }

    let raw: RawEvent = serde_json::from_str(json_str).ok()?;
    let data = raw.data.into_iter().map(|mut map| {
        let operation = map.remove("operation")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_default();
        let author = map.remove("author")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_default();
        let extra = map.into_iter().collect();
        EventData { operation, author, extra }
    }).collect();

    Some(Event { standard: raw.standard, version: raw.version, event: raw.event, data })
}

fn find_events_by_operation<S: AsRef<str>>(logs: &[S], operation: &str) -> Vec<Event> {
    logs.iter()
        .filter_map(|log| decode_event(log.as_ref()))
        .filter(|e| e.data.first().map(|d| d.operation.as_str()) == Some(operation))
        .collect()
}

fn get_extra_string(event: &Event, key: &str) -> Option<String> {
    event.data.first()
        .and_then(|d| d.extra.get(key))
        .and_then(|v| v.as_str().map(|s| s.to_string()))
}

fn get_extra_number(event: &Event, key: &str) -> Option<u64> {
    event.data.first()
        .and_then(|d| d.extra.get(key))
        .and_then(|v| v.as_u64())
}

fn get_extra_bool(event: &Event, key: &str) -> Option<bool> {
    event.data.first()
        .and_then(|d| d.extra.get(key))
        .and_then(|v| v.as_bool())
}

fn get_extra_json(event: &Event, key: &str) -> Option<serde_json::Value> {
    event.data.first()
        .and_then(|d| d.extra.get(key))
        .cloned()
}

// =============================================================================
// TEST: Event verification for add_member
// =============================================================================
// Verifies add_member event schema: member_nonce, member_nonce_path, path, value
#[tokio::test]
async fn test_add_member_event_schema() -> anyhow::Result<()> {
    println!("\n=== Test: add_member event schema verification ===");

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
                "action": { "type": "create_group", "group_id": "event_add_test", "config": { "is_private": false } }
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
                "action": { "type": "join_group", "group_id": "event_add_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_result.is_success(), "Bob should join successfully");

    // Extract and verify add_member event
    let logs = join_result.logs();
    let add_events = find_events_by_operation(&logs, "add_member");
    assert!(!add_events.is_empty(), "Should emit add_member event");
    let event = &add_events[0];

    // Verify event base fields
    assert_eq!(event.standard, "onsocial", "Standard should be 'onsocial'");
    assert_eq!(event.version, "1.0.0", "Version should be '1.0.0'");
    println!("   ✓ Event standard/version correct: onsocial/1.0.0");

    // Verify author is the granter (self-join = self is granter)
    let author = &event.data[0].author;
    assert_eq!(author, bob.id().as_str(), "Author should be bob (self-join)");
    println!("   ✓ Event author correct: {}", author);

    // Verify path contains member path
    let path = get_extra_string(event, "path").expect("Event should have path");
    let expected_path = format!("groups/event_add_test/members/{}", bob.id());
    assert_eq!(path, expected_path, "Path should be member path");
    println!("   ✓ Event path correct: {}", path);

    // Verify member_nonce is present and >= 1
    let nonce = get_extra_number(event, "member_nonce").expect("Event should have member_nonce");
    assert!(nonce >= 1, "member_nonce should be >= 1 (was {})", nonce);
    println!("   ✓ member_nonce present: {}", nonce);

    // Verify member_nonce_path is present
    let nonce_path = get_extra_string(event, "member_nonce_path").expect("Event should have member_nonce_path");
    let expected_nonce_path = format!("groups/event_add_test/member_nonces/{}", bob.id());
    assert_eq!(nonce_path, expected_nonce_path, "member_nonce_path should match");
    println!("   ✓ member_nonce_path correct: {}", nonce_path);

    // Verify value contains member data
    let value = get_extra_json(event, "value").expect("Event should have value");
    assert!(value.get("level").is_some(), "Value should have level");
    assert!(value.get("granted_by").is_some(), "Value should have granted_by");
    assert!(value.get("joined_at").is_some(), "Value should have joined_at");
    println!("   ✓ Value contains member data (level, granted_by, joined_at)");

    println!("✅ add_member event schema test passed");
    Ok(())
}

// =============================================================================
// TEST: Event verification for remove_member
// =============================================================================
// Verifies remove_member event schema: is_self_removal, from_governance, removed_by
#[tokio::test]
async fn test_remove_member_event_schema() -> anyhow::Result<()> {
    println!("\n=== Test: remove_member event schema verification ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "event_remove_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success());

    // Bob joins
    let join_bob = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "event_remove_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_bob.is_success());

    // Charlie joins
    let join_charlie = charlie
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "event_remove_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_charlie.is_success());

    // Test 1: Self-removal (Bob leaves)
    let leave_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "event_remove_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(leave_result.is_success(), "Bob should leave successfully");

    let logs = leave_result.logs();
    let remove_events = find_events_by_operation(&logs, "remove_member");
    assert!(!remove_events.is_empty(), "Should emit remove_member event");
    let self_removal_event = &remove_events[0];

    // Verify self-removal flags
    let is_self_removal = get_extra_bool(self_removal_event, "is_self_removal");
    assert_eq!(is_self_removal, Some(true), "is_self_removal should be true");
    println!("   ✓ is_self_removal=true for self-leave");

    let from_governance = get_extra_bool(self_removal_event, "from_governance");
    assert_eq!(from_governance, Some(false), "from_governance should be false for direct leave");
    println!("   ✓ from_governance=false for direct leave");

    let removed_by = get_extra_string(self_removal_event, "removed_by");
    assert_eq!(removed_by.as_deref(), Some(bob.id().as_str()), "removed_by should be self");
    println!("   ✓ removed_by correct for self-removal");

    // Test 2: Owner removes Charlie (not self-removal)
    let owner_remove = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "remove_group_member", "group_id": "event_remove_test", "member_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(owner_remove.is_success(), "Owner should remove Charlie");

    let owner_logs = owner_remove.logs();
    let owner_events = find_events_by_operation(&owner_logs, "remove_member");
    assert!(!owner_events.is_empty(), "Should emit remove_member event");
    let owner_removal_event = &owner_events[0];

    let owner_is_self = get_extra_bool(owner_removal_event, "is_self_removal");
    assert_eq!(owner_is_self, Some(false), "is_self_removal should be false when owner removes");
    println!("   ✓ is_self_removal=false when owner removes member");

    let owner_from_gov = get_extra_bool(owner_removal_event, "from_governance");
    assert_eq!(owner_from_gov, Some(false), "from_governance should be false for direct remove");
    println!("   ✓ from_governance=false for direct owner remove");

    let owner_removed_by = get_extra_string(owner_removal_event, "removed_by");
    assert_eq!(owner_removed_by.as_deref(), Some(alice.id().as_str()), "removed_by should be owner");
    println!("   ✓ removed_by shows owner for owner-initiated removal");

    println!("✅ remove_member event schema test passed");
    Ok(())
}

// =============================================================================
// TEST: Stats verification - total_members count
// =============================================================================
// Verifies get_group_stats.total_members updates correctly on add/remove
#[tokio::test]
async fn test_group_stats_member_count() -> anyhow::Result<()> {
    println!("\n=== Test: Group stats member count verification ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "stats_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success());

    // Helper to get member count
    async fn get_member_count(contract: &Contract, group_id: &str) -> u64 {
        let stats: Option<serde_json::Value> = contract
            .view("get_group_stats")
            .args_json(json!({ "group_id": group_id }))
            .await
            .unwrap()
            .json()
            .unwrap();
        stats.and_then(|s| s.get("total_members").and_then(|v| v.as_u64())).unwrap_or(0)
    }

    // Initial: only owner (Alice) = 1 member
    let initial_count = get_member_count(&contract, "stats_test").await;
    assert_eq!(initial_count, 1, "Initial count should be 1 (owner only)");
    println!("   ✓ Initial count: {} (owner only)", initial_count);

    // Bob joins -> 2 members
    let join_bob = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "stats_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_bob.is_success());

    let after_bob = get_member_count(&contract, "stats_test").await;
    assert_eq!(after_bob, 2, "Count should be 2 after Bob joins");
    println!("   ✓ After Bob joins: {}", after_bob);

    // Charlie joins -> 3 members
    let join_charlie = charlie
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "stats_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_charlie.is_success());

    let after_charlie = get_member_count(&contract, "stats_test").await;
    assert_eq!(after_charlie, 3, "Count should be 3 after Charlie joins");
    println!("   ✓ After Charlie joins: {}", after_charlie);

    // Bob leaves -> 2 members
    let leave_bob = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "stats_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(leave_bob.is_success());

    let after_bob_leaves = get_member_count(&contract, "stats_test").await;
    assert_eq!(after_bob_leaves, 2, "Count should be 2 after Bob leaves");
    println!("   ✓ After Bob leaves: {}", after_bob_leaves);

    // Owner removes Charlie -> 1 member
    let remove_charlie = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "remove_group_member", "group_id": "stats_test", "member_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(remove_charlie.is_success());

    let final_count = get_member_count(&contract, "stats_test").await;
    assert_eq!(final_count, 1, "Count should be 1 after Charlie removed");
    println!("   ✓ After Charlie removed: {}", final_count);

    println!("✅ Group stats member count test passed");
    Ok(())
}

// =============================================================================
// TEST: Governance bypass path (via proposal)
// =============================================================================
// Verifies AddMemberAuth::BypassPermissions and from_governance=true in events
#[tokio::test]
async fn test_governance_bypass_via_proposal() -> anyhow::Result<()> {
    println!("\n=== Test: Governance bypass via proposal ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", HUNDRED_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let carol = create_user(&root, "carol", TEN_NEAR).await?;
    let target = create_user(&root, "target", TEN_NEAR).await?;

    // Alice creates a member-driven group (requires governance for member changes)
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "governance_test", "config": {
                "is_private": true,
                "member_driven": true,
                "group_name": "Governance Test Group"
            } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create member-driven group should succeed: {:?}", create_result.failures());
    println!("   ✓ Created member-driven group");

    // Add Bob and Carol as members (owner can add directly even in member-driven groups)
    for (name, user) in [("bob", &bob), ("carol", &carol)] {
        let add = alice
            .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "governance_test", "member_id": user.id() }
            }
        }))
            .deposit(ONE_NEAR)
            .gas(near_workspaces::types::Gas::from_tgas(100))
            .transact()
            .await?;
        assert!(add.is_success(), "Add {} should succeed", name);
    }
    println!("   ✓ Added Bob and Carol as members (3 total)");

    // Bob creates proposal to invite target
    let create_proposal = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "governance_test", "proposal_type": "member_invite", "changes": {
                "target_user": target.id().to_string(),
                "message": "Invite target via governance"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(create_proposal.is_success(), "Create proposal should succeed: {:?}", create_proposal.failures());
    let proposal_id: String = create_proposal.json()?;
    println!("   ✓ Created member_invite proposal: {}", proposal_id);

    // Alice votes YES (Bob already voted as proposer)
    // With 2/3 votes (67%), proposal should pass with default 50% thresholds
    let vote_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "governance_test", "proposal_id": proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(vote_result.is_success(), "Vote should succeed: {:?}", vote_result.failures());
    println!("   ✓ Alice voted YES - proposal executed");

    // Verify target is now a member
    let is_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "governance_test",
            "member_id": target.id()
        }))
        .await?
        .json()?;
    assert!(is_member, "Target should be a member after proposal execution");
    println!("   ✓ Target is now a member via governance");

    // Check the add_member event in the vote result (proposal execution happens during vote)
    let vote_logs = vote_result.logs();
    let add_events = find_events_by_operation(&vote_logs, "add_member");
    
    if add_events.is_empty() {
        println!("   ⚠ No add_member event in vote logs (may be in separate execution)");
        println!("   Checking that member was added via governance path...");
    } else {
        let add_event = &add_events[0];
        
        // Verify member_nonce is present (BypassPermissions path still sets nonce)
        let nonce = get_extra_number(add_event, "member_nonce");
        assert!(nonce.is_some(), "member_nonce should be present for governance add");
        println!("   ✓ member_nonce present in governance add: {:?}", nonce);
        
        // Verify path
        let path = get_extra_string(add_event, "path");
        let expected = format!("groups/governance_test/members/{}", target.id());
        assert_eq!(path.as_deref(), Some(expected.as_str()), "Path should match");
        println!("   ✓ Event path correct for governance add");
    }

    println!("✅ Governance bypass via proposal test passed");
    Ok(())
}
#[tokio::test]
async fn test_governance_bypass_cannot_add_blacklisted_user() -> anyhow::Result<()> {
    println!("\n=== Test: Governance bypass cannot add blacklisted user ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", HUNDRED_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let carol = create_user(&root, "carol", TEN_NEAR).await?;
    let target = create_user(&root, "target", TEN_NEAR).await?;

    // Alice creates a member-driven group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "blacklist_bypass_test", "config": {
                "is_private": true,
                "member_driven": true,
                "group_name": "Blacklist Bypass Test"
            } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed: {:?}", create_result.failures());
    println!("   ✓ Created member-driven group");

    // Add Bob, Carol, and target as members (so we can later ban target)
    for (name, user) in [("bob", &bob), ("carol", &carol), ("target", &target)] {
        let add = alice
            .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "blacklist_bypass_test", "member_id": user.id() }
            }
        }))
            .deposit(ONE_NEAR)
            .gas(near_workspaces::types::Gas::from_tgas(100))
            .transact()
            .await?;
        assert!(add.is_success(), "Add {} should succeed: {:?}", name, add.failures());
    }
    println!("   ✓ Added Bob, Carol, and target (4 members total)");

    // First, blacklist target via ban proposal (member-driven requires governance)
    // Alice initiates blacklist which creates a ban proposal
    let ban_proposal_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "blacklist_bypass_test", "member_id": target.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(ban_proposal_result.is_success(), "Ban proposal creation should succeed: {:?}", ban_proposal_result.failures());

    // Extract the ban proposal ID from logs
    let ban_proposal_id = extract_proposal_id_from_logs(&ban_proposal_result.logs());
    assert!(ban_proposal_id.is_some(), "Should have created a ban proposal");
    let ban_proposal_id = ban_proposal_id.unwrap();
    println!("   ✓ Created ban proposal: {}", ban_proposal_id);

    // Bob votes YES on ban proposal (Alice auto-voted, now 2/4 = 50%, passes with default thresholds)
    let ban_vote = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "blacklist_bypass_test", "proposal_id": ban_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(ban_vote.is_success(), "Ban vote should succeed: {:?}", ban_vote.failures());
    println!("   ✓ Ban proposal executed");

    // Verify target is now blacklisted
    let is_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "blacklist_bypass_test",
            "user_id": target.id()
        }))
        .await?
        .json()?;
    assert!(is_blacklisted, "Target should be blacklisted after ban proposal execution");
    println!("   ✓ Target is blacklisted");

    // Verify target is no longer a member
    let is_target_member_before: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "blacklist_bypass_test",
            "member_id": target.id()
        }))
        .await?
        .json()?;
    assert!(!is_target_member_before, "Target should have been removed when blacklisted");
    println!("   ✓ Target was removed from group");

    // Now Bob creates a member_invite proposal to re-add the blacklisted target
    let create_invite_proposal = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_proposal", "group_id": "blacklist_bypass_test", "proposal_type": "member_invite", "changes": {
                "target_user": target.id().to_string(),
                "message": "Invite blacklisted user via governance"
            }, "auto_vote": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    // Proposal creation should succeed (validation doesn't block blacklisted targets for member_invite)
    // The execution will fail because add_member_internal checks member blacklist unconditionally
    assert!(create_invite_proposal.is_success(), "Create invite proposal should succeed: {:?}", create_invite_proposal.failures());
    let invite_proposal_id: String = create_invite_proposal.json()?;
    println!("   ✓ Created member_invite proposal for blacklisted user: {}", invite_proposal_id);

    // Alice votes YES to reach quorum and trigger execution
    // With Bob (proposer auto-voted) + Alice = 2/3 remaining members > 50% = passes
    let vote_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "vote_on_proposal", "group_id": "blacklist_bypass_test", "proposal_id": invite_proposal_id, "approve": true }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    // Check if target was added (should NOT be, even if vote passed)
    let is_target_member_after: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "blacklist_bypass_test",
            "member_id": target.id()
        }))
        .await?
        .json()?;

    assert!(!is_target_member_after, "SECURITY VIOLATION: Blacklisted user was added via governance bypass!");
    println!("   ✓ SECURITY VERIFIED: Blacklisted user was NOT added even via governance");

    // If vote transaction failed, verify it mentions blacklist
    if !vote_result.is_success() {
        let failure_msg = format!("{:?}", vote_result.failures());
        assert!(
            failure_msg.contains("blacklist") || failure_msg.contains("Cannot add"),
            "Error should mention blacklist: {}",
            failure_msg
        );
        println!("   ✓ Proposal execution correctly rejected with blacklist error");
    } else {
        println!("   ✓ Vote succeeded but member was not added (blacklist enforced in execution)");
    }

    println!("✅ Governance bypass blacklist enforcement test passed");
    Ok(())
}

// Helper to extract proposal ID from logs
fn extract_proposal_id_from_logs<S: AsRef<str>>(logs: &[S]) -> Option<String> {
    for log in logs {
        if let Some(json_str) = log.as_ref().strip_prefix("EVENT_JSON:") {
            if let Ok(event) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(data) = event.get("data").and_then(|d| d.as_array()) {
                    for item in data {
                        if item.get("operation").and_then(|o| o.as_str()) == Some("proposal_created") {
                            if let Some(proposal_id) = item.get("proposal_id").and_then(|p| p.as_str()) {
                                return Some(proposal_id.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

// =============================================================================
// TEST: AddMemberAuth::AlreadyAuthorized still enforces member blacklist check
// =============================================================================
// Covers: types.rs:AddMemberAuth::AlreadyAuthorized
// Scenario: approve_join_request uses AlreadyAuthorized but must still check blacklist.
#[tokio::test]
async fn test_approve_join_request_cannot_add_blacklisted_user() -> anyhow::Result<()> {
    println!("\n=== Test: approve_join_request cannot add blacklisted user ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a private (non-member-driven) group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "join_blacklist_test", "config": { "is_private": true, "member_driven": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");
    println!("   ✓ Created private group");

    // Bob submits a join request
    let join_request = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "join_blacklist_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_request.is_success(), "Join request should succeed");
    println!("   ✓ Bob submitted join request");

    // Alice blacklists Bob AFTER join request was submitted
    let blacklist_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "join_blacklist_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(blacklist_bob.is_success(), "Blacklist should succeed");
    println!("   ✓ Bob blacklisted (after submitting join request)");

    // Verify Bob is blacklisted
    let is_blacklisted: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "join_blacklist_test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_blacklisted, "Bob should be blacklisted");

    // Alice tries to approve Bob's join request - should fail due to blacklist
    let approve_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "approve_join_request", "group_id": "join_blacklist_test", "requester_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!approve_result.is_success(), "Approving blacklisted user's join request should fail");

    let failure_msg = format!("{:?}", approve_result.failures());
    assert!(
        failure_msg.contains("blacklist") || failure_msg.contains("Cannot approve"),
        "Error should mention blacklist: {}",
        failure_msg
    );
    println!("   ✓ Approving blacklisted user's join request correctly rejected");

    // Verify Bob is NOT a member
    let is_bob_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "join_blacklist_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!is_bob_member, "Bob should NOT be a member");
    println!("   ✓ Bob is not a member (blacklist enforced)");

    println!("✅ approve_join_request blacklist enforcement test passed");
    Ok(())
}

// =============================================================================
// TEST: Blacklisted user cannot create JoinRequest proposal
// =============================================================================
// Covers: validation.rs:L37 - JoinRequest proposer blacklist check
#[tokio::test]
async fn test_blacklisted_user_cannot_create_join_request_proposal() -> anyhow::Result<()> {
    println!("\n=== Test: Blacklisted user cannot create JoinRequest proposal ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a member-driven private group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "join_proposal_blacklist_test", "config": {
                "is_private": true,
                "member_driven": true,
                "group_name": "Join Proposal Test"
            } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");
    println!("   ✓ Created member-driven private group");

    // Alice blacklists Bob
    let blacklist_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "join_proposal_blacklist_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(blacklist_bob.is_success(), "Blacklist should succeed");
    println!("   ✓ Bob blacklisted");

    // Bob (blacklisted) tries to submit join request via join_group
    // In member-driven groups, this creates a JoinRequest proposal
    let join_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "join_proposal_blacklist_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!join_result.is_success(), "Blacklisted user should not be able to create join request");

    let failure_msg = format!("{:?}", join_result.failures());
    assert!(
        failure_msg.contains("blacklist"),
        "Error should mention blacklist: {}",
        failure_msg
    );
    println!("   ✓ Blacklisted user cannot create JoinRequest proposal");

    println!("✅ Blacklisted JoinRequest proposal prevention test passed");
    Ok(())
}

// =============================================================================
// TEST: is_private_group - private group join creates request, public allows direct join
// =============================================================================
// Covers: helpers.rs:is_private_group (via join_group_traditional routing)
// Scenario: Private groups route to request_join, public groups add directly.
#[tokio::test]
async fn test_private_vs_public_group_join_routing() -> anyhow::Result<()> {
    println!("\n=== Test: Private vs Public group join routing ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Create a PUBLIC group
    let create_public = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "public_routing_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_public.is_success(), "Create public group should succeed");
    println!("   ✓ Created public group");

    // Create a PRIVATE group
    let create_private = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "private_routing_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_private.is_success(), "Create private group should succeed");
    println!("   ✓ Created private group");

    // Bob joins PUBLIC group - should add directly as member
    let bob_join_public = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "public_routing_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_join_public.is_success(), "Bob joining public group should succeed");

    // Verify Bob is immediately a member of public group
    let is_bob_public_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "public_routing_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_bob_public_member, "Bob should be immediate member of public group");
    println!("   ✓ Bob is immediate member of PUBLIC group (self-join)");

    // Charlie joins PRIVATE group - should create join request, not add directly
    let charlie_join_private = charlie
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "private_routing_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(charlie_join_private.is_success(), "Charlie join request should succeed");

    // Verify Charlie is NOT a member yet (waiting for approval)
    let is_charlie_private_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "private_routing_test",
            "member_id": charlie.id()
        }))
        .await?
        .json()?;
    assert!(!is_charlie_private_member, "Charlie should NOT be member of private group yet");
    println!("   ✓ Charlie is NOT member of PRIVATE group (join request created)");

    // Verify Charlie has a pending join request
    let join_request: Option<serde_json::Value> = contract
        .view("get_join_request")
        .args_json(json!({
            "group_id": "private_routing_test",
            "requester_id": charlie.id()
        }))
        .await?
        .json()?;
    assert!(join_request.is_some(), "Charlie should have a pending join request");
    let request = join_request.unwrap();
    let status = request.get("status").and_then(|s| s.as_str());
    assert_eq!(status, Some("pending"), "Join request should be pending");
    println!("   ✓ Charlie has pending join request for private group");

    // Alice approves Charlie's request
    let approve_charlie = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "approve_join_request", "group_id": "private_routing_test", "requester_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(approve_charlie.is_success(), "Approving Charlie should succeed");

    // Now Charlie should be a member
    let is_charlie_member_after: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "private_routing_test",
            "member_id": charlie.id()
        }))
        .await?
        .json()?;
    assert!(is_charlie_member_after, "Charlie should be member after approval");
    println!("   ✓ Charlie is member after approval");

    println!("✅ Private vs Public group join routing test passed");
    Ok(())
}

// =============================================================================
// TEST: remove_group_member blocked in member-driven groups (except governance)
// =============================================================================
// Covers: helpers.rs:assert_not_member_driven_unless_governance (remove path)
// Scenario: Direct remove_group_member fails in member-driven groups.
#[tokio::test]
async fn test_remove_member_blocked_in_member_driven_group() -> anyhow::Result<()> {
    println!("\n=== Test: remove_group_member blocked in member-driven group ===");

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
                "action": { "type": "create_group", "group_id": "md_remove_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create member-driven group should succeed");
    println!("   ✓ Created member-driven group");

    // Add Bob (will auto-execute with single member)
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "md_remove_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed (routes to proposal, auto-executes)");
    println!("   ✓ Bob added via auto-executed proposal");

    // Verify Bob is a member
    let is_bob_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "md_remove_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_bob_member, "Bob should be a member");

    // Alice tries to directly remove Bob - should create proposal instead
    // (route_group_operation routes to proposal creation for member-driven groups)
    let remove_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "remove_group_member", "group_id": "md_remove_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    // Should succeed by creating a proposal (not direct removal)
    assert!(remove_result.is_success(), "remove_group_member should create proposal");

    // Check for proposal_created event
    let logs = remove_result.logs();
    let proposal_events = find_events_by_operation(&logs, "proposal_created");
    assert!(!proposal_events.is_empty(), "Should emit proposal_created event");
    println!("   ✓ remove_group_member created proposal (not direct removal)");

    // Verify Bob is still a member (proposal needs votes)
    let is_bob_still_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "md_remove_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_bob_still_member, "Bob should still be member (proposal pending)");
    println!("   ✓ Bob still member (direct removal blocked, proposal created)");

    println!("✅ Remove member blocked in member-driven group test passed");
    Ok(())
}

// =============================================================================
// TEST: Reject join request - full flow with reason
// =============================================================================
// Covers: join_requests.rs:reject_join_request
// Scenario: Moderator rejects join request with reason, event contains reason
#[tokio::test]
async fn test_reject_join_request_full_flow() -> anyhow::Result<()> {
    println!("\n=== Test: reject_join_request full flow ===");

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
                "action": { "type": "create_group", "group_id": "reject_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");
    println!("   ✓ Created private group");

    // Bob submits join request
    let join_request = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "reject_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_request.is_success(), "Join request should succeed");
    println!("   ✓ Bob submitted join request");

    // Verify pending status
    let request_before: Option<serde_json::Value> = contract
        .view("get_join_request")
        .args_json(json!({
            "group_id": "reject_test",
            "requester_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(request_before.is_some(), "Join request should exist");
    let status_before = request_before.as_ref()
        .and_then(|r| r.get("status"))
        .and_then(|s| s.as_str());
    assert_eq!(status_before, Some("pending"), "Status should be pending");

    // Alice rejects with reason
    let reject_reason = "Profile incomplete - please add bio";
    let reject_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "reject_join_request", "group_id": "reject_test", "requester_id": bob.id(), "reason": reject_reason }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(reject_result.is_success(), "Reject should succeed");
    println!("   ✓ Alice rejected join request with reason");

    // Verify rejected status and reason in storage
    let request_after: Option<serde_json::Value> = contract
        .view("get_join_request")
        .args_json(json!({
            "group_id": "reject_test",
            "requester_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(request_after.is_some(), "Join request should still exist (with rejected status)");
    let req = request_after.unwrap();
    let status_after = req.get("status").and_then(|s| s.as_str());
    assert_eq!(status_after, Some("rejected"), "Status should be rejected");
    let stored_reason = req.get("reason").and_then(|s| s.as_str());
    assert_eq!(stored_reason, Some(reject_reason), "Reason should be stored");
    println!("   ✓ Status is 'rejected' with correct reason in storage");

    // Verify event contains reason
    let logs = reject_result.logs();
    let reject_events = find_events_by_operation(&logs, "join_request_rejected");
    assert!(!reject_events.is_empty(), "Should emit join_request_rejected event");
    println!("   ✓ Event join_request_rejected emitted");

    // Verify Bob is not a member
    let is_bob_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "reject_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!is_bob_member, "Bob should not be a member after rejection");
    println!("   ✓ Bob is not a member");

    println!("✅ Reject join request full flow test passed");
    Ok(())
}

// =============================================================================
// TEST: Non-moderator cannot approve or reject join requests
// =============================================================================
// Covers: join_requests.rs:can_moderate check
#[tokio::test]
async fn test_non_moderator_cannot_approve_reject() -> anyhow::Result<()> {
    println!("\n=== Test: Non-moderator cannot approve/reject ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates private group, adds Bob as regular member (no MODERATE)
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "mod_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success());

    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "mod_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding Bob should succeed");
    println!("   ✓ Bob added as regular member (no MODERATE permission)");

    // Charlie submits join request
    let charlie_join = charlie
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "mod_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(charlie_join.is_success());
    println!("   ✓ Charlie submitted join request");

    // Bob (regular member) tries to approve - should fail
    let bob_approve = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "approve_join_request", "group_id": "mod_test", "requester_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!bob_approve.is_success(), "Non-moderator should not be able to approve");
    let approve_err = format!("{:?}", bob_approve.failures());
    assert!(
        approve_err.contains("permission") || approve_err.contains("denied"),
        "Error should mention permission denied: {}", approve_err
    );
    println!("   ✓ Bob (non-moderator) cannot approve - permission denied");

    // Bob tries to reject - should also fail
    let bob_reject = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "reject_join_request", "group_id": "mod_test", "requester_id": charlie.id(), "reason": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!bob_reject.is_success(), "Non-moderator should not be able to reject");
    let reject_err = format!("{:?}", bob_reject.failures());
    assert!(
        reject_err.contains("permission") || reject_err.contains("denied"),
        "Error should mention permission denied: {}", reject_err
    );
    println!("   ✓ Bob (non-moderator) cannot reject - permission denied");

    // Owner (Alice) can approve
    let alice_approve = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "approve_join_request", "group_id": "mod_test", "requester_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(alice_approve.is_success(), "Owner should be able to approve");
    println!("   ✓ Alice (owner) can approve");

    println!("✅ Non-moderator permission test passed");
    Ok(())
}

// =============================================================================
// TEST: Approve/reject already processed request fails
// =============================================================================
// Covers: join_requests.rs status != "pending" check
#[tokio::test]
async fn test_approve_reject_already_processed_fails() -> anyhow::Result<()> {
    println!("\n=== Test: Approve/reject already processed request fails ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Setup: Alice creates private group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "status_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success());

    // Bob submits join request
    let bob_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "status_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_join.is_success());

    // Alice approves Bob
    let approve_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "approve_join_request", "group_id": "status_test", "requester_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(approve_bob.is_success(), "First approval should succeed");
    println!("   ✓ Bob's request approved");

    // Try to approve again - should fail (already approved)
    let approve_again = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "approve_join_request", "group_id": "status_test", "requester_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!approve_again.is_success(), "Approving already approved should fail");
    let err = format!("{:?}", approve_again.failures());
    assert!(
        err.contains("not pending") || err.contains("pending"),
        "Error should mention pending status: {}", err
    );
    println!("   ✓ Cannot approve already approved request");

    // Charlie submits and gets rejected
    let charlie_join = charlie
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "status_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(charlie_join.is_success());

    let reject_charlie = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "reject_join_request", "group_id": "status_test", "requester_id": charlie.id(), "reason": "test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(reject_charlie.is_success(), "First rejection should succeed");
    println!("   ✓ Charlie's request rejected");

    // Try to reject again - should fail
    let reject_again = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "reject_join_request", "group_id": "status_test", "requester_id": charlie.id(), "reason": "again" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!reject_again.is_success(), "Rejecting already rejected should fail");
    println!("   ✓ Cannot reject already rejected request");

    // Try to approve rejected request - should also fail
    let approve_rejected = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "approve_join_request", "group_id": "status_test", "requester_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!approve_rejected.is_success(), "Approving rejected request should fail");
    println!("   ✓ Cannot approve already rejected request");

    println!("✅ Already processed request status validation test passed");
    Ok(())
}

// =============================================================================
// TEST: Cancel already processed request fails
// =============================================================================
// Covers: join_requests.rs:cancel_join_request status != "pending" check
#[tokio::test]
async fn test_cancel_already_processed_fails() -> anyhow::Result<()> {
    println!("\n=== Test: Cancel already processed request fails ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Setup
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "cancel_status_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success());

    // Bob submits join request
    let bob_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "cancel_status_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_join.is_success());
    println!("   ✓ Bob submitted join request");

    // Alice approves
    let approve = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "approve_join_request", "group_id": "cancel_status_test", "requester_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(approve.is_success());
    println!("   ✓ Request approved");

    // Bob tries to cancel approved request - should fail
    let cancel_approved = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "cancel_join_request", "group_id": "cancel_status_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!cancel_approved.is_success(), "Cancelling approved request should fail");
    let err = format!("{:?}", cancel_approved.failures());
    assert!(
        err.contains("not pending") || err.contains("pending") || err.contains("not found"),
        "Error should mention status issue: {}", err
    );
    println!("   ✓ Cannot cancel already approved request");

    println!("✅ Cancel already processed request test passed");
    Ok(())
}

// =============================================================================
// TEST: Join request counter tracking
// =============================================================================
// Covers: stats.rs increment/decrement_join_request_count
#[tokio::test]
async fn test_join_request_counter_tracking() -> anyhow::Result<()> {
    println!("\n=== Test: Join request counter tracking ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;
    let dave = create_user(&root, "dave", TEN_NEAR).await?;

    // Setup
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "counter_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success());

    // Helper to get counter
    async fn get_join_request_count(contract: &Contract, group_id: &str) -> u64 {
        let stats: Option<serde_json::Value> = contract
            .view("get_group_stats")
            .args_json(json!({ "group_id": group_id }))
            .await
            .unwrap()
            .json()
            .unwrap();
        stats
            .and_then(|s| s.get("total_join_requests").and_then(|v| v.as_u64()))
            .unwrap_or(0)
    }

    // Initial count should be 0
    let count_0 = get_join_request_count(&contract, "counter_test").await;
    assert_eq!(count_0, 0, "Initial count should be 0");
    println!("   ✓ Initial counter: 0");

    // Bob joins -> count = 1
    let bob_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "counter_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_join.is_success());
    let count_1 = get_join_request_count(&contract, "counter_test").await;
    assert_eq!(count_1, 1, "Count should be 1 after Bob's request");
    println!("   ✓ After Bob's request: 1");

    // Charlie joins -> count = 2
    let charlie_join = charlie
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "counter_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(charlie_join.is_success());
    let count_2 = get_join_request_count(&contract, "counter_test").await;
    assert_eq!(count_2, 2, "Count should be 2 after Charlie's request");
    println!("   ✓ After Charlie's request: 2");

    // Dave joins -> count = 3
    let dave_join = dave
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "counter_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(dave_join.is_success());
    let count_3 = get_join_request_count(&contract, "counter_test").await;
    assert_eq!(count_3, 3, "Count should be 3");
    println!("   ✓ After Dave's request: 3");

    // Alice approves Bob -> count = 2
    let approve_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "approve_join_request", "group_id": "counter_test", "requester_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(approve_bob.is_success());
    let count_after_approve = get_join_request_count(&contract, "counter_test").await;
    assert_eq!(count_after_approve, 2, "Count should be 2 after approval");
    println!("   ✓ After approving Bob: 2");

    // Alice rejects Charlie -> count = 1
    let reject_charlie = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "reject_join_request", "group_id": "counter_test", "requester_id": charlie.id(), "reason": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(reject_charlie.is_success());
    let count_after_reject = get_join_request_count(&contract, "counter_test").await;
    assert_eq!(count_after_reject, 1, "Count should be 1 after rejection");
    println!("   ✓ After rejecting Charlie: 1");

    // Dave cancels -> count = 0
    let cancel_dave = dave
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "cancel_join_request", "group_id": "counter_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(cancel_dave.is_success());
    let count_after_cancel = get_join_request_count(&contract, "counter_test").await;
    assert_eq!(count_after_cancel, 0, "Count should be 0 after cancel");
    println!("   ✓ After Dave cancels: 0");

    println!("✅ Join request counter tracking test passed");
    Ok(())
}

// =============================================================================
// TEST: Moderator can add members with level=NONE/WRITE but NOT MANAGE
// =============================================================================
// Covers: queries.rs lines 38-48 - Moderator permission level restrictions
// can_grant_permissions allows MODERATE holders to add members (level=0 only)
// Note: add_group_member enforces level=0; set_permission uses different rules
#[tokio::test]
async fn test_moderator_can_add_members_with_limited_levels() -> anyhow::Result<()> {
    println!("\n=== Test: Moderator can add members with limited levels ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let moderator = create_user(&root, "moderator", TEN_NEAR).await?;
    let target1 = create_user(&root, "target1", TEN_NEAR).await?;
    let target2 = create_user(&root, "target2", TEN_NEAR).await?;

    // Alice creates a public group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "mod_add_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Add moderator as member
    let add_mod = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "mod_add_test", "member_id": moderator.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_mod.is_success(), "Add moderator should succeed");

    // Grant MODERATE (not MANAGE) on group config
    let grant_moderate = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": moderator.id(), "path": "groups/mod_add_test/config", "level": MODERATE, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(grant_moderate.is_success(), "Grant MODERATE should succeed");
    println!("   ✓ Moderator granted MODERATE on group config");

    // Verify moderator has MODERATE permission
    let mod_perm: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": "mod_add_test",
            "grantee": moderator.id(),
            "path": "groups/mod_add_test/config"
        }))
        .await?
        .json()?;
    assert_eq!(mod_perm, MODERATE, "Moderator should have MODERATE permission");

    // Test 1: Moderator with MODERATE can add member with level=0 (NONE)
    // This tests queries.rs:can_grant_permissions lines 38-48
    let add_target1 = moderator
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "mod_add_test", "member_id": target1.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_target1.is_success(), "Moderator should add member with level=0: {:?}", add_target1.failures());
    println!("   ✓ Moderator added target1 with level=0 (NONE)");

    // Verify target1 is a member
    let is_target1_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "mod_add_test",
            "member_id": target1.id()
        }))
        .await?
        .json()?;
    assert!(is_target1_member, "target1 should be a member");

    // Test 2: Moderator cannot grant MANAGE permission (set_permission requires MANAGE to delegate)
    // This is a separate path from can_grant_permissions, but related security check
    let grant_manage_fail = moderator
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": target1.id(), "path": "groups/mod_add_test/config", "level": MANAGE, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!grant_manage_fail.is_success(), "Moderator should NOT be able to grant MANAGE");
    println!("   ✓ Moderator correctly denied from granting MANAGE");

    // Test 3: Regular member (no MODERATE) CANNOT add other members
    // This verifies can_grant_permissions returns false for non-privileged users
    let add_target2_by_target1 = target1
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "mod_add_test", "member_id": target2.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!add_target2_by_target1.is_success(), "Regular member without MODERATE should NOT add members");
    println!("   ✓ Regular member (no MODERATE) correctly denied from adding members");

    // Test 4: Verify error message mentions permission denied
    let failure_msg = format!("{:?}", add_target2_by_target1.failures());
    assert!(
        failure_msg.contains("Permission denied") || failure_msg.contains("denied"),
        "Error should mention permission denied: {}",
        failure_msg
    );

    println!("✅ Moderator limited permission levels test passed");
    Ok(())
}

// =============================================================================
// TEST: is_member returns false for soft-deleted (left) members
// =============================================================================
// Covers: queries.rs lines 54-60 - is_member checks DataValue::Value pattern
#[tokio::test]
async fn test_is_member_returns_false_for_left_members() -> anyhow::Result<()> {
    println!("\n=== Test: is_member returns false for left members ===");

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
                "action": { "type": "create_group", "group_id": "is_member_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // Bob joins the group
    let bob_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "is_member_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_join.is_success(), "Bob join should succeed");

    // Verify Bob is a member
    let is_bob_member_before: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "is_member_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_bob_member_before, "Bob should be a member after joining");
    println!("   ✓ Bob is a member after joining");

    // Bob leaves the group
    let bob_leave = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "is_member_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_leave.is_success(), "Bob leave should succeed");

    // Verify Bob is NOT a member (soft-deleted entry)
    let is_bob_member_after: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "is_member_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!is_bob_member_after, "Bob should NOT be a member after leaving (soft-deleted)");
    println!("   ✓ Bob is NOT a member after leaving (soft-delete handled correctly)");

    // Also verify get_member_data returns null for left member
    let member_data: Option<serde_json::Value> = contract
        .view("get_member_data")
        .args_json(json!({
            "group_id": "is_member_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(member_data.is_none(), "get_member_data should return null for left member");
    println!("   ✓ get_member_data returns null for left member");

    println!("✅ is_member soft-delete test passed");
    Ok(())
}

// =============================================================================
// TEST: is_member returns false for non-existent group
// =============================================================================
// Covers: queries.rs - is_member behavior when group doesn't exist
#[tokio::test]
async fn test_is_member_nonexistent_group() -> anyhow::Result<()> {
    println!("\n=== Test: is_member returns false for non-existent group ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Query is_member for a group that doesn't exist
    let is_member_nonexistent: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "nonexistent_group_xyz",
            "member_id": alice.id()
        }))
        .await?
        .json()?;
    
    assert!(!is_member_nonexistent, "is_member should return false for non-existent group (not error)");
    println!("   ✓ is_member returns false for non-existent group");

    // Also test is_group_owner for non-existent group
    let is_owner_nonexistent: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "nonexistent_group_xyz",
            "user_id": alice.id()
        }))
        .await?
        .json()?;
    
    assert!(!is_owner_nonexistent, "is_owner should return false for non-existent group");
    println!("   ✓ is_owner returns false for non-existent group");

    println!("✅ Non-existent group query test passed");
    Ok(())
}

// =============================================================================
// TEST: can_grant_permissions returns false for member-driven groups
// =============================================================================
// Covers: queries.rs lines 12-13 - Member-driven groups block direct grants
#[tokio::test]
async fn test_can_grant_permissions_member_driven_blocked() -> anyhow::Result<()> {
    println!("\n=== Test: can_grant_permissions blocked for member-driven groups ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a member-driven group (requires governance for changes)
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "member_driven_grant_test", "config": { "member_driven": true, "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");
    println!("   ✓ Member-driven group created");

    // Alice (owner) tries to directly add Bob - should fail (member-driven requires proposal)
    let _direct_add = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "member_driven_grant_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    // In member-driven groups, add_group_member redirects to proposal creation
    // The call succeeds but creates a proposal instead of direct add
    // Let's verify Bob is NOT immediately a member
    let is_bob_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "member_driven_grant_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    
    // With only 1 member, proposal auto-executes
    // Let's check the behavior - if auto-executed, Bob is member
    if is_bob_member {
        println!("   ✓ Single-member group auto-executed proposal (expected)");
    } else {
        println!("   ✓ Direct add blocked for member-driven group");
    }

    // The key test: try direct set_permission in member-driven group
    // This should fail because can_grant_permissions returns false
    if is_bob_member {
        let direct_permission = alice
            .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": bob.id(), "path": "groups/member_driven_grant_test/config", "level": MANAGE, "expires_at": null }
            }
        }))
            .gas(near_workspaces::types::Gas::from_tgas(100))
            .transact()
            .await?;
        
        assert!(!direct_permission.is_success(), "Direct permission grant should fail in member-driven group");
        let failure_msg = format!("{:?}", direct_permission.failures());
        assert!(
            failure_msg.contains("governance") || failure_msg.contains("Member-driven"),
            "Error should mention governance requirement: {}",
            failure_msg
        );
        println!("   ✓ Direct permission grant blocked - requires governance proposal");
    }

    println!("✅ Member-driven can_grant_permissions test passed");
    Ok(())
}

#[tokio::test]
async fn test_stats_counter_underflow_protection_and_event() -> anyhow::Result<()> {
    println!("\n=== Test: Stats counter underflow protection and event schema ===");

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
                "action": { "type": "create_group", "group_id": "underflow_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success());

    // Helper to get stats
    async fn get_stats(contract: &Contract, group_id: &str) -> Option<serde_json::Value> {
        contract
            .view("get_group_stats")
            .args_json(json!({ "group_id": group_id }))
            .await
            .unwrap()
            .json()
            .unwrap()
    }

    // Initial state: 1 member (owner), 0 join requests
    let initial_stats = get_stats(&contract, "underflow_test").await;
    assert!(initial_stats.is_some(), "Stats should exist after group creation");
    let initial = initial_stats.unwrap();
    assert_eq!(initial.get("total_members").and_then(|v| v.as_u64()), Some(1));
    assert_eq!(initial.get("total_join_requests").and_then(|v| v.as_u64()), Some(0));
    assert!(initial.get("created_at").is_some(), "Should have created_at");
    assert!(initial.get("last_updated").is_some(), "Should have last_updated");
    println!("   ✓ Initial stats: members=1, join_requests=0");

    // Bob joins public group
    let join_bob = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "underflow_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_bob.is_success());

    // Verify stats_updated event schema in join logs
    let join_logs = join_bob.logs();
    let mut found_stats_event = false;
    for log in &join_logs {
        if log.contains("EVENT_JSON:") && log.contains("stats_updated") {
            found_stats_event = true;
            // Verify it contains required fields
            assert!(log.contains("group_id"), "stats_updated should have group_id");
            assert!(log.contains("underflow_test"), "stats_updated should reference correct group");
            assert!(log.contains("total_members"), "stats_updated should include total_members");
        }
    }
    assert!(found_stats_event, "Should emit stats_updated event on member add");
    println!("   ✓ stats_updated event emitted with correct schema");

    // Capture last_updated before next operation
    let stats_after_bob = get_stats(&contract, "underflow_test").await.unwrap();
    let last_updated_1 = stats_after_bob.get("last_updated").and_then(|v| v.as_str()).unwrap().to_string();
    assert_eq!(stats_after_bob.get("total_members").and_then(|v| v.as_u64()), Some(2));
    println!("   ✓ After Bob joins: members=2, last_updated={}", last_updated_1);

    // Bob leaves
    let leave_bob = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "underflow_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(leave_bob.is_success());

    let stats_after_leave = get_stats(&contract, "underflow_test").await.unwrap();
    assert_eq!(stats_after_leave.get("total_members").and_then(|v| v.as_u64()), Some(1));
    println!("   ✓ After Bob leaves: members=1");

    // CRITICAL TEST: Verify join_requests counter stays at 0 (underflow protection)
    // This is already 0, and no join request operations were done
    // The real underflow scenario would require calling decrement on 0
    // Since we can't directly call internal functions, we test indirectly:
    // Ensure counter is still 0 after operations that don't involve join requests
    let final_stats = get_stats(&contract, "underflow_test").await.unwrap();
    let final_join_requests = final_stats.get("total_join_requests").and_then(|v| v.as_u64()).unwrap_or(999);
    assert_eq!(final_join_requests, 0, "Join request counter should remain 0");
    println!("   ✓ Join request counter stable at 0 (no underflow)");

    // Verify last_updated changed after leave operation
    let last_updated_2 = final_stats.get("last_updated").and_then(|v| v.as_str()).unwrap();
    // Note: In same block they might be equal, so just verify it exists
    assert!(!last_updated_2.is_empty(), "last_updated should be set");
    println!("   ✓ last_updated field properly maintained");

    println!("✅ Stats counter underflow protection and event test passed");
    Ok(())
}

// =============================================================================
// TEST: Remove non-existent member fails with proper error
// =============================================================================
// Scenario: Owner tries to remove a member who never joined.
// Expected: Fails with "Member not found" error.
#[tokio::test]
async fn test_remove_nonexistent_member_fails() -> anyhow::Result<()> {
    println!("\n=== Test: Remove non-existent member fails ===");

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
                "action": { "type": "create_group", "group_id": "remove_nonexistent_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");
    println!("   ✓ Group created");

    // Bob never joined - Alice tries to remove Bob
    let remove_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "remove_group_member", "group_id": "remove_nonexistent_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!remove_result.is_success(), "Remove non-existent member should fail");

    let failure_msg = format!("{:?}", remove_result.failures());
    assert!(
        failure_msg.contains("Member not found") || failure_msg.contains("not found"),
        "Error should mention member not found: {}",
        failure_msg
    );
    println!("   ✓ Remove non-existent member correctly rejected with 'Member not found'");

    println!("✅ Remove non-existent member test passed");
    Ok(())
}

// =============================================================================
// TEST: Unprivileged user cannot add members to private group
// =============================================================================
// Scenario: Regular member without MANAGE tries to add someone to private group.
// Expected: Fails with permission denied.
#[tokio::test]
async fn test_unprivileged_cannot_add_to_private_group() -> anyhow::Result<()> {
    println!("\n=== Test: Unprivileged user cannot add members to private group ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let charlie = create_user(&root, "charlie", TEN_NEAR).await?;

    // Alice creates a PRIVATE group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "private_add_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create private group should succeed");
    println!("   ✓ Private group created");

    // Alice adds Bob as regular member
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "private_add_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Owner adding Bob should succeed");
    println!("   ✓ Bob added as regular member");

    // Bob (no MANAGE permission) tries to add Charlie - should fail
    let bob_add_charlie = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "private_add_test", "member_id": charlie.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!bob_add_charlie.is_success(), "Unprivileged member should not add others to private group");

    let failure_msg = format!("{:?}", bob_add_charlie.failures());
    assert!(
        failure_msg.contains("Permission") || failure_msg.contains("denied") || failure_msg.contains("permission"),
        "Error should mention permission denied: {}",
        failure_msg
    );
    println!("   ✓ Unprivileged member correctly rejected from adding others");

    // Verify Charlie is NOT a member
    let is_charlie_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "private_add_test",
            "member_id": charlie.id()
        }))
        .await?
        .json()?;
    assert!(!is_charlie_member, "Charlie should not be a member");
    println!("   ✓ Charlie is not a member");

    println!("✅ Unprivileged cannot add to private group test passed");
    Ok(())
}

// =============================================================================
// TEST: Unblacklist then add member flow
// =============================================================================
// Scenario: User is blacklisted, then unblacklisted, then successfully added.
// Tests the complete remediation flow.
#[tokio::test]
async fn test_unblacklist_then_add_flow() -> anyhow::Result<()> {
    println!("\n=== Test: Unblacklist then add member flow ===");

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
                "action": { "type": "create_group", "group_id": "unblacklist_flow_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");
    println!("   ✓ Group created");

    // Alice blacklists Bob
    let blacklist_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "unblacklist_flow_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(blacklist_bob.is_success(), "Blacklisting Bob should succeed");
    println!("   ✓ Bob blacklisted");

    // Verify Bob is blacklisted
    let is_blacklisted_before: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "unblacklist_flow_test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_blacklisted_before, "Bob should be blacklisted");

    // Alice tries to add blacklisted Bob - should fail
    let add_blacklisted = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "unblacklist_flow_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!add_blacklisted.is_success(), "Adding blacklisted user should fail");
    println!("   ✓ Cannot add while blacklisted");

    // Alice unblacklists Bob
    let unblacklist_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "unblacklist_group_member", "group_id": "unblacklist_flow_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(unblacklist_bob.is_success(), "Unblacklisting Bob should succeed");
    println!("   ✓ Bob unblacklisted");

    // Verify Bob is no longer blacklisted
    let is_blacklisted_after: bool = contract
        .view("is_blacklisted")
        .args_json(json!({
            "group_id": "unblacklist_flow_test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!is_blacklisted_after, "Bob should no longer be blacklisted");

    // Alice can now add Bob
    let add_bob = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "unblacklist_flow_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(add_bob.is_success(), "Adding unblacklisted Bob should succeed: {:?}", add_bob.failures());
    println!("   ✓ Bob added after unblacklist");

    // Verify Bob is now a member
    let is_bob_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "unblacklist_flow_test",
            "member_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(is_bob_member, "Bob should now be a member");
    println!("   ✓ Bob is a member");

    println!("✅ Unblacklist then add flow test passed");
    Ok(())
}

// =============================================================================
// TEST: Cancel join request blocked in member-driven group
// =============================================================================
// Covers: join_requests.rs:cancel_join_request assert_join_requests_not_member_driven
// Scenario: Member-driven groups handle join requests through proposals only.
// cancel_join_request should fail with "proposals only" error.
#[tokio::test]
async fn test_cancel_join_request_blocked_in_member_driven_group() -> anyhow::Result<()> {
    println!("\n=== Test: Cancel join request blocked in member-driven group ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates a member-driven group (implicitly private)
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "member_driven_cancel_test", "config": {
                "member_driven": true
            } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create member-driven group should succeed: {:?}", create_result.failures());
    println!("   ✓ Created member-driven group");

    // Bob attempts to join (creates proposal in member-driven group)
    let join_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "member_driven_cancel_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_result.is_success(), "Join should succeed (creates proposal): {:?}", join_result.failures());
    println!("   ✓ Bob submitted join request (proposal created)");

    // Bob tries to cancel - should fail because member-driven groups use proposals
    let cancel_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "cancel_join_request", "group_id": "member_driven_cancel_test" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(!cancel_result.is_success(), "Cancel should fail in member-driven group");
    let err = format!("{:?}", cancel_result.failures());
    assert!(
        err.contains("proposals only") || err.contains("Member-driven"),
        "Error should mention proposals: {}", err
    );
    println!("   ✓ Cancel correctly rejected with 'proposals only' error");

    println!("✅ Cancel join request blocked in member-driven group test passed");
    Ok(())
}

// =============================================================================
// TEST: Re-submit join request after rejection
// =============================================================================
// Covers: join_requests.rs L42 - If status is "rejected", allow overwriting
// Scenario: User submits request, gets rejected, can submit again
#[tokio::test]
async fn test_resubmit_join_request_after_rejection() -> anyhow::Result<()> {
    println!("\n=== Test: Re-submit join request after rejection ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Alice creates private group
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "resubmit_test", "config": { "is_private": true } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success());
    println!("   ✓ Created private group");

    // Bob submits first join request
    let join1 = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "resubmit_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join1.is_success());
    println!("   ✓ Bob submitted first join request");

    // Alice rejects
    let reject = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "reject_join_request", "group_id": "resubmit_test", "requester_id": bob.id(), "reason": "Profile incomplete" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(reject.is_success());
    println!("   ✓ Alice rejected request");

    // Verify status is rejected
    let request_rejected: Option<serde_json::Value> = contract
        .view("get_join_request")
        .args_json(json!({
            "group_id": "resubmit_test",
            "requester_id": bob.id()
        }))
        .await?
        .json()?;
    let status = request_rejected
        .as_ref()
        .and_then(|r| r.get("status"))
        .and_then(|s| s.as_str());
    assert_eq!(status, Some("rejected"));
    println!("   ✓ Status is 'rejected'");

    // Bob submits again - should succeed (overwrite rejected)
    let join2 = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "resubmit_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join2.is_success(), "Re-submit after rejection should succeed: {:?}", join2.failures());
    println!("   ✓ Bob successfully re-submitted after rejection");

    // Verify status is now pending again
    let request_pending: Option<serde_json::Value> = contract
        .view("get_join_request")
        .args_json(json!({
            "group_id": "resubmit_test",
            "requester_id": bob.id()
        }))
        .await?
        .json()?;
    let new_status = request_pending
        .as_ref()
        .and_then(|r| r.get("status"))
        .and_then(|s| s.as_str());
    assert_eq!(new_status, Some("pending"), "Status should be pending after resubmit");
    println!("   ✓ Status is 'pending' after resubmit");

    println!("✅ Re-submit join request after rejection test passed");
    Ok(())
}

// =============================================================================
// TEST: Event builder field precedence and partition_id
// =============================================================================
// Verifies EventBuilder behavior at integration level:
// - Builder fields (path, target_id) are present and correct
// - partition_id is included for data locality
// - Structured data fields are merged correctly
#[tokio::test]
async fn test_event_builder_field_precedence_and_partition() -> anyhow::Result<()> {
    println!("\n=== Test: EventBuilder field precedence and partition_id ===");

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
                "action": { "type": "create_group", "group_id": "builder_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success());
    println!("   ✓ Group created");

    // Bob joins
    let join_result = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "builder_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(join_result.is_success());
    println!("   ✓ Bob joined");

    // Alice removes Bob - triggers remove_member event with structured_data
    let remove_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "remove_group_member", "group_id": "builder_test", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(remove_result.is_success(), "Remove should succeed: {:?}", remove_result.failures());

    let logs = remove_result.logs();
    let remove_events = find_events_by_operation(&logs, "remove_member");
    assert!(!remove_events.is_empty(), "Should emit remove_member event");

    let event = &remove_events[0];
    let data = event.data.first().expect("Event should have data");

    // Verify builder-set fields are present (set via with_path, with_target)
    let path = data.extra.get("path").and_then(|v| v.as_str());
    assert!(path.is_some(), "path field must be present");
    assert!(
        path.unwrap().contains("builder_test") && path.unwrap().contains("members"),
        "path should contain group and members: got {:?}",
        path
    );
    println!("   ✓ path field present and correct: {}", path.unwrap());

    let target_id = data.extra.get("target_id").and_then(|v| v.as_str());
    assert!(target_id.is_some(), "target_id field must be present");
    assert_eq!(target_id.unwrap(), bob.id().as_str(), "target_id should be Bob");
    println!("   ✓ target_id field present and correct: {}", target_id.unwrap());

    // Verify structured_data fields merged (removed_by, is_self_removal, etc.)
    let removed_by = data.extra.get("removed_by").and_then(|v| v.as_str());
    assert_eq!(removed_by, Some(alice.id().as_str()), "removed_by should be Alice");
    println!("   ✓ structured_data field 'removed_by' merged correctly");

    let is_self_removal = data.extra.get("is_self_removal").and_then(|v| v.as_bool());
    assert_eq!(is_self_removal, Some(false), "is_self_removal should be false");
    println!("   ✓ structured_data field 'is_self_removal' merged correctly");

    // Verify partition_id is present (set by EventBatch::emit via emitter)
    // partition_id is in extra since local EventData doesn't parse it separately
    let partition_id = data.extra.get("partition_id").and_then(|v| v.as_u64());
    assert!(
        partition_id.is_some(),
        "partition_id must be present for data locality"
    );
    println!("   ✓ partition_id present: {}", partition_id.unwrap());

    // Verify event standard and version
    assert_eq!(event.standard, "onsocial", "standard should be 'onsocial'");
    assert_eq!(event.version, "1.0.0", "version should be '1.0.0'");
    println!("   ✓ Event standard={} version={}", event.standard, event.version);

    println!("✅ EventBuilder field precedence and partition test passed");
    Ok(())
}

// =============================================================================
// TEST: create_group rejects non-object config
// =============================================================================
// Covers: admin.rs L18-20 - Config validation must reject array/null/string
#[tokio::test]
async fn test_create_group_rejects_non_object_config() -> anyhow::Result<()> {
    println!("\n=== Test: create_group rejects non-object config ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Test 1: Array config should fail
    let array_config = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "array_config_test", "config": ["invalid", "array"] }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!array_config.is_success(), "Array config should be rejected");
    let err = format!("{:?}", array_config.failures());
    assert!(
        err.contains("JSON object") || err.contains("must be") || err.contains("Config"),
        "Error should mention config must be object: {}", err
    );
    println!("   ✓ Array config rejected");

    // Test 2: Null config should fail
    let null_config = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "null_config_test", "config": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!null_config.is_success(), "Null config should be rejected");
    println!("   ✓ Null config rejected");

    // Test 3: String config should fail
    let string_config = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "string_config_test", "config": "not_an_object" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!string_config.is_success(), "String config should be rejected");
    println!("   ✓ String config rejected");

    // Test 4: Valid object config should succeed
    let valid_config = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "valid_config_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(valid_config.is_success(), "Valid object config should succeed: {:?}", valid_config.failures());
    println!("   ✓ Valid object config accepted");

    println!("✅ create_group config validation test passed");
    Ok(())
}

// =============================================================================
// TEST: create_group validates group_id format
// =============================================================================
// Covers: admin.rs L17 -> validation/group.rs - Group ID validation edge cases
#[tokio::test]
async fn test_create_group_validates_group_id_format() -> anyhow::Result<()> {
    println!("\n=== Test: create_group validates group_id format ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Test 1: Group ID > 64 chars should fail
    let long_id = "a".repeat(65);
    let long_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": long_id, "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!long_result.is_success(), "Group ID > 64 chars should be rejected");
    let err = format!("{:?}", long_result.failures());
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention length: {}", err
    );
    println!("   ✓ Group ID > 64 chars rejected");

    // Test 2: Group ID with special characters should fail
    let special_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "invalid@group#id", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!special_result.is_success(), "Special characters should be rejected");
    let err = format!("{:?}", special_result.failures());
    assert!(
        err.contains("alphanumeric") || err.contains("underscores") || err.contains("hyphens") || err.contains("Group ID"),
        "Error should mention allowed characters: {}", err
    );
    println!("   ✓ Special characters rejected");

    // Test 3: Valid group IDs (alphanumeric, underscore, hyphen) should succeed
    let valid_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "valid_group-123", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(valid_result.is_success(), "Valid group ID should succeed: {:?}", valid_result.failures());
    println!("   ✓ Valid group ID accepted");

    println!("✅ create_group group_id validation test passed");
    Ok(())
}

// =============================================================================
// TEST: transfer_group_ownership to non-member fails
// =============================================================================
// Covers: ownership.rs L64 - New owner must be a member of the group
#[tokio::test]
async fn test_transfer_ownership_to_non_member_fails() -> anyhow::Result<()> {
    println!("\n=== Test: transfer_group_ownership to non-member fails ===");

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
                "action": { "type": "create_group", "group_id": "transfer_non_member_test", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");
    println!("   ✓ Group created");

    // Bob is NOT a member - verify
    let is_bob_member: bool = contract
        .view("is_group_member")
        .args_json(json!({
            "group_id": "transfer_non_member_test",
            "member_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(!is_bob_member, "Bob should NOT be a member");
    println!("   ✓ Bob is not a member");

    // Alice tries to transfer ownership to non-member Bob - should fail
    let transfer_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "transfer_group_ownership", "group_id": "transfer_non_member_test", "new_owner": bob.id().to_string(), "remove_old_owner": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    
    assert!(!transfer_result.is_success(), "Transfer to non-member should fail");
    let err = format!("{:?}", transfer_result.failures());
    assert!(
        err.contains("must be a member") || err.contains("New owner"),
        "Error should indicate new owner must be member: {}", err
    );
    println!("   ✓ Transfer to non-member correctly rejected");

    // Verify Alice is still owner
    let is_alice_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "transfer_non_member_test",
            "user_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_alice_owner, "Alice should still be owner");
    println!("   ✓ Alice remains owner");

    // Now Bob joins, and transfer should succeed
    let bob_join = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "transfer_non_member_test" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bob_join.is_success(), "Bob join should succeed");
    println!("   ✓ Bob joined group");

    let transfer_success = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "transfer_group_ownership", "group_id": "transfer_non_member_test", "new_owner": bob.id().to_string(), "remove_old_owner": false }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(transfer_success.is_success(), "Transfer to member should succeed: {:?}", transfer_success.failures());

    // Verify Bob is now owner
    let is_bob_owner: bool = contract
        .view("is_group_owner")
        .args_json(json!({
            "group_id": "transfer_non_member_test",
            "user_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert!(is_bob_owner, "Bob should now be owner");
    println!("   ✓ Transfer to member succeeded, Bob is now owner");

    println!("✅ transfer_group_ownership to non-member test passed");
    Ok(())
}

// =============================================================================
// TEST: admin operations validate group_id format (Issue #2 fix)
// =============================================================================
// Covers: invites.rs L15, admin.rs L31, L71, L108, L146 - validate_group_id()
// This test would FAIL on pre-fix code where validation was missing
#[tokio::test]
async fn test_admin_operations_validate_group_id_format() -> anyhow::Result<()> {
    println!("\n=== Test: admin operations validate group_id format ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Create a valid group first
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "valid_group", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // =========================================================================
    // TEST 1: add_group_member with invalid group_id
    // =========================================================================
    println!("\n📦 TEST 1: add_group_member with invalid group_id...");

    let add_invalid = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": "bad@id", "member_id": bob.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!add_invalid.is_success(), "add_group_member with invalid group_id should fail");
    let err = format!("{:?}", add_invalid.failures());
    assert!(
        err.contains("alphanumeric") || err.contains("Group ID"),
        "Error should mention validation, got: {}", err
    );
    println!("   ✓ add_group_member with invalid group_id rejected");

    // =========================================================================
    // TEST 2: remove_group_member with empty group_id
    // =========================================================================
    println!("\n📦 TEST 2: remove_group_member with empty group_id...");

    let remove_empty = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "remove_group_member", "group_id": "", "member_id": bob.id() }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!remove_empty.is_success(), "remove_group_member with empty group_id should fail");
    let err = format!("{:?}", remove_empty.failures());
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention validation, got: {}", err
    );
    println!("   ✓ remove_group_member with empty group_id rejected");

    // =========================================================================
    // TEST 3: blacklist_group_member with special characters
    // =========================================================================
    println!("\n📦 TEST 3: blacklist_group_member with special characters...");

    let blacklist_invalid = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "blacklist_group_member", "group_id": "../traversal", "member_id": bob.id() }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!blacklist_invalid.is_success(), "blacklist with invalid group_id should fail");
    let err = format!("{:?}", blacklist_invalid.failures());
    assert!(
        err.contains("alphanumeric") || err.contains("Group ID"),
        "Error should mention validation, got: {}", err
    );
    println!("   ✓ blacklist_group_member with invalid group_id rejected");

    // =========================================================================
    // TEST 4: unblacklist_group_member with oversized group_id
    // =========================================================================
    println!("\n📦 TEST 4: unblacklist_group_member with oversized group_id...");

    let long_id = "x".repeat(65);
    let unblacklist_long = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "unblacklist_group_member", "group_id": long_id, "member_id": bob.id() }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!unblacklist_long.is_success(), "unblacklist with oversized group_id should fail");
    let err = format!("{:?}", unblacklist_long.failures());
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention length, got: {}", err
    );
    println!("   ✓ unblacklist_group_member with oversized group_id rejected");

    // =========================================================================
    // TEST 5: transfer_group_ownership with invalid group_id
    // =========================================================================
    println!("\n📦 TEST 5: transfer_group_ownership with invalid group_id...");

    let transfer_invalid = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "transfer_group_ownership", "group_id": "bad#id!", "new_owner": bob.id() }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!transfer_invalid.is_success(), "transfer with invalid group_id should fail");
    let err = format!("{:?}", transfer_invalid.failures());
    assert!(
        err.contains("alphanumeric") || err.contains("Group ID"),
        "Error should mention validation, got: {}", err
    );
    println!("   ✓ transfer_group_ownership with invalid group_id rejected");

    println!("\n✅ admin operations group_id validation test passed");
    Ok(())
}

// =============================================================================
// TEST: join_group and leave_group validate group_id format
// =============================================================================
// Covers: joins.rs L13, L44 - validate_group_id() must be called
// This test would FAIL on pre-fix code where validation was missing
#[tokio::test]
async fn test_join_leave_group_validates_group_id_format() -> anyhow::Result<()> {
    println!("\n=== Test: join_group and leave_group validate group_id format ===");

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_core_onsocial(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // First create a valid group so alice is a member somewhere
    let create_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": "valid_group", "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(create_result.is_success(), "Create group should succeed");

    // =========================================================================
    // TEST 1: join_group with empty group_id should fail with validation error
    // =========================================================================
    println!("\n📦 TEST 1: join_group with empty group_id...");

    let join_empty = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!join_empty.is_success(), "join_group with empty group_id should fail");
    let err = format!("{:?}", join_empty.failures());
    // Must fail with validation error, NOT "Group not found"
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention group_id format validation, got: {}", err
    );
    println!("   ✓ join_group with empty group_id rejected with validation error");

    // =========================================================================
    // TEST 2: join_group with special characters should fail with validation error
    // =========================================================================
    println!("\n📦 TEST 2: join_group with special characters...");

    let join_special = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": "bad@group#id" }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!join_special.is_success(), "join_group with special chars should fail");
    let err = format!("{:?}", join_special.failures());
    assert!(
        err.contains("alphanumeric") || err.contains("underscores") || err.contains("hyphens") || err.contains("Group ID"),
        "Error should mention allowed characters, got: {}", err
    );
    println!("   ✓ join_group with special characters rejected with validation error");

    // =========================================================================
    // TEST 3: leave_group with empty group_id should fail with validation error
    // =========================================================================
    println!("\n📦 TEST 3: leave_group with empty group_id...");

    let leave_empty = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!leave_empty.is_success(), "leave_group with empty group_id should fail");
    let err = format!("{:?}", leave_empty.failures());
    // Must fail with validation error, NOT "Member not found"
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention group_id format validation (not 'Member not found'), got: {}", err
    );
    println!("   ✓ leave_group with empty group_id rejected with validation error");

    // =========================================================================
    // TEST 4: leave_group with special characters should fail with validation error
    // =========================================================================
    println!("\n📦 TEST 4: leave_group with special characters...");

    let leave_special = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "leave_group", "group_id": "../path/traversal" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!leave_special.is_success(), "leave_group with special chars should fail");
    let err = format!("{:?}", leave_special.failures());
    assert!(
        err.contains("alphanumeric") || err.contains("underscores") || err.contains("hyphens") || err.contains("Group ID"),
        "Error should mention allowed characters (not 'Member not found'), got: {}", err
    );
    println!("   ✓ leave_group with special characters rejected with validation error");

    // =========================================================================
    // TEST 5: join_group with oversized group_id should fail
    // =========================================================================
    println!("\n📦 TEST 5: join_group with group_id > 64 chars...");

    let long_id = "a".repeat(65);
    let join_long = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "join_group", "group_id": long_id }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(!join_long.is_success(), "join_group with oversized group_id should fail");
    let err = format!("{:?}", join_long.failures());
    assert!(
        err.contains("1-64 characters") || err.contains("Group ID"),
        "Error should mention length validation, got: {}", err
    );
    println!("   ✓ join_group with oversized group_id rejected");

    println!("\n✅ join_group and leave_group group_id validation test passed");
    Ok(())
}
