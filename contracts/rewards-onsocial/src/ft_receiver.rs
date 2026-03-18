use crate::*;

#[near]
impl RewardsContract {
    #[handle_result]
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> Result<U128, RewardsError> {
        if env::predecessor_account_id() != self.social_token {
            return Err(RewardsError::InvalidInput("Wrong token".into()));
        }
        if amount.0 == 0 {
            return Err(RewardsError::InvalidAmount);
        }

        let parsed: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(&msg)
            .map_err(|_| RewardsError::InvalidInput("Invalid JSON".into()))?;

        let action = parsed["action"]
            .as_str()
            .ok_or_else(|| RewardsError::InvalidInput("Missing action".into()))?;

        match action {
            "deposit" => {
                if sender_id != self.owner_id {
                    return Err(RewardsError::Unauthorized(
                        "Only owner can deposit to pool".into(),
                    ));
                }

                self.pool_balance = self
                    .pool_balance
                    .checked_add(amount.0)
                    .ok_or_else(|| RewardsError::InternalError("Pool balance overflow".into()))?;

                events::emit_pool_deposit(&sender_id, amount.0, self.pool_balance);
            }
            _ => return Err(RewardsError::InvalidInput("Unknown action".into())),
        }

        Ok(U128(0))
    }
}
