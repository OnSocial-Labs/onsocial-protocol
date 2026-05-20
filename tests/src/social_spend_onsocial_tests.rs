// =============================================================================
// Social-Spend-OnSocial Integration Tests
// =============================================================================
// Cross-contract tests for spending SOCIAL via NEP-141 `ft_transfer_call`.

use anyhow::Result;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::utils::{encode_base64, get_wasm_path, setup_sandbox};

const ONE_SOCIAL: u128 = 1_000_000_000_000_000_000;
const MIN_SOCIAL_SPEND: u128 = ONE_SOCIAL / 100;
const TOTAL_SUPPLY: u128 = 1_000_000 * ONE_SOCIAL;
const SPEND_AMOUNT: u128 = 100 * ONE_SOCIAL;
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const LIVE_SEASON_END_NS: u64 = 9_000_000_000_000_000_000;
const CLOSED_SEASON_END_NS: u64 = 1;

async fn deploy_mock_ft(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("mock-ft");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
            "total_supply": TOTAL_SUPPLY.to_string(),
            "decimals": 18,
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn deploy_social_spend(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
    social_token: &Contract,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("social-spend-onsocial");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    owner
        .call(contract.id(), "new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
            "social_token": social_token.id().to_string(),
            "treasury_id": owner.id().to_string(),
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn ft_storage_deposit(ft: &Contract, caller: &Account, account_id: &str) -> Result<()> {
    caller
        .call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": account_id }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn ft_transfer(ft: &Contract, from: &Account, to: &str, amount: u128) -> Result<()> {
    from.call(ft.id(), "ft_transfer")
        .args_json(json!({
            "receiver_id": to,
            "amount": amount.to_string(),
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn ft_balance_of(ft: &Contract, account_id: &str) -> Result<u128> {
    let result = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    let balance: String = result.json()?;
    Ok(balance.parse()?)
}

async fn view_u128(contract: &Contract, method: &str, args: Value) -> Result<u128> {
    let result = contract.view(method).args_json(args).await?;
    let value: String = result.json()?;
    Ok(value.parse()?)
}

async fn view_value(contract: &Contract, method: &str, args: Value) -> Result<Value> {
    let result = contract.view(method).args_json(args).await?;
    Ok(result.json()?)
}

async fn set_season_config(
    social_spend: &Contract,
    owner: &Account,
    season_id: &str,
    active: bool,
    starts_at_ns: u64,
    ends_at_ns: u64,
    claim_starts_at_ns: Option<u64>,
) -> Result<()> {
    owner
        .call(social_spend.id(), "set_season_config")
        .args_json(json!({
            "season_id": season_id,
            "config": {
                "label": "Support Rally",
                "active": active,
                "starts_at_ns": starts_at_ns,
                "ends_at_ns": ends_at_ns,
                "claim_starts_at_ns": claim_starts_at_ns,
            },
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn spend_social(
    ft: &Contract,
    social_spend: &Contract,
    sender: &Account,
    amount: u128,
    msg: String,
) -> Result<Vec<String>> {
    let result = transfer_call_social(ft, social_spend, sender, amount, msg).await?;
    collect_success_logs(result)
}

async fn transfer_call_social(
    ft: &Contract,
    social_spend: &Contract,
    sender: &Account,
    amount: u128,
    msg: String,
) -> Result<ExecutionFinalResult> {
    let result = sender
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": social_spend.id().to_string(),
            "amount": amount.to_string(),
            "msg": msg,
        }))
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    Ok(result)
}

fn collect_success_logs(result: ExecutionFinalResult) -> Result<Vec<String>> {
    let logs = result.logs().iter().map(|log| log.to_string()).collect();
    result.into_result()?;
    Ok(logs)
}

fn spend_msg(
    action: &str,
    target_type: &str,
    target_id: &str,
    season_id: Option<&str>,
    recipient_id: Option<&str>,
) -> String {
    let mut value = json!({
        "v": 1,
        "app_id": "portal",
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
    });
    if let Some(season_id) = season_id {
        value["season_id"] = json!(season_id);
    }
    if let Some(recipient_id) = recipient_id {
        value["recipient_id"] = json!(recipient_id);
    }
    value.to_string()
}

fn contains_event(logs: &[String], event: &str) -> bool {
    let needle = format!("\"event\":\"{event}\"");
    logs.iter().any(|log| log.contains(&needle))
}

fn season_leaf_hash(season_id: &str, account_id: &str, amount: u128) -> [u8; 32] {
    let payload = format!("onsocial-season-v1:{season_id}:{account_id}:{amount}");
    Sha256::digest(payload.as_bytes()).into()
}

#[tokio::test]
async fn test_signal_profile_ft_transfer_call_routes_and_emits() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let spender = worker.dev_create_account().await?;
    let target = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &owner).await?;
    let social_spend = deploy_social_spend(&worker, &owner, &ft).await?;

    ft_storage_deposit(&ft, &owner, spender.id().as_str()).await?;
    ft_transfer(&ft, &owner, spender.id().as_str(), 2 * SPEND_AMOUNT).await?;

    let logs = spend_social(
        &ft,
        &social_spend,
        &spender,
        SPEND_AMOUNT,
        spend_msg(
            "signal_profile",
            "profile",
            target.id().as_str(),
            None,
            None,
        ),
    )
    .await?;

    assert!(contains_event(&logs, "SOCIAL_SPENT"));
    assert_eq!(
        view_u128(
            &social_spend,
            "get_target_balance",
            json!({ "account_id": target.id().to_string() }),
        )
        .await?,
        90 * ONE_SOCIAL,
    );
    assert_eq!(
        view_u128(
            &social_spend,
            "get_season_pool",
            json!({ "season_id": "season-one" }),
        )
        .await?,
        0,
    );

    let info = social_spend.view("get_contract_info").await?.json::<Value>()?;
    assert_eq!(info["social_token"], ft.id().to_string());
    assert_eq!(info["total_spent"], SPEND_AMOUNT.to_string());
    assert_eq!(info["treasury_balance"], (10 * ONE_SOCIAL).to_string());

    let action_totals = view_value(
        &social_spend,
        "get_action_totals",
        json!({ "action_id": "signal_profile" }),
    )
    .await?;
    assert_eq!(action_totals["count"], 1);
    assert_eq!(action_totals["total_spent"], SPEND_AMOUNT.to_string());
    assert_eq!(action_totals["treasury_routed"], (10 * ONE_SOCIAL).to_string());
    assert_eq!(action_totals["season_routed"], "0");
    assert_eq!(action_totals["target_routed"], (90 * ONE_SOCIAL).to_string());

    let target_totals = view_value(
        &social_spend,
        "get_target_totals",
        json!({ "target_type": "profile", "target_id": target.id().to_string() }),
    )
    .await?;
    assert_eq!(target_totals["count"], 1);
    assert_eq!(target_totals["total_spent"], SPEND_AMOUNT.to_string());

    assert_eq!(
        ft_balance_of(&ft, spender.id().as_str()).await?,
        SPEND_AMOUNT,
    );
    assert_eq!(
        ft_balance_of(&ft, social_spend.id().as_str()).await?,
        SPEND_AMOUNT,
    );

    Ok(())
}

#[tokio::test]
async fn test_rejected_rally_spend_refunds_ft_transfer_call() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let spender = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &owner).await?;
    let social_spend = deploy_social_spend(&worker, &owner, &ft).await?;

    ft_storage_deposit(&ft, &owner, spender.id().as_str()).await?;
    ft_transfer(&ft, &owner, spender.id().as_str(), SPEND_AMOUNT).await?;

    let result = transfer_call_social(
        &ft,
        &social_spend,
        &spender,
        SPEND_AMOUNT,
        spend_msg(
            "join_rally",
            "rally",
            "creator-week",
            Some("season-one"),
            None,
        ),
    )
    .await?;
    result.into_result()?;

    assert_eq!(
        ft_balance_of(&ft, spender.id().as_str()).await?,
        SPEND_AMOUNT,
    );
    assert_eq!(
        ft_balance_of(&ft, social_spend.id().as_str()).await?,
        0,
    );

    let info = social_spend.view("get_contract_info").await?.json::<Value>()?;
    assert_eq!(info["total_spent"], "0");
    assert_eq!(info["treasury_balance"], "0");

    Ok(())
}

#[tokio::test]
async fn test_custom_onboarding_action_supports_path_target_with_recipient() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let spender = worker.dev_create_account().await?;
    let target = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &owner).await?;
    let social_spend = deploy_social_spend(&worker, &owner, &ft).await?;

    owner
        .call(social_spend.id(), "set_action_config")
        .args_json(json!({
            "action_id": "welcome_user",
            "config": {
                "label": "Welcome User",
                "active": true,
                "min_amount": MIN_SOCIAL_SPEND.to_string(),
                "target_types": ["profile", "onboarding"],
                "treasury_bps": 1000,
                "season_pool_bps": 0,
                "target_bps": 9000,
                "season_required": false,
                "allow_self_target": false,
            },
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    ft_storage_deposit(&ft, &owner, spender.id().as_str()).await?;
    ft_transfer(&ft, &owner, spender.id().as_str(), SPEND_AMOUNT).await?;

    spend_social(
        &ft,
        &social_spend,
        &spender,
        SPEND_AMOUNT,
        spend_msg(
            "welcome_user",
            "onboarding",
            "welcome/alice.near",
            None,
            Some(target.id().as_str()),
        ),
    )
    .await?;

    assert_eq!(
        view_u128(
            &social_spend,
            "get_target_balance",
            json!({ "account_id": target.id().to_string() }),
        )
        .await?,
        90 * ONE_SOCIAL,
    );

    let target_totals = view_value(
        &social_spend,
        "get_target_totals",
        json!({ "target_type": "onboarding", "target_id": "welcome/alice.near" }),
    )
    .await?;
    assert_eq!(target_totals["count"], 1);
    assert_eq!(target_totals["total_spent"], SPEND_AMOUNT.to_string());

    Ok(())
}

#[tokio::test]
async fn test_support_profile_accumulates_and_claims_target_balance() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let spender = worker.dev_create_account().await?;
    let target = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &owner).await?;
    let social_spend = deploy_social_spend(&worker, &owner, &ft).await?;

    ft_storage_deposit(&ft, &owner, spender.id().as_str()).await?;
    ft_transfer(&ft, &owner, spender.id().as_str(), SPEND_AMOUNT).await?;

    spend_social(
        &ft,
        &social_spend,
        &spender,
        SPEND_AMOUNT,
        spend_msg(
            "support_profile",
            "profile",
            target.id().as_str(),
            None,
            None,
        ),
    )
    .await?;

    assert_eq!(
        view_u128(
            &social_spend,
            "get_target_balance",
            json!({ "account_id": target.id().to_string() }),
        )
        .await?,
        95 * ONE_SOCIAL,
    );

    target
        .call(social_spend.id(), "claim_target_balance")
        .args_json(json!({}))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    assert_eq!(
        view_u128(
            &social_spend,
            "get_target_balance",
            json!({ "account_id": target.id().to_string() }),
        )
        .await?,
        0,
    );
    assert_eq!(ft_balance_of(&ft, target.id().as_str()).await?, 95 * ONE_SOCIAL);
    assert_eq!(
        ft_balance_of(&ft, social_spend.id().as_str()).await?,
        5 * ONE_SOCIAL,
    );

    Ok(())
}

#[tokio::test]
async fn test_failed_target_claim_rolls_back_balance() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let spender = worker.dev_create_account().await?;
    let target = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &owner).await?;
    let social_spend = deploy_social_spend(&worker, &owner, &ft).await?;

    ft_storage_deposit(&ft, &owner, spender.id().as_str()).await?;
    ft_transfer(&ft, &owner, spender.id().as_str(), SPEND_AMOUNT).await?;

    spend_social(
        &ft,
        &social_spend,
        &spender,
        SPEND_AMOUNT,
        spend_msg(
            "support_profile",
            "profile",
            target.id().as_str(),
            None,
            None,
        ),
    )
    .await?;

    owner
        .call(ft.id(), "set_fail_next_transfer")
        .args_json(json!({ "should_fail": true }))
        .transact()
        .await?
        .into_result()?;

    target
        .call(social_spend.id(), "claim_target_balance")
        .args_json(json!({}))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    assert_eq!(
        view_u128(
            &social_spend,
            "get_target_balance",
            json!({ "account_id": target.id().to_string() }),
        )
        .await?,
        95 * ONE_SOCIAL,
    );
    assert_eq!(ft_balance_of(&ft, target.id().as_str()).await?, 0);
    assert_eq!(
        ft_balance_of(&ft, social_spend.id().as_str()).await?,
        SPEND_AMOUNT,
    );

    Ok(())
}

#[tokio::test]
async fn test_publish_season_root_and_claim_reward() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let spender = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &owner).await?;
    let social_spend = deploy_social_spend(&worker, &owner, &ft).await?;

    set_season_config(
        &social_spend,
        &owner,
        "season-one",
        true,
        0,
        LIVE_SEASON_END_NS,
        Some(LIVE_SEASON_END_NS),
    )
    .await?;

    let season = view_value(
        &social_spend,
        "get_season_config",
        json!({ "season_id": "season-one" }),
    )
    .await?;
    assert_eq!(season["label"], "Support Rally");
    assert_eq!(season["active"], true);
    assert_eq!(season["is_live"], true);

    ft_storage_deposit(&ft, &owner, spender.id().as_str()).await?;
    ft_transfer(&ft, &owner, spender.id().as_str(), 2 * SPEND_AMOUNT).await?;
    spend_social(
        &ft,
        &social_spend,
        &spender,
        SPEND_AMOUNT,
        spend_msg(
            "join_rally",
            "rally",
            "creator-week",
            Some("season-one"),
            None,
        ),
    )
    .await?;

    let claim_amount = 30 * ONE_SOCIAL;
    let root = season_leaf_hash("season-one", spender.id().as_str(), claim_amount);

    set_season_config(
        &social_spend,
        &owner,
        "season-one",
        false,
        0,
        CLOSED_SEASON_END_NS,
        Some(CLOSED_SEASON_END_NS),
    )
    .await?;

    owner
        .call(social_spend.id(), "publish_season_root")
        .args_json(json!({
            "season_id": "season-one",
            "root": encode_base64(&root),
            "total_amount": claim_amount.to_string(),
            "active": true,
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let settlement = view_value(
        &social_spend,
        "get_season_settlement",
        json!({ "season_id": "season-one" }),
    )
    .await?;
    assert_eq!(settlement["total_amount"], claim_amount.to_string());
    assert_eq!(settlement["claimed_amount"], "0");

    spender
        .call(social_spend.id(), "claim_season_reward")
        .args_json(json!({
            "season_id": "season-one",
            "amount": claim_amount.to_string(),
            "proof": [],
        }))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    assert_eq!(
        view_u128(
            &social_spend,
            "get_season_pool",
            json!({ "season_id": "season-one" }),
        )
        .await?,
        60 * ONE_SOCIAL,
    );

    let has_claimed = social_spend
        .view("has_claimed_season")
        .args_json(json!({
            "season_id": "season-one",
            "account_id": spender.id().to_string(),
        }))
        .await?
        .json::<bool>()?;
    assert!(has_claimed);
    assert_eq!(
        ft_balance_of(&ft, spender.id().as_str()).await?,
        SPEND_AMOUNT + claim_amount,
    );

    Ok(())
}