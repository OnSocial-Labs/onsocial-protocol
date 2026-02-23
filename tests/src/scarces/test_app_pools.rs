// =============================================================================
// App Pool Integration Tests
// =============================================================================
// Tests for RegisterApp, FundAppPool, WithdrawAppPool, SetAppConfig,
// TransferAppOwnership — app pool management and fee routing.

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

// =============================================================================
// RegisterApp
// =============================================================================

#[tokio::test]
async fn test_register_app_basic() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;

    register_app(&contract, &app_owner, &app_owner.id().to_string(), DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let pool = get_app_pool(&contract, &app_owner.id().to_string()).await?;
    assert!(pool.is_some(), "App pool should exist");
    let pool = pool.unwrap();
    assert_eq!(pool.owner_id, app_owner.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_register_app_duplicate_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;

    register_app(&contract, &app_owner, &app_owner.id().to_string(), DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let result =
        register_app(&contract, &app_owner, &app_owner.id().to_string(), DEPOSIT_LARGE).await?;
    assert!(
        result.into_result().is_err(),
        "Duplicate registration should fail"
    );

    Ok(())
}

// =============================================================================
// FundAppPool
// =============================================================================

#[tokio::test]
async fn test_fund_app_pool() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();

    register_app(&contract, &app_owner, &app_id, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    let pool_before = get_app_pool(&contract, &app_id).await?.unwrap();
    let balance_before: u128 = pool_before.balance.parse().unwrap();

    fund_app_pool(&contract, &app_owner, &app_id, NearToken::from_near(1))
        .await?
        .into_result()?;

    let pool_after = get_app_pool(&contract, &app_id).await?.unwrap();
    let balance_after: u128 = pool_after.balance.parse().unwrap();

    assert!(
        balance_after > balance_before,
        "Balance should increase after funding"
    );

    Ok(())
}

#[tokio::test]
async fn test_fund_nonexistent_pool_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;

    let result =
        fund_app_pool(&contract, &user, "nonexistent.near", NearToken::from_near(1)).await?;
    assert!(
        result.into_result().is_err(),
        "Cannot fund nonexistent pool"
    );

    Ok(())
}

// =============================================================================
// WithdrawAppPool
// =============================================================================

#[tokio::test]
async fn test_withdraw_app_pool() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();

    register_app(&contract, &app_owner, &app_id, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    fund_app_pool(&contract, &app_owner, &app_id, NearToken::from_near(2))
        .await?
        .into_result()?;

    let pool_before = get_app_pool(&contract, &app_id).await?.unwrap();
    let balance_before: u128 = pool_before.balance.parse().unwrap();

    // Withdraw 1 NEAR
    let one_near = "1000000000000000000000000";
    withdraw_app_pool(&contract, &app_owner, &app_id, one_near, ONE_YOCTO)
        .await?
        .into_result()?;

    let pool_after = get_app_pool(&contract, &app_id).await?.unwrap();
    let balance_after: u128 = pool_after.balance.parse().unwrap();
    let one_near_val: u128 = one_near.parse().unwrap();

    assert_eq!(
        balance_before - balance_after,
        one_near_val,
        "Should have withdrawn exactly 1 NEAR"
    );

    Ok(())
}

#[tokio::test]
async fn test_withdraw_app_pool_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();

    register_app(&contract, &app_owner, &app_id, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    fund_app_pool(&contract, &app_owner, &app_id, NearToken::from_near(1))
        .await?
        .into_result()?;

    let result = withdraw_app_pool(
        &contract,
        &stranger,
        &app_id,
        "500000000000000000000000",
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner cannot withdraw"
    );

    Ok(())
}

#[tokio::test]
async fn test_withdraw_app_pool_exceeds_balance_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();

    register_app(&contract, &app_owner, &app_id, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    fund_app_pool(&contract, &app_owner, &app_id, NearToken::from_near(1))
        .await?
        .into_result()?;

    // Try to withdraw 10 NEAR from a ~1 NEAR pool
    let result = withdraw_app_pool(
        &contract,
        &app_owner,
        &app_id,
        "10000000000000000000000000",
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Cannot withdraw more than balance"
    );

    Ok(())
}

// =============================================================================
// SetAppConfig
// =============================================================================

#[tokio::test]
async fn test_set_app_config() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();

    register_app(&contract, &app_owner, &app_id, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    set_app_config(
        &contract,
        &app_owner,
        &app_id,
        json!({
            "metadata": "{\"name\": \"My App\"}",
            "curated": true,
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let pool = get_app_pool(&contract, &app_id).await?.unwrap();
    assert!(pool.curated, "Pool should be curated after config update");

    Ok(())
}

// =============================================================================
// TransferAppOwnership
// =============================================================================

#[tokio::test]
async fn test_transfer_app_ownership() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;
    let new_owner = user_with_storage(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();

    register_app(&contract, &app_owner, &app_id, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    transfer_app_ownership(
        &contract,
        &app_owner,
        &app_id,
        &new_owner.id().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let pool = get_app_pool(&contract, &app_id).await?.unwrap();
    assert_eq!(pool.owner_id, new_owner.id().to_string());

    // Old owner should no longer be able to configure
    let result = set_app_config(
        &contract,
        &app_owner,
        &app_id,
        json!({"curated": true}),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Old owner cannot configure after transfer"
    );

    Ok(())
}

// =============================================================================
// Fee Config View
// =============================================================================

#[tokio::test]
async fn test_fee_config_view() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let config = get_fee_config(&contract).await?;
    assert!(
        config.total_fee_bps > 0,
        "Total fee bps should be set"
    );
    assert!(
        config.total_fee_bps <= 10000,
        "Total fee bps should be <= 100%"
    );

    Ok(())
}
