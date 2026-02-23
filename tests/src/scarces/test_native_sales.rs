// =============================================================================
// Native Sales Integration Tests
// =============================================================================
// Tests for ListNativeScarce, DelistNativeScarce, PurchaseNativeScarce,
// UpdatePrice — the simplest buy/sell flow for on-contract NFTs.

use anyhow::Result;
use near_workspaces::types::NearToken;

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

/// Create an account with generous storage + mint one NFT. Returns (account, token_id).
async fn user_with_token(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
    title: &str,
) -> Result<(near_workspaces::Account, String)> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE).await?.into_result()?;
    quick_mint(contract, &user, title, DEPOSIT_STORAGE).await?.into_result()?;
    let tokens = nft_tokens_for_owner(contract, &user.id().to_string(), None, Some(1)).await?;
    let token_id = tokens[0].token_id.clone();
    Ok((user, token_id))
}

/// Create an account with generous storage.
async fn user_with_storage(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<near_workspaces::Account> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE).await?.into_result()?;
    Ok(user)
}

// Price constants in yoctoNEAR
const PRICE_1_NEAR: &str = "1000000000000000000000000";
const PRICE_2_NEAR: &str = "2000000000000000000000000";

// =============================================================================
// ListNativeScarce — Happy Path
// =============================================================================

#[tokio::test]
async fn test_list_native_scarce() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "For Sale").await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    // Verify sale exists via view
    let sale = get_sale(&contract, &token_id).await?;
    assert!(sale.is_some(), "sale should exist after listing");
    let sale = sale.unwrap();
    assert_eq!(sale.owner_id, seller.id().to_string());
    assert_eq!(sale.sale_conditions, PRICE_1_NEAR);

    // Supply of sales should be 1
    let count = get_supply_sales(&contract).await?;
    assert_eq!(count, 1);

    // Seller's sale count
    let seller_count = get_supply_by_owner_id(&contract, &seller.id().to_string()).await?;
    assert_eq!(seller_count, 1);

    Ok(())
}

#[tokio::test]
async fn test_list_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_seller, token_id) = user_with_token(&worker, &contract, "My NFT").await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    let result = list_native_scarce(
        &contract, &stranger, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE,
    ).await?;
    assert!(result.is_failure(), "non-owner should not be able to list");

    Ok(())
}

#[tokio::test]
async fn test_list_zero_price_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Zero Price").await?;

    let result = list_native_scarce(&contract, &seller, &token_id, "0", DEPOSIT_STORAGE).await?;
    assert!(result.is_failure(), "zero price should be rejected");

    Ok(())
}

#[tokio::test]
async fn test_list_already_listed_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Double List").await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    // Try listing again
    let result = list_native_scarce(
        &contract, &seller, &token_id, PRICE_2_NEAR, DEPOSIT_STORAGE,
    ).await?;
    assert!(result.is_failure(), "already-listed token should be rejected");

    Ok(())
}

// =============================================================================
// DelistNativeScarce
// =============================================================================

#[tokio::test]
async fn test_delist_native_scarce() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Delist Me").await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    assert_eq!(get_supply_sales(&contract).await?, 1);

    delist_native_scarce(&contract, &seller, &token_id, ONE_YOCTO)
        .await?
        .into_result()?;

    let sale = get_sale(&contract, &token_id).await?;
    assert!(sale.is_none(), "sale should be removed after delist");
    assert_eq!(get_supply_sales(&contract).await?, 0);

    // Seller still owns the token
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, seller.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_delist_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "My NFT").await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    let result = delist_native_scarce(&contract, &stranger, &token_id, ONE_YOCTO).await?;
    assert!(result.is_failure(), "non-owner should not delist");

    // Sale still exists
    assert!(get_sale(&contract, &token_id).await?.is_some());

    Ok(())
}

// =============================================================================
// PurchaseNativeScarce
// =============================================================================

#[tokio::test]
async fn test_purchase_native_scarce() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Buy This").await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    // Buyer purchases
    purchase_native_scarce(&contract, &buyer, &token_id, NearToken::from_near(2))
        .await?
        .into_result()?;

    // Token ownership should transfer to buyer
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, buyer.id().to_string());

    // Sale should be removed
    let sale = get_sale(&contract, &token_id).await?;
    assert!(sale.is_none(), "sale should be removed after purchase");

    // Sales count back to 0
    assert_eq!(get_supply_sales(&contract).await?, 0);

    Ok(())
}

#[tokio::test]
async fn test_purchase_insufficient_deposit_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Expensive").await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    // Buyer sends only 1 yoctoNEAR
    let result = purchase_native_scarce(&contract, &buyer, &token_id, ONE_YOCTO).await?;
    assert!(result.is_failure(), "insufficient deposit should fail");

    // Sale still exists, seller still owns
    assert!(get_sale(&contract, &token_id).await?.is_some());
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, seller.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_purchase_own_listing_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Self Buy").await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    // Seller tries to buy their own listing
    let result = purchase_native_scarce(
        &contract, &seller, &token_id, NearToken::from_near(2),
    ).await?;
    assert!(result.is_failure(), "cannot purchase own listing");

    Ok(())
}

// =============================================================================
// UpdatePrice
// =============================================================================

#[tokio::test]
async fn test_update_price() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Reprice").await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    // Update price
    update_native_price(&contract, &seller, &token_id, PRICE_2_NEAR, ONE_YOCTO)
        .await?
        .into_result()?;

    let sale = get_sale(&contract, &token_id).await?.unwrap();
    assert_eq!(sale.sale_conditions, PRICE_2_NEAR);

    Ok(())
}

#[tokio::test]
async fn test_update_price_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Not Yours").await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    let result = update_native_price(
        &contract, &stranger, &token_id, PRICE_2_NEAR, ONE_YOCTO,
    ).await?;
    assert!(result.is_failure(), "non-owner should not update price");

    // Price unchanged
    let sale = get_sale(&contract, &token_id).await?.unwrap();
    assert_eq!(sale.sale_conditions, PRICE_1_NEAR);

    Ok(())
}

#[tokio::test]
async fn test_update_price_to_zero_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Zero Update").await?;

    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    let result = update_native_price(&contract, &seller, &token_id, "0", ONE_YOCTO).await?;
    assert!(result.is_failure(), "price 0 should be rejected");

    Ok(())
}

// =============================================================================
// Full Flow: Mint → List → Update Price → Purchase
// =============================================================================

#[tokio::test]
async fn test_full_sale_lifecycle() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Lifecycle NFT").await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // List at 1 NEAR
    list_native_scarce(&contract, &seller, &token_id, PRICE_1_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    // Seller changes mind, raises price to 2 NEAR
    update_native_price(&contract, &seller, &token_id, PRICE_2_NEAR, ONE_YOCTO)
        .await?.into_result()?;

    // Buyer purchases at the new price
    purchase_native_scarce(&contract, &buyer, &token_id, NearToken::from_near(3))
        .await?.into_result()?;

    // Buyer owns the token
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, buyer.id().to_string());

    // No active sales
    assert_eq!(get_supply_sales(&contract).await?, 0);

    // Buyer re-lists the token
    list_native_scarce(&contract, &buyer, &token_id, PRICE_2_NEAR, DEPOSIT_STORAGE)
        .await?.into_result()?;

    let sale = get_sale(&contract, &token_id).await?.unwrap();
    assert_eq!(sale.owner_id, buyer.id().to_string());

    // Buyer's sales listed by owner
    let buyer_sales = get_sales_by_owner_id(&contract, &buyer.id().to_string()).await?;
    assert_eq!(buyer_sales.len(), 1);

    Ok(())
}
