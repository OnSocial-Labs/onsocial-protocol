// =============================================================================
// Staking-OnSocial Integration Tests
// =============================================================================
// Tests that run against the real NEAR sandbox with cross-contract calls
// These tests deploy the staking contract + a mock FT contract
//
// NOTE: Run tests with --test-threads=1 to avoid sandbox conflicts:
//   cargo test -p onsocial-integration-tests staking -- --test-threads=1

use anyhow::Result;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::utils::{get_wasm_path, setup_sandbox};

// 1 SOCIAL token = 10^18 (standard 18 decimals)
const ONE_SOCIAL: u128 = 1_000_000_000_000_000_000;

// =============================================================================
// Test Structs
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account_ {
    pub locked_amount: String,
    pub unlock_at: u64,
    pub lock_months: u64,
    pub credits: u64,
    pub credits_lifetime: u64,
    pub reward_per_token_paid: String,
    pub pending_rewards: String,
    pub last_free_credit_day: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractStats {
    pub token_id: String,
    pub owner_id: String,
    pub total_locked: String,
    pub total_effective_stake: String,
    pub rewards_pool: String,
    pub infra_pool: String,
    pub reward_per_token: String,
    pub credits_per_token: u64,
    pub free_daily_credits: u64,
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

    // Initialize the contract
    contract
        .call("new")
        .args_json(json!({
            "token_id": token_id,
            "owner_id": owner.id().to_string(),
            "credits_per_token": 100,
            "free_daily_credits": 50
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

    // Initialize with owner having all supply
    contract
        .call("new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
            "total_supply": total_supply.to_string(),
            "decimals": 24
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

// =============================================================================
// Basic Contract Tests (no FT required)
// =============================================================================

#[tokio::test]
async fn test_staking_contract_init() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Verify initialization via get_stats
    let stats: ContractStats = staking.view("get_stats").await?.json()?;

    assert_eq!(stats.token_id, "social.token.near");
    assert_eq!(stats.owner_id, owner.id().to_string());
    assert_eq!(stats.credits_per_token, 100);
    assert_eq!(stats.free_daily_credits, 50);
    assert_eq!(stats.total_locked, "0");
    assert_eq!(stats.rewards_pool, "0");
    assert_eq!(stats.infra_pool, "0");

    Ok(())
}

#[tokio::test]
async fn test_staking_add_gateway() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Add gateway (owner only)
    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({
            "gateway_id": gateway.id().to_string()
        }))
        .transact()
        .await?
        .into_result()?;

    // Verify gateway is added
    let is_gateway: bool = staking
        .view("is_gateway")
        .args_json(json!({
            "account_id": gateway.id().to_string()
        }))
        .await?
        .json()?;

    assert!(is_gateway);

    Ok(())
}

#[tokio::test]
async fn test_staking_add_gateway_unauthorized() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Try to add gateway as non-owner (should fail)
    let result = attacker
        .call(staking.id(), "add_gateway")
        .args_json(json!({
            "gateway_id": gateway.id().to_string()
        }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner should not be able to add gateway");

    Ok(())
}

#[tokio::test]
async fn test_staking_get_account_default() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Get account for user that doesn't exist yet
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({
            "account_id": user.id().to_string()
        }))
        .await?
        .json()?;

    // Should return default values
    assert_eq!(account.locked_amount, "0");
    assert_eq!(account.credits, 0);
    assert_eq!(account.lock_months, 0);

    Ok(())
}

#[tokio::test]
async fn test_staking_set_credits_per_token() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Update credits per token
    owner
        .call(staking.id(), "set_credits_per_token")
        .args_json(json!({ "rate": 200 }))
        .transact()
        .await?
        .into_result()?;

    // Verify update
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.credits_per_token, 200);

    Ok(())
}

#[tokio::test]
async fn test_staking_set_free_daily_credits() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Update free daily credits
    owner
        .call(staking.id(), "set_free_daily_credits")
        .args_json(json!({ "amount": 100 }))
        .transact()
        .await?
        .into_result()?;

    // Verify update
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.free_daily_credits, 100);

    Ok(())
}

#[tokio::test]
async fn test_staking_transfer_ownership() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let new_owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Transfer ownership
    owner
        .call(staking.id(), "set_owner")
        .args_json(json!({
            "new_owner": new_owner.id().to_string()
        }))
        .transact()
        .await?
        .into_result()?;

    // Verify new owner can perform owner actions
    new_owner
        .call(staking.id(), "set_credits_per_token")
        .args_json(json!({ "rate": 300 }))
        .transact()
        .await?
        .into_result()?;

    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.owner_id, new_owner.id().to_string());
    assert_eq!(stats.credits_per_token, 300);

    // Old owner should no longer be able to perform owner actions
    let result = owner
        .call(staking.id(), "set_credits_per_token")
        .args_json(json!({ "rate": 400 }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Old owner should not have permissions");

    Ok(())
}

#[tokio::test]
async fn test_staking_remove_gateway() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Add then remove gateway
    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    owner
        .call(staking.id(), "remove_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Verify gateway is removed
    let is_gateway: bool = staking
        .view("is_gateway")
        .args_json(json!({ "account_id": gateway.id().to_string() }))
        .await?
        .json()?;

    assert!(!is_gateway);

    Ok(())
}

#[tokio::test]
async fn test_staking_remove_gateway_unauthorized() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Owner adds gateway
    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Attacker tries to remove gateway (should fail)
    let result = attacker
        .call(staking.id(), "remove_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner should not be able to remove gateway");

    // Verify gateway still exists
    let is_gateway: bool = staking
        .view("is_gateway")
        .args_json(json!({ "account_id": gateway.id().to_string() }))
        .await?
        .json()?;
    assert!(is_gateway);

    Ok(())
}

#[tokio::test]
async fn test_staking_set_owner_unauthorized() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Attacker tries to transfer ownership (should fail)
    let result = attacker
        .call(staking.id(), "set_owner")
        .args_json(json!({ "new_owner": attacker.id().to_string() }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner should not be able to transfer ownership");

    // Verify owner unchanged
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.owner_id, owner.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_staking_set_credits_per_token_unauthorized() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Attacker tries to change rate (should fail)
    let result = attacker
        .call(staking.id(), "set_credits_per_token")
        .args_json(json!({ "rate": 999 }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner should not be able to set credit rate");

    // Verify rate unchanged
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.credits_per_token, 100);

    Ok(())
}

#[tokio::test]
async fn test_staking_set_free_daily_credits_unauthorized() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Attacker tries to change free credits (should fail)
    let result = attacker
        .call(staking.id(), "set_free_daily_credits")
        .args_json(json!({ "amount": 999 }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner should not be able to set free daily credits");

    // Verify amount unchanged
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.free_daily_credits, 50);

    Ok(())
}

#[tokio::test]
async fn test_staking_set_credits_per_token_zero_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Try to set rate to zero (should fail)
    let result = owner
        .call(staking.id(), "set_credits_per_token")
        .args_json(json!({ "rate": 0 }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Zero rate should be rejected");

    // Verify rate unchanged
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.credits_per_token, 100);

    Ok(())
}

#[tokio::test]
async fn test_staking_events_params_updated() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Update credits_per_token and check event
    let outcome = owner
        .call(staking.id(), "set_credits_per_token")
        .args_json(json!({ "rate": 200 }))
        .transact()
        .await?
        .into_result()?;

    let logs: Vec<String> = outcome.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "PARAMS_UPDATED");
    assert!(event.is_some(), "PARAMS_UPDATED event should be emitted");

    let event = event.unwrap();
    let data = &event["data"][0]["extra"];
    assert_eq!(data["param"], "credits_per_token");
    assert_eq!(data["old_value"], 100);
    assert_eq!(data["new_value"], 200);

    Ok(())
}

#[tokio::test]
async fn test_staking_events_gateway_added() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    let outcome = owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    let logs: Vec<String> = outcome.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "GATEWAY_ADDED");
    assert!(event.is_some(), "GATEWAY_ADDED event should be emitted");

    let event = event.unwrap();
    let data = &event["data"][0]["extra"];
    assert_eq!(data["gateway_id"], gateway.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_staking_events_gateway_removed() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Add gateway first
    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Remove and check event
    let outcome = owner
        .call(staking.id(), "remove_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    let logs: Vec<String> = outcome.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "GATEWAY_REMOVED");
    assert!(event.is_some(), "GATEWAY_REMOVED event should be emitted");

    let event = event.unwrap();
    let data = &event["data"][0]["extra"];
    assert_eq!(data["gateway_id"], gateway.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_staking_events_owner_changed() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let new_owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    let outcome = owner
        .call(staking.id(), "set_owner")
        .args_json(json!({ "new_owner": new_owner.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    let logs: Vec<String> = outcome.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "OWNER_CHANGED");
    assert!(event.is_some(), "OWNER_CHANGED event should be emitted");

    let event = event.unwrap();
    let data = &event["data"][0]["extra"];
    assert_eq!(data["old_owner"], owner.id().to_string());
    assert_eq!(data["new_owner"], new_owner.id().to_string());

    Ok(())
}

// =============================================================================
// FT Integration Tests (require mock FT contract)
// =============================================================================

/// Helper to transfer tokens from owner to user via mock FT
async fn transfer_tokens_to_user(
    ft: &Contract,
    owner: &Account,
    user: &Account,
    amount: u128,
) -> Result<()> {
    owner
        .call(ft.id(), "ft_transfer")
        .args_json(json!({
            "receiver_id": user.id().to_string(),
            "amount": amount.to_string(),
            "memo": null
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

#[tokio::test]
async fn test_staking_lock_tokens() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    // Deploy FT contract with owner having all supply
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;

    // Transfer some tokens to user
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;

    // Deploy staking contract
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock tokens via ft_transfer_call
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Verify lock
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(account.locked_amount, (100 * ONE_SOCIAL).to_string());
    assert_eq!(account.lock_months, 12);

    // Note: Lock action does NOT assign credits - only "credits" action does
    assert_eq!(account.credits, 0);

    Ok(())
}

#[tokio::test]
async fn test_staking_buy_credits() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;

    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Buy credits (action: "credits")
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Verify credits bought (50 tokens * 100 credits_per_token)
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(account.credits, 50 * 100); // 50 tokens * 100 credits_per_token = 5000
    // No lock - locked_amount should be 0
    assert_eq!(account.locked_amount, "0");

    // Verify pools: 60% infra, 40% rewards
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    let expected_infra = (50 * ONE_SOCIAL * 60) / 100;
    let expected_rewards = (50 * ONE_SOCIAL * 40) / 100;
    assert_eq!(stats.infra_pool, expected_infra.to_string());
    assert_eq!(stats.rewards_pool, expected_rewards.to_string());

    Ok(())
}

#[tokio::test]
async fn test_staking_debit_credits() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;

    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Add gateway
    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Buy credits first
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Verify initial credits
    let account_before: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account_before.credits, 100 * 100); // 10000 credits

    // Gateway debits some credits
    gateway
        .call(staking.id(), "debit_credits")
        .args_json(json!({
            "account_id": user.id().to_string(),
            "amount": 500
        }))
        .transact()
        .await?
        .into_result()?;

    // Verify credits debited
    let account_after: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account_after.credits, 10000 - 500);

    Ok(())
}

#[tokio::test]
async fn test_staking_debit_credits_unauthorized() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;

    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Buy credits
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Non-gateway tries to debit (should fail)
    let result = attacker
        .call(staking.id(), "debit_credits")
        .args_json(json!({
            "account_id": user.id().to_string(),
            "amount": 500
        }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-gateway should not be able to debit credits");

    // Credits unchanged
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.credits, 100 * 100); // 10000 credits

    Ok(())
}

#[tokio::test]
async fn test_staking_lock_wrong_token_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    // Deploy two FT contracts
    let ft_real = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let ft_fake = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft_fake, &owner, &user, 1000 * ONE_SOCIAL).await?;

    // Staking contract configured for ft_real
    let staking = setup_staking_contract(&worker, ft_real.id().as_str(), &owner).await?;

    // Try to lock with wrong token (should be rejected or refunded)
    let _ = user
        .call(ft_fake.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Should either fail or return full refund (unused_amount = amount)
    // Check no tokens were locked
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.locked_amount, "0");

    Ok(())
}

#[tokio::test]
async fn test_staking_invalid_lock_months_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;

    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Try lock with 0 months (invalid)
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":0}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Should fail or refund
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.locked_amount, "0");

    Ok(())
}

#[tokio::test]
async fn test_staking_lock_event_emitted() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;

    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    let outcome = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":6}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Check for STAKE_LOCK event
    let logs: Vec<String> = outcome.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "STAKE_LOCK");
    assert!(event.is_some(), "STAKE_LOCK event should be emitted");

    let event = event.unwrap();
    let data = &event["data"][0]["extra"];
    // Event emits: account_id, amount, months, unlock_at
    assert_eq!(data["amount"], (100 * ONE_SOCIAL).to_string());
    assert_eq!(data["months"], 6);

    Ok(())
}

// =============================================================================
// Event Parsing Tests
// =============================================================================

const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

fn find_event_log(logs: &[String], event_type: &str) -> Option<serde_json::Value> {
    for log in logs {
        if log.starts_with(EVENT_JSON_PREFIX) {
            let json_str = &log[EVENT_JSON_PREFIX.len()..];
            if let Ok(event) = serde_json::from_str::<serde_json::Value>(json_str) {
                if event.get("event").and_then(|e| e.as_str()) == Some(event_type) {
                    return Some(event);
                }
            }
        }
    }
    None
}

// =============================================================================
// PHASE 1: Lock/Unlock Flow Tests
// =============================================================================

#[tokio::test]
async fn test_unlock_before_expiry_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock tokens for 12 months
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Try to unlock immediately (should fail - lock period not expired)
    let result = user
        .call(staking.id(), "unlock")
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_failure(), "Unlock before expiry should fail");

    // Verify tokens still locked
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.locked_amount, (100 * ONE_SOCIAL).to_string());

    Ok(())
}

#[tokio::test]
async fn test_unlock_with_no_locked_tokens_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Try to unlock without having locked anything
    let result = user
        .call(staking.id(), "unlock")
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_failure(), "Unlock with no locked tokens should fail");

    Ok(())
}

#[tokio::test]
async fn test_additive_lock_extends_period() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // First lock: 100 tokens for 6 months
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":6}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let account_after_first: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    let first_unlock_at = account_after_first.unlock_at;

    // Second lock: 50 tokens for 12 months (should extend)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let account_after_second: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Verify: total locked = 150, months upgraded to 12, unlock_at extended
    assert_eq!(account_after_second.locked_amount, (150 * ONE_SOCIAL).to_string());
    assert_eq!(account_after_second.lock_months, 12);
    assert!(account_after_second.unlock_at > first_unlock_at, "Unlock time should be extended");

    Ok(())
}

#[tokio::test]
async fn test_additive_lock_shorter_period_no_extend() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // First lock: 100 tokens for 12 months
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let account_after_first: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    let first_unlock_at = account_after_first.unlock_at;

    // Second lock: 50 tokens for 6 months (shorter - should NOT reduce lock period)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":6}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let account_after_second: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Verify: total locked = 150, months stays 12, unlock_at unchanged
    assert_eq!(account_after_second.locked_amount, (150 * ONE_SOCIAL).to_string());
    assert_eq!(account_after_second.lock_months, 12);
    assert_eq!(account_after_second.unlock_at, first_unlock_at, "Unlock time should not change for shorter period");

    Ok(())
}

#[tokio::test]
async fn test_lock_all_valid_periods() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    let valid_periods = [1u64, 6, 12, 24, 48];

    for months in valid_periods {
        let user = worker.dev_create_account().await?;
        transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;

        let result = user
            .call(ft.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": staking.id().to_string(),
                "amount": (10 * ONE_SOCIAL).to_string(),
                "msg": format!(r#"{{"action":"lock","months":{}}}"#, months)
            }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(near_workspaces::types::Gas::from_tgas(100))
            .transact()
            .await?;

        assert!(result.is_success(), "Lock for {} months should succeed", months);

        let account: Account_ = staking
            .view("get_account")
            .args_json(json!({ "account_id": user.id().to_string() }))
            .await?
            .json()?;
        assert_eq!(account.lock_months, months);
    }

    Ok(())
}

#[tokio::test]
async fn test_lock_invalid_periods_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    let invalid_periods = [2u64, 3, 5, 7, 13, 49, 100];

    for months in invalid_periods {
        let _ = user
            .call(ft.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": staking.id().to_string(),
                "amount": (10 * ONE_SOCIAL).to_string(),
                "msg": format!(r#"{{"action":"lock","months":{}}}"#, months)
            }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(near_workspaces::types::Gas::from_tgas(100))
            .transact()
            .await?;

        // Should fail or refund
        let account: Account_ = staking
            .view("get_account")
            .args_json(json!({ "account_id": user.id().to_string() }))
            .await?
            .json()?;
        assert_eq!(account.locked_amount, "0", "Lock for {} months should be rejected", months);
    }

    Ok(())
}

// =============================================================================
// PHASE 1: Rewards System Tests
// =============================================================================

#[tokio::test]
async fn test_claim_rewards_no_pending_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock tokens but no rewards have been distributed yet
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Try to claim with 0 pending rewards
    let result = user
        .call(staking.id(), "claim_rewards")
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_failure(), "Claim with no rewards should fail");

    Ok(())
}

#[tokio::test]
async fn test_inject_rewards_owner_only() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &attacker, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Non-owner tries to inject rewards
    let _ = attacker
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"rewards"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Should fail - only owner can inject rewards
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.rewards_pool, "0", "Non-owner should not be able to inject rewards");

    Ok(())
}

#[tokio::test]
async fn test_inject_rewards_success() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Owner injects rewards
    owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (1000 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"rewards"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.rewards_pool, (1000 * ONE_SOCIAL).to_string());

    Ok(())
}

#[tokio::test]
async fn test_rewards_distribution_multiple_stakers() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user1 = worker.dev_create_account().await?;
    let user2 = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user1, 10000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user2, 10000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // User1 locks 100 tokens for 12 months (20% bonus = 120 effective)
    user1
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // User2 locks 100 tokens for 12 months (20% bonus = 120 effective)
    user2
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Someone buys credits (which adds to rewards pool)
    user1
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (1000 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Check pending rewards for both users
    let pending1: serde_json::Value = staking
        .view("get_pending_rewards")
        .args_json(json!({ "account_id": user1.id().to_string() }))
        .await?
        .json()?;

    let pending2: serde_json::Value = staking
        .view("get_pending_rewards")
        .args_json(json!({ "account_id": user2.id().to_string() }))
        .await?
        .json()?;

    // Both should have roughly equal rewards (same effective stake)
    let p1: u128 = pending1.as_str().unwrap().parse().unwrap();
    let p2: u128 = pending2.as_str().unwrap().parse().unwrap();

    // Allow 1% tolerance for rounding
    let diff = if p1 > p2 { p1 - p2 } else { p2 - p1 };
    let max_diff = std::cmp::max(p1, p2) / 100;
    assert!(diff <= max_diff, "Rewards should be roughly equal: {} vs {}", p1, p2);

    Ok(())
}

#[tokio::test]
async fn test_get_pending_rewards_accuracy() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 10000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // User locks tokens
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Owner injects rewards
    owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (1000 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"rewards"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Debug: check stats and account
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    
    eprintln!("DEBUG: total_effective_stake = {}", stats.total_effective_stake);
    eprintln!("DEBUG: rewards_pool = {}", stats.rewards_pool);
    eprintln!("DEBUG: reward_per_token = {}", stats.reward_per_token);
    eprintln!("DEBUG: user locked_amount = {}", account.locked_amount);
    eprintln!("DEBUG: user reward_per_token_paid = {}", account.reward_per_token_paid);

    // Get pending rewards
    let pending: String = staking
        .view("get_pending_rewards")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    let pending_amount: u128 = pending.parse().unwrap();
    eprintln!("DEBUG: pending_amount = {}", pending_amount);

    // User is sole staker, should get virtually all injected rewards
    // With U256-based muldiv, we get exact precision
    assert!(pending_amount > 999 * ONE_SOCIAL, "User should receive most injected rewards, got {}", pending_amount);
    assert!(pending_amount <= 1000 * ONE_SOCIAL, "User shouldn't receive more than injected");
    assert!(pending_amount <= 1000 * ONE_SOCIAL, "User shouldn't receive more than injected");

    Ok(())
}

// =============================================================================
// PHASE 1: Effective Stake Bonus Tests
// =============================================================================

#[tokio::test]
async fn test_effective_stake_1_month_bonus() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock for 1 month (10% bonus)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":1}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    let effective: u128 = stats.total_effective_stake.parse().unwrap();
    let expected = 100 * ONE_SOCIAL * 110 / 100; // 10% bonus

    assert_eq!(effective, expected, "1 month lock should have 10% bonus");

    Ok(())
}

#[tokio::test]
async fn test_effective_stake_6_month_bonus() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock for 6 months (10% bonus)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":6}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    let effective: u128 = stats.total_effective_stake.parse().unwrap();
    let expected = 100 * ONE_SOCIAL * 110 / 100; // 10% bonus

    assert_eq!(effective, expected, "6 month lock should have 10% bonus");

    Ok(())
}

#[tokio::test]
async fn test_effective_stake_12_month_bonus() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock for 12 months (20% bonus)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    let effective: u128 = stats.total_effective_stake.parse().unwrap();
    let expected = 100 * ONE_SOCIAL * 120 / 100; // 20% bonus

    assert_eq!(effective, expected, "12 month lock should have 20% bonus");

    Ok(())
}

#[tokio::test]
async fn test_effective_stake_24_month_bonus() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock for 24 months (35% bonus)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":24}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    let effective: u128 = stats.total_effective_stake.parse().unwrap();
    let expected = 100 * ONE_SOCIAL * 135 / 100; // 35% bonus

    assert_eq!(effective, expected, "24 month lock should have 35% bonus");

    Ok(())
}

#[tokio::test]
async fn test_effective_stake_48_month_bonus() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock for 48 months (50% bonus)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":48}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    let effective: u128 = stats.total_effective_stake.parse().unwrap();
    let expected = 100 * ONE_SOCIAL * 150 / 100; // 50% bonus

    assert_eq!(effective, expected, "48 month lock should have 50% bonus");

    Ok(())
}

#[tokio::test]
async fn test_total_effective_stake_updates_on_lock() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user1 = worker.dev_create_account().await?;
    let user2 = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user1, 1000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user2, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Initial state
    let stats0: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats0.total_effective_stake, "0");

    // User1 locks (12mo = 20% bonus)
    user1
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats1: ContractStats = staking.view("get_stats").await?.json()?;
    let effective1: u128 = stats1.total_effective_stake.parse().unwrap();
    assert_eq!(effective1, 100 * ONE_SOCIAL * 120 / 100);

    // User2 locks (48mo = 50% bonus)
    user2
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":48}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats2: ContractStats = staking.view("get_stats").await?.json()?;
    let effective2: u128 = stats2.total_effective_stake.parse().unwrap();
    let expected = (100 * ONE_SOCIAL * 120 / 100) + (100 * ONE_SOCIAL * 150 / 100);
    assert_eq!(effective2, expected);

    Ok(())
}

// =============================================================================
// PHASE 1: Credits System Tests
// =============================================================================

#[tokio::test]
async fn test_debit_credits_insufficient_returns_false() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Add gateway
    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Buy some credits (100 tokens * 100 = 10000 credits)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Try to debit more than available (credits = 100 * 100 * SCALE = 10^10)
    let result: bool = gateway
        .call(staking.id(), "debit_credits")
        .args_json(json!({
            "account_id": user.id().to_string(),
            "amount": 20000_u64  // Double the available (10000)
        }))
        .transact()
        .await?
        .json()?;

    assert!(!result, "Debit should return false when insufficient credits");

    // Verify credits unchanged
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.credits, 10000); // 100 * 100 unchanged

    Ok(())
}

#[tokio::test]
async fn test_buy_credits_amount_too_small() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Try to buy credits with dust amount (too small to result in any credits)
    // credits = amount * 100 / 10^18, so amount < 10^16 gives 0 credits
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": "1000000000000000",  // 10^15, gives 0 credits (100 * 10^15 / 10^18 = 0)
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Should fail or refund due to "Amount too small for credits"
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.credits, 0, "Dust amount should not result in credits");

    Ok(())
}

#[tokio::test]
async fn test_credits_lifetime_tracking() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 10000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Buy credits multiple times
    for _ in 0..3 {
        user.call(ft.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": staking.id().to_string(),
                "amount": (100 * ONE_SOCIAL).to_string(),
                "msg": r#"{"action":"credits"}"#
            }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(near_workspaces::types::Gas::from_tgas(100))
            .transact()
            .await?
            .into_result()?;
    }

    // Debit some credits
    let debit_amount = 5000_u64;
    gateway
        .call(staking.id(), "debit_credits")
        .args_json(json!({
            "account_id": user.id().to_string(),
            "amount": debit_amount
        }))
        .transact()
        .await?
        .into_result()?;

    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    // Bought 3 * 100 * 100 = 30000 credits, spent 5000, remaining = 25000
    assert_eq!(account.credits, 25000);
    assert_eq!(account.credits_lifetime, 30000);

    Ok(())
}

// =============================================================================
// PHASE 1: Infrastructure Pool Tests
// =============================================================================

#[tokio::test]
async fn test_withdraw_infra_success() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let receiver = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 10000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Buy credits to fill infra pool (60% goes to infra)
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (1000 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats_before: ContractStats = staking.view("get_stats").await?.json()?;
    let infra_before: u128 = stats_before.infra_pool.parse().unwrap();
    assert!(infra_before > 0);

    // Register receiver with FT contract
    receiver
        .call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": receiver.id().to_string() }))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;

    // Owner withdraws from infra pool
    let withdraw_amount = infra_before / 2;
    owner
        .call(staking.id(), "withdraw_infra")
        .args_json(json!({
            "amount": withdraw_amount.to_string(),
            "receiver_id": receiver.id().to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats_after: ContractStats = staking.view("get_stats").await?.json()?;
    let infra_after: u128 = stats_after.infra_pool.parse().unwrap();
    assert_eq!(infra_after, infra_before - withdraw_amount);

    Ok(())
}

#[tokio::test]
async fn test_withdraw_infra_unauthorized() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 10000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Buy credits to fill infra pool
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (1000 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Attacker tries to withdraw
    let result = attacker
        .call(staking.id(), "withdraw_infra")
        .args_json(json!({
            "amount": (100 * ONE_SOCIAL).to_string(),
            "receiver_id": attacker.id().to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner should not be able to withdraw infra");

    Ok(())
}

#[tokio::test]
async fn test_withdraw_infra_exceeds_balance() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 10000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Buy some credits
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Try to withdraw more than available
    let result = owner
        .call(staking.id(), "withdraw_infra")
        .args_json(json!({
            "amount": (10000 * ONE_SOCIAL).to_string(),
            "receiver_id": owner.id().to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_failure(), "Withdrawing more than balance should fail");

    Ok(())
}

// =============================================================================
// PHASE 2: Edge Cases & Boundary Tests
// =============================================================================

#[tokio::test]
async fn test_lock_zero_amount_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Try to lock 0 tokens
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": "0",
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Should fail - amount must be positive
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.locked_amount, "0");

    Ok(())
}

#[tokio::test]
async fn test_invalid_json_message_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Send malformed JSON
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": "not valid json {"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Should fail or refund
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.locked_amount, "0");
    assert_eq!(account.credits, 0);

    Ok(())
}

#[tokio::test]
async fn test_missing_action_field_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Valid JSON but missing action field
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Should fail or refund
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.locked_amount, "0");

    Ok(())
}

#[tokio::test]
async fn test_unknown_action_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Unknown action
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"unknown_action"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Should fail or refund
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.locked_amount, "0");
    assert_eq!(account.credits, 0);

    Ok(())
}

#[tokio::test]
async fn test_lock_missing_months_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock action without months field
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    // Should fail or refund
    let account: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account.locked_amount, "0");

    Ok(())
}

#[tokio::test]
async fn test_multiple_users_independent_state() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user_a = worker.dev_create_account().await?;
    let user_b = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user_a, 5000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user_b, 5000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // User A locks 100 tokens for 12 months
    user_a
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // User B buys 200 credits
    user_b
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (200 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Verify User A state
    let account_a: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user_a.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account_a.locked_amount, (100 * ONE_SOCIAL).to_string());
    assert_eq!(account_a.lock_months, 12);
    assert_eq!(account_a.credits, 0); // A didn't buy credits

    // Verify User B state
    let account_b: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user_b.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(account_b.locked_amount, "0"); // B didn't lock
    assert_eq!(account_b.credits, 200 * 100); // 20000 credits

    Ok(())
}

// =============================================================================
// PHASE 2: Callback Protection Tests
// =============================================================================

#[tokio::test]
async fn test_on_unlock_callback_only_callable_by_contract() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Attacker tries to call callback directly
    let result = attacker
        .call(staking.id(), "on_unlock_callback")
        .args_json(json!({
            "account_id": attacker.id().to_string(),
            "amount": "1000000000000000000000000",
            "effective": "1000000000000000000000000"
        }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Direct callback call should fail (private)");

    Ok(())
}

#[tokio::test]
async fn test_on_claim_rewards_callback_only_callable_by_contract() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Attacker tries to call callback directly
    let result = attacker
        .call(staking.id(), "on_claim_rewards_callback")
        .args_json(json!({
            "account_id": attacker.id().to_string(),
            "amount": "1000000000000000000000000"
        }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Direct callback call should fail (private)");

    Ok(())
}

#[tokio::test]
async fn test_on_withdraw_infra_callback_only_callable_by_contract() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Attacker tries to call callback directly
    let result = attacker
        .call(staking.id(), "on_withdraw_infra_callback")
        .args_json(json!({
            "amount": "1000000000000000000000000",
            "receiver_id": attacker.id().to_string()
        }))
        .transact()
        .await?;

    assert!(result.is_failure(), "Direct callback call should fail (private)");

    Ok(())
}

// =============================================================================
// PHASE 3: Event Emission Tests
// =============================================================================

#[tokio::test]
async fn test_event_credits_purchase() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    let outcome = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let logs: Vec<String> = outcome.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "CREDITS_PURCHASE");
    assert!(event.is_some(), "CREDITS_PURCHASE event should be emitted");

    let event = event.unwrap();
    let data = &event["data"][0]["extra"];
    assert_eq!(data["amount"], (50 * ONE_SOCIAL).to_string());
    assert_eq!(data["credits"], 50 * 100); // 5000 credits

    Ok(())
}

#[tokio::test]
async fn test_event_credits_debit() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Buy credits
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Debit credits
    let outcome = gateway
        .call(staking.id(), "debit_credits")
        .args_json(json!({
            "account_id": user.id().to_string(),
            "amount": 500
        }))
        .transact()
        .await?
        .into_result()?;

    let logs: Vec<String> = outcome.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "CREDITS_DEBIT");
    assert!(event.is_some(), "CREDITS_DEBIT event should be emitted");

    let event = event.unwrap();
    let data = &event["data"][0]["extra"];
    assert_eq!(data["amount"], 500);
    assert_eq!(data["gateway"], gateway.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_event_rewards_inject() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    let outcome = owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (500 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"rewards"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let logs: Vec<String> = outcome.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "REWARDS_INJECT");
    assert!(event.is_some(), "REWARDS_INJECT event should be emitted");

    let event = event.unwrap();
    let data = &event["data"][0]["extra"];
    assert_eq!(data["amount"], (500 * ONE_SOCIAL).to_string());

    Ok(())
}

#[tokio::test]
async fn test_event_free_daily_credits_updated() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    let outcome = owner
        .call(staking.id(), "set_free_daily_credits")
        .args_json(json!({ "amount": 100 }))
        .transact()
        .await?
        .into_result()?;

    let logs: Vec<String> = outcome.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "PARAMS_UPDATED");
    assert!(event.is_some(), "PARAMS_UPDATED event should be emitted");

    let event = event.unwrap();
    let data = &event["data"][0]["extra"];
    assert_eq!(data["param"], "free_daily_credits");
    assert_eq!(data["old_value"], 50);
    assert_eq!(data["new_value"], 100);

    Ok(())
}

// =============================================================================
// PHASE 3: Additional Coverage Tests
// =============================================================================

#[tokio::test]
async fn test_get_stats_complete() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 10_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 5000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Lock tokens
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Buy credits
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (200 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let stats: ContractStats = staking.view("get_stats").await?.json()?;

    // Verify all fields
    assert_eq!(stats.token_id, ft.id().to_string());
    assert_eq!(stats.owner_id, owner.id().to_string());
    assert_eq!(stats.total_locked, (100 * ONE_SOCIAL).to_string());
    assert_eq!(stats.total_effective_stake, (100 * ONE_SOCIAL * 120 / 100).to_string()); // 20% bonus
    
    // 200 tokens * 60% = 120 tokens to infra
    let expected_infra = 200 * ONE_SOCIAL * 60 / 100;
    assert_eq!(stats.infra_pool, expected_infra.to_string());
    
    // 200 tokens * 40% = 80 tokens to rewards
    let expected_rewards = 200 * ONE_SOCIAL * 40 / 100;
    assert_eq!(stats.rewards_pool, expected_rewards.to_string());
    
    assert_eq!(stats.credits_per_token, 100);
    assert_eq!(stats.free_daily_credits, 50);

    Ok(())
}

#[tokio::test]
async fn test_is_gateway_false_for_non_gateway() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let random_user = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    let is_gateway: bool = staking
        .view("is_gateway")
        .args_json(json!({ "account_id": random_user.id().to_string() }))
        .await?
        .json()?;

    assert!(!is_gateway, "Random user should not be a gateway");

    Ok(())
}

#[tokio::test]
async fn test_add_same_gateway_twice() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Add gateway
    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Add same gateway again (should succeed or be idempotent)
    let _ = owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?;

    // Should still be a gateway
    let is_gateway: bool = staking
        .view("is_gateway")
        .args_json(json!({ "account_id": gateway.id().to_string() }))
        .await?
        .json()?;
    assert!(is_gateway);

    Ok(())
}

#[tokio::test]
async fn test_remove_non_existent_gateway() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Remove gateway that was never added (should succeed or be idempotent)
    let _ = owner
        .call(staking.id(), "remove_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?;

    // Just verify it doesn't crash
    let is_gateway: bool = staking
        .view("is_gateway")
        .args_json(json!({ "account_id": gateway.id().to_string() }))
        .await?
        .json()?;
    assert!(!is_gateway);

    Ok(())
}

#[tokio::test]
async fn test_multiple_gateways() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let gateway1 = worker.dev_create_account().await?;
    let gateway2 = worker.dev_create_account().await?;
    let gateway3 = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Add multiple gateways
    for gw in [&gateway1, &gateway2, &gateway3] {
        owner
            .call(staking.id(), "add_gateway")
            .args_json(json!({ "gateway_id": gw.id().to_string() }))
            .transact()
            .await?
            .into_result()?;
    }

    // Verify all are gateways
    for gw in [&gateway1, &gateway2, &gateway3] {
        let is_gateway: bool = staking
            .view("is_gateway")
            .args_json(json!({ "account_id": gw.id().to_string() }))
            .await?
            .json()?;
        assert!(is_gateway, "{} should be a gateway", gw.id());
    }

    // Remove one
    owner
        .call(staking.id(), "remove_gateway")
        .args_json(json!({ "gateway_id": gateway2.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Verify gateway2 removed, others still present
    let is_gw1: bool = staking
        .view("is_gateway")
        .args_json(json!({ "account_id": gateway1.id().to_string() }))
        .await?
        .json()?;
    let is_gw2: bool = staking
        .view("is_gateway")
        .args_json(json!({ "account_id": gateway2.id().to_string() }))
        .await?
        .json()?;
    let is_gw3: bool = staking
        .view("is_gateway")
        .args_json(json!({ "account_id": gateway3.id().to_string() }))
        .await?
        .json()?;

    assert!(is_gw1);
    assert!(!is_gw2);
    assert!(is_gw3);

    Ok(())
}

// =============================================================================
// Contract Upgrade Tests
// =============================================================================

#[tokio::test]
async fn test_update_contract_emits_event() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    let wasm_path = get_wasm_path("staking-onsocial");
    let wasm = std::fs::read(&wasm_path)?;

    let result = owner
        .call(staking.id(), "update_contract")
        .args(wasm)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_success());

    // Verify CONTRACT_UPGRADE event was emitted
    let logs: Vec<String> = result.logs().iter().map(|s| s.to_string()).collect();
    let event = find_event_log(&logs, "CONTRACT_UPGRADE");
    assert!(event.is_some(), "CONTRACT_UPGRADE event should be emitted");

    let event = event.unwrap();
    assert_eq!(event["standard"], "onsocial");
    assert_eq!(event["version"], "1.0.0");
    assert_eq!(event["data"][0]["account_id"], owner.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_update_contract_preserves_user_balances() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;

    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    transfer_tokens_to_user(&ft, &owner, &user, 10000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // User locks tokens
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (500 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // User buys credits
    user.call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id().to_string(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Get state before upgrade
    let account_before: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    let stats_before: ContractStats = staking.view("get_stats").await?.json()?;

    // Upgrade contract
    let wasm_path = get_wasm_path("staking-onsocial");
    let wasm = std::fs::read(&wasm_path)?;

    owner
        .call(staking.id(), "update_contract")
        .args(wasm)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Verify user state preserved
    let account_after: Account_ = staking
        .view("get_account")
        .args_json(json!({ "account_id": user.id().to_string() }))
        .await?
        .json()?;

    assert_eq!(account_before.locked_amount, account_after.locked_amount, "Locked amount should be preserved");
    assert_eq!(account_before.credits, account_after.credits, "Credits should be preserved");
    assert_eq!(account_before.lock_months, account_after.lock_months, "Lock months should be preserved");
    assert_eq!(account_before.credits_lifetime, account_after.credits_lifetime, "Credits lifetime should be preserved");

    // Verify global state preserved
    let stats_after: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats_before.total_locked, stats_after.total_locked, "Total locked should be preserved");
    assert_eq!(stats_before.infra_pool, stats_after.infra_pool, "Infra pool should be preserved");

    Ok(())
}

#[tokio::test]
async fn test_update_contract_owner_succeeds() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Get the same wasm (simulating an upgrade with same code)
    let wasm_path = get_wasm_path("staking-onsocial");
    let wasm = std::fs::read(&wasm_path)?;

    // Owner calls update_contract with wasm as input
    let result = owner
        .call(staking.id(), "update_contract")
        .args(wasm)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_success(), "Owner should be able to upgrade: {:?}", result);

    // Verify contract still works after upgrade
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.owner_id, owner.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_update_contract_non_owner_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    let wasm_path = get_wasm_path("staking-onsocial");
    let wasm = std::fs::read(&wasm_path)?;

    // Non-owner tries to upgrade
    let result = attacker
        .call(staking.id(), "update_contract")
        .args(wasm)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner should not be able to upgrade");

    Ok(())
}

#[tokio::test]
async fn test_update_contract_preserves_state() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let gateway = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Set up some state: add gateway, change params
    owner
        .call(staking.id(), "add_gateway")
        .args_json(json!({ "gateway_id": gateway.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    owner
        .call(staking.id(), "set_credits_per_token")
        .args_json(json!({ "rate": 200 }))
        .transact()
        .await?
        .into_result()?;

    owner
        .call(staking.id(), "set_free_daily_credits")
        .args_json(json!({ "amount": 100 }))
        .transact()
        .await?
        .into_result()?;

    // Upgrade contract
    let wasm_path = get_wasm_path("staking-onsocial");
    let wasm = std::fs::read(&wasm_path)?;

    owner
        .call(staking.id(), "update_contract")
        .args(wasm)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    // Verify state preserved
    let stats: ContractStats = staking.view("get_stats").await?.json()?;
    assert_eq!(stats.credits_per_token, 200);
    assert_eq!(stats.free_daily_credits, 100);

    let is_gateway: bool = staking
        .view("is_gateway")
        .args_json(json!({ "account_id": gateway.id().to_string() }))
        .await?
        .json()?;
    assert!(is_gateway, "Gateway should be preserved after upgrade");

    Ok(())
}

#[tokio::test]
async fn test_update_contract_after_owner_transfer() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let new_owner = worker.dev_create_account().await?;

    let staking = setup_staking_contract(&worker, "social.token.near", &owner).await?;

    // Transfer ownership
    owner
        .call(staking.id(), "set_owner")
        .args_json(json!({ "new_owner": new_owner.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    let wasm_path = get_wasm_path("staking-onsocial");
    let wasm = std::fs::read(&wasm_path)?;

    // Old owner can no longer upgrade
    let result = owner
        .call(staking.id(), "update_contract")
        .args(wasm.clone())
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_failure(), "Old owner should not be able to upgrade");

    // New owner can upgrade
    let result = new_owner
        .call(staking.id(), "update_contract")
        .args(wasm)
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_success(), "New owner should be able to upgrade: {:?}", result);

    Ok(())
}
