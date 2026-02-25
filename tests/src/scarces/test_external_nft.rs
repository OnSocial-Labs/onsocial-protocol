// =============================================================================
// External NFT Listing Integration Tests
// =============================================================================
// Tests for the cross-contract NFT listing flow:
//   nft_approve → nft_on_approve callback → sale creation → purchase → delist
//
// Uses TWO scarces contracts: one as an "external NFT source" and the other as
// the marketplace. This exercises the SaleType::External path end-to-end.

use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Shared Setup
// =============================================================================

/// Deploy two scarces contracts:
///   - `marketplace`: the marketplace being tested
///   - `nft_source`:  an independent NFT contract (same WASM, separate instance)
///
/// The marketplace owner allowlists `nft_source` via `add_approved_nft_contract`.
async fn setup_two_contracts() -> Result<(
    near_workspaces::Worker<near_workspaces::network::Sandbox>,
    near_workspaces::Account,
    near_workspaces::Contract, // marketplace
    near_workspaces::Contract, // nft_source
)> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let marketplace = deploy_scarces(&worker, &owner).await?;
    let nft_source = deploy_scarces(&worker, &owner).await?;

    // Allowlist the external NFT contract on the marketplace
    owner
        .call(marketplace.id(), "add_approved_nft_contract")
        .args_json(json!({ "nft_contract_id": nft_source.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    Ok((worker, owner, marketplace, nft_source))
}

/// Create a user with storage on BOTH contracts.
async fn user_with_dual_storage(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    marketplace: &near_workspaces::Contract,
    nft_source: &near_workspaces::Contract,
) -> Result<near_workspaces::Account> {
    let user = worker.dev_create_account().await?;
    storage_deposit(marketplace, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    storage_deposit(nft_source, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok(user)
}

/// Mint a transferable token on the external NFT contract and return its token_id.
async fn mint_external_token(
    nft_source: &near_workspaces::Contract,
    minter: &near_workspaces::Account,
    title: &str,
) -> Result<String> {
    quick_mint(nft_source, minter, title, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(nft_source, &minter.id().to_string(), None, Some(50)).await?;
    Ok(tokens.last().unwrap().token_id.clone())
}

/// Approve the marketplace on the external NFT and trigger listing via nft_on_approve.
/// Returns the execution result from nft_approve (which fires nft_on_approve as XCC).
async fn approve_and_list(
    nft_source: &near_workspaces::Contract,
    marketplace: &near_workspaces::Contract,
    seller: &near_workspaces::Account,
    token_id: &str,
    price_yocto: &str,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let result = seller
        .call(nft_source.id(), "nft_approve")
        .args_json(json!({
            "token_id": token_id,
            "account_id": marketplace.id().to_string(),
            "msg": json!({ "sale_conditions": price_yocto }).to_string(),
        }))
        .deposit(DEPOSIT_STORAGE)
        .max_gas()
        .transact()
        .await?;
    Ok(result)
}

/// View `get_sale` with an explicit external contract ID.
async fn get_external_sale(
    marketplace: &near_workspaces::Contract,
    nft_source: &near_workspaces::Contract,
    token_id: &str,
) -> Result<Option<Sale>> {
    let result = marketplace
        .view("get_sale")
        .args_json(json!({
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": token_id,
        }))
        .await?;
    let sale: Option<Sale> = serde_json::from_slice(&result.result)?;
    Ok(sale)
}

// =============================================================================
// nft_on_approve — Listing via Approval Callback
// =============================================================================

#[tokio::test]
async fn test_external_list_via_nft_approve() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;

    let token_id = mint_external_token(&nft_source, &alice, "External Art").await?;
    let price = "1000000000000000000000000"; // 1 NEAR

    let result = approve_and_list(&nft_source, &marketplace, &alice, &token_id, price).await?;
    assert!(result.is_success(), "nft_approve + nft_on_approve should succeed");

    // Sale should exist on the marketplace
    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_some(), "Sale should be created via nft_on_approve");
    let sale = sale.unwrap();
    assert_eq!(sale.owner_id, alice.id().to_string());
    assert_eq!(sale.sale_conditions, price);

    // Supply count should increase
    let supply = get_supply_sales(&marketplace).await?;
    assert!(supply >= 1, "At least one sale listed");

    Ok(())
}

#[tokio::test]
async fn test_external_list_not_allowlisted_no_sale() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let marketplace = deploy_scarces(&worker, &owner).await?;
    let nft_source = deploy_scarces(&worker, &owner).await?;
    // Intentionally NOT calling add_approved_nft_contract

    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Unlisted Art").await?;

    let result = approve_and_list(
        &nft_source,
        &marketplace,
        &alice,
        &token_id,
        "1000000000000000000000000",
    )
    .await?;
    // Approval succeeds (the NFT contract grants approval) but marketplace only acknowledges
    assert!(result.is_success(), "nft_approve itself should succeed");

    // No sale should be created since the contract is not allowlisted
    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_none(), "No sale for non-allowlisted NFT contract");

    Ok(())
}

#[tokio::test]
async fn test_external_list_zero_price_fails() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Zero Price").await?;

    let result = approve_and_list(&nft_source, &marketplace, &alice, &token_id, "0").await?;
    // nft_on_approve returns error for zero price
    assert!(result.is_failure(), "Zero price listing should fail");

    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_none(), "No sale created for zero price");

    Ok(())
}

#[tokio::test]
async fn test_external_list_duplicate_returns_existing() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Dup Art").await?;
    let price = "1000000000000000000000000";

    // First listing
    approve_and_list(&nft_source, &marketplace, &alice, &token_id, price)
        .await?
        .into_result()?;

    // Second listing attempt — should succeed but not create a duplicate
    let result = approve_and_list(&nft_source, &marketplace, &alice, &token_id, "2000000000000000000000000").await?;
    assert!(result.is_success(), "Duplicate listing returns existing");

    // Price should still be the original
    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert_eq!(
        sale.unwrap().sale_conditions, price,
        "Original price unchanged"
    );

    Ok(())
}

// =============================================================================
// list_scarce_for_sale — Direct Listing (verifies approval on-chain)
// =============================================================================

#[tokio::test]
async fn test_external_list_via_direct_call() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Direct List").await?;

    // First approve the marketplace on the NFT source (no msg → no callback listing)
    alice
        .call(nft_source.id(), "nft_approve")
        .args_json(json!({
            "token_id": &token_id,
            "account_id": marketplace.id().to_string(),
        }))
        .deposit(DEPOSIT_STORAGE)
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Now list via `list_scarce_for_sale` on the marketplace directly
    let price = "500000000000000000000000"; // 0.5 NEAR
    let result = alice
        .call(marketplace.id(), "list_scarce_for_sale")
        .args_json(json!({
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": &token_id,
            "approval_id": 0,
            "sale_conditions": price,
        }))
        .deposit(DEPOSIT_STORAGE)
        .max_gas()
        .transact()
        .await?;
    assert!(result.is_success(), "list_scarce_for_sale should succeed");

    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_some(), "Sale should exist after direct listing");
    assert_eq!(sale.unwrap().sale_conditions, price);

    Ok(())
}

// =============================================================================
// DelistScarce — Removing an External Listing
// =============================================================================

#[tokio::test]
async fn test_external_delist() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Delist Me").await?;
    let price = "1000000000000000000000000";

    approve_and_list(&nft_source, &marketplace, &alice, &token_id, price)
        .await?
        .into_result()?;

    // Delist
    let result = execute_action(
        &marketplace,
        &alice,
        json!({
            "type": "delist_scarce",
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": &token_id,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_success(), "Delist should succeed");

    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_none(), "Sale removed after delist");

    Ok(())
}

#[tokio::test]
async fn test_external_delist_wrong_owner_fails() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let bob = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Not Yours").await?;

    approve_and_list(
        &nft_source,
        &marketplace,
        &alice,
        &token_id,
        "1000000000000000000000000",
    )
    .await?
    .into_result()?;

    // Bob tries to delist Alice's listing
    let result = execute_action(
        &marketplace,
        &bob,
        json!({
            "type": "delist_scarce",
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": &token_id,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure(), "Non-owner cannot delist");

    // Sale still exists
    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_some(), "Sale remains after unauthorized delist attempt");

    Ok(())
}

#[tokio::test]
async fn test_external_delist_nonexistent_fails() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;

    let result = execute_action(
        &marketplace,
        &alice,
        json!({
            "type": "delist_scarce",
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": "nonexistent",
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure(), "Cannot delist nonexistent sale");

    Ok(())
}

// =============================================================================
// Purchase — Buying an External NFT Listing
// =============================================================================

#[tokio::test]
async fn test_external_purchase_transfers_token() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let bob = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Buy Me").await?;
    let price = "1000000000000000000000000"; // 1 NEAR

    approve_and_list(&nft_source, &marketplace, &alice, &token_id, price)
        .await?
        .into_result()?;

    // Bob purchases via `offer`
    let result = bob
        .call(marketplace.id(), "offer")
        .args_json(json!({
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": &token_id,
        }))
        .deposit(NearToken::from_near(2)) // overpay to cover price + gas
        .max_gas()
        .transact()
        .await?;
    assert!(result.is_success(), "Purchase should succeed");

    // Token should now belong to Bob on the external NFT contract
    let token = nft_token(&nft_source, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, bob.id().to_string(), "Bob owns the token after purchase");

    // Sale should be removed from marketplace
    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_none(), "Sale removed after purchase");

    Ok(())
}

#[tokio::test]
async fn test_external_purchase_insufficient_deposit_fails() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let bob = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Expensive").await?;
    let price = "2000000000000000000000000"; // 2 NEAR

    approve_and_list(&nft_source, &marketplace, &alice, &token_id, price)
        .await?
        .into_result()?;

    // Bob tries with insufficient deposit
    let result = bob
        .call(marketplace.id(), "offer")
        .args_json(json!({
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": &token_id,
        }))
        .deposit(NearToken::from_near(1)) // Only 1 NEAR, price is 2
        .max_gas()
        .transact()
        .await?;
    assert!(result.is_failure(), "Insufficient deposit should fail");

    // Sale should still exist
    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_some(), "Sale remains after failed purchase");

    // Alice still owns the token
    let token = nft_token(&nft_source, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, alice.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_external_purchase_own_listing_fails() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Self Buy").await?;
    let price = "1000000000000000000000000";

    approve_and_list(&nft_source, &marketplace, &alice, &token_id, price)
        .await?
        .into_result()?;

    // Alice tries to buy her own listing
    let result = alice
        .call(marketplace.id(), "offer")
        .args_json(json!({
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": &token_id,
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?;
    assert!(result.is_failure(), "Cannot purchase your own listing");

    Ok(())
}

// =============================================================================
// UpdatePrice — Changing Price of External Listing
// =============================================================================

#[tokio::test]
async fn test_external_update_price() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Price Update").await?;
    let original_price = "1000000000000000000000000";
    let new_price = "2000000000000000000000000";

    approve_and_list(&nft_source, &marketplace, &alice, &token_id, original_price)
        .await?
        .into_result()?;

    // Update price via execute action with external contract_id
    let result = execute_action(
        &marketplace,
        &alice,
        json!({
            "type": "update_price",
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": &token_id,
            "price": new_price,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_success(), "Price update should succeed");

    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert_eq!(sale.unwrap().sale_conditions, new_price, "Price updated");

    Ok(())
}

// =============================================================================
// Allowlist Management
// =============================================================================

#[tokio::test]
async fn test_add_remove_approved_nft_contract() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let marketplace = deploy_scarces(&worker, &owner).await?;
    let nft_source = deploy_scarces(&worker, &owner).await?;

    // Initially empty
    let approved = get_approved_nft_contracts(&marketplace).await?;
    assert!(approved.is_empty(), "No approved contracts initially");

    // Add
    owner
        .call(marketplace.id(), "add_approved_nft_contract")
        .args_json(json!({ "nft_contract_id": nft_source.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let approved = get_approved_nft_contracts(&marketplace).await?;
    assert_eq!(approved.len(), 1);
    assert_eq!(approved[0], nft_source.id().to_string());

    // Remove
    owner
        .call(marketplace.id(), "remove_approved_nft_contract")
        .args_json(json!({ "nft_contract_id": nft_source.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let approved = get_approved_nft_contracts(&marketplace).await?;
    assert!(approved.is_empty(), "Contract removed from allowlist");

    Ok(())
}

#[tokio::test]
async fn test_add_approved_non_owner_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let marketplace = deploy_scarces(&worker, &owner).await?;
    let nft_source = deploy_scarces(&worker, &owner).await?;
    let alice = worker.dev_create_account().await?;

    let result = alice
        .call(marketplace.id(), "add_approved_nft_contract")
        .args_json(json!({ "nft_contract_id": nft_source.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?;
    assert!(result.is_failure(), "Non-owner cannot add approved NFT contract");

    Ok(())
}

// =============================================================================
// Full Round-Trip: List → Purchase → Verify Ownership
// =============================================================================

#[tokio::test]
async fn test_external_full_round_trip() -> Result<()> {
    let (worker, _owner, marketplace, nft_source) = setup_two_contracts().await?;
    let alice = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let bob = user_with_dual_storage(&worker, &marketplace, &nft_source).await?;
    let token_id = mint_external_token(&nft_source, &alice, "Round Trip").await?;
    let price = "500000000000000000000000"; // 0.5 NEAR

    // Step 1: List via nft_approve callback
    approve_and_list(&nft_source, &marketplace, &alice, &token_id, price)
        .await?
        .into_result()?;
    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_some(), "Sale listed");

    // Step 2: Verify supply
    let supply_before = get_supply_sales(&marketplace).await?;
    assert!(supply_before >= 1);

    // Step 3: Purchase
    bob.call(marketplace.id(), "offer")
        .args_json(json!({
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": &token_id,
        }))
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Step 4: Verify ownership transferred
    let token = nft_token(&nft_source, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, bob.id().to_string());

    // Step 5: Sale removed
    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_none(), "Sale removed after purchase");
    let supply_after = get_supply_sales(&marketplace).await?;
    assert_eq!(supply_after, supply_before - 1, "Supply decremented");

    // Step 6: Bob can re-list the token (new cycle)
    // Re-approve for re-listing
    bob.call(nft_source.id(), "nft_approve")
        .args_json(json!({
            "token_id": &token_id,
            "account_id": marketplace.id().to_string(),
            "msg": json!({ "sale_conditions": "2000000000000000000000000" }).to_string(),
        }))
        .deposit(DEPOSIT_STORAGE)
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let sale = get_external_sale(&marketplace, &nft_source, &token_id).await?;
    assert!(sale.is_some(), "Bob re-listed the token");
    assert_eq!(sale.unwrap().owner_id, bob.id().to_string());

    Ok(())
}
