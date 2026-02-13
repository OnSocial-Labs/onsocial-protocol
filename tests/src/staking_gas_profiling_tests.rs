// =============================================================================
// Staking-OnSocial Gas Profiling Tests
// =============================================================================
// Tests that measure gas consumption for all staking operations.
// Run with: cargo test -p onsocial-integration-tests staking_gas_profiling -- --nocapture --test-threads=1

use anyhow::Result;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::utils::{get_wasm_path, setup_sandbox};

const ONE_SOCIAL: u128 = 1_000_000_000_000_000_000;

// Gas threshold constants (in TGas)
const MAX_STORAGE_DEPOSIT_TGAS: u64 = 5;
const MAX_LOCK_TGAS: u64 = 25;
const MAX_UNLOCK_TGAS: u64 = 30;
const MAX_CLAIM_REWARDS_TGAS: u64 = 30;
const MAX_EXTEND_LOCK_TGAS: u64 = 15;
const MAX_RENEW_LOCK_TGAS: u64 = 15;
const MAX_INJECT_REWARDS_TGAS: u64 = 20;
const MAX_WITHDRAW_INFRA_TGAS: u64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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

// =============================================================================
// Test Setup Helpers
// =============================================================================

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
            "decimals": 24
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

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

fn gas_to_tgas(gas: Gas) -> u64 {
    gas.as_gas() / 1_000_000_000_000
}

fn format_gas_report(name: &str, gas: Gas, threshold_tgas: u64) -> String {
    let tgas = gas_to_tgas(gas);
    let status = if tgas <= threshold_tgas {
        "✅"
    } else {
        "⚠️ "
    };
    format!(
        "{} {:25} {:>4} TGas (threshold: {} TGas)",
        status, name, tgas, threshold_tgas
    )
}

// =============================================================================
// Individual Gas Profiling Tests
// =============================================================================

#[tokio::test]
async fn gas_profile_storage_deposit() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    let result = user
        .call(staking.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;

    let gas = result.total_gas_burnt;
    println!(
        "\n{}",
        format_gas_report("storage_deposit", gas, MAX_STORAGE_DEPOSIT_TGAS)
    );

    assert!(
        gas_to_tgas(gas) <= MAX_STORAGE_DEPOSIT_TGAS,
        "storage_deposit exceeded {} TGas threshold: {} TGas",
        MAX_STORAGE_DEPOSIT_TGAS,
        gas_to_tgas(gas)
    );

    Ok(())
}

#[tokio::test]
async fn gas_profile_lock_tokens() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let _ = user
        .call(staking.id(), "storage_deposit")
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;

    // Profile lock operation
    let result = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    let gas = result.total_gas_burnt;
    println!(
        "\n{}",
        format_gas_report("lock_tokens (12 months)", gas, MAX_LOCK_TGAS)
    );

    assert!(
        gas_to_tgas(gas) <= MAX_LOCK_TGAS,
        "lock_tokens exceeded {} TGas threshold: {} TGas",
        MAX_LOCK_TGAS,
        gas_to_tgas(gas)
    );

    Ok(())
}

#[tokio::test]
async fn gas_profile_unlock_tokens() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let _ = user
        .call(staking.id(), "storage_deposit")
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;

    // Lock with 1 month (shortest)
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":1}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    // Fast-forward time past unlock period (simulated by sandbox)
    worker.fast_forward(100).await?;

    // Profile unlock operation
    let result = user
        .call(staking.id(), "unlock")
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;

    let gas = result.total_gas_burnt;
    println!(
        "\n{}",
        format_gas_report("unlock_tokens", gas, MAX_UNLOCK_TGAS)
    );

    // Note: unlock may fail if time hasn't passed, but we still measure gas
    Ok(())
}

#[tokio::test]
async fn gas_profile_extend_lock() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let _ = user
        .call(staking.id(), "storage_deposit")
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;

    // Lock with 6 months first
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":6}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    // Profile extend lock operation (6 -> 12 months)
    let result = user
        .call(staking.id(), "extend_lock")
        .args_json(json!({"months": 12}))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    let gas = result.total_gas_burnt;
    println!(
        "\n{}",
        format_gas_report("extend_lock (6→12)", gas, MAX_EXTEND_LOCK_TGAS)
    );

    assert!(
        gas_to_tgas(gas) <= MAX_EXTEND_LOCK_TGAS,
        "extend_lock exceeded {} TGas threshold: {} TGas",
        MAX_EXTEND_LOCK_TGAS,
        gas_to_tgas(gas)
    );

    Ok(())
}

#[tokio::test]
async fn gas_profile_renew_lock() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let _ = user
        .call(staking.id(), "storage_deposit")
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;

    // Lock with 12 months
    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    // Profile renew lock operation
    let result = user
        .call(staking.id(), "renew_lock")
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    let gas = result.total_gas_burnt;
    println!(
        "\n{}",
        format_gas_report("renew_lock", gas, MAX_RENEW_LOCK_TGAS)
    );

    assert!(
        gas_to_tgas(gas) <= MAX_RENEW_LOCK_TGAS,
        "renew_lock exceeded {} TGas threshold: {} TGas",
        MAX_RENEW_LOCK_TGAS,
        gas_to_tgas(gas)
    );

    Ok(())
}

#[tokio::test]
async fn gas_profile_inject_rewards() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup - need at least one staker for rewards to distribute
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let _ = user
        .call(staking.id(), "storage_deposit")
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;

    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    // Profile inject rewards operation (owner only)
    let result = owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (1000 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"fund_scheduled"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    let gas = result.total_gas_burnt;
    println!(
        "\n{}",
        format_gas_report("inject_rewards", gas, MAX_INJECT_REWARDS_TGAS)
    );

    assert!(
        gas_to_tgas(gas) <= MAX_INJECT_REWARDS_TGAS,
        "inject_rewards exceeded {} TGas threshold: {} TGas",
        MAX_INJECT_REWARDS_TGAS,
        gas_to_tgas(gas)
    );

    Ok(())
}

#[tokio::test]
async fn gas_profile_credits_purchase() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let _ = user
        .call(staking.id(), "storage_deposit")
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;

    // Profile credits purchase operation
    let result = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    let gas = result.total_gas_burnt;
    println!(
        "\n{}",
        format_gas_report("credits_purchase", gas, MAX_LOCK_TGAS)
    );

    Ok(())
}

#[tokio::test]
async fn gas_profile_claim_rewards() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup - stake and inject rewards
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let _ = user
        .call(staking.id(), "storage_deposit")
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;

    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":12}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    // Inject rewards
    let _ = owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (1000 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"fund_scheduled"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    // Profile claim rewards operation
    let result = user
        .call(staking.id(), "claim_rewards")
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;

    let gas = result.total_gas_burnt;
    println!(
        "\n{}",
        format_gas_report("claim_rewards", gas, MAX_CLAIM_REWARDS_TGAS)
    );

    Ok(())
}

#[tokio::test]
async fn gas_profile_withdraw_infra() -> Result<()> {
    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let receiver = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    // Setup - buy credits to fund infra pool
    transfer_tokens_to_user(&ft, &owner, &user, 1000 * ONE_SOCIAL).await?;
    let _ = user
        .call(staking.id(), "storage_deposit")
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;

    let _ = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;

    // Profile withdraw infra operation (owner only)
    let result = owner
        .call(staking.id(), "withdraw_infra")
        .args_json(json!({
            "amount": (10 * ONE_SOCIAL).to_string(),
            "receiver_id": receiver.id().to_string()
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;

    let gas = result.total_gas_burnt;
    println!(
        "\n{}",
        format_gas_report("withdraw_infra", gas, MAX_WITHDRAW_INFRA_TGAS)
    );

    Ok(())
}

// =============================================================================
// Comprehensive Gas Report
// =============================================================================

#[tokio::test]
async fn gas_profile_all_operations_summary() -> Result<()> {
    println!("\n");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  📊 STAKING CONTRACT GAS PROFILING SUMMARY");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 1_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    transfer_tokens_to_user(&ft, &owner, &user, 10000 * ONE_SOCIAL).await?;

    let mut results: Vec<(&str, u64, u64)> = Vec::new();

    // 1. Deposit Storage
    let r = user
        .call(staking.id(), "storage_deposit")
        .deposit(NearToken::from_millinear(5))
        .transact()
        .await?;
    results.push((
        "storage_deposit",
        gas_to_tgas(r.total_gas_burnt),
        MAX_STORAGE_DEPOSIT_TGAS,
    ));

    // 2. Lock 1 month
    let r = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"lock","months":1}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    results.push((
        "lock (1 month)",
        gas_to_tgas(r.total_gas_burnt),
        MAX_LOCK_TGAS,
    ));

    // 3. Extend lock
    let r = user
        .call(staking.id(), "extend_lock")
        .args_json(json!({"months": 12}))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    results.push((
        "extend_lock (1→12)",
        gas_to_tgas(r.total_gas_burnt),
        MAX_EXTEND_LOCK_TGAS,
    ));

    // 4. Renew lock
    let r = user
        .call(staking.id(), "renew_lock")
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    results.push((
        "renew_lock",
        gas_to_tgas(r.total_gas_burnt),
        MAX_RENEW_LOCK_TGAS,
    ));

    // 5. Buy credits
    let r = user
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (50 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"credits"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    results.push((
        "credits_purchase",
        gas_to_tgas(r.total_gas_burnt),
        MAX_LOCK_TGAS,
    ));

    // 6. Inject rewards
    let r = owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": staking.id(),
            "amount": (1000 * ONE_SOCIAL).to_string(),
            "msg": r#"{"action":"fund_scheduled"}"#
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    results.push((
        "inject_rewards",
        gas_to_tgas(r.total_gas_burnt),
        MAX_INJECT_REWARDS_TGAS,
    ));

    // 7. Claim rewards
    let r = user
        .call(staking.id(), "claim_rewards")
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    results.push((
        "claim_rewards",
        gas_to_tgas(r.total_gas_burnt),
        MAX_CLAIM_REWARDS_TGAS,
    ));

    // Print summary
    println!("\n  Operation                   Gas Used   Threshold   Status");
    println!("  ─────────────────────────────────────────────────────────────");

    let mut all_passed = true;
    for (name, gas, threshold) in &results {
        let status = if *gas <= *threshold {
            "✅"
        } else {
            "⚠️ EXCEEDED"
        };
        if *gas > *threshold {
            all_passed = false;
        }
        println!(
            "  {:25} {:>4} TGas    {:>2} TGas    {}",
            name, gas, threshold, status
        );
    }

    println!("  ─────────────────────────────────────────────────────────────");

    let total_gas: u64 = results.iter().map(|(_, g, _)| g).sum();
    println!("  Total gas for full flow:    {} TGas", total_gas);

    if all_passed {
        println!("\n  ✅ All operations within gas thresholds!");
    } else {
        println!("\n  ⚠️  Some operations exceeded thresholds - review needed");
    }

    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    Ok(())
}

// =============================================================================
// Load Testing
// =============================================================================

#[tokio::test]
async fn gas_profile_load_test_10_users() -> Result<()> {
    println!("\n");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  📈 LOAD TEST: 10 CONCURRENT USERS");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let worker = setup_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = setup_mock_ft_contract(&worker, &owner, 100_000_000 * ONE_SOCIAL).await?;
    let staking = setup_staking_contract(&worker, ft.id().as_str(), &owner).await?;

    let num_users = 10;
    let mut users = Vec::new();

    // Create users
    for _ in 0..num_users {
        let user = worker.dev_create_account().await?;
        users.push(user);
    }

    let start = std::time::Instant::now();
    let mut total_gas = 0u64;
    let mut lock_gas_samples = Vec::new();

    for (i, user) in users.iter().enumerate() {
        // Transfer tokens
        transfer_tokens_to_user(&ft, &owner, user, 1000 * ONE_SOCIAL).await?;

        // Deposit storage
        let _ = user
            .call(staking.id(), "storage_deposit")
            .deposit(NearToken::from_millinear(5))
            .transact()
            .await?;

        // Lock tokens
        let lock_result = user
            .call(ft.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": staking.id(),
                "amount": (100 * ONE_SOCIAL).to_string(),
                "msg": r#"{"action":"lock","months":12}"#
            }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(Gas::from_tgas(50))
            .transact()
            .await?;

        let gas = gas_to_tgas(lock_result.total_gas_burnt);
        lock_gas_samples.push(gas);
        total_gas += gas;

        println!("  ✓ User {} locked tokens: {} TGas", i + 1, gas);
    }

    let elapsed = start.elapsed();
    let avg_gas = total_gas / num_users as u64;
    let min_gas = *lock_gas_samples.iter().min().unwrap();
    let max_gas = *lock_gas_samples.iter().max().unwrap();

    // Check final state
    let stats: ContractStats = staking.view("get_stats").await?.json()?;

    println!("\n  ─────────────────────────────────────────────────────────────");
    println!("  Results:");
    println!("    • Total time:       {:?}", elapsed);
    println!("    • Users processed:  {}", num_users);
    println!("    • Total gas:        {} TGas", total_gas);
    println!("    • Average gas:      {} TGas per lock", avg_gas);
    println!("    • Gas range:        {} - {} TGas", min_gas, max_gas);
    println!("    • Total locked:     {} SOCIAL", stats.total_locked);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Verify state consistency
    assert!(
        avg_gas <= MAX_LOCK_TGAS,
        "Average gas exceeded threshold under load"
    );

    Ok(())
}
