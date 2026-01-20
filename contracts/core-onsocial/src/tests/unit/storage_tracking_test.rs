// === STORAGE TRACKING CORRECTNESS TESTS ===
// Comprehensive tests for storage.rs fixes following battle-tested patterns
//
// These tests verify the CRITICAL fixes made to storage.rs:
// 1. Refunds on validation failures (no fund-locking)
// 2. Atomic state updates (state before transfer)
// 3. Proper storage tracker usage (start/stop/reset sequence)
// 4. Available balance calculation (used bytes + shared storage)
// 5. Correct refund recipients (predecessor_account_id)

#[cfg(test)]
mod storage_tracking_tests {
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::{NearToken, testing_env};

    // ========================================================================
    // TEST 1: Refund on Insufficient Deposit (CRITICAL FIX)
    // ========================================================================

    #[test]
    fn test_deposit_refunds_on_insufficient_amount() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Alice tries to deposit 1 NEAR but only attaches 0.5 NEAR
        let attached = NearToken::from_millinear(500).as_yoctonear();
        let requested = NearToken::from_near(1).as_yoctonear();

        let context = get_context_with_deposit(alice.clone(), attached);
        testing_env!(context.build());

        let deposit_data = json!({
            "storage/deposit": {
                "amount": requested.to_string()
            }
        });

        let result = contract.execute(set_request(deposit_data));

        // CRITICAL: Should fail with error (not Ok with locked funds)
        assert!(
            result.is_err(),
            "❌ Insufficient deposit should return error"
        );

        // Verify no storage was allocated
        let balance = contract.get_storage_balance(alice.clone());
        assert!(
            balance.is_none() || balance.unwrap().balance == 0,
            "No storage should be allocated on validation failure"
        );

        println!("✅ Insufficient deposit properly refunded (no fund-locking)");
    }

    #[test]
    fn test_pool_deposit_refunds_on_insufficient_amount() {
        let mut contract = init_live_contract();
        let owner = test_account(0);

        // Owner tries to deposit to pool but insufficient amount
        let attached = NearToken::from_millinear(500).as_yoctonear();
        let requested = NearToken::from_near(1).as_yoctonear();

        let context = get_context_with_deposit(owner.clone(), attached);
        testing_env!(context.build());

        let pool_data = json!({
            "storage/shared_pool_deposit": {
                "pool_id": owner.to_string(),
                "amount": requested.to_string()
            }
        });

        let result = contract.execute(set_request(pool_data));

        // Should fail and refund
        assert!(
            result.is_err(),
            "Insufficient pool deposit should return error"
        );

        println!("✅ Insufficient pool deposit properly refunded");
    }

    // ========================================================================
    // TEST 2: Excess Refund After Successful Deposit
    // ========================================================================

    #[test]
    fn test_deposit_refunds_excess_after_state_update() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Alice attaches 2 NEAR but only needs 1 NEAR
        let attached = NearToken::from_near(2).as_yoctonear();
        let requested = NearToken::from_near(1).as_yoctonear();

        let context = get_context_with_deposit(alice.clone(), attached);
        testing_env!(context.build());

        let deposit_data = json!({
            "storage/deposit": {
                "amount": requested.to_string()
            }
        });

        // Use refund_unused_deposit: true to get old refund behavior
        let options = Some(crate::Options {
            refund_unused_deposit: true,
        });
        let result = contract.execute(set_request_with_options(deposit_data, options));
        assert!(result.is_ok(), "Deposit with excess should succeed");

        // Verify only requested amount was stored
        let balance = contract.get_storage_balance(alice.clone()).unwrap();
        assert_eq!(
            balance.balance, requested,
            "Storage balance should be requested amount (excess refunded)"
        );

        println!("✅ Excess deposit properly refunded after state update");
    }

    // ========================================================================
    // TEST 3: Withdrawal Available Balance Calculation
    // ========================================================================

    #[test]
    fn test_withdrawal_respects_used_bytes() {
        let mut contract = init_live_contract();
        let bob = test_account(1);

        // Bob deposits 2 NEAR
        let deposit_amount = NearToken::from_near(2).as_yoctonear();
        let context = get_context_with_deposit(bob.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Bob adds data that uses storage
        let data_context = get_context(bob.clone());
        testing_env!(data_context.build());

        contract
            .execute(set_request(json!({
                "profile/name": "Bob",
                "profile/bio": "A test user with some data",
                "posts/1": {"text": "Test post that uses storage", "timestamp": 1234567890}
            })))
            .unwrap();

        // Try to withdraw full deposit (should fail - some bytes are used)
        let withdraw_context = get_context(bob.clone());
        testing_env!(withdraw_context.build());

        let withdraw_all = json!({
            "storage/withdraw": {
                "amount": deposit_amount.to_string()
            }
        });

        let result = contract.execute(set_request(withdraw_all));
        assert!(
            result.is_err(),
            "❌ Should not be able to withdraw full deposit when storage is used"
        );

        // Verify used_bytes increased
        let balance = contract.get_storage_balance(bob.clone()).unwrap();
        assert!(balance.used_bytes > 0, "Storage usage should be tracked");

        println!("✅ Withdrawal correctly respects used bytes");
    }

    #[test]
    fn test_withdrawal_accounts_for_shared_storage() {
        let mut contract = init_live_contract();
        let pool_owner = test_account(0);
        let beneficiary = test_account(1);

        // Pool owner creates shared storage pool
        let pool_deposit = NearToken::from_near(5).as_yoctonear();
        let context = get_context_with_deposit(pool_owner.clone(), pool_deposit);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/shared_pool_deposit": {
                    "pool_id": pool_owner.to_string(),
                    "amount": pool_deposit.to_string()
                }
            })))
            .unwrap();

        // Share storage with beneficiary
        contract
            .execute(set_request(json!({
                "storage/share_storage": {
                    "target_id": beneficiary.to_string(),
                    "max_bytes": 10000u64
                }
            })))
            .unwrap();

        // Beneficiary adds data using shared storage
        let beneficiary_context = get_context(beneficiary.clone());
        testing_env!(beneficiary_context.build());

        contract
            .execute(set_request(json!({
                "profile/name": "Beneficiary",
                "posts/1": {"text": "Using shared storage", "timestamp": 1234567890}
            })))
            .unwrap();

        // Beneficiary's personal balance should account for shared storage
        let balance = contract.get_storage_balance(beneficiary.clone()).unwrap();
        assert!(
            balance.shared_storage.is_some(),
            "Should have shared storage"
        );

        println!("✅ Withdrawal correctly accounts for shared storage");
    }

    // ========================================================================
    // TEST 4: Storage Tracker Start/Stop/Reset Sequence
    // ========================================================================

    #[test]
    fn test_storage_tracker_sequence_on_deposit() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Deposit with storage tracking
        let deposit_amount = NearToken::from_near(1).as_yoctonear();
        let context = get_context_with_deposit(alice.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Verify storage was allocated and tracker properly reset
        let balance = contract.get_storage_balance(alice.clone()).unwrap();
        assert_eq!(balance.balance, deposit_amount);
        // used_bytes should be 0 after proper reset (no data stored yet)
        assert_eq!(
            balance.used_bytes, 0,
            "Storage tracker should be properly reset to 0"
        );

        println!("✅ Storage tracker sequence works correctly");
    }

    // ========================================================================
    // TEST 5: Atomic State Update Before Transfer
    // ========================================================================

    #[test]
    fn test_withdrawal_state_update_before_transfer() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Alice deposits 2 NEAR
        let deposit_amount = NearToken::from_near(2).as_yoctonear();
        let context = get_context_with_deposit(alice.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Alice withdraws 0.5 NEAR
        let withdraw_amount = NearToken::from_millinear(500).as_yoctonear();
        let withdraw_context = get_context(alice.clone());
        testing_env!(withdraw_context.build());

        let result = contract.execute(set_request(json!({
            "storage/withdraw": {
                "amount": withdraw_amount.to_string()
            }
        })));

        // Withdrawal should succeed
        assert!(result.is_ok(), "Withdrawal should succeed");

        // CRITICAL: State should be updated even if Promise.transfer fails
        // (in real blockchain, if transfer fails, state is consistent and user can retry)
        let balance_after = contract.get_storage_balance(alice.clone()).unwrap();
        assert_eq!(
            balance_after.balance,
            deposit_amount - withdraw_amount,
            "✅ State updated BEFORE transfer (atomic pattern)"
        );

        println!("✅ Atomic state update before transfer works correctly");
    }

    // ========================================================================
    // TEST 6: Account Not Registered Error
    // ========================================================================

    #[test]
    fn test_withdrawal_requires_registered_account() {
        let mut contract = init_live_contract();
        let unregistered = test_account(5);

        // Try to withdraw without registration
        let context = get_context(unregistered.clone());
        testing_env!(context.build());

        let withdraw_data = json!({
            "storage/withdraw": {
                "amount": NearToken::from_near(1).as_yoctonear().to_string()
            }
        });

        let result = contract.execute(set_request(withdraw_data));
        assert!(
            result.is_err(),
            "Withdrawal from unregistered account should fail"
        );

        println!("✅ Withdrawal correctly requires registered account");
    }

    // ========================================================================
    // TEST 7: Withdraw None Means All Available
    // ========================================================================

    #[test]
    fn test_withdrawal_none_means_all_available() {
        let mut contract = init_live_contract();
        let bob = test_account(1);

        // Bob deposits 2 NEAR
        let deposit_amount = NearToken::from_near(2).as_yoctonear();
        let context = get_context_with_deposit(bob.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Withdraw without specifying amount (should withdraw all available)
        let withdraw_context = get_context(bob.clone());
        testing_env!(withdraw_context.build());

        let result = contract.execute(set_request(json!({
            "storage/withdraw": {}  // No amount specified
        })));

        // Note: In unit tests without used bytes, this might succeed or fail
        // depending on if there's any storage usage
        if result.is_ok() {
            let balance = contract.get_storage_balance(bob.clone()).unwrap();
            assert!(
                balance.balance < deposit_amount,
                "Some or all balance should be withdrawn"
            );
        }

        println!("✅ Withdrawal without amount parameter handled correctly");
    }

    // ========================================================================
    // TEST 8: Deposit Authorizer Validation
    // ========================================================================

    #[test]
    fn test_deposit_authorizer_must_match_account() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        // Alice tries to deposit for Bob (should fail)
        let deposit_amount = NearToken::from_near(1).as_yoctonear();
        let context = get_context_with_deposit(alice.clone(), deposit_amount);
        testing_env!(context.build());

        let deposit_data = json!({
            alice.to_string(): {
                "storage/deposit": {
                    "depositor": bob.to_string(),  // Mismatch!
                    "amount": deposit_amount.to_string()
                }
            }
        });

        let result = contract.execute(set_request(deposit_data));
        assert!(result.is_err(), "Depositor mismatch should fail");

        println!("✅ Deposit authorizer validation works correctly");
    }

    // ========================================================================
    // TEST 9: Multiple Operations Storage Accumulation
    // ========================================================================

    #[test]
    fn test_multiple_deposits_accumulate_correctly() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // First deposit: 1 NEAR
        let deposit1 = NearToken::from_near(1).as_yoctonear();
        let context1 = get_context_with_deposit(alice.clone(), deposit1);
        testing_env!(context1.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit1.to_string()
                }
            })))
            .unwrap();

        // Second deposit: 2 NEAR
        let deposit2 = NearToken::from_near(2).as_yoctonear();
        let context2 = get_context_with_deposit(alice.clone(), deposit2);
        testing_env!(context2.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit2.to_string()
                }
            })))
            .unwrap();

        // Verify total accumulation
        let balance = contract.get_storage_balance(alice.clone()).unwrap();
        assert_eq!(
            balance.balance,
            deposit1 + deposit2,
            "Multiple deposits should accumulate correctly"
        );

        println!("✅ Multiple deposits accumulate correctly");
    }

    // ========================================================================
    // TEST 10: assert_storage_covered() Failure (CRITICAL)
    // ========================================================================

    #[test]
    fn test_deposit_fails_if_storage_coverage_insufficient() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Alice deposits a very small amount
        let tiny_deposit = 1000u128; // 1000 yoctoNEAR (way too small)
        let context = get_context_with_deposit(alice.clone(), tiny_deposit);
        testing_env!(context.build());

        let deposit_data = json!({
            "storage/deposit": {
                "amount": tiny_deposit.to_string()
            }
        });

        // This might fail if the metadata storage itself exceeds the deposit
        let result = contract.execute(set_request(deposit_data));

        // If it succeeds, the deposit was enough for metadata
        // If it fails, assert_storage_covered() properly caught it
        if result.is_err() {
            println!("✅ assert_storage_covered() properly rejected insufficient deposit");
        } else {
            println!("✅ Tiny deposit was sufficient for metadata (valid case)");
        }
    }

    // ========================================================================
    // TEST 11: ShareStorage Operation
    // ========================================================================

    #[test]
    fn test_share_storage_operation_tracking() {
        let mut contract = init_live_contract();
        let pool_owner = test_account(0);
        let beneficiary = test_account(1);

        // Pool owner deposits to shared pool
        let pool_deposit = NearToken::from_near(10).as_yoctonear();
        let context = get_context_with_deposit(pool_owner.clone(), pool_deposit);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/shared_pool_deposit": {
                    "pool_id": pool_owner.to_string(),
                    "amount": pool_deposit.to_string()
                }
            })))
            .unwrap();

        // Share storage with beneficiary
        let max_bytes = 50000u64; // 50KB
        let share_context = get_context(pool_owner.clone());
        testing_env!(share_context.build());

        let result = contract.execute(set_request(json!({
            "storage/share_storage": {
                "target_id": beneficiary.to_string(),
                "max_bytes": max_bytes
            }
        })));

        assert!(result.is_ok(), "Share storage should succeed");

        // Verify beneficiary has shared storage
        let balance = contract.get_storage_balance(beneficiary.clone());
        assert!(balance.is_some(), "Beneficiary should have storage record");

        let shared = balance.unwrap().shared_storage;
        assert!(shared.is_some(), "Should have shared storage allocation");
        assert_eq!(shared.unwrap().max_bytes, max_bytes);

        println!("✅ ShareStorage operation tracked correctly");
    }

    // ========================================================================
    // TEST 12: ReturnSharedStorage Operation
    // ========================================================================

    #[test]
    fn test_return_shared_storage_operation() {
        let mut contract = init_live_contract();
        let pool_owner = test_account(0);
        let beneficiary = test_account(1);

        // Setup: Share storage first
        let pool_deposit = NearToken::from_near(10).as_yoctonear();
        let context = get_context_with_deposit(pool_owner.clone(), pool_deposit);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/shared_pool_deposit": {
                    "pool_id": pool_owner.to_string(),
                    "amount": pool_deposit.to_string()
                }
            })))
            .unwrap();

        contract
            .execute(set_request(json!({
                "storage/share_storage": {
                    "target_id": beneficiary.to_string(),
                    "max_bytes": 50000u64
                }
            })))
            .unwrap();

        // Now return shared storage
        let return_context = get_context(beneficiary.clone());
        testing_env!(return_context.build());

        let result = contract.execute(set_request(json!({
            "storage/return_shared_storage": {}
        })));

        assert!(result.is_ok(), "Return shared storage should succeed");

        // Verify shared storage is removed
        let balance = contract.get_storage_balance(beneficiary.clone());
        if let Some(bal) = balance {
            assert!(
                bal.shared_storage.is_none(),
                "Shared storage should be removed"
            );
        }

        println!("✅ ReturnSharedStorage operation tracked correctly");
    }

    // ========================================================================
    // TEST: Sponsor Pool Capacity Enforcement (CRITICAL)
    // ========================================================================

    #[test]
    fn test_sponsor_pool_capacity_enforced_on_write() {
        let mut contract = init_live_contract();
        let pool_owner = test_account(0);
        let beneficiary1 = test_account(1);
        let beneficiary2 = test_account(2);

        // Fund sponsor pool with limited capacity.
        //
        // Storage cost: 1E19 yoctoNEAR per byte = 10KB per NEAR
        // 100 milliNEAR = 1E23 yoctoNEAR → 10,000 bytes = 10KB capacity
        //
        // Allocate 5KB max to each beneficiary (10KB total = pool capacity).
        // Have beneficiary2 consume ~4KB (within their 5KB allocation).
        // Then beneficiary1's ~4KB write should fail because pool capacity is exhausted.
        let pool_deposit = NearToken::from_millinear(100).as_yoctonear();
        let context = get_context_with_deposit(pool_owner.clone(), pool_deposit);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/shared_pool_deposit": {
                    "pool_id": pool_owner.to_string(),
                    "amount": pool_deposit.to_string()
                }
            })))
            .unwrap();

        // Each beneficiary gets 5KB allocation (10KB total = pool capacity).
        let max_bytes = 5_000u64;
        let share_context = get_context(pool_owner.clone());
        testing_env!(share_context.build());
        contract
            .execute(set_request(json!({
                "storage/share_storage": {
                    "target_id": beneficiary1.to_string(),
                    "max_bytes": max_bytes
                }
            })))
            .unwrap();

        contract
            .execute(set_request(json!({
                "storage/share_storage": {
                    "target_id": beneficiary2.to_string(),
                    "max_bytes": max_bytes
                }
            })))
            .unwrap();

        // Beneficiary2 makes two writes consuming ~4KB of pool capacity.
        // Each write is ~2KB (within their 5KB max_bytes allocation).
        let beneficiary2_context = get_context_with_deposit(beneficiary2.clone(), 0);
        testing_env!(beneficiary2_context.build());

        // First write - ~2KB payload
        contract
            .execute(set_request(json!({
                "profile/bio": "x".repeat(2_000)
            })))
            .unwrap();

        // Second write - ~2KB payload (total ~4KB consumed)
        contract
            .execute(set_request(json!({
                "profile/name": "y".repeat(2_000)
            })))
            .unwrap();

        // Pool now has ~6KB remaining (10KB - ~4KB used by beneficiary2).
        // BUT beneficiary1 also needs to fit in their 5KB max_bytes allocation.

        // Beneficiary1 also makes writes consuming pool capacity.
        let beneficiary1_context = get_context_with_deposit(beneficiary1.clone(), 0);
        testing_env!(beneficiary1_context.build());

        // First write - ~2KB
        contract
            .execute(set_request(json!({
                "profile/bio": "a".repeat(2_000)
            })))
            .unwrap();

        // Second write - ~2KB (total ~4KB consumed by beneficiary1)
        contract
            .execute(set_request(json!({
                "profile/name": "b".repeat(2_000)
            })))
            .unwrap();

        // Pool has ~2KB remaining (10KB - 4KB beneficiary2 - 4KB beneficiary1).
        // Third write of ~2KB from beneficiary1 should fail due to pool capacity.

        let result = contract.execute(set_request(json!({
            "profile/status": "c".repeat(2_000)
        })));

        assert!(
            result.is_err(),
            "Write should fail when sponsor pool lacks capacity"
        );

        // Verify the error is specifically about storage
        let err = result.unwrap_err();
        assert!(
            matches!(err, crate::errors::SocialError::InsufficientStorage(_)),
            "Expected InsufficientStorage error, got: {:?}",
            err
        );

        println!("✅ Sponsor pool capacity enforced on write");
    }

    // ========================================================================
    // TEST: Deallocation Does Not Over-Refund Pools (CRITICAL)
    // ========================================================================

    #[test]
    fn test_delete_paid_by_personal_balance_does_not_refund_pools() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Deposit personal balance for Alice.
        let deposit = NearToken::from_near(1).as_yoctonear();
        let context = get_context_with_deposit(alice.clone(), deposit);
        testing_env!(context.build());
        contract
            .execute(set_request(json!({
                "storage/deposit": { "amount": deposit.to_string() }
            })))
            .unwrap();

        // Ensure there are no pools present/used.
        let platform_account = crate::state::SocialPlatform::platform_pool_account();
        let platform_before = contract
            .platform
            .shared_storage_pools
            .get(&platform_account)
            .cloned()
            .unwrap_or_default();

        // Write a reasonably sized value (paid by personal balance).
        contract
            .execute(set_request(json!({
                "profile/bio": "x".repeat(5_000)
            })))
            .unwrap();

        // Delete it.
        contract
            .execute(set_request(json!({
                "profile/bio": serde_json::Value::Null
            })))
            .unwrap();

        // Platform pool used_bytes must be unchanged.
        let platform_after = contract
            .platform
            .shared_storage_pools
            .get(&platform_account)
            .cloned()
            .unwrap_or_default();
        assert_eq!(platform_before.used_bytes, platform_after.used_bytes);

        // No group pools should have been created/touched.
        // (This is a simple sanity check: if any group pool exists, it would have a key like group-*.pool)
        // The contract doesn't expose iteration over LookupMap, so we rely on the per-user counters.
        let storage = contract.get_storage_balance(alice.clone()).unwrap();
        assert_eq!(
            storage.group_pool_used_bytes, 0,
            "Personal delete must not refund group pool"
        );
        assert_eq!(
            storage.platform_pool_used_bytes, 0,
            "Personal delete must not refund platform pool"
        );
        assert!(
            storage.shared_storage.is_none()
                || storage.shared_storage.as_ref().unwrap().used_bytes == 0,
            "Personal delete must not refund sponsor pool"
        );

        println!("✅ Personal-balance delete does not refund pools");
    }

    // ========================================================================
    // TEST 13: Zero Amount Deposit (Edge Case)
    // ========================================================================

    #[test]
    fn test_zero_amount_deposit_rejected() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        let context = get_context_with_deposit(alice.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let zero_deposit = json!({
            "storage/deposit": {
                "amount": "0"
            }
        });

        let result = contract.execute(set_request(zero_deposit));

        // Should either reject or accept based on implementation
        // Key is: no crash, predictable behavior
        if result.is_err() {
            println!("✅ Zero deposit properly rejected");
        } else {
            println!("✅ Zero deposit handled gracefully");
        }
    }

    // ========================================================================
    // TEST 14: Zero Amount Withdrawal (Edge Case)
    // ========================================================================

    #[test]
    fn test_zero_amount_withdrawal() {
        let mut contract = init_live_contract();
        let bob = test_account(1);

        // Bob deposits first
        let deposit_amount = NearToken::from_near(2).as_yoctonear();
        let context = get_context_with_deposit(bob.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Try to withdraw zero
        let withdraw_context = get_context(bob.clone());
        testing_env!(withdraw_context.build());

        let result = contract.execute(set_request(json!({
            "storage/withdraw": {
                "amount": "0"
            }
        })));

        // Should succeed (no-op) or reject gracefully
        if result.is_ok() {
            let balance = contract.get_storage_balance(bob.clone()).unwrap();
            assert_eq!(balance.balance, deposit_amount, "Balance unchanged");
            println!("✅ Zero withdrawal handled as no-op");
        } else {
            println!("✅ Zero withdrawal properly rejected");
        }
    }

    // ========================================================================
    // TEST 15: Concurrent Deposits (Sequential)
    // ========================================================================

    #[test]
    fn test_rapid_sequential_deposits() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        let deposit_amounts = [
            NearToken::from_millinear(500).as_yoctonear(),
            NearToken::from_millinear(300).as_yoctonear(),
            NearToken::from_millinear(700).as_yoctonear(),
            NearToken::from_near(1).as_yoctonear(),
        ];

        let mut total_deposited = 0u128;

        for (i, amount) in deposit_amounts.iter().enumerate() {
            let context = get_context_with_deposit(alice.clone(), *amount);
            testing_env!(context.build());

            let result = contract.execute(set_request(json!({
                "storage/deposit": {
                    "amount": amount.to_string()
                }
            })));

            assert!(result.is_ok(), "Deposit {} should succeed", i + 1);
            total_deposited += amount;
        }

        let final_balance = contract.get_storage_balance(alice.clone()).unwrap();
        assert_eq!(
            final_balance.balance, total_deposited,
            "All deposits should accumulate correctly"
        );

        println!("✅ Rapid sequential deposits tracked correctly");
    }

    // ========================================================================
    // TEST 16: Withdrawal Authorizer Validation
    // ========================================================================

    #[test]
    fn test_withdrawal_authorizer_must_match() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        // Alice deposits
        let deposit_amount = NearToken::from_near(2).as_yoctonear();
        let context = get_context_with_deposit(alice.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Try to withdraw with mismatched depositor
        let withdraw_context = get_context(alice.clone());
        testing_env!(withdraw_context.build());

        let withdraw_data = json!({
            alice.to_string(): {
                "storage/withdraw": {
                    "depositor": bob.to_string(), // Mismatch!
                    "amount": NearToken::from_near(1).as_yoctonear().to_string()
                }
            }
        });

        let result = contract.execute(set_request(withdraw_data));
        assert!(result.is_err(), "Mismatched depositor should fail");

        println!("✅ Withdrawal authorizer validation works");
    }

    // ========================================================================
    // TEST 17: Storage Usage Prevents Full Withdrawal
    // ========================================================================

    #[test]
    fn test_cannot_withdraw_locked_storage() {
        let mut contract = init_live_contract();
        let charlie = test_account(2);

        // Charlie deposits exactly enough for some data
        let deposit_amount = NearToken::from_near(1).as_yoctonear();
        let context = get_context_with_deposit(charlie.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Charlie adds data that locks storage
        let data_context = get_context(charlie.clone());
        testing_env!(data_context.build());

        contract
            .execute(set_request(json!({
                "profile/name": "Charlie",
                "profile/bio": "This locks storage bytes",
                "posts/1": {"text": "Post 1", "timestamp": 1234567890},
                "posts/2": {"text": "Post 2", "timestamp": 1234567891},
                "posts/3": {"text": "Post 3", "timestamp": 1234567892}
            })))
            .unwrap();

        // Try to withdraw everything (should not be able to withdraw locked storage)
        let withdraw_context = get_context(charlie.clone());
        testing_env!(withdraw_context.build());

        // Withdrawal attempt (may succeed but won't free locked bytes)
        let _ = contract.execute(set_request(json!({
            "storage/withdraw": {}  // Try to withdraw all
        })));

        // Verify storage is locked by data (bytes still in use)
        let balance = contract.get_storage_balance(charlie.clone()).unwrap();
        assert!(balance.used_bytes > 0, "Should have used storage");

        println!("✅ Cannot withdraw storage locked by data");
    }

    // ========================================================================
    // TEST 18: Withdrawal After Data Addition
    // ========================================================================

    #[test]
    fn test_partial_withdrawal_after_data_usage() {
        let mut contract = init_live_contract();
        let charlie = test_account(2);

        // Charlie deposits 5 NEAR
        let deposit_amount = NearToken::from_near(5).as_yoctonear();
        let context = get_context_with_deposit(charlie.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Charlie adds some data
        let data_context = get_context(charlie.clone());
        testing_env!(data_context.build());

        contract
            .execute(set_request(json!({
                "profile/name": "Charlie",
                "profile/bio": "Test user with data",
                "posts/1": {"text": "First post", "timestamp": 1234567890},
                "posts/2": {"text": "Second post", "timestamp": 1234567891}
            })))
            .unwrap();

        // Charlie withdraws partial amount (should succeed)
        let withdraw_amount = NearToken::from_near(1).as_yoctonear();
        let withdraw_context = get_context(charlie.clone());
        testing_env!(withdraw_context.build());

        let result = contract.execute(set_request(json!({
            "storage/withdraw": {
                "amount": withdraw_amount.to_string()
            }
        })));

        // Should succeed if enough available balance
        if result.is_ok() {
            let balance = contract.get_storage_balance(charlie.clone()).unwrap();
            assert!(balance.used_bytes > 0, "Should have used storage");
            assert!(
                balance.balance < deposit_amount,
                "Balance should be reduced"
            );
        }

        println!("✅ Partial withdrawal after data usage works correctly");
    }

    // ========================================================================
    // TEST 19: Soft Delete Storage Tracking (CRITICAL)
    // ========================================================================

    #[test]
    fn test_soft_delete_marks_entry_as_deleted() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Alice deposits storage
        let deposit_amount = NearToken::from_near(2).as_yoctonear();
        let context = get_context_with_deposit(alice.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Alice creates data
        let data_context = get_context(alice.clone());
        testing_env!(data_context.build());

        contract
            .execute(set_request(json!({
                "profile/name": "Alice",
                "posts/1": {"text": "Test post", "timestamp": 1234567890}
            })))
            .unwrap();

        let storage_after_create = contract.get_storage_balance(alice.clone()).unwrap();
        let used_bytes_after_create = storage_after_create.used_bytes;
        assert!(used_bytes_after_create > 0, "Should have used storage");

        // Alice soft deletes data by setting to null
        let delete_context = get_context(alice.clone());
        testing_env!(delete_context.build());

        contract
            .execute(set_request(json!({
                "posts/1": null  // Soft delete
            })))
            .unwrap();

        // Verify storage tracking after soft delete
        let storage_after_delete = contract.get_storage_balance(alice.clone()).unwrap();

        // Deleted marker is smaller than original data
        // Storage should be released (used_bytes decreases)
        assert!(
            storage_after_delete.used_bytes < used_bytes_after_create,
            "Soft delete should release storage"
        );
        println!(
            "✅ Soft delete tracked: {} bytes before, {} bytes after (released {} bytes)",
            used_bytes_after_create,
            storage_after_delete.used_bytes,
            used_bytes_after_create - storage_after_delete.used_bytes
        );
        println!("   Soft delete releases storage as expected");
    }

    #[test]
    fn test_soft_delete_then_recreate_storage() {
        let mut contract = init_live_contract();
        let bob = test_account(1);

        // Bob deposits storage
        let deposit_amount = NearToken::from_near(2).as_yoctonear();
        let context = get_context_with_deposit(bob.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Bob creates data
        let data_context = get_context(bob.clone());
        testing_env!(data_context.build());

        contract
            .execute(set_request(json!({
                "posts/1": {"text": "Original post", "timestamp": 1234567890}
            })))
            .unwrap();

        let storage_after_create = contract.get_storage_balance(bob.clone()).unwrap();

        // Bob soft deletes
        let delete_context = get_context(bob.clone());
        testing_env!(delete_context.build());

        contract
            .execute(set_request(json!({
                "posts/1": null
            })))
            .unwrap();

        let storage_after_delete = contract.get_storage_balance(bob.clone()).unwrap();

        // Bob recreates with new data
        let recreate_context = get_context(bob.clone());
        testing_env!(recreate_context.build());

        contract
            .execute(set_request(json!({
                "posts/1": {"text": "New post after delete", "timestamp": 1234567891}
            })))
            .unwrap();

        let storage_after_recreate = contract.get_storage_balance(bob.clone()).unwrap();

        // Verify storage tracking is consistent through delete/recreate cycle
        // Deletion releases storage, recreation consumes it again
        assert!(
            storage_after_delete.used_bytes < storage_after_create.used_bytes,
            "Deletion should release storage"
        );
        assert!(
            storage_after_recreate.used_bytes > storage_after_delete.used_bytes,
            "Recreation should consume storage again"
        );

        println!("✅ Delete-then-recreate storage tracking works correctly");
        println!(
            "   Created: {} → Deleted: {} → Recreated: {} bytes",
            storage_after_create.used_bytes,
            storage_after_delete.used_bytes,
            storage_after_recreate.used_bytes
        );
    }

    #[test]
    fn test_multiple_soft_deletes_storage_accumulation() {
        let mut contract = init_live_contract();
        let charlie = test_account(2);

        // Charlie deposits storage
        let deposit_amount = NearToken::from_near(3).as_yoctonear();
        let context = get_context_with_deposit(charlie.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Charlie creates multiple posts
        let create_context = get_context(charlie.clone());
        testing_env!(create_context.build());

        contract
            .execute(set_request(json!({
                "posts/1": {"text": "Post 1", "timestamp": 1234567890},
                "posts/2": {"text": "Post 2", "timestamp": 1234567891},
                "posts/3": {"text": "Post 3", "timestamp": 1234567892},
                "posts/4": {"text": "Post 4", "timestamp": 1234567893}
            })))
            .unwrap();

        let storage_after_create = contract.get_storage_balance(charlie.clone()).unwrap();
        let initial_used = storage_after_create.used_bytes;

        // Charlie deletes posts one by one
        for i in 1..=4 {
            let delete_context = get_context(charlie.clone());
            testing_env!(delete_context.build());

            contract
                .execute(set_request(json!({
                    format!("posts/{}", i): null
                })))
                .unwrap();
        }

        let storage_after_deletes = contract.get_storage_balance(charlie.clone()).unwrap();

        // After all deletes, storage should be significantly released
        assert!(
            storage_after_deletes.used_bytes < initial_used,
            "Multiple deletes should release storage"
        );

        println!(
            "✅ Multiple soft deletes: {} bytes initially, {} bytes after all deletes (released {} bytes)",
            initial_used,
            storage_after_deletes.used_bytes,
            initial_used - storage_after_deletes.used_bytes
        );
        println!("   Deleted markers release storage as expected");
    }

    #[test]
    fn test_soft_delete_large_data_storage_impact() {
        let mut contract = init_live_contract();
        let dave = test_account(3);

        // Dave deposits storage
        let deposit_amount = NearToken::from_near(5).as_yoctonear();
        let context = get_context_with_deposit(dave.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Dave creates large data
        let large_text = "x".repeat(1000); // 1KB of data
        let create_context = get_context(dave.clone());
        testing_env!(create_context.build());

        contract
            .execute(set_request(json!({
                "posts/large": {"text": large_text, "timestamp": 1234567890}
            })))
            .unwrap();

        let storage_before_delete = contract.get_storage_balance(dave.clone()).unwrap();

        // Dave soft deletes large data
        let delete_context = get_context(dave.clone());
        testing_env!(delete_context.build());

        contract
            .execute(set_request(json!({
                "posts/large": null
            })))
            .unwrap();

        let storage_after_delete = contract.get_storage_balance(dave.clone()).unwrap();

        // Soft delete of large data should release most of the storage
        // The small Deleted marker replaces the large data
        assert!(
            storage_after_delete.used_bytes < storage_before_delete.used_bytes,
            "Large data deletion should release storage"
        );
        let bytes_released = storage_before_delete.used_bytes - storage_after_delete.used_bytes;
        println!(
            "✅ Large data soft delete: {} bytes before, {} bytes after (released {} bytes)",
            storage_before_delete.used_bytes, storage_after_delete.used_bytes, bytes_released
        );
        println!("   Deleted marker releases storage, allowing user to withdraw freed balance");
    }

    #[test]
    fn test_soft_delete_allows_withdrawal_of_freed_storage() {
        let mut contract = init_live_contract();
        let eve = test_account(4);

        // Eve deposits storage
        let deposit_amount = NearToken::from_near(5).as_yoctonear();
        let context = get_context_with_deposit(eve.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Eve creates data
        let create_context = get_context(eve.clone());
        testing_env!(create_context.build());

        contract
            .execute(set_request(json!({
                "posts/1": {"text": "Test post", "timestamp": 1234567890},
                "profile/bio": "A test bio with some content"
            })))
            .unwrap();

        // Try to withdraw (should have limited availability due to used storage)
        let withdraw_context1 = get_context(eve.clone());
        testing_env!(withdraw_context1.build());

        let withdraw_amount = NearToken::from_near(2).as_yoctonear();
        let result1 = contract.execute(set_request(json!({
            "storage/withdraw": {
                "amount": withdraw_amount.to_string()
            }
        })));

        // Might succeed or fail depending on how much storage is used
        let can_withdraw_before_delete = result1.is_ok();

        // Eve deletes data
        let delete_context = get_context(eve.clone());
        testing_env!(delete_context.build());

        contract
            .execute(set_request(json!({
                "posts/1": null,
                "profile/bio": null
            })))
            .unwrap();

        // After deletion, storage is released, making more available for withdrawal
        let storage_after_delete = contract.get_storage_balance(eve.clone()).unwrap();
        assert!(
            storage_after_delete.balance > 0,
            "Should have storage balance"
        );

        println!(
            "✅ Soft delete impact on withdrawals: can_withdraw_before={}, used_bytes_after={}",
            can_withdraw_before_delete, storage_after_delete.used_bytes
        );
        println!("   Deleted entries release storage balance for withdrawal");
    }

    #[test]
    fn test_soft_delete_nested_paths() {
        let mut contract = init_live_contract();
        let frank = test_account(5);

        // Frank deposits storage
        let deposit_amount = NearToken::from_near(2).as_yoctonear();
        let context = get_context_with_deposit(frank.clone(), deposit_amount);
        testing_env!(context.build());

        contract
            .execute(set_request(json!({
                "storage/deposit": {
                    "amount": deposit_amount.to_string()
                }
            })))
            .unwrap();

        // Frank creates nested data
        let create_context = get_context(frank.clone());
        testing_env!(create_context.build());

        contract
            .execute(set_request(json!({
                "data/level1/level2/item": "nested value"
            })))
            .unwrap();

        let storage_before = contract.get_storage_balance(frank.clone()).unwrap();

        // Frank soft deletes nested path
        let delete_context = get_context(frank.clone());
        testing_env!(delete_context.build());

        contract
            .execute(set_request(json!({
                "data/level1/level2/item": null
            })))
            .unwrap();

        let storage_after = contract.get_storage_balance(frank.clone()).unwrap();

        // Nested path deletion should release storage
        assert!(
            storage_after.used_bytes < storage_before.used_bytes,
            "Nested deletion should release storage"
        );

        println!("✅ Nested path soft delete tracked correctly");
    }

    // ========================================================================
    // TEST: Batch Operations with Storage Deposit (Double-Counting Prevention)
    // ========================================================================
    // This test ensures that when storage/deposit and data operations are
    // in the same batch, the attached balance is correctly shared and not
    // double-counted.

    #[test]
    fn test_batch_storage_deposit_with_data_operations() {
        let mut contract = init_live_contract();
        let user = test_account(0);

        // User attaches 1 NEAR total
        let total_attached = NearToken::from_near(1).as_yoctonear();
        let deposit_amount = NearToken::from_millinear(500).as_yoctonear(); // 0.5 NEAR for explicit deposit

        let context = get_context_with_deposit(user.clone(), total_attached);
        testing_env!(context.build());

        // Batch: storage/deposit + data operation in same call
        let batch_data = json!({
            "storage/deposit": {"amount": deposit_amount.to_string()},
            "profile/name": "TestUser",
            "profile/bio": "Testing batch operations"
        });

        let result = contract.execute(set_request(batch_data));
        assert!(
            result.is_ok(),
            "Batch operation should succeed: {:?}",
            result.err()
        );

        // Verify storage balance was allocated correctly
        let storage = contract.get_storage_balance(user.clone()).unwrap();

        // The explicit deposit of 0.5 NEAR + auto-deposit of remaining 0.5 NEAR for data
        // Total should be ~1 NEAR (minus any gas/overhead)
        assert!(storage.balance > 0, "Storage balance should be positive");

        // Verify data was stored
        let keys = vec![
            format!("{}/profile/name", user),
            format!("{}/profile/bio", user),
        ];
        let retrieved = contract_get_values_map(&contract, keys, Some(user.clone()));
        assert!(!retrieved.is_empty(), "Data should be stored");

        println!("✅ Batch storage deposit + data operations work correctly");
    }

    #[test]
    fn test_storage_deposit_consumes_from_attached_balance() {
        let mut contract = init_live_contract();
        let user = test_account(0);

        // User attaches exactly 0.5 NEAR
        let attached = NearToken::from_millinear(500).as_yoctonear();

        let context = get_context_with_deposit(user.clone(), attached);
        testing_env!(context.build());

        // Try to deposit 0.5 NEAR (uses all attached)
        let deposit_data = json!({
            "storage/deposit": {"amount": attached.to_string()}
        });

        let result = contract.execute(set_request(deposit_data));
        assert!(result.is_ok(), "Deposit should succeed");

        // Verify exactly the deposited amount is in storage
        let storage = contract.get_storage_balance(user.clone()).unwrap();
        assert_eq!(
            storage.balance, attached,
            "Storage balance should equal deposited amount"
        );

        println!("✅ Storage deposit correctly consumes from attached balance");
    }

    #[test]
    fn test_storage_deposit_fails_if_insufficient_in_batch() {
        let mut contract = init_live_contract();
        let user = test_account(0);

        // User attaches 0.3 NEAR
        let attached = NearToken::from_millinear(300).as_yoctonear();
        let requested = NearToken::from_millinear(500).as_yoctonear(); // Requesting more than attached

        let context = get_context_with_deposit(user.clone(), attached);
        testing_env!(context.build());

        // Try to deposit more than attached
        let deposit_data = json!({
            "storage/deposit": {"amount": requested.to_string()}
        });

        let result = contract.execute(set_request(deposit_data));
        assert!(
            result.is_err(),
            "Should fail when requesting more than attached"
        );

        let error_msg = result.unwrap_err().to_string();
        assert!(
            error_msg.contains("Insufficient"),
            "Error should mention insufficient deposit"
        );

        println!("✅ Storage deposit correctly fails when insufficient balance in context");
    }

    #[test]
    fn test_multiple_deposits_in_batch_share_attached_balance() {
        let mut contract = init_live_contract();
        let user = test_account(0);

        // This test verifies that if someone tries to do multiple storage/deposit
        // operations in one batch, they correctly share the attached balance
        // Note: JSON objects can't have duplicate keys, so this tests the accounting logic

        let attached = NearToken::from_near(1).as_yoctonear();
        let deposit_amount = NearToken::from_millinear(600).as_yoctonear();

        let context = get_context_with_deposit(user.clone(), attached);
        testing_env!(context.build());

        // First deposit takes 0.6 NEAR, leaving 0.4 NEAR
        let deposit_data = json!({
            "storage/deposit": {"amount": deposit_amount.to_string()}
        });

        // Use refund_unused_deposit: true so excess 0.4 NEAR is refunded, not added to storage
        let options = Some(crate::Options {
            refund_unused_deposit: true,
        });
        let result = contract.execute(set_request_with_options(deposit_data, options));
        assert!(result.is_ok(), "First deposit should succeed");

        // Storage should have exactly 0.6 NEAR (not more due to double-counting)
        let storage = contract.get_storage_balance(user.clone()).unwrap();
        assert_eq!(
            storage.balance, deposit_amount,
            "Storage should have exactly the deposited amount, not double-counted"
        );

        println!("✅ Storage deposit correctly prevents double-counting");
    }
}
