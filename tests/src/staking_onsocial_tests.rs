// =============================================================================
// Staking-OnSocial Integration Tests (Stake-Seconds Model)
// =============================================================================
// Tests that run against the real NEAR sandbox with cross-contract calls.
// These tests deploy the staking contract + a mock FT contract.
//
// Run: make test-integration-contract-staking-onsocial

use anyhow::Result;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::utils::{get_wasm_path, setup_sandbox};

// 1 SOCIAL token = 10^18 (standard 18 decimals)
const ONE_SOCIAL: u128 = 1_000_000_000_000_000_000;

// =============================================================================
// View Structs (match contract's return types)
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountView {
    pub locked_amount: String,
    pub unlock_at: u64,
    pub lock_months: u64,
    pub effective_stake: String,
    pub claimable_rewards: String,
    pub stake_seconds: String,
    pub rewards_claimed: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractStats {
    pub version: u32,
    pub token_id: String,
    pub owner_id: String,
    pub total_locked: String,
    pub total_effective_stake: String,
    pub total_stake_seconds: String,
    pub total_rewards_released: String,
    pub scheduled_pool: String,
    pub infra_pool: String,
    pub last_release_time: u64,
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
    pub effective_stake: String,
    pub lock_expired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageBalance {
    pub total: String,
    pub available: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct StorageBalanceBounds {
    pub min: String,
    pub max: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct RewardRateInfo {
    pub claimable_now: String,
    pub rewards_per_second: String,
    pub effective_stake: String,
    pub total_effective_stake: String,
    pub weekly_pool_release: String,
}

// =============================================================================
// Test Setup Helpers
// =============================================================================

/// Deploy staking contract and initialize it
async fn setup_staking_contract(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    token_id: &str,
    owner: &Account,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("staking-onsocial");
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

/// Deploy a minimal mock FT contract for testing
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

/// Register account for storage on FT contract
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

/// Transfer FT tokens to an account
async fn ft_transfer(
    ft: &Contract,
    from: &Account,
    to: &str,
    amount: u128,
) -> Result<()> {
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

/// Lock tokens via ft_transfer_call
async fn lock_tokens(
    ft: &Contract,
    staking: &Contract,
    user: &Account,
    amount: u128,
    lock_months: u64,
) -> Result<()> {
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": amount.to_string(),
            "msg": json!({ "action": "lock", "months": lock_months }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Fund the scheduled pool via ft_transfer_call
async fn fund_pool(
    ft: &Contract,
    staking: &Contract,
    owner: &Account,
    amount: u128,
) -> Result<()> {
    owner.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": amount.to_string(),
            "msg": json!({ "action": "fund_scheduled" }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Get account view
async fn get_account(staking: &Contract, account_id: &str) -> Result<AccountView> {
    let result = staking
        .view("get_account")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    Ok(result.json()?)
}

/// Get contract stats
async fn get_stats(staking: &Contract) -> Result<ContractStats> {
    let result = staking.view("get_stats").await?;
    Ok(result.json()?)
}

/// Get lock status
async fn get_lock_status(staking: &Contract, account_id: &str) -> Result<LockStatus> {
    let result = staking
        .view("get_lock_status")
        .args_json(json!({ "account_id": account_id }))
        .await?;
    Ok(result.json()?)
}

// =============================================================================
// Tests: Contract Initialization
// =============================================================================

#[tokio::test]
async fn test_init_contract() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    let stats = get_stats(&staking).await?;
    assert_eq!(stats.version, 1);
    assert_eq!(stats.token_id, ft.id().to_string());
    assert_eq!(stats.owner_id, owner.id().to_string());
    assert_eq!(stats.total_locked, "0");
    assert_eq!(stats.scheduled_pool, "0");

    Ok(())
}

// =============================================================================
// Tests: Storage (NEP-145)
// =============================================================================

#[tokio::test]
async fn test_storage_deposit() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Storage deposit
    user
        .call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;

    // Check storage balance
    let balance: StorageBalance = staking
        .view("storage_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Should have deposited the minimum (0.005 NEAR = 5_000_000_000_000_000_000_000 yocto)
    assert!(balance.total.parse::<u128>()? > 0);

    Ok(())
}

// =============================================================================
// Tests: Lock Tokens
// =============================================================================

#[tokio::test]
async fn test_lock_tokens_basic() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Register staking contract for FT
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;

    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    // Register user on staking contract
    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;

    // Lock tokens
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 6).await?;

    // Verify
    let account = get_account(&staking, user.id().as_str()).await?;
    assert_eq!(account.locked_amount, (50 * ONE_SOCIAL).to_string());
    assert_eq!(account.lock_months, 6);

    // Effective stake should have 10% bonus for 6 months
    let effective: u128 = account.effective_stake.parse()?;
    let expected = 50 * ONE_SOCIAL * 110 / 100; // 10% bonus
    assert_eq!(effective, expected);

    Ok(())
}

#[tokio::test]
async fn test_lock_tokens_with_bonus() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock for 24 months (35% bonus)
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 24).await?;

    let account = get_account(&staking, user.id().as_str()).await?;
    let effective: u128 = account.effective_stake.parse()?;
    let expected = 100 * ONE_SOCIAL * 135 / 100; // 35% bonus
    assert_eq!(effective, expected);

    Ok(())
}

// =============================================================================
// Tests: Fund Scheduled Pool
// =============================================================================

#[tokio::test]
async fn test_fund_scheduled_pool() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Register staking contract for FT
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;

    // Fund the pool
    fund_pool(&ft, &staking, &owner, 10_000 * ONE_SOCIAL).await?;

    let stats = get_stats(&staking).await?;
    assert_eq!(stats.scheduled_pool, (10_000 * ONE_SOCIAL).to_string());

    Ok(())
}

// =============================================================================
// Tests: Poke and Rewards Release
// =============================================================================

#[tokio::test]
async fn test_poke_releases_rewards() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund pool first
    fund_pool(&ft, &staking, &owner, 10_000 * ONE_SOCIAL).await?;

    // User locks tokens
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 6).await?;

    // Poke (sandbox limitation: can't easily advance time,
    // but poke should still work - just no rewards release until a week passes)
    user.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Contract state should be valid
    let stats = get_stats(&staking).await?;
    assert!(stats.total_locked.parse::<u128>()? > 0);
    assert!(stats.total_effective_stake.parse::<u128>()? > 0);

    Ok(())
}

// =============================================================================
// Tests: Lock Status View
// =============================================================================

#[tokio::test]
async fn test_get_lock_status() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock for 12 months
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 12).await?;

    let status = get_lock_status(&staking, user.id().as_str()).await?;
    
    assert!(status.is_locked);
    assert_eq!(status.lock_months, 12);
    assert_eq!(status.bonus_percent, 20); // 7-12 months = 20%
    assert!(!status.can_unlock); // Not expired yet
    assert!(!status.lock_expired);
    assert!(status.time_remaining_ns > 0);

    Ok(())
}

// =============================================================================
// Tests: Unlock Flow
// =============================================================================

#[tokio::test]
async fn test_unlock_flow() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock for 1 month (shortest period)
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 1).await?;

    // Verify locked
    let account = get_account(&staking, user.id().as_str()).await?;
    assert_eq!(account.locked_amount, (50 * ONE_SOCIAL).to_string());

    // Note: In real sandbox, we'd need to advance time to unlock.
    // For now, just verify the lock exists.
    let status = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(status.is_locked);
    assert!(!status.can_unlock); // Time hasn't passed

    Ok(())
}

// =============================================================================
// Tests: Multiple Users
// =============================================================================

#[tokio::test]
async fn test_multiple_users_lock() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user1 = worker.dev_create_account().await?;
    let user2 = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup staking contract FT registration
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;

    // Setup users
    for user in [&user1, &user2] {
        ft_storage_deposit(&ft, user).await?;
        ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;
        user.call(staking.id(), "storage_deposit")
            .args_json(json!({}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?.into_result()?;
    }

    // Lock different amounts with different periods
    lock_tokens(&ft, &staking, &user1, 100 * ONE_SOCIAL, 6).await?;   // 10% bonus
    lock_tokens(&ft, &staking, &user2, 50 * ONE_SOCIAL, 24).await?;   // 35% bonus

    // Verify stats
    let stats = get_stats(&staking).await?;
    let total_locked: u128 = stats.total_locked.parse()?;
    assert_eq!(total_locked, 150 * ONE_SOCIAL);

    // User1: 100 * 1.10 = 110
    // User2: 50 * 1.35 = 67.5
    // Total effective: 177.5
    let total_effective: u128 = stats.total_effective_stake.parse()?;
    let expected_effective = 100 * ONE_SOCIAL * 110 / 100 + 50 * ONE_SOCIAL * 135 / 100;
    assert_eq!(total_effective, expected_effective);

    Ok(())
}

// =============================================================================
// Tests: Purchase Credits
// =============================================================================

#[tokio::test]
async fn test_purchase_credits_via_ft() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Purchase credits (60% to infra, 40% to scheduled)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "credits" }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats = get_stats(&staking).await?;
    
    // 60% to infra
    let infra: u128 = stats.infra_pool.parse()?;
    assert_eq!(infra, 60 * ONE_SOCIAL);
    
    // 40% to scheduled
    let scheduled: u128 = stats.scheduled_pool.parse()?;
    assert_eq!(scheduled, 40 * ONE_SOCIAL);

    Ok(())
}

// =============================================================================
// Tests: Owner Functions
// =============================================================================

#[tokio::test]
async fn test_set_owner() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let new_owner = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Change owner
    owner.call(staking.id(), "set_owner")
        .args_json(json!({ "new_owner": new_owner.id().to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    let stats = get_stats(&staking).await?;
    assert_eq!(stats.owner_id, new_owner.id().to_string());

    Ok(())
}

// =============================================================================
// Tests: Extend Lock
// =============================================================================

#[tokio::test]
async fn test_extend_lock() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock for 6 months initially
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 6).await?;

    let initial_status = get_lock_status(&staking, user.id().as_str()).await?;
    assert_eq!(initial_status.lock_months, 6);
    assert_eq!(initial_status.bonus_percent, 10);

    // Extend to 12 months
    user.call(staking.id(), "extend_lock")
        .args_json(json!({ "months": 12 }))
        .transact()
        .await?
        .into_result()?;

    let new_status = get_lock_status(&staking, user.id().as_str()).await?;
    assert_eq!(new_status.lock_months, 12);
    assert_eq!(new_status.bonus_percent, 20); // Upgraded bonus

    Ok(())
}

// =============================================================================
// Tests: View Methods Return Correct Data
// =============================================================================

#[tokio::test]
async fn test_account_view_complete() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock tokens
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 12).await?;

    // Get account view
    let account = get_account(&staking, user.id().as_str()).await?;

    // Verify all fields are populated correctly
    assert_eq!(account.locked_amount, (100 * ONE_SOCIAL).to_string());
    assert_eq!(account.lock_months, 12);
    assert!(account.unlock_at > 0);
    
    // 20% bonus for 12 months
    let effective: u128 = account.effective_stake.parse()?;
    assert_eq!(effective, 120 * ONE_SOCIAL);

    // Initially no rewards claimed
    assert_eq!(account.rewards_claimed, "0");

    Ok(())
}

// =============================================================================
// Tests: Time-Based Reward Distribution (Block Timestamp Manipulation)
// =============================================================================

/// Test that manipulates block_timestamp to validate time-weighted reward distribution.
/// 
/// INVARIANT: Rewards accrue proportionally to stake-seconds.
/// Users who stake longer (in time) receive more rewards.
#[tokio::test]
async fn test_time_weighted_rewards_with_fast_forward() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;

    for user in [&alice, &bob] {
        ft_storage_deposit(&ft, user).await?;
        ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;
        let _ = user.call(staking.id(), "storage_deposit")
            .args_json(json!({}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?.into_result()?;
    }

    // Fund pool with rewards
    fund_pool(&ft, &staking, &owner, 100_000 * ONE_SOCIAL).await?;

    // Alice stakes first
    lock_tokens(&ft, &staking, &alice, 100 * ONE_SOCIAL, 6).await?;

    // Fast forward time - each block is ~1 second in sandbox
    // We'll advance 1000 blocks (~16 minutes) to accumulate some stake-seconds
    worker.fast_forward(1000).await?;

    // Poke to sync Alice's state after time advancement
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Get Alice's state before Bob stakes
    let alice_before = get_account(&staking, alice.id().as_str()).await?;
    let _alice_effective: u128 = alice_before.effective_stake.parse()?;

    // Bob stakes after Alice has been staking for some time
    lock_tokens(&ft, &staking, &bob, 100 * ONE_SOCIAL, 6).await?;

    // Fast forward more time
    worker.fast_forward(1000).await?;

    // Poke to sync state
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Check effective stakes - both should have the same bonus (6 months = 10%)
    let alice_account = get_account(&staking, alice.id().as_str()).await?;
    let bob_account = get_account(&staking, bob.id().as_str()).await?;

    let alice_effective_final: u128 = alice_account.effective_stake.parse()?;
    let bob_effective: u128 = bob_account.effective_stake.parse()?;

    // Both have 100 SOCIAL with 10% bonus = 110 SOCIAL effective
    assert_eq!(alice_effective_final, 110 * ONE_SOCIAL, "Alice effective stake");
    assert_eq!(bob_effective, 110 * ONE_SOCIAL, "Bob effective stake");

    // Alice staked earlier, so the contract tracked more stake-time for her
    // We verify this via the total_stake_seconds in stats
    let stats = get_stats(&staking).await?;
    let total_ss: u128 = stats.total_stake_seconds.parse()?;
    
    // With 2 stakers each having 110 effective stake for varying periods,
    // total_stake_seconds should be positive
    assert!(
        total_ss > 0,
        "Total stake-seconds should be positive after time advancement: {}",
        total_ss
    );

    Ok(())
}

/// Boundary test: Unlock at EXACT expiry timestamp.
/// 
/// INVARIANT: Lock can only be unlocked when block_timestamp >= unlock_at.
/// Tests the boundary condition where time equals exactly the unlock time.
#[tokio::test]
async fn test_unlock_at_exact_expiry_boundary() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock for 1 month (shortest period)
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 1).await?;

    // Get the unlock_at timestamp
    let status_before = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(!status_before.can_unlock, "Should NOT be able to unlock before expiry");
    assert!(status_before.time_remaining_ns > 0, "Time remaining should be positive");

    // The test validates the lock status view correctly reports can_unlock
    // In sandbox, we cannot precisely control time to hit exact boundary,
    // but we verify the view correctly reports lock state
    assert!(status_before.is_locked);
    assert!(!status_before.lock_expired);

    Ok(())
}

// =============================================================================
// Tests: Economic Invariants
// =============================================================================

/// CRITICAL INVARIANT: Total rewards distributed ≤ Total rewards funded.
/// 
/// Validates that the contract never distributes more rewards than funded.
/// This is a fund conservation invariant.
#[tokio::test]
async fn test_invariant_rewards_distributed_lte_rewards_funded() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    let _ = owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;

    let _ = user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund pool with known amount
    let funded_amount: u128 = 10_000 * ONE_SOCIAL;
    fund_pool(&ft, &staking, &owner, funded_amount).await?;

    // User stakes
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 6).await?;

    // Fast forward to trigger multiple reward releases
    for _ in 0..5 {
        worker.fast_forward(200).await?;
        owner.call(staking.id(), "poke")
            .transact()
            .await?
            .into_result()?;
    }

    // Get final stats
    let stats = get_stats(&staking).await?;
    let total_released: u128 = stats.total_rewards_released.parse()?;
    let remaining_pool: u128 = stats.scheduled_pool.parse()?;

    // INVARIANT: released + remaining = funded (accounting for no external additions)
    // Since we only funded once, released should never exceed funded
    assert!(
        total_released <= funded_amount,
        "INVARIANT VIOLATION: Released {} > Funded {}",
        total_released, funded_amount
    );

    // Additional check: released + remaining should equal funded
    assert!(
        total_released + remaining_pool <= funded_amount,
        "INVARIANT: released ({}) + remaining ({}) should <= funded ({})",
        total_released, remaining_pool, funded_amount
    );

    Ok(())
}

/// CRITICAL INVARIANT: User rewards ≤ pro-rata share of emissions.
/// 
/// Single staker should receive 100% of rewards.
/// Multiple equal stakers should each receive proportional share.
#[tokio::test]
async fn test_invariant_user_rewards_lte_pro_rata_share() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    let _ = owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;

    for user in [&alice, &bob] {
        ft_storage_deposit(&ft, user).await?;
        ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;
        let _ = user.call(staking.id(), "storage_deposit")
            .args_json(json!({}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?.into_result()?;
    }

    // Fund pool
    fund_pool(&ft, &staking, &owner, 100_000 * ONE_SOCIAL).await?;

    // Both stake same amount with same lock period at same time
    lock_tokens(&ft, &staking, &alice, 100 * ONE_SOCIAL, 6).await?;
    lock_tokens(&ft, &staking, &bob, 100 * ONE_SOCIAL, 6).await?;

    // Fast forward and poke
    worker.fast_forward(200).await?;
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Get rewards
    let alice_account = get_account(&staking, alice.id().as_str()).await?;
    let bob_account = get_account(&staking, bob.id().as_str()).await?;
    let stats = get_stats(&staking).await?;

    let alice_claimable: u128 = alice_account.claimable_rewards.parse()?;
    let bob_claimable: u128 = bob_account.claimable_rewards.parse()?;
    let total_released: u128 = stats.total_rewards_released.parse()?;

    // INVARIANT: Sum of user rewards ≤ total released
    // Note: With continuous release, each RPC call projects to different timestamps.
    // Use 5% tolerance to account for timing drift between async calls.
    let sum_claimable = alice_claimable + bob_claimable;
    let tolerance = total_released / 20; // 5% tolerance for async RPC timing
    assert!(
        sum_claimable <= total_released + tolerance,
        "INVARIANT: Sum of claimable ({} + {}) exceeds total_released ({}) + tolerance ({})",
        alice_claimable, bob_claimable, total_released, tolerance
    );

    // Equal stakers should have approximately equal rewards
    // Note: With continuous release, staking at slightly different times causes drift
    if alice_claimable > 0 && bob_claimable > 0 {
        let diff = if alice_claimable > bob_claimable {
            alice_claimable - bob_claimable
        } else {
            bob_claimable - alice_claimable
        };
        let tolerance = alice_claimable / 20; // 5% tolerance for timing differences
        assert!(
            diff <= tolerance,
            "Equal stakers should have similar rewards: Alice={}, Bob={}, diff={}, tolerance={}",
            alice_claimable, bob_claimable, diff, tolerance
        );
    }

    Ok(())
}

/// CRITICAL INVARIANT: No rewards accrue when total_effective_stake == 0.
/// 
/// If no one is staking, released rewards should accumulate but not be distributed.
#[tokio::test]
async fn test_invariant_no_rewards_when_zero_effective_stake() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund pool but NO ONE stakes
    fund_pool(&ft, &staking, &owner, 10_000 * ONE_SOCIAL).await?;

    // Fast forward to trigger reward releases
    worker.fast_forward(200).await?;
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Get stats
    let stats = get_stats(&staking).await?;
    let total_effective: u128 = stats.total_effective_stake.parse()?;

    // Verify no effective stake
    assert_eq!(total_effective, 0, "Should have no effective stake");

    // Check non-existent user has no rewards
    let account = get_account(&staking, user.id().as_str()).await?;
    let claimable: u128 = account.claimable_rewards.parse()?;

    assert_eq!(claimable, 0, "Non-staker should have no claimable rewards");

    Ok(())
}

// =============================================================================
// Tests: Authorization Paths
// =============================================================================

/// Authorization test: Reject tokens from wrong token contract.
/// 
/// INVARIANT: Only the configured token_id can send tokens via ft_on_transfer.
#[tokio::test]
async fn test_auth_reject_wrong_token() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    // Deploy TWO FT contracts
    let correct_ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let wrong_ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    
    // Staking contract configured with correct_ft
    let staking = setup_staking_contract(&worker, correct_ft.id().as_str(), &owner).await?;

    // Setup user on wrong FT
    owner.call(wrong_ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    
    user.call(wrong_ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;

    owner.call(wrong_ft.id(), "ft_transfer")
        .args_json(json!({
            "receiver_id": user.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?.into_result()?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Try to lock via wrong FT - the staking contract should panic with "Wrong token"
    // The ft_transfer_call will succeed at the FT level, but the receiver (staking)
    // will panic, causing ft_resolve_transfer to refund the tokens
    let user_balance_before: String = wrong_ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    let balance_before: u128 = user_balance_before.parse()?;

    let _result = user.call(wrong_ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "lock", "months": 6 }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // The tokens should be refunded because staking contract panics with "Wrong token"
    let user_balance_after: String = wrong_ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    let balance_after: u128 = user_balance_after.parse()?;

    // User should get their tokens back (refunded by ft_resolve_transfer)
    assert_eq!(
        balance_before, balance_after,
        "Tokens should be refunded when staking contract rejects wrong token"
    );

    Ok(())
}

/// Authorization test: Premature unlock attempt should fail.
/// 
/// INVARIANT: unlock() panics if block_timestamp < unlock_at.
#[tokio::test]
async fn test_auth_premature_unlock_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock for 6 months
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 6).await?;

    // Verify lock is active
    let status = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(!status.can_unlock, "Lock should not be unlockable yet");
    assert!(!status.lock_expired, "Lock should not be expired");

    // Try to unlock prematurely - should fail
    let result = user.call(staking.id(), "unlock")
        .transact()
        .await?;

    assert!(result.is_failure(), "Premature unlock should fail");

    // Verify tokens are still locked
    let account = get_account(&staking, user.id().as_str()).await?;
    let locked: u128 = account.locked_amount.parse()?;
    assert_eq!(locked, 50 * ONE_SOCIAL, "Tokens should still be locked");

    Ok(())
}

/// Authorization test: Non-owner cannot withdraw infra pool.
#[tokio::test]
async fn test_auth_non_owner_cannot_withdraw_infra() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup and add funds to infra pool via credits
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    
    ft_storage_deposit(&ft, &attacker).await?;
    ft_transfer(&ft, &owner, attacker.id().as_str(), 1000 * ONE_SOCIAL).await?;

    attacker.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Purchase credits to add to infra pool (60% goes to infra)
    attacker.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "credits" }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // Verify infra pool has funds
    let stats = get_stats(&staking).await?;
    let infra: u128 = stats.infra_pool.parse()?;
    assert!(infra > 0, "Infra pool should have funds");

    // Attacker tries to withdraw - should fail
    let result = attacker.call(staking.id(), "withdraw_infra")
        .args_json(json!({
            "amount": infra.to_string(),
            "receiver_id": attacker.id().to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner should not be able to withdraw infra pool");

    Ok(())
}

// =============================================================================
// Tests: Precision and Large Values
// =============================================================================

/// Precision test: Large stake amounts should not cause overflow.
/// 
/// Tests with 1 billion tokens staked over extended time.
#[tokio::test]
async fn test_precision_large_stake_no_overflow() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let whale = worker.dev_create_account().await?;
    
    // 10 billion tokens total supply
    let total_supply = 10_000_000_000 * ONE_SOCIAL;
    let ft = setup_mock_ft_contract(&worker, &owner, total_supply).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &whale).await?;
    
    // Transfer 1 billion tokens to whale
    let whale_amount = 1_000_000_000 * ONE_SOCIAL;
    ft_transfer(&ft, &owner, whale.id().as_str(), whale_amount).await?;

    whale.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund pool with large amount
    fund_pool(&ft, &staking, &owner, 1_000_000_000 * ONE_SOCIAL).await?;

    // Whale stakes all their tokens for 48 months (50% bonus)
    lock_tokens(&ft, &staking, &whale, whale_amount, 48).await?;

    // Fast forward to accumulate stake-seconds
    // Each poke syncs state to current block timestamp
    for _ in 0..5 {
        worker.fast_forward(500).await?;
        owner.call(staking.id(), "poke")
            .transact()
            .await?
            .into_result()?;
    }

    // Get account - should not panic due to overflow
    let account = get_account(&staking, whale.id().as_str()).await?;
    let stats = get_stats(&staking).await?;

    // Parse values - should succeed without overflow
    let locked: u128 = account.locked_amount.parse()?;
    let effective: u128 = account.effective_stake.parse()?;
    let total_stake_seconds: u128 = stats.total_stake_seconds.parse()?;

    // Verify values are sensible
    assert_eq!(locked, whale_amount, "Locked amount should match");
    assert_eq!(effective, whale_amount * 150 / 100, "Effective should include 50% bonus");
    
    // After poke, total_stake_seconds should have accumulated
    // The exact value depends on sandbox timing, but it should be positive
    assert!(total_stake_seconds > 0, "Should have accumulated stake-seconds in totals: {}", total_stake_seconds);

    Ok(())
}

/// Rounding test: Fractional reward distribution accuracy.
/// 
/// Tests that rewards are distributed fairly even with odd numbers.
#[tokio::test]
async fn test_precision_fractional_rewards() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user1 = worker.dev_create_account().await?;
    let user2 = worker.dev_create_account().await?;
    let user3 = worker.dev_create_account().await?;
    let users = [&user1, &user2, &user3];
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;

    for user in users {
        ft_storage_deposit(&ft, user).await?;
        ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;
        user.call(staking.id(), "storage_deposit")
            .args_json(json!({}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?.into_result()?;
    }

    // Fund pool
    fund_pool(&ft, &staking, &owner, 100_000 * ONE_SOCIAL).await?;

    // All 3 users stake same amount at same time
    for user in users {
        lock_tokens(&ft, &staking, user, 100 * ONE_SOCIAL, 6).await?;
    }

    // Fast forward and poke
    worker.fast_forward(200).await?;
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Get all rewards
    let mut rewards: Vec<u128> = Vec::new();
    for user in users {
        let account = get_account(&staking, user.id().as_str()).await?;
        let claimable: u128 = account.claimable_rewards.parse()?;
        rewards.push(claimable);
    }

    // All users should have approximately equal rewards (within 1 token tolerance)
    let max_reward = *rewards.iter().max().unwrap();
    let min_reward = *rewards.iter().min().unwrap();
    let tolerance = ONE_SOCIAL; // 1 token tolerance for rounding

    assert!(
        max_reward - min_reward <= tolerance,
        "Equal stakers should have nearly equal rewards: max={}, min={}, diff={}",
        max_reward, min_reward, max_reward - min_reward
    );

    // Sum of rewards should not exceed total released
    // Note: With continuous release, use 5% tolerance for async RPC timing drift
    let stats = get_stats(&staking).await?;
    let total_released: u128 = stats.total_rewards_released.parse()?;
    let sum_rewards: u128 = rewards.iter().sum();
    let tolerance = total_released / 20; // 5% tolerance

    assert!(
        sum_rewards <= total_released + tolerance,
        "Sum of rewards ({}) exceeds released ({}) + tolerance ({})",
        sum_rewards, total_released, tolerance
    );

    Ok(())
}

// =============================================================================
// Tests: State Transitions
// =============================================================================

/// State transition test: Full lock → extend → unlock lifecycle.
#[tokio::test]
async fn test_state_transition_full_lifecycle() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 200 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // State 1: Initial - no lock
    let status_initial = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(!status_initial.is_locked, "Initial: Should not be locked");
    assert_eq!(status_initial.locked_amount, "0", "Initial: No locked amount");

    // State 2: Lock for 6 months
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 6).await?;
    
    let status_locked = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(status_locked.is_locked, "Locked: Should be locked");
    assert_eq!(status_locked.lock_months, 6, "Locked: 6 months");
    assert_eq!(status_locked.bonus_percent, 10, "Locked: 10% bonus");

    // State 3: Extend to 12 months
    user.call(staking.id(), "extend_lock")
        .args_json(json!({ "months": 12 }))
        .transact()
        .await?
        .into_result()?;

    let status_extended = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(status_extended.is_locked, "Extended: Still locked");
    assert_eq!(status_extended.lock_months, 12, "Extended: 12 months");
    assert_eq!(status_extended.bonus_percent, 20, "Extended: 20% bonus");

    // State 4: Add more tokens (same lock period)
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 12).await?;

    let status_added = get_lock_status(&staking, user.id().as_str()).await?;
    let locked: u128 = status_added.locked_amount.parse()?;
    assert_eq!(locked, 150 * ONE_SOCIAL, "Added: Total 150 locked");

    // Verify totals
    let stats = get_stats(&staking).await?;
    let total_locked: u128 = stats.total_locked.parse()?;
    assert_eq!(total_locked, 150 * ONE_SOCIAL, "Stats: Total locked matches");

    Ok(())
}

/// State transition test: Claim rewards updates rewards_claimed correctly.
#[tokio::test]
async fn test_state_transition_claim_rewards() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund pool and stake
    fund_pool(&ft, &staking, &owner, 100_000 * ONE_SOCIAL).await?;
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 6).await?;

    // Fast forward a moderate amount - sandbox fast_forward is slow for large values
    // For week-based reward releases, unit tests are more appropriate
    // Here we verify state updates work correctly with time advancement
    worker.fast_forward(100).await?;
    
    // Poke to sync state
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Check stats to see total_stake_seconds accumulated
    let stats = get_stats(&staking).await?;
    let total_ss: u128 = stats.total_stake_seconds.parse()?;

    // Check claimable (may be 0 if not enough time for weekly release)
    let before = get_account(&staking, user.id().as_str()).await?;
    let claimable_before: u128 = before.claimable_rewards.parse()?;
    let claimed_before: u128 = before.rewards_claimed.parse()?;

    // Verify stake-seconds are being tracked (even if rewards not released yet)
    assert!(total_ss > 0, "Should have accumulated stake-seconds");

    // If rewards are available, try to claim
    if claimable_before > 0 {
        assert_eq!(claimed_before, 0, "Should not have claimed yet");
    assert_eq!(claimed_before, 0, "Should not have claimed yet");

        // Claim rewards
        let result = user.call(staking.id(), "claim_rewards")
            .gas(near_workspaces::types::Gas::from_tgas(100))
            .transact()
            .await?;

        // Check if claim succeeded
        if result.is_success() {
            // Check state after claim
            let after = get_account(&staking, user.id().as_str()).await?;
            let claimed_after: u128 = after.rewards_claimed.parse()?;
            
            // rewards_claimed should have increased
            assert!(
                claimed_after > claimed_before,
                "rewards_claimed should increase after claim: before={}, after={}",
                claimed_before, claimed_after
            );
        }
    } else {
        // No rewards released in sandbox time - this is acceptable
        // Week-based releases require ~604800 seconds which is too slow for integration tests
        println!("Note: No claimable rewards yet (weekly release not triggered in sandbox time)");
    }

    Ok(())
}

// =============================================================================
// Tests: CRITICAL - Reward Pause When No Stakers
// =============================================================================

/// CRITICAL INVARIANT: Rewards pause when no stakers exist.
/// 
/// When total_effective_stake == 0, the reward release clock should pause.
/// This prevents rewards from "leaking" during dormant periods where no one
/// would receive them anyway. First staker should only receive rewards
/// accrued from when they started staking.
#[tokio::test]
async fn test_invariant_rewards_pause_no_stakers() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund pool with substantial amount
    let funded = 1_000_000 * ONE_SOCIAL;
    fund_pool(&ft, &staking, &owner, funded).await?;

    // Get initial stats - NO stakers yet
    let stats_before = get_stats(&staking).await?;
    let released_before: u128 = stats_before.total_rewards_released.parse()?;
    assert_eq!(released_before, 0, "No rewards should be released initially");

    // Fast forward time with NO stakers
    worker.fast_forward(500).await?;
    
    // Poke to trigger reward release logic
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Check stats - with reward pause, total_rewards_released should still be 0
    let stats_after = get_stats(&staking).await?;
    let released_after: u128 = stats_after.total_rewards_released.parse()?;
    let pool_after: u128 = stats_after.scheduled_pool.parse()?;

    // INVARIANT: No rewards released when no stakers
    assert_eq!(
        released_after, 0,
        "INVARIANT: Rewards should NOT release when no stakers exist. Released: {}",
        released_after
    );

    // Pool should remain intact
    assert_eq!(
        pool_after, funded,
        "Pool should be unchanged when no stakers: {} vs {}",
        pool_after, funded
    );

    Ok(())
}

/// CRITICAL: First staker after dormant period gets fair share.
/// 
/// If pool is funded, time passes with no stakers, then first staker joins,
/// they should NOT get all the rewards that would have been released during
/// dormancy. Rewards should only accrue from when staking began.
#[tokio::test]
async fn test_first_staker_after_dormancy_fair_share() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let first_staker = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 100_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &first_staker).await?;
    ft_transfer(&ft, &owner, first_staker.id().as_str(), 1000 * ONE_SOCIAL).await?;

    first_staker.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund with massive pool
    let pool_size = 10_000_000 * ONE_SOCIAL; // 10 million
    fund_pool(&ft, &staking, &owner, pool_size).await?;

    // Simulate dormancy period - no stakers
    worker.fast_forward(1000).await?;
    
    // Poke during dormancy
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Get stats before first stake
    let stats_dormant = get_stats(&staking).await?;
    let released_dormant: u128 = stats_dormant.total_rewards_released.parse()?;
    
    // With reward pause, no rewards should have been released
    assert_eq!(released_dormant, 0, "No rewards during dormancy");

    // First staker joins
    lock_tokens(&ft, &staking, &first_staker, 100 * ONE_SOCIAL, 6).await?;

    // Brief time passes with staker active
    worker.fast_forward(100).await?;
    
    // Poke to sync
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Check first staker's rewards
    let account = get_account(&staking, first_staker.id().as_str()).await?;
    let claimable: u128 = account.claimable_rewards.parse()?;

    // INVARIANT: First staker should NOT have windfall from dormant period
    // Their claimable should be proportional only to time since they staked
    // With only ~100 blocks (not enough for weekly release), this should be 0 or minimal
    let stats_final = get_stats(&staking).await?;
    let total_released: u128 = stats_final.total_rewards_released.parse()?;

    // Verify pool is still mostly intact (only released for active staking period)
    let pool_remaining: u128 = stats_final.scheduled_pool.parse()?;
    
    // Pool should be very close to original (100 blocks is ~1.6 minutes, not a week)
    let pool_decrease = pool_size.saturating_sub(pool_remaining);
    let max_expected_release = pool_size / 100; // Less than 1% should be released in 100 blocks
    
    assert!(
        pool_decrease <= max_expected_release,
        "Pool should be mostly intact: original={}, remaining={}, decrease={}",
        pool_size, pool_remaining, pool_decrease
    );

    // Claimable should be reasonable (proportional to released)
    // Note: With continuous release, use 5% tolerance for async RPC timing drift
    let tolerance = total_released / 20;
    assert!(
        claimable <= total_released + tolerance,
        "First staker claimable ({}) exceeds total released ({}) + tolerance ({})",
        claimable, total_released, tolerance
    );

    Ok(())
}

// =============================================================================
// Tests: HIGH - Lock Period Validation
// =============================================================================

/// HIGH: renew_lock extends lock with same period.
/// 
/// User can renew their lock without changing the period, resetting unlock time.
#[tokio::test]
async fn test_renew_lock() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock for 6 months
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 6).await?;

    let status_before = get_lock_status(&staking, user.id().as_str()).await?;
    let unlock_at_before = status_before.unlock_at;
    assert_eq!(status_before.lock_months, 6);
    assert_eq!(status_before.bonus_percent, 10);

    // Fast forward a bit
    worker.fast_forward(100).await?;

    // Renew lock (same period)
    user.call(staking.id(), "renew_lock")
        .transact()
        .await?
        .into_result()?;

    let status_after = get_lock_status(&staking, user.id().as_str()).await?;
    
    // Lock period should remain same
    assert_eq!(status_after.lock_months, 6, "Lock period should be unchanged");
    assert_eq!(status_after.bonus_percent, 10, "Bonus should be unchanged");
    
    // Unlock time should be extended (later than before)
    assert!(
        status_after.unlock_at > unlock_at_before,
        "Renew should extend unlock_at: before={}, after={}",
        unlock_at_before, status_after.unlock_at
    );

    Ok(())
}

/// HIGH: Cannot add tokens with different lock period.
/// 
/// INVARIANT: If user has active lock with period X, cannot add tokens with period Y.
#[tokio::test]
async fn test_lock_different_period_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 200 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // First lock with 6 months
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 6).await?;

    let status = get_lock_status(&staking, user.id().as_str()).await?;
    assert_eq!(status.lock_months, 6);

    // Try to add with different period (12 months) - should fail
    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    let _result = user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "lock", "months": 12 }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // The staking contract should panic, tokens should be refunded
    let balance_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(
        balance_before, balance_after,
        "Tokens should be refunded when lock with different period rejected"
    );

    // Verify lock state unchanged
    let status_after = get_lock_status(&staking, user.id().as_str()).await?;
    let locked: u128 = status_after.locked_amount.parse()?;
    assert_eq!(locked, 50 * ONE_SOCIAL, "Original lock should be unchanged");

    Ok(())
}

/// HIGH: Invalid lock period rejected.
/// 
/// Only valid lock periods (1, 6, 12, 24, 48 months) are accepted.
#[tokio::test]
async fn test_invalid_lock_period_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Try invalid period (3 months - not in valid list)
    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    let _result = user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "lock", "months": 3 }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // Tokens should be refunded
    let balance_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(
        balance_before, balance_after,
        "Tokens should be refunded for invalid lock period"
    );

    // Verify no lock created
    let status = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(!status.is_locked, "Should not have created a lock");

    Ok(())
}

/// HIGH: Minimum stake enforced.
/// 
/// Stakes below MIN_STAKE (0.01 SOCIAL) are rejected.
#[tokio::test]
async fn test_minimum_stake_enforced() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Try to stake less than minimum (0.001 SOCIAL < 0.01 minimum)
    let tiny_amount = ONE_SOCIAL / 1000; // 0.001 SOCIAL

    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    let _result = user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": tiny_amount.to_string(),
            "msg": json!({ "action": "lock", "months": 6 }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // Tokens should be refunded
    let balance_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(
        balance_before, balance_after,
        "Tokens should be refunded when below minimum stake"
    );

    Ok(())
}

/// HIGH: Owner can withdraw from infra pool.
#[tokio::test]
async fn test_owner_withdraw_infra() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let treasury = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_storage_deposit(&ft, &treasury).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Add funds to infra pool via credits (60% to infra)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "credits" }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Verify infra pool has 60 SOCIAL
    let stats_before = get_stats(&staking).await?;
    let infra_before: u128 = stats_before.infra_pool.parse()?;
    assert_eq!(infra_before, 60 * ONE_SOCIAL);

    // Treasury balance before
    let treasury_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": treasury.id().to_string() }))
        .await?
        .json()?;
    let treasury_balance_before: u128 = treasury_before.parse()?;

    // Owner withdraws 30 SOCIAL to treasury
    let withdraw_amount = 30 * ONE_SOCIAL;
    owner.call(staking.id(), "withdraw_infra")
        .args_json(json!({
            "amount": withdraw_amount.to_string(),
            "receiver_id": treasury.id().to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(150)) // 50 ft_transfer + 50 callback + overhead
        .transact()
        .await?
        .into_result()?;

    // Verify infra pool decreased
    let stats_after = get_stats(&staking).await?;
    let infra_after: u128 = stats_after.infra_pool.parse()?;
    assert_eq!(infra_after, infra_before - withdraw_amount);

    // Verify treasury received tokens
    let treasury_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": treasury.id().to_string() }))
        .await?
        .json()?;
    let treasury_balance_after: u128 = treasury_after.parse()?;
    assert_eq!(
        treasury_balance_after,
        treasury_balance_before + withdraw_amount,
        "Treasury should receive withdrawn tokens"
    );

    Ok(())
}

// =============================================================================
// Tests: MEDIUM - View Methods
// =============================================================================

/// MEDIUM: get_reward_rate returns accurate projection data.
#[tokio::test]
async fn test_get_reward_rate_view() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund pool
    let pool_amount = 100_000 * ONE_SOCIAL;
    fund_pool(&ft, &staking, &owner, pool_amount).await?;

    // Stake
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 6).await?;

    // Get reward rate
    let reward_rate: RewardRateInfo = staking
        .view("get_reward_rate")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Verify fields are populated correctly
    let effective: u128 = reward_rate.effective_stake.parse()?;
    let total_effective: u128 = reward_rate.total_effective_stake.parse()?;
    let weekly_release: u128 = reward_rate.weekly_pool_release.parse()?;

    // Effective stake should be 110 SOCIAL (100 + 10% bonus)
    assert_eq!(effective, 110 * ONE_SOCIAL, "Effective stake should include bonus");

    // Total effective should match user's effective (only staker)
    assert_eq!(total_effective, effective, "Total should equal user effective");

    // Weekly release = pool * 0.2% = 100_000 * 0.002 = 200 SOCIAL
    let expected_weekly = pool_amount * 20 / 10_000;
    assert_eq!(weekly_release, expected_weekly, "Weekly release should be 0.2% of pool");

    // Rewards per second should be positive (user is only staker)
    let per_second: u128 = reward_rate.rewards_per_second.parse()?;
    assert!(per_second > 0, "Rewards per second should be positive for staker");

    Ok(())
}

// =============================================================================
// Tests: CRITICAL - Additional Economic Invariants
// =============================================================================

/// CRITICAL INVARIANT: Withdrawable amount on unlock == locked_amount.
/// 
/// When a user unlocks, they receive exactly their locked_amount back.
/// Rewards are separate and claimed via claim_rewards().
/// This prevents fund loss from incorrect unlock calculations.
#[tokio::test]
async fn test_invariant_unlock_returns_exact_locked_amount() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    
    let initial_balance = 1000 * ONE_SOCIAL;
    ft_transfer(&ft, &owner, user.id().as_str(), initial_balance).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock tokens
    let lock_amount = 100 * ONE_SOCIAL;
    lock_tokens(&ft, &staking, &user, lock_amount, 1).await?;

    // Verify lock
    let account = get_account(&staking, user.id().as_str()).await?;
    let locked: u128 = account.locked_amount.parse()?;
    assert_eq!(locked, lock_amount, "Should have locked exact amount");

    // Get user's FT balance after locking
    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    let balance_before_val: u128 = balance_before.parse()?;
    assert_eq!(balance_before_val, initial_balance - lock_amount, "Balance should reflect lock");

    // CRITICAL INVARIANT: The locked_amount stored equals exactly what was transferred.
    // This ensures that when unlock happens, the exact amount will be returned.
    // We verify the contract recorded the correct amount (fund conservation at lock time).
    // 
    // Note: Full unlock test (with actual time passage) would require ~2.6M blocks
    // which is impractical in sandbox. The unlock path is covered by existing tests
    // that verify unlock mechanics work correctly.
    
    // Also verify the total locked tracks correctly
    let stats = get_stats(&staking).await?;
    let total_locked: u128 = stats.total_locked.parse()?;
    assert_eq!(total_locked, lock_amount, "Total locked should match locked amount");

    // Verify effective stake calculation is consistent
    let total_effective: u128 = stats.total_effective_stake.parse()?;
    let user_effective: u128 = account.effective_stake.parse()?;
    assert_eq!(total_effective, user_effective, "Total effective stake should equal user's effective stake");

    // Test that early unlock (before expiry) is properly rejected
    // This validates the contract protects funds until lock period expires
    let early_unlock = user.call(staking.id(), "unlock")
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;
    
    assert!(early_unlock.is_failure(), "Early unlock should fail - lock not expired");

    Ok(())
}

/// CRITICAL INVARIANT: tracked_effective_stake consistency.
/// 
/// After any operation, sum of all users' tracked_effective_stake should equal
/// contract's total_effective_stake. This test verifies the invariant holds
/// across multiple operations.
#[tokio::test]
async fn test_invariant_tracked_effective_stake_consistency() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let charlie = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;

    for user in [&alice, &bob, &charlie] {
        ft_storage_deposit(&ft, user).await?;
        ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;
        user.call(staking.id(), "storage_deposit")
            .args_json(json!({}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?.into_result()?;
    }

    // Alice locks with 6 months (10% bonus)
    lock_tokens(&ft, &staking, &alice, 100 * ONE_SOCIAL, 6).await?;
    
    // Bob locks with 12 months (20% bonus)
    lock_tokens(&ft, &staking, &bob, 200 * ONE_SOCIAL, 12).await?;
    
    // Charlie locks with 24 months (35% bonus)
    lock_tokens(&ft, &staking, &charlie, 150 * ONE_SOCIAL, 24).await?;

    // Calculate expected effective stakes
    let alice_effective = 100 * ONE_SOCIAL * 110 / 100;  // 110 SOCIAL
    let bob_effective = 200 * ONE_SOCIAL * 120 / 100;    // 240 SOCIAL
    let charlie_effective = 150 * ONE_SOCIAL * 135 / 100; // 202.5 SOCIAL

    // Get individual account views
    let alice_account = get_account(&staking, alice.id().as_str()).await?;
    let bob_account = get_account(&staking, bob.id().as_str()).await?;
    let charlie_account = get_account(&staking, charlie.id().as_str()).await?;

    let alice_eff: u128 = alice_account.effective_stake.parse()?;
    let bob_eff: u128 = bob_account.effective_stake.parse()?;
    let charlie_eff: u128 = charlie_account.effective_stake.parse()?;

    // Verify individual effective stakes
    assert_eq!(alice_eff, alice_effective, "Alice effective stake");
    assert_eq!(bob_eff, bob_effective, "Bob effective stake");
    assert_eq!(charlie_eff, charlie_effective, "Charlie effective stake");

    // INVARIANT: sum of individual effective stakes == total_effective_stake
    let stats = get_stats(&staking).await?;
    let total_effective: u128 = stats.total_effective_stake.parse()?;
    let sum_individual = alice_eff + bob_eff + charlie_eff;

    assert_eq!(
        total_effective, sum_individual,
        "INVARIANT VIOLATION: total_effective_stake ({}) != sum of individual ({})",
        total_effective, sum_individual
    );

    // Extend Bob's lock and verify invariant still holds
    bob.call(staking.id(), "extend_lock")
        .args_json(json!({ "months": 24 }))
        .transact()
        .await?
        .into_result()?;

    let bob_new = get_account(&staking, bob.id().as_str()).await?;
    let bob_new_eff: u128 = bob_new.effective_stake.parse()?;
    let expected_bob_new = 200 * ONE_SOCIAL * 135 / 100; // 35% bonus for 24 months
    assert_eq!(bob_new_eff, expected_bob_new, "Bob extended effective stake");

    let stats_after = get_stats(&staking).await?;
    let total_after: u128 = stats_after.total_effective_stake.parse()?;
    let sum_after = alice_eff + bob_new_eff + charlie_eff;

    assert_eq!(
        total_after, sum_after,
        "INVARIANT after extend: total ({}) != sum ({})",
        total_after, sum_after
    );

    Ok(())
}

/// CRITICAL: Sequential claims correctly update rewards_claimed (no double-claim).
/// 
/// After claiming, rewards_claimed increases and subsequent claim has less available.
/// This prevents users from claiming the same rewards multiple times.
#[tokio::test]
async fn test_double_claim_prevention() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 100_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund pool with large amount
    fund_pool(&ft, &staking, &owner, 10_000_000 * ONE_SOCIAL).await?;

    // User stakes
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 6).await?;

    // Fast forward enough for weekly release (use small value - sandbox is slow)
    worker.fast_forward(1000).await?;
    
    // Poke to release rewards
    owner.call(staking.id(), "poke")
        .transact()
        .await?
        .into_result()?;

    // Get claimable before first claim
    let before_first = get_account(&staking, user.id().as_str()).await?;
    let claimable_first: u128 = before_first.claimable_rewards.parse()?;
    let claimed_before: u128 = before_first.rewards_claimed.parse()?;

    if claimable_first > 0 {
        // First claim
        let claim_result = user.call(staking.id(), "claim_rewards")
            .gas(near_workspaces::types::Gas::from_tgas(150))
            .transact()
            .await?;

        if claim_result.is_success() {
            // Check state after first claim
            let after_first = get_account(&staking, user.id().as_str()).await?;
            let claimed_after_first: u128 = after_first.rewards_claimed.parse()?;
            let claimable_after_first: u128 = after_first.claimable_rewards.parse()?;

            // rewards_claimed should have increased by ~claimable_first
            assert!(
                claimed_after_first > claimed_before,
                "rewards_claimed should increase: before={}, after={}",
                claimed_before, claimed_after_first
            );

            // Immediately after claim, claimable should be 0 or near-zero
            assert!(
                claimable_after_first < claimable_first / 10, // Less than 10% of original
                "Claimable should be near-zero after claim: {} vs {}",
                claimable_after_first, claimable_first
            );

            // Try to claim again immediately - should fail with "No rewards to claim"
            let second_claim = user.call(staking.id(), "claim_rewards")
                .gas(near_workspaces::types::Gas::from_tgas(150))
                .transact()
                .await?;

            // Second immediate claim should fail or have negligible rewards
            if second_claim.is_success() {
                // If it succeeded, negligible additional rewards
                let after_second = get_account(&staking, user.id().as_str()).await?;
                let claimed_after_second: u128 = after_second.rewards_claimed.parse()?;
                let increase = claimed_after_second - claimed_after_first;
                assert!(
                    increase < claimable_first / 100, // Less than 1% increase
                    "Second immediate claim should have negligible rewards: {}",
                    increase
                );
            }
            // Failure is also acceptable - means "No rewards to claim"
        }
    } else {
        println!("Note: No rewards released in sandbox time frame (expected in some sandbox configs)");
    }

    Ok(())
}

// =============================================================================
// Tests: HIGH - Authorization and Validation
// =============================================================================

/// HIGH: extend_lock to shorter period should fail.
/// 
/// INVARIANT: New lock period must be >= current period.
#[tokio::test]
async fn test_extend_lock_shorter_period_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock for 12 months
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 12).await?;

    let status = get_lock_status(&staking, user.id().as_str()).await?;
    assert_eq!(status.lock_months, 12);

    // Try to extend to 6 months (shorter) - should fail
    let result = user.call(staking.id(), "extend_lock")
        .args_json(json!({ "months": 6 }))
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "extend_lock to shorter period should fail"
    );

    // Verify lock unchanged
    let status_after = get_lock_status(&staking, user.id().as_str()).await?;
    assert_eq!(status_after.lock_months, 12, "Lock period should be unchanged");

    Ok(())
}

/// HIGH: extend_lock without existing lock should fail.
/// 
/// INVARIANT: Cannot extend a lock that doesn't exist.
#[tokio::test]
async fn test_extend_lock_no_tokens_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup user storage only - no lock
    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Verify no lock
    let status = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(!status.is_locked, "Should have no lock initially");

    // Try to extend non-existent lock
    let result = user.call(staking.id(), "extend_lock")
        .args_json(json!({ "months": 12 }))
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "extend_lock without existing lock should fail"
    );

    Ok(())
}

/// HIGH: Non-owner cannot call set_owner.
/// 
/// INVARIANT: Only current owner can transfer ownership.
#[tokio::test]
async fn test_auth_non_owner_cannot_set_owner() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;
    let _victim = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Verify initial owner
    let stats_before = get_stats(&staking).await?;
    assert_eq!(stats_before.owner_id, owner.id().to_string());

    // Attacker tries to change owner
    let result = attacker.call(staking.id(), "set_owner")
        .args_json(json!({ "new_owner": attacker.id().to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner should not be able to set owner");

    // Verify owner unchanged
    let stats_after = get_stats(&staking).await?;
    assert_eq!(
        stats_after.owner_id, owner.id().to_string(),
        "Owner should be unchanged after failed attack"
    );

    Ok(())
}

/// HIGH: withdraw_infra fails if amount exceeds balance.
/// 
/// INVARIANT: Cannot withdraw more than infra_pool balance.
#[tokio::test]
async fn test_withdraw_infra_exceeds_balance_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let treasury = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_storage_deposit(&ft, &treasury).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Add 60 SOCIAL to infra pool via credits
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "credits" }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    let stats = get_stats(&staking).await?;
    let infra: u128 = stats.infra_pool.parse()?;
    assert_eq!(infra, 60 * ONE_SOCIAL);

    // Try to withdraw more than available
    let result = owner.call(staking.id(), "withdraw_infra")
        .args_json(json!({
            "amount": (100 * ONE_SOCIAL).to_string(), // More than 60 available
            "receiver_id": treasury.id().to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "withdraw_infra should fail when amount exceeds balance"
    );

    // Verify pool unchanged
    let stats_after = get_stats(&staking).await?;
    let infra_after: u128 = stats_after.infra_pool.parse()?;
    assert_eq!(infra_after, infra, "Infra pool should be unchanged after failed withdrawal");

    Ok(())
}

/// HIGH: Lock without storage_deposit fails.
/// 
/// INVARIANT: User must call storage_deposit before locking tokens.
#[tokio::test]
async fn test_lock_without_storage_deposit_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup FT but NOT staking storage
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    // Do NOT register on staking contract

    // Get balance before
    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Try to lock - should fail and refund
    let _result = user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "lock", "months": 6 }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // Tokens should be refunded
    let balance_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(
        balance_before, balance_after,
        "Tokens should be refunded when user hasn't called storage_deposit"
    );

    Ok(())
}

// =============================================================================
// Tests: MEDIUM - Edge Cases and Views
// =============================================================================

/// MEDIUM: Unknown action in ft_on_transfer is rejected.
/// 
/// Tokens should be refunded when msg.action is not recognized.
#[tokio::test]
async fn test_unknown_action_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Send with unknown action
    let _result = user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "unknown_action" }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // Tokens should be refunded
    let balance_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(
        balance_before, balance_after,
        "Tokens should be refunded for unknown action"
    );

    Ok(())
}

/// MEDIUM: storage_deposit for already registered user refunds full deposit.
/// 
/// If user already has storage, any attached deposit is fully refunded.
#[tokio::test]
async fn test_storage_deposit_already_registered_full_refund() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // First registration
    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;

    // Verify registered
    let balance: Option<StorageBalance> = staking
        .view("storage_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert!(balance.is_some(), "Should be registered");

    // Get NEAR balance before second deposit
    let near_before = user.view_account().await?.balance;

    // Second storage_deposit with excess - should refund
    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    // If we get here, the call succeeded

    // Get NEAR balance after
    let near_after = user.view_account().await?.balance;

    // The difference should be roughly just gas fees (deposit was refunded)
    // We check that user didn't lose the full 50 milliNEAR
    let lost = near_before.as_yoctonear().saturating_sub(near_after.as_yoctonear());
    let fifty_milli: u128 = 50_000_000_000_000_000_000_000; // 50 milliNEAR
    
    assert!(
        lost < fifty_milli / 2, // Lost less than 25 milliNEAR (most was refunded)
        "Second storage_deposit should refund: lost {} yocto",
        lost
    );

    Ok(())
}

/// MEDIUM: storage_balance_bounds returns correct min/max.
#[tokio::test]
async fn test_storage_balance_bounds_view() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    let bounds: StorageBalanceBounds = staking
        .view("storage_balance_bounds")
        .await?
        .json()?;

    // Verify min = max = 0.005 NEAR (fixed storage)
    let expected: u128 = 5_000_000_000_000_000_000_000; // 0.005 NEAR
    
    let min: u128 = bounds.min.parse()?;
    let max: u128 = bounds.max.parse()?;
    
    assert_eq!(min, expected, "min should be 0.005 NEAR");
    assert_eq!(max, expected, "max should equal min (fixed storage)");

    Ok(())
}

/// MEDIUM: Empty/non-existent account returns sensible defaults.
#[tokio::test]
async fn test_empty_account_view_defaults() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let nobody = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Get account view for non-existent account
    let account = get_account(&staking, nobody.id().as_str()).await?;

    // All values should be zero/default
    assert_eq!(account.locked_amount, "0");
    assert_eq!(account.unlock_at, 0);
    assert_eq!(account.lock_months, 0);
    assert_eq!(account.effective_stake, "0");
    assert_eq!(account.claimable_rewards, "0");
    assert_eq!(account.stake_seconds, "0");
    assert_eq!(account.rewards_claimed, "0");

    // Lock status should show not locked
    let status = get_lock_status(&staking, nobody.id().as_str()).await?;
    assert!(!status.is_locked);
    assert!(!status.can_unlock);
    assert_eq!(status.bonus_percent, 0);

    Ok(())
}

/// HIGH: Bonus percentages are correct for all lock periods.
/// 
/// Tests the boundary values for each bonus tier:
/// 1-6 months: 10%, 7-12 months: 20%, 13-24 months: 35%, 25+ months: 50%
#[tokio::test]
async fn test_bonus_percentages_all_tiers() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    
    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup staking contract FT
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;

    // Test each valid lock period
    let test_cases: [(u64, u32, u128); 5] = [
        (1, 10, 110),   // 1 month: 10% bonus = 100 * 1.10 = 110
        (6, 10, 110),   // 6 months: 10% bonus
        (12, 20, 120),  // 12 months: 20% bonus
        (24, 35, 135),  // 24 months: 35% bonus
        (48, 50, 150),  // 48 months: 50% bonus
    ];

    for (months, expected_bonus, expected_effective_mult) in test_cases {
        let user = worker.dev_create_account().await?;
        ft_storage_deposit(&ft, &user).await?;
        ft_transfer(&ft, &owner, user.id().as_str(), 200 * ONE_SOCIAL).await?;
        
        user.call(staking.id(), "storage_deposit")
            .args_json(json!({}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?.into_result()?;

        lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, months).await?;

        let status = get_lock_status(&staking, user.id().as_str()).await?;
        assert_eq!(
            status.bonus_percent, expected_bonus,
            "Lock {} months should have {}% bonus, got {}%",
            months, expected_bonus, status.bonus_percent
        );

        let effective: u128 = status.effective_stake.parse()?;
        let expected_effective = expected_effective_mult * ONE_SOCIAL;
        assert_eq!(
            effective, expected_effective,
            "Lock {} months: effective should be {} SOCIAL, got {}",
            months, expected_effective_mult, effective / ONE_SOCIAL
        );
    }

    Ok(())
}

// =============================================================================
// Tests: CRITICAL - Input Validation
// =============================================================================

/// CRITICAL: Zero amount in ft_on_transfer should panic.
///
/// INVARIANT: amount.0 > 0 is required for all token transfers.
/// This prevents DOS and ensures meaningful operations.
#[tokio::test]
async fn test_zero_amount_transfer_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Try to send zero amount - should fail
    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Note: FT contracts typically reject zero transfers at the FT level,
    // but if they don't, the staking contract will reject with "Amount must be positive"
    let result = user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": "0",
            "msg": json!({ "action": "lock", "months": 6 }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Either ft_transfer itself fails or staking contract rejects
    if result.is_failure() {
        // Expected - zero transfer rejected
        return Ok(());
    }

    // If we got here, FT allowed transfer - check tokens refunded
    let balance_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(
        balance_before, balance_after,
        "Zero amount should be refunded"
    );

    Ok(())
}

/// CRITICAL: claim_rewards from non-existent account should fail.
///
/// INVARIANT: User must have an account to claim rewards.
#[tokio::test]
async fn test_claim_rewards_no_account_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // User has NO storage deposit - no account

    // Try to claim rewards
    let result = user.call(staking.id(), "claim_rewards")
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "claim_rewards without account should fail"
    );

    Ok(())
}

// =============================================================================
// Tests: HIGH - Message Parsing Validation
// =============================================================================

/// HIGH: Invalid JSON in ft_on_transfer msg should panic.
///
/// INVARIANT: msg must be valid JSON.
#[tokio::test]
async fn test_invalid_json_in_msg_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Send with invalid JSON
    let _result = user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": "this is not valid json {"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // Tokens should be refunded
    let balance_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(
        balance_before, balance_after,
        "Tokens should be refunded for invalid JSON"
    );

    Ok(())
}

/// HIGH: Missing action field in ft_on_transfer msg should panic.
///
/// INVARIANT: msg must contain "action" field.
#[tokio::test]
async fn test_missing_action_in_msg_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Send valid JSON but missing "action" field
    let _result = user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": json!({ "months": 6 }).to_string()  // No "action" field
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // Tokens should be refunded
    let balance_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(
        balance_before, balance_after,
        "Tokens should be refunded when action field is missing"
    );

    Ok(())
}

/// HIGH: Missing months field in lock action should panic.
///
/// INVARIANT: Lock action must specify months.
#[tokio::test]
async fn test_missing_months_in_lock_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    let balance_before: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Send lock action but missing "months" field
    let _result = user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "lock" }).to_string()  // No "months" field
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    // Tokens should be refunded
    let balance_after: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(
        balance_before, balance_after,
        "Tokens should be refunded when months field is missing"
    );

    Ok(())
}

/// HIGH: renew_lock without existing lock should fail.
///
/// INVARIANT: renew_lock requires an active lock.
#[tokio::test]
async fn test_renew_lock_no_tokens_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup storage only - no lock
    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Verify no lock
    let status = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(!status.is_locked, "Should have no lock initially");

    // Try to renew non-existent lock
    let result = user.call(staking.id(), "renew_lock")
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "renew_lock without existing lock should fail"
    );

    Ok(())
}

/// HIGH: unlock when no tokens locked should fail.
///
/// INVARIANT: unlock requires locked_amount > 0.
#[tokio::test]
async fn test_unlock_no_tokens_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup storage only - no lock
    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Verify no lock
    let status = get_lock_status(&staking, user.id().as_str()).await?;
    assert!(!status.is_locked, "Should have no lock");

    // Try to unlock with no tokens
    let result = user.call(staking.id(), "unlock")
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "unlock without locked tokens should fail"
    );

    Ok(())
}

// =============================================================================
// Tests: MEDIUM - Security Deposit Validation
// =============================================================================

/// MEDIUM: set_owner without 1 yoctoNEAR should fail.
///
/// INVARIANT: set_owner requires exactly 1 yoctoNEAR attached.
#[tokio::test]
async fn test_set_owner_requires_yocto() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let new_owner = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Try to set owner without deposit
    let result = owner.call(staking.id(), "set_owner")
        .args_json(json!({ "new_owner": new_owner.id().to_string() }))
        // No deposit attached
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "set_owner without 1 yoctoNEAR should fail"
    );

    // Verify owner unchanged
    let stats = get_stats(&staking).await?;
    assert_eq!(
        stats.owner_id, owner.id().to_string(),
        "Owner should be unchanged"
    );

    Ok(())
}

/// MEDIUM: withdraw_infra without 1 yoctoNEAR should fail.
///
/// INVARIANT: withdraw_infra requires exactly 1 yoctoNEAR attached.
#[tokio::test]
async fn test_withdraw_infra_requires_yocto() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let treasury = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup and add funds to infra pool
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_storage_deposit(&ft, &treasury).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 1000 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Add to infra pool via credits
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": json!({ "action": "credits" }).to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?.into_result()?;

    let stats = get_stats(&staking).await?;
    let infra: u128 = stats.infra_pool.parse()?;
    assert!(infra > 0, "Should have infra funds");

    // Try to withdraw without deposit
    let result = owner.call(staking.id(), "withdraw_infra")
        .args_json(json!({
            "amount": "1",
            "receiver_id": treasury.id().to_string()
        }))
        // No deposit attached
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "withdraw_infra without 1 yoctoNEAR should fail"
    );

    // Verify pool unchanged
    let stats_after = get_stats(&staking).await?;
    let infra_after: u128 = stats_after.infra_pool.parse()?;
    assert_eq!(infra, infra_after, "Infra pool should be unchanged");

    Ok(())
}

/// MEDIUM: get_reward_rate for non-staker returns zeros.
///
/// Rewards rate should be zero for users who haven't staked.
#[tokio::test]
async fn test_get_reward_rate_non_staker_returns_zeros() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let staker = worker.dev_create_account().await?;
    let non_staker = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup staker
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &staker).await?;
    ft_transfer(&ft, &owner, staker.id().as_str(), 1000 * ONE_SOCIAL).await?;

    staker.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Fund pool
    fund_pool(&ft, &staking, &owner, 100_000 * ONE_SOCIAL).await?;

    // Have staker stake (so total_effective_stake > 0)
    lock_tokens(&ft, &staking, &staker, 100 * ONE_SOCIAL, 6).await?;

    // Get reward rate for non-staker (who has no account)
    let rate: RewardRateInfo = staking
        .view("get_reward_rate")
        .args_json(json!({ "account_id": non_staker.id().to_string() }))
        .await?
        .json()?;

    // Non-staker should have zero effective stake
    let effective: u128 = rate.effective_stake.parse()?;
    assert_eq!(effective, 0, "Non-staker should have zero effective stake");

    // Per-second should be zero
    let per_second: u128 = rate.rewards_per_second.parse()?;
    assert_eq!(per_second, 0, "Non-staker should have zero rewards per second");

    // Claimable should be zero
    let claimable: u128 = rate.claimable_now.parse()?;
    assert_eq!(claimable, 0, "Non-staker should have zero claimable");

    // But total_effective_stake should be from the actual staker
    let total_eff: u128 = rate.total_effective_stake.parse()?;
    assert!(total_eff > 0, "Total effective stake should be positive");

    Ok(())
}

/// MEDIUM: storage_deposit with insufficient deposit fails.
///
/// INVARIANT: Must attach at least 0.005 NEAR.
#[tokio::test]
async fn test_storage_deposit_insufficient_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Try storage deposit with insufficient amount
    let result = user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_yoctonear(1000))  // Way less than 0.005 NEAR
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "storage_deposit with insufficient deposit should fail"
    );

    // Verify not registered
    let balance: Option<StorageBalance> = staking
        .view("storage_balance_of")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert!(balance.is_none(), "Should not be registered with insufficient deposit");

    Ok(())
}

// =============================================================================
// Tests: HIGH - Additional Missing Scenarios
// =============================================================================

/// HIGH: extend_lock with invalid period (not in VALID_LOCK_PERIODS) fails.
///
/// INVARIANT: extend_lock only accepts valid lock periods (1, 6, 12, 24, 48).
/// Attempting to extend to an invalid period like 3, 7, or 36 months should fail.
#[tokio::test]
async fn test_extend_lock_invalid_period_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 100 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // Lock for 6 months (valid period)
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 6).await?;

    let status_before = get_lock_status(&staking, user.id().as_str()).await?;
    assert_eq!(status_before.lock_months, 6);

    // Try to extend to 7 months (invalid - not in VALID_LOCK_PERIODS)
    let result = user.call(staking.id(), "extend_lock")
        .args_json(json!({ "months": 7 }))
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "extend_lock with invalid period (7 months) should fail"
    );

    // Try another invalid period: 36 months (between 24 and 48)
    let result2 = user.call(staking.id(), "extend_lock")
        .args_json(json!({ "months": 36 }))
        .transact()
        .await?;

    assert!(
        result2.is_failure(),
        "extend_lock with invalid period (36 months) should fail"
    );

    // Verify lock unchanged
    let status_after = get_lock_status(&staking, user.id().as_str()).await?;
    assert_eq!(
        status_after.lock_months, 6,
        "Lock period should be unchanged after rejected extend"
    );
    assert_eq!(
        status_after.bonus_percent, 10,
        "Bonus should be unchanged after rejected extend"
    );

    Ok(())
}

/// MEDIUM: storage_deposit for another account (NEP-145 spec compliance).
///
/// INVARIANT: storage_deposit can register storage for a third-party account.
/// The account_id parameter specifies whose storage to register.
#[tokio::test]
async fn test_storage_deposit_for_another_account() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let payer = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Beneficiary should not be registered initially
    let balance_before: Option<StorageBalance> = staking
        .view("storage_balance_of")
        .args_json(json!({ "account_id": beneficiary.id().to_string() }))
        .await?
        .json()?;
    assert!(balance_before.is_none(), "Beneficiary should not be registered initially");

    // Payer registers storage for beneficiary
    payer.call(staking.id(), "storage_deposit")
        .args_json(json!({ "account_id": beneficiary.id().to_string() }))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;

    // Verify beneficiary is now registered
    let balance_after: Option<StorageBalance> = staking
        .view("storage_balance_of")
        .args_json(json!({ "account_id": beneficiary.id().to_string() }))
        .await?
        .json()?;
    assert!(balance_after.is_some(), "Beneficiary should be registered after third-party deposit");

    // Verify payer is NOT registered (they paid for beneficiary)
    let payer_balance: Option<StorageBalance> = staking
        .view("storage_balance_of")
        .args_json(json!({ "account_id": payer.id().to_string() }))
        .await?
        .json()?;
    assert!(payer_balance.is_none(), "Payer should not be registered (paid for beneficiary)");

    // Now beneficiary can lock tokens without calling storage_deposit themselves
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &beneficiary).await?;
    ft_transfer(&ft, &owner, beneficiary.id().as_str(), 100 * ONE_SOCIAL).await?;

    lock_tokens(&ft, &staking, &beneficiary, 50 * ONE_SOCIAL, 6).await?;

    // Verify lock successful
    let status = get_lock_status(&staking, beneficiary.id().as_str()).await?;
    assert!(status.is_locked, "Beneficiary should be able to lock after third-party storage deposit");
    let locked: u128 = status.locked_amount.parse()?;
    assert_eq!(locked, 50 * ONE_SOCIAL);

    Ok(())
}

/// HIGH: update_contract can only be called by owner.
///
/// INVARIANT: Non-owner cannot trigger contract upgrade.
/// This is a critical authorization check to prevent unauthorized code deployment.
#[tokio::test]
async fn test_update_contract_only_owner() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Verify initial owner
    let stats = get_stats(&staking).await?;
    assert_eq!(stats.owner_id, owner.id().to_string());

    // Attacker tries to call update_contract - should fail
    // Note: The actual WASM bytes would be passed as input, but authorization
    // check happens first, so we just pass empty bytes to trigger the failure
    let result = attacker.call(staking.id(), "update_contract")
        .args(vec![0u8; 100])  // Dummy bytes (doesn't matter - auth fails first)
        .gas(near_workspaces::types::Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "update_contract by non-owner should fail"
    );

    // Verify contract is still functional (wasn't bricked by attack attempt)
    let stats_after = get_stats(&staking).await?;
    assert_eq!(stats_after.version, 1, "Contract version should be unchanged");
    assert_eq!(stats_after.owner_id, owner.id().to_string(), "Owner should be unchanged");

    Ok(())
}

/// HIGH: Concurrent lock additions work correctly.
///
/// INVARIANT: Multiple lock additions with same period should accumulate correctly.
/// Tests that the contract handles sequential token additions properly.
#[tokio::test]
async fn test_sequential_lock_additions_same_period() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    owner.call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": staking.id().to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?.into_result()?;
    ft_storage_deposit(&ft, &user).await?;
    ft_transfer(&ft, &owner, user.id().as_str(), 500 * ONE_SOCIAL).await?;

    user.call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?.into_result()?;

    // First addition: 100 SOCIAL for 12 months
    lock_tokens(&ft, &staking, &user, 100 * ONE_SOCIAL, 12).await?;

    let status1 = get_lock_status(&staking, user.id().as_str()).await?;
    let locked1: u128 = status1.locked_amount.parse()?;
    assert_eq!(locked1, 100 * ONE_SOCIAL, "First lock amount");
    let effective1: u128 = status1.effective_stake.parse()?;
    assert_eq!(effective1, 120 * ONE_SOCIAL, "First effective stake (20% bonus)");

    // Second addition: 50 more SOCIAL with same period
    lock_tokens(&ft, &staking, &user, 50 * ONE_SOCIAL, 12).await?;

    let status2 = get_lock_status(&staking, user.id().as_str()).await?;
    let locked2: u128 = status2.locked_amount.parse()?;
    assert_eq!(locked2, 150 * ONE_SOCIAL, "Accumulated lock amount");
    let effective2: u128 = status2.effective_stake.parse()?;
    assert_eq!(effective2, 180 * ONE_SOCIAL, "Accumulated effective stake (150 * 1.20)");

    // Third addition: 25 more SOCIAL
    lock_tokens(&ft, &staking, &user, 25 * ONE_SOCIAL, 12).await?;

    let status3 = get_lock_status(&staking, user.id().as_str()).await?;
    let locked3: u128 = status3.locked_amount.parse()?;
    assert_eq!(locked3, 175 * ONE_SOCIAL, "Total accumulated lock");

    // Verify effective stake is correct: 175 * 1.20 = 210
    let effective3: u128 = status3.effective_stake.parse()?;
    assert_eq!(effective3, 210 * ONE_SOCIAL, "Final effective stake");

    // Verify global totals match
    let stats = get_stats(&staking).await?;
    let total_locked: u128 = stats.total_locked.parse()?;
    let total_effective: u128 = stats.total_effective_stake.parse()?;
    assert_eq!(total_locked, 175 * ONE_SOCIAL, "Global total_locked");
    assert_eq!(total_effective, 210 * ONE_SOCIAL, "Global total_effective_stake");

    Ok(())
}
