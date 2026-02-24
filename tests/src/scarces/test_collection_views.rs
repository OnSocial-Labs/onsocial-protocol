// =============================================================================
// Collection Views Integration Tests
// =============================================================================
// Tests for previously untested collection view methods:
// get_collection_stats, get_active_collections, get_all_collections,
// get_collections_count_by_creator, get_collection_price,
// calculate_collection_purchase_price, update_collection_timing.

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
// get_collection_stats
// =============================================================================

#[tokio::test]
async fn test_get_collection_stats_basic() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "stats-col",
        10,
        "1000000000000000000000000",
        json!({"title": "Stats Collection", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Mint 3
    mint_from_collection(&contract, &creator, "stats-col", 3, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let stats = get_collection_stats(&contract, "stats-col").await?;
    assert!(stats.is_some());
    let stats = stats.unwrap();
    assert_eq!(stats.collection_id, "stats-col");
    assert_eq!(stats.total_supply, 10);
    assert_eq!(stats.minted_count, 3);
    assert_eq!(stats.remaining, 7);
    assert!(!stats.is_sold_out);

    Ok(())
}

#[tokio::test]
async fn test_get_collection_stats_nonexistent() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let stats = get_collection_stats(&contract, "nope").await?;
    assert!(stats.is_none(), "Nonexistent collection returns None");

    Ok(())
}

// =============================================================================
// get_active_collections / get_all_collections
// =============================================================================

#[tokio::test]
async fn test_get_all_collections_pagination() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // Create 3 collections
    for i in 0..3 {
        create_collection(
            &contract,
            &creator,
            &format!("all-col-{}", i),
            5,
            "0",
            json!({"title": format!("Collection {}", i), "description": "Token"}),
            DEPOSIT_LARGE,
        )
        .await?
        .into_result()?;
    }

    // Get all
    let all = get_all_collections(&contract, None, None).await?;
    assert_eq!(all.len(), 3);

    // Paginate: first 2
    let page1 = get_all_collections(&contract, Some(0), Some(2)).await?;
    assert_eq!(page1.len(), 2);

    // Second page
    let page2 = get_all_collections(&contract, Some(2), Some(2)).await?;
    assert_eq!(page2.len(), 1);

    Ok(())
}

#[tokio::test]
async fn test_get_active_collections() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "active-col",
        5,
        "0",
        json!({"title": "Active", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let active = get_active_collections(&contract, None, None).await?;
    assert!(active.len() >= 1, "At least one active collection");

    Ok(())
}

// =============================================================================
// get_collections_count_by_creator
// =============================================================================

#[tokio::test]
async fn test_get_collections_count_by_creator() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let other = user_with_storage(&worker, &contract).await?;

    // Creator makes 2 collections
    for i in 0..2 {
        create_collection(
            &contract,
            &creator,
            &format!("cnt-col-{}", i),
            5,
            "0",
            json!({"title": format!("Count {}", i), "description": "Token"}),
            DEPOSIT_LARGE,
        )
        .await?
        .into_result()?;
    }

    let count =
        get_collections_count_by_creator(&contract, &creator.id().to_string()).await?;
    assert_eq!(count, 2);

    let other_count =
        get_collections_count_by_creator(&contract, &other.id().to_string()).await?;
    assert_eq!(other_count, 0);

    Ok(())
}

// =============================================================================
// get_collection_price / calculate_collection_purchase_price
// =============================================================================

#[tokio::test]
async fn test_get_collection_price() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    let price_near = "2000000000000000000000000"; // 2 NEAR
    create_collection(
        &contract,
        &creator,
        "price-col",
        10,
        price_near,
        json!({"title": "Price Col", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let price = get_collection_price(&contract, "price-col").await?;
    let price_u128: u128 = price.parse()?;
    assert_eq!(
        price_u128,
        2_000_000_000_000_000_000_000_000u128,
        "Price should be 2 NEAR"
    );

    Ok(())
}

#[tokio::test]
async fn test_calculate_collection_purchase_price() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    let price_near = "1000000000000000000000000"; // 1 NEAR
    create_collection(
        &contract,
        &creator,
        "calc-col",
        10,
        price_near,
        json!({"title": "Calc Col", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // 3 tokens × 1 NEAR = 3 NEAR
    let total = calculate_collection_purchase_price(&contract, "calc-col", 3).await?;
    let total_u128: u128 = total.parse()?;
    assert_eq!(
        total_u128,
        3_000_000_000_000_000_000_000_000u128,
        "3 tokens × 1 NEAR = 3 NEAR"
    );

    Ok(())
}

// =============================================================================
// update_collection_timing
// =============================================================================

#[tokio::test]
async fn test_update_collection_timing_happy() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "timing-col",
        10,
        "0",
        json!({"title": "Timing Col", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Set a future start_time and end_time
    let future_start = 2_000_000_000_000_000_000u64; // ~year 2033 in ns
    let future_end = 2_100_000_000_000_000_000u64;

    update_collection_timing(
        &contract,
        &creator,
        "timing-col",
        Some(future_start),
        Some(future_end),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Verify via get_collection
    let col = get_collection(&contract, "timing-col").await?;
    assert!(col.is_some());

    Ok(())
}

#[tokio::test]
async fn test_update_collection_timing_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "timing-col2",
        10,
        "0",
        json!({"title": "Timing Col 2", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let result = update_collection_timing(
        &contract,
        &stranger,
        "timing-col2",
        Some(2_000_000_000_000_000_000),
        None,
        DEPOSIT_LARGE,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-creator cannot update timing"
    );

    Ok(())
}

// =============================================================================
// get_total_collections
// =============================================================================

#[tokio::test]
async fn test_get_total_collections() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    let before = get_total_collections(&contract).await?;

    create_collection(
        &contract,
        &creator,
        "total-col",
        5,
        "0",
        json!({"title": "Total Col", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let after = get_total_collections(&contract).await?;
    assert_eq!(after, before + 1);

    Ok(())
}

// =============================================================================
// App Pool View Tests — get_app_count, get_all_app_ids
// =============================================================================

async fn setup_app(
    app_owner: &near_workspaces::Account,
    contract: &near_workspaces::Contract,
) -> Result<String> {
    storage_deposit(contract, app_owner, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let app_id = app_owner.id().to_string();
    register_app(contract, app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok(app_id)
}

#[tokio::test]
async fn test_app_count_zero_initially() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let count = get_app_count(&contract).await?;
    assert_eq!(count, 0);

    Ok(())
}

#[tokio::test]
async fn test_app_count_after_register() -> Result<()> {
    let (worker, owner, contract) = setup().await?;
    let app_owner = worker.dev_create_account().await?;

    setup_app(&app_owner, &contract).await?;

    let count = get_app_count(&contract).await?;
    assert_eq!(count, 1);

    Ok(())
}

#[tokio::test]
async fn test_get_all_app_ids_empty() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let ids = get_all_app_ids(&contract, None, None).await?;
    assert!(ids.is_empty());

    Ok(())
}

#[tokio::test]
async fn test_get_all_app_ids_returns_registered() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = worker.dev_create_account().await?;
    let app_id = app_owner.id().to_string();

    setup_app(&app_owner, &contract).await?;

    let ids = get_all_app_ids(&contract, None, None).await?;
    assert_eq!(ids.len(), 1);
    assert_eq!(ids[0], app_id);

    Ok(())
}

#[tokio::test]
async fn test_get_all_app_ids_pagination() -> Result<()> {
    let (worker, owner, contract) = setup().await?;

    // Register two apps
    let app_owner1 = worker.dev_create_account().await?;
    setup_app(&app_owner1, &contract).await?;

    let app_owner2 = worker.dev_create_account().await?;
    setup_app(&app_owner2, &contract).await?;

    assert_eq!(get_app_count(&contract).await?, 2);

    // Page 1: limit 1
    let page1 = get_all_app_ids(&contract, Some(0), Some(1)).await?;
    assert_eq!(page1.len(), 1);

    // Page 2: from_index 1, limit 1
    let page2 = get_all_app_ids(&contract, Some(1), Some(1)).await?;
    assert_eq!(page2.len(), 1);

    // Should be different app ids
    assert_ne!(page1[0], page2[0]);

    // All at once
    let all = get_all_app_ids(&contract, None, None).await?;
    assert_eq!(all.len(), 2);

    Ok(())
}
