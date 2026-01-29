use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

// --- Test Helpers ---

fn get_context(predecessor: AccountId) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder.predecessor_account_id(predecessor);
    builder
}

fn setup_contract() -> OnsocialStaking {
    let context = get_context("owner.near".parse().unwrap());
    testing_env!(context.build());

    OnsocialStaking::new(
        "social.tkn.near".parse().unwrap(),
        "owner.near".parse().unwrap(),
        100, // 100 credits per SOCIAL
        50,  // free daily credits
    )
}

// --- Initialization Tests ---

#[test]
fn test_init() {
    let contract = setup_contract();

    assert_eq!(contract.token_id.as_str(), "social.tkn.near");
    assert_eq!(contract.owner_id.as_str(), "owner.near");
    assert_eq!(contract.reward_per_token_stored, 0);
    assert_eq!(contract.credits_per_token, 100);
    assert_eq!(contract.free_daily_credits, 50);
    assert_eq!(contract.total_locked, 0);
    assert_eq!(contract.rewards_pool, 0);
    assert_eq!(contract.infra_pool, 0);
}

// --- Gateway Management Tests ---

#[test]
fn test_add_gateway() {
    let mut contract = setup_contract();

    contract.add_gateway("gateway.near".parse().unwrap());
    assert!(contract.is_gateway("gateway.near".parse().unwrap()));
}

#[test]
fn test_add_multiple_gateways() {
    let mut contract = setup_contract();

    contract.add_gateway("gateway1.near".parse().unwrap());
    contract.add_gateway("gateway2.near".parse().unwrap());

    assert!(contract.is_gateway("gateway1.near".parse().unwrap()));
    assert!(contract.is_gateway("gateway2.near".parse().unwrap()));
    assert!(!contract.is_gateway("gateway3.near".parse().unwrap()));
}

#[test]
fn test_remove_gateway() {
    let mut contract = setup_contract();

    contract.add_gateway("gateway.near".parse().unwrap());
    assert!(contract.is_gateway("gateway.near".parse().unwrap()));

    contract.remove_gateway("gateway.near".parse().unwrap());
    assert!(!contract.is_gateway("gateway.near".parse().unwrap()));
}

// --- Owner Configuration Tests ---

#[test]
fn test_set_credits_per_token() {
    let mut contract = setup_contract();

    assert_eq!(contract.credits_per_token, 100);

    contract.set_credits_per_token(200);
    assert_eq!(contract.credits_per_token, 200);

    let stats = contract.get_stats();
    assert_eq!(stats.credits_per_token, 200);
}

#[test]
fn test_set_free_daily_credits() {
    let mut contract = setup_contract();

    assert_eq!(contract.free_daily_credits, 50);

    contract.set_free_daily_credits(100);
    assert_eq!(contract.free_daily_credits, 100);

    let stats = contract.get_stats();
    assert_eq!(stats.free_daily_credits, 100);
}

#[test]
fn test_set_owner() {
    let mut contract = setup_contract();

    assert_eq!(contract.owner_id.as_str(), "owner.near");

    contract.set_owner("new_owner.near".parse().unwrap());
    assert_eq!(contract.owner_id.as_str(), "new_owner.near");
}

// --- Account View Tests ---

#[test]
fn test_get_account_default() {
    let contract = setup_contract();

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.locked_amount.0, 0);
    assert_eq!(account.credits, 0);
    assert_eq!(account.pending_rewards.0, 0);
    assert_eq!(account.lock_months, 0);
    assert_eq!(account.unlock_at, 0);
}

#[test]
fn test_get_stats() {
    let contract = setup_contract();

    let stats = contract.get_stats();
    assert_eq!(stats.token_id.as_str(), "social.tkn.near");
    assert_eq!(stats.owner_id.as_str(), "owner.near");
    assert_eq!(stats.total_locked.0, 0);
    assert_eq!(stats.rewards_pool.0, 0);
    assert_eq!(stats.infra_pool.0, 0);
    assert_eq!(stats.credits_per_token, 100);
    assert_eq!(stats.free_daily_credits, 50);
}

// --- Effective Stake & Lock Bonus Tests ---

#[test]
fn test_effective_stake_no_lock() {
    let contract = setup_contract();

    let account = Account {
        locked_amount: U128(1000),
        lock_months: 0,
        ..Default::default()
    };

    // 0 months = 100% (no bonus)
    assert_eq!(contract.effective_stake(&account), 1000);
}

#[test]
fn test_effective_stake_tiers() {
    let contract = setup_contract();
    let base_amount = 1000u128;

    // 1-6 months = 10% bonus
    let account_1 = Account {
        locked_amount: U128(base_amount),
        lock_months: 1,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&account_1), 1100);

    let account_6 = Account {
        locked_amount: U128(base_amount),
        lock_months: 6,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&account_6), 1100);

    // 7-12 months = 20% bonus
    let account_7 = Account {
        locked_amount: U128(base_amount),
        lock_months: 7,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&account_7), 1200);

    let account_12 = Account {
        locked_amount: U128(base_amount),
        lock_months: 12,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&account_12), 1200);

    // 13-24 months = 35% bonus
    let account_13 = Account {
        locked_amount: U128(base_amount),
        lock_months: 13,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&account_13), 1350);

    let account_24 = Account {
        locked_amount: U128(base_amount),
        lock_months: 24,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&account_24), 1350);

    // 25-48 months = 50% bonus
    let account_25 = Account {
        locked_amount: U128(base_amount),
        lock_months: 25,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&account_25), 1500);

    let account_48 = Account {
        locked_amount: U128(base_amount),
        lock_months: 48,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&account_48), 1500);
}

#[test]
fn test_effective_stake_zero_amount() {
    let contract = setup_contract();

    let account = Account {
        locked_amount: U128(0),
        lock_months: 48, // Max bonus, but 0 amount
        ..Default::default()
    };

    assert_eq!(contract.effective_stake(&account), 0);
}

// --- Reward Calculation Tests ---

#[test]
fn test_reward_calculation_basic() {
    // Test math: total_locked = 100, rewards = 10
    // reward_per_token = 10 * PRECISION / 100
    // User with 50 locked earns: 50 * reward_per_token / PRECISION = 5

    let reward_per_token = 10u128 * PRECISION / 100u128;
    let user_locked = 50u128;
    let earned = user_locked * reward_per_token / PRECISION;

    assert_eq!(earned, 5);
}

#[test]
fn test_effective_stake_reward_distribution() {
    // Longer lockers get proportionally more rewards
    // Alice: 100 staked, 48 months → effective = 150
    // Bob: 100 staked, 1 month → effective = 110
    // Total effective = 260, rewards = 260
    // Alice gets 150, Bob gets 110

    let alice_locked = 100u128;
    let bob_locked = 100u128;

    let alice_effective = alice_locked * 150 / 100; // 150
    let bob_effective = bob_locked * 110 / 100; // 110

    let total_effective = alice_effective + bob_effective; // 260
    let rewards = 260u128;

    let rpt = rewards * PRECISION / total_effective;

    let alice_earned = alice_effective * rpt / PRECISION;
    let bob_earned = bob_effective * rpt / PRECISION;

    assert_eq!(alice_earned, 150);
    assert_eq!(bob_earned, 110);
    assert_eq!(alice_earned + bob_earned, rewards);
}

#[test]
fn test_earned_formula() {
    // earned = effective * (rpt_stored - rpt_paid) / PRECISION + pending
    // effective = 110, rpt_stored = 0.1, rpt_paid = 0, pending = 5
    // Result: 110 * 0.1 + 5 = 16

    let effective_stake = 110u128;
    let rpt_stored = PRECISION / 10; // 0.1 per token
    let rpt_paid = 0u128;
    let pending = 5u128;

    let earned =
        effective_stake.saturating_mul(rpt_stored.saturating_sub(rpt_paid)) / PRECISION + pending;

    assert_eq!(earned, 16);
}

#[test]
fn test_earned_with_prior_payment() {
    // User claimed at reward_per_token = 0.05, now at 0.10
    // Earns only on difference: 100 * (0.10 - 0.05) = 5

    let effective = 100u128;
    let rpt_stored = PRECISION / 10; // 0.10
    let rpt_paid = PRECISION / 20; // 0.05
    let rpt_diff = rpt_stored - rpt_paid; // 0.05

    let earned = effective * rpt_diff / PRECISION;
    assert_eq!(earned, 5);
}

// --- Credit Calculation Tests ---

#[test]
fn test_credit_calculation() {
    // credits = amount * credits_per_token / PRECISION
    // 1 SOCIAL * 100 credits/token = 100 credits

    let amount = PRECISION; // 1 SOCIAL token
    let credits_per_token = 100u64;
    let credits = (amount * credits_per_token as u128 / PRECISION) as u64;

    assert_eq!(credits, 100);
}

#[test]
fn test_credit_calculation_fractional() {
    // 0.5 SOCIAL * 100 credits/token = 50 credits

    let amount = PRECISION / 2;
    let credits_per_token = 100u64;
    let credits = (amount * credits_per_token as u128 / PRECISION) as u64;

    assert_eq!(credits, 50);
}

#[test]
fn test_credit_calculation_small_amount() {
    // Small amounts may round to 0 credits

    let amount = PRECISION / 1000; // 0.001 SOCIAL
    let credits_per_token = 100u64;
    let credits = (amount * credits_per_token as u128 / PRECISION) as u64;

    assert_eq!(credits, 0);
}

#[test]
fn test_infra_rewards_split() {
    // 60% to infra, 40% to rewards
    let amount = 100u128;
    let infra_share = amount * 60 / 100;
    let rewards_share = amount - infra_share;

    assert_eq!(infra_share, 60);
    assert_eq!(rewards_share, 40);
    assert_eq!(infra_share + rewards_share, amount);
}

// --- Debit Credits Tests (unit logic only) ---

#[test]
fn test_debit_credits_calculation() {
    // 100 credits - 30 debit = 70 remaining

    let initial_credits = 100u64;
    let debit_amount = 30u64;
    let remaining = initial_credits.saturating_sub(debit_amount);

    assert_eq!(remaining, 70);
}

#[test]
fn test_debit_credits_exceeds_balance() {
    // Debit more than available returns 0

    let initial_credits = 50u64;
    let debit_amount = 100u64;
    let remaining = initial_credits.saturating_sub(debit_amount);

    assert_eq!(remaining, 0);
}

#[test]
fn test_free_credits_day_calculation() {
    // day = timestamp / DAY_NS

    let timestamp = 2 * DAY_NS + 1000;
    let day = timestamp / DAY_NS;

    assert_eq!(day, 2);
}

#[test]
fn test_free_credits_same_day() {
    // Cannot claim if same day

    let last_day = 5u64;
    let current_day = 5u64;
    let can_claim = current_day > last_day;

    assert!(!can_claim);
}

#[test]
fn test_free_credits_new_day() {
    // Can claim on new day

    let last_day = 5u64;
    let current_day = 6u64;
    let can_claim = current_day > last_day;

    assert!(can_claim);
}

// --- Lock Period Validation Tests ---

#[test]
fn test_valid_lock_periods() {
    let valid_periods = [1u64, 6, 12, 24, 48];

    for months in valid_periods {
        let is_valid = months == 1 || months == 6 || months == 12 || months == 24 || months == 48;
        assert!(is_valid, "Period {} should be valid", months);
    }
}

#[test]
fn test_invalid_lock_periods() {
    let invalid_periods = [0u64, 2, 3, 5, 7, 13, 25, 49, 100];

    for months in invalid_periods {
        let is_valid = months == 1 || months == 6 || months == 12 || months == 24 || months == 48;
        assert!(!is_valid, "Period {} should be invalid", months);
    }
}

#[test]
fn test_unlock_timestamp_calculation() {
    // 12 months = 12 * 30 days

    let now = 1000 * DAY_NS;
    let months = 12u64;
    let unlock_at = now + (months * MONTH_NS);

    let expected_unlock = now + (12 * 30 * DAY_NS);
    assert_eq!(unlock_at, expected_unlock);
}

#[test]
fn test_bonus_multiplier_boundaries() {
    // Test tier boundaries

    let contract = setup_contract();
    let base = 1000u128;

    // 6 months = 10% (tier 1 upper bound)
    let acc_6 = Account {
        locked_amount: U128(base),
        lock_months: 6,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_6), 1100);

    // 7 months = 20% (tier 2 lower bound)
    let acc_7 = Account {
        locked_amount: U128(base),
        lock_months: 7,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_7), 1200);

    // 12 months = 20% (tier 2 upper bound)
    let acc_12 = Account {
        locked_amount: U128(base),
        lock_months: 12,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_12), 1200);

    // 13 months = 35% (tier 3 lower bound)
    let acc_13 = Account {
        locked_amount: U128(base),
        lock_months: 13,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_13), 1350);

    // 24 months = 35% (tier 3 upper bound)
    let acc_24 = Account {
        locked_amount: U128(base),
        lock_months: 24,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_24), 1350);

    // 25 months = 50% (tier 4 lower bound)
    let acc_25 = Account {
        locked_amount: U128(base),
        lock_months: 25,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_25), 1500);
}

// --- Overflow Protection Tests ---

#[test]
fn test_large_stake_no_overflow() {
    let contract = setup_contract();

    // Large stake with max bonus should not overflow

    let large_amount = u128::MAX / 200; // Room for 150% multiplier
    let account = Account {
        locked_amount: U128(large_amount),
        lock_months: 48, // 50% bonus
        ..Default::default()
    };

    let effective = contract.effective_stake(&account);
    assert_eq!(effective, large_amount * 150 / 100);
}

#[test]
fn test_precision_constant() {
    // PRECISION matches SOCIAL token decimals (18)

    assert_eq!(PRECISION, 10u128.pow(18));
}

// --- Stats Consistency Tests ---

#[test]
fn test_stats_reflects_state() {
    let mut contract = setup_contract();

    // Update internal state
    contract.total_locked = 1000;
    contract.rewards_pool = 500;
    contract.infra_pool = 300;
    contract.total_effective_stake = 1200;

    let stats = contract.get_stats();
    assert_eq!(stats.total_locked.0, 1000);
    assert_eq!(stats.rewards_pool.0, 500);
    assert_eq!(stats.infra_pool.0, 300);
    assert_eq!(stats.total_effective_stake.0, 1200);
}

// --- Gateway Check Tests ---

#[test]
fn test_is_gateway_returns_false_for_non_gateway() {
    let contract = setup_contract();

    assert!(!contract.is_gateway("random.near".parse().unwrap()));
    assert!(!contract.is_gateway("owner.near".parse().unwrap()));
}

#[test]
fn test_is_gateway_after_add_and_remove() {
    let mut contract = setup_contract();

    let gateway: AccountId = "gateway.near".parse().unwrap();

    // Initially not a gateway
    assert!(!contract.is_gateway(gateway.clone()));

    // Add gateway
    contract.add_gateway(gateway.clone());
    assert!(contract.is_gateway(gateway.clone()));

    // Remove gateway
    contract.remove_gateway(gateway.clone());
    assert!(!contract.is_gateway(gateway));
}

// --- Upgrade Tests ---
// Note: update_contract returns a Promise, which cannot be properly tested in unit tests.
// Full upgrade functionality is tested in integration tests (staking_onsocial_tests.rs).
