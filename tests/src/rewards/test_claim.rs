// =============================================================================
// Rewards Integration Tests — Claim (end-to-end with FT transfer)
// =============================================================================
// Tests the full claim flow: execute(Claim) → storage_deposit → ft_transfer →
// on_claim_callback. Verifies FT balances, user state, and auto-registration.
//
// Run: make test-integration-contract-rewards-onsocial TEST=rewards::test_claim

use anyhow::Result;

use super::helpers::*;

// =============================================================================
// Claim — Happy Path
// =============================================================================

#[tokio::test]
async fn test_claim_transfers_tokens() -> Result<()> {
    let (owner, ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("claimer").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    // Credit 10 SOCIAL
    credit_reward(&rewards, &owner, user.id().as_str(), 10 * ONE_SOCIAL, None).await?.into_result()?;

    // Claim — user is NOT pre-registered with FT, contract auto-registers
    let result = claim_rewards(&rewards, &user).await?;
    assert!(result.is_success(), "claim should succeed: {:?}", result);

    // Verify FT balance was transferred
    let user_ft_balance = ft_balance_of(&ft, user.id().as_str()).await?;
    assert_eq!(user_ft_balance, 10 * ONE_SOCIAL, "user should receive SOCIAL tokens");

    // Verify claimable is now 0
    let claimable = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(claimable, 0, "claimable should be 0 after claim");

    // Verify pool was decremented (credit already deducted)
    let pool = get_pool_balance(&rewards).await?;
    assert_eq!(pool, POOL_AMOUNT - 10 * ONE_SOCIAL);

    Ok(())
}

#[tokio::test]
async fn test_claim_auto_registers_user_with_ft() -> Result<()> {
    let (owner, ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("newuser").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    // Confirm user is NOT registered with FT
    let balance_before = ft.view("storage_balance_of")
        .args_json(serde_json::json!({ "account_id": user.id().to_string() }))
        .await?
        .json::<Option<serde_json::Value>>()?;
    assert!(balance_before.is_none(), "user should not be registered before claim");

    // Credit and claim
    credit_reward(&rewards, &owner, user.id().as_str(), 5 * ONE_SOCIAL, None).await?.into_result()?;
    let result = claim_rewards(&rewards, &user).await?;
    assert!(result.is_success(), "claim should succeed for unregistered user");

    // Confirm user IS now registered with FT
    let balance_after = ft.view("storage_balance_of")
        .args_json(serde_json::json!({ "account_id": user.id().to_string() }))
        .await?
        .json::<Option<serde_json::Value>>()?;
    assert!(balance_after.is_some(), "user should be registered after claim");

    // Confirm tokens arrived
    let user_ft_balance = ft_balance_of(&ft, user.id().as_str()).await?;
    assert_eq!(user_ft_balance, 5 * ONE_SOCIAL);

    Ok(())
}

#[tokio::test]
async fn test_claim_already_registered_user() -> Result<()> {
    let (owner, ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("preregistered").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    // Pre-register user with FT
    ft_register(&ft, &owner, user.id()).await?;

    // Credit and claim
    credit_reward(&rewards, &owner, user.id().as_str(), 8 * ONE_SOCIAL, None).await?.into_result()?;
    let result = claim_rewards(&rewards, &user).await?;
    assert!(result.is_success(), "claim should succeed for pre-registered user");

    let user_ft_balance = ft_balance_of(&ft, user.id().as_str()).await?;
    assert_eq!(user_ft_balance, 8 * ONE_SOCIAL);

    Ok(())
}

#[tokio::test]
async fn test_claim_multiple_credits_then_single_claim() -> Result<()> {
    let (owner, ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("multi").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    // Credit multiple times
    credit_reward(&rewards, &owner, user.id().as_str(), 3 * ONE_SOCIAL, None).await?.into_result()?;
    credit_reward(&rewards, &owner, user.id().as_str(), 7 * ONE_SOCIAL, None).await?.into_result()?;

    // Single claim gets total
    claim_rewards(&rewards, &user).await?.into_result()?;

    let user_ft_balance = ft_balance_of(&ft, user.id().as_str()).await?;
    assert_eq!(user_ft_balance, 10 * ONE_SOCIAL, "should claim accumulated total");

    Ok(())
}

// =============================================================================
// Claim — Error Cases
// =============================================================================

#[tokio::test]
async fn test_claim_nothing_to_claim() -> Result<()> {
    let (owner, _ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("empty").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    let result = claim_rewards(&rewards, &user).await?;
    assert!(result.is_failure(), "claim with nothing should fail");

    Ok(())
}

#[tokio::test]
async fn test_claim_twice_second_fails() -> Result<()> {
    let (owner, ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner.create_subaccount("twice").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;

    credit_reward(&rewards, &owner, user.id().as_str(), 5 * ONE_SOCIAL, None).await?.into_result()?;
    claim_rewards(&rewards, &user).await?.into_result()?;

    // Second claim — nothing left
    let result = claim_rewards(&rewards, &user).await?;
    assert!(result.is_failure(), "second claim with 0 balance should fail");

    // FT balance unchanged
    let user_ft_balance = ft_balance_of(&ft, user.id().as_str()).await?;
    assert_eq!(user_ft_balance, 5 * ONE_SOCIAL);

    Ok(())
}
