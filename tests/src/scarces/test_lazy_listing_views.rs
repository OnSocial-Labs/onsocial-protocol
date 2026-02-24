// =============================================================================
// Lazy Listing Views, Cleanup & Allowlist Allocation  (P1 coverage)
// =============================================================================
// Tests for: get_lazy_listings_by_app, cleanup_expired_lazy_listings,
//            get_allowlist_allocation.

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
// get_lazy_listings_by_app
// =============================================================================

#[tokio::test]
async fn test_lazy_listings_by_app_empty() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let listings = get_lazy_listings_by_app(&contract, "nonexistent.near", None, None).await?;
    assert!(listings.is_empty());

    Ok(())
}

#[tokio::test]
async fn test_lazy_listings_by_app_returns_matching() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = worker.dev_create_account().await?;
    let app_id = app_owner.id().to_string();
    storage_deposit(&contract, &app_owner, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    register_app(&contract, &app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    storage_deposit(&contract, &app_owner, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Create a lazy listing with app_id set (via flattened ScarceOptions)
    execute_action(
        &contract,
        &app_owner,
        json!({
            "type": "create_lazy_listing",
            "metadata": {"title": "Lazy Token", "description": "T"},
            "price": "1000000000000000000000000",
            "app_id": app_id,
            "transferable": true,
            "burnable": true
        }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings = get_lazy_listings_by_app(&contract, &app_id, None, None).await?;
    assert_eq!(listings.len(), 1);

    // Different app should return empty
    let other_listings =
        get_lazy_listings_by_app(&contract, "other-app.near", None, None).await?;
    assert!(other_listings.is_empty());

    Ok(())
}

// =============================================================================
// cleanup_expired_lazy_listings
// =============================================================================

#[tokio::test]
async fn test_cleanup_expired_no_listings() -> Result<()> {
    let (_worker, owner, contract) = setup().await?;

    let result = cleanup_expired_lazy_listings(&owner, &contract, None).await?;
    assert!(result.is_success());

    Ok(())
}

// =============================================================================
// get_allowlist_allocation
// =============================================================================

#[tokio::test]
async fn test_allowlist_allocation_zero_by_default() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "alloc-col",
        5,
        "0",
        json!({"title": "Token", "description": "T"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let user = worker.dev_create_account().await?;
    let allocation =
        get_allowlist_allocation(&contract, "alloc-col", user.id().as_str()).await?;
    assert_eq!(allocation, 0);

    Ok(())
}

#[tokio::test]
async fn test_allowlist_allocation_after_set() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "alloc-col2",
        5,
        "0",
        json!({"title": "Token", "description": "T"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let user = worker.dev_create_account().await?;

    // Add user to allowlist with allocation of 3
    set_allowlist(
        &contract,
        &creator,
        "alloc-col2",
        json!([{ "account_id": user.id().to_string(), "allocation": 3 }]),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let allocation =
        get_allowlist_allocation(&contract, "alloc-col2", user.id().as_str()).await?;
    assert_eq!(allocation, 3);

    Ok(())
}
