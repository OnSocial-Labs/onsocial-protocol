// =============================================================================
// Rewards Integration Tests — Claim Callback (rollback on failure)
// =============================================================================
// Tests the on_claim_callback rollback path when ft_transfer fails.
// Uses mock-ft's `set_fail_next_transfer` to simulate FT failure.
//
// Run: make test-integration-contract-rewards-onsocial TEST=rewards::test_claim_callback

use anyhow::Result;

use super::helpers::*;

// =============================================================================
// Callback Rollback
// =============================================================================

#[tokio::test]
async fn test_claim_rollback_on_ft_failure() -> Result<()> {
    let (owner, ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner
        .create_subaccount("rollback")
        .initial_balance(near_workspaces::types::NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    // Pre-register user so storage_deposit succeeds but ft_transfer fails
    ft_register(&ft, &owner, user.id()).await?;

    // Credit 10 SOCIAL
    credit_reward(&rewards, &owner, user.id().as_str(), 10 * ONE_SOCIAL, None)
        .await?
        .into_result()?;

    // Set mock-ft to fail next ft_transfer
    set_ft_fail_next(&ft, true).await?;

    // Claim — ft_transfer will fail, callback should rollback
    let result = claim_rewards(&rewards, &user).await?;
    // The execute call itself succeeds (returns pending), the failure is in the callback
    // The callback rolls back state
    assert!(
        result.is_success(),
        "execute should succeed even though ft_transfer fails later"
    );

    // Claimable should be restored
    let claimable = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(
        claimable,
        10 * ONE_SOCIAL,
        "claimable should be restored after rollback"
    );

    // User should NOT have received any FT tokens
    let user_ft_balance = ft_balance_of(&ft, user.id().as_str()).await?;
    assert_eq!(
        user_ft_balance, 0,
        "user should not receive tokens on failure"
    );

    // Pool balance should reflect the credit (pool was deducted at credit time, not claim)
    let pool = get_pool_balance(&rewards).await?;
    assert_eq!(pool, POOL_AMOUNT - 10 * ONE_SOCIAL);

    Ok(())
}

#[tokio::test]
async fn test_claim_succeeds_after_rollback() -> Result<()> {
    let (owner, ft, rewards) = full_setup(&create_sandbox().await?).await?;
    let user = owner
        .create_subaccount("retry")
        .initial_balance(near_workspaces::types::NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    ft_register(&ft, &owner, user.id()).await?;

    // Credit
    credit_reward(&rewards, &owner, user.id().as_str(), 5 * ONE_SOCIAL, None)
        .await?
        .into_result()?;

    // Fail first claim
    set_ft_fail_next(&ft, true).await?;
    let _ = claim_rewards(&rewards, &user).await?;

    // Verify rollback
    let claimable = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(
        claimable,
        5 * ONE_SOCIAL,
        "claimable restored after failure"
    );

    // Clear the fail flag — the batch revert rolled back the `false` write too
    set_ft_fail_next(&ft, false).await?;

    // Retry — should succeed now
    let result = claim_rewards(&rewards, &user).await?;
    assert!(result.is_success(), "retry claim should succeed");

    let user_ft_balance = ft_balance_of(&ft, user.id().as_str()).await?;
    assert_eq!(
        user_ft_balance,
        5 * ONE_SOCIAL,
        "tokens should arrive on retry"
    );

    let claimable_after = get_claimable(&rewards, user.id().as_str()).await?;
    assert_eq!(
        claimable_after, 0,
        "claimable should be 0 after successful claim"
    );

    Ok(())
}
