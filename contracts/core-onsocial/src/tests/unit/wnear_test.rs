#[cfg(test)]
mod wnear_tests {
    use crate::Contract;
    use crate::api::wnear::{read_wnear_account, write_wnear_account};
    use crate::tests::test_utils::*;
    use near_sdk::AccountId;
    use near_sdk::json_types::U128;
    use near_sdk::test_utils::accounts;
    use near_sdk::testing_env;

    fn wnear() -> AccountId {
        "wrap.near".parse().unwrap()
    }

    fn user_a() -> AccountId {
        test_account(1)
    }

    fn user_b() -> AccountId {
        test_account(2)
    }

    fn setup_with_wnear() -> Contract {
        let manager = accounts(0);
        let ctx = get_context(manager.clone());
        testing_env!(ctx.build());
        let mut contract = Contract::new();
        contract.platform.status = crate::state::models::ContractStatus::Live;

        let ctx = get_context_with_deposit(manager, 1);
        testing_env!(ctx.build());
        contract.set_wnear_account(Some(wnear())).unwrap();
        contract
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Admin: set_wnear_account
    // ══════════════════════════════════════════════════════════════════════

    #[test]
    fn set_wnear_account_stores_value() {
        let manager = accounts(0);
        let ctx = get_context(manager.clone());
        testing_env!(ctx.build());
        let mut contract = Contract::new();

        assert!(contract.get_wnear_account().is_none());

        let ctx = get_context_with_deposit(manager, 1);
        testing_env!(ctx.build());
        contract.set_wnear_account(Some(wnear())).unwrap();
        assert_eq!(contract.get_wnear_account(), Some(wnear()));
    }

    #[test]
    fn clear_wnear_account() {
        let mut contract = setup_with_wnear();
        assert!(contract.get_wnear_account().is_some());

        let manager = accounts(0);
        let ctx = get_context_with_deposit(manager, 1);
        testing_env!(ctx.build());
        contract.set_wnear_account(None).unwrap();
        assert!(contract.get_wnear_account().is_none());
    }

    #[test]
    fn set_wnear_non_manager_rejected() {
        let manager = accounts(0);
        let ctx = get_context(manager);
        testing_env!(ctx.build());
        let mut contract = Contract::new();

        let ctx = get_context_with_deposit(user_a(), 1);
        testing_env!(ctx.build());
        let result = contract.set_wnear_account(Some(wnear()));
        assert!(result.is_err());
    }

    #[test]
    fn set_wnear_requires_one_yocto() {
        let manager = accounts(0);
        let ctx = get_context(manager.clone());
        testing_env!(ctx.build());
        let mut contract = Contract::new();

        let ctx = get_context(manager);
        testing_env!(ctx.build());
        let result = contract.set_wnear_account(Some(wnear()));
        assert!(result.is_err());
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Raw helpers: read_wnear_account / write_wnear_account
    // ══════════════════════════════════════════════════════════════════════

    #[test]
    fn raw_read_write_roundtrip() {
        let ctx = get_context(accounts(0));
        testing_env!(ctx.build());
        let _ = Contract::new();

        assert!(read_wnear_account().is_none());

        write_wnear_account(Some(&wnear()));
        assert_eq!(read_wnear_account(), Some(wnear()));

        write_wnear_account(None);
        assert!(read_wnear_account().is_none());
    }

    // ══════════════════════════════════════════════════════════════════════
    //  on_wnear_unwrapped callback
    // ══════════════════════════════════════════════════════════════════════
    //
    // In unit tests, promise_results_count() == 0, so the callback always
    // takes the failure path. We test:
    //   1. Failure path returns the full refund amount
    //   2. Balance is NOT credited on failure
    //   3. Success path by simulating credit_storage_balance directly

    #[test]
    fn on_wnear_unwrapped_returns_refund_on_failure() {
        let mut contract = setup_with_wnear();
        let amount = 5_000_000_000_000_000_000_000_000u128;

        let current = near_sdk::env::current_account_id();
        let ctx = get_context(current);
        testing_env!(ctx.build());

        let refund = contract.on_wnear_unwrapped(format!("user:{}", user_a()), U128(amount));
        assert_eq!(refund.0, amount);
    }

    #[test]
    fn on_wnear_unwrapped_does_not_credit_on_failure() {
        let mut contract = setup_with_wnear();
        let amount = 1_000_000_000_000_000_000_000_000u128;

        let current = near_sdk::env::current_account_id();
        let ctx = get_context(current);
        testing_env!(ctx.build());

        contract.on_wnear_unwrapped(format!("user:{}", user_a()), U128(amount));

        let storage = contract.platform.user_storage.get(&user_a());
        assert!(storage.is_none() || storage.unwrap().balance.0 == 0);
    }

    #[test]
    fn on_wnear_unwrapped_platform_pool_returns_refund_on_failure() {
        let mut contract = setup_with_wnear();
        let amount = 2_000_000_000_000_000_000_000_000u128;

        let current = near_sdk::env::current_account_id();
        let ctx = get_context(current);
        testing_env!(ctx.build());

        let refund =
            contract.on_wnear_unwrapped(format!("platform_pool:{}", user_a()), U128(amount));
        assert_eq!(refund.0, amount);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  credit_storage_balance (simulates success path)
    // ══════════════════════════════════════════════════════════════════════

    #[test]
    fn credit_storage_creates_new_entry() {
        let mut contract = setup_with_wnear();
        let amount = 3_000_000_000_000_000_000_000_000u128;

        assert!(contract.platform.user_storage.get(&user_a()).is_none());

        contract.platform.credit_storage_balance(&user_a(), amount);

        let storage = contract.platform.user_storage.get(&user_a()).unwrap();
        assert_eq!(storage.balance.0, amount);
        assert_eq!(storage.used_bytes, 0);
        assert_eq!(storage.locked_balance.0, 0);
    }

    #[test]
    fn credit_storage_adds_to_existing() {
        let mut contract = setup_with_wnear();
        let initial = 2_000_000_000_000_000_000_000_000u128;
        let additional = 3_000_000_000_000_000_000_000_000u128;

        contract.platform.credit_storage_balance(&user_a(), initial);
        contract
            .platform
            .credit_storage_balance(&user_a(), additional);

        let storage = contract.platform.user_storage.get(&user_a()).unwrap();
        assert_eq!(storage.balance.0, initial + additional);
    }

    #[test]
    fn credit_storage_zero_is_noop() {
        let mut contract = setup_with_wnear();

        contract.platform.credit_storage_balance(&user_a(), 0);

        assert!(contract.platform.user_storage.get(&user_a()).is_none());
    }

    #[test]
    fn credit_storage_different_accounts_independent() {
        let mut contract = setup_with_wnear();
        let amount_a = 1_000_000_000_000_000_000_000_000u128;
        let amount_b = 5_000_000_000_000_000_000_000_000u128;

        contract
            .platform
            .credit_storage_balance(&user_a(), amount_a);
        contract
            .platform
            .credit_storage_balance(&user_b(), amount_b);

        assert_eq!(
            contract
                .platform
                .user_storage
                .get(&user_a())
                .unwrap()
                .balance
                .0,
            amount_a
        );
        assert_eq!(
            contract
                .platform
                .user_storage
                .get(&user_b())
                .unwrap()
                .balance
                .0,
            amount_b
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ft_on_transfer validation
    // ══════════════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════════════
    //  platform_pool_deposit_internal (simulates success path)
    // ══════════════════════════════════════════════════════════════════════

    #[test]
    fn platform_pool_deposit_credits_pool() {
        let mut contract = setup_with_wnear();
        let amount = 5_000_000_000_000_000_000_000_000u128;

        let mut batch = crate::events::EventBatch::new();
        contract
            .platform
            .platform_pool_deposit_internal(amount, &user_a(), &mut batch)
            .unwrap();

        let platform_account = crate::state::models::SocialPlatform::platform_pool_account();
        let pool = contract
            .platform
            .shared_storage_pools
            .get(&platform_account)
            .unwrap();
        assert_eq!(pool.storage_balance, amount);
    }

    #[test]
    fn platform_pool_deposit_accumulates() {
        let mut contract = setup_with_wnear();
        let first = 2_000_000_000_000_000_000_000_000u128;
        let second = 3_000_000_000_000_000_000_000_000u128;

        let mut batch = crate::events::EventBatch::new();
        contract
            .platform
            .platform_pool_deposit_internal(first, &user_a(), &mut batch)
            .unwrap();
        contract
            .platform
            .platform_pool_deposit_internal(second, &user_b(), &mut batch)
            .unwrap();

        let platform_account = crate::state::models::SocialPlatform::platform_pool_account();
        let pool = contract
            .platform
            .shared_storage_pools
            .get(&platform_account)
            .unwrap();
        assert_eq!(pool.storage_balance, first + second);
    }
}
