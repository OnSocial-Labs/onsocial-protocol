// =============================================================================
// Collection CRUD Integration Tests
// =============================================================================
// Tests for CreateCollection, MintFromCollection, AirdropFromCollection,
// PurchaseFromCollection, UpdateCollectionPrice, UpdateCollectionTiming,
// PauseCollection, ResumeCollection, DeleteCollection, SetAllowlist,
// RemoveFromAllowlist, SetCollectionMetadata.

use anyhow::Result;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Shared setup: owner + contract + storage-ready user
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

/// Create an account and give it storage.
async fn user_with_storage(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<near_workspaces::Account> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE).await?.into_result()?;
    Ok(user)
}

/// Default metadata JSON template for collections.
fn default_metadata() -> serde_json::Value {
    json!({
        "title": "Test Item",
        "description": "A test collection item"
    })
}

// =============================================================================
// CreateCollection — Happy Path
// =============================================================================

#[tokio::test]
async fn test_create_collection_basic() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "mycol",
        100,
        "1000000000000000000000000", // 1 NEAR
        default_metadata(),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Verify via view
    let col = get_collection(&contract, "mycol").await?;
    assert!(col.is_some(), "collection should exist");
    let col = col.unwrap();
    assert_eq!(col.collection_id, "mycol");
    assert_eq!(col.total_supply, 100);
    assert_eq!(col.minted_count, 0);
    assert_eq!(col.creator_id, creator.id().to_string());
    assert!(!col.paused);
    assert!(!col.cancelled);

    // Total collections should be 1
    let count = get_total_collections(&contract).await?;
    assert_eq!(count, 1);

    Ok(())
}

#[tokio::test]
async fn test_create_collection_duplicate_id_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "dup", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    // Same ID again should fail
    let result = create_collection(
        &contract, &creator, "dup", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?;
    assert!(result.is_failure(), "duplicate collection_id should fail");

    Ok(())
}

#[tokio::test]
async fn test_create_collection_invalid_id_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // ID with colon is invalid (reserved separator)
    let result = create_collection(
        &contract, &creator, "bad:id", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?;
    assert!(result.is_failure(), "collection_id with ':' should be rejected");

    // Reserved ID "s"
    let result = create_collection(
        &contract, &creator, "s", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?;
    assert!(result.is_failure(), "reserved collection_id 's' should be rejected");

    Ok(())
}

// =============================================================================
// MintFromCollection (creator mint)
// =============================================================================

#[tokio::test]
async fn test_mint_from_collection() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "mintcol", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    // Creator mints 3 to themselves
    mint_from_collection(&contract, &creator, "mintcol", 3, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Check progress
    let progress = get_collection_progress(&contract, "mintcol").await?;
    assert!(progress.is_some());
    let progress = progress.unwrap();
    assert_eq!(progress.minted, 3);
    assert_eq!(progress.remaining, 7);

    // Creator should own 3 tokens
    let supply = nft_supply_for_owner(&contract, &creator.id().to_string()).await?;
    assert_eq!(supply, "3");

    // Token IDs follow pattern collection_id:N
    let tokens = nft_tokens_for_owner(&contract, &creator.id().to_string(), None, Some(10)).await?;
    assert_eq!(tokens.len(), 3);
    assert!(tokens[0].token_id.starts_with("mintcol:"), "token should start with collection prefix");

    Ok(())
}

#[tokio::test]
async fn test_mint_from_collection_to_receiver() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let receiver = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "rcvcol", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    // Creator mints 2 to receiver
    mint_from_collection(
        &contract, &creator, "rcvcol", 2, Some(&receiver.id().to_string()), DEPOSIT_LARGE,
    ).await?.into_result()?;

    let receiver_supply = nft_supply_for_owner(&contract, &receiver.id().to_string()).await?;
    assert_eq!(receiver_supply, "2");

    let creator_supply = nft_supply_for_owner(&contract, &creator.id().to_string()).await?;
    assert_eq!(creator_supply, "0");

    Ok(())
}

#[tokio::test]
async fn test_mint_from_collection_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "authcol", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    // Stranger tries to creator-mint
    let result = mint_from_collection(&contract, &stranger, "authcol", 1, None, DEPOSIT_LARGE).await?;
    assert!(result.is_failure(), "non-creator should not be able to mint_from_collection");

    Ok(())
}

// =============================================================================
// AirdropFromCollection
// =============================================================================

#[tokio::test]
async fn test_airdrop_from_collection() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let alice = user_with_storage(&worker, &contract).await?;
    let bob = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "airdrop", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    airdrop_from_collection(
        &contract,
        &creator,
        "airdrop",
        vec![alice.id().to_string(), bob.id().to_string()],
        DEPOSIT_LARGE,
    ).await?.into_result()?;

    let alice_supply = nft_supply_for_owner(&contract, &alice.id().to_string()).await?;
    let bob_supply = nft_supply_for_owner(&contract, &bob.id().to_string()).await?;
    assert_eq!(alice_supply, "1");
    assert_eq!(bob_supply, "1");

    let progress = get_collection_progress(&contract, "airdrop").await?.unwrap();
    assert_eq!(progress.minted, 2);

    Ok(())
}

// =============================================================================
// PurchaseFromCollection
// =============================================================================

#[tokio::test]
async fn test_purchase_from_collection() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    let price = "1000000000000000000000000"; // 1 NEAR
    create_collection(
        &contract, &creator, "buycol", 10, price, default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    // Buyer purchases 2 items
    purchase_from_collection(
        &contract,
        &buyer,
        "buycol",
        2,
        price,
        near_workspaces::types::NearToken::from_near(3), // overpay slightly for fees
    ).await?.into_result()?;

    let buyer_supply = nft_supply_for_owner(&contract, &buyer.id().to_string()).await?;
    assert_eq!(buyer_supply, "2");

    let progress = get_collection_progress(&contract, "buycol").await?.unwrap();
    assert_eq!(progress.minted, 2);

    Ok(())
}

#[tokio::test]
async fn test_purchase_from_collection_insufficient_deposit_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    let price = "1000000000000000000000000"; // 1 NEAR
    create_collection(
        &contract, &creator, "expcol", 10, price, default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    // Buyer sends less than price
    let result = purchase_from_collection(
        &contract, &buyer, "expcol", 1, price, ONE_YOCTO,
    ).await?;
    assert!(result.is_failure(), "insufficient deposit should fail");

    Ok(())
}

// =============================================================================
// UpdateCollectionPrice
// =============================================================================

#[tokio::test]
async fn test_update_collection_price() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "pricecol", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    let new_price = "2000000000000000000000000"; // 2 NEAR
    execute_action(
        &contract,
        &creator,
        json!({
            "type": "update_collection_price",
            "collection_id": "pricecol",
            "new_price_near": new_price,
        }),
        ONE_YOCTO,
    ).await?.into_result()?;

    let col = get_collection(&contract, "pricecol").await?.unwrap();
    assert_eq!(col.price_near, new_price);

    Ok(())
}

// =============================================================================
// PauseCollection / ResumeCollection
// =============================================================================

#[tokio::test]
async fn test_pause_and_resume_collection() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "pausecol", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    // Pause
    execute_action(
        &contract, &creator,
        json!({ "type": "pause_collection", "collection_id": "pausecol" }),
        ONE_YOCTO,
    ).await?.into_result()?;

    let col = get_collection(&contract, "pausecol").await?.unwrap();
    assert!(col.paused, "should be paused");

    // Collection should not be mintable while paused
    let mintable = is_collection_mintable(&contract, "pausecol").await?;
    assert!(!mintable, "paused collection should not be mintable");

    // Resume
    execute_action(
        &contract, &creator,
        json!({ "type": "resume_collection", "collection_id": "pausecol" }),
        ONE_YOCTO,
    ).await?.into_result()?;

    let col = get_collection(&contract, "pausecol").await?.unwrap();
    assert!(!col.paused, "should be resumed");

    let mintable = is_collection_mintable(&contract, "pausecol").await?;
    assert!(mintable, "resumed collection should be mintable");

    Ok(())
}

#[tokio::test]
async fn test_pause_non_creator_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "authpause", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    let result = execute_action(
        &contract, &stranger,
        json!({ "type": "pause_collection", "collection_id": "authpause" }),
        ONE_YOCTO,
    ).await?;
    assert!(result.is_failure(), "non-creator should not pause collection");

    Ok(())
}

// =============================================================================
// DeleteCollection
// =============================================================================

#[tokio::test]
async fn test_delete_collection_unminted() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "delcol", 5,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    assert_eq!(get_total_collections(&contract).await?, 1);

    execute_action(
        &contract, &creator,
        json!({ "type": "delete_collection", "collection_id": "delcol" }),
        ONE_YOCTO,
    ).await?.into_result()?;

    let col = get_collection(&contract, "delcol").await?;
    assert!(col.is_none(), "deleted collection should not exist");
    assert_eq!(get_total_collections(&contract).await?, 0);

    Ok(())
}

#[tokio::test]
async fn test_delete_collection_with_minted_tokens_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "nomint", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    // Mint 1 token
    mint_from_collection(&contract, &creator, "nomint", 1, None, DEPOSIT_LARGE)
        .await?.into_result()?;

    // Try to delete
    let result = execute_action(
        &contract, &creator,
        json!({ "type": "delete_collection", "collection_id": "nomint" }),
        ONE_YOCTO,
    ).await?;
    assert!(result.is_failure(), "cannot delete collection with minted tokens");

    Ok(())
}

// =============================================================================
// SetCollectionMetadata
// =============================================================================

#[tokio::test]
async fn test_set_collection_metadata() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "metacol", 10,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    let metadata = json!({"display": "gallery", "theme": "dark"}).to_string();

    execute_action(
        &contract, &creator,
        json!({
            "type": "set_collection_metadata",
            "collection_id": "metacol",
            "metadata": metadata,
        }),
        ONE_YOCTO,
    ).await?.into_result()?;

    let col = get_collection(&contract, "metacol").await?.unwrap();
    assert_eq!(col.metadata.as_deref(), Some(metadata.as_str()));

    Ok(())
}

// =============================================================================
// Collection Views
// =============================================================================

#[tokio::test]
async fn test_collection_views() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract, &creator, "viewcol", 20,
        "1000000000000000000000000", default_metadata(), DEPOSIT_LARGE,
    ).await?.into_result()?;

    // Availability
    let avail = get_collection_availability(&contract, "viewcol").await?;
    assert_eq!(avail, 20);

    // Not sold out
    let sold_out = is_collection_sold_out(&contract, "viewcol").await?;
    assert!(!sold_out);

    // Mintable
    let mintable = is_collection_mintable(&contract, "viewcol").await?;
    assert!(mintable);

    // By creator
    let by_creator = get_collections_by_creator(&contract, &creator.id().to_string()).await?;
    assert_eq!(by_creator.len(), 1);
    assert_eq!(by_creator[0].collection_id, "viewcol");

    // Mint some, check availability changes
    mint_from_collection(&contract, &creator, "viewcol", 5, None, DEPOSIT_LARGE)
        .await?.into_result()?;

    let avail = get_collection_availability(&contract, "viewcol").await?;
    assert_eq!(avail, 15);

    Ok(())
}
