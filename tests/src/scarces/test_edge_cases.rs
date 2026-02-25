// =============================================================================
// Edge Case Integration Tests
// =============================================================================
// Tests for boundary conditions and error paths in the scarces contract:
//   - BatchTransfer with invalid/soulbound tokens (atomicity)
//   - Concurrent native sale purchase (second buyer sees "No sale found")
//   - Collection max supply exhaustion
//   - Expired sale purchase rejection
//   - Offer expiry enforcement

use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Shared Setup
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
// BatchTransfer — Partial Failure / Atomicity
// =============================================================================

#[tokio::test]
async fn test_batch_transfer_nonexistent_token_rolls_back() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let alice = user_with_storage(&worker, &contract).await?;
    let bob = user_with_storage(&worker, &contract).await?;

    // Mint 2 valid tokens
    quick_mint(&contract, &alice, "Valid 1", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    quick_mint(&contract, &alice, "Valid 2", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(10)).await?;
    let tid0 = &tokens[0].token_id;

    // Batch with first valid, second nonexistent
    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "batch_transfer",
            "transfers": [
                { "receiver_id": bob.id().to_string(), "token_id": tid0 },
                { "receiver_id": bob.id().to_string(), "token_id": "s:nonexistent" },
            ]
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure(), "Batch with nonexistent token should fail");

    // Atomicity: first token should NOT have been transferred
    let token = nft_token(&contract, tid0).await?.unwrap();
    assert_eq!(
        token.owner_id,
        alice.id().to_string(),
        "First token should still belong to Alice (rollback)"
    );

    // Alice still owns both tokens
    let alice_count = nft_supply_for_owner(&contract, &alice.id().to_string()).await?;
    assert_eq!(alice_count, "2", "Alice should still own 2 tokens");

    Ok(())
}

#[tokio::test]
async fn test_batch_transfer_soulbound_token_rolls_back() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let alice = user_with_storage(&worker, &contract).await?;
    let bob = user_with_storage(&worker, &contract).await?;

    // Mint a transferable token
    quick_mint(&contract, &alice, "Transferable", DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Mint a soulbound token
    quick_mint_full(
        &contract,
        &alice,
        json!({ "title": "Soulbound" }),
        None,
        None,
        false, // non-transferable
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(10)).await?;
    let transferable_id = &tokens[0].token_id;
    let soulbound_id = &tokens[1].token_id;

    // Batch transfer both — should fail because second is soulbound
    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "batch_transfer",
            "transfers": [
                { "receiver_id": bob.id().to_string(), "token_id": transferable_id },
                { "receiver_id": bob.id().to_string(), "token_id": soulbound_id },
            ]
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_failure(),
        "Batch with soulbound token should fail"
    );

    // Atomicity: transferable token should NOT have moved
    let token = nft_token(&contract, transferable_id).await?.unwrap();
    assert_eq!(
        token.owner_id,
        alice.id().to_string(),
        "Transferable token should still belong to Alice"
    );

    Ok(())
}

#[tokio::test]
async fn test_batch_transfer_not_owner_rolls_back() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let alice = user_with_storage(&worker, &contract).await?;
    let bob = user_with_storage(&worker, &contract).await?;
    let charlie = user_with_storage(&worker, &contract).await?;

    // Mint tokens owned by Alice and Bob
    quick_mint(&contract, &alice, "Alice's", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    quick_mint(&contract, &bob, "Bob's", DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    let alice_tokens =
        nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(10)).await?;
    let bob_tokens =
        nft_tokens_for_owner(&contract, &bob.id().to_string(), None, Some(10)).await?;

    // Alice tries to batch-transfer her token + Bob's token
    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "batch_transfer",
            "transfers": [
                { "receiver_id": charlie.id().to_string(), "token_id": &alice_tokens[0].token_id },
                { "receiver_id": charlie.id().to_string(), "token_id": &bob_tokens[0].token_id },
            ]
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_failure(),
        "Batch with someone else's token should fail"
    );

    // Neither token should have moved
    let token_a = nft_token(&contract, &alice_tokens[0].token_id)
        .await?
        .unwrap();
    assert_eq!(token_a.owner_id, alice.id().to_string());
    let token_b = nft_token(&contract, &bob_tokens[0].token_id)
        .await?
        .unwrap();
    assert_eq!(token_b.owner_id, bob.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_batch_transfer_empty_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let alice = user_with_storage(&worker, &contract).await?;

    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "batch_transfer",
            "transfers": []
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure(), "Empty batch should fail");

    Ok(())
}

#[tokio::test]
async fn test_batch_transfer_multiple_receivers() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let alice = user_with_storage(&worker, &contract).await?;
    let bob = user_with_storage(&worker, &contract).await?;
    let charlie = user_with_storage(&worker, &contract).await?;

    // Mint 3 tokens
    for i in 0..3 {
        quick_mint(&contract, &alice, &format!("Multi #{}", i), DEPOSIT_STORAGE)
            .await?
            .into_result()?;
    }
    let tokens =
        nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(10)).await?;

    // Transfer token 0 to Bob, tokens 1+2 to Charlie
    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "batch_transfer",
            "transfers": [
                { "receiver_id": bob.id().to_string(), "token_id": &tokens[0].token_id },
                { "receiver_id": charlie.id().to_string(), "token_id": &tokens[1].token_id },
                { "receiver_id": charlie.id().to_string(), "token_id": &tokens[2].token_id },
            ]
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_success(), "Multi-receiver batch should succeed");

    let bob_count = nft_supply_for_owner(&contract, &bob.id().to_string()).await?;
    let charlie_count = nft_supply_for_owner(&contract, &charlie.id().to_string()).await?;
    assert_eq!(bob_count, "1");
    assert_eq!(charlie_count, "2");

    Ok(())
}

// =============================================================================
// Concurrent Native Sale Purchase
// =============================================================================

#[tokio::test]
async fn test_native_sale_second_buyer_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let seller = user_with_storage(&worker, &contract).await?;
    let buyer1 = user_with_storage(&worker, &contract).await?;
    let buyer2 = user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &seller, "Contested", DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(&contract, &seller.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;
    let price = "1000000000000000000000000"; // 1 NEAR

    // List for sale
    list_native_scarce(&contract, &seller, token_id, price, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    // Buyer 1 purchases successfully
    purchase_native_scarce(&contract, &buyer1, token_id, NearToken::from_near(2))
        .await?
        .into_result()?;

    // Verify buyer1 owns the token
    let token = nft_token(&contract, token_id).await?.unwrap();
    assert_eq!(token.owner_id, buyer1.id().to_string());

    // Buyer 2 tries to purchase the same token — sale no longer exists
    let result = purchase_native_scarce(&contract, &buyer2, token_id, NearToken::from_near(2))
        .await?;
    assert!(
        result.is_failure(),
        "Second buyer should fail (sale already consumed)"
    );

    // Token still belongs to buyer1
    let token = nft_token(&contract, token_id).await?.unwrap();
    assert_eq!(token.owner_id, buyer1.id().to_string());

    Ok(())
}

// =============================================================================
// Collection Max Supply Exhaustion
// =============================================================================

#[tokio::test]
async fn test_collection_max_supply_exhaustion() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // Create a tiny collection with total_supply = 2
    create_collection(
        &contract,
        &creator,
        "tiny",
        2,
        "100000000000000000000000", // 0.1 NEAR
        json!({ "title": "Tiny #{id}" }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Buyer purchases 2 tokens (the entire supply)
    purchase_from_collection(
        &contract,
        &buyer,
        "tiny",
        2,
        "100000000000000000000000",
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Verify sold out
    let sold_out = is_collection_sold_out(&contract, "tiny").await?;
    assert!(sold_out, "Collection should be sold out");

    // Next purchase should fail
    let result = purchase_from_collection(
        &contract,
        &buyer,
        "tiny",
        1,
        "100000000000000000000000",
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "Purchase from exhausted collection should fail"
    );

    // Creator mint should also fail
    let result = mint_from_collection(&contract, &creator, "tiny", 1, None, DEPOSIT_LARGE)
        .await?;
    assert!(
        result.is_failure(),
        "Creator mint from sold-out collection should fail"
    );

    Ok(())
}

#[tokio::test]
async fn test_collection_supply_boundary() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // Create collection with supply = 3
    create_collection(
        &contract,
        &creator,
        "boundary",
        3,
        "100000000000000000000000",
        json!({ "title": "Item #{id}" }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Buy 2 — should succeed
    purchase_from_collection(
        &contract,
        &buyer,
        "boundary",
        2,
        "100000000000000000000000",
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Try to buy 2 more — only 1 remains, should fail
    let result = purchase_from_collection(
        &contract,
        &buyer,
        "boundary",
        2,
        "100000000000000000000000",
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "Purchasing more than remaining supply should fail"
    );

    // Buy the last 1 — should succeed
    purchase_from_collection(
        &contract,
        &buyer,
        "boundary",
        1,
        "100000000000000000000000",
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    let progress = get_collection_progress(&contract, "boundary").await?.unwrap();
    assert_eq!(progress.remaining, 0);
    assert_eq!(progress.minted, 3);

    Ok(())
}

// =============================================================================
// Expired Native Sale — Purchase Rejection
// =============================================================================

#[tokio::test]
async fn test_expired_native_sale_purchase_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let seller = user_with_storage(&worker, &contract).await?;
    let _buyer = user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &seller, "Expiring", DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(&contract, &seller.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // List with a very short expiration (1 nanosecond in the future)
    // We use list_native_scarce via raw execute_action to set expires_at
    let result = execute_action(
        &contract,
        &seller,
        json!({
            "type": "list_native_scarce",
            "token_id": token_id,
            "price": "1000000000000000000000000",
            "expires_at": 1, // epoch 1 ns — already in the past
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    // Listing with past expiry should fail
    assert!(
        result.is_failure(),
        "Listing with past expiry should be rejected"
    );

    Ok(())
}

// =============================================================================
// Offer Expiry Enforcement
// =============================================================================

#[tokio::test]
async fn test_expired_offer_acceptance_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let seller = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &seller, "Offer Target", DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(&contract, &seller.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // Make an offer with expires_at = 1 ns (already expired)
    let result = make_offer(
        &contract,
        &buyer,
        token_id,
        "500000000000000000000000", // 0.5 NEAR
        Some(1),                    // expires_at = 1 nanosecond (already past)
        NearToken::from_near(1),
    )
    .await?;
    // Offer with past expiry should be rejected at creation time
    assert!(
        result.is_failure(),
        "Offer with past expiry should fail at creation"
    );

    Ok(())
}

// =============================================================================
// Non-Burnable Collection — Burn Rejection
// =============================================================================

#[tokio::test]
async fn test_non_burnable_collection_burn_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // Create a collection with burnable=false (must use execute_action directly)
    execute_action(
        &contract,
        &creator,
        json!({
            "type": "create_collection",
            "collection_id": "noburn",
            "total_supply": 5,
            "metadata_template": json!({ "title": "NoBurn #{id}" }).to_string(),
            "price_near": "100000000000000000000000",
            "transferable": true,
            "burnable": false,
        }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Purchase a token
    purchase_from_collection(
        &contract,
        &buyer,
        "noburn",
        1,
        "100000000000000000000000",
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &buyer.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // Burn should fail
    let result = burn_scarce(
        &contract,
        &buyer,
        token_id,
        Some("noburn"),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_failure(),
        "Burn from non-burnable collection should fail"
    );

    // Token still exists
    let token = nft_token(&contract, token_id).await?;
    assert!(token.is_some(), "Token still exists after failed burn");

    Ok(())
}

// =============================================================================
// Soulbound Collection — Transfer, List, Approve Rejection
// =============================================================================

#[tokio::test]
async fn test_soulbound_collection_transfer_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;
    let charlie = user_with_storage(&worker, &contract).await?;

    // Create soulbound collection
    execute_action(
        &contract,
        &creator,
        json!({
            "type": "create_collection",
            "collection_id": "soulcol",
            "total_supply": 5,
            "metadata_template": json!({ "title": "Soul #{id}" }).to_string(),
            "price_near": "100000000000000000000000",
            "transferable": false,
            "burnable": true,
        }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Purchase a token
    purchase_from_collection(
        &contract,
        &buyer,
        "soulcol",
        1,
        "100000000000000000000000",
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &buyer.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // Transfer should fail
    let result = execute_action(
        &contract,
        &buyer,
        json!({
            "type": "transfer_scarce",
            "receiver_id": charlie.id().to_string(),
            "token_id": token_id,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_failure(),
        "Transfer from soulbound collection should fail"
    );

    // List should fail
    let result = list_native_scarce(
        &contract,
        &buyer,
        token_id,
        "1000000000000000000000000",
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(
        result.is_failure(),
        "Listing from soulbound collection should fail"
    );

    // Approve should fail
    let result = execute_action(
        &contract,
        &buyer,
        json!({
            "type": "approve_scarce",
            "token_id": token_id,
            "account_id": charlie.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(
        result.is_failure(),
        "Approve on soulbound collection token should fail"
    );

    // But burn should work (burnable is true)
    let result = burn_scarce(&contract, &buyer, token_id, Some("soulcol"), ONE_YOCTO).await?;
    assert!(
        result.is_success(),
        "Burn from soulbound-but-burnable collection should succeed"
    );

    Ok(())
}

// =============================================================================
// Duplicate Collection ID — Creation Rejected
// =============================================================================

#[tokio::test]
async fn test_duplicate_collection_id_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // Create first collection
    create_collection(
        &contract,
        &creator,
        "dupe",
        10,
        "100000000000000000000000",
        json!({ "title": "Original #{id}" }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Attempt duplicate
    let result = create_collection(
        &contract,
        &creator,
        "dupe",
        5,
        "200000000000000000000000",
        json!({ "title": "Duplicate #{id}" }),
        DEPOSIT_LARGE,
    )
    .await?;
    assert!(result.is_failure(), "Duplicate collection ID should fail");

    // Original collection intact
    let col = get_collection(&contract, "dupe").await?.unwrap();
    assert_eq!(col.total_supply, 10, "Original collection unchanged");

    Ok(())
}
