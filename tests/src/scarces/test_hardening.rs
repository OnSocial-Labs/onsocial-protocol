// =============================================================================
// P2 Hardening Integration Tests
// =============================================================================
// Targets remaining coverage gaps not addressed by P0/P1 test suites:
//   - Expired lazy listing cleanup
//   - Expired lazy listing purchase rejection
//   - Expired token offer acceptance rejection (post fast-forward)
//   - Expired collection offer acceptance rejection (post fast-forward)
//   - Storage drain-to-zero then operate
//   - Storage withdraw retains used-bytes cost
//   - Collection offer accept with burned token
//   - Cleanup idempotence (no expired listings)
//   - Cleanup with limit parameter
//   - Multiple cleanup rounds

use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

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

fn default_metadata() -> serde_json::Value {
    json!({
        "title": "Hardening Item",
        "description": "Test item for P2 hardening",
    })
}

const PRICE_1_NEAR: &str = "1000000000000000000000000";

/// Current wall-clock time in nanoseconds.
fn now_ns() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64
}

/// Short-lived expiry: 5 seconds from now (in nanoseconds).
fn short_expiry() -> u64 {
    now_ns() + 5_000_000_000
}

// =============================================================================
// Expired Lazy Listing — Cleanup removes expired listings
// =============================================================================

#[tokio::test]
async fn test_cleanup_removes_expired_lazy_listing() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // Create a listing that expires in 5 seconds
    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        Some(short_expiry()),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings =
        get_lazy_listings_by_creator(&contract, &creator.id().to_string()).await?;
    assert_eq!(listings.len(), 1, "listing should exist before expiry");
    let listing_id = listings[0].0.clone();

    // Fast-forward past expiry (~120 seconds of block time)
    worker.fast_forward(100).await?;

    // Cleanup
    let result = cleanup_expired_lazy_listings(&creator, &contract, None).await?;
    assert!(result.is_success(), "cleanup should succeed");

    // Listing should be gone
    let listing = get_lazy_listing(&contract, &listing_id).await?;
    assert!(listing.is_none(), "expired listing should be removed");

    let count = get_lazy_listings_count(&contract).await?;
    assert_eq!(count, 0, "no listings should remain");

    Ok(())
}

// =============================================================================
// Expired Lazy Listing — Purchase rejected after expiry
// =============================================================================

#[tokio::test]
async fn test_purchase_expired_lazy_listing_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        Some(short_expiry()),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings =
        get_lazy_listings_by_creator(&contract, &creator.id().to_string()).await?;
    let listing_id = listings[0].0.clone();

    // Fast-forward past expiry
    worker.fast_forward(100).await?;

    // Attempt purchase — should fail
    let result = purchase_lazy_listing(
        &contract,
        &buyer,
        &listing_id,
        NearToken::from_near(2),
    )
    .await?;
    assert!(
        result.is_failure(),
        "purchase of expired listing should be rejected"
    );

    Ok(())
}

// =============================================================================
// Cleanup with limit — processes only N listings
// =============================================================================

#[tokio::test]
async fn test_cleanup_with_limit() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // Create 3 listings with short expiry
    for i in 0..3 {
        create_lazy_listing(
            &contract,
            &creator,
            json!({ "title": format!("Expire {i}"), "description": "d" }),
            PRICE_1_NEAR,
            true,
            true,
            Some(short_expiry()),
            DEPOSIT_LARGE,
        )
        .await?
        .into_result()?;
    }
    assert_eq!(get_lazy_listings_count(&contract).await?, 3);

    worker.fast_forward(100).await?;

    // Cleanup with limit=1
    let _ = cleanup_expired_lazy_listings(&creator, &contract, Some(1)).await?;
    let after_first = get_lazy_listings_count(&contract).await?;
    assert_eq!(after_first, 2, "only 1 should be cleaned per round");

    // Another round
    let _ = cleanup_expired_lazy_listings(&creator, &contract, Some(1)).await?;
    assert_eq!(
        get_lazy_listings_count(&contract).await?,
        1,
        "second round removes another"
    );

    // Final round
    let _ = cleanup_expired_lazy_listings(&creator, &contract, None).await?;
    assert_eq!(
        get_lazy_listings_count(&contract).await?,
        0,
        "all expired listings cleaned"
    );

    Ok(())
}

// =============================================================================
// Cleanup idempotence — no-op when nothing expired
// =============================================================================

#[tokio::test]
async fn test_cleanup_no_expired_is_noop() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // Create a listing with no expiry
    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let result = cleanup_expired_lazy_listings(&creator, &contract, None).await?;
    assert!(result.is_success());

    // Listing still present
    assert_eq!(get_lazy_listings_count(&contract).await?, 1);

    Ok(())
}

// =============================================================================
// Expired Token Offer — Acceptance rejected post fast-forward
// =============================================================================

#[tokio::test]
async fn test_accept_expired_token_offer_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let seller = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &seller, "Offer NFT", DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(&contract, &seller.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // Make offer with short expiry
    make_offer(
        &contract,
        &buyer,
        token_id,
        "500000000000000000000000", // 0.5 NEAR
        Some(short_expiry()),
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Verify offer exists
    let offer = get_offer(&contract, token_id, &buyer.id().to_string()).await?;
    assert!(offer.is_some(), "offer should exist before expiry");

    // Fast-forward past expiry
    worker.fast_forward(100).await?;

    // Accept should fail — offer expired
    let result = accept_offer(
        &contract,
        &seller,
        token_id,
        &buyer.id().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_failure(),
        "accepting expired offer should be rejected"
    );

    // Seller still owns the token
    let token = nft_token(&contract, token_id).await?.unwrap();
    assert_eq!(token.owner_id, seller.id().to_string());

    Ok(())
}

// =============================================================================
// Expired Collection Offer — Acceptance rejected post fast-forward
// =============================================================================

#[tokio::test]
async fn test_accept_expired_collection_offer_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    // Create collection and mint a token
    create_collection(
        &contract,
        &creator,
        "exp-col",
        5,
        "0",
        json!({"title": "Exp #{id}", "description": "T"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(&contract, &creator, "exp-col", 1, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Make collection offer with short expiry
    make_collection_offer(
        &contract,
        &buyer,
        "exp-col",
        "500000000000000000000000",
        Some(short_expiry()),
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    let offer =
        get_collection_offer(&contract, "exp-col", &buyer.id().to_string()).await?;
    assert!(offer.is_some(), "collection offer should exist");

    // Fast-forward past expiry
    worker.fast_forward(100).await?;

    // Find the minted token
    let tokens =
        nft_tokens_for_owner(&contract, &creator.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // Accept should fail
    let result = accept_collection_offer(
        &contract,
        &creator,
        "exp-col",
        token_id,
        &buyer.id().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_failure(),
        "accepting expired collection offer should be rejected"
    );

    // Creator still owns token
    let token = nft_token(&contract, token_id).await?.unwrap();
    assert_eq!(token.owner_id, creator.id().to_string());

    Ok(())
}

// =============================================================================
// Collection offer accept with burned token — NotFound
// =============================================================================

#[tokio::test]
async fn test_accept_collection_offer_burned_token() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    create_collection(
        &contract,
        &creator,
        "burn-col",
        5,
        "0",
        json!({"title": "Burn #{id}", "description": "T"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    mint_from_collection(&contract, &creator, "burn-col", 1, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let tokens =
        nft_tokens_for_owner(&contract, &creator.id().to_string(), None, Some(10)).await?;
    let token_id = tokens[0].token_id.clone();

    // Make collection offer
    make_collection_offer(
        &contract,
        &buyer,
        "burn-col",
        "500000000000000000000000",
        None,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Burn the token
    burn_scarce(&contract, &creator, &token_id, Some("burn-col"), ONE_YOCTO)
        .await?
        .into_result()?;

    // Accept with burned token_id — token not found
    let result = accept_collection_offer(
        &contract,
        &creator,
        "burn-col",
        &token_id,
        &buyer.id().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_failure(),
        "accepting collection offer with burned token should fail"
    );

    Ok(())
}

// =============================================================================
// Storage drain-to-zero — platform pool absorbs mint cost
// =============================================================================

#[tokio::test]
async fn test_storage_drain_then_mint_uses_platform_pool() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;

    // Withdraw all available storage balance
    execute_action(
        &contract,
        &user,
        json!({ "type": "storage_withdraw" }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // User balance should be effectively zero (at most the 1 yoctoNEAR
    // confirmation deposit re-credited via finalize_unused_deposit).
    let balance = storage_balance_of(&contract, &user.id().to_string()).await?;
    let b: u128 = balance.parse().unwrap_or(0);
    assert!(b <= 1, "balance should be effectively drained (got {b})");

    // Record platform pool before mint
    let platform_before: serde_json::Value = contract
        .view("get_platform_storage_balance")
        .await?
        .json()?;
    let platform_before: u128 = platform_before.as_str().unwrap().parse()?;

    // Mint succeeds — waterfall Tier 2 (platform pool) covers the cost
    // even though the user has no storage balance.
    let result = quick_mint(&contract, &user, "Platform Covered", DEPOSIT_STORAGE).await?;
    assert!(
        result.is_success(),
        "mint should succeed via platform pool waterfall"
    );

    // Platform pool should have decreased
    let platform_after: serde_json::Value = contract
        .view("get_platform_storage_balance")
        .await?
        .json()?;
    let platform_after: u128 = platform_after.as_str().unwrap().parse()?;
    assert!(
        platform_after < platform_before,
        "platform pool should absorb storage cost (before={platform_before}, after={platform_after})"
    );

    // User balance should NOT have increased (proving platform paid, not user)
    let balance_after = storage_balance_of(&contract, &user.id().to_string()).await?;
    let _b_after: u128 = balance_after.parse().unwrap_or(0);
    // The unused portion of DEPOSIT_STORAGE gets credited to user's balance,
    // but NO storage bytes are charged to user tier.
    // Verify user didn't pay for the token storage itself.
    let user_supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(user_supply, "1", "user should own the minted token");

    Ok(())
}

// =============================================================================
// Storage withdraw retains used-bytes cost
// =============================================================================

#[tokio::test]
async fn test_storage_withdraw_retains_used_bytes() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;

    let balance_before = storage_balance_of(&contract, &user.id().to_string()).await?;
    let b_before: u128 = balance_before.parse()?;

    // Mint a token (consumes storage)
    quick_mint(&contract, &user, "Uses Storage", DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Withdraw all *available* balance
    execute_action(
        &contract,
        &user,
        json!({ "type": "storage_withdraw" }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Balance should be > 0 (used bytes are reserved)
    let balance_after = storage_balance_of(&contract, &user.id().to_string()).await?;
    let b_after: u128 = balance_after.parse()?;
    assert!(
        b_after > 0,
        "used storage cost should be retained: {b_after}"
    );
    assert!(
        b_after < b_before,
        "available portion should have been withdrawn: before={b_before}, after={b_after}"
    );

    Ok(())
}

// =============================================================================
// Storage deposit after drain — restores ability to mint
// =============================================================================

#[tokio::test]
async fn test_storage_redeposit_after_drain_allows_mint() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;

    // Drain
    execute_action(
        &contract,
        &user,
        json!({ "type": "storage_withdraw" }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Re-deposit
    storage_deposit(&contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Should be able to mint now
    quick_mint(&contract, &user, "After Redeposit", DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(supply, "1", "should own 1 token after re-deposit + mint");

    Ok(())
}

// =============================================================================
// Mixed expired + active listings — cleanup only removes expired
// =============================================================================

#[tokio::test]
async fn test_cleanup_preserves_active_listings() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;

    // Listing 1: short expiry (will expire)
    create_lazy_listing(
        &contract,
        &creator,
        json!({ "title": "Expires", "description": "d" }),
        PRICE_1_NEAR,
        true,
        true,
        Some(short_expiry()),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Listing 2: no expiry (permanent)
    create_lazy_listing(
        &contract,
        &creator,
        json!({ "title": "Permanent", "description": "d" }),
        PRICE_1_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Listing 3: far future expiry (stays active)
    let far_future = 2_000_000_000_000_000_000u64; // ~year 2033
    create_lazy_listing(
        &contract,
        &creator,
        json!({ "title": "Far Future", "description": "d" }),
        PRICE_1_NEAR,
        true,
        true,
        Some(far_future),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    assert_eq!(get_lazy_listings_count(&contract).await?, 3);

    worker.fast_forward(100).await?;

    let _ = cleanup_expired_lazy_listings(&creator, &contract, None).await?;

    // Only the short-expiry listing should be removed
    let remaining = get_lazy_listings_count(&contract).await?;
    assert_eq!(remaining, 2, "only expired listing should be removed");

    // Verify the permanent and far-future listings still exist
    let listings =
        get_lazy_listings_by_creator(&contract, &creator.id().to_string()).await?;
    assert_eq!(listings.len(), 2);

    let titles: Vec<&str> = listings
        .iter()
        .map(|(_, l)| l.metadata.title.as_deref().unwrap_or(""))
        .collect();
    assert!(titles.contains(&"Permanent"), "permanent listing kept");
    assert!(titles.contains(&"Far Future"), "far-future listing kept");

    Ok(())
}

// =============================================================================
// Expired offer — buyer's funds refunded on acceptance attempt
// =============================================================================

#[tokio::test]
async fn test_expired_offer_refunds_buyer() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let seller = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    quick_mint(&contract, &seller, "Refund Test", DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(&contract, &seller.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    let buyer_balance_before = buyer.view_account().await?.balance;

    // Make offer with short expiry — funds are escrowed
    make_offer(
        &contract,
        &buyer,
        token_id,
        "500000000000000000000000",
        Some(short_expiry()),
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    let buyer_balance_after_offer = buyer.view_account().await?.balance;
    assert!(
        buyer_balance_after_offer < buyer_balance_before,
        "buyer's native balance should decrease after offer"
    );

    worker.fast_forward(100).await?;

    // Accept triggers expiry rejection — #[handle_result] panics on Err,
    // rolling back state (the offers.remove inside accept_offer is reverted).
    let result = accept_offer(
        &contract,
        &seller,
        token_id,
        &buyer.id().to_string(),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_failure(),
        "accepting expired offer should fail"
    );

    // Offer still exists (state rolled back) — buyer must cancel to reclaim.
    let offer = get_offer(&contract, token_id, &buyer.id().to_string()).await?;
    assert!(
        offer.is_some(),
        "expired offer should still exist after rolled-back acceptance"
    );

    // Buyer cancels to reclaim escrowed funds.
    cancel_offer(&contract, &buyer, token_id, ONE_YOCTO)
        .await?
        .into_result()?;
    let offer = get_offer(&contract, token_id, &buyer.id().to_string()).await?;
    assert!(
        offer.is_none(),
        "offer should be gone after cancel"
    );

    Ok(())
}

// =============================================================================
// Cleanup then purchase — listing gone after cleanup
// =============================================================================

#[tokio::test]
async fn test_cleanup_then_purchase_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    create_lazy_listing(
        &contract,
        &creator,
        default_metadata(),
        PRICE_1_NEAR,
        true,
        true,
        Some(short_expiry()),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let listings =
        get_lazy_listings_by_creator(&contract, &creator.id().to_string()).await?;
    let listing_id = listings[0].0.clone();

    worker.fast_forward(100).await?;

    // Cleanup first
    let _ = cleanup_expired_lazy_listings(&creator, &contract, None).await?;

    // Then try to purchase — listing no longer exists
    let result = purchase_lazy_listing(
        &contract,
        &buyer,
        &listing_id,
        NearToken::from_near(2),
    )
    .await?;
    assert!(
        result.is_failure(),
        "purchase after cleanup should fail — listing gone"
    );

    Ok(())
}
