// =============================================================================
// Rewards Integration Test Helpers
// =============================================================================
// Shared setup, deploy, and call helpers used across all rewards test files.
//
// CONVENTIONS:
// - Every test gets a fresh sandbox via `create_sandbox()`
// - `deploy_rewards()` deploys the rewards WASM and calls `new`
// - `deploy_mock_ft()` deploys the mock FT WASM and calls `new`
// - Action helpers wrap the `execute` entry point for readability
// - View helpers provide typed deserialization of common queries

use anyhow::Result;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::utils::get_wasm_path;

// =============================================================================
// Re-export sandbox setup so test files only need `use super::helpers::*`
// =============================================================================
pub use crate::utils::setup_sandbox as create_sandbox;

// =============================================================================
// Constants
// =============================================================================

/// 1 yoctoNEAR — required by ft_transfer (NEP-141).
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

/// 1 SOCIAL token (18 decimals).
pub const ONE_SOCIAL: u128 = 1_000_000_000_000_000_000;

/// Default max daily cap: 100 SOCIAL.
pub const DEFAULT_MAX_DAILY: u128 = 100 * ONE_SOCIAL;

/// Pool deposit used in tests: 10,000 SOCIAL.
pub const POOL_AMOUNT: u128 = 10_000 * ONE_SOCIAL;

/// Total supply minted to owner in mock-ft: 1,000,000 SOCIAL.
pub const TOTAL_SUPPLY: u128 = 1_000_000 * ONE_SOCIAL;

// =============================================================================
// View Structs (mirror contract return types for typed deserialization)
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractInfo {
    pub version: String,
    pub owner_id: String,
    pub social_token: String,
    pub max_daily: String,
    pub pool_balance: String,
    pub total_credited: String,
    pub total_claimed: String,
    pub intents_executors: Vec<String>,
    pub authorized_callers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserReward {
    pub claimable: u128,
    pub daily_earned: u128,
    pub last_day: u64,
    pub total_earned: u128,
    pub total_claimed: u128,
}

// =============================================================================
// Deploy & Init
// =============================================================================

/// Deploy the rewards-onsocial contract and call `new`.
pub async fn deploy_rewards(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
    ft_contract: &Contract,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("rewards-onsocial");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    owner
        .call(contract.id(), "new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
            "social_token": ft_contract.id().to_string(),
            "max_daily": DEFAULT_MAX_DAILY.to_string(),
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

/// Deploy mock-ft contract with 1M SOCIAL supply owned by `owner`.
pub async fn deploy_mock_ft(
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

/// Full setup: deploy mock-ft + rewards, register rewards on FT, deposit pool.
pub async fn full_setup(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> Result<(Account, Contract, Contract)> {
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(worker, &owner).await?;
    let rewards = deploy_rewards(worker, &owner, &ft).await?;

    // Register the rewards contract with the FT token
    ft_register(&ft, &owner, rewards.id()).await?;

    // Deposit pool via ft_transfer_call
    deposit_pool(&ft, &rewards, &owner, POOL_AMOUNT).await?;

    Ok((owner, ft, rewards))
}

// =============================================================================
// FT Helpers
// =============================================================================

/// Register an account on the FT contract via storage_deposit.
pub async fn ft_register(
    ft: &Contract,
    caller: &Account,
    account_id: &near_workspaces::AccountId,
) -> Result<()> {
    caller
        .call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": account_id.to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Check FT balance of an account.
pub async fn ft_balance_of(ft: &Contract, account_id: &str) -> Result<u128> {
    let res: Value = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": account_id }))
        .await?
        .json()?;
    Ok(res.as_str().unwrap().parse()?)
}

/// Deposit SOCIAL tokens to the rewards pool via ft_transfer_call.
pub async fn deposit_pool(
    ft: &Contract,
    rewards: &Contract,
    owner: &Account,
    amount: u128,
) -> Result<()> {
    owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": rewards.id().to_string(),
            "amount": amount.to_string(),
            "msg": json!({ "action": "deposit" }).to_string(),
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Mint tokens to account on mock-ft (test helper, also registers).
pub async fn ft_mint(ft: &Contract, account_id: &str, amount: u128) -> Result<()> {
    ft.call("mint")
        .args_json(json!({
            "account_id": account_id,
            "amount": amount.to_string(),
        }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

// =============================================================================
// Execute Helper — wraps the `execute` entry point (Direct auth)
// =============================================================================

/// Call `execute` on the rewards contract as `caller` using Direct auth.
pub async fn execute_action(
    rewards: &Contract,
    caller: &Account,
    action: Value,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let result = caller
        .call(rewards.id(), "execute")
        .args_json(json!({
            "request": {
                "action": action,
            }
        }))
        .max_gas()
        .transact()
        .await?;

    Ok(result)
}

/// Credit reward to an account.
pub async fn credit_reward(
    rewards: &Contract,
    caller: &Account,
    account_id: &str,
    amount: u128,
    source: Option<&str>,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut action = json!({
        "type": "credit_reward",
        "account_id": account_id,
        "amount": amount.to_string(),
    });
    if let Some(s) = source {
        action["source"] = json!(s);
    }
    execute_action(rewards, caller, action).await
}

/// Claim rewards for the calling account.
pub async fn claim_rewards(
    rewards: &Contract,
    caller: &Account,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(rewards, caller, json!({"type": "claim"})).await
}

// =============================================================================
// Admin Helpers
// =============================================================================

/// Add an authorized caller.
pub async fn add_authorized_caller(
    rewards: &Contract,
    owner: &Account,
    account_id: &str,
) -> Result<()> {
    owner
        .call(rewards.id(), "add_authorized_caller")
        .args_json(json!({ "account_id": account_id }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Transfer ownership.
pub async fn transfer_ownership(
    rewards: &Contract,
    owner: &Account,
    new_owner: &str,
) -> Result<()> {
    owner
        .call(rewards.id(), "transfer_ownership")
        .args_json(json!({ "new_owner": new_owner }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Set max daily cap.
pub async fn set_max_daily(rewards: &Contract, owner: &Account, new_max: u128) -> Result<()> {
    owner
        .call(rewards.id(), "set_max_daily")
        .args_json(json!({ "new_max": new_max.to_string() }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Set next ft_transfer to fail on mock-ft (for testing callbacks).
pub async fn set_ft_fail_next(ft: &Contract, should_fail: bool) -> Result<()> {
    ft.call("set_fail_next_transfer")
        .args_json(json!({ "should_fail": should_fail }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

// =============================================================================
// View Helpers
// =============================================================================

/// Query contract info.
pub async fn get_contract_info(rewards: &Contract) -> Result<ContractInfo> {
    let res: ContractInfo = rewards.view("get_contract_info").await?.json()?;
    Ok(res)
}

/// Query user reward.
pub async fn get_user_reward(rewards: &Contract, account_id: &str) -> Result<Option<UserReward>> {
    let res: Option<UserReward> = rewards
        .view("get_user_reward")
        .args_json(json!({ "account_id": account_id }))
        .await?
        .json()?;
    Ok(res)
}

/// Query claimable balance.
pub async fn get_claimable(rewards: &Contract, account_id: &str) -> Result<u128> {
    let res: Value = rewards
        .view("get_claimable")
        .args_json(json!({ "account_id": account_id }))
        .await?
        .json()?;
    Ok(res.as_str().unwrap().parse()?)
}

/// Query pool balance.
pub async fn get_pool_balance(rewards: &Contract) -> Result<u128> {
    let res: Value = rewards.view("get_pool_balance").await?.json()?;
    Ok(res.as_str().unwrap().parse()?)
}
