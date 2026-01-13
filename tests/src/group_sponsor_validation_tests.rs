// =============================================================================
// Group Sponsor Validation Integration Tests
// =============================================================================
// Covers input validation and access control for group_sponsor_quota_set and
// group_sponsor_default_set APIs.
//
// Run with:
//   cargo test -p onsocial-integration-tests group_sponsor_validation_tests -- --test-threads=1

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

// =============================================================================
// Critical: Missing required field `enabled` causes failure
// =============================================================================

#[tokio::test]
async fn test_group_sponsor_quota_set_missing_enabled_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let target = create_user(&root, "target", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    // Missing `enabled` field - should fail after fix
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_quota_set": {
                        "group_id": group_id,
                        "target_id": target.id().to_string(),
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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

    assert!(
        res.is_failure(),
        "Expected group_sponsor_quota_set to fail when `enabled` is missing"
    );

    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("enabled required"),
        "Expected error message to mention 'enabled required', got: {}",
        failure_msg
    );

    Ok(())
}

#[tokio::test]
async fn test_group_sponsor_default_set_missing_enabled_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    // Missing `enabled` field - should fail after fix
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_default_set": {
                        "group_id": group_id,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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

    assert!(
        res.is_failure(),
        "Expected group_sponsor_default_set to fail when `enabled` is missing"
    );

    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("enabled required"),
        "Expected error message to mention 'enabled required', got: {}",
        failure_msg
    );

    Ok(())
}

// =============================================================================
// Critical: Non-owner/non-manager cannot set quota (access control)
// =============================================================================

#[tokio::test]
async fn test_group_sponsor_quota_set_unauthorized_user_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let stranger = create_user(&root, "stranger", TEN_NEAR).await?;
    let target = create_user(&root, "target", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    // Stranger (not owner, not manager) tries to set quota - should fail
    let res = stranger
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_quota_set": {
                        "group_id": group_id,
                        "target_id": target.id().to_string(),
                        "enabled": true,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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

    assert!(
        res.is_failure(),
        "Expected group_sponsor_quota_set to fail for unauthorized user"
    );

    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("Unauthorized"),
        "Expected Unauthorized error, got: {}",
        failure_msg
    );

    Ok(())
}

#[tokio::test]
async fn test_group_sponsor_default_set_unauthorized_user_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let stranger = create_user(&root, "stranger", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    // Stranger (not owner, not manager) tries to set default - should fail
    let res = stranger
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_default_set": {
                        "group_id": group_id,
                        "enabled": true,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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

    assert!(
        res.is_failure(),
        "Expected group_sponsor_default_set to fail for unauthorized user"
    );

    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("Unauthorized"),
        "Expected Unauthorized error, got: {}",
        failure_msg
    );

    Ok(())
}

// =============================================================================
// High: enabled=true with allowance_max_bytes=0 is rejected
// =============================================================================

#[tokio::test]
async fn test_group_sponsor_quota_set_enabled_with_zero_allowance_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let target = create_user(&root, "target", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    // enabled=true but allowance_max_bytes=0 - should fail
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_quota_set": {
                        "group_id": group_id,
                        "target_id": target.id().to_string(),
                        "enabled": true,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 0
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

    assert!(
        res.is_failure(),
        "Expected group_sponsor_quota_set to fail when enabled=true and allowance_max_bytes=0"
    );

    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("allowance_max_bytes must be greater than zero"),
        "Expected error about allowance_max_bytes, got: {}",
        failure_msg
    );

    Ok(())
}

#[tokio::test]
async fn test_group_sponsor_default_set_enabled_with_zero_allowance_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    // enabled=true but allowance_max_bytes=0 - should fail
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_default_set": {
                        "group_id": group_id,
                        "enabled": true,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 0
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

    assert!(
        res.is_failure(),
        "Expected group_sponsor_default_set to fail when enabled=true and allowance_max_bytes=0"
    );

    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("allowance_max_bytes must be greater than zero"),
        "Expected error about allowance_max_bytes, got: {}",
        failure_msg
    );

    Ok(())
}

// =============================================================================
// Medium: Non-existent group fails
// =============================================================================

#[tokio::test]
async fn test_group_sponsor_quota_set_nonexistent_group_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let target = create_user(&root, "target", TEN_NEAR).await?;

    // Group does not exist
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_quota_set": {
                        "group_id": "nonexistent",
                        "target_id": target.id().to_string(),
                        "enabled": true,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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

    assert!(
        res.is_failure(),
        "Expected group_sponsor_quota_set to fail for non-existent group"
    );

    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("Group not found"),
        "Expected 'Group not found' error, got: {}",
        failure_msg
    );

    Ok(())
}

#[tokio::test]
async fn test_group_sponsor_default_set_nonexistent_group_fails() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;

    // Group does not exist
    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_default_set": {
                        "group_id": "nonexistent",
                        "enabled": true,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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

    assert!(
        res.is_failure(),
        "Expected group_sponsor_default_set to fail for non-existent group"
    );

    let failure_msg = format!("{:?}", res.failures());
    assert!(
        failure_msg.contains("Group not found"),
        "Expected 'Group not found' error, got: {}",
        failure_msg
    );

    Ok(())
}

// =============================================================================
// Medium: Event emission correctness
// =============================================================================

#[tokio::test]
async fn test_group_sponsor_quota_set_emits_correct_event() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let target = create_user(&root, "target", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    let res = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_quota_set": {
                        "group_id": group_id,
                        "target_id": target.id().to_string(),
                        "enabled": true,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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

    assert!(res.is_success(), "group_sponsor_quota_set should succeed: {:?}", res.failures());

    let logs = res.logs();
    let has_event = logs.iter().any(|l| l.contains("group_sponsor_quota_set"));
    assert!(
        has_event,
        "Expected group_sponsor_quota_set event in logs. Logs: {:?}",
        logs
    );

    Ok(())
}

#[tokio::test]
async fn test_group_sponsor_default_set_emits_correct_event() -> anyhow::Result<()> {
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
                    "storage/group_sponsor_default_set": {
                        "group_id": group_id,
                        "enabled": true,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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

    assert!(res.is_success(), "group_sponsor_default_set should succeed: {:?}", res.failures());

    let logs = res.logs();
    let has_event = logs.iter().any(|l| l.contains("group_sponsor_default_set"));
    assert!(
        has_event,
        "Expected group_sponsor_default_set event in logs. Logs: {:?}",
        logs
    );

    Ok(())
}

// =============================================================================
// High: Disabling quota zeros allowance
// =============================================================================

#[tokio::test]
async fn test_group_sponsor_quota_set_disabled_zeros_allowance() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let target = create_user(&root, "target", TEN_NEAR).await?;

    let group_id = "testgroup";
    create_group(&contract, &owner, group_id).await?;

    // First enable with a quota
    let res1 = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_quota_set": {
                        "group_id": group_id,
                        "target_id": target.id().to_string(),
                        "enabled": true,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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
    assert!(res1.is_success(), "First quota_set should succeed: {:?}", res1.failures());

    // Now disable - allowance should be zeroed
    let res2 = owner
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": {
                    "storage/group_sponsor_quota_set": {
                        "group_id": group_id,
                        "target_id": target.id().to_string(),
                        "enabled": false,
                        "daily_refill_bytes": 1000,
                        "allowance_max_bytes": 10000
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
    assert!(res2.is_success(), "Disable quota_set should succeed: {:?}", res2.failures());

    // Verify: event should show previously_enabled=true
    let logs = res2.logs();
    let has_previously_enabled = logs.iter().any(|l| l.contains("previously_enabled") && l.contains("true"));
    assert!(
        has_previously_enabled,
        "Expected event to show previously_enabled=true. Logs: {:?}",
        logs
    );

    Ok(())
}
