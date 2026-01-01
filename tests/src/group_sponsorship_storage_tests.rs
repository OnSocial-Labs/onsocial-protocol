// =============================================================================
// Group Sponsorship Storage Integration Tests
// =============================================================================
// Covers group pool sponsorship gated by per-user quota/default policy.
// These are sandbox integration tests because they exercise the contract API
// and the end-to-end set() pipeline.
//
// Run with:
//   cargo test -p onsocial-integration-tests group_sponsorship_storage_tests -- --test-threads=1

use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract};
use serde_json::json;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

fn user_key(user: &Account, relative: &str) -> String {
    format!("{}/{}", user.id(), relative)
}

fn author_group_key(author: &Account, group_id: &str, rest: &str) -> String {
    format!("{}/groups/{}/{}", author.id(), group_id, rest)
}

fn parse_u64_field(v: &serde_json::Value, key: &str) -> u64 {
    match v.get(key) {
        Some(serde_json::Value::Number(n)) => n.as_u64().unwrap_or(0),
        Some(serde_json::Value::String(s)) => s.parse::<u64>().unwrap_or(0),
        _ => 0,
    }
}

fn load_core_onsocial_wasm() -> anyhow::Result<Vec<u8>> {
    let paths = [
        "../target/near/core_onsocial/core_onsocial.wasm",
        "target/near/core_onsocial/core_onsocial.wasm",
        "/code/target/near/core_onsocial/core_onsocial.wasm",
        "./target/near/core_onsocial/core_onsocial.wasm",
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
        .call(contract.id(), "create_group")
        .args_json(json!({
            "group_id": group_id,
            "config": { "is_private": false }
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
        .call(contract.id(), "add_group_member")
        .args_json(json!({
            "group_id": group_id,
            "member_id": member.id(),
            "level": 0
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res.is_success(), "add_group_member should succeed: {:?}", res.failures());
    Ok(())
}

async fn fund_group_pool_and_set_default_quota(
    contract: &Contract,
    owner: &Account,
    group_id: &str,
    pool_deposit: NearToken,
    allowance_max_bytes: u64,
) -> anyhow::Result<()> {
    let res = owner
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    "storage/group_pool_deposit": {
                        "group_id": group_id,
                        "amount": pool_deposit.as_yoctonear().to_string()
                    },
                    "storage/group_sponsor_default_set": {
                        "group_id": group_id,
                        "enabled": true,
                        "daily_refill_bytes": 0,
                        "allowance_max_bytes": allowance_max_bytes
                    }
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(pool_deposit)
        .gas(Gas::from_tgas(180))
        .transact()
        .await?;

    assert!(
        res.is_success(),
        "group pool deposit + default quota set should succeed: {:?}",
        res.failures()
    );

    Ok(())
}

async fn fund_platform_pool(contract: &Contract, funder: &Account, amount: NearToken) -> anyhow::Result<()> {
    let res = funder
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    "storage/platform_pool_deposit": {
                        "amount": amount.as_yoctonear().to_string()
                    }
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "platform pool deposit should succeed: {:?}",
        res.failures()
    );
    Ok(())
}

async fn deposit_personal_storage(contract: &Contract, user: &Account, amount: NearToken) -> anyhow::Result<()> {
    let res = user
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    "storage/deposit": {"amount": amount.as_yoctonear().to_string()}
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(amount)
        .gas(Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res.is_success(), "personal storage/deposit should succeed: {:?}", res.failures());
    Ok(())
}

async fn update_group_default_quota(
    contract: &Contract,
    owner: &Account,
    group_id: &str,
    allowance_max_bytes: u64,
) -> anyhow::Result<()> {
    let res = owner
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    "storage/group_sponsor_default_set": {
                        "group_id": group_id,
                        "enabled": true,
                        "daily_refill_bytes": 0,
                        "allowance_max_bytes": allowance_max_bytes
                    }
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(180))
        .transact()
        .await?;

    assert!(
        res.is_success(),
        "group_sponsor_default_set should succeed: {:?}",
        res.failures()
    );

    Ok(())
}

async fn set_member_quota_override(
    contract: &Contract,
    owner: &Account,
    group_id: &str,
    target: &Account,
    allowance_max_bytes: u64,
) -> anyhow::Result<()> {
    let res = owner
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    "storage/group_sponsor_quota_set": {
                        "group_id": group_id,
                        "target_id": target.id(),
                        "enabled": true,
                        "daily_refill_bytes": 0,
                        "allowance_max_bytes": allowance_max_bytes
                    }
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(180))
        .transact()
        .await?;
    assert!(res.is_success(), "group_sponsor_quota_set should succeed: {:?}", res.failures());
    Ok(())
}

async fn view_get_key(
    contract: &Contract,
    key: &str,
    account_id: Option<&near_workspaces::types::AccountId>,
) -> anyhow::Result<Option<serde_json::Value>> {
    let v: serde_json::Value = contract
        .view("get_one")
        .args_json(json!({
            "key": key,
            "account_id": account_id.map(|a| a.to_string())
        }))
        .await?
        .json()?;

    Ok(v.get("value").cloned().and_then(|val| (!val.is_null()).then_some(val)))
}

#[tokio::test]
async fn test_group_sponsored_delete_refund_is_bounded_and_idempotent() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    fund_group_pool_and_set_default_quota(
        &contract,
        &owner,
        group_id,
        NearToken::from_near(2),
        200_000,
    )
    .await?;

    // Write a moderately sized payload so delete produces a meaningful negative delta,
    // while staying well under NEAR log size limits (and we disable events anyway).
    let large_text = "x".repeat(4_000);
    let key = author_group_key(&member, group_id, "content/posts/to_delete");

    let write = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key.clone(): {"text": large_text}
                },
                "options": null,
                "event_config": {"emit": false},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(250))
        .transact()
        .await?;
    assert!(write.is_success(), "write should succeed: {:?}", write.failures());

    let before: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;
    let group_used_before = parse_u64_field(&before, "group_pool_used_bytes");
    assert!(group_used_before > 0, "expected group_pool_used_bytes > 0 after sponsored write, got: {before:?}");

    // Delete once: should free bytes and refund back to group pool up to usage.
    let del1 = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key.clone(): serde_json::Value::Null
                },
                "options": null,
                "event_config": {"emit": false},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(250))
        .transact()
        .await?;
    assert!(del1.is_success(), "first delete should succeed: {:?}", del1.failures());

    let after1: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;
    let group_used_after1 = parse_u64_field(&after1, "group_pool_used_bytes");
    assert!(
        group_used_after1 < group_used_before,
        "expected group_pool_used_bytes to decrease after delete (refund), before={group_used_before}, after={group_used_after1}"
    );

    // Delete again (idempotent): should NOT reduce pool usage further.
    let del2 = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key.clone(): serde_json::Value::Null
                },
                "options": null,
                "event_config": {"emit": false},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(250))
        .transact()
        .await?;
    assert!(del2.is_success(), "second delete should succeed: {:?}", del2.failures());

    let after2: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;
    let group_used_after2 = parse_u64_field(&after2, "group_pool_used_bytes");
    assert_eq!(
        group_used_after2, group_used_after1,
        "expected second delete to be idempotent for group_pool_used_bytes (bounded refund)"
    );

    Ok(())
}

#[tokio::test]
async fn test_group_default_quota_sponsors_group_write_and_emits_spend_event() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    fund_group_pool_and_set_default_quota(
        &contract,
        &owner,
        group_id,
        NearToken::from_near(2),
        50_000,
    )
    .await?;

    let key = author_group_key(&member, group_id, "content/posts/hello");

    // Member writes a group key with 0 deposit: should be covered by group pool,
    // and should emit group_sponsor_spend if event emission is enabled.
    let res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key: {"text": "hello"}
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(res.is_success(), "Expected group-sponsored write to succeed: {:?}", res.failures());

    let logs = res.logs();
    let has_spend_event = logs.iter().any(|l| l.contains("group_sponsor_spend"));
    assert!(
        has_spend_event,
        "Expected a group_sponsor_spend event when sponsorship occurs. Logs: {:?}",
        logs
    );

    Ok(())
}

#[tokio::test]
async fn test_group_default_quota_blocks_without_deposit_but_allows_attached_deposit_fallback() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    // Default quota is intentionally tiny so any meaningful write fails sponsorship.
    fund_group_pool_and_set_default_quota(
        &contract,
        &owner,
        group_id,
        NearToken::from_near(2),
        1,
    )
    .await?;

    let blocked_key = author_group_key(&member, group_id, "content/posts/blocked");
    let fallback_key = author_group_key(&member, group_id, "content/posts/fallback");

    // 1) Without deposit should fail due to quota gating.
    let blocked = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    blocked_key: {"text": "hello"}
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(blocked.is_failure(), "Expected group write to fail when quota exhausted");

    // 2) With attached deposit should succeed (fallback to user-paid storage).
    let fallback = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    fallback_key: {"text": "hello"}
                },
                "options": {"refund_unused_deposit": true},
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(fallback.is_success(), "Expected attached-deposit fallback to succeed: {:?}", fallback.failures());

    let logs = fallback.logs();
    let has_spend_event = logs.iter().any(|l| l.contains("group_sponsor_spend"));
    assert!(
        !has_spend_event,
        "Did not expect group_sponsor_spend when member paid via attached deposit. Logs: {:?}",
        logs
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_insufficient_blocks_even_when_quota_allows() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    // Default quota allows, but pool deposit is intentionally tiny so the pool has insufficient
    // bytes to cover the write. With 0 attached deposit, the operation should fail.
    fund_group_pool_and_set_default_quota(
        &contract,
        &owner,
        group_id,
        NearToken::from_millinear(1), // 0.001 NEAR
        50_000,
    )
    .await?;

    let key = author_group_key(&member, group_id, "content/posts/pool_insufficient");
    let res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key: {"text": "hello"}
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        res.is_failure(),
        "Expected group write to fail when group pool can't cover and no deposit is attached"
    );

    Ok(())
}

#[tokio::test]
async fn test_single_set_can_use_group_sponsorship_and_personal_balance() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    // Fund group pool and enable default sponsorship.
    fund_group_pool_and_set_default_quota(
        &contract,
        &owner,
        group_id,
        NearToken::from_near(2),
        50_000,
    )
    .await?;

    // Pre-fund member personal balance in a prior tx so the next tx can run with 0 attached deposit.
    let deposit_res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    "storage/deposit": {"amount": ONE_NEAR.as_yoctonear().to_string()}
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(deposit_res.is_success(), "personal storage/deposit should succeed");

    let group_key = author_group_key(&member, group_id, "content/posts/mixed");
    let profile_key = user_key(&member, "profile/name");

    // Single set call with two keys:
    // - one group content write (should be sponsored by group pool)
    // - one personal write (should be covered by member's personal balance)
    let res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    group_key: {"text": "hello"},
                    profile_key: "Member"
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(250))
        .transact()
        .await?;

    assert!(res.is_success(), "Expected mixed-source set to succeed: {:?}", res.failures());

    let logs = res.logs();
    let has_spend_event = logs.iter().any(|l| l.contains("group_sponsor_spend"));
    assert!(
        has_spend_event,
        "Expected group_sponsor_spend for the group key in the mixed-source set. Logs: {:?}",
        logs
    );

    Ok(())
}

#[tokio::test]
async fn test_group_write_uses_platform_pool_before_group_pool_when_available() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    // Make platform sponsorship realistically available.
    fund_platform_pool(&contract, &owner, NearToken::from_near(5)).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    // Group pool is also funded, but platform pool should take precedence.
    fund_group_pool_and_set_default_quota(
        &contract,
        &owner,
        group_id,
        NearToken::from_near(2),
        50_000,
    )
    .await?;

    let key = author_group_key(&member, group_id, "content/posts/platform_first");
    let res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key: {"text": "hello"}
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(220))
        .transact()
        .await?;
    assert!(res.is_success(), "Expected group write to succeed: {:?}", res.failures());

    // If platform pool paid, there should be no group_sponsor_spend event.
    let logs = res.logs();
    let has_spend_event = logs.iter().any(|l| l.contains("group_sponsor_spend"));
    assert!(
        !has_spend_event,
        "Did not expect group_sponsor_spend when platform pool covers the write. Logs: {:?}",
        logs
    );

    let storage: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;

    let platform_used = parse_u64_field(&storage, "platform_pool_used_bytes");
    let group_used = parse_u64_field(&storage, "group_pool_used_bytes");
    assert!(platform_used > 0, "Expected platform_pool_used_bytes > 0, got: {storage:?}");
    assert_eq!(
        group_used, 0,
        "Expected group_pool_used_bytes == 0 when platform pays first, got: {storage:?}"
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_exhausted_falls_back_to_personal_balance_with_zero_attached_deposit() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    // Fund group pool with an amount so small it should translate to ~0 usable bytes.
    // Default quota allows, but pool should be unable to cover the write.
    fund_group_pool_and_set_default_quota(&contract, &owner, group_id, ONE_YOCTO, 100_000).await?;

    // Pre-fund member personal balance so the group write can succeed with 0 attached deposit.
    deposit_personal_storage(&contract, &member, ONE_NEAR).await?;

    let key = author_group_key(&member, group_id, "content/posts/pool_exhausted_personal");
    let res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key: {"text": "hello"}
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(220))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Expected group write to fall back to personal balance and succeed with 0 attached deposit: {:?}",
        res.failures()
    );

    // We expect no group_sponsor_spend because the group pool can't allocate.
    let logs = res.logs();
    let has_spend_event = logs.iter().any(|l| l.contains("group_sponsor_spend"));
    assert!(
        !has_spend_event,
        "Did not expect group_sponsor_spend when group pool can't cover and personal balance pays. Logs: {:?}",
        logs
    );

    let storage: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;
    let group_used = parse_u64_field(&storage, "group_pool_used_bytes");
    assert_eq!(group_used, 0, "Expected group_pool_used_bytes == 0 when personal balance pays, got: {storage:?}");

    Ok(())
}

#[tokio::test]
async fn test_group_sponsored_update_to_smaller_refunds_group_pool_bytes() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    fund_group_pool_and_set_default_quota(&contract, &owner, group_id, NearToken::from_near(2), 200_000).await?;

    let key = author_group_key(&member, group_id, "content/posts/shrink");

    let write_big = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key.clone(): {"text": "x".repeat(1500)}
                },
                "options": null,
                "event_config": {"emit": false},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(240))
        .transact()
        .await?;
    assert!(write_big.is_success(), "big write should succeed: {:?}", write_big.failures());

    let before: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;
    let group_used_before = parse_u64_field(&before, "group_pool_used_bytes");
    assert!(group_used_before > 0, "expected group_pool_used_bytes > 0 after sponsored write, got: {before:?}");

    let write_small = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key.clone(): {"text": "small"}
                },
                "options": null,
                "event_config": {"emit": false},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(240))
        .transact()
        .await?;
    assert!(write_small.is_success(), "small write should succeed: {:?}", write_small.failures());

    let after: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;
    let group_used_after = parse_u64_field(&after, "group_pool_used_bytes");
    assert!(
        group_used_after < group_used_before,
        "expected group_pool_used_bytes to decrease after shrinking update, before={group_used_before}, after={group_used_after}"
    );

    Ok(())
}

#[tokio::test]
async fn test_group_pool_refund_is_isolated_per_payer_for_same_group() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member1 = create_user(&root, "member1", TEN_NEAR).await?;
    let member2 = create_user(&root, "member2", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member1).await?;
    add_member(&contract, &owner, group_id, &member2).await?;

    fund_group_pool_and_set_default_quota(&contract, &owner, group_id, NearToken::from_near(2), 200_000).await?;

    let key1 = author_group_key(&member1, group_id, "content/posts/by_member1");
    let key2 = author_group_key(&member2, group_id, "content/posts/by_member2");

    let w1 = member1
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key1.clone(): {"text": "x".repeat(800)}
                },
                "options": null,
                "event_config": {"emit": false},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(240))
        .transact()
        .await?;
    assert!(w1.is_success(), "member1 write should succeed");

    let w2 = member2
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key2: {"text": "x".repeat(800)}
                },
                "options": null,
                "event_config": {"emit": false},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(240))
        .transact()
        .await?;
    assert!(w2.is_success(), "member2 write should succeed");

    let s1_before: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member1.id()}))
        .await?
        .json()?;
    let s2_before: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member2.id()}))
        .await?
        .json()?;
    let m1_used_before = parse_u64_field(&s1_before, "group_pool_used_bytes");
    let m2_used_before = parse_u64_field(&s2_before, "group_pool_used_bytes");
    assert!(m1_used_before > 0, "expected member1 group_pool_used_bytes > 0, got: {s1_before:?}");
    assert!(m2_used_before > 0, "expected member2 group_pool_used_bytes > 0, got: {s2_before:?}");

    // Delete member1 content. This must not reduce member2's tracked usage.
    let d1 = member1
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key1.clone(): serde_json::Value::Null
                },
                "options": null,
                "event_config": {"emit": false},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(240))
        .transact()
        .await?;
    assert!(d1.is_success(), "member1 delete should succeed: {:?}", d1.failures());

    let s1_after: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member1.id()}))
        .await?
        .json()?;
    let s2_after: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member2.id()}))
        .await?
        .json()?;
    let m1_used_after = parse_u64_field(&s1_after, "group_pool_used_bytes");
    let m2_used_after = parse_u64_field(&s2_after, "group_pool_used_bytes");

    assert!(
        m1_used_after < m1_used_before,
        "expected member1 group_pool_used_bytes to decrease after their delete, before={m1_used_before}, after={m1_used_after}"
    );
    assert_eq!(
        m2_used_after, m2_used_before,
        "expected member2 group_pool_used_bytes unchanged by member1 delete, before={m2_used_before}, after={m2_used_after}"
    );

    Ok(())
}

#[tokio::test]
async fn test_group_default_update_applies_without_clamping_existing_member_allowance() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    // Start with a large default max so the member gets a large initial allowance.
    fund_group_pool_and_set_default_quota(&contract, &owner, group_id, NearToken::from_near(2), 50_000).await?;

    let key1 = author_group_key(&member, group_id, "content/posts/init_allowance");
    // First write: initializes the member's default-derived quota entry and spends a bit.
    let first = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key1: {"text": "hello"}
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(220))
        .transact()
        .await?;
    assert!(first.is_success(), "initial sponsored write should succeed: {:?}", first.failures());

    // Now reduce the group default max drastically.
    // With "no clamp-down" semantics, the member should still be able to spend their
    // previously-earned allowance (until it is spent down), even though max is now tiny.
    update_group_default_quota(&contract, &owner, group_id, 1).await?;

    let key2 = author_group_key(&member, group_id, "content/posts/after_default_reduced");
    let second = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key2: {"text": "hello"}
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(220))
        .transact()
        .await?;

    assert!(
        second.is_success(),
        "Expected write to still succeed after default max reduction because existing allowance is not clamped: {:?}",
        second.failures()
    );

    // Sanity: sponsorship actually happened.
    let logs = second.logs();
    let has_spend_event = logs.iter().any(|l| l.contains("group_sponsor_spend"));
    assert!(
        has_spend_event,
        "Expected group_sponsor_spend even after default update; allowance should remain spendable. Logs: {:?}",
        logs
    );

    Ok(())
}

#[tokio::test]
async fn test_author_prefixed_group_path_is_sponsored_by_group_pool() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    fund_group_pool_and_set_default_quota(&contract, &owner, group_id, NearToken::from_near(2), 50_000).await?;

    // Most realistic storage path for group content is "{author}/groups/{group_id}/...".
    let key = author_group_key(&member, group_id, "content/posts/author_prefixed");

    let res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key: {"text": "hello"}
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(220))
        .transact()
        .await?;

    assert!(res.is_success(), "Expected author-prefixed group write to succeed: {:?}", res.failures());
    let logs = res.logs();
    assert!(
        logs.iter().any(|l| l.contains("group_sponsor_spend")),
        "Expected group_sponsor_spend for author-prefixed group path. Logs: {:?}",
        logs
    );

    let storage: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;
    assert!(
        parse_u64_field(&storage, "group_pool_used_bytes") > 0,
        "Expected group_pool_used_bytes > 0 for author-prefixed sponsored write, got: {storage:?}"
    );

    // Sanity: the value is actually readable at the same full path.
    let got = view_get_key(&contract, &author_group_key(&member, group_id, "content/posts/author_prefixed"), None).await?;
    assert!(got.is_some(), "Expected get() to return stored value for author-prefixed group path");

    Ok(())
}

#[tokio::test]
async fn test_per_user_override_quota_takes_precedence_over_default_policy() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    // Default would allow, but per-user override will be extremely strict.
    fund_group_pool_and_set_default_quota(&contract, &owner, group_id, NearToken::from_near(2), 50_000).await?;
    set_member_quota_override(&contract, &owner, group_id, &member, 1).await?;

    let blocked_key = author_group_key(&member, group_id, "content/posts/override_blocks");
    // 1) With 0 attached deposit, the write should fail due to override gating.
    let blocked = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    blocked_key: {"text": "hello"}
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(220))
        .transact()
        .await?;
    assert!(blocked.is_failure(), "Expected group write to fail due to strict per-user override quota");

    let fallback_key = author_group_key(&member, group_id, "content/posts/override_fallback");
    // 2) With attached deposit, fallback should succeed and should NOT emit group_sponsor_spend.
    let fallback = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    fallback_key: {"text": "hello"}
                },
                "options": {"refund_unused_deposit": true},
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(240))
        .transact()
        .await?;
    assert!(fallback.is_success(), "Expected attached-deposit fallback to succeed: {:?}", fallback.failures());
    let logs = fallback.logs();
    assert!(
        !logs.iter().any(|l| l.contains("group_sponsor_spend")),
        "Did not expect group_sponsor_spend when override blocks and attached deposit pays. Logs: {:?}",
        logs
    );

    Ok(())
}

#[tokio::test]
async fn test_failed_multi_operation_set_does_not_persist_partial_state() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    fund_group_pool_and_set_default_quota(&contract, &owner, group_id, NearToken::from_near(2), 50_000).await?;

    // One tx that:
    // - performs a valid group write (would normally be sponsored)
    // - then performs an invalid API op (missing required fields) causing the tx to fail
    // We assert the first write does NOT persist.
    let key = author_group_key(&member, group_id, "content/posts/should_not_persist");
    let res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    key.clone(): {"text": "hello"},
                    "storage/group_sponsor_default_set": {"group_id": group_id}
                },
                "options": null,
                "event_config": {"emit": false},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(260))
        .transact()
        .await?;

    assert!(res.is_failure(), "Expected multi-operation set to fail due to invalid default_set payload");

    let got = view_get_key(&contract, &key, None).await?;
    assert!(got.is_none(), "Expected no partial state: group key must not be written on failed tx");

    let storage: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;
    assert_eq!(
        parse_u64_field(&storage, "group_pool_used_bytes"),
        0,
        "Expected no partial state: group_pool_used_bytes must remain 0 on failed tx, got: {storage:?}"
    );

    Ok(())
}

#[tokio::test]
async fn test_quota_exhaustion_mid_batch_falls_back_to_attached_deposit() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    // Fund group pool and set a generous default, but enforce a strict per-user override.
    // The override is set to a value that should be enough for a tiny write, but not enough
    // for a large one in the same tx.
    fund_group_pool_and_set_default_quota(&contract, &owner, group_id, NearToken::from_near(2), 100_000).await?;
    let allowance_max_bytes = 3_000u64;
    set_member_quota_override(&contract, &owner, group_id, &member, allowance_max_bytes).await?;

    // Use the most realistic storage paths for group content.
    let small_key = author_group_key(&member, group_id, "content/posts/batch_small");
    let large_key = author_group_key(&member, group_id, "content/posts/batch_large");
    let large_text = "x".repeat(4_000);

    // Attach deposit so that after quota is exhausted, the second key can still succeed
    // via attached-deposit fallback within the same transaction.
    let res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    small_key.clone(): {"text": "a"},
                    large_key.clone(): {"text": large_text}
                },
                "options": {"refund_unused_deposit": true},
                // Keep events on: payload is moderate; this also exercises the normal pipeline.
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(300))
        .transact()
        .await?;

    assert!(res.is_success(), "Expected mid-batch fallback tx to succeed: {:?}", res.failures());

    // Both values should be present.
    assert!(view_get_key(&contract, &small_key, None).await?.is_some(), "Expected small key to be written");
    assert!(view_get_key(&contract, &large_key, None).await?.is_some(), "Expected large key to be written via fallback");

    // Sponsorship should have happened for at least one key (the small one).
    let storage: serde_json::Value = contract
        .view("get_storage_balance")
        .args_json(json!({"account_id": member.id()}))
        .await?
        .json()?;
    let group_used = parse_u64_field(&storage, "group_pool_used_bytes");
    assert!(group_used > 0, "Expected some group-sponsored bytes, got: {storage:?}");
    assert!(
        group_used <= allowance_max_bytes,
        "Expected group-sponsored bytes bounded by per-user allowance_max_bytes (mid-batch quota gating). used={group_used}, max={allowance_max_bytes}"
    );

    Ok(())
}

#[tokio::test]
async fn test_single_set_can_use_author_prefixed_group_sponsorship_and_personal_balance() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let owner = create_user(&root, "owner", TEN_NEAR).await?;
    let member = create_user(&root, "member", TEN_NEAR).await?;

    let group_id = "devs";
    create_group(&contract, &owner, group_id).await?;
    add_member(&contract, &owner, group_id, &member).await?;

    fund_group_pool_and_set_default_quota(&contract, &owner, group_id, NearToken::from_near(2), 50_000).await?;

    // Pre-fund member personal balance in a prior tx so next tx can have 0 attached deposit.
    deposit_personal_storage(&contract, &member, ONE_NEAR).await?;

    let group_key = author_group_key(&member, group_id, "content/posts/mixed_author_prefixed");
    let profile_key = user_key(&member, "profile/name");

    let res = member
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": null,
                "data": {
                    group_key: {"text": "hello"},
                    profile_key: "Member"
                },
                "options": null,
                "event_config": {"emit": true},
                "auth": null
            }
        }))
        .deposit(NearToken::from_yoctonear(0))
        .gas(Gas::from_tgas(260))
        .transact()
        .await?;

    assert!(res.is_success(), "Expected mixed-source set to succeed: {:?}", res.failures());
    let logs = res.logs();
    assert!(
        logs.iter().any(|l| l.contains("group_sponsor_spend")),
        "Expected group_sponsor_spend for the author-prefixed group key. Logs: {:?}",
        logs
    );

    // Sanity: both values exist.
    assert!(
        view_get_key(
            &contract,
            &author_group_key(&member, group_id, "content/posts/mixed_author_prefixed"),
            None
        )
        .await?
        .is_some(),
        "Expected author-prefixed group value to be written"
    );
    assert!(
        view_get_key(&contract, &user_key(&member, "profile/name"), None).await?.is_some(),
        "Expected personal value to be written"
    );

    Ok(())
}
