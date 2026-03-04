// =============================================================================
// Rewards Integration Tests — Daily Cap
// =============================================================================
// Tests for per-user per-day earning cap enforcement.
//
// Run: make test-integration-contract-rewards-onsocial TEST=rewards::test_daily_cap

use anyhow::Result;

use super::helpers::*;

// =============================================================================
// Daily Cap Enforcement
// =============================================================================

#[tokio::test]
async fn test_daily_cap_limits_credit() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("capped").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    // Default max_daily = 100 SOCIAL. Credit 100, then try 1 more.
    credit_reward(&rewards, &owner, user.id().as_str(), DEFAULT_MAX_DAILY, None).await?.into_result()?;

    let result = credit_reward(&rewards, &owner, user.id().as_str(), ONE_SOCIAL, None).await?;
    assert!(result.is_failure(), "should fail when daily cap reached");

    let claimable = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(claimable, DEFAULT_MAX_DAILY, "claimable should be exactly max_daily");

    Ok(())
}

#[tokio::test]
async fn test_daily_cap_partial_credit() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("partial").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    // Credit 90 SOCIAL (under 100 cap)
    credit_reward(&rewards, &owner, user.id().as_str(), 90 * ONE_SOCIAL, None).await?.into_result()?;

    // Credit 20 more — should only allow 10 (partial)
    let result = credit_reward(&rewards, &owner, user.id().as_str(), 20 * ONE_SOCIAL, None).await?;
    assert!(result.is_success(), "partial credit should succeed");

    let claimable = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(claimable, DEFAULT_MAX_DAILY, "should be capped at max_daily");

    Ok(())
}

#[tokio::test]
async fn test_daily_cap_different_users_independent() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user1 = owner.create_subaccount("ind1").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;
    let user2 = owner.create_subaccount("ind2").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    // Max out user1
    credit_reward(&rewards, &owner, user1.id().as_str(), DEFAULT_MAX_DAILY, None).await?.into_result()?;

    // user2 should still be able to earn
    let result = credit_reward(&rewards, &owner, user2.id().as_str(), 50 * ONE_SOCIAL, None).await?;
    assert!(result.is_success(), "different user cap should be independent");

    let claimable2 = get_claimable(&rewards, user2.id().as_str()).await?;
    assert_eq!(claimable2, 50 * ONE_SOCIAL);

    Ok(())
}

#[tokio::test]
async fn test_daily_cap_after_max_daily_increase() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("increased").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    // Max out at 100 SOCIAL
    credit_reward(&rewards, &owner, user.id().as_str(), DEFAULT_MAX_DAILY, None).await?.into_result()?;

    // Can't credit more
    let result = credit_reward(&rewards, &owner, user.id().as_str(), ONE_SOCIAL, None).await?;
    assert!(result.is_failure());

    // Increase max daily to 200
    set_max_daily(&rewards, &owner, 200 * ONE_SOCIAL).await?;

    // Now can credit more
    let result = credit_reward(&rewards, &owner, user.id().as_str(), 50 * ONE_SOCIAL, None).await?;
    assert!(result.is_success(), "should allow more after max_daily increase");

    let claimable = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(claimable, 150 * ONE_SOCIAL);

    Ok(())
}
