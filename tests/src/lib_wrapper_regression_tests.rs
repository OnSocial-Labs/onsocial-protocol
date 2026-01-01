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
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    "storage/deposit": { "amount": ONE_NEAR.as_yoctonear().to_string() }
                },
                "options": null,
                "event_config": null,
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
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": owner_path,
            "level": 1,
            "expires_at": null
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
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": format!("{}/profile/", alice.id()),
            "level": 1,
            "expires_at": null
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
