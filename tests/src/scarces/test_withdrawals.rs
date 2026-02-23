// =============================================================================
// Withdrawal Integration Tests
// =============================================================================
// Tests for WithdrawPlatformStorage, fund_platform_storage, and
// WithdrawUnclaimedRefunds happy path (post-deadline).

use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Shared setup
// =============================================================================

async fn setup() -> Result<(
    near_workspaces::Worker<near_workspaces::network::Sandbox>,
    near_workspaces::Account,
    near_workspaces::Contract,
)> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    Ok((worker, owner, contract))
}

async fn setup_funded(
    total: NearToken,
) -> Result<(
    near_workspaces::Worker<near_workspaces::network::Sandbox>,
    near_workspaces::Account,
    near_workspaces::Contract,
)> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    // deploy_scarces seeds 5 NEAR; top up the rest if needed
    let base = NearToken::from_near(5).as_yoctonear();
    let target = total.as_yoctonear();
    if target > base {
        let extra = NearToken::from_yoctonear(target - base);
        fund_platform_storage(&contract, &owner, extra)
            .await?
            .into_result()?;
    }
    Ok((worker, owner, contract))
}

async fn user_with_storage(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<near_workspaces::Account> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok(user)
}

// =============================================================================
// fund_platform_storage — Init Seeding
// =============================================================================

#[tokio::test]
async fn test_deploy_with_init_funding() -> Result<()> {
    let (_worker, _owner, contract) =
        setup_funded(NearToken::from_near(10)).await?;

    let balance = get_platform_storage_balance(&contract).await?;
    let bal: u128 = balance.parse()?;
    assert_eq!(bal, NearToken::from_near(10).as_yoctonear());

    Ok(())
}

#[tokio::test]
async fn test_deploy_default_seeds_reserve() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let balance = get_platform_storage_balance(&contract).await?;
    let bal: u128 = balance.parse()?;
    assert_eq!(bal, NearToken::from_near(5).as_yoctonear());

    Ok(())
}

// =============================================================================
// fund_platform_storage — Top-Up
// =============================================================================

#[tokio::test]
async fn test_fund_platform_storage_happy() -> Result<()> {
    let (_worker, owner, contract) = setup().await?;

    fund_platform_storage(&contract, &owner, NearToken::from_near(7))
        .await?
        .into_result()?;

    let balance = get_platform_storage_balance(&contract).await?;
    let bal: u128 = balance.parse()?;
    // 5 NEAR init + 7 NEAR funded = 12 NEAR
    assert_eq!(bal, NearToken::from_near(12).as_yoctonear());

    Ok(())
}

#[tokio::test]
async fn test_fund_platform_storage_accumulates() -> Result<()> {
    let (_worker, owner, contract) =
        setup_funded(NearToken::from_near(5)).await?;

    fund_platform_storage(&contract, &owner, NearToken::from_near(4))
        .await?
        .into_result()?;

    let balance = get_platform_storage_balance(&contract).await?;
    let bal: u128 = balance.parse()?;
    // 5 NEAR init + 4 NEAR funded = 9 NEAR
    assert_eq!(bal, NearToken::from_near(9).as_yoctonear());

    Ok(())
}

#[tokio::test]
async fn test_fund_platform_storage_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let stranger = worker.dev_create_account().await?;

    let result =
        fund_platform_storage(&contract, &stranger, NearToken::from_near(5)).await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner cannot fund platform storage"
    );

    Ok(())
}

#[tokio::test]
async fn test_fund_platform_storage_zero_deposit_fails() -> Result<()> {
    let (_worker, owner, contract) = setup().await?;

    let result =
        fund_platform_storage(&contract, &owner, NearToken::from_yoctonear(0)).await?;
    assert!(
        result.into_result().is_err(),
        "Zero deposit should fail"
    );

    Ok(())
}

// =============================================================================
// WithdrawPlatformStorage — Happy Path
// =============================================================================

#[tokio::test]
async fn test_withdraw_platform_storage_happy() -> Result<()> {
    // Fund with 8 NEAR, withdraw 3 NEAR → leaves 5 NEAR (at reserve)
    let (_worker, owner, contract) =
        setup_funded(NearToken::from_near(8)).await?;

    withdraw_platform_storage(
        &contract,
        &owner,
        &NearToken::from_near(3).as_yoctonear().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let balance = get_platform_storage_balance(&contract).await?;
    let bal: u128 = balance.parse()?;
    assert_eq!(bal, NearToken::from_near(5).as_yoctonear());

    Ok(())
}

// =============================================================================
// WithdrawPlatformStorage — Error Cases
// =============================================================================

#[tokio::test]
async fn test_withdraw_platform_storage_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) =
        setup_funded(NearToken::from_near(10)).await?;
    let stranger = worker.dev_create_account().await?;

    let result = withdraw_platform_storage(
        &contract,
        &stranger,
        &NearToken::from_near(1).as_yoctonear().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner cannot withdraw"
    );

    Ok(())
}

#[tokio::test]
async fn test_withdraw_platform_storage_exceeds_balance_fails() -> Result<()> {
    let (_worker, owner, contract) =
        setup_funded(NearToken::from_near(8)).await?;

    let result = withdraw_platform_storage(
        &contract,
        &owner,
        &NearToken::from_near(100).as_yoctonear().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Cannot withdraw more than balance"
    );

    Ok(())
}

#[tokio::test]
async fn test_withdraw_platform_storage_below_reserve_fails() -> Result<()> {
    // Fund with 6 NEAR, try to withdraw 2 NEAR → would leave 4 NEAR < 5 NEAR reserve
    let (_worker, owner, contract) =
        setup_funded(NearToken::from_near(6)).await?;

    let result = withdraw_platform_storage(
        &contract,
        &owner,
        &NearToken::from_near(2).as_yoctonear().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Cannot withdraw below reserve"
    );

    Ok(())
}

#[tokio::test]
async fn test_withdraw_platform_storage_at_reserve_boundary() -> Result<()> {
    // Fund with 7 NEAR, withdraw exactly 2 NEAR → leaves exactly 5 NEAR (reserve)
    let (_worker, owner, contract) =
        setup_funded(NearToken::from_near(7)).await?;

    withdraw_platform_storage(
        &contract,
        &owner,
        &NearToken::from_near(2).as_yoctonear().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let balance = get_platform_storage_balance(&contract).await?;
    let bal: u128 = balance.parse()?;
    assert_eq!(bal, NearToken::from_near(5).as_yoctonear());

    Ok(())
}

// =============================================================================
// WithdrawUnclaimedRefunds — Happy Path (post-deadline)
// =============================================================================

/// Helper: create a collection, mint tokens, sell some to buyer, cancel, wait past deadline.
async fn setup_cancelled_collection_past_deadline(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<(near_workspaces::Account, String)> {
    let creator = user_with_storage(worker, contract).await?;

    create_collection(
        contract,
        &creator,
        "withdraw-col",
        5,
        "0",
        json!({"title": "Withdraw Test", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Mint 2 tokens to creator
    mint_from_collection(contract, &creator, "withdraw-col", 2, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let refund_amount = "500000000000000000000000"; // 0.5 NEAR per token

    // Cancel with short deadline (5s — contract built with `sandbox` feature)
    let sandbox_deadline_ns: u64 = 5 * 1_000_000_000;
    cancel_collection(
        contract,
        &creator,
        "withdraw-col",
        refund_amount,
        Some(sandbox_deadline_ns),
        NearToken::from_near(1), // 2 tokens × 0.5 NEAR
    )
    .await?
    .into_result()?;

    // Fast-forward past the 5-second sandbox deadline.
    // Sandbox block time is ~0.5s per block; 100 blocks ≈ 50s >> 5s.
    worker.fast_forward(100).await?;

    Ok((creator, "withdraw-col".to_string()))
}

#[tokio::test]
async fn test_withdraw_unclaimed_refunds_happy() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, collection_id) =
        setup_cancelled_collection_past_deadline(&worker, &contract).await?;

    // Verify refund pool has funds before withdrawal
    let col = get_collection(&contract, &collection_id).await?.unwrap();
    assert!(col.cancelled);
    let pool_before: u128 = col.refund_pool.parse()?;
    assert!(pool_before > 0, "Refund pool should have funds");

    // Withdraw unclaimed refunds
    withdraw_unclaimed_refunds(&contract, &creator, &collection_id, ONE_YOCTO)
        .await?
        .into_result()?;

    // Verify refund pool is now empty
    let col_after = get_collection(&contract, &collection_id).await?.unwrap();
    let pool_after: u128 = col_after.refund_pool.parse()?;
    assert_eq!(pool_after, 0, "Refund pool should be drained");

    Ok(())
}

#[tokio::test]
async fn test_withdraw_unclaimed_after_partial_claims() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "partial-col",
        5,
        "0",
        json!({"title": "Partial Refund", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Mint 3 tokens
    mint_from_collection(&contract, &creator, "partial-col", 3, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &creator.id().to_string(), None, Some(50)).await?;
    let col_token_ids: Vec<String> = tokens
        .iter()
        .filter(|t| t.token_id.starts_with("partial-col:"))
        .map(|t| t.token_id.clone())
        .collect();
    assert_eq!(col_token_ids.len(), 3);

    let refund_amount = "500000000000000000000000"; // 0.5 NEAR
    let sandbox_deadline_ns: u64 = 5 * 1_000_000_000;

    cancel_collection(
        &contract,
        &creator,
        "partial-col",
        refund_amount,
        Some(sandbox_deadline_ns),
        NearToken::from_millinear(1500), // 3 × 0.5 NEAR
    )
    .await?
    .into_result()?;

    // Claim refund for 1 of 3 tokens (before deadline)
    claim_refund(&contract, &creator, &col_token_ids[0], "partial-col", ONE_YOCTO)
        .await?
        .into_result()?;

    // Fast-forward past 5s sandbox deadline
    worker.fast_forward(100).await?;

    // Withdraw remaining (2 tokens' worth)
    withdraw_unclaimed_refunds(&contract, &creator, "partial-col", ONE_YOCTO)
        .await?
        .into_result()?;

    let col = get_collection(&contract, "partial-col").await?.unwrap();
    let pool_after: u128 = col.refund_pool.parse()?;
    assert_eq!(pool_after, 0);

    Ok(())
}

#[tokio::test]
async fn test_withdraw_unclaimed_empty_pool_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "empty-col",
        5,
        "0",
        json!({"title": "Empty Pool", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(&contract, &creator, "empty-col", 1, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &creator.id().to_string(), None, Some(50)).await?;
    let tok = tokens
        .iter()
        .find(|t| t.token_id.starts_with("empty-col:"))
        .unwrap();

    let refund_amount = "500000000000000000000000";
    let sandbox_deadline_ns: u64 = 5 * 1_000_000_000;

    cancel_collection(
        &contract,
        &creator,
        "empty-col",
        refund_amount,
        Some(sandbox_deadline_ns),
        NearToken::from_millinear(500),
    )
    .await?
    .into_result()?;

    // Claim the only token's refund
    claim_refund(&contract, &creator, &tok.token_id, "empty-col", ONE_YOCTO)
        .await?
        .into_result()?;

    // Fast-forward past 5s sandbox deadline
    worker.fast_forward(100).await?;

    // Withdraw from empty pool → should fail
    let result =
        withdraw_unclaimed_refunds(&contract, &creator, "empty-col", ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Cannot withdraw from empty refund pool"
    );

    Ok(())
}

#[tokio::test]
async fn test_claim_refund_after_deadline_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, collection_id) =
        setup_cancelled_collection_past_deadline(&worker, &contract).await?;

    let tokens =
        nft_tokens_for_owner(&contract, &creator.id().to_string(), None, Some(50)).await?;
    let tok = tokens
        .iter()
        .find(|t| t.token_id.starts_with(&format!("{}:", collection_id)))
        .unwrap();

    // Deadline has passed — claim should fail
    let result =
        claim_refund(&contract, &creator, &tok.token_id, &collection_id, ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Cannot claim refund after deadline"
    );

    Ok(())
}
