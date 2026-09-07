// =============================================================================
// Every core `execute` / `execute_admin` Action — one on-chain sandbox pass
// =============================================================================
// Hits each Action type against real WASM, plus `storage/tip`.
// Expire uses the 1-hour minimum voting period and sandbox fast-forward.

use anyhow::Result;
use near_workspaces::types::{Gas, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};

use crate::utils::entry_value;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const MIN_VOTING_PERIOD_NS: u64 = 3_600_000_000_000;

const ALL_EXECUTE_TYPES: &[&str] = &[
    "set",
    "create_group",
    "join_group",
    "leave_group",
    "add_group_member",
    "remove_group_member",
    "approve_join_request",
    "reject_join_request",
    "cancel_join_request",
    "blacklist_group_member",
    "unblacklist_group_member",
    "transfer_group_ownership",
    "set_group_privacy",
    "update_group_metadata",
    "create_proposal",
    "vote_on_proposal",
    "cancel_proposal",
    "expire_proposal",
    "set_permission",
    "set_key_permission",
];

fn load_core_wasm() -> Result<Vec<u8>> {
    let paths = [
        "../target/near/core_onsocial/core_onsocial.wasm",
        "target/near/core_onsocial/core_onsocial.wasm",
        "/code/target/near/core_onsocial/core_onsocial.wasm",
        "/workspace/target/near/core_onsocial/core_onsocial.wasm",
    ];
    for path in paths {
        if let Ok(wasm) = std::fs::read(path) {
            return Ok(wasm);
        }
    }
    anyhow::bail!("core_onsocial.wasm not found")
}

async fn deploy_core(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> Result<Contract> {
    let contract = worker.dev_deploy(&load_core_wasm()?).await?;
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

async fn execute(
    contract: &Contract,
    caller: &Account,
    action: Value,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(caller
        .call(contract.id(), "execute")
        .args_json(json!({ "request": { "action": action } }))
        .deposit(deposit)
        .gas(Gas::from_tgas(150))
        .transact()
        .await?)
}

async fn execute_admin(
    contract: &Contract,
    caller: &Account,
    action: Value,
    deposit: NearToken,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(caller
        .call(contract.id(), "execute_admin")
        .args_json(json!({ "request": { "action": action } }))
        .deposit(deposit)
        .gas(Gas::from_tgas(150))
        .transact()
        .await?)
}

async fn hit(
    seen: &mut std::collections::HashSet<&'static str>,
    contract: &Contract,
    caller: &Account,
    ty: &'static str,
    action: Value,
    deposit: NearToken,
    admin: bool,
) -> Result<()> {
    let res = if admin {
        execute_admin(contract, caller, action, deposit).await?
    } else {
        execute(contract, caller, action, deposit).await?
    };
    res.into_result()
        .map_err(|e| anyhow::anyhow!("{ty} failed: {e:?}"))?;
    seen.insert(ty);
    println!("on-chain ok  {ty}");
    Ok(())
}

async fn get_entry(contract: &Contract, key: &str) -> Result<Option<Value>> {
    let rows: Vec<Value> = contract
        .view("get")
        .args_json(json!({ "keys": [key] }))
        .await?
        .json()?;
    Ok(entry_value(&rows, key).cloned())
}

async fn fast_forward_past(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    target_ns: u64,
) -> Result<u64> {
    for _ in 0..200 {
        let now = worker.view_block().await?.timestamp();
        if now > target_ns {
            return Ok(now);
        }
        worker.fast_forward(150).await?;
    }
    anyhow::bail!(
        "sandbox time did not pass {target_ns} (now={})",
        worker.view_block().await?.timestamp()
    )
}

#[tokio::test]
async fn test_every_core_execute_action_on_chain() -> Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy_core(&worker).await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let carol = worker.dev_create_account().await?;
    let dave = worker.dev_create_account().await?;
    let mut seen = std::collections::HashSet::new();

    execute_admin(
        &contract,
        &alice,
        json!({
            "type": "set",
            "data": { "storage/deposit": { "amount": "1000000000000000000000000" } }
        }),
        ONE_NEAR,
    )
    .await?
    .into_result()?;

    hit(
        &mut seen,
        &contract,
        &alice,
        "set",
        json!({ "type": "set", "data": { "profile/name": "Alice" } }),
        ONE_NEAR,
        false,
    )
    .await?;

    hit(
        &mut seen,
        &contract,
        &alice,
        "create_group",
        json!({
            "type": "create_group",
            "group_id": "pubg",
            "config": { "is_private": false }
        }),
        ONE_NEAR,
        false,
    )
    .await?;

    hit(
        &mut seen,
        &contract,
        &bob,
        "join_group",
        json!({ "type": "join_group", "group_id": "pubg" }),
        ONE_NEAR,
        false,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &bob,
        "leave_group",
        json!({ "type": "leave_group", "group_id": "pubg" }),
        ONE_YOCTO,
        false,
    )
    .await?;

    hit(
        &mut seen,
        &contract,
        &alice,
        "add_group_member",
        json!({
            "type": "add_group_member",
            "group_id": "pubg",
            "member_id": carol.id().to_string()
        }),
        ONE_NEAR,
        false,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &alice,
        "remove_group_member",
        json!({
            "type": "remove_group_member",
            "group_id": "pubg",
            "member_id": carol.id().to_string()
        }),
        ONE_YOCTO,
        false,
    )
    .await?;

    execute(
        &contract,
        &alice,
        json!({
            "type": "create_group",
            "group_id": "privg",
            "config": { "is_private": true }
        }),
        ONE_NEAR,
    )
    .await?
    .into_result()?;

    execute(
        &contract,
        &bob,
        json!({ "type": "join_group", "group_id": "privg" }),
        ONE_NEAR,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &alice,
        "approve_join_request",
        json!({
            "type": "approve_join_request",
            "group_id": "privg",
            "requester_id": bob.id().to_string()
        }),
        ONE_NEAR,
        false,
    )
    .await?;

    execute(
        &contract,
        &carol,
        json!({ "type": "join_group", "group_id": "privg" }),
        ONE_NEAR,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &alice,
        "reject_join_request",
        json!({
            "type": "reject_join_request",
            "group_id": "privg",
            "requester_id": carol.id().to_string(),
            "reason": "coverage"
        }),
        ONE_YOCTO,
        false,
    )
    .await?;

    execute(
        &contract,
        &dave,
        json!({ "type": "join_group", "group_id": "privg" }),
        ONE_NEAR,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &dave,
        "cancel_join_request",
        json!({ "type": "cancel_join_request", "group_id": "privg" }),
        ONE_YOCTO,
        false,
    )
    .await?;

    hit(
        &mut seen,
        &contract,
        &alice,
        "blacklist_group_member",
        json!({
            "type": "blacklist_group_member",
            "group_id": "privg",
            "member_id": bob.id().to_string()
        }),
        ONE_YOCTO,
        false,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &alice,
        "unblacklist_group_member",
        json!({
            "type": "unblacklist_group_member",
            "group_id": "privg",
            "member_id": bob.id().to_string()
        }),
        ONE_YOCTO,
        false,
    )
    .await?;

    hit(
        &mut seen,
        &contract,
        &alice,
        "set_group_privacy",
        json!({
            "type": "set_group_privacy",
            "group_id": "privg",
            "is_private": false
        }),
        ONE_NEAR,
        false,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &alice,
        "update_group_metadata",
        json!({
            "type": "update_group_metadata",
            "group_id": "privg",
            "changes": { "description": "covered on-chain" }
        }),
        ONE_NEAR,
        false,
    )
    .await?;

    let meta = get_entry(&contract, "groups/privg/config")
        .await?
        .expect("privg config");
    assert_eq!(
        meta.get("description").and_then(|v| v.as_str()),
        Some("covered on-chain")
    );

    execute(
        &contract,
        &alice,
        json!({
            "type": "create_group",
            "group_id": "xferg",
            "config": { "is_private": false }
        }),
        ONE_NEAR,
    )
    .await?
    .into_result()?;
    execute(
        &contract,
        &alice,
        json!({
            "type": "add_group_member",
            "group_id": "xferg",
            "member_id": bob.id().to_string()
        }),
        ONE_NEAR,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &alice,
        "transfer_group_ownership",
        json!({
            "type": "transfer_group_ownership",
            "group_id": "xferg",
            "new_owner": bob.id().to_string(),
            "remove_old_owner": false
        }),
        ONE_YOCTO,
        false,
    )
    .await?;

    execute(
        &contract,
        &alice,
        json!({
            "type": "create_group",
            "group_id": "govg",
            "config": {
                "member_driven": true,
                "is_private": true,
                "voting_config": { "voting_period": MIN_VOTING_PERIOD_NS.to_string() }
            }
        }),
        ONE_NEAR,
    )
    .await?
    .into_result()?;

    let cancel_id: String = execute(
        &contract,
        &alice,
        json!({
            "type": "create_proposal",
            "group_id": "govg",
            "proposal_type": "custom_proposal",
            "changes": { "title": "cancel-me", "description": "d", "custom_data": {} },
            "auto_vote": false
        }),
        ONE_NEAR,
    )
    .await?
    .into_result()?
    .json()?;
    seen.insert("create_proposal");
    println!("on-chain ok  create_proposal");

    hit(
        &mut seen,
        &contract,
        &alice,
        "cancel_proposal",
        json!({
            "type": "cancel_proposal",
            "group_id": "govg",
            "proposal_id": cancel_id
        }),
        ONE_YOCTO,
        false,
    )
    .await?;

    let vote_id: String = execute(
        &contract,
        &alice,
        json!({
            "type": "create_proposal",
            "group_id": "govg",
            "proposal_type": "custom_proposal",
            "changes": { "title": "vote-me", "description": "d", "custom_data": {} },
            "auto_vote": false
        }),
        ONE_NEAR,
    )
    .await?
    .into_result()?
    .json()?;
    hit(
        &mut seen,
        &contract,
        &alice,
        "vote_on_proposal",
        json!({
            "type": "vote_on_proposal",
            "group_id": "govg",
            "proposal_id": vote_id,
            "approve": true
        }),
        NearToken::from_millinear(10),
        false,
    )
    .await?;

    let expire_id: String = execute(
        &contract,
        &alice,
        json!({
            "type": "create_proposal",
            "group_id": "govg",
            "proposal_type": "custom_proposal",
            "changes": { "title": "expire-me", "description": "d", "custom_data": {} },
            "auto_vote": false
        }),
        ONE_NEAR,
    )
    .await?
    .into_result()?
    .json()?;

    let too_soon = execute(
        &contract,
        &bob,
        json!({
            "type": "expire_proposal",
            "group_id": "govg",
            "proposal_id": expire_id
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        too_soon.into_result().is_err(),
        "expire before voting period must fail"
    );

    let created = get_entry(&contract, &format!("groups/govg/proposals/{expire_id}"))
        .await?
        .expect("expire proposal");
    let created_at: u64 = created
        .get("created_at")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse().ok())
        .expect("created_at");
    let voting_period: u64 = created
        .get("voting_config")
        .and_then(|c| c.get("voting_period"))
        .and_then(|v| {
            v.as_str()
                .and_then(|s| s.parse().ok())
                .or_else(|| v.as_u64())
        })
        .unwrap_or(MIN_VOTING_PERIOD_NS);
    fast_forward_past(&worker, created_at.saturating_add(voting_period)).await?;

    hit(
        &mut seen,
        &contract,
        &bob,
        "expire_proposal",
        json!({
            "type": "expire_proposal",
            "group_id": "govg",
            "proposal_id": expire_id
        }),
        ONE_YOCTO,
        false,
    )
    .await?;
    let expired = get_entry(&contract, &format!("groups/govg/proposals/{expire_id}"))
        .await?
        .expect("expired proposal");
    assert_eq!(
        expired.get("status").and_then(|v| v.as_str()),
        Some("expired")
    );

    hit(
        &mut seen,
        &contract,
        &alice,
        "set_permission",
        json!({
            "type": "set_permission",
            "grantee": bob.id().to_string(),
            "path": "profile/",
            "level": 1,
            "expires_at": null
        }),
        ONE_YOCTO,
        true,
    )
    .await?;

    let sk = SecretKey::from_random(KeyType::ED25519);
    hit(
        &mut seen,
        &contract,
        &alice,
        "set_key_permission",
        json!({
            "type": "set_key_permission",
            "public_key": sk.public_key(),
            "path": "profile/",
            "level": 1,
            "expires_at": null
        }),
        ONE_YOCTO,
        true,
    )
    .await?;

    let missing: Vec<_> = ALL_EXECUTE_TYPES
        .iter()
        .copied()
        .filter(|ty| !seen.contains(ty))
        .collect();
    assert!(
        missing.is_empty(),
        "core execute types not hit on-chain: {missing:?}"
    );
    println!(
        "all {} core execute action types succeeded on-chain",
        ALL_EXECUTE_TYPES.len()
    );
    Ok(())
}

#[tokio::test]
async fn test_storage_tip_transfers_balance_on_chain() -> Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy_core(&worker).await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;

    execute_admin(
        &contract,
        &alice,
        json!({
            "type": "set",
            "data": { "storage/deposit": { "amount": "5000000000000000000000000" } }
        }),
        NearToken::from_near(5),
    )
    .await?
    .into_result()?;

    let before_alice: Value = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    let alice_before: u128 = before_alice["balance"].as_str().unwrap().parse().unwrap();

    execute_admin(
        &contract,
        &alice,
        json!({
            "type": "set",
            "data": {
                "storage/tip": {
                    "target_id": bob.id().to_string(),
                    "amount": "1000000000000000000000000"
                }
            }
        }),
        NearToken::from_yoctonear(0),
    )
    .await?
    .into_result()?;

    let after_alice: Value = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    let after_bob: Value = contract
        .view("get_storage_balance")
        .args_json(json!({ "account_id": bob.id() }))
        .await?
        .json()?;
    let alice_after: u128 = after_alice["balance"].as_str().unwrap().parse().unwrap();
    let bob_after: u128 = after_bob["balance"].as_str().unwrap().parse().unwrap();
    let tipped = alice_before.saturating_sub(alice_after);
    assert!(
        tipped >= 1_000_000_000_000_000_000_000_000 && tipped <= 1_000_000_000_000_000_000_000_001,
        "alice should lose ~1 NEAR to the tip (lost {tipped})"
    );
    assert_eq!(bob_after, 1_000_000_000_000_000_000_000_000);
    println!("on-chain ok  storage/tip");
    Ok(())
}
