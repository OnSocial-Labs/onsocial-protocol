//! Minimal NEP-141 Mock FT for Integration Testing
//!
//! Implements only the methods needed to test staking contract:
//! - ft_transfer_call (lock/credits flow)
//! - ft_transfer (unlock/claim refunds)
//! - ft_balance_of (view balance)
//! - storage_deposit (required for receivers)

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockFT {
    balances: LookupMap<AccountId, u128>,
    total_supply: u128,
    decimals: u8,
    /// Test helper: if set, the next ft_transfer will fail
    fail_next_transfer: bool,
}

#[near(serializers = [json])]
pub struct FtMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
}

#[near]
impl MockFT {
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128, decimals: u8) -> Self {
        let mut balances = LookupMap::new(b"b");
        balances.insert(owner_id, total_supply.0);
        Self {
            balances,
            total_supply: total_supply.0,
            decimals,
            fail_next_transfer: false,
        }
    }

    // =========================================================================
    // NEP-141 Core
    // =========================================================================

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        assert_eq!(
            env::attached_deposit(),
            NearToken::from_yoctonear(1),
            "Requires 1 yoctoNEAR"
        );

        // Test helper: fail if flag is set
        if self.fail_next_transfer {
            self.fail_next_transfer = false;
            env::panic_str("MockFT: Simulated transfer failure");
        }

        let sender_id = env::predecessor_account_id();
        self.internal_transfer(&sender_id, &receiver_id, amount.0, memo);
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        assert_eq!(
            env::attached_deposit(),
            NearToken::from_yoctonear(1),
            "Requires 1 yoctoNEAR"
        );
        let sender_id = env::predecessor_account_id();
        self.internal_transfer(&sender_id, &receiver_id, amount.0, memo);

        // Call ft_on_transfer on receiver
        Promise::new(receiver_id.clone())
            .function_call(
                "ft_on_transfer".to_string(),
                near_sdk::serde_json::json!({
                    "sender_id": sender_id,
                    "amount": amount,
                    "msg": msg
                })
                .to_string()
                .into_bytes(),
                NearToken::from_near(0),
                Gas::from_tgas(80),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .ft_resolve_transfer(sender_id, receiver_id, amount),
            )
            .into()
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_metadata(&self) -> FtMetadata {
        FtMetadata {
            spec: "ft-1.0.0".to_string(),
            name: "Mock SOCIAL".to_string(),
            symbol: "SOCIAL".to_string(),
            decimals: self.decimals,
        }
    }

    // =========================================================================
    // Storage Management (simplified)
    // =========================================================================

    #[payable]
    pub fn storage_deposit(&mut self, _account_id: Option<AccountId>) -> StorageBalance {
        // Just acknowledge - no actual storage tracking for mock
        StorageBalance {
            total: U128(env::attached_deposit().as_yoctonear()),
            available: U128(0),
        }
    }

    pub fn storage_balance_of(&self, _account_id: AccountId) -> Option<StorageBalance> {
        // Always return some balance for mock
        Some(StorageBalance {
            total: U128(1250000000000000000000), // ~0.00125 NEAR
            available: U128(0),
        })
    }

    // =========================================================================
    // Test Helpers (not in real FT)
    // =========================================================================

    /// Mint tokens to account (for testing only)
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        let current = self.balances.get(&account_id).copied().unwrap_or(0);
        self.balances.insert(account_id, current + amount.0);
        self.total_supply += amount.0;
    }

    /// Set flag to fail the next ft_transfer call (for testing callbacks)
    pub fn set_fail_next_transfer(&mut self, should_fail: bool) {
        self.fail_next_transfer = should_fail;
    }

    /// Check if fail flag is set (for debugging)
    pub fn get_fail_next_transfer(&self) -> bool {
        self.fail_next_transfer
    }

    /// Mock wNEAR `near_withdraw` — accepts 1 yoctoNEAR, does nothing.
    /// Allows scarces-onsocial's `ft_on_transfer` → `near_withdraw` → `on_wnear_unwrapped`
    /// callback chain to succeed in sandbox tests.
    #[payable]
    pub fn near_withdraw(&mut self, amount: U128) {
        // Real wNEAR burns tokens and sends native NEAR.
        // Mock just succeeds so the callback registers as successful.
        let _ = amount;
    }

    // =========================================================================
    // Internal
    // =========================================================================

    fn internal_transfer(
        &mut self,
        sender_id: &AccountId,
        receiver_id: &AccountId,
        amount: u128,
        _memo: Option<String>,
    ) {
        let sender_balance = self.balances.get(sender_id).copied().unwrap_or(0);
        assert!(sender_balance >= amount, "Insufficient balance");

        self.balances
            .insert(sender_id.clone(), sender_balance - amount);
        let receiver_balance = self.balances.get(receiver_id).copied().unwrap_or(0);
        self.balances
            .insert(receiver_id.clone(), receiver_balance + amount);
    }

    #[private]
    pub fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        // Check promise result
        #[allow(deprecated)]
        let unused = match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(data) => {
                // Parse returned unused amount
                if let Ok(unused) = near_sdk::serde_json::from_slice::<U128>(&data) {
                    std::cmp::min(unused.0, amount.0)
                } else {
                    0
                }
            }
            // If failed, refund full amount
            _ => amount.0,
        };

        if unused > 0 {
            // Refund unused tokens
            let receiver_balance = self.balances.get(&receiver_id).copied().unwrap_or(0);
            let refund = std::cmp::min(unused, receiver_balance);
            if refund > 0 {
                self.balances.insert(receiver_id, receiver_balance - refund);
                let sender_balance = self.balances.get(&sender_id).copied().unwrap_or(0);
                self.balances.insert(sender_id, sender_balance + refund);
            }
        }

        U128(amount.0 - unused)
    }
}

#[near(serializers = [json])]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}
