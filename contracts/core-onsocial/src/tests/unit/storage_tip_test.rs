// === STORAGE TIP UNIT TESTS ===
// Tests for the gasless NEAR micro-tipping feature (storage/tip).
// Balance-to-balance transfer within the contract.

#[cfg(test)]
mod storage_tip_tests {
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::{NearToken, testing_env};

    // ========================================================================
    // HELPERS
    // ========================================================================

    /// Deposits `amount_near` for `account` and returns the yocto value deposited.
    fn deposit_near(
        contract: &mut crate::Contract,
        account: &near_sdk::AccountId,
        amount_near: u128,
    ) -> u128 {
        let yocto = NearToken::from_near(amount_near).as_yoctonear();
        testing_env!(get_context_with_deposit(account.clone(), yocto).build());
        contract
            .execute(set_request(json!({
                "storage/deposit": { "amount": yocto.to_string() }
            })))
            .unwrap();
        yocto
    }

    // ========================================================================
    // TEST 1: Happy Path — Tip Transfers Balance
    // ========================================================================

    #[test]
    fn test_tip_transfers_balance() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        let deposit = deposit_near(&mut contract, &alice, 5);

        // Alice tips Bob 1 NEAR from storage balance
        let tip_amount = NearToken::from_near(1).as_yoctonear();
        testing_env!(get_context(alice.clone()).build());
        let result = contract.execute(set_request(json!({
            "storage/tip": {
                "target_id": bob.to_string(),
                "amount": tip_amount.to_string()
            }
        })));
        assert!(result.is_ok(), "Tip should succeed");

        let alice_bal = contract.get_storage_balance(alice).unwrap();
        let bob_bal = contract.get_storage_balance(bob).unwrap();
        assert_eq!(alice_bal.balance.0, deposit - tip_amount);
        assert_eq!(bob_bal.balance.0, tip_amount);
    }

    // ========================================================================
    // TEST 2: Self-Tip Rejected
    // ========================================================================

    #[test]
    fn test_self_tip_rejected() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        deposit_near(&mut contract, &alice, 5);

        testing_env!(get_context(alice.clone()).build());
        let result = contract.execute(set_request(json!({
            "storage/tip": {
                "target_id": alice.to_string(),
                "amount": NearToken::from_near(1).as_yoctonear().to_string()
            }
        })));
        assert!(result.is_err(), "Self-tip should be rejected");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("Cannot tip yourself"),
            "Error should mention self-tip: {err}"
        );
    }

    // ========================================================================
    // TEST 3: Insufficient Balance Rejected
    // ========================================================================

    #[test]
    fn test_tip_insufficient_balance() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        deposit_near(&mut contract, &alice, 1);

        // Try to tip more than available
        testing_env!(get_context(alice.clone()).build());
        let result = contract.execute(set_request(json!({
            "storage/tip": {
                "target_id": bob.to_string(),
                "amount": NearToken::from_near(100).as_yoctonear().to_string()
            }
        })));
        assert!(result.is_err(), "Tip exceeding balance should fail");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("exceeds available balance"),
            "Error should mention insufficient balance: {err}"
        );
    }

    // ========================================================================
    // TEST 4: Zero Amount Rejected
    // ========================================================================

    #[test]
    fn test_tip_zero_amount_rejected() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        deposit_near(&mut contract, &alice, 5);

        testing_env!(get_context(alice.clone()).build());
        let result = contract.execute(set_request(json!({
            "storage/tip": {
                "target_id": bob.to_string(),
                "amount": "0"
            }
        })));
        assert!(result.is_err(), "Zero tip should be rejected");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("greater than zero"),
            "Error should mention zero amount: {err}"
        );
    }

    // ========================================================================
    // TEST 5: Missing Amount Rejected
    // ========================================================================

    #[test]
    fn test_tip_missing_amount_rejected() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        deposit_near(&mut contract, &alice, 5);

        testing_env!(get_context(alice.clone()).build());
        let result = contract.execute(set_request(json!({
            "storage/tip": {
                "target_id": bob.to_string()
            }
        })));
        assert!(result.is_err(), "Missing amount should be rejected");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("amount required"),
            "Error should mention missing amount: {err}"
        );
    }

    // ========================================================================
    // TEST 6: Missing Target Rejected
    // ========================================================================

    #[test]
    fn test_tip_missing_target_rejected() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        deposit_near(&mut contract, &alice, 5);

        testing_env!(get_context(alice.clone()).build());
        let result = contract.execute(set_request(json!({
            "storage/tip": {
                "amount": NearToken::from_near(1).as_yoctonear().to_string()
            }
        })));
        assert!(result.is_err(), "Missing target should be rejected");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("target_id required"),
            "Error should mention missing target: {err}"
        );
    }

    // ========================================================================
    // TEST 7: Recipient Auto-Registration
    // ========================================================================

    #[test]
    fn test_tip_creates_recipient_storage() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        deposit_near(&mut contract, &alice, 5);

        // Bob has no storage entry yet
        assert!(
            contract.get_storage_balance(bob.clone()).is_none(),
            "Bob should not have storage before tip"
        );

        let tip_amount = NearToken::from_near(1).as_yoctonear();
        testing_env!(get_context(alice.clone()).build());
        contract
            .execute(set_request(json!({
                "storage/tip": {
                    "target_id": bob.to_string(),
                    "amount": tip_amount.to_string()
                }
            })))
            .unwrap();

        // Bob now has storage with the tipped balance
        let bob_bal = contract.get_storage_balance(bob).unwrap();
        assert_eq!(
            bob_bal.balance.0, tip_amount,
            "Bob should have tipped balance"
        );
    }

    // ========================================================================
    // TEST 8: Unregistered Sender Rejected
    // ========================================================================

    #[test]
    fn test_tip_unregistered_sender_rejected() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        // Alice has no storage deposit
        testing_env!(get_context(alice.clone()).build());
        let result = contract.execute(set_request(json!({
            "storage/tip": {
                "target_id": bob.to_string(),
                "amount": NearToken::from_near(1).as_yoctonear().to_string()
            }
        })));
        assert!(result.is_err(), "Unregistered sender should be rejected");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("not registered"),
            "Error should mention not registered: {err}"
        );
    }

    // ========================================================================
    // TEST 9: Multiple Sequential Tips
    // ========================================================================

    #[test]
    fn test_multiple_sequential_tips() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        let deposit = deposit_near(&mut contract, &alice, 10);

        let tip1 = NearToken::from_near(2).as_yoctonear();
        let tip2 = NearToken::from_near(3).as_yoctonear();

        // Tip Bob
        testing_env!(get_context(alice.clone()).build());
        contract
            .execute(set_request(json!({
                "storage/tip": {
                    "target_id": bob.to_string(),
                    "amount": tip1.to_string()
                }
            })))
            .unwrap();

        // Tip Charlie
        testing_env!(get_context(alice.clone()).build());
        contract
            .execute(set_request(json!({
                "storage/tip": {
                    "target_id": charlie.to_string(),
                    "amount": tip2.to_string()
                }
            })))
            .unwrap();

        let alice_bal = contract.get_storage_balance(alice).unwrap();
        let bob_bal = contract.get_storage_balance(bob).unwrap();
        let charlie_bal = contract.get_storage_balance(charlie).unwrap();

        assert_eq!(alice_bal.balance.0, deposit - tip1 - tip2);
        assert_eq!(bob_bal.balance.0, tip1);
        assert_eq!(charlie_bal.balance.0, tip2);
    }

    // ========================================================================
    // TEST 10: Tip Exact Available Balance (drain)
    // ========================================================================

    #[test]
    fn test_tip_exact_available_balance() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        let _deposit = deposit_near(&mut contract, &alice, 5);

        // Alice has some used_bytes from the deposit operation itself,
        // so available < deposit. We query the actual available.
        let alice_storage = contract.get_storage_balance(alice.clone()).unwrap();
        // Calculate available like the handler does
        let used_balance = {
            let covered_bytes = alice_storage
                .shared_storage
                .as_ref()
                .map(|s| s.used_bytes)
                .unwrap_or(0)
                .saturating_add(alice_storage.group_pool_used_bytes)
                .saturating_add(alice_storage.platform_pool_used_bytes);
            crate::storage::calculate_storage_balance_needed(
                crate::storage::calculate_effective_bytes(alice_storage.used_bytes, covered_bytes),
            )
        };
        let available = alice_storage
            .balance
            .0
            .saturating_sub(alice_storage.locked_balance.0)
            .saturating_sub(used_balance);

        assert!(available > 0, "Should have available balance");

        // Tip exact available amount
        testing_env!(get_context(alice.clone()).build());
        let result = contract.execute(set_request(json!({
            "storage/tip": {
                "target_id": bob.to_string(),
                "amount": available.to_string()
            }
        })));
        assert!(
            result.is_ok(),
            "Tipping exact available balance should succeed"
        );

        // Alice should have 0 available
        // Bob should have the tipped amount
        let bob_bal = contract.get_storage_balance(bob).unwrap();
        assert_eq!(bob_bal.balance.0, available);
    }
}
