use anyhow::Result;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};

use crate::utils::{get_wasm_path, setup_sandbox};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

async fn deploy_and_init(worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>) -> Result<Contract> {
    let wasm_path = get_wasm_path("core-onsocial");
    let wasm = std::fs::read(std::path::Path::new(&wasm_path))?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;
    contract
        .call("activate_contract")
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn create_user(root: &Account, name: &str, balance: NearToken) -> Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(balance)
        .transact()
        .await?
        .into_result()?)
}

fn find_event_data<S: AsRef<str>>(logs: &[S], operation: &str, reason: &str) -> Option<Value> {
    for log in logs {
        let log = log.as_ref();
        if !log.starts_with("EVENT_JSON:") {
            continue;
        }
        let json_str = &log["EVENT_JSON:".len()..];
        let event: Value = serde_json::from_str(json_str).ok()?;
        let data0 = event.get("data")?.get(0)?;
        if data0.get("operation")?.as_str()? == operation
            && data0.get("reason")?.as_str()? == reason
        {
            return Some(data0.clone());
        }
    }
    None
}

fn parse_u128_str(s: &str) -> Option<u128> {
    if let Ok(v) = s.parse::<u128>() {
        return Some(v);
    }

    // Handle scientific notation emitted by serde_json for very large numbers (e.g. "1e24").
    let (mantissa, exp_str) = s.split_once('e').or_else(|| s.split_once('E'))?;
    if mantissa.contains('.') || mantissa.contains('+') || mantissa.contains('-') {
        return None;
    }
    let base: u128 = mantissa.parse().ok()?;
    let exp: u32 = exp_str.parse().ok()?;
    let pow10 = 10u128.checked_pow(exp)?;
    base.checked_mul(pow10)
}

fn parse_u128_value(v: &Value) -> Option<u128> {
    match v {
        Value::String(s) => parse_u128_str(s),
        Value::Number(n) => parse_u128_str(&n.to_string()),
        _ => None,
    }
}

fn storage_balance_yocto(storage_json: &Value) -> u128 {
    match storage_json.get("balance") {
        Some(v) => parse_u128_value(v).unwrap_or(0),
        _ => 0,
    }
}

#[tokio::test]
async fn test_set_permission_saves_unused_attached_deposit_to_storage_balance() -> Result<()> {
    let worker = setup_sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    // Pre-deposit storage so the permission write is paid from user balance,
    // not from the attached deposit of the permission call.
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/deposit": { "amount": ONE_NEAR.as_yoctonear().to_string() }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?
        .into_result()?;

    // First grant: creates the permission entry (may consume some storage balance).
    let owner_path = format!("{}/profile/", alice.id());
    alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": bob.id(), "path": owner_path, "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(140))
        .transact()
        .await?
        .into_result()?;

    let before: Value = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    assert!(
        !before.is_null(),
        "expected get_storage_balance to be non-null after storage deposit"
    );
    let before_balance = storage_balance_yocto(&before);
    let before_used_bytes = before
        .get("used_bytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    // Repeat the exact same grant, but attach a deposit. This should not increase
    // storage usage, so the attached deposit should be fully unused and saved.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": bob.id(), "path": format!("{}/profile/", alice.id()), "level": 1, "expires_at": null }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission should succeed: {:?}", res.failures());

    let logs = res.logs();
    let data0 = find_event_data(&logs, "auto_deposit", "unused_deposit_saved")
        .expect("expected auto_deposit event with reason=unused_deposit_saved");
    let amount: u128 = data0
        .get("amount")
        .and_then(parse_u128_value)
        .expect("auto_deposit event should include numeric amount");
    assert_eq!(amount, ONE_NEAR.as_yoctonear(), "expected full attached deposit to be saved");

    let after: Value = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    assert!(!after.is_null(), "expected storage balance to exist after set_permission");
    let after_balance = storage_balance_yocto(&after);
    let after_used_bytes = after
        .get("used_bytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    assert_eq!(
        after_used_bytes, before_used_bytes,
        "expected no storage growth on idempotent set_permission"
    );

    assert_eq!(
        after_balance,
        before_balance.saturating_add(amount),
        "expected storage balance to increase by exactly the saved amount; before={before:?}, after={after:?}"
    );

    Ok(())
}

#[tokio::test]
async fn test_get_group_pool_info_invalid_group_id_returns_null_not_panic() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_and_init(&worker).await?;

    // Must not panic on invalid group_id input.
    let v: Value = contract
        .view("get_group_pool_info")
        .args_json(json!({ "group_id": "!!!" }))
        .await?
        .json()?;

    assert!(v.is_null(), "expected null for invalid group_id, got: {v:?}");
    Ok(())
}

/// Test: set is blocked in ReadOnly mode
/// 
/// Validates that the `set` entry point correctly rejects writes
/// when the contract is in ReadOnly state (via require_live_state guard).
#[tokio::test]
async fn test_set_blocked_in_readonly_mode() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_and_init(&worker).await?;
    let root = worker.root_account()?;
    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Enter ReadOnly mode (manager = contract account after deploy_and_init)
    let enter_ro = contract
        .call("enter_read_only")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(enter_ro.is_success(), "enter_read_only should succeed: {:?}", enter_ro.failures());

    // Attempt to call set - should fail with ContractReadOnly
    let set_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "profile/name": "Alice"  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(
        !set_result.is_success(),
        "set should fail in ReadOnly mode"
    );

    // Verify error message contains ReadOnly indication
    let failures = format!("{:?}", set_result.failures());
    assert!(
        failures.contains("ReadOnly") || failures.contains("read-only") || failures.contains("ContractReadOnly"),
        "Error should indicate contract is read-only, got: {failures}"
    );

    Ok(())
}

/// Test: set is blocked in Genesis mode (before activation)
/// 
/// Validates that the `set` entry point correctly rejects writes
/// when the contract has not been activated yet.
#[tokio::test]
async fn test_set_blocked_in_genesis_mode() -> Result<()> {
    let worker = setup_sandbox().await?;

    // Deploy but do NOT activate
    let wasm_path = get_wasm_path("core-onsocial");
    let wasm = std::fs::read(std::path::Path::new(&wasm_path))?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;
    // NOTE: No activate_contract call - contract remains in Genesis mode

    let root = worker.root_account()?;
    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Attempt to call set - should fail
    let set_result = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "profile/name": "Alice"  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(
        !set_result.is_success(),
        "set should fail in Genesis mode (before activation)"
    );

    Ok(())
}

/// Test: get_platform_pool returns None when pool doesn't exist
/// 
/// Validates that get_platform_pool gracefully returns null
/// when no platform pool deposit has been made.
#[tokio::test]
async fn test_get_platform_pool_returns_null_when_empty() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_and_init(&worker).await?;

    // Query platform pool before any deposits
    let v: Value = contract
        .view("get_platform_pool")
        .args_json(json!({}))
        .await?
        .json()?;

    assert!(v.is_null(), "expected null for empty platform pool, got: {v:?}");
    Ok(())
}

/// Test: get_platform_allowance returns defaults for non-existent account
/// 
/// Validates that get_platform_allowance returns sensible defaults
/// (zero allowance, not sponsored) for accounts that have never interacted.
#[tokio::test]
async fn test_get_platform_allowance_nonexistent_account() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_and_init(&worker).await?;

    // Query platform allowance for an account that doesn't exist
    let v: Value = contract
        .view("get_platform_allowance")
        .args_json(json!({ "account_id": "nonexistent.near" }))
        .await?
        .json()?;

    // Should return structured response with zero/false values
    assert!(!v.is_null(), "expected structured response, not null");
    assert_eq!(
        v.get("current_allowance").and_then(|x| x.as_u64()),
        Some(0),
        "expected zero allowance for nonexistent account"
    );
    assert_eq!(
        v.get("is_platform_sponsored").and_then(|x| x.as_bool()),
        Some(false),
        "expected not sponsored for nonexistent account"
    );
    assert!(
        v.get("first_write_ns").map(|x| x.is_null()).unwrap_or(true),
        "expected null first_write_ns for nonexistent account"
    );

    Ok(())
}

/// Test: get_storage_balance returns None for unknown account
/// 
/// Validates that get_storage_balance gracefully returns null
/// for accounts that have never deposited storage.
#[tokio::test]
async fn test_get_storage_balance_unknown_account_returns_null() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_and_init(&worker).await?;

    let v: Value = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": "unknown.near" }))
        .await?
        .json()?;

    assert!(v.is_null(), "expected null for unknown account, got: {v:?}");
    Ok(())
}

/// Test: set succeeds after resuming from ReadOnly mode
/// 
/// Validates the full lifecycle: Live → ReadOnly → Live
/// Ensures set() works after recovery via resume_live().
#[tokio::test]
async fn test_set_succeeds_after_resume_from_readonly() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_and_init(&worker).await?;
    let root = worker.root_account()?;
    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Step 1: Confirm set works in Live mode
    let initial_set = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "profile/name": "Alice"  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(initial_set.is_success(), "set should succeed in Live mode");

    // Step 2: Enter ReadOnly mode
    let enter_ro = contract
        .call("enter_read_only")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(enter_ro.is_success(), "enter_read_only should succeed");

    // Step 3: Confirm set fails in ReadOnly
    let blocked_set = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "profile/bio": "Should fail"  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!blocked_set.is_success(), "set should fail in ReadOnly mode");

    // Step 4: Resume Live mode
    let resume = contract
        .call("resume_live")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(resume.is_success(), "resume_live should succeed");

    // Step 5: Confirm set works again
    let recovered_set = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "profile/bio": "Now it works"  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(
        recovered_set.is_success(),
        "set should succeed after resume_live: {:?}",
        recovered_set.failures()
    );

    Ok(())
}

