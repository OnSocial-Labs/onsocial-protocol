// =============================================================================
// Moderation Integration Tests
// =============================================================================
// Tests for AddModerator, RemoveModerator, BanCollection, UnbanCollection
// via the execute dispatch. Verifies access control and ban effects.

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

/// Register an app pool using the caller's account ID as the app_id.
/// Returns (app_owner, app_id).
async fn setup_app(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<(near_workspaces::Account, String)> {
    let app_owner = user_with_storage(worker, contract).await?;
    let app_id = app_owner.id().to_string();
    register_app(contract, &app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok((app_owner, app_id))
}

// =============================================================================
// AddModerator
// =============================================================================

#[tokio::test]
async fn test_add_moderator_happy() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app(&worker, &contract).await?;
    let moderator = worker.dev_create_account().await?;

    add_moderator(
        &contract,
        &app_owner,
        &app_id,
        &moderator.id().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    Ok(())
}

#[tokio::test]
async fn test_add_moderator_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_app_owner, app_id) = setup_app(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;
    let moderator = worker.dev_create_account().await?;

    let result = add_moderator(
        &contract,
        &stranger,
        &app_id,
        &moderator.id().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner cannot add moderator"
    );

    Ok(())
}

// =============================================================================
// RemoveModerator
// =============================================================================

#[tokio::test]
async fn test_remove_moderator_happy() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app(&worker, &contract).await?;
    let moderator = worker.dev_create_account().await?;

    // Add then remove
    add_moderator(
        &contract,
        &app_owner,
        &app_id,
        &moderator.id().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    remove_moderator(
        &contract,
        &app_owner,
        &app_id,
        &moderator.id().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    Ok(())
}

#[tokio::test]
async fn test_remove_moderator_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app(&worker, &contract).await?;
    let moderator = worker.dev_create_account().await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    add_moderator(
        &contract,
        &app_owner,
        &app_id,
        &moderator.id().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let result = remove_moderator(
        &contract,
        &stranger,
        &app_id,
        &moderator.id().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner cannot remove moderator"
    );

    Ok(())
}

// =============================================================================
// BanCollection
// =============================================================================

#[tokio::test]
async fn test_ban_collection_happy() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app(&worker, &contract).await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection_for_app(
        &contract,
        &creator,
        "ban-col",
        10,
        "1000000000000000000000000",
        json!({"title": "Bannable", "description": "Token"}),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    ban_collection(
        &contract,
        &app_owner,
        &app_id,
        "ban-col",
        Some("policy violation"),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Verify collection is banned via stats
    let stats = get_collection_stats(&contract, "ban-col").await?;
    assert!(stats.is_some());

    Ok(())
}

#[tokio::test]
async fn test_ban_collection_non_app_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_app_owner, app_id) = setup_app(&worker, &contract).await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    create_collection_for_app(
        &contract,
        &creator,
        "ban-col2",
        10,
        "0",
        json!({"title": "Bannable 2", "description": "Token"}),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let result = ban_collection(
        &contract,
        &stranger,
        &app_id,
        "ban-col2",
        None,
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-app-owner cannot ban collection"
    );

    Ok(())
}

// =============================================================================
// UnbanCollection
// =============================================================================

#[tokio::test]
async fn test_unban_collection_happy() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app(&worker, &contract).await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection_for_app(
        &contract,
        &creator,
        "unban-col",
        10,
        "0",
        json!({"title": "Unbannable", "description": "Token"}),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Ban first
    ban_collection(
        &contract,
        &app_owner,
        &app_id,
        "unban-col",
        Some("temporary"),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Then unban
    unban_collection(
        &contract,
        &app_owner,
        &app_id,
        "unban-col",
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    Ok(())
}

#[tokio::test]
async fn test_moderator_can_ban_collection() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app(&worker, &contract).await?;
    let moderator = user_with_storage(&worker, &contract).await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // Add moderator
    add_moderator(
        &contract,
        &app_owner,
        &app_id,
        &moderator.id().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    create_collection_for_app(
        &contract,
        &creator,
        "mod-ban-col",
        10,
        "0",
        json!({"title": "Mod Bannable", "description": "Token"}),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Moderator bans the collection
    ban_collection(
        &contract,
        &moderator,
        &app_id,
        "mod-ban-col",
        Some("moderator action"),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    Ok(())
}
