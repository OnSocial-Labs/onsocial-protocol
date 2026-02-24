// =============================================================================
// Sale View Integration Tests
// =============================================================================
// Tests for previously untested sale view methods:
// get_sales, is_sale_expired, get_expired_sales, get_supply_by_scarce_contract_id.

use anyhow::Result;

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

// =============================================================================
// get_sales
// =============================================================================

#[tokio::test]
async fn test_get_sales_empty() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let sales = get_sales(&contract, None, None).await?;
    assert!(sales.is_empty());

    Ok(())
}

#[tokio::test]
async fn test_get_sales_returns_listed() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Sale Item").await?;

    // List for sale
    list_native_scarce(&contract, &seller, &token_id, "2000000000000000000000000", DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    let sales = get_sales(&contract, None, None).await?;
    assert_eq!(sales.len(), 1);

    Ok(())
}

#[tokio::test]
async fn test_get_sales_pagination() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;

    // Create and list 3 tokens
    for i in 0..3 {
        let (seller, token_id) =
            user_with_token(&worker, &contract, &format!("Paginated {}", i)).await?;
        list_native_scarce(&contract, &seller, &token_id, "1000000000000000000000000", DEPOSIT_STORAGE)
            .await?
            .into_result()?;
    }

    // Page 1: limit 2
    let page1 = get_sales(&contract, Some(0), Some(2)).await?;
    assert_eq!(page1.len(), 2);

    // Page 2: from_index 2, limit 2
    let page2 = get_sales(&contract, Some(2), Some(2)).await?;
    assert_eq!(page2.len(), 1);

    Ok(())
}

// =============================================================================
// get_supply_by_scarce_contract_id
// =============================================================================

#[tokio::test]
async fn test_get_supply_by_scarce_contract_id_zero() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let count = get_supply_by_scarce_contract_id(&contract, contract.id().as_str()).await?;
    assert_eq!(count, 0);

    Ok(())
}

#[tokio::test]
async fn test_get_supply_by_scarce_contract_id_after_listing() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Count Item").await?;

    list_native_scarce(&contract, &seller, &token_id, "1000000000000000000000000", DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    let count = get_supply_by_scarce_contract_id(&contract, contract.id().as_str()).await?;
    assert_eq!(count, 1);

    Ok(())
}

// =============================================================================
// is_sale_expired
// =============================================================================

#[tokio::test]
async fn test_is_sale_expired_none_for_missing() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let result = is_sale_expired(&contract, contract.id().as_str(), "nonexistent").await?;
    assert!(result.is_none());

    Ok(())
}

#[tokio::test]
async fn test_is_sale_expired_false_for_active() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Active Sale").await?;

    // List without expiry
    list_native_scarce(&contract, &seller, &token_id, "1000000000000000000000000", DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    let result = is_sale_expired(&contract, contract.id().as_str(), &token_id).await?;
    // No expiry set → should be Some(false)
    assert_eq!(result, Some(false));

    Ok(())
}

// =============================================================================
// get_expired_sales
// =============================================================================

#[tokio::test]
async fn test_get_expired_sales_empty() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let expired = get_expired_sales(&contract, None, None).await?;
    assert!(expired.is_empty());

    Ok(())
}

#[tokio::test]
async fn test_get_expired_sales_not_expired() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Not Expired").await?;

    // List without expiry
    list_native_scarce(&contract, &seller, &token_id, "1000000000000000000000000", DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    let expired = get_expired_sales(&contract, None, None).await?;
    assert!(expired.is_empty());

    Ok(())
}
