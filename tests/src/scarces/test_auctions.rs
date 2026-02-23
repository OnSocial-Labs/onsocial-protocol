// =============================================================================
// Auction Integration Tests
// =============================================================================
// Tests for ListNativeScarceAuction, PlaceBid, SettleAuction, CancelAuction
// — time-based NFT auctions with reserves, buy-now, and anti-snipe.

use anyhow::Result;
use near_workspaces::types::NearToken;

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

/// Create an account with storage + mint one NFT. Returns (account, token_id).
async fn user_with_token(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
    title: &str,
) -> Result<(near_workspaces::Account, String)> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    quick_mint(contract, &user, title, DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(contract, &user.id().to_string(), None, Some(1)).await?;
    let token_id = tokens[0].token_id.clone();
    Ok((user, token_id))
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

// Price constants in yoctoNEAR
const RESERVE_1_NEAR: &str = "1000000000000000000000000";
const BID_INCREMENT: &str = "100000000000000000000000"; // 0.1 NEAR
const BUY_NOW_2_NEAR: &str = "2000000000000000000000000";

/// 5 seconds in nanoseconds (for deferred-start auctions)
const AUCTION_DURATION_5S: u64 = 5_000_000_000;

// =============================================================================
// ListNativeScarceAuction — Happy Path
// =============================================================================

#[tokio::test]
async fn test_list_auction_basic() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "Auction NFT").await?;

    // List as deferred-start auction (clock starts on first bid)
    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Verify via view
    let auction = get_auction(&contract, &token_id).await?;
    assert!(auction.is_some(), "Auction should exist");
    let auction = auction.unwrap();
    assert_eq!(auction.seller_id, seller.id().to_string());
    assert_eq!(auction.reserve_price, RESERVE_1_NEAR);
    assert_eq!(auction.min_bid_increment, BID_INCREMENT);
    assert_eq!(auction.bid_count, 0);
    assert!(
        auction.expires_at.is_none(),
        "Deferred-start: no expiry until first bid"
    );
    assert!(!auction.is_ended);

    Ok(())
}

#[tokio::test]
async fn test_list_auction_with_buy_now() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) =
        user_with_token(&worker, &contract, "BuyNow NFT").await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        Some(BUY_NOW_2_NEAR),
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    let auction = get_auction(&contract, &token_id).await?.unwrap();
    assert_eq!(auction.buy_now_price.as_deref(), Some(BUY_NOW_2_NEAR));

    Ok(())
}

// =============================================================================
// ListNativeScarceAuction — Error Cases
// =============================================================================

#[tokio::test]
async fn test_list_auction_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (_seller, token_id) = user_with_token(&worker, &contract, "NFT").await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    let result = list_native_scarce_auction(
        &contract,
        &stranger,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner should not list auction"
    );

    Ok(())
}

#[tokio::test]
async fn test_list_auction_already_listed_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "NFT").await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Try listing again
    let result = list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Should not list already-listed token"
    );

    Ok(())
}

// =============================================================================
// PlaceBid
// =============================================================================

#[tokio::test]
async fn test_place_bid_first_bid() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) =
        user_with_token(&worker, &contract, "Auction NFT").await?;
    let bidder = user_with_storage(&worker, &contract).await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Place first bid at reserve price
    place_bid(
        &contract,
        &bidder,
        &token_id,
        RESERVE_1_NEAR,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    let auction = get_auction(&contract, &token_id).await?.unwrap();
    assert_eq!(auction.bid_count, 1);
    assert_eq!(auction.highest_bid, RESERVE_1_NEAR);
    assert_eq!(
        auction.highest_bidder.as_deref(),
        Some(bidder.id().as_str())
    );
    assert!(
        auction.expires_at.is_some(),
        "First bid should start the clock"
    );

    Ok(())
}

#[tokio::test]
async fn test_place_bid_increment() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "NFT").await?;
    let bidder1 = user_with_storage(&worker, &contract).await?;
    let bidder2 = user_with_storage(&worker, &contract).await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // First bid
    place_bid(
        &contract,
        &bidder1,
        &token_id,
        RESERVE_1_NEAR,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    // Second bid must be >= first + increment (1 + 0.1 = 1.1 NEAR)
    let bid2_amount = "1100000000000000000000000"; // 1.1 NEAR
    place_bid(
        &contract,
        &bidder2,
        &token_id,
        bid2_amount,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    let auction = get_auction(&contract, &token_id).await?.unwrap();
    assert_eq!(auction.bid_count, 2);
    assert_eq!(
        auction.highest_bidder.as_deref(),
        Some(bidder2.id().as_str())
    );

    Ok(())
}

#[tokio::test]
async fn test_place_bid_below_reserve_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "NFT").await?;
    let bidder = user_with_storage(&worker, &contract).await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Bid below reserve
    let low_bid = "500000000000000000000000"; // 0.5 NEAR
    let result = place_bid(
        &contract,
        &bidder,
        &token_id,
        low_bid,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Bid below reserve should fail"
    );

    Ok(())
}

#[tokio::test]
async fn test_place_bid_seller_cannot_bid() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "NFT").await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    let result = place_bid(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        NearToken::from_near(2),
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Seller cannot bid on own auction"
    );

    Ok(())
}

// =============================================================================
// CancelAuction
// =============================================================================

#[tokio::test]
async fn test_cancel_auction_no_bids() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "NFT").await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    cancel_auction(&contract, &seller, &token_id, ONE_YOCTO)
        .await?
        .into_result()?;

    let auction = get_auction(&contract, &token_id).await?;
    assert!(auction.is_none(), "Auction should be removed");

    Ok(())
}

#[tokio::test]
async fn test_cancel_auction_with_bids_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "NFT").await?;
    let bidder = user_with_storage(&worker, &contract).await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    place_bid(
        &contract,
        &bidder,
        &token_id,
        RESERVE_1_NEAR,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    let result = cancel_auction(&contract, &seller, &token_id, ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Cannot cancel auction with bids"
    );

    Ok(())
}

#[tokio::test]
async fn test_cancel_auction_non_seller_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) = user_with_token(&worker, &contract, "NFT").await?;
    let stranger = user_with_storage(&worker, &contract).await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    let result =
        cancel_auction(&contract, &stranger, &token_id, ONE_YOCTO).await?;
    assert!(
        result.into_result().is_err(),
        "Non-seller cannot cancel auction"
    );

    Ok(())
}

// =============================================================================
// SettleAuction / Buy Now
// =============================================================================

#[tokio::test]
async fn test_buy_now_settles_immediately() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) =
        user_with_token(&worker, &contract, "BuyNow NFT").await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        Some(BUY_NOW_2_NEAR),
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Bid at buy-now price → auto-settles
    place_bid(
        &contract,
        &buyer,
        &token_id,
        BUY_NOW_2_NEAR,
        NearToken::from_near(3),
    )
    .await?
    .into_result()?;

    // Auction should be gone, token transferred
    let auction = get_auction(&contract, &token_id).await?;
    assert!(auction.is_none(), "Auction should be settled");

    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(
        token.owner_id,
        buyer.id().to_string(),
        "Buyer should own the token"
    );

    Ok(())
}

#[tokio::test]
async fn test_settle_auction_after_expiry() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) =
        user_with_token(&worker, &contract, "Timed NFT").await?;
    let bidder = user_with_storage(&worker, &contract).await?;

    // Auction with 5 second duration
    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Place bid >= reserve (starts the clock)
    place_bid(
        &contract,
        &bidder,
        &token_id,
        RESERVE_1_NEAR,
        NearToken::from_near(2),
    )
    .await?
    .into_result()?;

    // Fast-forward past auction end — need enough blocks for block_timestamp
    // to advance past the 5-second auction_duration_ns window.
    // Each sandbox block advances ~1.2s of timestamp, so 100 blocks ≈ 2 minutes.
    worker.fast_forward(100).await?;

    // Settle — anyone can call
    settle_auction(&contract, &seller, &token_id, DEPOSIT_STORAGE)
        .await?
        .into_result()?;

    // Verify ownership transferred
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, bidder.id().to_string());

    // Auction removed
    let auction = get_auction(&contract, &token_id).await?;
    assert!(auction.is_none());

    Ok(())
}

// =============================================================================
// Auction Views
// =============================================================================

#[tokio::test]
async fn test_auction_views() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let (seller, token_id) =
        user_with_token(&worker, &contract, "View NFT").await?;

    list_native_scarce_auction(
        &contract,
        &seller,
        &token_id,
        RESERVE_1_NEAR,
        BID_INCREMENT,
        Some(AUCTION_DURATION_5S),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // get_auctions should include this auction
    let auctions = get_auctions(&contract, None, None).await?;
    assert_eq!(auctions.len(), 1);
    assert_eq!(auctions[0].token_id, token_id);

    // get_sale should show auction data
    let sale = get_sale(&contract, &token_id).await?;
    assert!(sale.is_some());
    let sale = sale.unwrap();
    assert!(
        sale.auction.is_some(),
        "Sale should contain auction state"
    );

    Ok(())
}
