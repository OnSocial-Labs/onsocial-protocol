// =============================================================================
// Integration tests: contract upgrade via update_contract → migrate
// =============================================================================
//
// Tests the full upgrade path:
//   1. Owner calls update_contract with new WASM as input
//   2. Contract self-deploys → calls migrate()
//   3. State is preserved, version is bumped
//
// Also tests: non-owner rejection, state preservation (tokens, collections,
// storage balances, sales), and post-upgrade functionality.

use anyhow::Result;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Helpers
// =============================================================================

const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const PRICE_1_NEAR: &str = "1000000000000000000000000";

/// Read the current scarces WASM binary (same version — simulates a no-schema-change upgrade).
fn read_scarces_wasm() -> Vec<u8> {
    let wasm_path = crate::utils::get_wasm_path("scarces-onsocial");
    std::fs::read(&wasm_path).expect("Failed to read scarces WASM")
}

/// Perform an upgrade: owner calls update_contract with WASM bytes as input.
async fn do_upgrade(
    contract: &near_workspaces::Contract,
    owner: &near_workspaces::Account,
    wasm: &[u8],
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let result = owner
        .call(contract.id(), "update_contract")
        .args(wasm.to_vec())
        .deposit(ONE_YOCTO)
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?;
    Ok(result)
}

// =============================================================================
// Authorization
// =============================================================================

#[tokio::test]
async fn test_upgrade_owner_succeeds() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    let wasm = read_scarces_wasm();
    let result = do_upgrade(&contract, &owner, &wasm).await?;
    result.into_result()?;

    // Contract should still be functional
    let version = get_version(&contract).await?;
    assert!(!version.is_empty(), "Version should be non-empty after upgrade");
    Ok(())
}

#[tokio::test]
async fn test_upgrade_non_owner_rejected() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    let attacker = worker.dev_create_account().await?;
    let wasm = read_scarces_wasm();

    let result = attacker
        .call(contract.id(), "update_contract")
        .args(wasm)
        .deposit(ONE_YOCTO)
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?;

    assert!(result.is_failure(), "Non-owner upgrade should fail");

    // Contract still works
    let ver = get_version(&contract).await?;
    assert!(!ver.is_empty());
    Ok(())
}

#[tokio::test]
async fn test_upgrade_requires_one_yocto() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    let wasm = read_scarces_wasm();

    // 0 deposit should fail
    let result = owner
        .call(contract.id(), "update_contract")
        .args(wasm)
        .deposit(near_workspaces::types::NearToken::from_near(0))
        .gas(near_workspaces::types::Gas::from_tgas(300))
        .transact()
        .await?;

    assert!(result.is_failure(), "Upgrade without 1 yoctoNEAR should fail");
    Ok(())
}

// =============================================================================
// State preservation through upgrade
// =============================================================================

#[tokio::test]
async fn test_upgrade_preserves_tokens() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Setup: register user, mint a token
    let user = worker.dev_create_account().await?;
    storage_deposit(&contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    execute_action(
        &contract,
        &user,
        json!({
            "type": "quick_mint",
            "metadata": {
                "title": "Upgrade survivor",
                "description": "Should survive upgrade"
            },
            "options": { "transferable": true, "burnable": true }
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    let supply_before = nft_total_supply(&contract).await?;
    assert_eq!(supply_before, "1");

    // Get token details before upgrade
    let tokens_before = nft_tokens_for_owner(&contract, user.id().as_str(), None, None).await?;
    assert_eq!(tokens_before.len(), 1);
    let token_id = &tokens_before[0].token_id;
    let title_before = tokens_before[0]
        .metadata
        .as_ref()
        .and_then(|m| m.title.as_deref())
        .unwrap_or("");

    // Upgrade
    let wasm = read_scarces_wasm();
    do_upgrade(&contract, &owner, &wasm).await?.into_result()?;

    // Verify token survived
    let supply_after = nft_total_supply(&contract).await?;
    assert_eq!(supply_after, "1", "Total supply should survive upgrade");

    let token = nft_token(&contract, token_id).await?;
    assert!(token.is_some(), "Token should exist after upgrade");

    let t = token.unwrap();
    assert_eq!(t.owner_id.to_string(), user.id().to_string());
    let title_after = t
        .metadata
        .as_ref()
        .and_then(|m| m.title.as_deref())
        .unwrap_or("");
    assert_eq!(title_before, title_after, "Token title should survive upgrade");

    Ok(())
}

#[tokio::test]
async fn test_upgrade_preserves_storage_balance() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Deposit storage for user
    let user = worker.dev_create_account().await?;
    storage_deposit(&contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let storage_before = get_user_storage(&contract, user.id().as_str()).await?;
    let balance_before = storage_before["balance"]
        .as_str()
        .unwrap()
        .to_string();

    // Upgrade
    let wasm = read_scarces_wasm();
    do_upgrade(&contract, &owner, &wasm).await?.into_result()?;

    // Verify storage balance survived
    let storage_after = get_user_storage(&contract, user.id().as_str()).await?;
    let balance_after = storage_after["balance"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(balance_before, balance_after, "Storage balance should survive upgrade");

    Ok(())
}

#[tokio::test]
async fn test_upgrade_preserves_owner() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    let owner_before = get_owner(&contract).await?;

    let wasm = read_scarces_wasm();
    do_upgrade(&contract, &owner, &wasm).await?.into_result()?;

    let owner_after = get_owner(&contract).await?;
    assert_eq!(owner_before, owner_after, "Owner should survive upgrade");
    Ok(())
}

#[tokio::test]
async fn test_upgrade_preserves_contract_metadata() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces_with_metadata(&worker, &owner, "TestScarce", "TSC").await?;

    let meta_before = nft_metadata(&contract).await?;

    let wasm = read_scarces_wasm();
    do_upgrade(&contract, &owner, &wasm).await?.into_result()?;

    let meta_after = nft_metadata(&contract).await?;
    assert_eq!(meta_before.name, meta_after.name, "Contract name should survive");
    assert_eq!(meta_before.symbol, meta_after.symbol, "Symbol should survive");
    Ok(())
}

// =============================================================================
// Post-upgrade functionality
// =============================================================================

#[tokio::test]
async fn test_upgrade_then_mint_works() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Upgrade first
    let wasm = read_scarces_wasm();
    do_upgrade(&contract, &owner, &wasm).await?.into_result()?;

    // Then mint — should work on upgraded contract
    let user = worker.dev_create_account().await?;
    storage_deposit(&contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let result = execute_action(
        &contract,
        &user,
        json!({
            "type": "quick_mint",
            "metadata": { "title": "Post-upgrade mint" },
            "options": { "transferable": true, "burnable": true }
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    result.into_result()?;

    let supply = nft_total_supply(&contract).await?;
    assert_eq!(supply, "1", "Minting should work after upgrade");
    Ok(())
}

#[tokio::test]
async fn test_upgrade_then_sale_works() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Mint a token before upgrade
    let seller = worker.dev_create_account().await?;
    storage_deposit(&contract, &seller, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    execute_action(
        &contract,
        &seller,
        json!({
            "type": "quick_mint",
            "metadata": { "title": "For sale after upgrade" },
            "options": { "transferable": true, "burnable": true }
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    let tokens = nft_tokens_for_owner(&contract, seller.id().as_str(), None, None).await?;
    let token_id = &tokens[0].token_id;

    // Upgrade
    let wasm = read_scarces_wasm();
    do_upgrade(&contract, &owner, &wasm).await?.into_result()?;

    // List for sale after upgrade
    list_native_scarce(&contract, &seller, token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    // Verify sale exists
    let sale = get_sale(&contract, token_id).await?;
    assert!(sale.is_some(), "Sale listing should work after upgrade");

    Ok(())
}

#[tokio::test]
async fn test_double_upgrade_succeeds() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    let wasm = read_scarces_wasm();

    // First upgrade
    do_upgrade(&contract, &owner, &wasm).await?.into_result()?;
    let v1 = get_version(&contract).await?;

    // Second upgrade
    do_upgrade(&contract, &owner, &wasm).await?.into_result()?;
    let v2 = get_version(&contract).await?;

    // Same WASM → same version string
    assert_eq!(v1, v2, "Same WASM should produce same version");

    // Still functional
    let supply = nft_total_supply(&contract).await?;
    assert_eq!(supply, "0");
    Ok(())
}
