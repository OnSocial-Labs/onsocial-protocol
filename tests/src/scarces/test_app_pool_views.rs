// =============================================================================
// App Pool Views Integration Tests (P1 coverage)
// =============================================================================
// Tests for: get_app_user_usage, get_app_user_remaining, get_user_storage,
// get_app_metadata, resolve_base_uri, SetCollectionAppMetadata action.

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

/// Create a dev account with storage, register an app, return (account, app_id).
async fn setup_app_owner(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<(near_workspaces::Account, String)> {
    let app_owner = worker.dev_create_account().await?;
    let app_id = app_owner.id().to_string();
    storage_deposit(contract, &app_owner, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    register_app(contract, &app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok((app_owner, app_id))
}

// =============================================================================
// get_app_user_usage
// =============================================================================

#[tokio::test]
async fn test_app_user_usage_zero_initially() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_app_owner, app_id) = setup_app_owner(&worker, &contract).await?;
    let user = worker.dev_create_account().await?;

    let usage = get_app_user_usage(&contract, user.id().as_str(), &app_id).await?;
    assert_eq!(usage, 0);

    Ok(())
}

#[tokio::test]
async fn test_app_user_usage_unregistered_app() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = worker.dev_create_account().await?;

    let usage = get_app_user_usage(&contract, user.id().as_str(), "nonexistent.near").await?;
    assert_eq!(usage, 0);

    Ok(())
}

// =============================================================================
// get_app_user_remaining
// =============================================================================

#[tokio::test]
async fn test_app_user_remaining_full_budget() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_app_owner, app_id) = setup_app_owner(&worker, &contract).await?;
    let user = worker.dev_create_account().await?;

    let remaining = get_app_user_remaining(&contract, user.id().as_str(), &app_id).await?;
    // Should equal max_user_bytes from default app config
    assert!(remaining > 0);

    Ok(())
}

#[tokio::test]
async fn test_app_user_remaining_unregistered_app_zero() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = worker.dev_create_account().await?;

    let remaining =
        get_app_user_remaining(&contract, user.id().as_str(), "nonexistent.near").await?;
    assert_eq!(remaining, 0);

    Ok(())
}

// =============================================================================
// get_user_storage
// =============================================================================

#[tokio::test]
async fn test_user_storage_default() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = worker.dev_create_account().await?;

    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    assert_eq!(storage["balance"], "0");
    assert_eq!(storage["used_bytes"], 0);

    Ok(())
}

#[tokio::test]
async fn test_user_storage_after_deposit() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = worker.dev_create_account().await?;

    storage_deposit(&contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    let balance: u128 = storage["balance"]
        .as_str()
        .expect("balance should be a string (U128)")
        .parse()
        .expect("balance should parse as u128");
    assert!(balance > 0);

    Ok(())
}

// =============================================================================
// get_app_metadata
// =============================================================================

#[tokio::test]
async fn test_app_metadata_none_for_missing() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let meta = get_app_metadata(&contract, "nonexistent.near").await?;
    assert!(meta.is_none());

    Ok(())
}

#[tokio::test]
async fn test_app_metadata_returns_after_set() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app_owner(&worker, &contract).await?;

    // Set metadata via set_app_config action
    execute_action(
        &contract,
        &app_owner,
        json!({
            "type": "set_app_config",
            "app_id": app_id,
            "metadata": "{\"name\":\"My App\"}"
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let meta = get_app_metadata(&contract, &app_id).await?;
    assert!(meta.is_some());

    Ok(())
}

// =============================================================================
// resolve_base_uri
// =============================================================================

#[tokio::test]
async fn test_resolve_base_uri_none_for_missing_collection() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let uri = resolve_base_uri(&contract, "nonexistent").await?;
    assert!(uri.is_none());

    Ok(())
}

#[tokio::test]
async fn test_resolve_base_uri_from_app_metadata() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app_owner(&worker, &contract).await?;

    // Set app metadata with base_uri
    execute_action(
        &contract,
        &app_owner,
        json!({
            "type": "set_app_config",
            "app_id": app_id,
            "metadata": "{\"base_uri\":\"https://example.com/assets\"}"
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Create a collection under this app
    create_collection_for_app(
        &contract,
        &app_owner,
        "uri-test-col",
        5,
        "0",
        json!({"title": "Token", "description": "D"}),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let uri = resolve_base_uri(&contract, "uri-test-col").await?;
    assert_eq!(uri, Some("https://example.com/assets".to_string()));

    Ok(())
}

// =============================================================================
// SetCollectionAppMetadata action
// =============================================================================

#[tokio::test]
async fn test_set_collection_app_metadata_happy() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app_owner(&worker, &contract).await?;

    // Create collection under app
    create_collection_for_app(
        &contract,
        &app_owner,
        "appmeta-col",
        5,
        "0",
        json!({"title": "Token", "description": "D"}),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Set app metadata on the collection
    let result = execute_action(
        &contract,
        &app_owner,
        json!({
            "type": "set_collection_app_metadata",
            "app_id": app_id,
            "collection_id": "appmeta-col",
            "metadata": "{\"featured\":true}"
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_success());

    Ok(())
}

#[tokio::test]
async fn test_set_collection_app_metadata_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app_owner(&worker, &contract).await?;
    let stranger = worker.dev_create_account().await?;

    storage_deposit(&contract, &stranger, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Create collection under app
    create_collection_for_app(
        &contract,
        &app_owner,
        "appmeta-col2",
        5,
        "0",
        json!({"title": "Token", "description": "D"}),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Stranger tries to set metadata — should fail
    let result = execute_action(
        &contract,
        &stranger,
        json!({
            "type": "set_collection_app_metadata",
            "app_id": app_id,
            "collection_id": "appmeta-col2",
            "metadata": "{\"hacked\":true}"
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure());

    Ok(())
}

#[tokio::test]
async fn test_set_collection_app_metadata_wrong_app_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (app_owner, app_id) = setup_app_owner(&worker, &contract).await?;
    let (app_owner2, app_id2) = setup_app_owner(&worker, &contract).await?;

    // Create collection under app1
    create_collection_for_app(
        &contract,
        &app_owner,
        "appmeta-col3",
        5,
        "0",
        json!({"title": "Token", "description": "D"}),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // App2 owner tries to set metadata on app1's collection — should fail
    let result = execute_action(
        &contract,
        &app_owner2,
        json!({
            "type": "set_collection_app_metadata",
            "app_id": app_id2,
            "collection_id": "appmeta-col3",
            "metadata": "{\"wrong\":true}"
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure());

    Ok(())
}
