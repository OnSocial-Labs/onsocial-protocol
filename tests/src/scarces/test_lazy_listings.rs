// =============================================================================
// Lazy Listing Integration Tests
// =============================================================================
// Tests for CreateLazyListing, CancelLazyListing, UpdateLazyListingPrice,
// UpdateLazyListingExpiry, PurchaseLazyListing — mint-on-demand marketplace.

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

fn default_metadata() -> serde_json::Value {
    json!({
        "title": "Lazy Item",
        "description": "A lazy listed digital item",
    })
}

const PRICE_1_NEAR: &str = "1000000000000000000000000";
const PRICE_2_NEAR: &str = "2000000000000000000000000";

// =============================================================================
// CreateLazyListing — Happy Path
// =============================================================================

#[tokio::test]
async fn test_create_lazy_listing() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Verify via view
    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    assert_eq!(listings.len(), 1);
    let (listing_id, record) = &listings[0];
    assert!(listing_id.starts_with("ll:"), "ID should have ll: prefix");
    assert_eq!(record.creator_id, creator.id().to_string());
    assert_eq!(record.price, PRICE_1_NEAR);
    assert!(record.transferable);
    assert!(record.burnable);

    Ok(())
}

#[tokio::test]
async fn test_create_lazy_listing_count() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    let count_before = get_lazy_listings_count(&contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    create_lazy_listing(
        &contract,
        &creator,
        json!({"title": "Item 2"}),
        PRICE_2_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let count_after = get_lazy_listings_count(&contract).await?;
    assert_eq!(count_after, count_before + 2);

    Ok(())
}

// =============================================================================
// CancelLazyListing
// =============================================================================

#[tokio::test]
async fn test_cancel_lazy_listing() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    let listing_id = &listings[0].0;

    cancel_lazy_listing(&contract, &creator, listing_id, ONE_YOCTO)
        .await?
        .into_result()?;

    let listing = get_lazy_listing(&contract, listing_id).await?;
    assert!(listing.is_none(), "Listing should be removed after cancel");

    Ok(())
}

#[tokio::test]
async fn test_cancel_lazy_listing_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    let listing_id = &listings[0].0;

    let result =
        cancel_lazy_listing(&contract, &stranger, listing_id, ONE_YOCTO)
            .await?;
    assert!(
        result.into_result().is_err(),
        "Non-creator cannot cancel"
    );

    Ok(())
}

// =============================================================================
// UpdateLazyListingPrice
// =============================================================================

#[tokio::test]
async fn test_update_lazy_listing_price() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    let listing_id = &listings[0].0;

    update_lazy_listing_price(
        &contract,
        &creator,
        listing_id,
        PRICE_2_NEAR,
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let listing = get_lazy_listing(&contract, listing_id).await?.unwrap();
    assert_eq!(listing.price, PRICE_2_NEAR);

    Ok(())
}

#[tokio::test]
async fn test_update_lazy_listing_price_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    let listing_id = &listings[0].0;

    let result = update_lazy_listing_price(
        &contract,
        &stranger,
        listing_id,
        PRICE_2_NEAR,
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-creator cannot update price"
    );

    Ok(())
}

// =============================================================================
// UpdateLazyListingExpiry
// =============================================================================

#[tokio::test]
async fn test_update_lazy_listing_expiry() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    let listing_id = &listings[0].0;

    // Set expiry to far in the future (~year 2033 in nanos)
    let far_future = 2_000_000_000_000_000_000u64;
    update_lazy_listing_expiry(
        &contract,
        &creator,
        listing_id,
        Some(far_future),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let listing = get_lazy_listing(&contract, listing_id).await?.unwrap();
    assert_eq!(listing.expires_at, Some(far_future));

    Ok(())
}

// =============================================================================
// PurchaseLazyListing
// =============================================================================

#[tokio::test]
async fn test_purchase_lazy_listing() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    let listing_id = &listings[0].0;

    purchase_lazy_listing(
        &contract,
        &buyer,
        listing_id,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    // Listing should be consumed
    let listing = get_lazy_listing(&contract, listing_id).await?;
    assert!(listing.is_none(), "Listing should be removed after purchase");

    // Buyer should own a new token
    let supply =
        nft_supply_for_owner(&contract, &buyer.id().to_string()).await?;
    assert_eq!(supply, "1");

    Ok(())
}

#[tokio::test]
async fn test_purchase_lazy_listing_insufficient_deposit_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    let listing_id = &listings[0].0;

    // Deposit less than price
    let result = purchase_lazy_listing(
        &contract,
        &buyer,
        listing_id,
        NearToken::from_millinear(100), // 0.1 NEAR < 1 NEAR price
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Insufficient deposit should fail"
    );

    Ok(())
}

#[tokio::test]
async fn test_purchase_cancelled_listing_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    let listing_id = listings[0].0.clone();

    cancel_lazy_listing(&contract, &creator, &listing_id, ONE_YOCTO)
        .await?
        .into_result()?;

    let result = purchase_lazy_listing(
        &contract,
        &buyer,
        &listing_id,
        NearToken::from_near(2),
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Cannot purchase cancelled listing"
    );

    Ok(())
}

// =============================================================================
// Full Lifecycle
// =============================================================================

#[tokio::test]
async fn test_lazy_listing_lifecycle() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // 1. Create listing
    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    assert_eq!(listings.len(), 1);
    let listing_id = listings[0].0.clone();

    // 2. Update price
    update_lazy_listing_price(
        &contract,
        &creator,
        &listing_id,
        PRICE_2_NEAR,
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // 3. Verify updated price
    let listing = get_lazy_listing(&contract, &listing_id).await?.unwrap();
    assert_eq!(listing.price, PRICE_2_NEAR);

    // 4. Purchase at new price
    purchase_lazy_listing(
        &contract,
        &buyer,
        &listing_id,
        NearToken::from_near(3),
    )
    .await?
    .into_result()?;

    // 5. Verify buyer owns new token
    let tokens = nft_tokens_for_owner(
        &contract,
        &buyer.id().to_string(),
        None,
        Some(10),
    )
    .await?;
    assert_eq!(tokens.len(), 1);
    assert_eq!(
        tokens[0].metadata.as_ref().unwrap().title.as_deref(),
        Some("Lazy Item")
    );

    // 6. Listing consumed
    let remaining = get_lazy_listings_by_creator(
        &contract,
        &creator.id().to_string(),
    )
    .await?;
    assert_eq!(remaining.len(), 0);

    Ok(())
}
