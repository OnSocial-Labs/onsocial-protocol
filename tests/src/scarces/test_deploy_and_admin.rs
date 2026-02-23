// =============================================================================
// Scarces Integration Tests — Deploy & Admin
// =============================================================================
// Tests for contract deployment, initialization, ownership, fee config,
// approved NFT contracts, and contract metadata.
//
// Run: make test-integration-contract-scarces-onsocial TEST=scarces::test_deploy_and_admin

use anyhow::Result;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Deploy & Init
// =============================================================================

#[tokio::test]
async fn test_deploy_and_init_defaults() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Verify owner was set correctly
    let got_owner = get_owner(&contract).await?;
    assert_eq!(got_owner, owner.id().to_string());

    // Verify default contract metadata
    let meta = nft_metadata(&contract).await?;
    assert_eq!(meta.spec, "nft-2.0.0");
    assert_eq!(meta.name, "OnSocial Scarces");
    assert_eq!(meta.symbol, "SCARCE");

    // Verify version is set
    let version = get_version(&contract).await?;
    assert!(!version.is_empty(), "version should not be empty");

    // Verify default fee config
    let fees = get_fee_config(&contract).await?;
    assert_eq!(fees.total_fee_bps, 200, "default total fee should be 2%");
    assert_eq!(fees.app_pool_fee_bps, 50);
    assert_eq!(fees.platform_storage_fee_bps, 50);

    // Total supply should be 0
    let supply = nft_total_supply(&contract).await?;
    assert_eq!(supply, "0");

    Ok(())
}

#[tokio::test]
async fn test_deploy_with_custom_metadata() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract =
        deploy_scarces_with_metadata(&worker, &owner, "Test Collection", "TEST").await?;

    let meta = nft_metadata(&contract).await?;
    assert_eq!(meta.name, "Test Collection");
    assert_eq!(meta.symbol, "TEST");
    assert_eq!(meta.spec, "nft-2.0.0");

    Ok(())
}

// =============================================================================
// Ownership
// =============================================================================

#[tokio::test]
async fn test_transfer_ownership() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let new_owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Transfer ownership
    owner
        .call(contract.id(), "transfer_ownership")
        .args_json(json!({ "new_owner": new_owner.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let got = get_owner(&contract).await?;
    assert_eq!(got, new_owner.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_transfer_ownership_non_owner_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let stranger = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    let result = stranger
        .call(contract.id(), "transfer_ownership")
        .args_json(json!({ "new_owner": stranger.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "non-owner should not be able to transfer ownership"
    );

    // Owner unchanged
    let got = get_owner(&contract).await?;
    assert_eq!(got, owner.id().to_string());

    Ok(())
}

// =============================================================================
// Fee Configuration
// =============================================================================

#[tokio::test]
async fn test_update_fee_config() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Update fee config
    owner
        .call(contract.id(), "update_fee_config")
        .args_json(json!({
            "update": {
                "total_fee_bps": 300,
                "app_pool_fee_bps": 100,
                "platform_storage_fee_bps": 75,
            }
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let fees = get_fee_config(&contract).await?;
    assert_eq!(fees.total_fee_bps, 300);
    assert_eq!(fees.app_pool_fee_bps, 100);
    assert_eq!(fees.platform_storage_fee_bps, 75);

    Ok(())
}

#[tokio::test]
async fn test_update_fee_config_non_owner_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let stranger = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    let result = stranger
        .call(contract.id(), "update_fee_config")
        .args_json(json!({
            "update": { "total_fee_bps": 300 }
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "non-owner should not update fee config"
    );

    // Unchanged
    let fees = get_fee_config(&contract).await?;
    assert_eq!(fees.total_fee_bps, 200);

    Ok(())
}

#[tokio::test]
async fn test_set_fee_recipient() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let recipient = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Default fee recipient is the contract itself
    let default_recipient = get_fee_recipient(&contract).await?;
    assert!(
        !default_recipient.is_empty(),
        "should have a default fee recipient"
    );

    // Set custom fee recipient
    owner
        .call(contract.id(), "set_fee_recipient")
        .args_json(json!({ "fee_recipient": recipient.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let got = get_fee_recipient(&contract).await?;
    assert_eq!(got, recipient.id().to_string());

    Ok(())
}

// =============================================================================
// Approved NFT Contracts
// =============================================================================

#[tokio::test]
async fn test_add_remove_approved_nft_contract() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Initially empty
    let approved = get_approved_nft_contracts(&contract).await?;
    assert!(approved.is_empty(), "should start with no approved contracts");

    // Add one
    let external_nft: near_workspaces::AccountId = "nft-contract.testnet".parse().unwrap();
    owner
        .call(contract.id(), "add_approved_nft_contract")
        .args_json(json!({ "nft_contract_id": external_nft.to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let approved = get_approved_nft_contracts(&contract).await?;
    assert_eq!(approved.len(), 1);
    assert_eq!(approved[0], external_nft.to_string());

    // Remove it
    owner
        .call(contract.id(), "remove_approved_nft_contract")
        .args_json(json!({ "nft_contract_id": external_nft.to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let approved = get_approved_nft_contracts(&contract).await?;
    assert!(approved.is_empty(), "should be empty after removal");

    Ok(())
}

// =============================================================================
// Contract Metadata Updates
// =============================================================================

#[tokio::test]
async fn test_set_contract_metadata() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    owner
        .call(contract.id(), "set_contract_metadata")
        .args_json(json!({
            "name": "Updated Scarces",
            "symbol": "SCARCE2",
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let meta = nft_metadata(&contract).await?;
    assert_eq!(meta.name, "Updated Scarces");
    assert_eq!(meta.symbol, "SCARCE2");
    // spec should remain unchanged
    assert_eq!(meta.spec, "nft-2.0.0");

    Ok(())
}

// =============================================================================
// Intents Executor Management
// =============================================================================

#[tokio::test]
async fn test_add_remove_intents_executor() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let executor = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Add executor
    owner
        .call(contract.id(), "add_intents_executor")
        .args_json(json!({ "executor": executor.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    // Remove executor
    owner
        .call(contract.id(), "remove_intents_executor")
        .args_json(json!({ "executor": executor.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    Ok(())
}

// =============================================================================
// wNEAR Account Setting
// =============================================================================

#[tokio::test]
async fn test_set_wnear_account() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Set wNEAR account
    owner
        .call(contract.id(), "set_wnear_account")
        .args_json(json!({ "wnear_account_id": "wrap.testnet" }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    // Clear wNEAR account
    owner
        .call(contract.id(), "set_wnear_account")
        .args_json(json!({ "wnear_account_id": null }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    Ok(())
}
