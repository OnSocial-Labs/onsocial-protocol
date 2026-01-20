// =============================================================================
// Group Pool Deposit Integration Tests
// =============================================================================
// Tests for storage/group_pool_deposit operation in group_pool.rs
//
// Run with:
//   cargo test -p onsocial-integration-tests group_pool_deposit_tests -- --test-threads=1

use near_workspaces::types::{Gas, NearToken};
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

    contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;

    contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn create_user(root: &Account, name: &str, balance: NearToken) -> anyhow::Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(balance)
        .transact()
        .await?
        .into_result()?)
}

async fn create_group(contract: &Contract, owner: &Account, group_id: &str) -> anyhow::Result<()> {
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "create_group", "group_id": group_id, "config": { "is_private": false } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res.is_success(), "create_group should succeed: {:?}", res.failures());
    Ok(())
}

async fn add_member(contract: &Contract, owner: &Account, group_id: &str, member: &Account) -> anyhow::Result<()> {
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "add_group_member", "group_id": group_id, "member_id": member.id() }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res.is_success(), "add_group_member should succeed: {:?}", res.failures());
    Ok(())
}

fn parse_u128_string(v: &serde_json::Value, key: &str) -> u128 {
    match v.get(key) {
        Some(serde_json::Value::String(s)) => s.parse::<u128>().unwrap_or(0),
        Some(serde_json::Value::Number(n)) => n.as_u64().unwrap_or(0) as u128,
        _ => 0,
    }
}

// =============================================================================
// Critical: Authorization Tests
// =============================================================================

#[tokio::test]
async fn test_group_pool_deposit_non_owner_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let non_owner = create_user(&root, "nonowner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    let deposit_amount = NearToken::from_near(1);
    let res = non_owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": deposit_amount.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(deposit_amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_failure(), "Expected non-owner deposit to fail");
    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("Unauthorized") || failure_msg.contains("group_pool_deposit"),
        "Expected authorization error, got: {}", failure_msg
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_deposit_insufficient_attached_balance_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    let deposit_amount = NearToken::from_near(5);
    let attached_amount = NearToken::from_near(1);
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": deposit_amount.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(attached_amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_failure(), "Expected insufficient deposit to fail");
    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("Insufficient deposit for group pool"),
        "Expected 'Insufficient deposit for group pool' error, got: {}", failure_msg
    );

    Ok(())
}

// =============================================================================
// High: Input Validation Tests
// =============================================================================

#[tokio::test]
async fn test_group_pool_deposit_missing_group_id_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let deposit_amount = NearToken::from_near(1);
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "amount": deposit_amount.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(deposit_amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_failure(), "Expected missing group_id to fail");
    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("group_id required"),
        "Expected 'group_id required' error, got: {}", failure_msg
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_deposit_missing_amount_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_failure(), "Expected missing amount to fail");
    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("amount required"),
        "Expected 'amount required' error, got: {}", failure_msg
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_deposit_zero_amount_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": "0"
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_failure(), "Expected zero amount to fail");
    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("Minimum pool deposit"),
        "Expected 'Minimum pool deposit' error, got: {}", failure_msg
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_deposit_below_minimum_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    // Try to deposit 0.05 NEAR (below ~0.1 NEAR / 10KB minimum)
    let below_min = NearToken::from_millinear(50);
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": below_min.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(below_min)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_failure(), "Expected below-minimum deposit to fail");
    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("Minimum pool deposit"),
        "Expected 'Minimum pool deposit' error, got: {}", failure_msg
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_deposit_nonexistent_group_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let deposit_amount = NearToken::from_near(1);
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": "nonexistent",
                        "amount": deposit_amount.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(deposit_amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_failure(), "Expected nonexistent group to fail");
    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("not found") || failure_msg.contains("Group"),
        "Expected group not found error, got: {}", failure_msg
    );

    Ok(())
}

// =============================================================================
// Medium: State Transitions and Events
// =============================================================================

#[tokio::test]
async fn test_group_pool_deposit_emits_created_event_on_first_deposit() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    let deposit_amount = NearToken::from_near(1);
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": deposit_amount.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(deposit_amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_success(), "Expected first deposit to succeed: {:?}", res.failures());

    let logs = res.logs();
    let has_created_event = logs.iter().any(|l| l.contains("group_pool_created"));
    assert!(
        has_created_event,
        "Expected group_pool_created event on first deposit. Logs: {:?}",
        logs
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_deposit_emits_deposit_event_with_correct_fields() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    let deposit_amount = NearToken::from_near(1);
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": deposit_amount.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(deposit_amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_success(), "Expected deposit to succeed: {:?}", res.failures());

    let logs = res.logs();
    let deposit_event = logs.iter().find(|l| l.contains("group_pool_deposit"));
    assert!(deposit_event.is_some(), "Expected group_pool_deposit event. Logs: {:?}", logs);

    let event_log = deposit_event.unwrap();
    assert!(event_log.contains("group_id"), "Event should contain group_id field");
    assert!(event_log.contains("pool_key"), "Event should contain pool_key field");
    assert!(event_log.contains("amount"), "Event should contain amount field");
    assert!(event_log.contains("previous_pool_balance"), "Event should contain previous_pool_balance field");
    assert!(event_log.contains("new_pool_balance"), "Event should contain new_pool_balance field");

    Ok(())
}

#[tokio::test]
async fn test_group_pool_deposit_updates_pool_balance_correctly() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    let deposit_amount = NearToken::from_near(2);
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": deposit_amount.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(deposit_amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(res.is_success(), "Expected deposit to succeed: {:?}", res.failures());

    let pool_info: serde_json::Value = contract
        .view("get_group_pool_info")
        .args_json(json!({"group_id": group_id}))
        .await?
        .json()?;

    let storage_balance = parse_u128_string(&pool_info, "storage_balance");
    assert_eq!(
        storage_balance,
        deposit_amount.as_yoctonear(),
        "Expected pool storage_balance to equal deposited amount"
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_deposit_multiple_deposits_accumulate() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    let first_deposit = NearToken::from_near(1);
    let res1 = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": first_deposit.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(first_deposit)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res1.is_success(), "First deposit should succeed: {:?}", res1.failures());

    let second_deposit = NearToken::from_near(2);
    let res2 = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": second_deposit.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(second_deposit)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res2.is_success(), "Second deposit should succeed: {:?}", res2.failures());

    let logs2 = res2.logs();
    let has_created_event = logs2.iter().any(|l| l.contains("group_pool_created"));
    assert!(
        !has_created_event,
        "Should NOT emit group_pool_created on subsequent deposits. Logs: {:?}",
        logs2
    );

    let pool_info: serde_json::Value = contract
        .view("get_group_pool_info")
        .args_json(json!({"group_id": group_id}))
        .await?
        .json()?;

    let storage_balance = parse_u128_string(&pool_info, "storage_balance");
    let expected_total = first_deposit.as_yoctonear() + second_deposit.as_yoctonear();
    assert_eq!(
        storage_balance,
        expected_total,
        "Expected pool storage_balance to be sum of all deposits"
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_deposit_manager_with_manage_permission_succeeds() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let manager = create_user(&root, "manager", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &manager).await?;

    let permission_path = format!("{}/groups/{}/config", owner.id(), group_id);
    let grant_res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "permission/grant": {
                        "grantee": manager.id().to_string(),
                        "path": permission_path,
                        "level": 3
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(grant_res.is_success(), "Grant MANAGE permission should succeed: {:?}", grant_res.failures());

    let deposit_amount = NearToken::from_near(1);
    let res = manager
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": deposit_amount.as_yoctonear().to_string()
                    }
                } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(deposit_amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;

    assert!(
        res.is_success(),
        "Manager with MANAGE permission should be able to deposit: {:?}",
        res.failures()
    );

    Ok(())
}
