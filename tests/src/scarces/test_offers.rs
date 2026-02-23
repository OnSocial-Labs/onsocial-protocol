// =============================================================================
// Offer Integration Tests
// =============================================================================
// Tests for MakeOffer, AcceptOffer, CancelOffer, MakeCollectionOffer,
// AcceptCollectionOffer, CancelCollectionOffer — peer-to-peer NFT offers.

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

/// Create an account with storage + mint one NFT. Returns (account, token_id).
async fn user_with_token(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
    title: &str,
) -> Result<(near_workspaces::Account, String)> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    quick_mint(contract, &user, title, DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(contract, &user.id().to_string(), None, Some(1)).await?;
    let token_id = tokens[0].token_id.clone();
    Ok((user, token_id))
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

const OFFER_1_NEAR: &str = "1000000000000000000000000";
const OFFER_HALF_NEAR: &str = "500000000000000000000000";

// =============================================================================
// MakeOffer — Happy Path
// =============================================================================

#[tokio::test]
async fn test_make_offer_basic() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_token_owner, token_id) =
        user_with_token(&worker, &contract, "NFT").await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    make_offer(
        &contract,
        &buyer,
        &token_id,
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    let offer =
        get_offer(&contract, &token_id, &buyer.id().to_string()).await?;
    assert!(offer.is_some(), "Offer should exist");
    let offer = offer.unwrap();
    assert_eq!(offer.buyer_id, buyer.id().to_string());
    assert_eq!(offer.amount, OFFER_1_NEAR);

    Ok(())
}

// =============================================================================
// MakeOffer — Error Cases
// =============================================================================

#[tokio::test]
async fn test_make_offer_own_token_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (token_owner, token_id) =
        user_with_token(&worker, &contract, "NFT").await?;

    let result = make_offer(
        &contract,
        &token_owner,
        &token_id,
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Cannot offer on own token"
    );

    Ok(())
}

// =============================================================================
// AcceptOffer
// =============================================================================

#[tokio::test]
async fn test_accept_offer() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (token_owner, token_id) =
        user_with_token(&worker, &contract, "NFT").await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    make_offer(
        &contract,
        &buyer,
        &token_id,
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    accept_offer(
        &contract,
        &token_owner,
        &token_id,
        &buyer.id().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Verify ownership transferred
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, buyer.id().to_string());

    // Offer should be gone
    let offer =
        get_offer(&contract, &token_id, &buyer.id().to_string()).await?;
    assert!(offer.is_none());

    Ok(())
}

#[tokio::test]
async fn test_accept_offer_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_token_owner, token_id) =
        user_with_token(&worker, &contract, "NFT").await?;
    let buyer = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    make_offer(
        &contract,
        &buyer,
        &token_id,
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    let result = accept_offer(
        &contract,
        &stranger,
        &token_id,
        &buyer.id().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner cannot accept offer"
    );

    Ok(())
}

// =============================================================================
// CancelOffer
// =============================================================================

#[tokio::test]
async fn test_cancel_offer() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_token_owner, token_id) =
        user_with_token(&worker, &contract, "NFT").await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    make_offer(
        &contract,
        &buyer,
        &token_id,
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    cancel_offer(&contract, &buyer, &token_id, ONE_YOCTO)
        .await?
        .into_result()?;

    let offer =
        get_offer(&contract, &token_id, &buyer.id().to_string()).await?;
    assert!(offer.is_none(), "Offer should be removed after cancel");

    Ok(())
}

#[tokio::test]
async fn test_make_offer_replaces_existing() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_token_owner, token_id) =
        user_with_token(&worker, &contract, "NFT").await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // First offer
    make_offer(
        &contract,
        &buyer,
        &token_id,
        OFFER_HALF_NEAR,
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Replace with higher offer
    make_offer(
        &contract,
        &buyer,
        &token_id,
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    // Should be only one offer at the new amount
    let offers =
        get_offers_for_token(&contract, &token_id, None, None).await?;
    assert_eq!(offers.len(), 1);
    assert_eq!(offers[0].amount, OFFER_1_NEAR);

    Ok(())
}

// =============================================================================
// Collection Offers
// =============================================================================

#[tokio::test]
async fn test_make_collection_offer() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // Create a collection first
    create_collection(
        &contract,
        &creator,
        "art",
        10,
        OFFER_1_NEAR,
        json!({"title": "Art Piece", "description": "Collection art"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Make collection offer
    make_collection_offer(
        &contract,
        &buyer,
        "art",
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    let offer = get_collection_offer(
        &contract,
        "art",
        &buyer.id().to_string(),
    )
    .await?;
    assert!(offer.is_some());
    assert_eq!(offer.unwrap().amount, OFFER_1_NEAR);

    Ok(())
}

#[tokio::test]
async fn test_accept_collection_offer() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // Create collection with free mint + mint a token
    create_collection(
        &contract,
        &creator,
        "art",
        10,
        "0",
        json!({"title": "Art Piece", "description": "Collection art"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(&contract, &creator, "art", 1, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Find the minted token
    let tokens = nft_tokens_for_owner(
        &contract,
        &creator.id().to_string(),
        None,
        Some(10),
    )
    .await?;
    let token_id = tokens
        .iter()
        .find(|t| t.token_id.starts_with("art:"))
        .expect("Should have collection token")
        .token_id
        .clone();

    // Make collection offer
    make_collection_offer(
        &contract,
        &buyer,
        "art",
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    // Accept with specific token
    accept_collection_offer(
        &contract,
        &creator,
        "art",
        &token_id,
        &buyer.id().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Verify ownership
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, buyer.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_cancel_collection_offer() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "art",
        10,
        OFFER_1_NEAR,
        json!({"title": "Art Piece", "description": "Collection art"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    make_collection_offer(
        &contract,
        &buyer,
        "art",
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    cancel_collection_offer(&contract, &buyer, "art", ONE_YOCTO)
        .await?
        .into_result()?;

    let offer = get_collection_offer(
        &contract,
        "art",
        &buyer.id().to_string(),
    )
    .await?;
    assert!(offer.is_none(), "Collection offer should be removed");

    Ok(())
}

// =============================================================================
// Offer Views
// =============================================================================

#[tokio::test]
async fn test_offer_views() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_token_owner, token_id) =
        user_with_token(&worker, &contract, "NFT").await?;
    let buyer1 = user_with_storage(&worker, &contract).await?;
    let buyer2 = user_with_storage(&worker, &contract).await?;

    make_offer(
        &contract,
        &buyer1,
        &token_id,
        OFFER_HALF_NEAR,
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    make_offer(
        &contract,
        &buyer2,
        &token_id,
        OFFER_1_NEAR,
        None,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    let offers =
        get_offers_for_token(&contract, &token_id, None, None).await?;
    assert_eq!(offers.len(), 2, "Should have 2 offers");

    Ok(())
}
