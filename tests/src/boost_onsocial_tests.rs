// =============================================================================
// Boost-OnSocial Integration Tests
// =============================================================================
// Shared-crate integration tests for the Boost contract running against NEAR
// sandbox with cross-contract calls via a mock FT.

use anyhow::Result;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::utils::{get_wasm_path, setup_sandbox};

const ONE_SOCIAL: u128 = 1_000_000_000_000_000_000;
const MONTH_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountView {
    pub locked_amount: String,
    pub unlock_at: u64,
    pub lock_months: u64,
    pub effective_boost: String,
    pub claimable_rewards: String,
    pub boost_seconds: String,
    pub rewards_claimed: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractStats {
    pub version: u32,
    pub token_id: String,
    pub owner_id: String,
    pub total_locked: String,
    pub total_effective_boost: String,
    pub total_boost_seconds: String,
    pub total_rewards_released: String,
    pub scheduled_pool: String,
    pub infra_pool: String,
    pub last_release_time: u64,
    pub active_weekly_rate_bps: u32,
    pub release_schedule_start_ns: u64,
    pub initial_weekly_rate_bps: u32,
    pub rate_step_bps: u32,
    pub rate_step_interval_months: u32,
    pub max_weekly_rate_bps: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockStatus {
    pub is_locked: bool,
    pub locked_amount: String,
    pub lock_months: u64,
    pub unlock_at: u64,
    pub can_unlock: bool,
    pub time_remaining_ns: u64,
    pub bonus_percent: u32,
    pub effective_boost: String,
    pub lock_expired: bool,
}

async fn setup_boost_contract(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    token_id: &str,
    owner: &Account,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("boost-onsocial");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({
            "token_id": token_id,
            "owner_id": owner.id().to_string()
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn setup_boost_contract_with_schedule(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    token_id: &str,
    owner: &Account,
    release_schedule_start_ns: u64,
    initial_weekly_rate_bps: u16,
    rate_step_bps: u16,
    rate_step_interval_months: u16,
    max_weekly_rate_bps: u16,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("boost-onsocial");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new_with_schedule")
        .args_json(json!({
            "config": {
                "token_id": token_id,
                "owner_id": owner.id().to_string(),
                "release_schedule_start_ns": release_schedule_start_ns,
                "initial_weekly_rate_bps": initial_weekly_rate_bps,
                "rate_step_bps": rate_step_bps,
                "rate_step_interval_months": rate_step_interval_months,
                "max_weekly_rate_bps": max_weekly_rate_bps
            }
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn setup_mock_ft_contract(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
    total_supply: u128,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("mock-ft");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
            "total_supply": total_supply.to_string(),
            "decimals": 18
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn ft_storage_deposit(ft: &Contract, account: &Account) -> Result<()> {
    account
        .call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": account.id().to_string() }))
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
            "amount": amount.to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn lock_tokens(
    ft: &Contract,
    boost: &Contract,
    user: &Account,
    amount: u128,
    lock_months: u64,
) -> Result<()> {
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": boost.id().to_string(),
            "amount": amount.to_string(),
            "msg": json!({ "action": "lock", "months": lock_months }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn fund_pool(ft: &Contract, boost: &Contract, owner: &Account, amount: u128) -> Result<()> {
    owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": boost.id().to_string(),
            "amount": amount.to_string(),
            "msg": json!({ "action": "fund_scheduled" }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn get_account(boost: &Contract, account_id: &str) -> Result<AccountView> {
    let result = boost
        .view("get_account")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    Ok(result.json()?)
}

async fn get_stats(boost: &Contract) -> Result<ContractStats> {
    let result = boost.view("get_stats").await?;
    Ok(result.json()?)
}

async fn get_lock_status(boost: &Contract, account_id: &str) -> Result<LockStatus> {
    let result = boost
        .view("get_lock_status")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    Ok(result.json()?)
}

async fn register_common_storage(ft: &Contract, boost: &Contract, owner: &Account) -> Result<()> {
    owner
        .call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": boost.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

#[tokio::test]
async fn test_init_boost_contract() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let boost = setup_boost_contract(&worker, ft.id().as_str(), &owner).await?;

    let stats = get_stats(&boost).await?;
    assert_eq!(stats.version, 1);
    assert_eq!(stats.token_id, ft.id().to_string());
    assert_eq!(stats.owner_id, owner.id().to_string());
    assert_eq!(stats.total_locked, "0");
    assert_eq!(stats.total_effective_boost, "0");
    assert_eq!(stats.scheduled_pool, "0");
    assert_eq!(stats.initial_weekly_rate_bps, 1);
    assert_eq!(stats.max_weekly_rate_bps, 20);

    Ok(())
}

#[tokio::test]
async fn test_lock_tokens_updates_boost_views() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let boost = setup_boost_contract(&worker, ft.id().as_str(), &owner).await?;

    register_common_storage(&ft, &boost, &owner).await?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(boost.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;

    lock_tokens(&ft, &boost, &user, 50 * ONE_SOCIAL, 6).await?;

    let account = get_account(&boost, user.id().as_str()).await?;
    let status = get_lock_status(&boost, user.id().as_str()).await?;
    let stats = get_stats(&boost).await?;

    assert_eq!(account.locked_amount, (50 * ONE_SOCIAL).to_string());
    assert_eq!(account.lock_months, 6);
    assert_eq!(status.lock_months, 6);
    assert_eq!(status.bonus_percent, 10);
    assert!(status.is_locked);
    assert!(!status.can_unlock);

    let effective_boost: u128 = account.effective_boost.parse()?;
    assert_eq!(effective_boost, 55 * ONE_SOCIAL);

    assert_eq!(stats.total_locked, (50 * ONE_SOCIAL).to_string());
    assert_eq!(stats.total_effective_boost, (55 * ONE_SOCIAL).to_string());

    Ok(())
}

#[tokio::test]
async fn test_claim_rewards_with_accelerated_schedule() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let current_timestamp = worker.view_block().await?.timestamp();
    let boost =
        setup_boost_contract_with_schedule(
            &worker,
            ft.id().as_str(),
            &owner,
            current_timestamp,
            1_000,
            0,
            1,
            1_000,
        )
        .await?;

    register_common_storage(&ft, &boost, &owner).await?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1_000 * ONE_SOCIAL).await?;

    user.call(boost.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;

    fund_pool(&ft, &boost, &owner, 100_000 * ONE_SOCIAL).await?;
    lock_tokens(&ft, &boost, &user, 100 * ONE_SOCIAL, 6).await?;

    worker.fast_forward(100).await?;

    owner
        .call(boost.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    let before = get_account(&boost, user.id().as_str()).await?;
    let claimable_before: u128 = before.claimable_rewards.parse()?;
    let claimed_before: u128 = before.rewards_claimed.parse()?;
    assert!(claimable_before > 0, "expected claimable rewards after short fast-forward");
    assert_eq!(claimed_before, 0);

    user.call(boost.id(), "claim_rewards")
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let after = get_account(&boost, user.id().as_str()).await?;
    let claimable_after: u128 = after.claimable_rewards.parse()?;
    let claimed_after: u128 = after.rewards_claimed.parse()?;
    let stats = get_stats(&boost).await?;

    assert!(claimed_after >= claimable_before, "claimed balance should reflect at least the pre-claim projection");
    assert!(claimable_after <= claimable_before, "claimable rewards should not increase immediately after claim");
    assert!(stats.total_rewards_released.parse::<u128>()? > 0);

    Ok(())
}

#[tokio::test]
async fn test_default_schedule_checkpoints_via_views() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let current_timestamp = worker.view_block().await?.timestamp();

    let checkpoints = [
        (0u64, 1u32),
        (2 * MONTH_NS, 2u32),
        (38 * MONTH_NS, 20u32),
        (40 * MONTH_NS, 20u32),
    ];

    for (elapsed_ns, expected_rate_bps) in checkpoints {
        let release_schedule_start_ns = current_timestamp.saturating_sub(elapsed_ns);
        let boost = setup_boost_contract_with_schedule(
            &worker,
            ft.id().as_str(),
            &owner,
            release_schedule_start_ns,
            1,
            1,
            2,
            20,
        )
        .await?;

        let stats = get_stats(&boost).await?;
        assert_eq!(
            stats.active_weekly_rate_bps, expected_rate_bps,
            "expected default schedule to be {} bps after {} ns of elapsed schedule time",
            expected_rate_bps, elapsed_ns
        );
    }

    Ok(())
}