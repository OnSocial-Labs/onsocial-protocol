// =============================================================================
// Key Permission (Session/Service Key) Integration Tests
// =============================================================================
// Verifies public-key based permission grants for cross-account writes via unified `set(request)`.
//
// Run with:
//   cargo test -p onsocial-integration-tests key_permissions -- --test-threads=1

use near_workspaces::types::{AccessKey, AccountId, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, Contract};
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

fn load_core_onsocial_wasm() -> anyhow::Result<Vec<u8>> {
    let paths = [
        "../target/near/core_onsocial/core_onsocial.wasm",
        "target/near/core_onsocial/core_onsocial.wasm",
        "/code/target/near/core_onsocial/core_onsocial.wasm",
    ];

    for path in paths {
        if let Ok(wasm) = std::fs::read(std::path::Path::new(path)) {
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
    let _ = contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

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

fn unique_account_id(prefix: &str) -> anyhow::Result<AccountId> {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let id_str = format!("{}-{}", prefix, nanos);
    Ok(id_str.parse()?)
}

#[tokio::test]
async fn test_key_permission_allows_cross_account_set_for() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create a relayer/service account with a known key so we can grant that key permissions.
    let relayer_id = unique_account_id("relayer")?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer = worker
        .create_tla(relayer_id.clone(), relayer_sk.clone())
        .await?
        .into_result()?;
    let relayer_pk = relayer_sk.public_key();

    // Pre-deposit storage for Alice so she can grant key permissions
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}  // 1 NEAR
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected storage deposit to succeed");

    // 1) Relayer cannot write to Alice by default.
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/name": "Alice via relayer"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "Expected cross-account set to fail without permissions"
    );

    // 2) Alice grants WRITE to relayer public key for her profile subtree.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected set_key_permission to succeed");

    // 3) Relayer can now write to Alice via set(request), without being Alice.
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/name": "Alice via relayer (authorized)"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Expected cross-account set to succeed with key permission"
    );

    Ok(())
}

#[tokio::test]
async fn test_key_permission_revoke_blocks_cross_account_set_for() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    let relayer_id = unique_account_id("relayer")?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer = worker
        .create_tla(relayer_id.clone(), relayer_sk.clone())
        .await?
        .into_result()?;
    let relayer_pk = relayer_sk.public_key();

    // Pre-deposit storage for Alice so she can grant key permissions
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}  // 1 NEAR
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected storage deposit to succeed");

    // Grant
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success());

    // Works
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/name": "ok"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success());

    // Revoke (level=0)
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 0, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success());

    // Fails again
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/name": "should fail"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "Expected cross-account set to fail after revoke"
    );

    Ok(())
}

// =============================================================================
// Session Key (Function Call Access Key) - Full User Journey Tests
// =============================================================================
// These tests document the complete "Option A" flow for gasless UX:
// 1. User connects wallet and creates a session key (one wallet confirmation)
// 2. User deposits storage using full access key (one wallet confirmation)
// 3. User performs all subsequent operations using session key (no wallet confirmations)

#[tokio::test]
async fn test_full_session_key_flow_deposit_then_operate_without_wallet() -> anyhow::Result<()> {
    // This test demonstrates the complete "Option A" user journey for limited access keys.
    //
    // Flow:
    // 1. User connects wallet → adds Function Call Access Key (session key)
    // 2. User deposits storage → requires full access key (wallet confirmation)
    // 3. User performs operations → uses session key (NO wallet confirmation)
    //
    // This is the recommended UX for dApps that want to minimize wallet popups.

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // =========================================================================
    // STEP 1: User adds a session key (requires one wallet confirmation)
    // =========================================================================
    let session_sk = SecretKey::from_random(KeyType::ED25519);
    let session_pk = session_sk.public_key();

    let add_key_res = alice
        .batch(alice.id())
        .add_key(
            session_pk.clone(),
            AccessKey::function_call_access(contract.id(), &["execute"], Some(TEN_NEAR)),
        )
        .transact()
        .await?;
    assert!(
        add_key_res.is_success(),
        "Step 1: Expected add_key to succeed"
    );

    // =========================================================================
    // STEP 2: User deposits storage (requires wallet confirmation - deposits need full key)
    // =========================================================================
    // NEAR protocol limitation: Function Call Access Keys cannot attach deposits.
    // User must use their full access key to deposit storage.
    let deposit_amount = ONE_NEAR;
    let deposit_res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": { "amount": deposit_amount.as_yoctonear().to_string() }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(deposit_amount)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        deposit_res.is_success(),
        "Step 2: Expected storage deposit to succeed"
    );

    // Verify storage balance was credited
    let storage: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": alice.id()}))
        .await?
        .json()?;
    // balance is u128 serialized as f64 number
    let balance_f64: f64 = storage
        .get("balance")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let deposit_f64 = deposit_amount.as_yoctonear() as f64;
    assert!(
        balance_f64 >= deposit_f64,
        "Step 2: Storage balance should be credited (got {:.4} NEAR)",
        balance_f64 / 1e24
    );

    // =========================================================================
    // STEP 3: User operates using session key (NO wallet confirmation needed)
    // =========================================================================
    let mut alice_session = alice.clone();
    alice_session.set_secret_key(session_sk.clone());

    // 3a. Write profile data - NO WALLET POPUP
    let res = alice_session
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "profile/name": "Alice",
                    "profile/bio": "Hello from session key!"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Step 3a: Expected profile set to succeed with session key"
    );

    // 3b. Create a group - NO WALLET POPUP
    let res = alice_session
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": {
                    "type": "create_group",
                    "group_id": "my-group",
                    "config": { "name": "My Group", "is_private": false }
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Step 3b: Expected create_group to succeed with session key"
    );

    // 3c. Write to group - NO WALLET POPUP
    let res = alice_session
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "group/my-group/posts/1": { "title": "First post!", "content": "Via session key" }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Step 3c: Expected group post to succeed with session key"
    );

    // 3d. Grant key permission to session key for a specific path - NO WALLET POPUP
    let res = alice_session
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": {
                    "type": "set_key_permission",
                    "public_key": session_pk.to_string(),
                    "path": "apps/my-app/",
                    "level": 1,
                    "expires_at": null
                }
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Step 3d: Expected set_key_permission to succeed with session key"
    );

    // =========================================================================
    // VERIFICATION: Confirm all data was written correctly
    // =========================================================================
    let entries: Vec<serde_json::Value> = contract
        .view("get")
        .args_json(json!({
            "keys": ["profile/name", "profile/bio", "group/my-group/posts/1"],
            "account_id": alice.id()
        }))
        .await?
        .json()?;

    assert_eq!(entries.len(), 3, "Should have 3 entries");
    assert_eq!(
        entries[0].get("value").and_then(|v| v.as_str()),
        Some("Alice"),
        "Profile name should be Alice"
    );
    assert_eq!(
        entries[1].get("value").and_then(|v| v.as_str()),
        Some("Hello from session key!"),
        "Profile bio should match"
    );
    let post_value = entries[2].get("value");
    assert!(post_value.is_some(), "Group post should exist");

    Ok(())
}

#[tokio::test]
async fn test_session_key_cannot_deposit_storage_directly() -> anyhow::Result<()> {
    // This test confirms the NEAR protocol limitation:
    // Function Call Access Keys CANNOT attach deposits.
    // Users must use their full access key to deposit storage.

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Add session key
    let session_sk = SecretKey::from_random(KeyType::ED25519);
    let session_pk = session_sk.public_key();

    let add_key_res = alice
        .batch(alice.id())
        .add_key(
            session_pk,
            AccessKey::function_call_access(contract.id(), &["execute"], Some(TEN_NEAR)),
        )
        .transact()
        .await?;
    assert!(add_key_res.is_success(), "Expected add_key to succeed");

    // Switch to session key
    let mut alice_session = alice.clone();
    alice_session.set_secret_key(session_sk);

    // Attempt to deposit storage with session key - this SHOULD FAIL
    let res = alice_session
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": { "amount": ONE_NEAR.as_yoctonear().to_string() }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR) // Attempting deposit with function call key
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await;

    // NEAR protocol rejects deposits from function call access keys
    assert!(
        res.is_err() || !res.as_ref().expect("checked is_err").is_success(),
        "Expected storage deposit to fail with session key (NEAR protocol limitation)"
    );

    Ok(())
}

#[tokio::test]
async fn test_session_key_multiple_operations_consume_pre_deposited_storage() -> anyhow::Result<()>
{
    // This test verifies that multiple operations using a session key
    // correctly consume from the user's pre-deposited storage balance.

    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Step 1: Deposit storage using full access key
    let deposit_amount = ONE_NEAR;
    let deposit_res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": { "amount": deposit_amount.as_yoctonear().to_string() }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(deposit_amount)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(deposit_res.is_success(), "Storage deposit should succeed");

    // Get initial storage state
    let initial_storage: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": alice.id()}))
        .await?
        .json()?;
    let initial_used = initial_storage
        .get("used_bytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    // Step 2: Add session key
    let session_sk = SecretKey::from_random(KeyType::ED25519);
    let session_pk = session_sk.public_key();

    let add_key_res = alice
        .batch(alice.id())
        .add_key(
            session_pk,
            AccessKey::function_call_access(contract.id(), &["execute"], Some(TEN_NEAR)),
        )
        .transact()
        .await?;
    assert!(add_key_res.is_success(), "Add key should succeed");

    let mut alice_session = alice.clone();
    alice_session.set_secret_key(session_sk);

    // Step 3: Perform multiple writes using session key
    for i in 1..=5 {
        let res = alice_session
            .call(contract.id(), "execute")
            .args_json(json!({
                "request": {
                    "action": { "type": "set", "data": {
                        format!("posts/{}", i): { "title": format!("Post {}", i), "content": "Lorem ipsum dolor sit amet" }
                    } },
                    "options": null,
                    "auth": null
                }
            }))
            .deposit(NearToken::from_yoctonear(0))
            .gas(near_workspaces::types::Gas::from_tgas(120))
            .transact()
            .await?;
        assert!(
            res.is_success(),
            "Post {} should succeed with session key",
            i
        );
    }

    // Step 4: Verify storage was consumed
    let final_storage: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": alice.id()}))
        .await?
        .json()?;
    let final_used = final_storage
        .get("used_bytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    assert!(
        final_used > initial_used,
        "Storage used_bytes should increase after writes: initial={}, final={}",
        initial_used,
        final_used
    );

    // Step 5: Verify balance is still positive (can continue operating)
    let balance_f64: f64 = final_storage
        .get("balance")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    assert!(
        balance_f64 > 0.0,
        "Storage balance should still be positive (got {:.4} NEAR)",
        balance_f64 / 1e24
    );

    Ok(())
}

#[tokio::test]
async fn test_session_key_access_key_can_call_set_without_wallet() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Pre-allocate storage using Alice's normal signer key.
    // (Function-call access keys are not allowed to attach deposits in this sandbox/runtime setup.)
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "profile/name": "Alice initial"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected initial set to succeed");

    // Simulate a typical “session key” UX:
    // 1) user signs once (here: Alice) to add a restricted function-call access key
    // 2) dapp uses that key to sign future `set` calls without wallet confirmation
    let session_sk = SecretKey::from_random(KeyType::ED25519);
    let session_pk = session_sk.public_key();

    let add_key_res = alice
        .batch(alice.id())
        .add_key(
            session_pk.clone(),
            AccessKey::function_call_access(contract.id(), &["execute"], Some(TEN_NEAR)),
        )
        .transact()
        .await?;
    assert!(add_key_res.is_success(), "Expected add_key to succeed");

    // Use the new key to sign calls.
    let mut alice_session = alice.clone();
    alice_session.set_secret_key(session_sk);

    // Allowed: `set` (writing on her own account paths).
    let res = alice_session
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "profile/name": "Alice via session key"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected set to succeed with session key");

    // Not allowed: depositing with a function-call access key.
    let res = alice_session
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "profile/name": "should fail (deposit)"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await;
    assert!(
        res.is_err() || !res.as_ref().expect("checked is_err").is_success(),
        "Expected set with deposit to fail for function-call access key"
    );

    // Note: NEAR function-call access keys whitelist METHOD NAMES, not action types.
    // Since `execute` is whitelisted and set_key_permission is just an action type
    // passed to execute(), the call succeeds at the access key level.
    // The contract itself may still enforce permission checks.
    let res = alice_session
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": session_pk, "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    // This succeeds because the access key allows `execute` method calls,
    // and set_key_permission is an action sent to execute, not a separate method.
    assert!(
        res.is_success(),
        "set_key_permission via execute should succeed with function-call access key whitelisting execute"
    );

    Ok(())
}

#[tokio::test]
async fn test_session_key_first_write_uses_platform_sponsorship_no_deposit() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    // Fund the platform pool so new users can write with 0 deposit.
    // Note: the platform pool is stored under the contract account ID.
    let fund_amount = NearToken::from_near(5);
    let res = root
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/platform_pool_deposit": { "amount": fund_amount.as_yoctonear().to_string() }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(fund_amount)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Expected platform pool funding to succeed"
    );

    // Fresh user with no storage pre-allocation.
    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Add a session key that can only call `set`.
    let session_sk = SecretKey::from_random(KeyType::ED25519);
    let session_pk = session_sk.public_key();
    let add_key_res = alice
        .batch(alice.id())
        .add_key(
            session_pk,
            AccessKey::function_call_access(contract.id(), &["execute"], Some(TEN_NEAR)),
        )
        .transact()
        .await?;
    assert!(add_key_res.is_success(), "Expected add_key to succeed");

    // Use the session key to perform the *first* write with 0 attached deposit.
    let mut alice_session = alice.clone();
    alice_session.set_secret_key(session_sk);

    let res = alice_session
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "profile/name": "Alice via session key (platform sponsored)"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Expected first set to succeed with 0 deposit via session key when platform pool is funded"
    );

    // Verify the platform sponsorship flag is enabled for the user.
    let storage: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": alice.id()}))
        .await?
        .json()?;
    let is_sponsored = storage
        .get("platform_sponsored")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    assert!(
        is_sponsored,
        "Expected user to become platform_sponsored after first write"
    );

    Ok(())
}

// =============================================================================
// Key Permission Edge Cases
// =============================================================================

#[tokio::test]
async fn test_key_permission_invalid_level_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer_pk = relayer_sk.public_key();

    // Attempt to grant FULL_ACCESS (0xFF) - should be rejected
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 255, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(!res.is_success(), "FULL_ACCESS level should be rejected");

    // Attempt to grant an undefined level (e.g., 100) - should be rejected
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 100, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "Undefined permission level should be rejected"
    );

    Ok(())
}

/// Tests that NEAR balance is not lost when set_key_permission fails.
/// Failed transactions are atomically rolled back by NEAR, so attached deposit returns to caller.
#[tokio::test]
async fn test_key_permission_error_near_balance_preserved() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer_pk = relayer_sk.public_key();

    // Check Alice's NEAR balance before the failing call
    let near_balance_before = alice.view_account().await?.balance;

    // Attempt to grant an invalid level (255) with deposit attached
    let deposit_amount = ONE_NEAR;
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 255, "expires_at": null }
            }
        }))
        .deposit(deposit_amount)
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;

    // Operation should fail
    assert!(!res.is_success(), "Invalid level should be rejected");

    // Check Alice's NEAR balance after the failing call
    let near_balance_after = alice.view_account().await?.balance;

    // NEAR spent should only be gas, not the full deposit (because tx failed, deposit returns)
    let near_spent = near_balance_before.as_yoctonear() - near_balance_after.as_yoctonear();
    let gas_cost_upper_bound = NearToken::from_millinear(10).as_yoctonear(); // ~0.01 NEAR max gas

    assert!(
        near_spent < gas_cost_upper_bound,
        "Failed transaction should not transfer deposit. NEAR spent: {} yocto (expected < {} for gas only)",
        near_spent,
        gas_cost_upper_bound
    );

    // Verify storage balance was NOT credited (because state rolled back)
    let balance: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": alice.id()}))
        .await?
        .json()?;
    let available = balance
        .get("available")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u128>().ok())
        .unwrap_or(0);
    assert_eq!(available, 0, "Storage balance should be 0 (tx rolled back)");

    Ok(())
}

#[tokio::test]
async fn test_key_permission_expired_blocks_access() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer_id = unique_account_id("relayer")?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer = worker
        .create_tla(relayer_id.clone(), relayer_sk.clone())
        .await?
        .into_result()?;
    let relayer_pk = relayer_sk.public_key();

    // Pre-deposit storage for Alice
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success());

    // Grant permission with an already-expired timestamp (1 nanosecond in the past is fine,
    // but we use 1 which is epoch + 1ns, definitely in the past)
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 1, "expires_at": "1" }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Grant with past expiry should succeed (storage write)"
    );

    // Relayer attempts to use expired permission - should fail
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/name": "Should fail - expired"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "Expired key permission should block access"
    );

    Ok(())
}

#[tokio::test]
async fn test_key_permission_view_methods() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer_pk = relayer_sk.public_key();

    // Pre-deposit storage for Alice
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success());

    // Before grant: get_key_permissions should return 0
    let level: u8 = contract
        .view("get_key_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "public_key": relayer_pk,
            "path": "profile/"
        }))
        .await?
        .json()?;
    assert_eq!(level, 0, "Should return 0 before grant");

    // Before grant: has_key_permission should return false
    let has_perm: bool = contract
        .view("has_key_permission")
        .args_json(json!({
            "owner": alice.id(),
            "public_key": relayer_pk,
            "path": "profile/",
            "required_level": 1
        }))
        .await?
        .json()?;
    assert!(!has_perm, "Should return false before grant");

    // Grant WRITE (level=1)
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success());

    // After grant: get_key_permissions should return 1
    let level: u8 = contract
        .view("get_key_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "public_key": relayer_pk,
            "path": "profile/"
        }))
        .await?
        .json()?;
    assert_eq!(level, 1, "Should return 1 after WRITE grant");

    // After grant: has_key_permission(WRITE) should return true
    let has_perm: bool = contract
        .view("has_key_permission")
        .args_json(json!({
            "owner": alice.id(),
            "public_key": relayer_pk,
            "path": "profile/",
            "required_level": 1
        }))
        .await?
        .json()?;
    assert!(has_perm, "Should return true for WRITE after grant");

    // After grant: has_key_permission(MANAGE=3) should return false
    let has_manage: bool = contract
        .view("has_key_permission")
        .args_json(json!({
            "owner": alice.id(),
            "public_key": relayer_pk,
            "path": "profile/",
            "required_level": 3
        }))
        .await?
        .json()?;
    assert!(!has_manage, "WRITE should not satisfy MANAGE requirement");

    Ok(())
}

#[tokio::test]
async fn test_key_permission_hierarchy_parent_grants_child() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer_id = unique_account_id("relayer")?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer = worker
        .create_tla(relayer_id.clone(), relayer_sk.clone())
        .await?
        .into_result()?;
    let relayer_pk = relayer_sk.public_key();

    // Pre-deposit storage for Alice
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success());

    // Grant WRITE to parent path "profile/"
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success());

    // Should be able to write to child path "profile/bio"
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/bio": "Hello from relayer"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Parent path permission should grant child path access"
    );

    // Should NOT be able to write to sibling path "settings/theme"
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "settings/theme": "dark"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "Permission on profile/ should not grant settings/ access"
    );

    Ok(())
}

// =============================================================================
// Additional Edge Case Tests for has_permissions_or_key_for_actor fallback
// =============================================================================

/// Test: has_permissions_or_key_for_actor fallback - when account permission fails, key permission is checked.
/// Covers: has_permissions_or_key_for_actor() in key_permissions.rs
///
/// Scenario:
/// 1. Bob has NO account-level permission to write to Alice's data
/// 2. Relayer's PUBLIC KEY has WRITE permission to Alice's profile/
/// 3. Relayer (using that key) can write to Alice via set(request) because key fallback succeeds
/// 4. If we revoke the key permission, relayer fails (no account perm, no key perm)
#[tokio::test]
async fn test_has_permissions_or_key_for_actor_fallback() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Create relayer with known key
    let relayer_id = unique_account_id("relayer")?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer = worker
        .create_tla(relayer_id.clone(), relayer_sk.clone())
        .await?
        .into_result()?;
    let relayer_pk = relayer_sk.public_key();

    // Pre-deposit storage for Alice
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "Storage deposit should succeed");

    // Verify relayer has NO account permission (this is the default)
    // Attempt should fail - neither account perm nor key perm exists yet.
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/name": "Should fail"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "Should fail - no account perm, no key perm"
    );

    // Grant KEY permission (not account permission) to relayer's public key
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "set_key_permission should succeed");

    // Now relayer should succeed via KEY fallback (account check fails, key check passes)
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/name": "Alice via key fallback"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Should succeed via key permission fallback"
    );

    // Revoke the key permission
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk, "path": "profile/", "level": 0, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "Revoke key permission should succeed");

    // Now relayer should fail again (no account perm, no key perm)
    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/name": "Should fail again"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "Should fail after key permission revoked"
    );

    Ok(())
}

/// Test: Account permission takes precedence - if account permission exists, key is not needed.
/// Covers: has_permissions_or_key_for_actor() short-circuit on account permission success
#[tokio::test]
async fn test_account_permission_takes_precedence_over_key() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Pre-deposit storage for Alice
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "Storage deposit should succeed");

    // Grant ACCOUNT permission to Bob (not key permission)
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": bob.id(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission should succeed");

    // Bob can write via account permission (no key permission needed)
    let res = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": {
                    "profile/name": "Alice via Bob's account permission"
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "Should succeed via account permission");

    Ok(())
}

/// Tests that set_key_permission is scoped to caller's namespace.
/// Key permissions granted by Alice only authorize writes to Alice's paths,
/// not to other users' paths even if the path string references them.
#[tokio::test]
async fn test_key_permission_scoped_to_caller_namespace() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer_pk = relayer_sk.public_key();

    // Pre-deposit storage for both users
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success());

    let res = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success());

    // Alice grants key permission for her profile/ path
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Alice should be able to grant key permission for her path"
    );

    // Verify the key permission exists for Alice's namespace
    let has_key_perm: bool = contract
        .view("has_key_permission")
        .args_json(json!({
            "owner": alice.id(),
            "public_key": relayer_pk.clone(),
            "path": format!("{}/profile/", alice.id()),
            "required_level": 1
        }))
        .await?
        .json()?;
    assert!(
        has_key_perm,
        "Key permission should exist for Alice's namespace"
    );

    // Verify the key permission does NOT exist for Bob's namespace
    let has_key_perm_bob: bool = contract
        .view("has_key_permission")
        .args_json(json!({
            "owner": bob.id(),
            "public_key": relayer_pk.clone(),
            "path": format!("{}/profile/", bob.id()),
            "required_level": 1
        }))
        .await?
        .json()?;
    assert!(
        !has_key_perm_bob,
        "Key permission should NOT exist for Bob's namespace"
    );

    Ok(())
}

// =============================================================================
// Event Emission Tests for Key Permissions
// =============================================================================

/// Tests that grant_key and revoke_key operations emit proper PERMISSION_UPDATE events.
/// Covers: Event emission in grant_permissions_to_key() and revoke_permissions_for_key()
#[tokio::test]
async fn test_key_permission_events_emit_correctly() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer_pk = relayer_sk.public_key();

    // Pre-deposit storage for Alice
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "Storage deposit should succeed");

    // Grant key permission and check for grant_key event
    let grant_res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        grant_res.is_success(),
        "Grant key permission should succeed"
    );

    // Verify PERMISSION_UPDATE grant_key event was emitted
    let grant_logs: Vec<String> = grant_res.logs().iter().map(|s| s.to_string()).collect();
    let grant_event = grant_logs.iter().find(|log| {
        log.contains("PERMISSION_UPDATE") && log.contains("\"operation\":\"grant_key\"")
    });
    assert!(
        grant_event.is_some(),
        "Should emit PERMISSION_UPDATE grant_key event. Logs: {:?}",
        grant_logs
    );

    // Verify event contains expected fields
    let grant_event_str = grant_event.unwrap();
    assert!(
        grant_event_str.contains("\"public_key\""),
        "grant_key event should contain public_key field"
    );
    assert!(
        grant_event_str.contains("\"level\":\"1\"") || grant_event_str.contains("\"level\":1"),
        "grant_key event should contain level field"
    );
    assert!(
        grant_event_str.contains("\"path\""),
        "grant_key event should contain path field"
    );

    // Revoke key permission (level=0) and check for revoke_key event
    let revoke_res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk.clone(), "path": "profile/", "level": 0, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        revoke_res.is_success(),
        "Revoke key permission should succeed"
    );

    // Verify PERMISSION_UPDATE revoke_key event was emitted
    let revoke_logs: Vec<String> = revoke_res.logs().iter().map(|s| s.to_string()).collect();
    let revoke_event = revoke_logs.iter().find(|log| {
        log.contains("PERMISSION_UPDATE") && log.contains("\"operation\":\"revoke_key\"")
    });
    assert!(
        revoke_event.is_some(),
        "Should emit PERMISSION_UPDATE revoke_key event. Logs: {:?}",
        revoke_logs
    );

    // Verify revoke event contains expected fields
    let revoke_event_str = revoke_event.unwrap();
    assert!(
        revoke_event_str.contains("\"public_key\""),
        "revoke_key event should contain public_key field"
    );
    assert!(
        revoke_event_str.contains("\"deleted\""),
        "revoke_key event should contain deleted field"
    );
    // Since we granted first, deleted should be true
    assert!(
        revoke_event_str.contains("\"deleted\":true")
            || revoke_event_str.contains("\"deleted\":\"true\""),
        "revoke_key event should have deleted=true when entry existed"
    );

    Ok(())
}

/// Tests that revoking a non-existent key permission emits event with deleted=false.
/// Covers: revoke_permissions_for_key() branch when no entry exists
#[tokio::test]
async fn test_revoke_nonexistent_key_permission_emits_deleted_false() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer_sk = SecretKey::from_random(KeyType::ED25519);
    let relayer_pk = relayer_sk.public_key();

    // Pre-deposit storage for Alice
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "Storage deposit should succeed");

    // Revoke key permission that was NEVER granted (no entry exists)
    let revoke_res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": relayer_pk.clone(), "path": "profile/", "level": 0, "expires_at": null }
            }
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        revoke_res.is_success(),
        "Revoke non-existent key permission should succeed"
    );

    // Verify PERMISSION_UPDATE revoke_key event was emitted with deleted=false
    let revoke_logs: Vec<String> = revoke_res.logs().iter().map(|s| s.to_string()).collect();
    let revoke_event = revoke_logs.iter().find(|log| {
        log.contains("PERMISSION_UPDATE") && log.contains("\"operation\":\"revoke_key\"")
    });
    assert!(
        revoke_event.is_some(),
        "Should emit PERMISSION_UPDATE revoke_key event even for non-existent permission. Logs: {:?}",
        revoke_logs
    );

    // Verify deleted=false since no entry existed to delete
    let revoke_event_str = revoke_event.unwrap();
    assert!(
        revoke_event_str.contains("\"deleted\":false")
            || revoke_event_str.contains("\"deleted\":\"false\""),
        "revoke_key event should have deleted=false when no entry existed. Event: {}",
        revoke_event_str
    );

    // Verify key permission still doesn't exist (idempotent behavior)
    let has_perm: bool = contract
        .view("has_key_permission")
        .args_json(json!({
            "owner": alice.id(),
            "public_key": relayer_pk,
            "path": "profile/",
            "required_level": 1
        }))
        .await?
        .json()?;
    assert!(
        !has_perm,
        "Key permission should still not exist after revoking non-existent"
    );

    Ok(())
}
