use crate::constants::{GAS_NEAR_WITHDRAW_TGAS, GAS_UNWRAP_CALLBACK_TGAS};
use crate::*;

#[near]
impl Contract {
    /// Cross-contract guarantee: only configured wNEAR contract transfers are accepted and unwrapped before balance credit.
    /// Returns unconsumed amount for NEP-141 refund semantics.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let wnear_id = self
            .wnear_account_id
            .as_ref()
            .unwrap_or_else(|| env::panic_str("wNEAR account not configured"));

        near_sdk::require!(
            env::predecessor_account_id() == *wnear_id,
            "Only wNEAR accepted"
        );
        near_sdk::require!(amount.0 > 0, "Amount must be positive");

        let credit_to: AccountId = if msg.is_empty() {
            sender_id
        } else {
            msg.parse()
                .unwrap_or_else(|_| env::panic_str("Invalid account_id in msg"))
        };

        // State/accounting invariant: credit occurs only after successful unwrap callback.
        external::ext_wrap::ext(wnear_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(GAS_NEAR_WITHDRAW_TGAS))
            .near_withdraw(amount)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(GAS_UNWRAP_CALLBACK_TGAS))
                    .on_wnear_unwrapped(credit_to, amount),
            )
            .into()
    }

    // Cross-contract guarantee: success consumes all and credits storage balance; failure returns full amount for refund.
    #[private]
    pub fn on_wnear_unwrapped(&mut self, account_id: AccountId, amount: U128) -> U128 {
        if env::promise_results_count() == 1 && env::promise_result_checked(0, 64).is_ok() {
            let mut user = self
                .user_storage
                .get(&account_id)
                .cloned()
                .unwrap_or_default();
            user.balance.0 += amount.0;
            let new_balance = user.balance.0;
            self.user_storage.insert(account_id.clone(), user);

            events::emit_wnear_deposit(&account_id, amount.0, new_balance);
            return U128(0);
        }

        events::emit_wnear_unwrap_failed(&account_id, amount.0);
        U128(amount.0)
    }
}
