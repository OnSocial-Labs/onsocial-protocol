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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}  // 1 NEAR
                },
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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/name": "Alice via relayer"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(!res.is_success(), "Expected cross-account set to fail without permissions");

    // 2) Alice grants WRITE to relayer public key for her profile subtree.
    let res = alice
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 1,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected set_key_permission to succeed");

    // 3) Relayer can now write to Alice via set(request), without being Alice.
    let res = relayer
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/name": "Alice via relayer (authorized)"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected cross-account set to succeed with key permission");

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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}  // 1 NEAR
                },
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
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 1,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success());

    // Works
    let res = relayer
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/name": "ok"
                },
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
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 0,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success());

    // Fails again
    let res = relayer
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/name": "should fail"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(!res.is_success(), "Expected cross-account set to fail after revoke");

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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "profile/name": "Alice initial"
                },
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
            AccessKey::function_call_access(contract.id(), &["set"], Some(TEN_NEAR)),
        )
        .transact()
        .await?;
    assert!(add_key_res.is_success(), "Expected add_key to succeed");

    // Use the new key to sign calls.
    let mut alice_session = alice.clone();
    alice_session.set_secret_key(session_sk);

    // Allowed: `set` (writing on her own account paths).
    let res = alice_session
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "profile/name": "Alice via session key"
                },
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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "profile/name": "should fail (deposit)"
                },
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

    // Not allowed: other call methods (not whitelisted on the function-call access key).
    let res = alice_session
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": session_pk,
            "path": "profile/",
            "level": 1,
            "expires_at": null
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await;
    assert!(
        res.is_err() || !res.as_ref().expect("checked is_err").is_success(),
        "Expected non-whitelisted call to fail with set-only access key"
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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "storage/platform_pool_deposit": { "amount": fund_amount.as_yoctonear().to_string() }
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(fund_amount)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected platform pool funding to succeed");

    // Fresh user with no storage pre-allocation.
    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Add a session key that can only call `set`.
    let session_sk = SecretKey::from_random(KeyType::ED25519);
    let session_pk = session_sk.public_key();
    let add_key_res = alice
        .batch(alice.id())
        .add_key(
            session_pk,
            AccessKey::function_call_access(contract.id(), &["set"], Some(TEN_NEAR)),
        )
        .transact()
        .await?;
    assert!(add_key_res.is_success(), "Expected add_key to succeed");

    // Use the session key to perform the *first* write with 0 attached deposit.
    let mut alice_session = alice.clone();
    alice_session.set_secret_key(session_sk);

    let res = alice_session
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "profile/name": "Alice via session key (platform sponsored)"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected first set to succeed with 0 deposit via session key when platform pool is funded");

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
    assert!(is_sponsored, "Expected user to become platform_sponsored after first write");

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
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 255,  // FULL_ACCESS = 0xFF
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(!res.is_success(), "FULL_ACCESS level should be rejected");

    // Attempt to grant an undefined level (e.g., 100) - should be rejected
    let res = alice
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 100,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(!res.is_success(), "Undefined permission level should be rejected");

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
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 255,  // Invalid: FULL_ACCESS
            "expires_at": null
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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                },
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
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 1,
            "expires_at": "1"  // Expired at 1 nanosecond since epoch
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "Grant with past expiry should succeed (storage write)");

    // Relayer attempts to use expired permission - should fail
    let res = relayer
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/name": "Should fail - expired"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(!res.is_success(), "Expired key permission should block access");

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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                },
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
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 1,
            "expires_at": null
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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                },
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
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 1,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success());

    // Should be able to write to child path "profile/bio"
    let res = relayer
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/bio": "Hello from relayer"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "Parent path permission should grant child path access");

    // Should NOT be able to write to sibling path "settings/theme"
    let res = relayer
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "settings/theme": "dark"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(!res.is_success(), "Permission on profile/ should not grant settings/ access");

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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                },
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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/name": "Should fail"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(!res.is_success(), "Should fail - no account perm, no key perm");

    // Grant KEY permission (not account permission) to relayer's public key
    let res = alice
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 1,  // WRITE
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "set_key_permission should succeed");

    // Now relayer should succeed via KEY fallback (account check fails, key check passes)
    let res = relayer
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/name": "Alice via key fallback"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "Should succeed via key permission fallback");

    // Revoke the key permission
    let res = alice
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "profile/",
            "level": 0,  // NONE - revoke
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "Revoke key permission should succeed");

    // Now relayer should fail again (no account perm, no key perm)
    let res = relayer
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/name": "Should fail again"
                },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(!res.is_success(), "Should fail after key permission revoked");

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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "storage/deposit": {"amount": "1000000000000000000000000"}
                },
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
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "profile/",
            "level": 1,  // WRITE
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission should succeed");

    // Bob can write via account permission (no key permission needed)
    let res = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "profile/name": "Alice via Bob's account permission"
                },
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
