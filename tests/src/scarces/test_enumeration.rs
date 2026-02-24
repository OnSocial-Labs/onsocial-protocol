// =============================================================================
// Enumeration Integration Tests
// =============================================================================
// Tests for NEP-181 enumeration methods that are not already covered:
// nft_supply_for_collection, nft_tokens_for_collection (pagination),
// nft_tokens (global pagination).

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
// nft_supply_for_collection
// =============================================================================

#[tokio::test]
async fn test_nft_supply_for_collection_zero() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "enum-empty",
        10,
        "0",
        json!({"title": "Empty Col", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let supply = nft_supply_for_collection(&contract, "enum-empty").await?;
    assert_eq!(supply, "0", "No tokens minted yet");

    Ok(())
}

#[tokio::test]
async fn test_nft_supply_for_collection_after_mint() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "enum-mint",
        10,
        "0",
        json!({"title": "Mint Col", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(&contract, &creator, "enum-mint", 4, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let supply = nft_supply_for_collection(&contract, "enum-mint").await?;
    assert_eq!(supply, "4", "4 tokens minted");

    Ok(())
}

// =============================================================================
// nft_tokens_for_collection (pagination)
// =============================================================================

#[tokio::test]
async fn test_nft_tokens_for_collection_returns_tokens() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "enum-tcol",
        5,
        "0",
        json!({"title": "Token Col", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(&contract, &creator, "enum-tcol", 5, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let tokens = nft_tokens_for_collection(&contract, "enum-tcol", None, None).await?;
    assert_eq!(tokens.len(), 5);

    // Check that token IDs follow the pattern "{collection_id}:{serial}"
    for (i, token) in tokens.iter().enumerate() {
        assert!(
            token.token_id.starts_with("enum-tcol:"),
            "Token ID should start with collection prefix"
        );
        // Serial numbers are 1-based
        let expected_id = format!("enum-tcol:{}", i + 1);
        assert_eq!(token.token_id, expected_id);
    }

    Ok(())
}

#[tokio::test]
async fn test_nft_tokens_for_collection_pagination() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "enum-page",
        8,
        "0",
        json!({"title": "Page Col", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(&contract, &creator, "enum-page", 8, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // First page: tokens 0..3
    let page1 = nft_tokens_for_collection(&contract, "enum-page", Some("0"), Some(3)).await?;
    assert_eq!(page1.len(), 3);

    // Second page: tokens 3..6
    let page2 = nft_tokens_for_collection(&contract, "enum-page", Some("3"), Some(3)).await?;
    assert_eq!(page2.len(), 3);

    // Third page: tokens 6..8 (only 2 remaining)
    let page3 = nft_tokens_for_collection(&contract, "enum-page", Some("6"), Some(3)).await?;
    assert_eq!(page3.len(), 2);

    // Pages should not overlap
    let all_ids: Vec<String> = page1
        .iter()
        .chain(page2.iter())
        .chain(page3.iter())
        .map(|t| t.token_id.clone())
        .collect();
    let mut unique = all_ids.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(
        all_ids.len(),
        unique.len(),
        "All tokens should be unique across pages"
    );
    assert_eq!(all_ids.len(), 8);

    Ok(())
}

// =============================================================================
// nft_tokens (global pagination)
// =============================================================================

#[tokio::test]
async fn test_nft_tokens_global_empty() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;

    let tokens = nft_tokens(&contract, None, None).await?;
    assert_eq!(tokens.len(), 0, "No tokens on fresh contract");

    Ok(())
}

#[tokio::test]
async fn test_nft_tokens_global_pagination() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // Create 2 collections and mint from each
    create_collection(
        &contract,
        &creator,
        "glob-a",
        3,
        "0",
        json!({"title": "Glob A", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    create_collection(
        &contract,
        &creator,
        "glob-b",
        3,
        "0",
        json!({"title": "Glob B", "description": "Token"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(&contract, &creator, "glob-a", 3, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    mint_from_collection(&contract, &creator, "glob-b", 3, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Total supply = 6
    let all = nft_tokens(&contract, None, None).await?;
    assert_eq!(all.len(), 6, "6 total tokens across 2 collections");

    // Paginate: first 4
    let page1 = nft_tokens(&contract, Some("0"), Some(4)).await?;
    assert_eq!(page1.len(), 4);

    // Remaining 2
    let page2 = nft_tokens(&contract, Some("4"), Some(4)).await?;
    assert_eq!(page2.len(), 2);

    Ok(())
}
