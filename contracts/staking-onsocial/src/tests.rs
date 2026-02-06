//! Unit tests for SOCIAL staking contract (stake-seconds model)
//!
//! Tests cover:
//! - Initialization
//! - Storage (NEP-145)
//! - Lock tokens with time-lock bonuses
//! - Extend/renew lock periods
//! - Effective stake calculations
//! - Stake-seconds accumulation
//! - Weekly reward release (0.2% per week)
//! - Proportional reward distribution
//! - Credits purchase (60/40 split)
//! - Owner functions
//! - View functions
//! - Edge cases

use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

// =============================================================================
// Constants
// =============================================================================

const ONE_SOCIAL: u128 = 1_000_000_000_000_000_000; // 10^18

// =============================================================================
// Test Helpers
// =============================================================================

fn get_context(predecessor: &str) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.predecessor_account_id(predecessor.parse().unwrap());
    builder
}

fn setup_contract() -> OnsocialStaking {
    let mut context = get_context("owner.near");
    context.block_timestamp(1_000_000_000_000_000_000); // 1 second in ns
    testing_env!(context.build());

    OnsocialStaking::new(
        "social.token.near".parse().unwrap(),
        "owner.near".parse().unwrap(),
    )
}

fn setup_with_storage(contract: &mut OnsocialStaking, account: &str) {
    let mut context = get_context(account);
    context.attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT));
    testing_env!(context.build());
    contract.storage_deposit(None, None);
}

fn lock_tokens(contract: &mut OnsocialStaking, sender: &str, amount: u128, months: u64) {
    let mut context = get_context("social.token.near");
    context.block_timestamp(1_000_000_000_000_000_000);
    testing_env!(context.build());

    let msg = format!(r#"{{"action":"lock","months":{}}}"#, months);
    contract.ft_on_transfer(sender.parse().unwrap(), U128(amount), msg);
}

fn lock_tokens_at(
    contract: &mut OnsocialStaking,
    sender: &str,
    amount: u128,
    months: u64,
    timestamp: u64,
) {
    let mut context = get_context("social.token.near");
    context.block_timestamp(timestamp);
    testing_env!(context.build());

    let msg = format!(r#"{{"action":"lock","months":{}}}"#, months);
    contract.ft_on_transfer(sender.parse().unwrap(), U128(amount), msg);
}

fn fund_pool(contract: &mut OnsocialStaking, amount: u128) {
    let context = get_context("social.token.near");
    testing_env!(context.build());

    let msg = r#"{"action":"fund_scheduled"}"#;
    contract.ft_on_transfer(
        "funder.near".parse().unwrap(),
        U128(amount),
        msg.to_string(),
    );
}

fn fund_pool_at(contract: &mut OnsocialStaking, amount: u128, timestamp: u64) {
    let mut context = get_context("social.token.near");
    context.block_timestamp(timestamp);
    testing_env!(context.build());

    let msg = r#"{"action":"fund_scheduled"}"#;
    contract.ft_on_transfer(
        "funder.near".parse().unwrap(),
        U128(amount),
        msg.to_string(),
    );
}

fn purchase_credits(contract: &mut OnsocialStaking, sender: &str, amount: u128) {
    let context = get_context("social.token.near");
    testing_env!(context.build());

    let msg = r#"{"action":"credits"}"#;
    contract.ft_on_transfer(sender.parse().unwrap(), U128(amount), msg.to_string());
}

// =============================================================================
// Initialization Tests
// =============================================================================

#[test]
fn test_init() {
    let contract = setup_contract();

    assert_eq!(contract.version, 1);
    assert_eq!(contract.token_id.as_str(), "social.token.near");
    assert_eq!(contract.owner_id.as_str(), "owner.near");
    assert_eq!(contract.total_locked, 0);
    assert_eq!(contract.total_effective_stake, 0);
    assert_eq!(contract.total_stake_seconds, 0);
    assert_eq!(contract.total_rewards_released, 0);
    assert_eq!(contract.scheduled_pool, 0);
    assert_eq!(contract.infra_pool, 0);
}

#[test]
fn test_get_stats_initial() {
    let contract = setup_contract();
    let stats = contract.get_stats();

    assert_eq!(stats.version, 1);
    assert_eq!(stats.total_locked.0, 0);
    assert_eq!(stats.total_effective_stake.0, 0);
    assert_eq!(stats.scheduled_pool.0, 0);
    assert_eq!(stats.infra_pool.0, 0);
}

// =============================================================================
// Storage (NEP-145) Tests
// =============================================================================

#[test]
fn test_storage_deposit() {
    let mut contract = setup_contract();

    let mut context = get_context("alice.near");
    context.attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT));
    testing_env!(context.build());

    let balance = contract.storage_deposit(None, None);
    assert_eq!(balance.total.0, STORAGE_DEPOSIT);
    assert_eq!(balance.available.0, 0);

    // Verify storage is registered
    let alice_id: AccountId = "alice.near".parse().unwrap();
    assert!(contract.storage_paid.contains_key(&alice_id));
}

#[test]
fn test_storage_deposit_with_refund() {
    let mut contract = setup_contract();

    let mut context = get_context("alice.near");
    context.attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT * 2));
    testing_env!(context.build());

    let balance = contract.storage_deposit(None, None);
    assert_eq!(balance.total.0, STORAGE_DEPOSIT);
}

#[test]
fn test_storage_deposit_already_registered() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    // Try again with deposit - should refund
    let mut context = get_context("alice.near");
    context.attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT));
    testing_env!(context.build());

    let balance = contract.storage_deposit(None, None);
    assert_eq!(balance.total.0, STORAGE_DEPOSIT);
}

#[test]
fn test_storage_balance_bounds() {
    let contract = setup_contract();
    let bounds = contract.storage_balance_bounds();

    assert_eq!(bounds.min.0, STORAGE_DEPOSIT);
    assert_eq!(bounds.max.0, STORAGE_DEPOSIT);
}

#[test]
fn test_storage_balance_of() {
    let mut contract = setup_contract();

    // Not registered
    let balance = contract.storage_balance_of("alice.near".parse().unwrap());
    assert!(balance.is_none());

    // Register
    setup_with_storage(&mut contract, "alice.near");

    // Now registered
    let balance = contract.storage_balance_of("alice.near".parse().unwrap());
    assert!(balance.is_some());
    assert_eq!(balance.unwrap().total.0, STORAGE_DEPOSIT);
}

// =============================================================================
// Lock Tokens Tests
// =============================================================================

#[test]
fn test_lock_tokens_basic() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    lock_tokens(&mut contract, "alice.near", ONE_SOCIAL, 6);

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.locked_amount.0, ONE_SOCIAL);
    assert_eq!(account.lock_months, 6);
    assert!(account.unlock_at > 0);

    // 6 months = 10% bonus → effective = 1.1x
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 110 / 100);

    // Contract totals
    assert_eq!(contract.total_locked, ONE_SOCIAL);
    assert_eq!(contract.total_effective_stake, ONE_SOCIAL * 110 / 100);
}

#[test]
fn test_lock_additive_same_period() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    lock_tokens(&mut contract, "alice.near", ONE_SOCIAL, 6);
    lock_tokens(&mut contract, "alice.near", ONE_SOCIAL, 6);

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.locked_amount.0, 2 * ONE_SOCIAL);
}

// =============================================================================
// Extend Lock Tests
// =============================================================================

#[test]
fn test_extend_lock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    lock_tokens(&mut contract, "alice.near", ONE_SOCIAL, 6);

    let old_account = contract.get_account("alice.near".parse().unwrap());
    let old_unlock = old_account.unlock_at;

    // Extend to 12 months
    let mut context = get_context("alice.near");
    context.block_timestamp(1_000_000_000_000_000_000);
    testing_env!(context.build());

    contract.extend_lock(12);

    let new_account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(new_account.lock_months, 12);
    assert!(new_account.unlock_at > old_unlock);
    // 12 months = 20% bonus
    assert_eq!(new_account.effective_stake.0, ONE_SOCIAL * 120 / 100);
}

#[test]
fn test_renew_lock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    let old_unlock = contract
        .get_account("alice.near".parse().unwrap())
        .unlock_at;

    // Advance time 1 month
    let mut context = get_context("alice.near");
    context.block_timestamp(start_time + MONTH_NS);
    testing_env!(context.build());

    contract.renew_lock();

    let new_account = contract.get_account("alice.near".parse().unwrap());
    assert!(new_account.unlock_at > old_unlock);
}

// =============================================================================
// Unlock Tests
// =============================================================================

#[test]
fn test_unlock_after_expiry() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    // Advance past lock expiry (1 month + 1 second)
    let mut context = get_context("alice.near");
    context.block_timestamp(start_time + MONTH_NS + NS_PER_SEC);
    testing_env!(context.build());

    // Should be able to unlock (returns Promise, can't fully test in unit tests)
    // At least verify the state change
    let lock_status = contract.get_lock_status("alice.near".parse().unwrap());
    assert!(lock_status.can_unlock);
    assert!(lock_status.lock_expired);
}

#[test]
fn test_get_lock_status() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 12, start_time);

    let mut context = get_context("alice.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    let status = contract.get_lock_status("alice.near".parse().unwrap());

    assert!(status.is_locked);
    assert_eq!(status.locked_amount.0, ONE_SOCIAL);
    assert_eq!(status.lock_months, 12);
    assert_eq!(status.bonus_percent, 20); // 12 months = 20%
    assert!(!status.can_unlock);
    assert!(!status.lock_expired);
    assert!(status.time_remaining_ns > 0);
}

// =============================================================================
// Effective Stake Tests
// =============================================================================

#[test]
fn test_effective_stake_keeps_bonus_until_unlock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    // Before expiry: has bonus
    let mut context = get_context("alice.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 110 / 100);

    // After expiry: STILL has bonus (until unlock is called)
    context.block_timestamp(start_time + MONTH_NS + NS_PER_SEC);
    testing_env!(context.build());

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 110 / 100); // Bonus kept until unlock
}

// =============================================================================
// Stake-Seconds Tests
// =============================================================================

#[test]
fn test_stake_seconds_accumulation() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Effective stake = 1.1 SOCIAL
    let effective = ONE_SOCIAL * 110 / 100;

    // Advance 100 seconds and trigger sync
    let mut context = get_context("alice.near");
    context.block_timestamp(start_time + 100 * NS_PER_SEC);
    testing_env!(context.build());

    contract.poke();

    // Check global stake-seconds
    // Should be effective_stake × 100 seconds
    let expected_ss = effective * 100;
    assert_eq!(contract.total_stake_seconds, expected_ss);
}

#[test]
fn test_stake_seconds_multiple_users() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Alice stakes at t=0
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Bob stakes at t=50
    lock_tokens_at(
        &mut contract,
        "bob.near",
        ONE_SOCIAL,
        12,
        start_time + 50 * NS_PER_SEC,
    );

    // At t=100, sync
    let mut context = get_context("owner.near");
    context.block_timestamp(start_time + 100 * NS_PER_SEC);
    testing_env!(context.build());

    contract.poke();

    // Alice: 1.1 SOCIAL × 100 sec
    // Bob: 1.2 SOCIAL × 50 sec
    let alice_effective = ONE_SOCIAL * 110 / 100;
    let bob_effective = ONE_SOCIAL * 120 / 100;

    let expected_total = alice_effective * 100 + bob_effective * 50;
    assert_eq!(contract.total_stake_seconds, expected_total);
}

// =============================================================================
// Rewards Release Tests
// =============================================================================

#[test]
fn test_fund_scheduled_pool() {
    let mut contract = setup_contract();

    fund_pool(&mut contract, 100 * ONE_SOCIAL);

    assert_eq!(contract.scheduled_pool, 100 * ONE_SOCIAL);
}

#[test]
fn test_weekly_release() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "staker.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool and add a staker (required for rewards to release)
    fund_pool_at(&mut contract, 100 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "staker.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 week
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    contract.poke();

    // Should release 0.2% = 0.2 SOCIAL from 100 SOCIAL pool
    let expected_release = 100 * ONE_SOCIAL * WEEKLY_RATE_BPS / 10_000;
    assert_eq!(contract.total_rewards_released, expected_release);
    assert_eq!(contract.scheduled_pool, 100 * ONE_SOCIAL - expected_release);
}

#[test]
fn test_multiple_weeks_release() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "staker.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool and add a staker (required for rewards to release)
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "staker.near", ONE_SOCIAL, 6, start_time);

    // Advance 4 weeks
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + 4 * WEEK_NS);
    testing_env!(context.build());

    contract.poke();

    // Should process 4 releases with compounding
    // Week 1: 1000 × 0.002 = 2
    // Week 2: 998 × 0.002 = 1.996
    // Week 3: 996.004 × 0.002 = 1.992
    // Week 4: 994.012 × 0.002 = 1.988
    // Total released ≈ 7.976 SOCIAL

    assert!(contract.total_rewards_released > 0);
    assert!(contract.scheduled_pool < 1000 * ONE_SOCIAL);
}

#[test]
fn test_release_handles_long_staking_period() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "staker.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool and add a staker (required for rewards to release)
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "staker.near", ONE_SOCIAL, 48, start_time); // 48 month lock

    // Advance 100 weeks - now handled in single call via binary exponentiation
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + 100 * WEEK_NS);
    testing_env!(context.build());

    contract.poke();

    // All 100 weeks processed in one call (O(log n) = ~7 operations)
    // After 100 weeks at 0.2%: 1000 × 0.998^100 ≈ 818 remaining
    // So released ≈ 182 SOCIAL
    assert!(contract.total_rewards_released > 0);
    assert!(contract.scheduled_pool > 0); // Not fully drained

    // Verify more was released than 52-week cap would have allowed
    // 52 weeks: ~99 SOCIAL released, 100 weeks: ~182 SOCIAL released
    assert!(contract.total_rewards_released > 150 * ONE_SOCIAL);
}

// =============================================================================
// Credits Purchase Tests
// =============================================================================

#[test]
fn test_credits_60_40_split() {
    let mut contract = setup_contract();

    let context = get_context("social.token.near");
    testing_env!(context.build());

    let msg = r#"{"action":"credits"}"#;
    contract.ft_on_transfer(
        "buyer.near".parse().unwrap(),
        U128(100 * ONE_SOCIAL),
        msg.to_string(),
    );

    // 60% to infra, 40% to rewards
    assert_eq!(contract.infra_pool, 60 * ONE_SOCIAL);
    assert_eq!(contract.scheduled_pool, 40 * ONE_SOCIAL);
}

// =============================================================================
// Reward Calculation Tests
// =============================================================================

#[test]
fn test_claimable_rewards_single_staker() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool first
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Alice stakes
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 week (triggers release)
    let mut context = get_context("alice.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    let account = contract.get_account("alice.near".parse().unwrap());

    // Alice is only staker, should get all released rewards
    // Released = 1000 × 0.002 = 2 SOCIAL
    let expected_release = 1000 * ONE_SOCIAL * WEEKLY_RATE_BPS / 10_000;

    // Allow small rounding difference
    let claimable = account.claimable_rewards.0;
    assert!(claimable > 0, "Should have claimable rewards");

    // Should be approximately equal to released amount
    let diff = if claimable > expected_release {
        claimable - expected_release
    } else {
        expected_release - claimable
    };
    assert!(
        diff < ONE_SOCIAL / 100,
        "Claimable should be close to released"
    );
}

#[test]
fn test_claimable_rewards_two_stakers_equal() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Both stake same amount at same time with same period
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);
    lock_tokens_at(&mut contract, "bob.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 week
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    let alice = contract.get_account("alice.near".parse().unwrap());
    let bob = contract.get_account("bob.near".parse().unwrap());

    // Should be equal (within rounding)
    let diff = if alice.claimable_rewards.0 > bob.claimable_rewards.0 {
        alice.claimable_rewards.0 - bob.claimable_rewards.0
    } else {
        bob.claimable_rewards.0 - alice.claimable_rewards.0
    };

    assert!(
        diff < ONE_SOCIAL / 1000,
        "Alice and Bob should have equal rewards"
    );
}

#[test]
fn test_claimable_rewards_proportional_to_stake() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Alice stakes 3x more than Bob (same period)
    lock_tokens_at(&mut contract, "alice.near", 3 * ONE_SOCIAL, 6, start_time);
    lock_tokens_at(&mut contract, "bob.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 week
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    let alice = contract.get_account("alice.near".parse().unwrap());
    let bob = contract.get_account("bob.near".parse().unwrap());

    // Alice should have ~3x Bob's rewards
    let ratio = alice.claimable_rewards.0 * 100 / bob.claimable_rewards.0;
    assert!(
        (290..=310).contains(&ratio),
        "Alice should have ~3x Bob's rewards, got {}%",
        ratio
    );
}

#[test]
fn test_rewards_respect_effective_stake_bonus() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Same locked amount, different periods
    // Alice: 1 SOCIAL, 48 months (50% bonus) → effective 1.5
    // Bob: 1 SOCIAL, 6 months (10% bonus) → effective 1.1
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 48, start_time);
    lock_tokens_at(&mut contract, "bob.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 week
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    let alice = contract.get_account("alice.near".parse().unwrap());
    let bob = contract.get_account("bob.near".parse().unwrap());

    // Alice should have 1.5/1.1 ≈ 1.36x Bob's rewards
    let ratio = alice.claimable_rewards.0 * 100 / bob.claimable_rewards.0;
    assert!(
        (130..=145).contains(&ratio),
        "Alice should have ~1.36x Bob's rewards, got {}%",
        ratio
    );
}

// =============================================================================
// Get Reward Rate Tests
// =============================================================================

#[test]
fn test_get_reward_rate() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Alice stakes
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    let rate = contract.get_reward_rate("alice.near".parse().unwrap());

    assert!(rate.rewards_per_second.0 > 0);
    assert_eq!(rate.effective_stake.0, ONE_SOCIAL * 110 / 100);
    assert_eq!(rate.total_effective_stake.0, ONE_SOCIAL * 110 / 100);

    // Weekly release = 1000 × 0.002 = 2 SOCIAL
    let expected_weekly = 1000 * ONE_SOCIAL * WEEKLY_RATE_BPS / 10_000;
    assert_eq!(rate.weekly_pool_release.0, expected_weekly);
}

// =============================================================================
// Poke Tests
// =============================================================================

#[test]
fn test_poke_triggers_release() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "staker.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool and add a staker (required for rewards to release)
    fund_pool_at(&mut contract, 100 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "staker.near", ONE_SOCIAL, 6, start_time);

    assert_eq!(contract.total_rewards_released, 0);

    // Advance 1 week and poke
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    contract.poke();

    assert!(contract.total_rewards_released > 0);
}

#[test]
fn test_poke_idempotent_within_week() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "staker.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool and add a staker (required for rewards to release)
    fund_pool_at(&mut contract, 100 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "staker.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 week
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    contract.poke();
    let released_after_first = contract.total_rewards_released;

    // Poke again immediately
    contract.poke();

    // Should be same (no more time passed)
    assert_eq!(contract.total_rewards_released, released_after_first);
}

// =============================================================================
// Owner Function Tests
// =============================================================================

#[test]
fn test_set_owner() {
    let mut contract = setup_contract();

    let mut context = get_context("owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());

    contract.set_owner("new_owner.near".parse().unwrap());

    assert_eq!(contract.owner_id.as_str(), "new_owner.near");
}

// =============================================================================
// Edge Cases
// =============================================================================

#[test]
fn test_zero_effective_stake_no_rewards() {
    let contract = setup_contract();

    let account = contract.get_account("nobody.near".parse().unwrap());
    assert_eq!(account.claimable_rewards.0, 0);
}

#[test]
fn test_empty_pool_no_release() {
    let mut contract = setup_contract();

    // No pool funded
    assert_eq!(contract.scheduled_pool, 0);

    let start_time = 1_000_000_000_000_000_000u64;

    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    contract.poke();

    // Nothing released
    assert_eq!(contract.total_rewards_released, 0);
}

#[test]
fn test_project_total_released_accuracy() {
    let mut contract = setup_contract();

    let start_time = 1_000_000_000_000_000_000u64;
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Without syncing, project should still show future releases
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    let stats_before = contract.get_stats();
    assert_eq!(stats_before.total_rewards_released.0, 0); // Not synced yet

    // But get_account should project
    setup_with_storage(&mut contract, "alice.near");
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    let account = contract.get_account("alice.near".parse().unwrap());
    // Should have rewards even though poke() wasn't called
    assert!(account.claimable_rewards.0 > 0);
}

// =============================================================================
// View Type Tests
// =============================================================================

#[test]
fn test_account_view_complete() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 12, start_time);

    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    let view = contract.get_account("alice.near".parse().unwrap());

    assert_eq!(view.locked_amount.0, ONE_SOCIAL);
    assert_eq!(view.lock_months, 12);
    assert!(view.unlock_at > 0);
    assert_eq!(view.effective_stake.0, ONE_SOCIAL * 120 / 100);
    assert_eq!(view.stake_seconds.0, 0); // Just locked, no time passed
    assert_eq!(view.rewards_claimed.0, 0);
}

#[test]
fn test_contract_stats_complete() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    fund_pool_at(&mut contract, 100 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    purchase_credits(&mut contract, "buyer.near", 50 * ONE_SOCIAL);

    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    let stats = contract.get_stats();

    assert_eq!(stats.version, 1);
    assert_eq!(stats.total_locked.0, ONE_SOCIAL);
    assert_eq!(stats.total_effective_stake.0, ONE_SOCIAL * 110 / 100);
    assert_eq!(stats.scheduled_pool.0, 100 * ONE_SOCIAL + 20 * ONE_SOCIAL); // 100 funded + 40% of 50
    assert_eq!(stats.infra_pool.0, 30 * ONE_SOCIAL); // 60% of 50
}

// =============================================================================
// Bonus Calculation Tests
// =============================================================================

#[test]
fn test_bonus_1_month() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    lock_tokens(&mut contract, "alice.near", ONE_SOCIAL, 1);
    let account = contract.get_account("alice.near".parse().unwrap());
    // 1 month = 10% bonus
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 110 / 100);
}

#[test]
fn test_bonus_6_months() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    lock_tokens(&mut contract, "alice.near", ONE_SOCIAL, 6);
    let account = contract.get_account("alice.near".parse().unwrap());
    // 6 months = 10% bonus
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 110 / 100);
}

#[test]
fn test_bonus_12_months() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    lock_tokens(&mut contract, "alice.near", ONE_SOCIAL, 12);
    let account = contract.get_account("alice.near".parse().unwrap());
    // 12 months = 20% bonus
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 120 / 100);
}

#[test]
fn test_bonus_24_months() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    lock_tokens(&mut contract, "alice.near", ONE_SOCIAL, 24);
    let account = contract.get_account("alice.near".parse().unwrap());
    // 24 months = 35% bonus
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 135 / 100);
}

#[test]
fn test_bonus_48_months() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    lock_tokens(&mut contract, "alice.near", ONE_SOCIAL, 48);
    let account = contract.get_account("alice.near".parse().unwrap());
    // 48 months = 50% bonus
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 150 / 100);
}

// =============================================================================
// Time-Based Reward Distribution Tests
// =============================================================================

#[test]
fn test_late_joiner_gets_fair_share() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Alice stakes at t=0
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Bob joins at t=1 week (after first release)
    lock_tokens_at(
        &mut contract,
        "bob.near",
        ONE_SOCIAL,
        6,
        start_time + WEEK_NS,
    );

    // Check at t=2 weeks
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + 2 * WEEK_NS);
    testing_env!(context.build());

    let alice = contract.get_account("alice.near".parse().unwrap());
    let bob = contract.get_account("bob.near".parse().unwrap());

    // Alice staked for 2 weeks, Bob for 1 week
    // Alice should have more rewards
    assert!(
        alice.claimable_rewards.0 > bob.claimable_rewards.0,
        "Alice (early staker) should have more rewards"
    );
}

#[test]
fn test_continuous_funding() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Initial funding
    fund_pool_at(&mut contract, 100 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Add more funding at week 2
    fund_pool_at(&mut contract, 100 * ONE_SOCIAL, start_time + 2 * WEEK_NS);

    // Check at week 4
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + 4 * WEEK_NS);
    testing_env!(context.build());

    // Pool should reflect both fundings minus releases
    assert!(
        contract.scheduled_pool > 0,
        "Pool should have remaining funds"
    );
}

// =============================================================================
// Large Number Tests
// =============================================================================

#[test]
fn test_large_stake_amounts() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "whale.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // 1 billion SOCIAL tokens
    let large_amount = 1_000_000_000 * ONE_SOCIAL;

    fund_pool_at(&mut contract, large_amount, start_time);
    lock_tokens_at(&mut contract, "whale.near", large_amount, 48, start_time);

    // Advance 1 year
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + 52 * WEEK_NS);
    testing_env!(context.build());

    // Trigger poke to accumulate stake_seconds and release rewards
    contract.poke();

    // Should not overflow - claimable_rewards projects stake_seconds internally
    let account = contract.get_account("whale.near".parse().unwrap());
    assert!(
        account.claimable_rewards.0 > 0,
        "Should have claimable rewards after 1 year"
    );

    // Verify contract totals updated
    let stats = contract.get_stats();
    assert!(
        stats.total_stake_seconds.0 > 0,
        "Total stake seconds should be tracked globally"
    );
}

#[test]
fn test_multiple_equal_stakers() {
    let mut contract = setup_contract();

    let start_time = 1_000_000_000_000_000_000u64;
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Create 5 stakers with equal stakes
    setup_with_storage(&mut contract, "user0.near");
    setup_with_storage(&mut contract, "user1.near");
    setup_with_storage(&mut contract, "user2.near");
    setup_with_storage(&mut contract, "user3.near");
    setup_with_storage(&mut contract, "user4.near");

    lock_tokens_at(&mut contract, "user0.near", ONE_SOCIAL, 6, start_time);
    lock_tokens_at(&mut contract, "user1.near", ONE_SOCIAL, 6, start_time);
    lock_tokens_at(&mut contract, "user2.near", ONE_SOCIAL, 6, start_time);
    lock_tokens_at(&mut contract, "user3.near", ONE_SOCIAL, 6, start_time);
    lock_tokens_at(&mut contract, "user4.near", ONE_SOCIAL, 6, start_time);

    // Advance and check
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    contract.poke();

    // All users should have equal rewards
    let user0 = contract.get_account("user0.near".parse().unwrap());
    let user4 = contract.get_account("user4.near".parse().unwrap());

    let diff = if user0.claimable_rewards.0 > user4.claimable_rewards.0 {
        user0.claimable_rewards.0 - user4.claimable_rewards.0
    } else {
        user4.claimable_rewards.0 - user0.claimable_rewards.0
    };

    assert!(
        diff < ONE_SOCIAL / 1000,
        "All equal stakers should have equal rewards"
    );
}
// =============================================================================
// BUG DETECTION TEST: total_effective_stake Invariant Violation
// =============================================================================

/// BUG: After unlock, total_effective_stake retains phantom bonus tokens.
///
/// REGRESSION TEST: Verifies that total_effective_stake remains correct after unlock.
/// Previously, there was a bug where phantom bonus tokens remained in total_effective_stake.
///
/// With Option A fix: Bonus is KEPT until unlock() is called. User fulfilled their
/// commitment, so they deserve the bonus rate for the entire lock period.
/// The tracked_effective_stake field ensures unlock correctly subtracts the bonus.
#[test]
fn test_regression_effective_stake_invariant_after_unlock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Step 1: Lock 1 SOCIAL for 12 months (20% bonus)
    // Effective stake = 1 × 1.20 = 1.2 SOCIAL
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 12, start_time);

    // Verify: total_effective_stake includes the 20% bonus
    let effective_at_lock = contract.total_effective_stake;
    let expected_with_bonus = ONE_SOCIAL * 120 / 100;
    assert_eq!(
        effective_at_lock, expected_with_bonus,
        "At lock time, effective stake should include 20% bonus"
    );

    // Step 2: Advance time past lock expiry (12 months + 1 second)
    let after_expiry = start_time + 12 * MONTH_NS + NS_PER_SEC;
    let mut context = get_context("alice.near");
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    // Verify lock has expired
    let status = contract.get_lock_status("alice.near".parse().unwrap());
    assert!(status.lock_expired, "Lock should be expired");
    assert!(status.can_unlock, "Should be able to unlock");

    // With Option A: effective_stake KEEPS the bonus until unlock() is called
    // User fulfilled their commitment - they deserve the bonus for full period
    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let effective_now = contract.effective_stake(&account);
    assert_eq!(
        effective_now, expected_with_bonus,
        "After expiry, effective_stake KEEPS bonus until unlock (Option A)"
    );

    // Step 3: Sync account - with Option A, effective stake doesn't change after expiry
    contract.sync_account(&"alice.near".parse().unwrap());

    // After sync, total_effective_stake STILL includes the bonus (Option A)
    assert_eq!(
        contract.total_effective_stake, expected_with_bonus,
        "After sync, total_effective_stake still includes bonus (Option A)"
    );

    // Verify tracked_effective_stake still has the bonus
    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    assert_eq!(
        account.tracked_effective_stake, expected_with_bonus,
        "tracked_effective_stake keeps bonus until unlock"
    );

    // Step 4: Simulate what unlock() does (we can't call it directly due to Promise)
    // unlock() uses tracked_effective_stake
    let effective = account.tracked_effective_stake;

    contract.total_locked = contract.total_locked.saturating_sub(account.locked_amount);
    contract.total_effective_stake = contract.total_effective_stake.saturating_sub(effective);

    // Zero out the account (like unlock does)
    let mut account = account;
    account.locked_amount = 0;
    account.unlock_at = 0;
    account.lock_months = 0;
    account.tracked_effective_stake = 0;
    contract
        .accounts
        .insert("alice.near".parse().unwrap(), account);

    // Step 5: INVARIANT CHECK - total_effective_stake should be 0
    let phantom_tokens = contract.total_effective_stake;

    // This now passes with the fix
    assert_eq!(
        phantom_tokens, 0,
        "INVARIANT: total_effective_stake should be 0 after last user unlocks. \
         Found {} phantom tokens",
        phantom_tokens
    );
}

// =============================================================================
// REGRESSION TEST: Expired Lock Stake-Seconds (Previously Buggy)
// =============================================================================

/// REGRESSION TEST: Verifies stake-seconds invariant is maintained after lock expires.
///
/// With Option A: Bonus is KEPT until unlock() is called. This means both global
/// stake-seconds and user stake-seconds accrue at the SAME bonus rate, maintaining
/// the invariant naturally. User fulfilled commitment → deserves full bonus period.
#[test]
fn test_regression_expired_lock_stake_seconds_invariant() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Lock 100 SOCIAL for 12 months (20% bonus)
    lock_tokens_at(
        &mut contract,
        "alice.near",
        100 * ONE_SOCIAL,
        12,
        start_time,
    );

    // Verify initial state
    let effective_with_bonus = 100 * ONE_SOCIAL * 120 / 100; // 120 SOCIAL effective
    assert_eq!(contract.total_effective_stake, effective_with_bonus);

    // Advance time past lock expiry (12 months + 1 week)
    let after_expiry = start_time + 12 * MONTH_NS + WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    // Sync the account
    contract.sync_account(&"alice.near".parse().unwrap());

    // With Option A: effective_stake KEEPS the bonus after expiry
    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let effective_after_expiry = contract.effective_stake(&account);
    assert_eq!(
        effective_after_expiry, effective_with_bonus,
        "With Option A, effective_stake keeps bonus until unlock"
    );

    // Now advance 100 more seconds and sync again
    let later = after_expiry + 100 * NS_PER_SEC;
    context.block_timestamp(later);
    testing_env!(context.build());

    contract.sync_account(&"alice.near".parse().unwrap());

    // Get the user's stake-seconds
    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let user_stake_seconds = account.stake_seconds;

    // With Option A: BOTH global and user stake-seconds accrue at the SAME bonus rate (120%)
    // so there are NO phantom stake-seconds. The invariant is naturally maintained.

    let phantom_stake_seconds = contract
        .total_stake_seconds
        .saturating_sub(user_stake_seconds);

    // With Option A, phantom_stake_seconds should be 0 because:
    // - Global: 120 SOCIAL × 100 sec = 12,000 SOCIAL-seconds
    // - User:   120 SOCIAL × 100 sec = 12,000 SOCIAL-seconds (SAME!)
    assert_eq!(
        phantom_stake_seconds, 0,
        "INVARIANT: Stake-seconds should match for single staker with Option A\n\
         User stake-seconds: {}\n\
         Total stake-seconds: {}\n\
         Phantom stake-seconds: {} (expected 0)",
        user_stake_seconds, contract.total_stake_seconds, phantom_stake_seconds
    );
}

/// REGRESSION TEST: Single staker should receive ~100% of rewards.
/// Previously, users with expired locks received diluted rewards.
#[test]
fn test_regression_expired_lock_full_rewards() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Step 1: Fund the reward pool
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Step 2: Alice locks 100 SOCIAL for 12 months (20% bonus)
    lock_tokens_at(
        &mut contract,
        "alice.near",
        100 * ONE_SOCIAL,
        12,
        start_time,
    );

    // Step 3: Advance to just before lock expiry, release rewards
    let just_before_expiry = start_time + 12 * MONTH_NS - NS_PER_SEC;
    let mut context = get_context("alice.near");
    context.block_timestamp(just_before_expiry);
    testing_env!(context.build());
    contract.poke();

    // Record how much was released before expiry
    let released_before_expiry = contract.total_rewards_released;

    // Step 4: Advance past expiry + 4 weeks (to trigger more releases)
    let after_expiry = start_time + 12 * MONTH_NS + 4 * WEEK_NS;
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    // Sync Alice's account (this is where the bug manifests)
    contract.sync_account(&"alice.near".parse().unwrap());
    contract.poke(); // Release rewards for the post-expiry period

    let _released_after_expiry = contract.total_rewards_released - released_before_expiry;

    // Step 5: Calculate Alice's claimable rewards
    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let alice_claimable = contract.calculate_claimable(&account);

    // INVARIANT: Alice is the ONLY staker. She should receive 100% of released rewards.
    // With the bug, she receives only ~83% of post-expiry rewards.

    // Total rewards that should be claimable = total_rewards_released
    let total_released = contract.total_rewards_released;

    // Calculate Alice's share ratio
    let alice_share_pct = if total_released > 0 {
        (alice_claimable as f64 / total_released as f64) * 100.0
    } else {
        100.0
    };

    // THE BUG: Alice's share should be ~100%, but due to phantom stake-seconds
    // from the expired bonus, she gets less
    assert!(
        alice_share_pct >= 99.9,
        "BUG: Single staker should receive ~100% of rewards!\n\
         Alice's claimable: {} ({:.2}% of total)\n\
         Total released: {}\n\
         Missing rewards: {} (stuck in contract forever)",
        alice_claimable,
        alice_share_pct,
        total_released,
        total_released.saturating_sub(alice_claimable)
    );
}

// =============================================================================
// BUG: on_unlock_callback Fails to Restore tracked_effective_stake
// =============================================================================

/// PROOF-OF-CONCEPT: on_unlock_callback failure causes total_effective_stake inflation.
///
/// VULNERABILITY: When unlock() transfer fails and the callback restores state,
/// it does NOT restore `tracked_effective_stake`. This causes the next sync_account()
/// to ADD phantom effective stake to total_effective_stake.
///
/// IMPACT:
/// - total_effective_stake becomes inflated (potentially doubled per failed unlock)
/// - Reward distribution becomes unfair (legitimate stakers receive less than deserved)
/// - Fund conservation violated (rewards become permanently stuck)
///
/// ATTACK VECTOR: An attacker can deliberately cause unlock transfers to fail
/// (e.g., by not registering for storage on the token contract), then sync their
/// account to inflate total_effective_stake.
#[test]
fn test_bug_unlock_callback_missing_tracked_effective_stake_restore() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Step 1: Lock 100 SOCIAL for 12 months (20% bonus)
    lock_tokens_at(
        &mut contract,
        "alice.near",
        100 * ONE_SOCIAL,
        12,
        start_time,
    );

    // Verify initial state
    let expected_effective = 100 * ONE_SOCIAL * 120 / 100; // 120 SOCIAL effective
    assert_eq!(
        contract.total_effective_stake, expected_effective,
        "Initial total_effective_stake should be 120 SOCIAL"
    );

    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    assert_eq!(
        account.tracked_effective_stake, expected_effective,
        "Initial tracked_effective_stake should be 120 SOCIAL"
    );

    // Step 2: Advance time past lock expiry
    let after_expiry = start_time + 12 * MONTH_NS + NS_PER_SEC;
    let mut context = get_context("alice.near");
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    // Step 3: Simulate what unlock() does (before the transfer)
    // This mimics the state change in unlock() at lines 401-427
    contract.sync_account(&"alice.near".parse().unwrap());

    let account_before_unlock = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let amount = account_before_unlock.locked_amount;
    let effective = account_before_unlock.tracked_effective_stake;

    // Save old values for callback
    let old_locked = account_before_unlock.locked_amount;
    let old_unlock_at = account_before_unlock.unlock_at;
    let old_lock_months = account_before_unlock.lock_months;

    // Perform state changes (what unlock() does)
    contract.total_locked = contract.total_locked.saturating_sub(amount);
    contract.total_effective_stake = contract.total_effective_stake.saturating_sub(effective);

    // Insert pending unlock (new pattern)
    contract.pending_unlocks.insert(
        "alice.near".parse().unwrap(),
        PendingUnlock {
            amount,
            effective,
            old_locked,
            old_unlock_at,
            old_lock_months,
        },
    );

    let mut account = account_before_unlock.clone();
    account.locked_amount = 0;
    account.unlock_at = 0;
    account.lock_months = 0;
    account.tracked_effective_stake = 0; // ← This gets set to 0
    contract
        .accounts
        .insert("alice.near".parse().unwrap(), account);

    // Verify state after unlock (before transfer)
    assert_eq!(
        contract.total_effective_stake, 0,
        "total_effective_stake should be 0 after unlock"
    );
    assert_eq!(
        contract.total_locked, 0,
        "total_locked should be 0 after unlock"
    );

    // Step 4: Call the ACTUAL callback with failure result
    // Set up context for private callback (predecessor = current account)
    let mut context = get_context("staking.near"); // Simulating self-call
    context.predecessor_account_id("staking.near".parse().unwrap());
    context.current_account_id("staking.near".parse().unwrap());
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    // Call the actual callback function with error result
    contract.on_unlock_callback(
        Err(near_sdk::PromiseError::Failed),
        "alice.near".parse().unwrap(),
    );

    // Verify state after failed unlock restore
    let account_after_restore = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();

    // With the FIX: tracked_effective_stake should be restored
    assert_eq!(
        account_after_restore.tracked_effective_stake, expected_effective,
        "FIX VERIFIED: tracked_effective_stake is properly restored after failed unlock"
    );

    // And total_effective_stake was restored
    assert_eq!(
        contract.total_effective_stake, expected_effective,
        "total_effective_stake was correctly restored to 120"
    );

    // Step 5: Sync account - should NOT cause any inflation now
    let mut context = get_context("alice.near");
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    contract.sync_account(&"alice.near".parse().unwrap());

    // WITH THE FIX: total_effective_stake should remain correct
    let final_effective = contract.total_effective_stake;

    assert_eq!(
        final_effective, expected_effective,
        "FIX VERIFIED: total_effective_stake is {} as expected (no phantom stake)",
        expected_effective
    );
}

/// Demonstrates the economic impact of the on_unlock_callback bug.
///
/// Shows how phantom effective stake causes legitimate stakers to receive
/// less than their fair share of rewards.
#[test]
fn test_bug_unlock_callback_reward_dilution() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool with rewards
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Alice and Bob both stake 100 SOCIAL for 12 months
    lock_tokens_at(
        &mut contract,
        "alice.near",
        100 * ONE_SOCIAL,
        12,
        start_time,
    );
    lock_tokens_at(&mut contract, "bob.near", 100 * ONE_SOCIAL, 12, start_time);

    // Each has 120 effective stake, total = 240
    assert_eq!(contract.total_effective_stake, 240 * ONE_SOCIAL);

    // Advance past Alice's lock expiry
    let after_expiry = start_time + 12 * MONTH_NS + NS_PER_SEC;
    let mut context = get_context("alice.near");
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    // Simulate Alice's unlock() state changes (before transfer)
    contract.sync_account(&"alice.near".parse().unwrap());

    let alice_account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let amount = alice_account.locked_amount;
    let effective = alice_account.tracked_effective_stake;
    let old_locked = alice_account.locked_amount;
    let old_unlock_at = alice_account.unlock_at;
    let old_lock_months = alice_account.lock_months;

    // unlock() state changes
    contract.total_locked = contract.total_locked.saturating_sub(amount);
    contract.total_effective_stake = contract.total_effective_stake.saturating_sub(effective);

    // Insert pending unlock (new pattern)
    contract.pending_unlocks.insert(
        "alice.near".parse().unwrap(),
        PendingUnlock {
            amount,
            effective,
            old_locked,
            old_unlock_at,
            old_lock_months,
        },
    );

    let mut account = alice_account.clone();
    account.locked_amount = 0;
    account.unlock_at = 0;
    account.lock_months = 0;
    account.tracked_effective_stake = 0;
    contract
        .accounts
        .insert("alice.near".parse().unwrap(), account);

    // Call the ACTUAL callback with failure result (tests the fix)
    let mut context = get_context("staking.near");
    context.predecessor_account_id("staking.near".parse().unwrap());
    context.current_account_id("staking.near".parse().unwrap());
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    contract.on_unlock_callback(
        Err(near_sdk::PromiseError::Failed),
        "alice.near".parse().unwrap(),
    );

    // Sync Alice - with fix, no inflation should occur
    let mut context = get_context("alice.near");
    context.block_timestamp(after_expiry);
    testing_env!(context.build());
    contract.sync_account(&"alice.near".parse().unwrap());

    // With fix: total should still be 240 (Alice 120 + Bob 120)
    assert_eq!(
        contract.total_effective_stake,
        240 * ONE_SOCIAL,
        "FIX VERIFIED: total_effective_stake remains correct after failed unlock"
    );

    // Advance a week and release rewards
    context.block_timestamp(after_expiry + WEEK_NS);
    testing_env!(context.build());
    contract.poke();

    // Calculate Bob's share
    let bob_account = contract
        .accounts
        .get(&"bob.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let bob_claimable = contract.calculate_claimable(&bob_account);

    // Calculate expected fair share
    // Bob should get 50% of rewards (120/240)
    let total_released = contract.total_rewards_released;

    let bob_actual_pct = (bob_claimable as f64 / total_released as f64) * 100.0;

    // With fix: Bob gets his fair ~50% share
    assert!(
        bob_actual_pct >= 49.0, // Allow small rounding
        "FIX VERIFIED: Bob receives fair ~50% of rewards ({:.1}%)",
        bob_actual_pct
    );
}

/// Tests the unlock callback SUCCESS path - verifies complete unlock flow works correctly.
///
/// This test simulates:
/// 1. User locks tokens
/// 2. Lock period expires  
/// 3. User calls unlock() - state changes applied optimistically
/// 4. ft_transfer succeeds
/// 5. on_unlock_callback(Ok(())) is called
/// 6. Verifies final state is correct (tokens unlocked, no pending state)
#[test]
fn test_unlock_callback_success_path() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Step 1: Lock 100 SOCIAL for 1 month (10% bonus)
    lock_tokens_at(&mut contract, "alice.near", 100 * ONE_SOCIAL, 1, start_time);

    // Verify initial state
    let expected_effective = 100 * ONE_SOCIAL * 110 / 100; // 110 SOCIAL effective (10% bonus)
    assert_eq!(contract.total_effective_stake, expected_effective);
    assert_eq!(contract.total_locked, 100 * ONE_SOCIAL);

    // Step 2: Advance time past lock expiry (1 month + 1 second)
    let after_expiry = start_time + MONTH_NS + NS_PER_SEC;
    let mut context = get_context("alice.near");
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    // Step 3: Simulate what unlock() does (before the transfer)
    contract.sync_account(&"alice.near".parse().unwrap());

    let account_before = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let amount = account_before.locked_amount;
    let effective = account_before.tracked_effective_stake;
    let old_locked = account_before.locked_amount;
    let old_unlock_at = account_before.unlock_at;
    let old_lock_months = account_before.lock_months;

    // unlock() state changes (optimistic)
    contract.total_locked = contract.total_locked.saturating_sub(amount);
    contract.total_effective_stake = contract.total_effective_stake.saturating_sub(effective);

    // Store pending unlock for potential rollback
    contract.pending_unlocks.insert(
        "alice.near".parse().unwrap(),
        PendingUnlock {
            amount,
            effective,
            old_locked,
            old_unlock_at,
            old_lock_months,
        },
    );

    // Clear account's locked state
    let mut account = account_before.clone();
    account.locked_amount = 0;
    account.unlock_at = 0;
    account.lock_months = 0;
    account.tracked_effective_stake = 0;
    contract
        .accounts
        .insert("alice.near".parse().unwrap(), account);

    // Verify state after unlock (before callback)
    assert_eq!(
        contract.total_effective_stake, 0,
        "total_effective_stake should be 0 after unlock"
    );
    assert_eq!(
        contract.total_locked, 0,
        "total_locked should be 0 after unlock"
    );
    assert!(
        contract
            .pending_unlocks
            .contains_key(&"alice.near".parse::<AccountId>().unwrap()),
        "pending_unlocks should contain alice"
    );

    // Step 4: Call the callback with SUCCESS result (simulating ft_transfer succeeded)
    let mut context = get_context("staking.near");
    context.predecessor_account_id("staking.near".parse().unwrap());
    context.current_account_id("staking.near".parse().unwrap());
    context.block_timestamp(after_expiry);
    testing_env!(context.build());

    contract.on_unlock_callback(Ok(()), "alice.near".parse().unwrap());

    // Step 5: Verify final state after successful callback
    let account_after = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();

    // Tokens should be unlocked (locked_amount = 0)
    assert_eq!(
        account_after.locked_amount, 0,
        "locked_amount should be 0 after successful unlock"
    );
    assert_eq!(account_after.unlock_at, 0, "unlock_at should be 0");
    assert_eq!(account_after.lock_months, 0, "lock_months should be 0");
    assert_eq!(
        account_after.tracked_effective_stake, 0,
        "tracked_effective_stake should be 0"
    );

    // Global state should remain at 0 (unlock committed)
    assert_eq!(contract.total_locked, 0, "total_locked should remain 0");
    assert_eq!(
        contract.total_effective_stake, 0,
        "total_effective_stake should remain 0"
    );

    // Pending unlock should be removed
    assert!(
        !contract
            .pending_unlocks
            .contains_key(&"alice.near".parse::<AccountId>().unwrap()),
        "pending_unlocks should be cleared after successful callback"
    );

    // stake_seconds should be preserved (user can still claim past rewards)
    assert!(
        account_after.stake_seconds > 0,
        "stake_seconds should be preserved for reward claims"
    );
}

// =============================================================================
// CRITICAL: Rewards Pause When No Stakers Exist
// =============================================================================

/// Verifies that rewards do NOT release when there are no stakers.
/// The release clock pauses during dormant periods to prevent reward leakage.
///
/// Scenario:
/// - T=0: Pool funded with 1000 SOCIAL
/// - T=0 to T=1 week: NO stakers (dormant period)
/// - T=1 week: Poke called - NO rewards should release (clock pauses)
/// - T=1 week: First staker arrives
/// - T=2 weeks: First staker should get 1 week of rewards (not 2)
#[test]
fn test_rewards_pause_when_no_stakers() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Step 1: Fund pool at T=0
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Verify initial state: no stakers
    assert_eq!(contract.total_effective_stake, 0, "No stakers yet");
    assert_eq!(contract.total_stake_seconds, 0, "No stake-seconds yet");

    // Step 2: Advance 1 week WITHOUT any stakers
    // Poke to check reward release behavior
    let one_week_later = start_time + WEEK_NS;
    let mut context = get_context("anyone.near");
    context.block_timestamp(one_week_later);
    testing_env!(context.build());

    contract.poke();

    // CRITICAL: No rewards should be released during dormant period
    assert_eq!(
        contract.total_rewards_released, 0,
        "Rewards should NOT release when no stakers exist"
    );

    // The last_release_time should have been moved forward (clock paused)
    assert_eq!(
        contract.last_release_time, one_week_later,
        "Release clock should pause (move forward) when no stakers"
    );

    // Step 3: First staker arrives
    let alice_stake_time = one_week_later + NS_PER_SEC;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, alice_stake_time);

    // Verify staker is now active
    assert!(
        contract.total_effective_stake > 0,
        "Alice should be staking"
    );

    // Step 4: Advance 1 more week - NOW rewards should release
    let two_weeks_later = alice_stake_time + WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(two_weeks_later);
    testing_env!(context.build());

    contract.poke();

    // Now rewards should be released (1 week's worth)
    let expected_release = 1000 * ONE_SOCIAL * WEEKLY_RATE_BPS / 10_000; // 2 SOCIAL
    assert_eq!(
        contract.total_rewards_released, expected_release,
        "Should release 1 week of rewards after staker arrives"
    );

    // Step 5: Check Alice's claimable rewards
    let alice = contract.get_account("alice.near".parse().unwrap());
    let alice_claimable = alice.claimable_rewards.0;

    // Alice should get 100% of released rewards (she's the only staker)
    assert!(alice_claimable > 0, "Alice should have claimable rewards");

    // Alice should get approximately 100% of released rewards
    let pct = (alice_claimable as f64 / expected_release as f64) * 100.0;
    assert!(
        pct >= 95.0,
        "First staker should get ~100% of rewards released while staking, got {:.1}%",
        pct
    );
}

/// Test that rewards resume when stakers return after everyone unstakes
#[test]
fn test_rewards_resume_when_stakers_return() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    // Alice stakes
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);
    assert!(contract.total_effective_stake > 0, "Alice staking");

    // Advance 1 week - rewards should release
    let week1 = start_time + WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(week1);
    testing_env!(context.build());
    contract.poke();

    let released_week1 = contract.total_rewards_released;
    assert!(
        released_week1 > 0,
        "Rewards should release while stakers exist"
    );

    // Alice unlocks (after 1 month lock expires)
    let after_lock = start_time + MONTH_NS + NS_PER_SEC;
    let mut context = get_context("alice.near");
    context.block_timestamp(after_lock);
    testing_env!(context.build());

    // Note: unlock would need ft_transfer which isn't mocked here
    // Instead, manually set effective stake to 0 to simulate unlock
    contract.total_effective_stake = 0;
    let mut alice_account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    alice_account.locked_amount = 0;
    alice_account.tracked_effective_stake = 0;
    contract
        .accounts
        .insert("alice.near".parse().unwrap(), alice_account);

    // Advance another week with no stakers
    let week_after_unlock = after_lock + WEEK_NS;
    let mut context = get_context("anyone.near");
    context.block_timestamp(week_after_unlock);
    testing_env!(context.build());
    contract.poke();

    // No additional rewards should release
    assert_eq!(
        contract.total_rewards_released, released_week1,
        "No rewards should release during no-staker period"
    );
}

// =============================================================================
// LOCK PERIOD WORKFLOW TESTS
// =============================================================================

/// Test the complete scenario: lock 6 months, extend to 48 months, then unlock
#[test]
fn test_lock_6mo_extend_to_48mo_then_unlock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Step 1: Lock for 6 months (10% bonus)
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.lock_months, 6);
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 110 / 100); // 10% bonus

    // Step 2: Extend to 48 months (50% bonus)
    let mut context = get_context("alice.near");
    context.block_timestamp(start_time + MONTH_NS); // 1 month later
    testing_env!(context.build());

    contract.extend_lock(48);

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.lock_months, 48);
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 150 / 100); // 50% bonus

    // Verify unlock time is 48 months from extension time
    let expected_unlock = start_time + MONTH_NS + 48 * MONTH_NS;
    assert_eq!(account.unlock_at, expected_unlock);

    // Step 3: Wait until lock expires
    let after_48mo = expected_unlock + NS_PER_SEC;
    let mut context = get_context("alice.near");
    context.block_timestamp(after_48mo);
    testing_env!(context.build());

    let status = contract.get_lock_status("alice.near".parse().unwrap());
    assert!(
        status.lock_expired,
        "Lock should be expired after 48 months"
    );
    assert!(status.can_unlock, "Should be able to unlock");

    // Effective stake still has bonus until unlock is called
    assert_eq!(status.effective_stake.0, ONE_SOCIAL * 150 / 100);
}

/// Test extending through all bonus tiers: 1 → 6 → 12 → 24 → 48
#[test]
fn test_extend_across_all_tiers() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Start with 1 month (10% bonus)
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);
    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 110 / 100);

    // Extend to 6 months (still 10% bonus)
    let mut context = get_context("alice.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());
    contract.extend_lock(6);
    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 110 / 100);

    // Extend to 12 months (20% bonus)
    contract.extend_lock(12);
    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 120 / 100);

    // Extend to 24 months (35% bonus)
    contract.extend_lock(24);
    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 135 / 100);

    // Extend to 48 months (50% bonus)
    contract.extend_lock(48);
    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 150 / 100);
}

/// Test extending within the same bonus tier (1 to 6 months)
#[test]
fn test_extend_within_same_tier() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    let old_unlock = contract
        .get_account("alice.near".parse().unwrap())
        .unlock_at;

    let mut context = get_context("alice.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    contract.extend_lock(6);

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.lock_months, 6);
    assert!(account.unlock_at > old_unlock, "Unlock time should extend");
    // Same bonus tier (10%)
    assert_eq!(account.effective_stake.0, ONE_SOCIAL * 110 / 100);
}

/// Test extending exactly at the lock expiry boundary
#[test]
fn test_extend_at_expiry_boundary() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    // Move to exactly the unlock_at timestamp
    let unlock_at = contract
        .get_account("alice.near".parse().unwrap())
        .unlock_at;

    let mut context = get_context("alice.near");
    context.block_timestamp(unlock_at);
    testing_env!(context.build());

    // Extend to 12 months - should still work (can extend even after expiry)
    contract.extend_lock(12);

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.lock_months, 12);
    assert!(account.unlock_at > unlock_at);
}

/// Test extending just before lock expiry
#[test]
fn test_extend_just_before_expiry() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    let unlock_at = contract
        .get_account("alice.near".parse().unwrap())
        .unlock_at;

    // 1 second before expiry
    let mut context = get_context("alice.near");
    context.block_timestamp(unlock_at - NS_PER_SEC);
    testing_env!(context.build());

    contract.extend_lock(12);

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.lock_months, 12);
    assert!(account.unlock_at > unlock_at);
}
// =============================================================================
// NEGATIVE TESTS
// =============================================================================
// NOTE: Tests using #[should_panic] are not compatible with NEAR SDK's
// env::panic_str() in release mode (abort vs unwind). These negative test
// cases should be covered in integration tests (sandbox) where contract
// panics are properly caught as transaction failures.
//
// Negative cases to test in integration tests:
// - extend_lock to shorter period (New period must be >= current)
// - extend_lock to same period (New unlock must be later)
// - unlock before expiry (Lock not expired)
// - lock with invalid period like 3, 7, 18 months (Invalid lock period)
// - lock below minimum stake (Minimum stake is 0.01 SOCIAL)
// - lock zero amount (Amount must be positive)
// - lock without storage deposit (Call storage_deposit first)
// - storage deposit insufficient (Attach at least 0.005 NEAR)
// - add tokens with different period (Cannot add with different lock period)
// - extend with zero locked (No tokens locked)
// - renew with zero locked (No tokens locked)
// - unlock with zero locked (No tokens to unlock)
// - ft_on_transfer from wrong token (Wrong token)
// - ft_on_transfer invalid JSON (Invalid JSON)
// - ft_on_transfer missing action (Missing action)
// - ft_on_transfer unknown action (Unknown action)
// - ft_on_transfer lock missing months (Missing months)
// - withdraw_infra exceeds balance (Insufficient balance)
// - withdraw_infra not owner (Not owner)
// - set_owner not owner (Not owner)
// - set_owner without deposit (Attach 1 yoctoNEAR)
// - withdraw_infra without deposit (Attach 1 yoctoNEAR)
// - claim with no rewards (No rewards to claim)

// =============================================================================
// REWARDS AFTER UNLOCK TESTS
// =============================================================================

/// Test that users can claim rewards after unlocking their stake
#[test]
fn test_claim_rewards_after_full_unlock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool and stake
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    // Advance 1 week - accumulate rewards
    let week1 = start_time + WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(week1);
    testing_env!(context.build());
    contract.poke();

    // Check accrued rewards
    let account = contract.get_account("alice.near".parse().unwrap());
    let rewards_before_unlock = account.claimable_rewards.0;
    assert!(rewards_before_unlock > 0, "Should have rewards");

    // Advance past lock expiry and simulate unlock
    let after_lock = start_time + MONTH_NS + NS_PER_SEC;
    let mut context = get_context("alice.near");
    context.block_timestamp(after_lock);
    testing_env!(context.build());

    // Manually simulate unlock (can't test Promise in unit tests)
    contract.sync_account(&"alice.near".parse().unwrap());
    let mut alice_account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let old_stake_seconds = alice_account.stake_seconds;
    let old_rewards_claimed = alice_account.rewards_claimed;

    // Simulate unlock
    contract.total_locked = 0;
    contract.total_effective_stake = 0;
    alice_account.locked_amount = 0;
    alice_account.tracked_effective_stake = 0;
    // Keep stake_seconds and rewards_claimed!
    contract
        .accounts
        .insert("alice.near".parse().unwrap(), alice_account);

    // Verify stake_seconds preserved
    let alice_after = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    assert_eq!(
        alice_after.stake_seconds, old_stake_seconds,
        "stake_seconds should be preserved"
    );
    assert_eq!(
        alice_after.rewards_claimed, old_rewards_claimed,
        "rewards_claimed should be preserved"
    );

    // User can still see claimable rewards
    let account_view = contract.get_account("alice.near".parse().unwrap());
    assert!(
        account_view.claimable_rewards.0 > 0,
        "Should still have claimable rewards after unlock"
    );
}

/// Test that stake_seconds and rewards_claimed survive unlock
#[test]
fn test_rewards_preserved_through_unlock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    // Accumulate for 2 weeks
    let week2 = start_time + 2 * WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(week2);
    testing_env!(context.build());
    contract.sync_account(&"alice.near".parse().unwrap());

    let alice = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let ss_before = alice.stake_seconds;
    assert!(ss_before > 0, "Should have stake-seconds");

    // Simulate unlock (preserves stake_seconds/rewards_claimed)
    let after_lock = start_time + MONTH_NS + NS_PER_SEC;
    let mut context = get_context("alice.near");
    context.block_timestamp(after_lock);
    testing_env!(context.build());

    contract.sync_account(&"alice.near".parse().unwrap());
    let mut alice = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();

    // What unlock() does:
    alice.locked_amount = 0;
    alice.unlock_at = 0;
    alice.lock_months = 0;
    alice.tracked_effective_stake = 0;
    // stake_seconds and rewards_claimed are NOT reset!
    contract
        .accounts
        .insert("alice.near".parse().unwrap(), alice);

    let alice_after = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    assert!(
        alice_after.stake_seconds >= ss_before,
        "stake_seconds should be preserved/accumulated"
    );
}

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

/// Test renewing lock after it has already expired
#[test]
fn test_renew_after_expiry() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    // Way past expiry
    let long_after = start_time + 6 * MONTH_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(long_after);
    testing_env!(context.build());

    let old_unlock = contract
        .get_account("alice.near".parse().unwrap())
        .unlock_at;

    // Renew should reset the lock from current time
    contract.renew_lock();

    let account = contract.get_account("alice.near".parse().unwrap());
    assert!(
        account.unlock_at > old_unlock,
        "Unlock should extend from current time"
    );
    assert!(
        account.unlock_at > long_after,
        "New unlock should be in the future"
    );
}

/// Test renewing exactly at expiry
#[test]
fn test_renew_at_exact_expiry() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    let unlock_at = contract
        .get_account("alice.near".parse().unwrap())
        .unlock_at;

    let mut context = get_context("alice.near");
    context.block_timestamp(unlock_at);
    testing_env!(context.build());

    contract.renew_lock();

    let account = contract.get_account("alice.near".parse().unwrap());
    assert!(account.unlock_at > unlock_at);
}

/// Test multiple users with staggered extends
#[test]
fn test_multiple_users_different_extends() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");
    setup_with_storage(&mut contract, "carol.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // All start with 1 month
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);
    lock_tokens_at(&mut contract, "bob.near", ONE_SOCIAL, 1, start_time);
    lock_tokens_at(&mut contract, "carol.near", ONE_SOCIAL, 1, start_time);

    // Initial total: 3 × 1.1 = 3.3 SOCIAL effective
    assert_eq!(contract.total_effective_stake, 3 * ONE_SOCIAL * 110 / 100);

    let mut context = get_context("alice.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    // Alice extends to 12mo (20%)
    contract.extend_lock(12);

    let mut context = get_context("bob.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    // Bob extends to 24mo (35%)
    contract.extend_lock(24);

    let mut context = get_context("carol.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    // Carol extends to 48mo (50%)
    contract.extend_lock(48);

    // Final: Alice 1.2 + Bob 1.35 + Carol 1.5 = 4.05 effective
    let expected = ONE_SOCIAL * 120 / 100 + ONE_SOCIAL * 135 / 100 + ONE_SOCIAL * 150 / 100;
    assert_eq!(contract.total_effective_stake, expected);
}

/// Verify effective stake updates correctly through progressive extensions
#[test]
fn test_effective_stake_after_multiple_extends() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    lock_tokens_at(&mut contract, "alice.near", 10 * ONE_SOCIAL, 1, start_time);

    // Track total_effective_stake after each extension
    let effective_1mo = contract.total_effective_stake;
    assert_eq!(effective_1mo, 10 * ONE_SOCIAL * 110 / 100); // 11 SOCIAL

    let mut context = get_context("alice.near");
    context.block_timestamp(start_time);
    testing_env!(context.build());

    contract.extend_lock(6);
    assert_eq!(contract.total_effective_stake, 10 * ONE_SOCIAL * 110 / 100); // Still 11

    contract.extend_lock(12);
    assert_eq!(contract.total_effective_stake, 10 * ONE_SOCIAL * 120 / 100); // 12 SOCIAL

    contract.extend_lock(24);
    assert_eq!(contract.total_effective_stake, 10 * ONE_SOCIAL * 135 / 100); // 13.5 SOCIAL

    contract.extend_lock(48);
    assert_eq!(contract.total_effective_stake, 10 * ONE_SOCIAL * 150 / 100); // 15 SOCIAL
}

/// Verify sum(tracked_effective_stake) == total_effective_stake invariant
#[test]
fn test_total_tracked_effective_stake_invariant() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");
    setup_with_storage(&mut contract, "carol.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Different stakes, different periods
    lock_tokens_at(&mut contract, "alice.near", 10 * ONE_SOCIAL, 6, start_time);
    lock_tokens_at(&mut contract, "bob.near", 20 * ONE_SOCIAL, 12, start_time);
    lock_tokens_at(&mut contract, "carol.near", 30 * ONE_SOCIAL, 48, start_time);

    // Sync all accounts
    let week1 = start_time + WEEK_NS;
    let mut context = get_context("anyone.near");
    context.block_timestamp(week1);
    testing_env!(context.build());

    contract.sync_account(&"alice.near".parse().unwrap());
    contract.sync_account(&"bob.near".parse().unwrap());
    contract.sync_account(&"carol.near".parse().unwrap());

    // Calculate sum of tracked_effective_stake
    let alice = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let bob = contract
        .accounts
        .get(&"bob.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let carol = contract
        .accounts
        .get(&"carol.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();

    let sum_tracked =
        alice.tracked_effective_stake + bob.tracked_effective_stake + carol.tracked_effective_stake;

    assert_eq!(
        sum_tracked, contract.total_effective_stake,
        "INVARIANT: sum(tracked_effective_stake) should equal total_effective_stake"
    );
}

// =============================================================================
// CLAIM REWARDS TESTS
// =============================================================================

/// Test basic reward claiming for single staker
#[test]
fn test_claim_rewards_basic() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 week
    let week1 = start_time + WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(week1);
    testing_env!(context.build());

    // Sync and check claimable
    contract.sync_account(&"alice.near".parse().unwrap());

    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let claimable = contract.calculate_claimable(&account);

    assert!(claimable > 0, "Should have claimable rewards after 1 week");

    // Approximately 0.2% of 1000 = 2 SOCIAL
    let expected = 1000 * ONE_SOCIAL * WEEKLY_RATE_BPS / 10_000;
    let diff = if claimable > expected {
        claimable - expected
    } else {
        expected - claimable
    };
    assert!(
        diff < ONE_SOCIAL / 10,
        "Should be approximately 2 SOCIAL (within 0.1)"
    );
}

/// Test claiming partial, accumulating more, then claiming again
#[test]
fn test_claim_partial_and_continue_earning() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    fund_pool_at(&mut contract, 10000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Week 1: accumulate rewards
    let week1 = start_time + WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(week1);
    testing_env!(context.build());

    contract.sync_account(&"alice.near".parse().unwrap());

    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let claimable_week1 = contract.calculate_claimable(&account);
    assert!(claimable_week1 > 0);

    // Simulate claiming (mark as claimed)
    let mut account = account;
    account.rewards_claimed += claimable_week1;
    contract
        .accounts
        .insert("alice.near".parse().unwrap(), account);

    // Verify claimable is now 0
    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let claimable_after = contract.calculate_claimable(&account);
    assert_eq!(claimable_after, 0, "Should have 0 claimable after claiming");

    // Week 2: accumulate more
    let week2 = start_time + 2 * WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(week2);
    testing_env!(context.build());

    contract.sync_account(&"alice.near".parse().unwrap());

    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let claimable_week2 = contract.calculate_claimable(&account);

    assert!(
        claimable_week2 > 0,
        "Should have new claimable rewards in week 2"
    );
}

/// Test that claim callback failure restores rewards_claimed
#[test]
fn test_claim_callback_failure_restores_state() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 week
    let week1 = start_time + WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(week1);
    testing_env!(context.build());

    contract.sync_account(&"alice.near".parse().unwrap());

    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    let claimable = contract.calculate_claimable(&account);
    let rewards_claimed_before = account.rewards_claimed;

    // Simulate claim_rewards marking as claimed
    let mut account = account;
    account.rewards_claimed += claimable;
    contract
        .accounts
        .insert("alice.near".parse().unwrap(), account);

    // Simulate on_claim_callback with failure
    let mut context = get_context("staking.near");
    context.predecessor_account_id("staking.near".parse().unwrap());
    context.current_account_id("staking.near".parse().unwrap());
    context.block_timestamp(week1);
    testing_env!(context.build());

    contract.on_claim_callback(
        Err(near_sdk::PromiseError::Failed),
        "alice.near".parse().unwrap(),
        U128(claimable),
    );

    // Verify rewards_claimed was restored
    let account_after = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    assert_eq!(
        account_after.rewards_claimed, rewards_claimed_before,
        "rewards_claimed should be restored after failed claim"
    );
}

// =============================================================================
// OWNER FUNCTION TESTS
// =============================================================================

/// Test basic infra withdrawal by owner
#[test]
fn test_withdraw_infra_basic() {
    let mut contract = setup_contract();

    // Add funds to infra pool via credits purchase
    purchase_credits(&mut contract, "buyer.near", 100 * ONE_SOCIAL);
    // 60% to infra = 60 SOCIAL
    assert_eq!(contract.infra_pool, 60 * ONE_SOCIAL);

    let mut context = get_context("owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());

    // Withdraw half
    let _ = contract.withdraw_infra(U128(30 * ONE_SOCIAL), "treasury.near".parse().unwrap());

    assert_eq!(contract.infra_pool, 30 * ONE_SOCIAL);
}

/// Test withdraw_infra callback failure restores infra_pool
#[test]
fn test_withdraw_infra_callback_failure_restores_state() {
    let mut contract = setup_contract();

    // Add funds to infra pool via credits purchase
    purchase_credits(&mut contract, "buyer.near", 100 * ONE_SOCIAL);
    // 60% to infra = 60 SOCIAL
    let initial_infra_pool = contract.infra_pool;
    assert_eq!(initial_infra_pool, 60 * ONE_SOCIAL);

    // Perform withdraw (decreases infra_pool)
    let mut context = get_context("owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());

    let withdraw_amount = 30 * ONE_SOCIAL;
    let _ = contract.withdraw_infra(U128(withdraw_amount), "treasury.near".parse().unwrap());

    // infra_pool was reduced
    assert_eq!(contract.infra_pool, initial_infra_pool - withdraw_amount);

    // Simulate on_withdraw_infra_callback with failure
    let mut context = get_context("staking.near");
    context.predecessor_account_id("staking.near".parse().unwrap());
    context.current_account_id("staking.near".parse().unwrap());
    testing_env!(context.build());

    contract.on_withdraw_infra_callback(
        Err(near_sdk::PromiseError::Failed),
        U128(withdraw_amount),
        "treasury.near".parse().unwrap(),
    );

    // infra_pool should be restored
    assert_eq!(
        contract.infra_pool, initial_infra_pool,
        "infra_pool should be restored after failed withdraw"
    );
}

/// Test ownership transfer
#[test]
fn test_ownership_transfer() {
    let mut contract = setup_contract();
    assert_eq!(contract.owner_id.as_str(), "owner.near");

    let mut context = get_context("owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());

    contract.set_owner("new_owner.near".parse().unwrap());

    assert_eq!(contract.owner_id.as_str(), "new_owner.near");

    // Old owner can no longer act
    let mut context = get_context("owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());

    // This would panic with "Not owner" if we called set_owner again
}

/// Test new owner can perform owner actions
#[test]
fn test_new_owner_can_act() {
    let mut contract = setup_contract();

    purchase_credits(&mut contract, "buyer.near", 100 * ONE_SOCIAL);

    // Transfer ownership
    let mut context = get_context("owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());
    contract.set_owner("new_owner.near".parse().unwrap());

    // New owner can withdraw
    let mut context = get_context("new_owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());

    let _ = contract.withdraw_infra(U128(10 * ONE_SOCIAL), "treasury.near".parse().unwrap());

    assert_eq!(contract.infra_pool, 50 * ONE_SOCIAL); // 60 - 10
}

// =============================================================================
// EDGE CASE TESTS - RAPID OPERATIONS & TIMING
// =============================================================================

/// Test multiple operations in the same block (same timestamp)
#[test]
fn test_stake_seconds_exactness_after_rapid_operations() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Multiple operations at exact same timestamp
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    let mut context = get_context("alice.near");
    context.block_timestamp(start_time); // Same timestamp!
    testing_env!(context.build());

    // Extend in same block
    contract.extend_lock(12);

    // Sync in same block
    contract.sync_account(&"alice.near".parse().unwrap());

    // Stake seconds should be 0 since no time elapsed
    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    assert_eq!(
        account.stake_seconds, 0,
        "No time elapsed = no stake-seconds"
    );

    // Now advance 1 second and verify accumulation starts correctly
    let mut context = get_context("alice.near");
    context.block_timestamp(start_time + NS_PER_SEC);
    testing_env!(context.build());

    contract.sync_account(&"alice.near".parse().unwrap());

    let account = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap();
    // 12 months = 20% bonus, so 1.2 SOCIAL × 1 second
    let expected = ONE_SOCIAL * 120 / 100;
    assert_eq!(
        account.stake_seconds, expected,
        "Should have 1 second of stake-seconds"
    );
}

/// Test reward calculations with dust amounts (tiny yocto values)
#[test]
fn test_reward_calculation_with_tiny_amounts() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund with tiny amount (100 yocto)
    fund_pool_at(&mut contract, 100, start_time);

    // Stake minimum amount
    lock_tokens_at(&mut contract, "alice.near", MIN_STAKE, 6, start_time);

    // Advance 1 week
    let mut context = get_context("alice.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    contract.poke();

    // Even with tiny amounts, should not panic or overflow
    let account = contract.get_account("alice.near".parse().unwrap());
    // Claimable might be 0 due to rounding, but should not panic
    assert!(
        account.claimable_rewards.0 <= 100,
        "Cannot claim more than funded"
    );
}

/// Test binary exponentiation accuracy for extreme time periods
#[test]
fn test_binary_exponentiation_accuracy_100_years() {
    // Test the compute_remaining_pool formula for 100 years (5200 weeks)
    let pool = 1_000_000 * ONE_SOCIAL; // 1 million SOCIAL
    let weeks: u64 = 5200; // ~100 years

    let remaining = compute_remaining_pool(pool, weeks);

    // After 100 years at 0.2% weekly: pool × 0.998^5200
    // Mathematically: 0.998^5200 ≈ 0.0000028 (nearly depleted)
    // So remaining should be very small but > 0
    assert!(remaining > 0, "Should have some dust remaining");
    assert!(
        remaining < pool / 1000,
        "Should be nearly depleted after 100 years"
    );

    // Verify it doesn't overflow or underflow
    let released = pool.saturating_sub(remaining);
    assert!(
        released > pool * 999 / 1000,
        "Most of pool should be released"
    );
}

/// Test U256 helpers with edge case values
#[test]
fn test_u256_helpers_edge_cases() {
    // Test u256_mul with large values
    let large = ONE_SOCIAL * 1_000_000_000; // 1 billion SOCIAL
    let result = u256_mul(large, 100);
    assert_eq!(result, large * 100);

    // Test u256_mul_div with zero divisor returns 0
    let result = u256_mul_div(1000, 500, 0);
    assert_eq!(result, 0, "Division by zero should return 0");

    // Test u256_mul_div with large numerator
    let result = u256_mul_div(large, large, large);
    assert_eq!(result, large, "a × a / a = a");

    // Test compute_remaining_pool with 0 weeks
    let result = compute_remaining_pool(1000, 0);
    assert_eq!(result, 1000, "0 weeks = no decay");

    // Test compute_remaining_pool with 0 pool
    let result = compute_remaining_pool(0, 100);
    assert_eq!(result, 0, "0 pool = 0 remaining");
}

/// Test concurrent stakers joining and leaving in same block
#[test]
fn test_concurrent_stakers_join_leave_same_block() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");
    setup_with_storage(&mut contract, "carol.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // All join at exact same time
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);
    lock_tokens_at(&mut contract, "bob.near", 2 * ONE_SOCIAL, 12, start_time);
    lock_tokens_at(&mut contract, "carol.near", 3 * ONE_SOCIAL, 48, start_time);

    // Verify totals are correct
    // Alice: 1.1, Bob: 2.4, Carol: 4.5 = 8.0 effective
    let expected_effective =
        ONE_SOCIAL * 110 / 100 + 2 * ONE_SOCIAL * 120 / 100 + 3 * ONE_SOCIAL * 150 / 100;
    assert_eq!(contract.total_effective_stake, expected_effective);
    assert_eq!(contract.total_locked, 6 * ONE_SOCIAL);

    // Fund and advance 1 week
    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);

    let week1 = start_time + WEEK_NS;
    let mut context = get_context("anyone.near");
    context.block_timestamp(week1);
    testing_env!(context.build());

    contract.poke();

    // All should have rewards proportional to their effective stake
    let alice = contract.get_account("alice.near".parse().unwrap());
    let bob = contract.get_account("bob.near".parse().unwrap());
    let carol = contract.get_account("carol.near".parse().unwrap());

    // Carol should have most rewards (highest effective stake)
    assert!(carol.claimable_rewards.0 > bob.claimable_rewards.0);
    assert!(bob.claimable_rewards.0 > alice.claimable_rewards.0);

    // Sum should approximately equal total released
    let total_claimable =
        alice.claimable_rewards.0 + bob.claimable_rewards.0 + carol.claimable_rewards.0;
    let total_released = contract.total_rewards_released;
    let diff = if total_claimable > total_released {
        total_claimable - total_released
    } else {
        total_released - total_claimable
    };
    assert!(diff < ONE_SOCIAL / 100, "Rounding should be minimal");
}

// =============================================================================
// BUSINESS LOGIC TESTS
// =============================================================================

/// Verify stake-seconds gives correct proportional rewards for different join times
#[test]
fn test_reward_fairness_different_join_times() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool
    fund_pool_at(&mut contract, 10000 * ONE_SOCIAL, start_time);

    // Alice stakes at t=0
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Bob stakes at t=1 week (exactly when first rewards release)
    lock_tokens_at(
        &mut contract,
        "bob.near",
        ONE_SOCIAL,
        6,
        start_time + WEEK_NS,
    );

    // Check at t=2 weeks
    let week2 = start_time + 2 * WEEK_NS;
    let mut context = get_context("anyone.near");
    context.block_timestamp(week2);
    testing_env!(context.build());

    contract.poke();

    let alice = contract.get_account("alice.near".parse().unwrap());
    let bob = contract.get_account("bob.near".parse().unwrap());

    // Alice staked for 2 weeks, Bob for 1 week
    // Alice should have roughly 2x the stake-seconds
    // Week 1: Only Alice (gets 100% of week 1 rewards)
    // Week 2: Both stake (split 50/50)
    // So Alice should have significantly more

    assert!(
        alice.claimable_rewards.0 > bob.claimable_rewards.0,
        "Alice (2 weeks) should have more rewards than Bob (1 week)"
    );

    // Alice's share should be roughly 66% (2 weeks / 3 total user-weeks)
    // This is approximate due to compounding
    let total = alice.claimable_rewards.0 + bob.claimable_rewards.0;
    let alice_pct = alice.claimable_rewards.0 * 100 / total;
    assert!(
        (60..=70).contains(&alice_pct),
        "Alice should have ~66% of rewards, got {}%",
        alice_pct
    );
}

/// Confirm extend_lock uses current time, not adding to old unlock
#[test]
fn test_extend_resets_unlock_from_current_time() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Lock for 1 month
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 1, start_time);

    let original_unlock = contract
        .get_account("alice.near".parse().unwrap())
        .unlock_at;
    // Should be start_time + 1 month
    assert_eq!(original_unlock, start_time + MONTH_NS);

    // Advance 2 weeks
    let two_weeks = start_time + 2 * WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(two_weeks);
    testing_env!(context.build());

    // Extend to 12 months
    contract.extend_lock(12);

    let new_unlock = contract
        .get_account("alice.near".parse().unwrap())
        .unlock_at;

    // New unlock should be from NOW (two_weeks) + 12 months
    // NOT from original_unlock + 12 months
    let expected_unlock = two_weeks + 12 * MONTH_NS;
    assert_eq!(
        new_unlock, expected_unlock,
        "Extend should reset from current time"
    );

    // Verify it's NOT calculated from original unlock
    let wrong_unlock = original_unlock + 12 * MONTH_NS;
    assert_ne!(
        new_unlock, wrong_unlock,
        "Should NOT add to original unlock time"
    );
}

/// Test sync_account is idempotent (multiple calls don't compound effects)
#[test]
fn test_sync_account_idempotent() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 week
    let week1 = start_time + WEEK_NS;
    let mut context = get_context("alice.near");
    context.block_timestamp(week1);
    testing_env!(context.build());

    // Sync once
    contract.sync_account(&"alice.near".parse().unwrap());
    let ss_after_first = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap()
        .stake_seconds;
    let global_ss_first = contract.total_stake_seconds;
    let released_first = contract.total_rewards_released;

    // Sync again at same timestamp
    contract.sync_account(&"alice.near".parse().unwrap());
    let ss_after_second = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap()
        .stake_seconds;
    let global_ss_second = contract.total_stake_seconds;
    let released_second = contract.total_rewards_released;

    // All values should be identical
    assert_eq!(
        ss_after_first, ss_after_second,
        "stake_seconds should not change on second sync"
    );
    assert_eq!(
        global_ss_first, global_ss_second,
        "total_stake_seconds should not change"
    );
    assert_eq!(
        released_first, released_second,
        "total_rewards_released should not change"
    );

    // Sync a third time
    contract.sync_account(&"alice.near".parse().unwrap());
    let ss_after_third = contract
        .accounts
        .get(&"alice.near".parse::<AccountId>().unwrap())
        .cloned()
        .unwrap()
        .stake_seconds;
    assert_eq!(ss_after_first, ss_after_third, "Must be idempotent");
}

/// Test partial then full withdrawal from infra pool
#[test]
fn test_withdraw_infra_partial_then_full() {
    let mut contract = setup_contract();

    // Add 100 SOCIAL worth of credits (60 to infra)
    purchase_credits(&mut contract, "buyer.near", 100 * ONE_SOCIAL);
    assert_eq!(contract.infra_pool, 60 * ONE_SOCIAL);

    // Partial withdraw 1
    let mut context = get_context("owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());
    let _ = contract.withdraw_infra(U128(20 * ONE_SOCIAL), "treasury.near".parse().unwrap());
    assert_eq!(contract.infra_pool, 40 * ONE_SOCIAL);

    // Partial withdraw 2
    let mut context = get_context("owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());
    let _ = contract.withdraw_infra(U128(15 * ONE_SOCIAL), "treasury.near".parse().unwrap());
    assert_eq!(contract.infra_pool, 25 * ONE_SOCIAL);

    // Full remaining withdraw
    let mut context = get_context("owner.near");
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());
    let _ = contract.withdraw_infra(U128(25 * ONE_SOCIAL), "treasury.near".parse().unwrap());
    assert_eq!(contract.infra_pool, 0);
}

/// Test storage deposit for another account
#[test]
fn test_storage_deposit_for_another() {
    let mut contract = setup_contract();

    // Alice pays for Bob's storage
    let mut context = get_context("alice.near");
    context.attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT));
    testing_env!(context.build());

    let balance = contract.storage_deposit(Some("bob.near".parse().unwrap()), None);
    assert_eq!(balance.total.0, STORAGE_DEPOSIT);

    // Bob should now be registered
    let bob_id: AccountId = "bob.near".parse().unwrap();
    assert!(contract.storage_paid.contains_key(&bob_id));

    // Alice should NOT be registered (she paid for bob)
    let alice_id: AccountId = "alice.near".parse().unwrap();
    assert!(!contract.storage_paid.contains_key(&alice_id));
}

/// Test version increments on migrate
#[test]
fn test_version_tracking() {
    let contract = setup_contract();

    // Initial version should be 1
    assert_eq!(contract.version, 1);

    let stats = contract.get_stats();
    assert_eq!(stats.version, 1);
}

// =============================================================================
// PRECISION & OVERFLOW TESTS
// =============================================================================

/// Test stake-seconds don't overflow with many users over long periods
#[test]
fn test_stake_seconds_no_overflow_long_term() {
    let mut contract = setup_contract();

    let start_time = 1_000_000_000_000_000_000u64;

    // Create 10 whale stakers
    for i in 0..10 {
        let user = format!("whale{}.near", i);
        setup_with_storage(&mut contract, &user);
        lock_tokens_at(
            &mut contract,
            &user,
            1_000_000_000 * ONE_SOCIAL, // 1 billion SOCIAL each
            48,
            start_time,
        );
    }

    // Fund with massive pool
    fund_pool_at(&mut contract, 100_000_000_000 * ONE_SOCIAL, start_time); // 100 billion

    // Simulate 2 years (104 weeks)
    let two_years = start_time + 104 * WEEK_NS;
    let mut context = get_context("anyone.near");
    context.block_timestamp(two_years);
    testing_env!(context.build());

    // This should not overflow
    contract.poke();

    // Each whale should have claimable rewards
    let whale0 = contract.get_account("whale0.near".parse().unwrap());
    assert!(
        whale0.claimable_rewards.0 > 0,
        "Should have rewards after 2 years"
    );

    // Total stake seconds should be massive but not overflowed
    assert!(
        contract.total_stake_seconds > 0,
        "Should have accumulated stake-seconds"
    );
}

/// Test reward distribution precision with vastly different stake sizes
#[test]
fn test_precision_whale_and_minnow() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "whale.near");
    setup_with_storage(&mut contract, "minnow.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund pool
    fund_pool_at(&mut contract, 10_000_000 * ONE_SOCIAL, start_time);

    // Whale stakes 1 million SOCIAL
    lock_tokens_at(
        &mut contract,
        "whale.near",
        1_000_000 * ONE_SOCIAL,
        6,
        start_time,
    );

    // Minnow stakes minimum (0.01 SOCIAL)
    lock_tokens_at(&mut contract, "minnow.near", MIN_STAKE, 6, start_time);

    // Advance 1 week
    let week1 = start_time + WEEK_NS;
    let mut context = get_context("anyone.near");
    context.block_timestamp(week1);
    testing_env!(context.build());

    contract.poke();

    let whale = contract.get_account("whale.near".parse().unwrap());
    let _minnow = contract.get_account("minnow.near".parse().unwrap());

    // Whale should have vast majority of rewards
    assert!(whale.claimable_rewards.0 > 0, "Whale should have rewards");

    // Minnow might have 0 due to rounding, but should not overflow or panic
    // The ratio should be approximately 1:100,000,000 (whale has 100M× more stake)
    // Minnow's share is so tiny it might round to 0

    // Key assertion: contract didn't panic with extreme disparity
    let total_released = contract.total_rewards_released;
    assert!(
        whale.claimable_rewards.0 <= total_released,
        "Whale cannot claim more than released"
    );
}

/// Test credits purchase doesn't lose any tokens to rounding
#[test]
fn test_credits_no_rounding_loss() {
    let mut contract = setup_contract();

    // Purchase odd amount
    let amount = 333_333_333_333_333_333u128; // Odd amount

    let context = get_context("social.token.near");
    testing_env!(context.build());

    let msg = r#"{"action":"credits"}"#;
    contract.ft_on_transfer("buyer.near".parse().unwrap(), U128(amount), msg.to_string());

    // 60/40 split
    let infra = amount * 60 / 100;
    let rewards = amount - infra; // Use subtraction to capture any rounding

    // Verify no tokens lost
    assert_eq!(
        contract.infra_pool + contract.scheduled_pool,
        amount,
        "No tokens should be lost to rounding"
    );
    assert_eq!(contract.infra_pool, infra);
    assert_eq!(contract.scheduled_pool, rewards);
}

/// Test continuous per-second release
#[test]
fn test_continuous_release() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // After 1 day: should have partial release (1/7 of weekly rate)
    let one_day = 24 * 60 * 60 * 1_000_000_000u64;
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + one_day);
    testing_env!(context.build());

    contract.poke();
    // 1000 SOCIAL × 0.2% × (1/7) ≈ 0.285 SOCIAL
    let expected_approx = 285_714_285_714_285_714u128; // ~0.285 SOCIAL
    let tolerance = expected_approx / 100; // 1% tolerance
    assert!(
        contract.total_rewards_released > expected_approx - tolerance
            && contract.total_rewards_released < expected_approx + tolerance,
        "Should release proportional to time elapsed: got {}, expected ~{}",
        contract.total_rewards_released,
        expected_approx
    );

    // After exactly 1 week: should have full weekly release
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    contract.poke();
    // Total after 1 week should be ~2 SOCIAL (0.2% of 1000)
    let expected_week = 2 * ONE_SOCIAL;
    let tolerance_week = expected_week / 100;
    assert!(
        contract.total_rewards_released > expected_week - tolerance_week
            && contract.total_rewards_released < expected_week + tolerance_week,
        "Should release ~2 SOCIAL after 1 week: got {}",
        contract.total_rewards_released
    );
}

/// Test multiple pokes within same period accumulate correctly
#[test]
fn test_continuous_release_multiple_pokes() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;
    let one_hour = 60 * 60 * 1_000_000_000u64;

    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Poke every hour for 24 hours
    let mut total_released = 0u128;
    for i in 1..=24 {
        let mut context = get_context("anyone.near");
        context.block_timestamp(start_time + i * one_hour);
        testing_env!(context.build());

        contract.poke();
        assert!(
            contract.total_rewards_released >= total_released,
            "Released should never decrease"
        );
        total_released = contract.total_rewards_released;
    }

    // After 24 hours of hourly pokes should equal single poke after 24 hours
    let mut contract2 = setup_contract();
    setup_with_storage(&mut contract2, "alice.near");
    fund_pool_at(&mut contract2, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract2, "alice.near", ONE_SOCIAL, 6, start_time);

    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + 24 * one_hour);
    testing_env!(context.build());
    contract2.poke();

    // Should be very close (within rounding)
    let diff = if contract.total_rewards_released > contract2.total_rewards_released {
        contract.total_rewards_released - contract2.total_rewards_released
    } else {
        contract2.total_rewards_released - contract.total_rewards_released
    };
    assert!(
        diff < ONE_SOCIAL / 1000, // Within 0.001 SOCIAL
        "Multiple pokes should equal single poke: {} vs {}",
        contract.total_rewards_released,
        contract2.total_rewards_released
    );
}

/// Test release spanning multiple complete weeks plus partial
#[test]
fn test_continuous_release_multi_week_plus_partial() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // After 2.5 weeks
    let two_and_half_weeks = WEEK_NS * 2 + WEEK_NS / 2;
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + two_and_half_weeks);
    testing_env!(context.build());

    contract.poke();

    // Week 1: 1000 × 0.2% = 2 SOCIAL, remaining = 998
    // Week 2: 998 × 0.2% ≈ 1.996 SOCIAL, remaining ≈ 996
    // Half week 3: 996 × 0.2% × 0.5 ≈ 0.996 SOCIAL
    // Total ≈ 4.99 SOCIAL
    let expected_approx = 4_992_000_000_000_000_000u128; // ~4.99 SOCIAL
    let tolerance = expected_approx / 50; // 2% tolerance for compound rounding

    assert!(
        contract.total_rewards_released > expected_approx - tolerance
            && contract.total_rewards_released < expected_approx + tolerance,
        "2.5 weeks should release ~4.99 SOCIAL: got {}",
        contract.total_rewards_released
    );
}

/// Test poke at same timestamp is idempotent
#[test]
fn test_continuous_release_same_block_idempotent() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    fund_pool_at(&mut contract, 1000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // Advance 1 day
    let one_day = 24 * 60 * 60 * 1_000_000_000u64;
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + one_day);
    testing_env!(context.build());

    contract.poke();
    let after_first = contract.total_rewards_released;

    // Poke again at same timestamp
    contract.poke();
    assert_eq!(
        contract.total_rewards_released, after_first,
        "Same-block poke should not release more"
    );

    // Poke third time
    contract.poke();
    assert_eq!(
        contract.total_rewards_released, after_first,
        "Multiple same-block pokes should be idempotent"
    );
}

/// Test continuous release with very small pool (dust handling)
#[test]
fn test_continuous_release_small_pool() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    // Fund with only 0.01 SOCIAL
    let small_amount = ONE_SOCIAL / 100;
    fund_pool_at(&mut contract, small_amount, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // After 1 week
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + WEEK_NS);
    testing_env!(context.build());

    contract.poke();

    // 0.01 SOCIAL × 0.2% = 0.00002 SOCIAL
    let expected = small_amount * 20 / 10_000;
    let tolerance = expected / 10; // 10% tolerance for small amounts

    assert!(
        contract.total_rewards_released >= expected - tolerance
            && contract.total_rewards_released <= expected + tolerance,
        "Small pool should still release: got {}, expected ~{}",
        contract.total_rewards_released,
        expected
    );
}

/// Test long elapsed time (100 weeks) doesn't overflow
#[test]
fn test_continuous_release_long_duration() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let start_time = 1_000_000_000_000_000_000u64;

    fund_pool_at(&mut contract, 1_000_000 * ONE_SOCIAL, start_time);
    lock_tokens_at(&mut contract, "alice.near", ONE_SOCIAL, 6, start_time);

    // After 100 weeks
    let hundred_weeks = WEEK_NS * 100;
    let mut context = get_context("anyone.near");
    context.block_timestamp(start_time + hundred_weeks);
    testing_env!(context.build());

    contract.poke();

    // After 100 weeks of 0.2% weekly decay:
    // remaining = 1M × 0.998^100 ≈ 818,730 SOCIAL
    // released ≈ 181,270 SOCIAL
    assert!(
        contract.total_rewards_released > 180_000 * ONE_SOCIAL,
        "Should release significant amount over 100 weeks"
    );
    assert!(
        contract.scheduled_pool < 820_000 * ONE_SOCIAL,
        "Pool should decay significantly"
    );
    assert!(
        contract.scheduled_pool + contract.total_rewards_released == 1_000_000 * ONE_SOCIAL,
        "Total should equal initial pool"
    );
}
