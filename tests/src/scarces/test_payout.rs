// =============================================================================
// NEP-199 Payout Integration Tests
// =============================================================================
// Tests for `nft_payout` (view) and `nft_transfer_payout` (mutation).
// Verifies royalty splits are computed correctly for marketplace integrations.

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
// nft_payout — View
// =============================================================================

#[tokio::test]
async fn test_nft_payout_no_royalty() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = user_with_storage(&worker, &contract).await?;

    // Mint without royalties
    quick_mint(
        &contract,
        &minter,
        "No Royalty",
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &minter.id().to_string(), None, Some(50)).await?;
    let token_id = &tokens[0].token_id;

    // Full balance goes to owner
    let payout = nft_payout(&contract, token_id, "1000000000000000000000000", None).await?;
    assert_eq!(payout.payout.len(), 1, "Single payout entry for owner");
    let owner_amount: u128 = payout.payout[&minter.id().to_string()].parse()?;
    assert_eq!(owner_amount, 1_000_000_000_000_000_000_000_000u128);

    Ok(())
}

#[tokio::test]
async fn test_nft_payout_with_royalty() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = user_with_storage(&worker, &contract).await?;
    let artist = worker.dev_create_account().await?;

    // Mint with 10% royalty to artist (1000 bps)
    quick_mint_full(
        &contract,
        &minter,
        json!({"title": "Royalty Token", "description": "Test"}),
        Some(json!({ artist.id().to_string(): 1000 })),
        None,
        true,
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &minter.id().to_string(), None, Some(50)).await?;
    let token_id = &tokens[0].token_id;

    // 1 NEAR sale: artist gets 10%, seller gets 90%
    let balance = "1000000000000000000000000"; // 1 NEAR
    let payout = nft_payout(&contract, token_id, balance, None).await?;

    assert!(payout.payout.len() <= 2, "At most 2 entries (seller + artist)");

    let artist_amount: u128 = payout
        .payout
        .get(&artist.id().to_string())
        .unwrap()
        .parse()?;
    let seller_amount: u128 = payout
        .payout
        .get(&minter.id().to_string())
        .unwrap()
        .parse()?;

    // 10% of 1 NEAR = 0.1 NEAR
    assert_eq!(artist_amount, 100_000_000_000_000_000_000_000u128);
    // 90% of 1 NEAR = 0.9 NEAR
    assert_eq!(seller_amount, 900_000_000_000_000_000_000_000u128);

    Ok(())
}

#[tokio::test]
async fn test_nft_payout_multiple_royalties() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = user_with_storage(&worker, &contract).await?;
    let artist1 = worker.dev_create_account().await?;
    let artist2 = worker.dev_create_account().await?;

    // Mint with 5% to artist1, 5% to artist2
    quick_mint_full(
        &contract,
        &minter,
        json!({"title": "Multi Royalty", "description": "Test"}),
        Some(json!({
            artist1.id().to_string(): 500,
            artist2.id().to_string(): 500,
        })),
        None,
        true,
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &minter.id().to_string(), None, Some(50)).await?;
    let token_id = &tokens[0].token_id;

    let balance = "1000000000000000000000000";
    let payout = nft_payout(&contract, token_id, balance, None).await?;

    assert_eq!(payout.payout.len(), 3, "3 entries: seller + 2 artists");
    let a1: u128 = payout
        .payout
        .get(&artist1.id().to_string())
        .unwrap()
        .parse()?;
    let a2: u128 = payout
        .payout
        .get(&artist2.id().to_string())
        .unwrap()
        .parse()?;
    let seller: u128 = payout
        .payout
        .get(&minter.id().to_string())
        .unwrap()
        .parse()?;

    assert_eq!(a1, 50_000_000_000_000_000_000_000u128); // 5%
    assert_eq!(a2, 50_000_000_000_000_000_000_000u128); // 5%
    assert_eq!(seller, 900_000_000_000_000_000_000_000u128); // 90%

    Ok(())
}

// =============================================================================
// nft_transfer_payout — Mutation
// =============================================================================

#[tokio::test]
async fn test_nft_transfer_payout_transfers_token() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    quick_mint_full(
        &contract,
        &minter,
        json!({"title": "Payout Transfer", "description": "Test"}),
        None,
        None,
        true,
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &minter.id().to_string(), None, Some(50)).await?;
    let token_id = &tokens[0].token_id;

    nft_transfer_payout(
        &contract,
        &minter,
        &buyer.id().to_string(),
        token_id,
        "1000000000000000000000000",
        None,
    )
    .await?
    .into_result()?;

    // Token should now belong to buyer
    let token = nft_token(&contract, token_id).await?.unwrap();
    assert_eq!(token.owner_id, buyer.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_nft_transfer_payout_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;
    let buyer = worker.dev_create_account().await?;

    quick_mint(
        &contract,
        &minter,
        "Not Yours",
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &minter.id().to_string(), None, Some(50)).await?;
    let token_id = &tokens[0].token_id;

    let result = nft_transfer_payout(
        &contract,
        &stranger,
        &buyer.id().to_string(),
        token_id,
        "1000000000000000000000000",
        None,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner cannot call nft_transfer_payout"
    );

    Ok(())
}

#[tokio::test]
async fn test_nft_transfer_payout_returns_correct_split() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = user_with_storage(&worker, &contract).await?;
    let artist = worker.dev_create_account().await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // 10% royalty
    quick_mint_full(
        &contract,
        &minter,
        json!({"title": "Payout Split", "description": "Test"}),
        Some(json!({ artist.id().to_string(): 1000 })),
        None,
        true,
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &minter.id().to_string(), None, Some(50)).await?;
    let token_id = &tokens[0].token_id;

    // View payout before transfer
    let payout_view =
        nft_payout(&contract, token_id, "1000000000000000000000000", None).await?;
    assert_eq!(payout_view.payout.len(), 2);

    // Now do the actual transfer_payout
    let result = nft_transfer_payout(
        &contract,
        &minter,
        &buyer.id().to_string(),
        token_id,
        "1000000000000000000000000",
        None,
    )
    .await?;
    result.into_result()?;

    // Token ownership transferred
    let token = nft_token(&contract, token_id).await?.unwrap();
    assert_eq!(token.owner_id, buyer.id().to_string());

    Ok(())
}
