// =============================================================================
// Rewards Integration Tests — Pool Deposit
// =============================================================================
// Tests for depositing SOCIAL tokens into the reward pool via ft_transfer_call.
//
// Run: make test-integration-contract-rewards-onsocial TEST=rewards::test_pool_deposit

use anyhow::Result;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Pool Deposit via ft_transfer_call
// =============================================================================

#[tokio::test]
async fn test_pool_deposit_by_owner() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;

    // Register rewards contract with FT
    ft_register(&ft, &owner, rewards.id()).await?;

    // Deposit to pool
    deposit_pool(&ft, &rewards, &owner, POOL_AMOUNT).await?;

    // Verify pool balance
    let pool = get_pool_balance(&rewards).await?;
    assert_eq!(pool, POOL_AMOUNT);

    // Verify FT balance of rewards contract
    let ft_bal = ft_balance_of(&ft, rewards.id().as_str()).await?;
    assert_eq!(ft_bal, POOL_AMOUNT);

    Ok(())
}

#[tokio::test]
async fn test_pool_deposit_non_owner_rejected() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;
    let stranger = worker.dev_create_account().await?;

    // Register rewards + stranger with FT
    ft_register(&ft, &owner, rewards.id()).await?;
    ft_mint(&ft, stranger.id().as_str(), POOL_AMOUNT).await?;

    // Stranger tries to deposit — should fail
    let _result = stranger
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": rewards.id().to_string(),
            "amount": POOL_AMOUNT.to_string(),
            "msg": json!({ "action": "deposit" }).to_string(),
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;

    // The call will succeed on FT side but ft_on_transfer panics,
    // so ft_resolve_transfer refunds the tokens to stranger.
    let pool = get_pool_balance(&rewards).await?;
    assert_eq!(pool, 0, "pool should remain 0 after non-owner deposit attempt");

    Ok(())
}

#[tokio::test]
async fn test_pool_deposit_wrong_token_rejected() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;

    // Deploy a second FT (wrong token)
    let wrong_ft = deploy_mock_ft(&worker, &owner).await?;
    ft_register(&wrong_ft, &owner, rewards.id()).await?;

    // Owner tries to deposit wrong token
    let _result = owner
        .call(wrong_ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": rewards.id().to_string(),
            "amount": POOL_AMOUNT.to_string(),
            "msg": json!({ "action": "deposit" }).to_string(),
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;

    // ft_on_transfer panics with "Wrong token", tokens refunded to owner
    let pool = get_pool_balance(&rewards).await?;
    assert_eq!(pool, 0, "pool should remain 0 after wrong token deposit");

    Ok(())
}

#[tokio::test]
async fn test_pool_deposit_multiple() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;
    let rewards = deploy_rewards(&worker, &owner, &ft).await?;

    ft_register(&ft, &owner, rewards.id()).await?;

    // Deposit twice
    deposit_pool(&ft, &rewards, &owner, 1000 * ONE_SOCIAL).await?;
    deposit_pool(&ft, &rewards, &owner, 2000 * ONE_SOCIAL).await?;

    let pool = get_pool_balance(&rewards).await?;
    assert_eq!(pool, 3000 * ONE_SOCIAL, "pool should accumulate deposits");

    Ok(())
}
