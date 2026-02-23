// =============================================================================
// Refund Integration Tests
// =============================================================================
// Tests for CancelCollection, ClaimRefund, WithdrawUnclaimedRefunds —
// the collection cancellation + token refund lifecycle.

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

/// Create an account with generous storage.
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

/// Create a collection at price 0, mint `count` tokens, return (creator, vec of token_ids).
async fn collection_with_tokens(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
    collection_id: &str,
    total_supply: u32,
    count: u32,
) -> Result<(near_workspaces::Account, Vec<String>)> {
    let creator = user_with_storage(worker, contract).await?;

    create_collection(
        contract,
        &creator,
        collection_id,
        total_supply,
        "0",
        json!({"title": "Refund Test", "description": "Test token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(contract, &creator, collection_id, count, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let tokens =
        nft_tokens_for_owner(contract, &creator.id().to_string(), None, Some(50)).await?;
    let token_ids: Vec<String> = tokens
        .iter()
        .filter(|t| t.token_id.starts_with(&format!("{}:", collection_id)))
        .map(|t| t.token_id.clone())
        .collect();
    assert_eq!(token_ids.len(), count as usize);

    Ok((creator, token_ids))
}

const REFUND_AMOUNT: &str = "500000000000000000000000"; // 0.5 NEAR

// =============================================================================
// CancelCollection — Happy Path
// =============================================================================

#[tokio::test]
async fn test_cancel_collection_basic() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, _token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 2).await?;

    // Cancel: 2 minted tokens × 0.5 NEAR refund = 1 NEAR deposit needed
    cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    let col = get_collection(&contract, "refund-col").await?.unwrap();
    assert!(col.cancelled, "Collection should be cancelled");
    assert_eq!(col.refund_per_token, REFUND_AMOUNT);

    Ok(())
}

// =============================================================================
// CancelCollection — Error Cases
// =============================================================================

#[tokio::test]
async fn test_cancel_collection_insufficient_deposit_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, _token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 3).await?;

    // 3 tokens × 0.5 NEAR = needs 1.5 NEAR, only sending 1 NEAR
    let result = cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Insufficient deposit should fail"
    );

    Ok(())
}

#[tokio::test]
async fn test_cancel_collection_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_creator, _token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 1).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    let result = cancel_collection(
        &contract,
        &stranger,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-creator cannot cancel"
    );

    Ok(())
}

#[tokio::test]
async fn test_cancel_collection_already_cancelled_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, _token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 1).await?;

    cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    let result = cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Already cancelled should fail"
    );

    Ok(())
}

// =============================================================================
// ClaimRefund
// =============================================================================

#[tokio::test]
async fn test_claim_refund_basic() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 2).await?;

    cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Claim refund for first token
    claim_refund(&contract, &creator, &token_ids[0], "refund-col", ONE_YOCTO)
        .await?
        .into_result()?;

    // Token should be marked as refunded
    let status = get_token_status(&contract, &token_ids[0]).await?.unwrap();
    assert!(status.is_refunded, "Token should be refunded");

    // Collection refunded_count should increment
    let col = get_collection(&contract, "refund-col").await?.unwrap();
    assert_eq!(col.refunded_count, 1);

    Ok(())
}

#[tokio::test]
async fn test_claim_refund_all_tokens() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 3).await?;

    cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    for tid in &token_ids {
        claim_refund(&contract, &creator, tid, "refund-col", ONE_YOCTO)
            .await?
            .into_result()?;
    }

    let col = get_collection(&contract, "refund-col").await?.unwrap();
    assert_eq!(col.refunded_count, 3);
    // Refund pool should be drained (3 × 0.5 = 1.5 NEAR used from 2 NEAR pool)
    // But the deposit was exactly 2 NEAR, so remaining = 2 - 1.5 = 0.5 NEAR
    // Actually cancel takes the full deposit as pool, so pool was the full deposit

    Ok(())
}

#[tokio::test]
async fn test_claim_refund_already_claimed_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 1).await?;

    cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Claim once
    claim_refund(&contract, &creator, &token_ids[0], "refund-col", ONE_YOCTO)
        .await?
        .into_result()?;

    // Claim again — should fail
    let result =
        claim_refund(&contract, &creator, &token_ids[0], "refund-col", ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Double claim should fail"
    );

    Ok(())
}

#[tokio::test]
async fn test_claim_refund_not_cancelled_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 1).await?;

    // Try claiming without cancelling first
    let result =
        claim_refund(&contract, &creator, &token_ids[0], "refund-col", ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Cannot claim from non-cancelled collection"
    );

    Ok(())
}

#[tokio::test]
async fn test_claim_refund_non_holder_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 1).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    let result =
        claim_refund(&contract, &stranger, &token_ids[0], "refund-col", ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Non-holder cannot claim refund"
    );

    Ok(())
}

// =============================================================================
// WithdrawUnclaimedRefunds
// =============================================================================

#[tokio::test]
async fn test_withdraw_unclaimed_before_deadline_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, _token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 1).await?;

    cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Try to withdraw immediately — deadline hasn't passed
    let result =
        withdraw_unclaimed_refunds(&contract, &creator, "refund-col", ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Cannot withdraw before deadline"
    );

    Ok(())
}

#[tokio::test]
async fn test_withdraw_unclaimed_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, _token_ids) =
        collection_with_tokens(&worker, &contract, "refund-col", 5, 1).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    cancel_collection(
        &contract,
        &creator,
        "refund-col",
        REFUND_AMOUNT,
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    let result =
        withdraw_unclaimed_refunds(&contract, &stranger, "refund-col", ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Non-creator cannot withdraw"
    );

    Ok(())
}
