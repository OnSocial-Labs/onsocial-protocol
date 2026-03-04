#[cfg(test)]
mod unit {
    use crate::*;
    use near_sdk::json_types::U128;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::testing_env;

    fn owner() -> AccountId {
        accounts(0)
    }
    fn token() -> AccountId {
        accounts(1)
    }
    fn user() -> AccountId {
        accounts(2)
    }
    fn bot() -> AccountId {
        accounts(3)
    }
    fn relayer() -> AccountId {
        "relayer.testnet".parse().unwrap()
    }

    fn context(predecessor: AccountId) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(predecessor);
        b.block_timestamp(1_700_000_000_000_000_000); // ~2023-11-14
        b
    }

    fn new_contract() -> RewardsContract {
        let ctx = context(owner());
        testing_env!(ctx.build());
        RewardsContract::new(owner(), token(), U128(100_000))
    }

    // ── Init ─────────────────────────────────────────────────────────

    #[test]
    fn test_init() {
        let c = new_contract();
        assert_eq!(c.owner_id, owner());
        assert_eq!(c.social_token, token());
        assert_eq!(c.max_daily, 100_000);
        assert_eq!(c.pool_balance, 0);
    }

    // ── Pool deposit ─────────────────────────────────────────────────

    #[test]
    fn test_ft_on_transfer_deposit() {
        let mut c = new_contract();
        testing_env!(context(token()).build());

        let result = c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());

        assert_eq!(c.pool_balance, 50_000);
        assert_eq!(result.0, 0);
    }

    // =================================================================
    // NEGATIVE TESTS (ft_on_transfer)
    // =================================================================
    // NOTE: Tests using #[should_panic] are not compatible with NEAR SDK's
    // env::panic_str() in release mode (abort vs unwind). These negative test
    // cases should be covered in integration tests (sandbox) where contract
    // panics are properly caught as transaction failures.
    //
    // Negative cases to test in integration tests:
    // - ft_on_transfer from non-owner sender (Only owner can deposit)
    // - ft_on_transfer from wrong token contract (Wrong token)
    // - ft_on_transfer with invalid JSON message
    // - ft_on_transfer with unknown action

    // ── Credit reward (direct call) ──────────────────────────────────

    #[test]
    fn test_credit_reward_by_owner() {
        let mut c = new_contract();

        // Deposit first
        testing_env!(context(token()).build());
        let _ = c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());

        // Credit via dispatch
        testing_env!(context(owner()).build());
        let result = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1_000),
                source: Some("telegram_mod".into()),
            },
            &owner(),
        );
        assert!(result.is_ok());

        let user_info = c.users.get(&user()).unwrap();
        assert_eq!(user_info.claimable, 1_000);
        assert_eq!(user_info.daily_earned, 1_000);
        assert_eq!(user_info.total_earned, 1_000);
        assert_eq!(c.pool_balance, 49_000);
    }

    #[test]
    fn test_credit_reward_by_authorized_caller() {
        let mut c = new_contract();

        // Deposit
        testing_env!(context(token()).build());
        let _ = c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());

        // Add bot as authorized caller
        testing_env!(context(owner()).build());
        c.add_authorized_caller(bot());

        // Credit via bot
        let result = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(500),
                source: Some("telegram_mod".into()),
            },
            &bot(),
        );
        assert!(result.is_ok());
        assert_eq!(c.users.get(&user()).unwrap().claimable, 500);
    }

    #[test]
    fn test_credit_reward_unauthorized() {
        let mut c = new_contract();

        testing_env!(context(token()).build());
        let _ = c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());

        testing_env!(context(owner()).build());
        let result = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1_000),
                source: None,
            },
            &user(), // user is NOT authorized
        );
        assert!(matches!(result, Err(RewardsError::Unauthorized(_))));
    }

    // ── Daily cap ────────────────────────────────────────────────────

    #[test]
    fn test_daily_cap_enforced() {
        let mut c = new_contract();

        testing_env!(context(token()).build());
        let _ = c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        testing_env!(context(owner()).build());

        // Credit up to cap
        let r1 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(100_000),
                source: None,
            },
            &owner(),
        );
        assert!(r1.is_ok());

        // Over cap — should fail
        let r2 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1),
                source: None,
            },
            &owner(),
        );
        assert!(matches!(r2, Err(RewardsError::DailyCapReached)));
    }

    #[test]
    fn test_daily_cap_resets_next_day() {
        let mut c = new_contract();

        testing_env!(context(token()).build());
        let _ = c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        // Day 1: credit to cap
        testing_env!(context(owner()).build());
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(100_000),
                source: None,
            },
            &owner(),
        )
        .unwrap();

        // Next day
        let mut ctx = context(owner());
        ctx.block_timestamp(1_700_000_000_000_000_000 + crate::NS_PER_DAY);
        testing_env!(ctx.build());

        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(50_000),
                source: None,
            },
            &owner(),
        );
        assert!(r.is_ok());
        assert_eq!(c.users.get(&user()).unwrap().claimable, 150_000);
    }

    // ── Insufficient pool ────────────────────────────────────────────

    #[test]
    fn test_insufficient_pool() {
        let mut c = new_contract();
        // No deposit — pool is 0

        testing_env!(context(owner()).build());
        let result = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1_000),
                source: None,
            },
            &owner(),
        );
        assert!(matches!(result, Err(RewardsError::InsufficientPool(_))));
    }

    // ── Claim (unit — can't test cross-contract ft_transfer) ─────────

    #[test]
    fn test_claim_nothing() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());

        let result = c.dispatch_action(Action::Claim, &user());
        assert!(matches!(result, Err(RewardsError::NothingToClaim)));
    }

    // ── Admin ────────────────────────────────────────────────────────

    #[test]
    fn test_set_max_daily() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());
        c.set_max_daily(U128(200_000));
        assert_eq!(c.max_daily, 200_000);
    }

    // NOTE: test_set_max_daily_non_owner is covered in integration tests.
    // #[should_panic] is incompatible with NEAR SDK's env::panic_str().

    #[test]
    fn test_transfer_ownership() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());
        c.transfer_ownership(user());
        assert_eq!(c.owner_id, user());
    }

    #[test]
    fn test_add_remove_intents_executor() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());

        c.add_intents_executor(relayer());
        assert!(c.intents_executors.contains(&relayer()));

        c.remove_intents_executor(relayer());
        assert!(!c.intents_executors.contains(&relayer()));
    }

    // ── Views ────────────────────────────────────────────────────────

    #[test]
    fn test_get_contract_info() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let info = c.get_contract_info();
        assert_eq!(info.version, "0.1.0");
        assert_eq!(info.owner_id, owner());
        assert_eq!(info.max_daily.0, 100_000);
    }

    #[test]
    fn test_get_claimable_zero() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        assert_eq!(c.get_claimable(user()).0, 0);
    }

    #[test]
    fn test_get_user_reward_none() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        assert!(c.get_user_reward(user()).is_none());
    }
}
