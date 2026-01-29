//! Integration tests for the SOCIAL token contract (token-onsocial).
//!
//! Tests NEP-141 fungible token functionality including:
//! - Deployment and initialization
//! - Token transfers (ft_transfer)
//! - Token transfer calls (ft_transfer_call)
//! - Storage management
//! - Owner admin functions
//! - Burn functionality

use anyhow::Result;
use near_workspaces::types::NearToken;
use near_workspaces::Account;
use serde_json::json;

use crate::utils::{deploy_contract, get_wasm_path, setup_sandbox};

const ONE_SOCIAL: u128 = 1_000_000_000_000_000_000; // 10^18 (cross-chain compatible)
const TOTAL_SUPPLY: u128 = 1_000_000_000 * ONE_SOCIAL; // 1 billion

// =============================================================================
// Setup helpers
// =============================================================================

async fn setup_token_contract(
) -> Result<(near_workspaces::Worker<near_workspaces::network::Sandbox>, near_workspaces::Contract)>
{
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("token_onsocial");
    let contract = deploy_contract(&worker, &wasm_path).await?;

    // Initialize the contract (decimals fixed at 18 for cross-chain compatibility)
    contract
        .call("new")
        .args_json(json!({
            "owner_id": contract.id(),
            "name": "OnSocial",
            "symbol": "SOCIAL",
            "total_supply": TOTAL_SUPPLY.to_string(),
            "icon": null
        }))
        .transact()
        .await?
        .into_result()?;

    Ok((worker, contract))
}

async fn register_user(contract: &near_workspaces::Contract, user: &Account) -> Result<()> {
    user.call(contract.id(), "storage_deposit")
        .args_json(json!({
            "account_id": user.id(),
            "registration_only": true
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

// =============================================================================
// Initialization Tests
// =============================================================================

#[tokio::test]
async fn test_token_deploy_and_init() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    // Check total supply
    let total_supply: String = contract.view("ft_total_supply").args_json(json!({})).await?.json()?;
    assert_eq!(total_supply, TOTAL_SUPPLY.to_string());

    // Check owner balance equals total supply
    let owner_balance: String = contract
        .view("ft_balance_of")
        .args_json(json!({ "account_id": contract.id() }))
        .await?
        .json()?;
    assert_eq!(owner_balance, TOTAL_SUPPLY.to_string());

    Ok(())
}

#[tokio::test]
async fn test_token_metadata() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    let metadata: serde_json::Value = contract.view("ft_metadata").args_json(json!({})).await?.json()?;

    assert_eq!(metadata["name"], "OnSocial");
    assert_eq!(metadata["symbol"], "SOCIAL");
    assert_eq!(metadata["decimals"], 18); // 18 decimals for cross-chain compatibility
    assert_eq!(metadata["spec"], "ft-1.0.0");

    Ok(())
}

// =============================================================================
// Configurable Token Tests
// =============================================================================

#[tokio::test]
async fn test_custom_token_parameters() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("token_onsocial");
    let contract = deploy_contract(&worker, &wasm_path).await?;

    // Deploy with custom parameters (governance token example)
    let custom_supply: u128 = 100_000_000 * ONE_SOCIAL; // 100M tokens
    contract
        .call("new")
        .args_json(json!({
            "owner_id": contract.id(),
            "name": "OnSocial Governance",
            "symbol": "OSGOV",
            "total_supply": custom_supply.to_string(),
            "icon": "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="
        }))
        .transact()
        .await?
        .into_result()?;

    // Verify custom metadata
    let metadata: serde_json::Value = contract.view("ft_metadata").args_json(json!({})).await?.json()?;
    assert_eq!(metadata["name"], "OnSocial Governance");
    assert_eq!(metadata["symbol"], "OSGOV");
    assert_eq!(metadata["decimals"], 18); // Always 18
    assert_eq!(metadata["icon"], "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");

    // Verify custom supply
    let total_supply: String = contract.view("ft_total_supply").args_json(json!({})).await?.json()?;
    assert_eq!(total_supply, custom_supply.to_string());

    Ok(())
}

#[tokio::test]
async fn test_init_empty_name_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("token_onsocial");
    let contract = deploy_contract(&worker, &wasm_path).await?;

    let result = contract
        .call("new")
        .args_json(json!({
            "owner_id": contract.id(),
            "name": "",
            "symbol": "TEST",
            "total_supply": "1000000",
            "icon": null
        }))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

#[tokio::test]
async fn test_init_empty_symbol_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("token_onsocial");
    let contract = deploy_contract(&worker, &wasm_path).await?;

    let result = contract
        .call("new")
        .args_json(json!({
            "owner_id": contract.id(),
            "name": "Test Token",
            "symbol": "",
            "total_supply": "1000000",
            "icon": null
        }))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

#[tokio::test]
async fn test_init_zero_supply_fails() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("token_onsocial");
    let contract = deploy_contract(&worker, &wasm_path).await?;

    let result = contract
        .call("new")
        .args_json(json!({
            "owner_id": contract.id(),
            "name": "Test Token",
            "symbol": "TEST",
            "total_supply": "0",
            "icon": null
        }))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

// Note: test_different_decimals removed - decimals are now hardcoded to 18

#[tokio::test]
async fn test_version() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    let version: String = contract.view("version").args_json(json!({})).await?.json()?;
    assert_eq!(version, "1.0.0");

    Ok(())
}

#[tokio::test]
async fn test_get_owner() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    let owner: String = contract.view("get_owner").args_json(json!({})).await?.json()?;
    assert_eq!(owner, contract.id().to_string());

    Ok(())
}

// =============================================================================
// Transfer Tests
// =============================================================================

#[tokio::test]
async fn test_ft_transfer() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;

    // Register alice
    register_user(&contract, &alice).await?;

    let transfer_amount = 1000 * ONE_SOCIAL;

    // Transfer from owner (contract) to alice
    contract
        .call("ft_transfer")
        .args_json(json!({
            "receiver_id": alice.id(),
            "amount": transfer_amount.to_string(),
            "memo": "Test transfer"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Check alice's balance
    let alice_balance: String = contract
        .view("ft_balance_of")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    assert_eq!(alice_balance, transfer_amount.to_string());

    // Check owner's balance decreased
    let owner_balance: String = contract
        .view("ft_balance_of")
        .args_json(json!({ "account_id": contract.id() }))
        .await?
        .json()?;
    assert_eq!(
        owner_balance,
        (TOTAL_SUPPLY - transfer_amount).to_string()
    );

    Ok(())
}

#[tokio::test]
async fn test_ft_transfer_requires_registration() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let bob = worker.dev_create_account().await?;

    // Try to transfer to unregistered bob - should fail
    let result = contract
        .call("ft_transfer")
        .args_json(json!({
            "receiver_id": bob.id(),
            "amount": "1000",
            "memo": null
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

#[tokio::test]
async fn test_ft_transfer_requires_deposit() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;
    register_user(&contract, &alice).await?;

    // Try to transfer without 1 yoctoNEAR deposit - should fail
    let result = contract
        .call("ft_transfer")
        .args_json(json!({
            "receiver_id": alice.id(),
            "amount": "1000",
            "memo": null
        }))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

// =============================================================================
// Storage Management Tests
// =============================================================================

#[tokio::test]
async fn test_storage_deposit() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;

    // Deposit storage for alice
    let _result = alice
        .call(contract.id(), "storage_deposit")
        .args_json(json!({
            "account_id": null,
            "registration_only": true
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    // Check storage balance
    let storage_balance: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;

    assert!(storage_balance["total"].as_str().is_some());
    Ok(())
}

#[tokio::test]
async fn test_storage_balance_bounds() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    let bounds: serde_json::Value = contract
        .view("storage_balance_bounds")
        .args_json(json!({}))
        .await?
        .json()?;

    // Should have min and max
    assert!(bounds["min"].as_str().is_some());
    Ok(())
}

// =============================================================================
// Owner Admin Tests
// =============================================================================

#[tokio::test]
async fn test_set_icon() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    // Set icon
    let icon = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    contract
        .call("set_icon")
        .args_json(json!({ "icon": icon }))
        .transact()
        .await?
        .into_result()?;

    // Verify icon was set
    let metadata: serde_json::Value = contract.view("ft_metadata").args_json(json!({})).await?.json()?;
    assert_eq!(metadata["icon"], icon);

    Ok(())
}

#[tokio::test]
async fn test_set_icon_non_owner_fails() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;

    // Alice tries to set icon - should fail
    let result = alice
        .call(contract.id(), "set_icon")
        .args_json(json!({ "icon": "bad_icon" }))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

#[tokio::test]
async fn test_set_reference() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    let reference = "https://onsocial.io/token.json";
    contract
        .call("set_reference")
        .args_json(json!({
            "reference": reference,
            "reference_hash": null
        }))
        .transact()
        .await?
        .into_result()?;

    let metadata: serde_json::Value = contract.view("ft_metadata").args_json(json!({})).await?.json()?;
    assert_eq!(metadata["reference"], reference);

    Ok(())
}

#[tokio::test]
async fn test_set_owner() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;

    // Transfer ownership to alice
    contract
        .call("set_owner")
        .args_json(json!({ "new_owner": alice.id() }))
        .transact()
        .await?
        .into_result()?;

    // Verify new owner
    let owner: String = contract.view("get_owner").args_json(json!({})).await?.json()?;
    assert_eq!(owner, alice.id().to_string());

    // Old owner (contract) can no longer set icon
    let result = contract
        .call("set_icon")
        .args_json(json!({ "icon": "test" }))
        .transact()
        .await?;
    assert!(result.is_failure());

    // New owner (alice) can set icon
    alice
        .call(contract.id(), "set_icon")
        .args_json(json!({ "icon": "new_icon" }))
        .transact()
        .await?
        .into_result()?;

    Ok(())
}

#[tokio::test]
async fn test_renounce_owner() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    // Renounce ownership
    contract
        .call("renounce_owner")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;

    // Verify owner is now "system"
    let owner: String = contract.view("get_owner").args_json(json!({})).await?.json()?;
    assert_eq!(owner, "system");

    // Can no longer call owner functions
    let result = contract
        .call("set_icon")
        .args_json(json!({ "icon": "test" }))
        .transact()
        .await?;
    assert!(result.is_failure());

    Ok(())
}

// =============================================================================
// Burn Tests
// =============================================================================

#[tokio::test]
async fn test_burn() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    let burn_amount = 1_000_000 * ONE_SOCIAL; // 1M tokens
    let initial_supply = TOTAL_SUPPLY;

    // Burn tokens
    contract
        .call("burn")
        .args_json(json!({ "amount": burn_amount.to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Check total supply decreased
    let total_supply: String = contract.view("ft_total_supply").args_json(json!({})).await?.json()?;
    assert_eq!(total_supply, (initial_supply - burn_amount).to_string());

    // Check owner balance decreased
    let owner_balance: String = contract
        .view("ft_balance_of")
        .args_json(json!({ "account_id": contract.id() }))
        .await?
        .json()?;
    assert_eq!(owner_balance, (initial_supply - burn_amount).to_string());

    Ok(())
}

#[tokio::test]
async fn test_burn_requires_deposit() -> Result<()> {
    let (_worker, contract) = setup_token_contract().await?;

    // Try to burn without deposit
    let result = contract
        .call("burn")
        .args_json(json!({ "amount": "1000" }))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

#[tokio::test]
async fn test_user_can_burn_own_tokens() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;

    // Register and fund alice
    register_user(&contract, &alice).await?;
    let alice_amount = 1000 * ONE_SOCIAL;

    contract
        .call("ft_transfer")
        .args_json(json!({
            "receiver_id": alice.id(),
            "amount": alice_amount.to_string(),
            "memo": null
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Alice burns half her tokens
    let burn_amount = 500 * ONE_SOCIAL;
    alice
        .call(contract.id(), "burn")
        .args_json(json!({ "amount": burn_amount.to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Check alice's balance
    let alice_balance: String = contract
        .view("ft_balance_of")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    assert_eq!(alice_balance, (alice_amount - burn_amount).to_string());

    // Check total supply decreased
    let total_supply: String = contract.view("ft_total_supply").args_json(json!({})).await?.json()?;
    assert_eq!(total_supply, (TOTAL_SUPPLY - burn_amount).to_string());

    Ok(())
}

// =============================================================================
// ft_transfer_call Tests (critical for staking integration)
// =============================================================================

// Note: Full ft_transfer_call testing requires a receiver contract that implements
// ft_on_transfer. The staking contract integration tests cover this scenario.
// Here we just verify the method exists and basic validation works.

#[tokio::test]
async fn test_ft_transfer_call_to_unregistered_fails() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let unregistered = worker.dev_create_account().await?;

    // Try to transfer_call to unregistered account - should fail
    let result = contract
        .call("ft_transfer_call")
        .args_json(json!({
            "receiver_id": unregistered.id(),
            "amount": "1000",
            "memo": null,
            "msg": ""
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

// =============================================================================
// Account-to-Account Transfer Tests
// =============================================================================

#[tokio::test]
async fn test_ft_transfer_between_users() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;

    // Register both users
    register_user(&contract, &alice).await?;
    register_user(&contract, &bob).await?;

    // Fund alice from owner
    let alice_initial = 1000 * ONE_SOCIAL;
    contract
        .call("ft_transfer")
        .args_json(json!({
            "receiver_id": alice.id(),
            "amount": alice_initial.to_string(),
            "memo": null
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Alice transfers to bob
    let transfer_amount = 300 * ONE_SOCIAL;
    alice
        .call(contract.id(), "ft_transfer")
        .args_json(json!({
            "receiver_id": bob.id(),
            "amount": transfer_amount.to_string(),
            "memo": "Payment from Alice"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Verify balances
    let alice_balance: String = contract
        .view("ft_balance_of")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    assert_eq!(alice_balance, (alice_initial - transfer_amount).to_string());

    let bob_balance: String = contract
        .view("ft_balance_of")
        .args_json(json!({ "account_id": bob.id() }))
        .await?
        .json()?;
    assert_eq!(bob_balance, transfer_amount.to_string());

    Ok(())
}

#[tokio::test]
async fn test_ft_transfer_insufficient_balance_fails() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;

    // Register both users
    register_user(&contract, &alice).await?;
    register_user(&contract, &bob).await?;

    // Fund alice with small amount
    let alice_balance = 100 * ONE_SOCIAL;
    contract
        .call("ft_transfer")
        .args_json(json!({
            "receiver_id": alice.id(),
            "amount": alice_balance.to_string(),
            "memo": null
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Alice tries to transfer more than she has
    let result = alice
        .call(contract.id(), "ft_transfer")
        .args_json(json!({
            "receiver_id": bob.id(),
            "amount": (alice_balance + ONE_SOCIAL).to_string(),
            "memo": null
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

#[tokio::test]
async fn test_ft_transfer_zero_amount_fails() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;
    register_user(&contract, &alice).await?;

    // Try to transfer zero - should fail
    let result = contract
        .call("ft_transfer")
        .args_json(json!({
            "receiver_id": alice.id(),
            "amount": "0",
            "memo": null
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

// =============================================================================
// Storage Unregister Tests
// =============================================================================

#[tokio::test]
async fn test_storage_unregister_with_zero_balance() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;

    // Register alice
    register_user(&contract, &alice).await?;

    // Verify registered
    let storage_balance: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    assert!(storage_balance["total"].as_str().is_some());

    // Unregister with zero token balance (should succeed)
    let result = alice
        .call(contract.id(), "storage_unregister")
        .args_json(json!({ "force": null }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Should return true
    let unregistered: bool = result.json()?;
    assert!(unregistered);

    // Verify unregistered
    let storage_balance: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    assert!(storage_balance.is_null());

    Ok(())
}

#[tokio::test]
async fn test_storage_unregister_with_balance_fails_without_force() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;

    // Register and fund alice
    register_user(&contract, &alice).await?;
    contract
        .call("ft_transfer")
        .args_json(json!({
            "receiver_id": alice.id(),
            "amount": (100 * ONE_SOCIAL).to_string(),
            "memo": null
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Try to unregister without force - should fail (has token balance)
    let result = alice
        .call(contract.id(), "storage_unregister")
        .args_json(json!({ "force": false }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    assert!(result.is_failure());
    Ok(())
}

#[tokio::test]
async fn test_storage_unregister_with_balance_force_burns_tokens() -> Result<()> {
    let (worker, contract) = setup_token_contract().await?;
    let alice = worker.dev_create_account().await?;

    // Register and fund alice
    register_user(&contract, &alice).await?;
    let alice_amount = 100 * ONE_SOCIAL;
    contract
        .call("ft_transfer")
        .args_json(json!({
            "receiver_id": alice.id(),
            "amount": alice_amount.to_string(),
            "memo": null
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    let supply_before: String = contract.view("ft_total_supply").args_json(json!({})).await?.json()?;

    // Force unregister - burns alice's tokens
    alice
        .call(contract.id(), "storage_unregister")
        .args_json(json!({ "force": true }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    // Verify alice is unregistered
    let storage_balance: serde_json::Value = contract
        .view("storage_balance_of")
        .args_json(json!({ "account_id": alice.id() }))
        .await?
        .json()?;
    assert!(storage_balance.is_null());

    // Verify total supply decreased (tokens burned)
    let supply_after: String = contract.view("ft_total_supply").args_json(json!({})).await?.json()?;
    let expected_supply = supply_before.parse::<u128>().unwrap() - alice_amount;
    assert_eq!(supply_after, expected_supply.to_string());

    Ok(())
}
