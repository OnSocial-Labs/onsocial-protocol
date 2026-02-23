// =============================================================================
// Revocation & Lifecycle Integration Tests
// =============================================================================
// Tests for RevokeToken (Invalidate/Burn), RedeemToken, RenewToken,
// BurnScarce — token lifecycle management.

use anyhow::Result;
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

/// Create a collection with given revocation mode + options, mint one token.
/// Returns (creator, token_id).
async fn collection_with_mode(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
    collection_id: &str,
    revocation_mode: &str,
    max_redeems: Option<u32>,
    renewable: bool,
) -> Result<(near_workspaces::Account, String)> {
    let creator = user_with_storage(worker, contract).await?;

    create_collection_with_options(
        contract,
        &creator,
        collection_id,
        10,
        "0",
        json!({"title": "Lifecycle Test", "description": "Test token"}),
        revocation_mode,
        max_redeems,
        renewable,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(contract, &creator, collection_id, 1, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let tokens =
        nft_tokens_for_owner(contract, &creator.id().to_string(), None, Some(10)).await?;
    let token_id = tokens
        .iter()
        .find(|t| t.token_id.starts_with(&format!("{}:", collection_id)))
        .expect("Should have minted token")
        .token_id
        .clone();

    Ok((creator, token_id))
}

// =============================================================================
// RevokeToken — Invalidate Mode
// =============================================================================

#[tokio::test]
async fn test_revoke_token_invalidate() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "inv-col", "invalidate", None, false).await?;

    revoke_token(
        &contract,
        &creator,
        &token_id,
        "inv-col",
        Some("Policy violation"),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Token should still exist but be revoked
    let status = get_token_status(&contract, &token_id).await?.unwrap();
    assert!(status.is_revoked);
    assert_eq!(status.revocation_memo, Some("Policy violation".to_string()));
    assert!(!status.is_valid);

    // Token should still be visible via nft_token
    let token = nft_token(&contract, &token_id).await?;
    assert!(token.is_some(), "Invalidated token should still exist");

    Ok(())
}

#[tokio::test]
async fn test_revoke_token_invalidate_already_revoked_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "inv-col", "invalidate", None, false).await?;

    revoke_token(&contract, &creator, &token_id, "inv-col", None, ONE_YOCTO)
        .await?
        .into_result()?;

    let result =
        revoke_token(&contract, &creator, &token_id, "inv-col", None, ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Cannot revoke already revoked token"
    );

    Ok(())
}

// =============================================================================
// RevokeToken — Burn Mode
// =============================================================================

#[tokio::test]
async fn test_revoke_token_burn_mode() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "burn-col", "burn", None, false).await?;

    revoke_token(&contract, &creator, &token_id, "burn-col", None, ONE_YOCTO)
        .await?
        .into_result()?;

    // Token should be gone
    let token = nft_token(&contract, &token_id).await?;
    assert!(token.is_none(), "Burned token should not exist");

    // is_token_revoked should return None (token doesn't exist)
    let revoked = is_token_revoked(&contract, &token_id).await?;
    assert!(revoked.is_none(), "Burned token has no revocation state");

    Ok(())
}

// =============================================================================
// RevokeToken — None Mode (irrevocable)
// =============================================================================

#[tokio::test]
async fn test_revoke_token_none_mode_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "norv-col", "none", None, false).await?;

    let result =
        revoke_token(&contract, &creator, &token_id, "norv-col", None, ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Cannot revoke irrevocable token"
    );

    Ok(())
}

// =============================================================================
// RevokeToken — Authorization
// =============================================================================

#[tokio::test]
async fn test_revoke_token_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_creator, token_id) =
        collection_with_mode(&worker, &contract, "inv-col", "invalidate", None, false).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    let result =
        revoke_token(&contract, &stranger, &token_id, "inv-col", None, ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Non-creator cannot revoke"
    );

    Ok(())
}

// =============================================================================
// RedeemToken
// =============================================================================

#[tokio::test]
async fn test_redeem_token_basic() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "red-col", "none", Some(3), false).await?;

    redeem_token(&contract, &creator, &token_id, "red-col", ONE_YOCTO)
        .await?
        .into_result()?;

    let info = get_redeem_info(&contract, &token_id).await?.unwrap();
    assert_eq!(info.redeem_count, 1);
    assert_eq!(info.max_redeems, Some(3));

    let status = get_token_status(&contract, &token_id).await?.unwrap();
    assert!(!status.is_fully_redeemed);
    assert_eq!(status.redeem_count, 1);

    Ok(())
}

#[tokio::test]
async fn test_redeem_token_until_fully_redeemed() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "red-col", "none", Some(2), false).await?;

    // Redeem twice to hit max
    redeem_token(&contract, &creator, &token_id, "red-col", ONE_YOCTO)
        .await?
        .into_result()?;
    redeem_token(&contract, &creator, &token_id, "red-col", ONE_YOCTO)
        .await?
        .into_result()?;

    let status = get_token_status(&contract, &token_id).await?.unwrap();
    assert!(status.is_fully_redeemed);
    assert_eq!(status.redeem_count, 2);

    // Third redeem should fail
    let result =
        redeem_token(&contract, &creator, &token_id, "red-col", ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Cannot redeem beyond max"
    );

    Ok(())
}

#[tokio::test]
async fn test_redeem_token_not_redeemable_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    // No max_redeems = not redeemable
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "nored-col", "none", None, false).await?;

    let result =
        redeem_token(&contract, &creator, &token_id, "nored-col", ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Token without max_redeems is not redeemable"
    );

    Ok(())
}

#[tokio::test]
async fn test_redeem_token_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_creator, token_id) =
        collection_with_mode(&worker, &contract, "red-col", "none", Some(3), false).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    let result =
        redeem_token(&contract, &stranger, &token_id, "red-col", ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Non-creator cannot redeem"
    );

    Ok(())
}

// =============================================================================
// RenewToken
// =============================================================================

#[tokio::test]
async fn test_renew_token() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "ren-col", "none", None, true).await?;

    // Set expiry far in the future (1 year from now)
    let future_ns = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64
        + 365 * 24 * 3600 * 1_000_000_000;

    renew_token(
        &contract,
        &creator,
        &token_id,
        "ren-col",
        future_ns,
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let status = get_token_status(&contract, &token_id).await?.unwrap();
    assert!(!status.is_expired, "Renewed token should not be expired");

    Ok(())
}

#[tokio::test]
async fn test_renew_token_not_renewable_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "noren-col", "none", None, false).await?;

    let future_ns = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64
        + 365 * 24 * 3600 * 1_000_000_000;

    let result = renew_token(
        &contract,
        &creator,
        &token_id,
        "noren-col",
        future_ns,
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Cannot renew non-renewable token"
    );

    Ok(())
}

// =============================================================================
// BurnScarce (collection token)
// =============================================================================

#[tokio::test]
async fn test_burn_collection_token() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "brn-col", "none", None, false).await?;

    burn_scarce(&contract, &creator, &token_id, Some("brn-col"), ONE_YOCTO)
        .await?
        .into_result()?;

    let token = nft_token(&contract, &token_id).await?;
    assert!(token.is_none(), "Burned token should not exist");

    Ok(())
}

#[tokio::test]
async fn test_burn_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_creator, token_id) =
        collection_with_mode(&worker, &contract, "brn-col", "none", None, false).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    let result =
        burn_scarce(&contract, &stranger, &token_id, Some("brn-col"), ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner cannot burn"
    );

    Ok(())
}

// =============================================================================
// View Helpers
// =============================================================================

#[tokio::test]
async fn test_token_validity_views() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (creator, token_id) =
        collection_with_mode(&worker, &contract, "view-col", "invalidate", None, false).await?;

    // Before revocation
    assert!(is_token_valid(&contract, &token_id).await?);
    assert_eq!(is_token_revoked(&contract, &token_id).await?, Some(false));

    // After revocation
    revoke_token(&contract, &creator, &token_id, "view-col", None, ONE_YOCTO)
        .await?
        .into_result()?;

    assert!(!is_token_valid(&contract, &token_id).await?);
    assert_eq!(is_token_revoked(&contract, &token_id).await?, Some(true));

    Ok(())
}
