use crate::*;

#[near]
impl RewardsContract {
    /// NEP-141 receiver. Only accepts `social_token`. Only owner can deposit to pool.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(
            env::predecessor_account_id() == self.social_token,
            "Wrong token"
        );
        require!(amount.0 > 0, "Amount must be positive");

        let parsed: near_sdk::serde_json::Value =
            near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Invalid JSON"));

        let action = parsed["action"]
            .as_str()
            .unwrap_or_else(|| env::panic_str("Missing action"));

        match action {
            "deposit" => {
                require!(sender_id == self.owner_id, "Only owner can deposit to pool");

                self.pool_balance = self
                    .pool_balance
                    .checked_add(amount.0)
                    .expect("Pool balance overflow");

                events::emit_pool_deposit(&sender_id, amount.0, self.pool_balance);
            }
            _ => env::panic_str("Unknown action"),
        }

        U128(0)
    }
}
