use crate::tests::test_utils::*;
use crate::collections::LazyCollection;
use crate::fees::compute_dutch_price;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

fn dutch_collection(floor: u128, start_price: u128, start: u64, end: u64) -> LazyCollection {
    LazyCollection {
        creator_id: creator(),
        collection_id: "dutch".to_string(),
        total_supply: 100,
        minted_count: 0,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(floor),
        start_price: Some(U128(start_price)),
        start_time: Some(start),
        end_time: Some(end),
        created_at: 0,
        app_id: None,
        royalty: None,
        renewable: false,
        revocation_mode: collections::RevocationMode::None,
        max_redeems: None,
        redeemed_count: 0,
        fully_redeemed_count: 0,
        burnable: true,
        mint_mode: collections::MintMode::Open,
        max_per_wallet: None,
        transferable: true,
        paused: false,
        cancelled: false,
        refund_pool: U128(0),
        refund_per_token: U128(0),
        refunded_count: 0,
        refund_deadline: None,
        total_revenue: U128(0),
        allowlist_price: None,
        banned: false,
        metadata: None,
        app_metadata: None,
    }
}

fn fixed_collection(price: u128) -> LazyCollection {
    LazyCollection {
        creator_id: creator(),
        collection_id: "fixed".to_string(),
        total_supply: 100,
        minted_count: 0,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(price),
        start_price: None,
        start_time: None,
        end_time: None,
        created_at: 0,
        app_id: None,
        royalty: None,
        renewable: false,
        revocation_mode: collections::RevocationMode::None,
        max_redeems: None,
        redeemed_count: 0,
        fully_redeemed_count: 0,
        burnable: true,
        mint_mode: collections::MintMode::Open,
        max_per_wallet: None,
        transferable: true,
        paused: false,
        cancelled: false,
        refund_pool: U128(0),
        refund_per_token: U128(0),
        refunded_count: 0,
        refund_deadline: None,
        total_revenue: U128(0),
        allowlist_price: None,
        banned: false,
        metadata: None,
        app_metadata: None,
    }
}

// --- Fixed price ---

#[test]
fn fixed_price_returns_floor() {
    let ctx = context(owner());
    testing_env!(ctx.build());
    let col = fixed_collection(1_000_000);
    assert_eq!(compute_dutch_price(&col), 1_000_000);
}

// --- No start_price => floor ---

#[test]
fn no_start_price_returns_floor() {
    let ctx = context(owner());
    testing_env!(ctx.build());
    let mut col = dutch_collection(100, 200, 1000, 2000);
    col.start_price = None;
    assert_eq!(compute_dutch_price(&col), 100);
}

// --- start_price <= floor => floor ---

#[test]
fn start_price_equal_floor_returns_floor() {
    let ctx = context(owner());
    testing_env!(ctx.build());
    let col = dutch_collection(100, 100, 1000, 2000);
    assert_eq!(compute_dutch_price(&col), 100);
}

#[test]
fn start_price_below_floor_returns_floor() {
    let ctx = context(owner());
    testing_env!(ctx.build());
    let col = dutch_collection(100, 50, 1000, 2000);
    assert_eq!(compute_dutch_price(&col), 100);
}

// --- Before start => start_price ---

#[test]
fn before_start_returns_start_price() {
    let mut ctx = context(owner());
    ctx.block_timestamp(500); // before start=1000
    testing_env!(ctx.build());
    let col = dutch_collection(100, 1000, 1000, 2000);
    assert_eq!(compute_dutch_price(&col), 1000);
}

#[test]
fn at_start_returns_start_price() {
    let mut ctx = context(owner());
    ctx.block_timestamp(1000); // at start
    testing_env!(ctx.build());
    let col = dutch_collection(100, 1000, 1000, 2000);
    assert_eq!(compute_dutch_price(&col), 1000);
}

// --- After end => floor ---

#[test]
fn at_end_returns_floor() {
    let mut ctx = context(owner());
    ctx.block_timestamp(2000); // at end
    testing_env!(ctx.build());
    let col = dutch_collection(100, 1000, 1000, 2000);
    assert_eq!(compute_dutch_price(&col), 100);
}

#[test]
fn after_end_returns_floor() {
    let mut ctx = context(owner());
    ctx.block_timestamp(3000);
    testing_env!(ctx.build());
    let col = dutch_collection(100, 1000, 1000, 2000);
    assert_eq!(compute_dutch_price(&col), 100);
}

// --- Midpoint ---

#[test]
fn midpoint_returns_average() {
    let mut ctx = context(owner());
    ctx.block_timestamp(1500); // 50% of [1000..2000]
    testing_env!(ctx.build());
    // start=1000, floor=100, diff=900, 50% drop = 450 => 1000 - 450 = 550
    let col = dutch_collection(100, 1000, 1000, 2000);
    assert_eq!(compute_dutch_price(&col), 550);
}

#[test]
fn quarter_returns_75_percent() {
    let mut ctx = context(owner());
    ctx.block_timestamp(1250); // 25% of [1000..2000]
    testing_env!(ctx.build());
    // diff=900, 25% drop = 225 => 1000 - 225 = 775
    let col = dutch_collection(100, 1000, 1000, 2000);
    assert_eq!(compute_dutch_price(&col), 775);
}

// --- Missing times => floor ---

#[test]
fn no_start_time_returns_floor() {
    let ctx = context(owner());
    testing_env!(ctx.build());
    let mut col = dutch_collection(100, 1000, 1000, 2000);
    col.start_time = None;
    assert_eq!(compute_dutch_price(&col), 100);
}

#[test]
fn no_end_time_returns_floor() {
    let ctx = context(owner());
    testing_env!(ctx.build());
    let mut col = dutch_collection(100, 1000, 1000, 2000);
    col.end_time = None;
    assert_eq!(compute_dutch_price(&col), 100);
}

// --- Large values (no overflow) ---

#[test]
fn large_values_no_overflow() {
    let mut ctx = context(owner());
    ctx.block_timestamp(50_000_000_000);
    testing_env!(ctx.build());
    let floor = 1_000_000_000_000_000_000_000_000u128; // 1 NEAR
    let start = 100_000_000_000_000_000_000_000_000u128; // 100 NEAR
    let col = dutch_collection(floor, start, 0, 100_000_000_000);
    let price = compute_dutch_price(&col);
    // 50% elapsed => midpoint between 100 NEAR and 1 NEAR
    let expected = start - (start - floor) / 2;
    assert_eq!(price, expected);
}
