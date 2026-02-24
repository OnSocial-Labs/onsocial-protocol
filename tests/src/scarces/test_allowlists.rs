// =============================================================================
// Allowlist & Wallet Limit Integration Tests
// =============================================================================
// Tests for SetAllowlist, RemoveFromAllowlist, and per-wallet mint limits.
// Covers the allowlist gating flow and associated view methods.

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
// SetAllowlist
// =============================================================================

#[tokio::test]
async fn test_set_allowlist_happy() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let allowed_user = worker.dev_create_account().await?;

    create_collection(
        &contract,
        &creator,
        "allow-col",
        10,
        "1000000000000000000000000",
        json!({"title": "Allowlist Col", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    set_allowlist(
        &contract,
        &creator,
        "allow-col",
        json!([{ "account_id": allowed_user.id().to_string(), "allocation": 3 }]),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Verify via view
    let is_allowed =
        is_allowlisted(&contract, "allow-col", &allowed_user.id().to_string()).await?;
    assert!(is_allowed, "User should be allowlisted");

    let remaining =
        get_allowlist_remaining(&contract, "allow-col", &allowed_user.id().to_string())
            .await?;
    assert_eq!(remaining, 3, "Should have 3 remaining allocation");

    Ok(())
}

#[tokio::test]
async fn test_set_allowlist_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;
    let user = worker.dev_create_account().await?;

    create_collection(
        &contract,
        &creator,
        "allow-col2",
        10,
        "0",
        json!({"title": "Allowlist Col 2", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let result = set_allowlist(
        &contract,
        &stranger,
        "allow-col2",
        json!([{ "account_id": user.id().to_string(), "allocation": 1 }]),
        DEPOSIT_LARGE,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-creator cannot set allowlist"
    );

    Ok(())
}

#[tokio::test]
async fn test_allowlist_not_listed_returns_false() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let random = worker.dev_create_account().await?;

    create_collection(
        &contract,
        &creator,
        "allow-col3",
        10,
        "0",
        json!({"title": "Allowlist Col 3", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let is_allowed =
        is_allowlisted(&contract, "allow-col3", &random.id().to_string()).await?;
    assert!(!is_allowed, "Non-allowlisted user should return false");

    Ok(())
}

// =============================================================================
// RemoveFromAllowlist
// =============================================================================

#[tokio::test]
async fn test_remove_from_allowlist_happy() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let user = worker.dev_create_account().await?;

    create_collection(
        &contract,
        &creator,
        "remove-col",
        10,
        "0",
        json!({"title": "Remove AL", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Add to allowlist
    set_allowlist(
        &contract,
        &creator,
        "remove-col",
        json!([{ "account_id": user.id().to_string(), "allocation": 5 }]),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    assert!(is_allowlisted(&contract, "remove-col", &user.id().to_string()).await?);

    // Remove from allowlist
    remove_from_allowlist(
        &contract,
        &creator,
        "remove-col",
        vec![&user.id().to_string()],
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let is_allowed =
        is_allowlisted(&contract, "remove-col", &user.id().to_string()).await?;
    assert!(!is_allowed, "User should no longer be allowlisted");

    Ok(())
}

#[tokio::test]
async fn test_remove_from_allowlist_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;
    let user = worker.dev_create_account().await?;

    create_collection(
        &contract,
        &creator,
        "remove-col2",
        10,
        "0",
        json!({"title": "Remove AL 2", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    set_allowlist(
        &contract,
        &creator,
        "remove-col2",
        json!([{ "account_id": user.id().to_string(), "allocation": 1 }]),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let result = remove_from_allowlist(
        &contract,
        &stranger,
        "remove-col2",
        vec![&user.id().to_string()],
        DEPOSIT_LARGE,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-creator cannot remove from allowlist"
    );

    Ok(())
}

// =============================================================================
// Wallet Mint Count Views
// =============================================================================

#[tokio::test]
async fn test_wallet_mint_count_after_minting() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // Create collection WITH max_per_wallet so the contract tracks mint counts
    execute_action(
        &contract,
        &creator,
        json!({
            "type": "create_collection",
            "collection_id": "count-col",
            "total_supply": 10,
            "metadata_template": json!({"title": "Count Col", "description": "Token"}).to_string(),
            "price_near": "0",
            "transferable": true,
            "burnable": true,
            "max_per_wallet": 5,
        }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Before purchasing
    let count_before =
        get_wallet_mint_count(&contract, "count-col", &buyer.id().to_string()).await?;
    assert_eq!(count_before, 0);

    // Purchase 3 (price is 0)
    purchase_from_collection(&contract, &buyer, "count-col", 3, "0", DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let count_after =
        get_wallet_mint_count(&contract, "count-col", &buyer.id().to_string()).await?;
    assert_eq!(count_after, 3);

    Ok(())
}

#[tokio::test]
async fn test_wallet_mint_remaining_no_limit() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // Collection without max_per_wallet → remaining is None (unlimited)
    create_collection(
        &contract,
        &creator,
        "nolimit-col",
        100,
        "0",
        json!({"title": "No Limit", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let remaining =
        get_wallet_mint_remaining(&contract, "nolimit-col", &creator.id().to_string())
            .await?;
    assert_eq!(remaining, None, "No limit set → None");

    Ok(())
}
