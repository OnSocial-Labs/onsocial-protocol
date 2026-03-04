// =============================================================================
// Rewards Integration Tests — Credit Reward
// =============================================================================
// Tests for crediting rewards via the execute entry point (Direct auth).
//
// Run: make test-integration-contract-rewards-onsocial TEST=rewards::test_credit_reward

use anyhow::Result;

use super::helpers::*;

// =============================================================================
// Credit Reward — Happy Paths
// =============================================================================

#[tokio::test]
async fn test_credit_reward_by_owner() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("user1").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    let result = credit_reward(&rewards, &owner, user.id().as_str(), 10 * ONE_SOCIAL, Some("engagement")).await?;
    assert!(result.is_success(), "owner should credit rewards");

    let claimable = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(claimable, 10 * ONE_SOCIAL);

    let pool = get_pool_balance(&rewards).await?;
    assert_eq!(pool, POOL_AMOUNT - 10 * ONE_SOCIAL);

    Ok(())
}

#[tokio::test]
async fn test_credit_reward_by_authorized_caller() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let caller = owner.create_subaccount("backend").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;
    let user = owner.create_subaccount("user2").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    add_authorized_caller(&rewards, &owner, caller.id().as_str()).await?;

    let result = credit_reward(&rewards, &caller, user.id().as_str(), 5 * ONE_SOCIAL, Some("referral")).await?;
    assert!(result.is_success(), "authorized caller should credit rewards");

    let claimable = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(claimable, 5 * ONE_SOCIAL);

    Ok(())
}

// =============================================================================
// Credit Reward — Error Cases
// =============================================================================

#[tokio::test]
async fn test_credit_reward_unauthorized() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let stranger = owner.create_subaccount("stranger").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;
    let user = owner.create_subaccount("user3").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    let result = credit_reward(&rewards, &stranger, user.id().as_str(), ONE_SOCIAL, None).await?;
    assert!(result.is_failure(), "unauthorized account should not credit");

    Ok(())
}

#[tokio::test]
async fn test_credit_reward_exceeds_pool() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("user4").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    // Try to credit more than pool has (pool = POOL_AMOUNT, max_daily = 100 SOCIAL)
    // Set max daily high enough to allow this
    set_max_daily(&rewards, &owner, POOL_AMOUNT * 2).await?;

    let result = credit_reward(&rewards, &owner, user.id().as_str(), POOL_AMOUNT + 1, None).await?;
    assert!(result.is_failure(), "credit exceeding pool should fail");

    Ok(())
}

#[tokio::test]
async fn test_credit_reward_zero_amount() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("user5").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    let result = credit_reward(&rewards, &owner, user.id().as_str(), 0, None).await?;
    assert!(result.is_failure(), "zero amount should fail");

    Ok(())
}

#[tokio::test]
async fn test_credit_accumulates() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("user6").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    credit_reward(&rewards, &owner, user.id().as_str(), 3 * ONE_SOCIAL, None).await?.into_result()?;
    credit_reward(&rewards, &owner, user.id().as_str(), 7 * ONE_SOCIAL, None).await?.into_result()?;

    let claimable = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(claimable, 10 * ONE_SOCIAL, "rewards should accumulate");

    Ok(())
}
