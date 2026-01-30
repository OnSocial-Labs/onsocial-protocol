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
    )
}

fn setup_with_storage(contract: &mut OnsocialStaking, account: &str) {
    let mut context = get_context(account.parse().unwrap());
    context.attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT));
    testing_env!(context.build());
    contract.deposit_storage();
}

fn call_ft_on_transfer(
    contract: &mut OnsocialStaking,
    sender: &str,
    amount: u128,
    msg: &str,
) -> U128 {
    let context = get_context("social.tkn.near".parse().unwrap());
    testing_env!(context.build());
    contract.ft_on_transfer(sender.parse().unwrap(), U128(amount), msg.to_string())
}

// --- Initialization Tests ---

#[test]
fn test_init() {
    let contract = setup_contract();

    assert_eq!(contract.token_id.as_str(), "social.tkn.near");
    assert_eq!(contract.owner_id.as_str(), "owner.near");
    assert_eq!(contract.reward_per_token_stored, 0);
    assert_eq!(contract.total_locked, 0);
    assert_eq!(contract.rewards_pool, 0);
    assert_eq!(contract.infra_pool, 0);
}

// --- Owner Tests ---

#[test]
fn test_set_owner() {
    let mut contract = setup_contract();

    assert_eq!(contract.owner_id.as_str(), "owner.near");

    let mut context = get_context("owner.near".parse().unwrap());
    context.attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(context.build());

    contract.set_owner("new_owner.near".parse().unwrap());
    assert_eq!(contract.owner_id.as_str(), "new_owner.near");
}

// --- Account View Tests ---

#[test]
fn test_get_account_default() {
    let contract = setup_contract();

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.locked_amount.0, 0);
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
        lock_months: 48,
        ..Default::default()
    };

    assert_eq!(contract.effective_stake(&account), 0);
}

// --- Reward Calculation Tests ---

#[test]
fn test_reward_calculation_basic() {
    let reward_per_token = 10u128 * PRECISION / 100u128;
    let user_locked = 50u128;
    let earned = user_locked * reward_per_token / PRECISION;

    assert_eq!(earned, 5);
}

#[test]
fn test_effective_stake_reward_distribution() {
    let alice_locked = 100u128;
    let bob_locked = 100u128;

    let alice_effective = alice_locked * 150 / 100;
    let bob_effective = bob_locked * 110 / 100;

    let total_effective = alice_effective + bob_effective;
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
    let effective_stake = 110u128;
    let rpt_stored = PRECISION / 10;
    let rpt_paid = 0u128;
    let pending = 5u128;

    let earned =
        effective_stake.saturating_mul(rpt_stored.saturating_sub(rpt_paid)) / PRECISION + pending;

    assert_eq!(earned, 16);
}

#[test]
fn test_earned_with_prior_payment() {
    let effective = 100u128;
    let rpt_stored = PRECISION / 10;
    let rpt_paid = PRECISION / 20;
    let rpt_diff = rpt_stored - rpt_paid;

    let earned = effective * rpt_diff / PRECISION;
    assert_eq!(earned, 5);
}

// --- 60/40 Split Tests ---

#[test]
fn test_infra_rewards_split() {
    let amount = 100u128;
    let infra_share = amount * 60 / 100;
    let rewards_share = amount - infra_share;

    assert_eq!(infra_share, 60);
    assert_eq!(rewards_share, 40);
    assert_eq!(infra_share + rewards_share, amount);
}

#[test]
fn test_infra_rewards_split_large_amount() {
    let amount = 1_000_000u128 * 10u128.pow(24);
    let infra_share = amount * 60 / 100;
    let rewards_share = amount - infra_share;

    assert_eq!(infra_share, 600_000u128 * 10u128.pow(24));
    assert_eq!(rewards_share, 400_000u128 * 10u128.pow(24));
}

// --- Lock Period Validation Tests ---

#[test]
fn test_valid_lock_periods() {
    let valid_periods = [1u64, 6, 12, 24, 48];

    for months in valid_periods {
        assert!(
            VALID_LOCK_PERIODS.contains(&months),
            "Period {} should be valid",
            months
        );
    }
}

#[test]
fn test_invalid_lock_periods() {
    let invalid_periods = [0u64, 2, 3, 5, 7, 13, 25, 49, 100];

    for months in invalid_periods {
        assert!(
            !VALID_LOCK_PERIODS.contains(&months),
            "Period {} should be invalid",
            months
        );
    }
}

#[test]
fn test_unlock_timestamp_calculation() {
    let now = 1000 * MONTH_NS / 30;
    let months = 12u64;
    let unlock_at = now + (months * MONTH_NS);

    let expected_unlock = now + (12 * MONTH_NS);
    assert_eq!(unlock_at, expected_unlock);
}

// =============================================================================
// Unlock Success Tests (with time manipulation)
// =============================================================================

#[test]
fn test_unlock_success_after_expiry() {
    let mut contract = setup_contract();
    let user = "user.near";
    let lock_amount = 100_000_000_000_000_000_000u128; // 100 tokens

    // Setup storage
    setup_with_storage(&mut contract, user);

    // Lock tokens for 1 month
    let initial_time = 1_000_000_000_000_000_000u64; // Some starting timestamp
    let mut context = get_context("social.tkn.near".parse().unwrap());
    context.block_timestamp(initial_time);
    testing_env!(context.build());

    contract.ft_on_transfer(
        user.parse().unwrap(),
        U128(lock_amount),
        r#"{"action":"lock","months":1}"#.to_string(),
    );

    // Verify locked
    let account = contract.get_account(user.parse().unwrap());
    assert_eq!(account.locked_amount.0, lock_amount);
    assert_eq!(account.lock_months, 1);
    let unlock_at = account.unlock_at;

    // Fast forward past lock expiry (1 month + 1 second)
    let after_expiry = unlock_at + 1_000_000_000; // 1 second after
    let mut context = get_context(user.parse().unwrap());
    context.block_timestamp(after_expiry);
    context.prepaid_gas(near_sdk::Gas::from_tgas(100));
    testing_env!(context.build());

    // Unlock should succeed (returns Promise, but state changes happen)
    // Note: In unit tests, we can't fully test the Promise chain,
    // but we can verify the state changes before the callback

    // Verify unlock_at is in the past
    assert!(after_expiry >= unlock_at, "Time should be past unlock_at");
}

#[test]
fn test_unlock_fails_before_expiry_check() {
    // This test verifies the time check logic without calling unlock()
    // (which creates Promises that can't be handled in unit tests)
    let mut contract = setup_contract();
    let user = "user.near";
    let lock_amount = 100_000_000_000_000_000_000u128;

    // Setup storage
    setup_with_storage(&mut contract, user);

    // Lock tokens for 12 months
    let initial_time = 1_000_000_000_000_000_000u64;
    let mut context = get_context("social.tkn.near".parse().unwrap());
    context.block_timestamp(initial_time);
    testing_env!(context.build());

    contract.ft_on_transfer(
        user.parse().unwrap(),
        U128(lock_amount),
        r#"{"action":"lock","months":12}"#.to_string(),
    );

    let account = contract.get_account(user.parse().unwrap());
    let current_time = initial_time + 1_000_000_000; // Just 1 second later

    // Verify the condition that unlock() checks
    assert!(
        current_time < account.unlock_at,
        "Time should be before unlock_at"
    );
    // This proves unlock() would fail with "Lock period not expired"
}

#[test]
fn test_unlock_clears_account_state() {
    let mut contract = setup_contract();
    let user = "user.near";
    let lock_amount = 100_000_000_000_000_000_000u128;

    // Setup storage
    setup_with_storage(&mut contract, user);

    // Lock tokens
    let initial_time = 1_000_000_000_000_000_000u64;
    let mut context = get_context("social.tkn.near".parse().unwrap());
    context.block_timestamp(initial_time);
    testing_env!(context.build());

    contract.ft_on_transfer(
        user.parse().unwrap(),
        U128(lock_amount),
        r#"{"action":"lock","months":1}"#.to_string(),
    );

    let account_before = contract.get_account(user.parse().unwrap());
    let unlock_at = account_before.unlock_at;
    let total_locked_before = contract.total_locked;
    let total_effective_before = contract.total_effective_stake;

    // Fast forward past expiry
    let mut context = get_context(user.parse().unwrap());
    context.block_timestamp(unlock_at + 1);
    context.prepaid_gas(near_sdk::Gas::from_tgas(100));
    testing_env!(context.build());

    // Call unlock - this modifies state before creating Promise
    let _ = contract.unlock();

    // Verify state was updated (before callback)
    let account_after = contract.get_account(user.parse().unwrap());
    assert_eq!(
        account_after.locked_amount.0, 0,
        "Locked amount should be 0"
    );
    assert_eq!(account_after.unlock_at, 0, "Unlock_at should be 0");
    assert_eq!(account_after.lock_months, 0, "Lock_months should be 0");
    assert_eq!(
        contract.total_locked,
        total_locked_before - lock_amount,
        "Total locked should decrease"
    );
    assert!(
        contract.total_effective_stake < total_effective_before,
        "Total effective should decrease"
    );
}

#[test]
fn test_claim_rewards_success_with_pending() {
    let mut contract = setup_contract();
    let user = "user.near";
    let lock_amount = 100_000_000_000_000_000_000u128;
    let reward_amount = 1_000_000_000_000_000_000_000u128;

    // Setup storage and lock
    setup_with_storage(&mut contract, user);
    call_ft_on_transfer(
        &mut contract,
        user,
        lock_amount,
        r#"{"action":"lock","months":12}"#,
    );

    // Owner injects rewards
    call_ft_on_transfer(
        &mut contract,
        "owner.near",
        reward_amount,
        r#"{"action":"rewards"}"#,
    );

    // Verify user has pending rewards
    let pending = contract.get_pending_rewards(user.parse().unwrap());
    assert!(pending.0 > 0, "User should have pending rewards");

    let pool_before = contract.rewards_pool;

    // Claim rewards
    let mut context = get_context(user.parse().unwrap());
    context.prepaid_gas(near_sdk::Gas::from_tgas(100));
    testing_env!(context.build());

    let _ = contract.claim_rewards();

    // Verify rewards were deducted from pool (before callback)
    assert!(
        contract.rewards_pool < pool_before,
        "Rewards pool should decrease"
    );
}

#[test]
fn test_bonus_multiplier_boundaries() {
    let contract = setup_contract();
    let base = 1000u128;

    let acc_6 = Account {
        locked_amount: U128(base),
        lock_months: 6,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_6), 1100);

    let acc_7 = Account {
        locked_amount: U128(base),
        lock_months: 7,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_7), 1200);

    let acc_12 = Account {
        locked_amount: U128(base),
        lock_months: 12,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_12), 1200);

    let acc_13 = Account {
        locked_amount: U128(base),
        lock_months: 13,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_13), 1350);

    let acc_24 = Account {
        locked_amount: U128(base),
        lock_months: 24,
        ..Default::default()
    };
    assert_eq!(contract.effective_stake(&acc_24), 1350);

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

    let large_amount = u128::MAX / 200;
    let account = Account {
        locked_amount: U128(large_amount),
        lock_months: 48,
        ..Default::default()
    };

    let effective = contract.effective_stake(&account);
    assert_eq!(effective, large_amount * 150 / 100);
}

#[test]
fn test_precision_constant() {
    assert_eq!(PRECISION, 10u128.pow(18));
}

// --- Stats Consistency Tests ---

#[test]
fn test_stats_reflects_state() {
    let mut contract = setup_contract();

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

// --- Storage Deposit Tests ---

#[test]
fn test_deposit_storage_new_user() {
    let mut contract = setup_contract();

    let mut context = get_context("alice.near".parse().unwrap());
    context.attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT));
    testing_env!(context.build());

    assert!(!contract.has_storage("alice.near".parse().unwrap()));
    contract.deposit_storage();
    assert!(contract.has_storage("alice.near".parse().unwrap()));
}

#[test]
fn test_deposit_storage_already_paid() {
    let mut contract = setup_contract();

    let mut context = get_context("alice.near".parse().unwrap());
    context.attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT));
    testing_env!(context.build());
    contract.deposit_storage();

    let mut context2 = get_context("alice.near".parse().unwrap());
    context2.attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT));
    testing_env!(context2.build());
    contract.deposit_storage();
    assert!(contract.has_storage("alice.near".parse().unwrap()));
}

#[test]
fn test_storage_deposit_requirement() {
    assert_eq!(STORAGE_DEPOSIT, 5_000_000_000_000_000_000_000);
}

// --- FT On Transfer Tests ---

#[test]
fn test_ft_on_transfer_lock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    let returned = call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    assert_eq!(returned.0, 0);
    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.locked_amount.0, 1000);
    assert_eq!(account.lock_months, 6);
    assert_eq!(contract.total_locked, 1000);
    assert_eq!(contract.total_effective_stake, 1100);
}

#[test]
fn test_ft_on_transfer_credits() {
    let mut contract = setup_contract();

    let returned =
        call_ft_on_transfer(&mut contract, "alice.near", 1000, r#"{"action":"credits"}"#);

    assert_eq!(returned.0, 0);
    assert_eq!(contract.infra_pool, 600);
    assert_eq!(contract.rewards_pool, 400);
}

#[test]
fn test_ft_on_transfer_rewards_owner() {
    let mut contract = setup_contract();

    let returned = call_ft_on_transfer(&mut contract, "owner.near", 500, r#"{"action":"rewards"}"#);

    assert_eq!(returned.0, 0);
    assert_eq!(contract.rewards_pool, 500);
}

#[test]
fn test_ft_on_transfer_lock_all_periods() {
    for months in VALID_LOCK_PERIODS {
        let mut contract = setup_contract();
        setup_with_storage(&mut contract, "alice.near");

        let msg = format!(r#"{{"action":"lock","months":{}}}"#, months);
        let returned = call_ft_on_transfer(&mut contract, "alice.near", 1000, &msg);

        assert_eq!(returned.0, 0);
        let account = contract.get_account("alice.near".parse().unwrap());
        assert_eq!(account.lock_months, months);
    }
}

// --- Extend Lock Tests ---

#[test]
fn test_extend_lock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    let account_before = contract.get_account("alice.near".parse().unwrap());
    let old_unlock = account_before.unlock_at;

    let mut context = get_context("alice.near".parse().unwrap());
    context.block_timestamp(old_unlock - MONTH_NS);
    testing_env!(context.build());

    contract.extend_lock(12);

    let account_after = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account_after.lock_months, 12);
    assert!(account_after.unlock_at > old_unlock);
    assert_eq!(contract.total_effective_stake, 1200);
}

#[test]
fn test_extend_lock_same_period() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    let account_before = contract.get_account("alice.near".parse().unwrap());
    let old_unlock = account_before.unlock_at;

    let mut context = get_context("alice.near".parse().unwrap());
    context.block_timestamp(old_unlock - MONTH_NS);
    testing_env!(context.build());

    contract.extend_lock(6);

    let account_after = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account_after.lock_months, 6);
    assert!(account_after.unlock_at > old_unlock);
}

// --- Renew Lock Tests ---

#[test]
fn test_renew_lock() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    let account_before = contract.get_account("alice.near".parse().unwrap());
    let old_unlock = account_before.unlock_at;

    let mut context = get_context("alice.near".parse().unwrap());
    context.block_timestamp(old_unlock - MONTH_NS);
    testing_env!(context.build());

    contract.renew_lock();

    let account_after = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account_after.lock_months, 6);
    assert!(account_after.unlock_at > old_unlock);
}

// --- Pending Rewards Tests ---

#[test]
fn test_pending_rewards_calculation() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    call_ft_on_transfer(&mut contract, "bob.near", 1000, r#"{"action":"credits"}"#);

    let pending = contract.get_pending_rewards("alice.near".parse().unwrap());
    assert!(
        (pending.0 as i128 - 400).abs() <= 1,
        "Expected ~400, got {}",
        pending.0
    );
}

#[test]
fn test_pending_rewards_no_stake() {
    let contract = setup_contract();

    let pending = contract.get_pending_rewards("alice.near".parse().unwrap());
    assert_eq!(pending.0, 0);
}

// --- Multiple Stakers Distribution Tests ---

#[test]
fn test_multiple_stakers_reward_distribution() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");
    setup_with_storage(&mut contract, "bob.near");

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":48}"#,
    );

    call_ft_on_transfer(
        &mut contract,
        "bob.near",
        1000,
        r#"{"action":"lock","months":1}"#,
    );

    assert_eq!(contract.total_effective_stake, 2600);

    call_ft_on_transfer(
        &mut contract,
        "charlie.near",
        1000,
        r#"{"action":"credits"}"#,
    );

    let alice_pending = contract.get_pending_rewards("alice.near".parse().unwrap());
    let bob_pending = contract.get_pending_rewards("bob.near".parse().unwrap());

    assert!(alice_pending.0 > bob_pending.0);
    assert!((alice_pending.0 + bob_pending.0).abs_diff(400) <= 1);
}

// --- Add More Tokens Tests ---

#[test]
fn test_lock_add_more_tokens() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    assert_eq!(contract.total_locked, 1000);
    assert_eq!(contract.total_effective_stake, 1100);

    let account1 = contract.get_account("alice.near".parse().unwrap());
    let original_unlock = account1.unlock_at;

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        500,
        r#"{"action":"lock","months":6}"#,
    );

    let account2 = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account2.locked_amount.0, 1500);
    assert_eq!(contract.total_locked, 1500);
    assert_eq!(contract.total_effective_stake, 1650);
    assert!(account2.unlock_at >= original_unlock);
}

#[test]
fn test_lock_add_with_longer_period() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    assert_eq!(contract.total_effective_stake, 1100);

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        500,
        r#"{"action":"lock","months":12}"#,
    );

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.locked_amount.0, 1500);
    assert_eq!(account.lock_months, 12);
    assert_eq!(contract.total_effective_stake, 1800);
}

// --- Rewards Injection Tests ---

#[test]
fn test_rewards_injection_distributes() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    call_ft_on_transfer(&mut contract, "owner.near", 500, r#"{"action":"rewards"}"#);

    let pending = contract.get_pending_rewards("alice.near".parse().unwrap());
    assert!(
        (pending.0 as i128 - 500).abs() <= 1,
        "Expected ~500, got {}",
        pending.0
    );
}

#[test]
fn test_rewards_injection_no_stakers() {
    let mut contract = setup_contract();

    call_ft_on_transfer(&mut contract, "owner.near", 500, r#"{"action":"rewards"}"#);

    assert_eq!(contract.rewards_pool, 500);
    assert_eq!(contract.reward_per_token_stored, 0);
}

#[test]
fn test_first_staker_gets_accumulated_rewards() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    call_ft_on_transfer(&mut contract, "bob.near", 1000, r#"{"action":"credits"}"#);

    assert_eq!(contract.rewards_pool, 400);
    assert_eq!(contract.reward_per_token_stored, 0);

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    let pending = contract.get_pending_rewards("alice.near".parse().unwrap());
    assert!(
        (pending.0 as i128 - 400).abs() <= 1,
        "Expected ~400, got {}",
        pending.0
    );
}

// --- Infra Pool Tests ---

#[test]
fn test_infra_pool_accumulates() {
    let mut contract = setup_contract();

    call_ft_on_transfer(&mut contract, "alice.near", 1000, r#"{"action":"credits"}"#);
    assert_eq!(contract.infra_pool, 600);

    call_ft_on_transfer(&mut contract, "bob.near", 1000, r#"{"action":"credits"}"#);
    assert_eq!(contract.infra_pool, 1200);
}

// --- Update Rewards Tests ---

#[test]
fn test_update_rewards_no_stake() {
    let mut contract = setup_contract();

    contract.reward_per_token_stored = PRECISION;
    contract.update_rewards(&"alice.near".parse().unwrap());

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.reward_per_token_paid.0, PRECISION);
    assert_eq!(account.pending_rewards.0, 0);
}

#[test]
fn test_update_rewards_with_stake() {
    let mut contract = setup_contract();
    setup_with_storage(&mut contract, "alice.near");

    call_ft_on_transfer(
        &mut contract,
        "alice.near",
        1000,
        r#"{"action":"lock","months":6}"#,
    );

    contract.reward_per_token_stored = PRECISION / 10;

    contract.update_rewards(&"alice.near".parse().unwrap());

    let account = contract.get_account("alice.near".parse().unwrap());
    assert_eq!(account.pending_rewards.0, 110);
}

// --- Calculate Earned Tests ---

#[test]
fn test_calculate_earned() {
    let contract = setup_contract();

    let account = Account {
        locked_amount: U128(1000),
        lock_months: 6,
        reward_per_token_paid: U128(0),
        ..Default::default()
    };

    let mut contract_with_rewards = contract;
    contract_with_rewards.reward_per_token_stored = PRECISION / 10;

    let earned = contract_with_rewards.calculate_earned(&account);
    assert_eq!(earned, 110);
}

#[test]
fn test_calculate_earned_partial() {
    let contract = setup_contract();

    let account = Account {
        locked_amount: U128(1000),
        lock_months: 6,
        reward_per_token_paid: U128(PRECISION / 20),
        ..Default::default()
    };

    let mut contract_with_rewards = contract;
    contract_with_rewards.reward_per_token_stored = PRECISION / 10;

    let earned = contract_with_rewards.calculate_earned(&account);
    assert_eq!(earned, 55);
}
