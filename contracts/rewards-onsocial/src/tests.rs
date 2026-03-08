#[cfg(test)]
mod unit {
    use crate::*;
    use near_sdk::json_types::U128;
    use near_sdk::serde_json;
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
    // NOTE: ft_on_transfer uses require! / env::panic_str which aborts in
    // release mode, so negative cases must be tested in integration tests
    // (sandbox) where contract panics are caught as transaction failures.
    // All admin validation uses Result<(), RewardsError> + #[handle_result],
    // so those negative cases are fully covered in unit tests below.
    //
    // ft_on_transfer negative cases to test in integration tests:
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
                app_id: None,
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
        c.add_authorized_caller(bot()).unwrap();

        // Credit via bot
        let result = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(500),
                source: Some("telegram_mod".into()),
                app_id: None,
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
                app_id: None,
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
                app_id: None,
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
                app_id: None,
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
                app_id: None,
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
                app_id: None,
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
                app_id: None,
            },
            &owner(),
        );
        assert!(matches!(result, Err(RewardsError::InsufficientPool(_))));
    }

    // ── Multi-app rewards ────────────────────────────────────────────

    fn partner() -> AccountId {
        "partner.testnet".parse().unwrap()
    }

    fn setup_app(c: &mut RewardsContract) {
        testing_env!(context(owner()).build());
        c.register_app(RegisterApp {
            app_id: "game_xyz".into(),
            label: "Partner Game".into(),
            daily_cap: U128(10_000),
            reward_per_action: U128(500),
            authorized_callers: vec![partner()],
            total_budget: U128(1_000_000),
            daily_budget: U128(0),
        })
        .unwrap();
    }

    #[test]
    fn test_register_app() {
        let mut c = new_contract();
        setup_app(&mut c);

        let config = c.app_configs.get("game_xyz").unwrap();
        assert_eq!(config.label, "Partner Game");
        assert_eq!(config.daily_cap, 10_000);
        assert_eq!(config.reward_per_action, 500);
        assert!(config.active);
        assert_eq!(config.authorized_callers, vec![partner()]);
        assert_eq!(c.app_ids, vec!["game_xyz".to_string()]);
    }

    #[test]
    fn test_credit_via_app() {
        let mut c = new_contract();
        setup_app(&mut c);

        // Deposit tokens into pool
        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(100_000), r#"{"action":"deposit"}"#.into());

        // Partner credits user via app
        testing_env!(context(owner()).build());
        let result = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(2_000),
                source: Some("level_up".into()),
                app_id: Some("game_xyz".into()),
            },
            &partner(),
        );
        assert!(result.is_ok());

        // User's global claimable updated
        let u = c.users.get(&user()).unwrap();
        assert_eq!(u.claimable, 2_000);
        assert_eq!(u.total_earned, 2_000);
        // Global daily_earned should NOT be bumped for app credits
        assert_eq!(u.daily_earned, 0);

        // Per-app tracking updated
        let key = RewardsContract::user_app_key(&user(), "game_xyz");
        let app_r = c.user_app_rewards.get(&key).unwrap();
        assert_eq!(app_r.daily_earned, 2_000);
        assert_eq!(app_r.total_earned, 2_000);

        assert_eq!(c.pool_balance, 98_000);
    }

    #[test]
    fn test_app_daily_cap_enforced() {
        let mut c = new_contract();
        setup_app(&mut c); // daily_cap = 10_000

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        testing_env!(context(owner()).build());

        // Credit up to app cap
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(10_000),
                source: None,
                app_id: Some("game_xyz".into()),
            },
            &partner(),
        )
        .unwrap();

        // Next credit should fail with AppDailyCapReached
        let r2 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1),
                source: None,
                app_id: Some("game_xyz".into()),
            },
            &partner(),
        );
        assert!(matches!(r2, Err(RewardsError::AppDailyCapReached(_))));
    }

    #[test]
    fn test_app_unauthorized_caller() {
        let mut c = new_contract();
        setup_app(&mut c);

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());

        testing_env!(context(owner()).build());
        // bot() is NOT in game_xyz's authorized_callers
        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1_000),
                source: None,
                app_id: Some("game_xyz".into()),
            },
            &bot(),
        );
        assert!(matches!(r, Err(RewardsError::Unauthorized(_))));
    }

    #[test]
    fn test_app_not_found() {
        let mut c = new_contract();

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());

        testing_env!(context(owner()).build());
        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1_000),
                source: None,
                app_id: Some("nonexistent".into()),
            },
            &owner(),
        );
        assert!(matches!(r, Err(RewardsError::AppNotFound(_))));
    }

    #[test]
    fn test_deactivated_app() {
        let mut c = new_contract();
        setup_app(&mut c);

        testing_env!(context(owner()).build());
        c.deactivate_app("game_xyz".into()).unwrap();

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());

        testing_env!(context(owner()).build());
        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1_000),
                source: None,
                app_id: Some("game_xyz".into()),
            },
            &partner(),
        );
        assert!(matches!(r, Err(RewardsError::AppInactive(_))));
    }

    #[test]
    fn test_app_and_global_independent_caps() {
        let mut c = new_contract(); // global max_daily = 100_000
        setup_app(&mut c); // game_xyz daily_cap = 10_000

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        // Credit via app (doesn't consume global daily budget)
        testing_env!(context(owner()).build());
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(10_000),
                source: None,
                app_id: Some("game_xyz".into()),
            },
            &partner(),
        )
        .unwrap();

        // Global daily still has full 100k available
        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(100_000),
                source: None,
                app_id: None,
            },
            &owner(),
        );
        assert!(r.is_ok());
        assert_eq!(c.users.get(&user()).unwrap().claimable, 110_000);
    }

    #[test]
    fn test_update_app() {
        let mut c = new_contract();
        setup_app(&mut c);

        testing_env!(context(owner()).build());
        c.update_app(UpdateApp {
            app_id: "game_xyz".into(),
            daily_cap: Some(U128(20_000)),
            reward_per_action: None,
            active: None,
            authorized_callers: None,
            total_budget: None,
            daily_budget: None,
        })
        .unwrap();

        let config = c.app_configs.get("game_xyz").unwrap();
        assert_eq!(config.daily_cap, 20_000);
        assert_eq!(config.reward_per_action, 500); // unchanged
    }

    #[test]
    fn test_app_total_budget_enforced() {
        let mut c = new_contract();

        // Register app with 5,000 total budget
        testing_env!(context(owner()).build());
        c.register_app(RegisterApp {
            app_id: "capped_app".into(),
            label: "Budget App".into(),
            daily_cap: U128(100_000), // high per-user daily cap
            reward_per_action: U128(500),
            authorized_callers: vec![partner()],
            total_budget: U128(5_000), // 5k lifetime budget
            daily_budget: U128(0),     // unlimited daily budget
        })
        .unwrap();

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        // Credit 4,000 — should succeed
        testing_env!(context(owner()).build());
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(4_000),
                source: None,
                app_id: Some("capped_app".into()),
            },
            &partner(),
        )
        .unwrap();

        // Credit 2,000 — should be clamped to 1,000 (remaining budget)
        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(2_000),
                source: None,
                app_id: Some("capped_app".into()),
            },
            &partner(),
        );
        assert!(r.is_ok());
        assert_eq!(c.users.get(&user()).unwrap().claimable, 5_000); // 4k + 1k clamped

        // Budget exhausted — should fail
        let r2 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1),
                source: None,
                app_id: Some("capped_app".into()),
            },
            &partner(),
        );
        assert!(matches!(r2, Err(RewardsError::AppBudgetExhausted(_))));

        // Config tracks total_credited
        let config = c.app_configs.get("capped_app").unwrap();
        assert_eq!(config.total_credited, 5_000);
    }

    #[test]
    fn test_get_app_views() {
        let mut c = new_contract();
        setup_app(&mut c);

        testing_env!(context(owner()).build());
        let apps = c.get_all_apps();
        assert_eq!(apps, vec!["game_xyz".to_string()]);

        let config = c.get_app_config("game_xyz".into());
        assert!(config.is_some());
        assert_eq!(config.unwrap().label, "Partner Game");

        // No reward yet
        assert!(c.get_user_app_reward(user(), "game_xyz".into()).is_none());
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
        c.set_max_daily(U128(200_000)).unwrap();
        assert_eq!(c.max_daily, 200_000);
    }

    // NOTE: test_set_max_daily_non_owner now tested via check_owner() returning
    // Err(RewardsError::Unauthorized) — see test_register_app_not_owner below.

    #[test]
    fn test_transfer_ownership() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());
        c.transfer_ownership(user()).unwrap();
        assert_eq!(c.owner_id, user());
    }

    #[test]
    fn test_add_remove_intents_executor() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());

        c.add_intents_executor(relayer()).unwrap();
        assert!(c.intents_executors.contains(&relayer()));

        c.remove_intents_executor(relayer()).unwrap();
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

    #[test]
    fn test_app_daily_budget_enforced() {
        let mut c = new_contract();

        // Register app with 3,000 aggregate daily budget, high per-user cap
        testing_env!(context(owner()).build());
        c.register_app(RegisterApp {
            app_id: "daily_capped".into(),
            label: "Daily Budget App".into(),
            daily_cap: U128(100_000), // per-user daily cap (high)
            reward_per_action: U128(500),
            authorized_callers: vec![partner()],
            total_budget: U128(500_000), // 500k lifetime budget
            daily_budget: U128(3_000),   // 3k aggregate daily budget
        })
        .unwrap();

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        // Credit 2,000 for user — should succeed
        testing_env!(context(owner()).build());
        let r1 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(2_000),
                source: None,
                app_id: Some("daily_capped".into()),
            },
            &partner(),
        );
        assert!(r1.is_ok());

        // Credit 2,000 for bot (different user) — should be clamped to 1,000
        let r2 = c
            .dispatch_action(
                Action::CreditReward {
                    account_id: bot(),
                    amount: U128(2_000),
                    source: None,
                    app_id: Some("daily_capped".into()),
                },
                &partner(),
            )
            .unwrap();
        // Only 1,000 remaining from daily budget
        let credited: String = serde_json::from_value(r2["credited"].clone()).unwrap();
        assert_eq!(credited, "1000");

        // Credit anything more — daily budget exhausted
        let r3 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1),
                source: None,
                app_id: Some("daily_capped".into()),
            },
            &partner(),
        );
        assert!(matches!(r3, Err(RewardsError::AppDailyBudgetExhausted(_))));

        // Config tracks daily_budget_spent
        let config = c.app_configs.get("daily_capped").unwrap();
        assert_eq!(config.daily_budget_spent, 3_000);
        assert_eq!(config.daily_budget, 3_000);

        // Next day — should reset
        let mut ctx = context(owner());
        ctx.block_timestamp(1_700_000_000_000_000_000 + 86_400_000_000_000);
        testing_env!(ctx.build());

        let r4 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1_000),
                source: None,
                app_id: Some("daily_capped".into()),
            },
            &partner(),
        );
        assert!(r4.is_ok());

        let config = c.app_configs.get("daily_capped").unwrap();
        assert_eq!(config.daily_budget_spent, 1_000); // reset and new credit
    }

    // ── Pre-migration coverage ───────────────────────────────────────

    #[test]
    fn test_credit_zero_amount() {
        let mut c = new_contract();
        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());

        testing_env!(context(owner()).build());
        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(0),
                source: None,
                app_id: None,
            },
            &owner(),
        );
        assert!(matches!(r, Err(RewardsError::InvalidAmount)));
    }

    #[test]
    fn test_owner_bypasses_app_authorized_callers() {
        let mut c = new_contract();
        setup_app(&mut c); // authorized_callers = [partner()]

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());

        // Owner is NOT in app's authorized_callers but should still succeed
        testing_env!(context(owner()).build());
        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1_000),
                source: None,
                app_id: Some("game_xyz".into()),
            },
            &owner(),
        );
        assert!(r.is_ok());
        assert_eq!(c.users.get(&user()).unwrap().claimable, 1_000);
    }

    #[test]
    fn test_app_per_user_daily_cap_resets_next_day() {
        let mut c = new_contract();
        setup_app(&mut c); // daily_cap = 10_000

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        // Day 1: exhaust per-user app cap
        testing_env!(context(owner()).build());
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(10_000),
                source: None,
                app_id: Some("game_xyz".into()),
            },
            &partner(),
        )
        .unwrap();

        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1),
                source: None,
                app_id: Some("game_xyz".into()),
            },
            &partner(),
        );
        assert!(matches!(r, Err(RewardsError::AppDailyCapReached(_))));

        // Day 2: cap should reset
        let mut ctx = context(owner());
        ctx.block_timestamp(1_700_000_000_000_000_000 + NS_PER_DAY);
        testing_env!(ctx.build());

        let r2 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(5_000),
                source: None,
                app_id: Some("game_xyz".into()),
            },
            &partner(),
        );
        assert!(r2.is_ok());
        assert_eq!(c.users.get(&user()).unwrap().claimable, 15_000);
    }

    #[test]
    fn test_global_credit_clamped_to_remaining() {
        let mut c = new_contract(); // max_daily = 100_000

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        // Credit 80k first
        testing_env!(context(owner()).build());
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(80_000),
                source: None,
                app_id: None,
            },
            &owner(),
        )
        .unwrap();

        // Request 50k but only 20k remaining in daily cap → should clamp
        let r = c
            .dispatch_action(
                Action::CreditReward {
                    account_id: user(),
                    amount: U128(50_000),
                    source: None,
                    app_id: None,
                },
                &owner(),
            )
            .unwrap();

        let credited: String = serde_json::from_value(r["credited"].clone()).unwrap();
        assert_eq!(credited, "20000");
        assert_eq!(c.users.get(&user()).unwrap().claimable, 100_000);
        assert_eq!(c.pool_balance, 400_000);
    }

    #[test]
    fn test_on_claim_callback_rollback() {
        let mut c = new_contract();

        // Deposit and credit
        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());
        testing_env!(context(owner()).build());
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(5_000),
                source: None,
                app_id: None,
            },
            &owner(),
        )
        .unwrap();

        // Simulate optimistic claim state (what handle_claim does)
        let mut u = c.users.get(&user()).cloned().unwrap();
        let amount = u.claimable;
        u.claimable = 0;
        u.total_claimed = u.total_claimed.saturating_add(amount);
        c.users.insert(user(), u);
        c.pending_claims.insert(user(), PendingClaim { amount });
        c.total_claimed = c.total_claimed.saturating_add(amount);

        assert_eq!(c.users.get(&user()).unwrap().claimable, 0);
        assert_eq!(c.total_claimed, 5_000);

        // Simulate callback failure → rollback
        let contract_id: AccountId = "contract.testnet".parse().unwrap();
        let mut ctx = context(contract_id);
        ctx.predecessor_account_id("contract.testnet".parse().unwrap());
        testing_env!(ctx.build());

        c.on_claim_callback(Err(PromiseError::Failed), user(), U128(amount));

        // Verify rollback: claimable restored, total_claimed decremented, pending removed
        let u = c.users.get(&user()).unwrap();
        assert_eq!(u.claimable, 5_000);
        assert_eq!(u.total_claimed, 0);
        assert_eq!(c.total_claimed, 0);
        assert!(!c.pending_claims.contains_key(&user()));
    }

    #[test]
    fn test_on_claim_callback_success() {
        let mut c = new_contract();

        // Deposit and credit
        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(50_000), r#"{"action":"deposit"}"#.into());
        testing_env!(context(owner()).build());
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(3_000),
                source: None,
                app_id: None,
            },
            &owner(),
        )
        .unwrap();

        // Simulate optimistic claim state
        let mut u = c.users.get(&user()).cloned().unwrap();
        let amount = u.claimable;
        u.claimable = 0;
        u.total_claimed = u.total_claimed.saturating_add(amount);
        c.users.insert(user(), u);
        c.pending_claims.insert(user(), PendingClaim { amount });
        c.total_claimed = c.total_claimed.saturating_add(amount);

        // Simulate callback success
        let contract_id: AccountId = "contract.testnet".parse().unwrap();
        let mut ctx = context(contract_id);
        ctx.predecessor_account_id("contract.testnet".parse().unwrap());
        testing_env!(ctx.build());

        c.on_claim_callback(Ok(()), user(), U128(amount));

        // Verify: claimable stays 0, total_claimed stays, pending removed
        let u = c.users.get(&user()).unwrap();
        assert_eq!(u.claimable, 0);
        assert_eq!(u.total_claimed, 3_000);
        assert_eq!(c.total_claimed, 3_000);
        assert!(!c.pending_claims.contains_key(&user()));
    }

    #[test]
    fn test_multiple_apps_isolated() {
        let mut c = new_contract();

        testing_env!(context(owner()).build());
        c.register_app(RegisterApp {
            app_id: "app_a".into(),
            label: "App A".into(),
            daily_cap: U128(5_000),
            reward_per_action: U128(100),
            authorized_callers: vec![partner()],
            total_budget: U128(500_000),
            daily_budget: U128(0),
        })
        .unwrap();
        c.register_app(RegisterApp {
            app_id: "app_b".into(),
            label: "App B".into(),
            daily_cap: U128(8_000),
            reward_per_action: U128(200),
            authorized_callers: vec![bot()],
            total_budget: U128(10_000),
            daily_budget: U128(0),
        })
        .unwrap();

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        // Credit via app_a
        testing_env!(context(owner()).build());
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(5_000),
                source: None,
                app_id: Some("app_a".into()),
            },
            &partner(),
        )
        .unwrap();

        // app_a cap exhausted
        let r = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1),
                source: None,
                app_id: Some("app_a".into()),
            },
            &partner(),
        );
        assert!(matches!(r, Err(RewardsError::AppDailyCapReached(_))));

        // app_b still has full cap — different caller (bot)
        let r2 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(3_000),
                source: None,
                app_id: Some("app_b".into()),
            },
            &bot(),
        );
        assert!(r2.is_ok());

        // partner cannot credit app_b
        let r3 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1_000),
                source: None,
                app_id: Some("app_b".into()),
            },
            &partner(),
        );
        assert!(matches!(r3, Err(RewardsError::Unauthorized(_))));

        // User claimable = 5k + 3k from both apps
        assert_eq!(c.users.get(&user()).unwrap().claimable, 8_000);

        // Per-app tracking independent
        let key_a = RewardsContract::user_app_key(&user(), "app_a");
        let key_b = RewardsContract::user_app_key(&user(), "app_b");
        assert_eq!(c.user_app_rewards.get(&key_a).unwrap().daily_earned, 5_000);
        assert_eq!(c.user_app_rewards.get(&key_b).unwrap().daily_earned, 3_000);

        // app_b total_credited tracked
        assert_eq!(c.app_configs.get("app_b").unwrap().total_credited, 3_000);
    }

    #[test]
    fn test_combined_total_and_daily_budget() {
        let mut c = new_contract();

        // App: total_budget=6000, daily_budget=4000, per-user daily_cap=100_000
        testing_env!(context(owner()).build());
        c.register_app(RegisterApp {
            app_id: "combo".into(),
            label: "Combo".into(),
            daily_cap: U128(100_000),
            reward_per_action: U128(500),
            authorized_callers: vec![partner()],
            total_budget: U128(6_000),
            daily_budget: U128(4_000),
        })
        .unwrap();

        testing_env!(context(token()).build());
        c.ft_on_transfer(owner(), U128(500_000), r#"{"action":"deposit"}"#.into());

        // Day 1: credit 3,000 — within both budgets
        testing_env!(context(owner()).build());
        c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(3_000),
                source: None,
                app_id: Some("combo".into()),
            },
            &partner(),
        )
        .unwrap();

        // Day 1: credit 5,000 — daily_budget has 1k left, total_budget has 3k left → clamped to 1k
        let r = c
            .dispatch_action(
                Action::CreditReward {
                    account_id: bot(),
                    amount: U128(5_000),
                    source: None,
                    app_id: Some("combo".into()),
                },
                &partner(),
            )
            .unwrap();
        let credited: String = serde_json::from_value(r["credited"].clone()).unwrap();
        assert_eq!(credited, "1000"); // clamped by daily_budget (4k - 3k = 1k remaining)

        // Day 1: daily budget exhausted
        let r2 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1),
                source: None,
                app_id: Some("combo".into()),
            },
            &partner(),
        );
        assert!(matches!(r2, Err(RewardsError::AppDailyBudgetExhausted(_))));

        // Day 2: daily resets, but total_budget only has 2k left
        let mut ctx = context(owner());
        ctx.block_timestamp(1_700_000_000_000_000_000 + NS_PER_DAY);
        testing_env!(ctx.build());

        let r3 = c
            .dispatch_action(
                Action::CreditReward {
                    account_id: user(),
                    amount: U128(5_000),
                    source: None,
                    app_id: Some("combo".into()),
                },
                &partner(),
            )
            .unwrap();
        let credited: String = serde_json::from_value(r3["credited"].clone()).unwrap();
        assert_eq!(credited, "2000"); // clamped by total_budget (6k - 4k = 2k remaining)

        // Total budget now exhausted
        let r4 = c.dispatch_action(
            Action::CreditReward {
                account_id: user(),
                amount: U128(1),
                source: None,
                app_id: Some("combo".into()),
            },
            &partner(),
        );
        assert!(matches!(r4, Err(RewardsError::AppBudgetExhausted(_))));

        assert_eq!(c.app_configs.get("combo").unwrap().total_credited, 6_000);
    }

    // ── Validation: register_app ─────────────────────────────────────

    /// Helper: build a valid RegisterApp config for mutation in negative tests.
    fn valid_register_config() -> RegisterApp {
        RegisterApp {
            app_id: "test_app".into(),
            label: "Test".into(),
            daily_cap: U128(1_000),
            reward_per_action: U128(100),
            authorized_callers: vec![partner()],
            total_budget: U128(100_000),
            daily_budget: U128(0),
        }
    }

    #[test]
    fn test_register_app_empty_app_id() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.app_id = "".into();
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("app_id cannot be empty")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_id_too_long() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.app_id = "a".repeat(65);
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("app_id too long")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_empty_label() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.label = "".into();
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("label cannot be empty")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_label_too_long() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.label = "x".repeat(129);
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("label too long")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_zero_reward() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.reward_per_action = U128(0);
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("reward_per_action must be > 0")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_reward_exceeds_max() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.reward_per_action = U128(1_000_000_000_000_000_001); // 1 SOCIAL + 1
        cfg.daily_cap = U128(10_000_000_000_000_000_000); // 10 SOCIAL (valid)
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("reward_per_action exceeds max")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_zero_daily_cap() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.daily_cap = U128(0);
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("daily_cap must be > 0")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_daily_cap_exceeds_max() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.daily_cap = U128(10_000_000_000_000_000_001); // 10 SOCIAL + 1
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("daily_cap exceeds max")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_daily_cap_less_than_reward() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.daily_cap = U128(50);
        cfg.reward_per_action = U128(100);
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("daily_cap must be >= reward_per_action")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_zero_total_budget() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.total_budget = U128(0);
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("total_budget must be > 0")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_empty_callers() {
        let c = new_contract();
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.authorized_callers = vec![];
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("authorized_callers cannot be empty")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_duplicate() {
        let mut c = new_contract();
        setup_app(&mut c);
        testing_env!(context(owner()).build());
        let mut cfg = valid_register_config();
        cfg.app_id = "game_xyz".into(); // already registered by setup_app
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("App already registered")),
            "{err}"
        );
    }

    #[test]
    fn test_register_app_max_apps() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());
        // Populate 100 apps directly (bypass register_app to avoid event-log
        // overhead in the unit-test mock environment).
        for i in 0..100 {
            let id = format!("app_{}", i);
            c.app_configs.insert(
                id.clone(),
                AppConfig {
                    label: format!("App {}", i),
                    daily_cap: 1_000,
                    reward_per_action: 100,
                    authorized_callers: vec![partner()],
                    active: true,
                    total_budget: 100_000,
                    total_credited: 0,
                    daily_budget: 0,
                    daily_budget_spent: 0,
                    budget_last_day: 0,
                },
            );
            c.app_ids.push(id);
        }
        assert_eq!(c.app_ids.len(), 100);
        // 101st should fail validation
        let cfg = RegisterApp {
            app_id: "app_100".into(),
            label: "One Too Many".into(),
            daily_cap: U128(1_000),
            reward_per_action: U128(100),
            authorized_callers: vec![partner()],
            total_budget: U128(100_000),
            daily_budget: U128(0),
        };
        let err = c.validate_register_app(&cfg).unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("Maximum number of apps reached")),
            "{err}"
        );
    }

    // ── Validation: register_app at exact limits (should pass) ───────

    #[test]
    fn test_register_app_at_exact_max_reward() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());
        // Exactly 1 SOCIAL reward — should succeed
        c.register_app(RegisterApp {
            app_id: "exact_rpa".into(),
            label: "Exact Max RPA".into(),
            daily_cap: U128(1_000_000_000_000_000_000), // = reward
            reward_per_action: U128(1_000_000_000_000_000_000), // exactly 1 SOCIAL
            authorized_callers: vec![partner()],
            total_budget: U128(100_000_000_000_000_000_000),
            daily_budget: U128(0),
        })
        .unwrap();
        assert!(c.app_configs.contains_key("exact_rpa"));
    }

    #[test]
    fn test_register_app_at_exact_max_daily_cap() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());
        // Exactly 10 SOCIAL daily cap — should succeed
        c.register_app(RegisterApp {
            app_id: "exact_dc".into(),
            label: "Exact Max DC".into(),
            daily_cap: U128(10_000_000_000_000_000_000), // exactly 10 SOCIAL
            reward_per_action: U128(100),
            authorized_callers: vec![partner()],
            total_budget: U128(100_000_000_000_000_000_000),
            daily_budget: U128(0),
        })
        .unwrap();
        assert!(c.app_configs.contains_key("exact_dc"));
    }

    #[test]
    fn test_register_app_max_length_id_and_label() {
        let mut c = new_contract();
        testing_env!(context(owner()).build());
        // Exactly 64 char app_id, 128 char label — should succeed
        c.register_app(RegisterApp {
            app_id: "a".repeat(64),
            label: "b".repeat(128),
            daily_cap: U128(1_000),
            reward_per_action: U128(100),
            authorized_callers: vec![partner()],
            total_budget: U128(100_000),
            daily_budget: U128(0),
        })
        .unwrap();
        assert!(c.app_configs.contains_key(&"a".repeat(64)));
    }

    // ── Validation: update_app ───────────────────────────────────────

    #[test]
    fn test_update_app_reward_exceeds_max() {
        let mut c = new_contract();
        setup_app(&mut c);
        testing_env!(context(owner()).build());
        let err = c
            .validate_update_app(&UpdateApp {
                app_id: "game_xyz".into(),
                daily_cap: None,
                reward_per_action: Some(U128(1_000_000_000_000_000_001)),
                active: None,
                authorized_callers: None,
                total_budget: None,
                daily_budget: None,
            })
            .unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("reward_per_action exceeds max")),
            "{err}"
        );
    }

    #[test]
    fn test_update_app_daily_cap_exceeds_max() {
        let mut c = new_contract();
        setup_app(&mut c);
        testing_env!(context(owner()).build());
        let err = c
            .validate_update_app(&UpdateApp {
                app_id: "game_xyz".into(),
                daily_cap: Some(U128(10_000_000_000_000_000_001)),
                reward_per_action: None,
                active: None,
                authorized_callers: None,
                total_budget: None,
                daily_budget: None,
            })
            .unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("daily_cap exceeds max")),
            "{err}"
        );
    }

    #[test]
    fn test_update_app_daily_cap_less_than_reward() {
        let mut c = new_contract();
        setup_app(&mut c); // reward_per_action = 500
        testing_env!(context(owner()).build());
        let err = c
            .validate_update_app(&UpdateApp {
                app_id: "game_xyz".into(),
                daily_cap: Some(U128(100)), // less than 500
                reward_per_action: None,
                active: None,
                authorized_callers: None,
                total_budget: None,
                daily_budget: None,
            })
            .unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("daily_cap must be >= reward_per_action")),
            "{err}"
        );
    }

    #[test]
    fn test_update_app_zero_total_budget() {
        let mut c = new_contract();
        setup_app(&mut c);
        testing_env!(context(owner()).build());
        let err = c
            .validate_update_app(&UpdateApp {
                app_id: "game_xyz".into(),
                daily_cap: None,
                reward_per_action: None,
                active: None,
                authorized_callers: None,
                total_budget: Some(U128(0)),
                daily_budget: None,
            })
            .unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("total_budget must be > 0")),
            "{err}"
        );
    }

    #[test]
    fn test_update_app_empty_callers() {
        let mut c = new_contract();
        setup_app(&mut c);
        testing_env!(context(owner()).build());
        let err = c
            .validate_update_app(&UpdateApp {
                app_id: "game_xyz".into(),
                daily_cap: None,
                reward_per_action: None,
                active: None,
                authorized_callers: Some(vec![]),
                total_budget: None,
                daily_budget: None,
            })
            .unwrap_err();
        assert!(
            matches!(err, RewardsError::InvalidInput(ref msg) if msg.contains("authorized_callers cannot be empty")),
            "{err}"
        );
    }

    // ── Owner gate ───────────────────────────────────────────────────

    #[test]
    fn test_register_app_not_owner() {
        let c = new_contract();
        testing_env!(context(user()).build()); // not owner
        let err = c.check_owner().unwrap_err();
        assert!(matches!(err, RewardsError::Unauthorized(_)), "{err}");
    }

    #[test]
    fn test_update_app_not_owner() {
        let mut c = new_contract();
        setup_app(&mut c);
        testing_env!(context(user()).build()); // not owner
        let err = c.check_owner().unwrap_err();
        assert!(matches!(err, RewardsError::Unauthorized(_)), "{err}");
    }
}
