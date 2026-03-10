// =============================================================================
// Rewards Integration Tests — Views
// =============================================================================
// Tests for view methods: get_contract_info, get_user_reward, get_claimable,
// get_pool_balance, get_max_daily.
//
// Run: make test-integration-contract-rewards-onsocial TEST=rewards::test_views

use anyhow::Result;

use super::helpers::*;

// =============================================================================
// Contract Info
// =============================================================================

#[tokio::test]
async fn test_get_contract_info() -> Result<()> {
    let (owner, ft, rewards) = full_setup(&create_sandbox().await?).await?;

    let info = get_contract_info(&rewards).await?;
    assert_eq!(info.owner_id, owner.id().to_string());
    assert_eq!(info.social_token, ft.id().to_string());
    assert_eq!(info.max_daily, DEFAULT_MAX_DAILY.to_string());
    assert_eq!(info.pool_balance, POOL_AMOUNT.to_string());
    assert_eq!(info.total_credited, "0");
    assert_eq!(info.total_claimed, "0");

    Ok(())
}

#[tokio::test]
async fn test_contract_info_updates_after_credit_and_claim() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner
        .create_subaccount("viewer")
        .initial_balance(near_workspaces::types::NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    // Credit
    credit_reward(&rewards, &owner, user.id().as_str(), 10 * ONE_SOCIAL, None)
        .await?
        .into_result()?;

    let info = get_contract_info(&rewards).await?;
    assert_eq!(info.total_credited, (10 * ONE_SOCIAL).to_string());
    assert_eq!(
        info.pool_balance,
        (POOL_AMOUNT - 10 * ONE_SOCIAL).to_string()
    );

    // Claim
    claim_rewards(&rewards, &user).await?.into_result()?;

    let info = get_contract_info(&rewards).await?;
    assert_eq!(info.total_claimed, (10 * ONE_SOCIAL).to_string());

    Ok(())
}

// =============================================================================
// User Reward
// =============================================================================

#[tokio::test]
async fn test_get_user_reward_none() -> Result<()> {
    let (_owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;

    let user_reward = get_user_reward(&rewards, "nonexistent.testnet").await?;
    assert!(user_reward.is_none(), "unknown user should return None");

    Ok(())
}

#[tokio::test]
async fn test_get_user_reward_with_data() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner
        .create_subaccount("data")
        .initial_balance(near_workspaces::types::NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    credit_reward(&rewards, &owner, user.id().as_str(), 15 * ONE_SOCIAL, None)
        .await?
        .into_result()?;

    let ur = get_user_reward(&rewards, user.id().as_str())
        .await?
        .expect("user should exist");
    assert_eq!(ur.claimable, 15 * ONE_SOCIAL);
    assert_eq!(ur.total_earned, 15 * ONE_SOCIAL);
    assert_eq!(ur.daily_earned, 15 * ONE_SOCIAL);
    assert_eq!(ur.total_claimed, 0);

    Ok(())
}

// =============================================================================
// Claimable & Pool
// =============================================================================

#[tokio::test]
async fn test_get_claimable_zero_for_unknown() -> Result<()> {
    let (_owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;

    let claimable = get_claimable(&rewards, "unknown.testnet").await?;
    assert_eq!(claimable, 0);

    Ok(())
}

#[tokio::test]
async fn test_get_max_daily() -> Result<()> {
    let (_owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;

    let max: serde_json::Value = rewards.view("get_max_daily").await?.json()?;
    assert_eq!(max.as_str().unwrap(), DEFAULT_MAX_DAILY.to_string());

    Ok(())
}
