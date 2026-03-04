// =============================================================================
// Rewards Integration Tests — Deploy & Admin
// =============================================================================
// Tests for contract deployment, initialization, ownership transfer,
// authorized callers, and max daily cap management.
//
// Run: make test-integration-contract-rewards-onsocial TEST=rewards::test_deploy_and_admin

use anyhow::Result;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Deploy & Init
// =============================================================================

#[tokio::test]
async fn test_deploy_and_init() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;

    let info = get_contract_info(&rewards).await?;
    assert_eq!(info.owner_id, owner.id().to_string());
    assert_eq!(info.social_token, ft.id().to_string());
    assert_eq!(info.max_daily, DEFAULT_MAX_DAILY.to_string());
    assert_eq!(info.pool_balance, "0");
    assert_eq!(info.total_credited, "0");
    assert_eq!(info.total_claimed, "0");
    assert!(!info.version.is_empty(), "version should not be empty");

    Ok(())
}

// =============================================================================
// Ownership
// =============================================================================

#[tokio::test]
async fn test_transfer_ownership() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;
    let new_owner = worker.dev_create_account().await?;

    transfer_ownership(&rewards, &owner, new_owner.id().as_str()).await?;

    let info = get_contract_info(&rewards).await?;
    assert_eq!(info.owner_id, new_owner.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_transfer_ownership_unauthorized() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;
    let stranger = worker.dev_create_account().await?;

    let result = stranger
        .call(rewards.id(), "transfer_ownership")
        .args_json(json!({ "new_owner": stranger.id().to_string() }))
        .transact()
        .await?;

    assert!(result.is_failure(), "non-owner should not transfer ownership");

    Ok(())
}

// =============================================================================
// Authorized Callers
// =============================================================================

#[tokio::test]
async fn test_add_remove_authorized_caller() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;
    let caller = worker.dev_create_account().await?;

    // Add authorized caller
    add_authorized_caller(&rewards, &owner, caller.id().as_str()).await?;

    // Authorized caller can credit rewards (needs pool first)
    ft_register(&ft, &owner, rewards.id()).await?;
    deposit_pool(&ft, &rewards, &owner, POOL_AMOUNT).await?;
    let user = worker.dev_create_account().await?;
    let result = credit_reward(&rewards, &caller, user.id().as_str(), ONE_SOCIAL, None).await?;
    assert!(result.is_success(), "authorized caller should credit rewards");

    // Remove authorized caller
    owner
        .call(rewards.id(), "remove_authorized_caller")
        .args_json(json!({ "account_id": caller.id().to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Removed caller should fail
    let result = credit_reward(&rewards, &caller, user.id().as_str(), ONE_SOCIAL, None).await?;
    assert!(result.is_failure(), "removed caller should not credit rewards");

    Ok(())
}

// =============================================================================
// Max Daily Cap
// =============================================================================

#[tokio::test]
async fn test_set_max_daily() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;

    let new_max = 500 * ONE_SOCIAL;
    set_max_daily(&rewards, &owner, new_max).await?;

    let info = get_contract_info(&rewards).await?;
    assert_eq!(info.max_daily, new_max.to_string());

    Ok(())
}

#[tokio::test]
async fn test_set_max_daily_unauthorized() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;
    let stranger = worker.dev_create_account().await?;

    let result = stranger
        .call(rewards.id(), "set_max_daily")
        .args_json(json!({ "new_max": "999" }))
        .transact()
        .await?;

    assert!(result.is_failure(), "non-owner should not set max daily");

    Ok(())
}
