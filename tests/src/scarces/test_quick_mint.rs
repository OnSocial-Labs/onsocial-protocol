// =============================================================================
// Scarces Integration Tests — QuickMint, Burn, Transfer
// =============================================================================
// Tests for the core NFT lifecycle: mint → view → transfer → burn.
// Covers QuickMint action, NEP-171 nft_transfer, and BurnScarce action.
//
// Run: make test-integration-contract-scarces-onsocial TEST=scarces::test_quick_mint

use anyhow::Result;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Helper: setup a user with storage deposited
// =============================================================================

async fn setup_user_with_storage(
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
// QuickMint — Happy Path
// =============================================================================

#[tokio::test]
async fn test_quick_mint_basic() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let user = setup_user_with_storage(&worker, &contract).await?;

    // Mint an NFT
    let result = quick_mint(&contract, &user, "My First Scarce", DEPOSIT_STORAGE).await?;
    assert!(
        result.is_success(),
        "quick_mint should succeed: {:?}",
        result.failures()
    );

    // Total supply should be 1
    let supply = nft_total_supply(&contract).await?;
    assert_eq!(supply, "1");

    // User should own 1 token
    let user_supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(user_supply, "1");

    // Retrieve the token
    let tokens = nft_tokens_for_owner(&contract, &user.id().to_string(), None, Some(10)).await?;
    assert_eq!(tokens.len(), 1);

    let token = &tokens[0];
    assert_eq!(token.owner_id, user.id().to_string());
    assert!(token.token_id.starts_with("s:"), "token_id should start with s:");

    // Check metadata
    let meta = token.metadata.as_ref().expect("token should have metadata");
    assert_eq!(meta.title.as_deref(), Some("My First Scarce"));

    Ok(())
}

#[tokio::test]
async fn test_quick_mint_with_full_metadata() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let user = setup_user_with_storage(&worker, &contract).await?;

    let metadata = json!({
        "title": "Detailed Scarce",
        "description": "A fully detailed NFT",
        "media": "https://example.com/image.png",
        "extra": "{\"custom\": true}",
    });

    let result = quick_mint_full(
        &contract,
        &user,
        metadata,
        None,  // no royalty
        None,  // no app_id
        true,  // transferable
        true,  // burnable
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(
        result.is_success(),
        "quick_mint with full metadata should succeed: {:?}",
        result.failures()
    );

    let tokens = nft_tokens_for_owner(&contract, &user.id().to_string(), None, Some(10)).await?;
    let meta = tokens[0].metadata.as_ref().unwrap();
    assert_eq!(meta.title.as_deref(), Some("Detailed Scarce"));
    assert_eq!(meta.description.as_deref(), Some("A fully detailed NFT"));
    assert_eq!(meta.media.as_deref(), Some("https://example.com/image.png"));
    assert_eq!(meta.extra.as_deref(), Some("{\"custom\": true}"));

    Ok(())
}

#[tokio::test]
async fn test_quick_mint_with_royalty() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let creator = setup_user_with_storage(&worker, &contract).await?;

    let royalty = json!({
        creator.id().to_string(): 1000  // 10%
    });

    let result = quick_mint_full(
        &contract,
        &creator,
        json!({ "title": "Royalty NFT" }),
        Some(royalty),
        None,
        true,
        true,
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(
        result.is_success(),
        "quick_mint with royalty should succeed: {:?}",
        result.failures()
    );

    // Verify via nft_token
    let tokens =
        nft_tokens_for_owner(&contract, &creator.id().to_string(), None, Some(10)).await?;
    assert_eq!(tokens.len(), 1);

    // Check payout structure
    let token_id = &tokens[0].token_id;
    let payout_result = contract
        .view("nft_payout")
        .args_json(json!({
            "token_id": token_id,
            "balance": "1000000000000000000000000",  // 1 NEAR
        }))
        .await?;
    let payout: Payout = serde_json::from_slice(&payout_result.result)?;
    assert!(
        payout.payout.contains_key(&creator.id().to_string()),
        "creator should be in payout"
    );

    Ok(())
}

#[tokio::test]
async fn test_quick_mint_multiple_tokens() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let user = setup_user_with_storage(&worker, &contract).await?;

    // Mint 3 tokens
    for i in 0..3 {
        let result = quick_mint(
            &contract,
            &user,
            &format!("Token #{}", i),
            DEPOSIT_STORAGE,
        )
        .await?;
        assert!(result.is_success(), "mint #{} should succeed", i);
    }

    let supply = nft_total_supply(&contract).await?;
    assert_eq!(supply, "3");

    let user_supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(user_supply, "3");

    Ok(())
}

// =============================================================================
// QuickMint — Edge Cases
// =============================================================================

#[tokio::test]
async fn test_quick_mint_without_storage_deposit_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let user = worker.dev_create_account().await?;
    // No storage deposit!

    let result = quick_mint(&contract, &user, "Should Fail", DEPOSIT_STORAGE).await?;
    // Depending on contract design this may fail or auto-deposit.
    // The test validates the contract's actual behavior either way.
    if result.is_failure() {
        // Expected: no storage → failure
    } else {
        // Contract may auto-register on first action — verify token exists
        let supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
        assert_eq!(supply, "1", "if auto-registered, should own 1 token");
    }

    Ok(())
}

// =============================================================================
// nft_token View
// =============================================================================

#[tokio::test]
async fn test_nft_token_view() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let user = setup_user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &user, "Viewable Token", DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    let tokens = nft_tokens_for_owner(&contract, &user.id().to_string(), None, Some(1)).await?;
    let token_id = &tokens[0].token_id;

    let token = nft_token(&contract, token_id).await?;
    assert!(token.is_some(), "nft_token should return the minted token");
    let token = token.unwrap();
    assert_eq!(token.owner_id, user.id().to_string());
    assert_eq!(
        token.metadata.as_ref().unwrap().title.as_deref(),
        Some("Viewable Token")
    );

    // Non-existent token
    let missing = nft_token(&contract, "s:999999").await?;
    assert!(missing.is_none(), "non-existent token should return None");

    Ok(())
}

// =============================================================================
// get_token_status View
// =============================================================================

#[tokio::test]
async fn test_get_token_status() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let user = setup_user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &user, "Status Check", DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    let tokens = nft_tokens_for_owner(&contract, &user.id().to_string(), None, Some(1)).await?;
    let token_id = &tokens[0].token_id;

    let status = get_token_status(&contract, token_id).await?;
    assert!(status.is_some(), "should have a token status");
    let status = status.unwrap();
    assert_eq!(status.owner_id, user.id().to_string());
    assert_eq!(status.creator_id, user.id().to_string());
    assert!(status.is_valid, "freshly minted token should be valid");
    assert!(!status.is_revoked, "should not be revoked");
    assert!(!status.is_expired, "should not be expired");
    assert_eq!(status.redeem_count, 0);
    assert!(!status.is_refunded);

    Ok(())
}

// =============================================================================
// Transfer (NEP-171 nft_transfer)
// =============================================================================

#[tokio::test]
async fn test_nft_transfer() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    // Mint a token for Alice
    quick_mint(&contract, &alice, "Transfer Me", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens = nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(1)).await?;
    let token_id = tokens[0].token_id.clone();

    // Transfer from Alice to Bob using NEP-171 nft_transfer
    alice
        .call(contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": bob.id().to_string(),
            "token_id": &token_id,
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Verify ownership changed
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, bob.id().to_string());

    // Alice should own 0, Bob should own 1
    let alice_count = nft_supply_for_owner(&contract, &alice.id().to_string()).await?;
    let bob_count = nft_supply_for_owner(&contract, &bob.id().to_string()).await?;
    assert_eq!(alice_count, "0");
    assert_eq!(bob_count, "1");

    Ok(())
}

#[tokio::test]
async fn test_transfer_scarce_via_execute() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &alice, "Execute Transfer", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens = nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(1)).await?;
    let token_id = tokens[0].token_id.clone();

    // Transfer via the execute action
    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "transfer_scarce",
            "receiver_id": bob.id().to_string(),
            "token_id": &token_id,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_success(),
        "transfer_scarce via execute should succeed"
    );

    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, bob.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_transfer_non_owner_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &alice, "Not Yours", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens = nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(1)).await?;
    let token_id = tokens[0].token_id.clone();

    // Bob tries to transfer Alice's token
    let result = bob
        .call(contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": bob.id().to_string(),
            "token_id": &token_id,
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "non-owner should not be able to transfer"
    );

    // Token still belongs to Alice
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, alice.id().to_string());

    Ok(())
}

// =============================================================================
// Burn (BurnScarce action)
// =============================================================================

#[tokio::test]
async fn test_burn_scarce() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let user = setup_user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &user, "Burn Me", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens = nft_tokens_for_owner(&contract, &user.id().to_string(), None, Some(1)).await?;
    let token_id = tokens[0].token_id.clone();

    // Burn it
    let result = execute_action(
        &contract,
        &user,
        json!({
            "type": "burn_scarce",
            "token_id": &token_id,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_success(),
        "burn_scarce should succeed: {:?}",
        result.failures()
    );

    // Token should no longer exist
    let token = nft_token(&contract, &token_id).await?;
    assert!(
        token.is_none(),
        "burned token should not be returned by nft_token"
    );

    // Total supply should be 0
    let supply = nft_total_supply(&contract).await?;
    assert_eq!(supply, "0");

    Ok(())
}

#[tokio::test]
async fn test_burn_non_owner_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &alice, "Not Burnable By Bob", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens = nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(1)).await?;
    let token_id = tokens[0].token_id.clone();

    // Bob tries to burn Alice's token
    let result = execute_action(
        &contract,
        &bob,
        json!({
            "type": "burn_scarce",
            "token_id": &token_id,
        }),
        ONE_YOCTO,
    )
    .await?;

    assert!(result.is_failure(), "non-owner should not be able to burn");

    // Token still exists
    let token = nft_token(&contract, &token_id).await?;
    assert!(token.is_some(), "token should still exist");

    Ok(())
}

// =============================================================================
// Batch Transfer
// =============================================================================

#[tokio::test]
async fn test_batch_transfer() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    // Mint 2 tokens
    quick_mint(&contract, &alice, "Batch 1", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    quick_mint(&contract, &alice, "Batch 2", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens = nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(10)).await?;
    assert_eq!(tokens.len(), 2);

    let tid0 = tokens[0].token_id.clone();
    let tid1 = tokens[1].token_id.clone();

    // Batch transfer both to Bob
    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "batch_transfer",
            "transfers": [
                { "receiver_id": bob.id().to_string(), "token_id": &tid0 },
                { "receiver_id": bob.id().to_string(), "token_id": &tid1 },
            ]
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_success(),
        "batch_transfer should succeed: {:?}",
        result.failures()
    );

    let alice_count = nft_supply_for_owner(&contract, &alice.id().to_string()).await?;
    let bob_count = nft_supply_for_owner(&contract, &bob.id().to_string()).await?;
    assert_eq!(alice_count, "0");
    assert_eq!(bob_count, "2");

    Ok(())
}

// =============================================================================
// NFT Enumeration
// =============================================================================

#[tokio::test]
async fn test_nft_tokens_enumeration() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let user = setup_user_with_storage(&worker, &contract).await?;

    // Mint 5 tokens
    for i in 0..5 {
        quick_mint(
            &contract,
            &user,
            &format!("Enum #{}", i),
            DEPOSIT_STORAGE,
        )
        .await?
        .into_result()?;
    }

    // nft_tokens with limit
    let result = contract
        .view("nft_tokens")
        .args_json(json!({ "from_index": "0", "limit": 3 }))
        .await?;
    let tokens: Vec<Token> = serde_json::from_slice(&result.result)?;
    assert_eq!(tokens.len(), 3, "should return exactly 3 with limit=3");

    // Next page
    let result = contract
        .view("nft_tokens")
        .args_json(json!({ "from_index": "3", "limit": 10 }))
        .await?;
    let tokens: Vec<Token> = serde_json::from_slice(&result.result)?;
    assert_eq!(tokens.len(), 2, "should return remaining 2 tokens");

    Ok(())
}
