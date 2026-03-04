use crate::*;
use near_sdk::serde_json::{self, Value};

impl RewardsContract {
    pub(crate) fn dispatch_action(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, RewardsError> {
        match action {
            Action::CreditReward {
                account_id,
                amount,
                source,
            } => self.handle_credit_reward(actor_id, &account_id, amount.0, source.as_deref()),

            Action::Claim => self.handle_claim(actor_id),
        }
    }

    /// Deducts from `pool_balance`, credits to user. Enforces daily cap per user.
    fn handle_credit_reward(
        &mut self,
        caller: &AccountId,
        account_id: &AccountId,
        amount: u128,
        source: Option<&str>,
    ) -> Result<Value, RewardsError> {
        if *caller != self.owner_id && !self.authorized_callers.contains(caller) {
            return Err(RewardsError::Unauthorized(
                "Only owner or authorized callers can credit rewards".into(),
            ));
        }

        if amount == 0 {
            return Err(RewardsError::InvalidAmount);
        }

        if self.pool_balance < amount {
            return Err(RewardsError::InsufficientPool(format!(
                "Need {amount}, pool has {}",
                self.pool_balance
            )));
        }

        let today = self.current_day();
        let mut user = self.users.get(account_id).cloned().unwrap_or_default();

        if user.last_day < today {
            user.daily_earned = 0;
            user.last_day = today;
        }

        let remaining_daily = self.max_daily.saturating_sub(user.daily_earned);
        if remaining_daily == 0 {
            return Err(RewardsError::DailyCapReached);
        }
        let allowed = amount.min(remaining_daily);

        user.claimable = user.claimable.saturating_add(allowed);
        user.daily_earned = user.daily_earned.saturating_add(allowed);
        user.total_earned = user.total_earned.saturating_add(allowed);
        self.pool_balance = self.pool_balance.saturating_sub(allowed);
        self.total_credited = self.total_credited.saturating_add(allowed);

        self.users.insert(account_id.clone(), user);

        events::emit_reward_credited(account_id, allowed, source, caller);

        Ok(serde_json::json!({
            "credited": allowed.to_string(),
            "remaining_daily": remaining_daily.saturating_sub(allowed).to_string(),
        }))
    }

    /// Optimistic: zeros `claimable`, stores `PendingClaim`, batches `storage_deposit` + `ft_transfer`. Callback rolls back on failure.
    fn handle_claim(&mut self, actor_id: &AccountId) -> Result<Value, RewardsError> {
        if self.pending_claims.contains_key(actor_id) {
            return Err(RewardsError::ClaimPending);
        }

        let mut user = self
            .users
            .get(actor_id)
            .cloned()
            .ok_or(RewardsError::NothingToClaim)?;

        if user.claimable == 0 {
            return Err(RewardsError::NothingToClaim);
        }

        let amount = user.claimable;

        user.claimable = 0;
        user.total_claimed = user.total_claimed.saturating_add(amount);
        self.users.insert(actor_id.clone(), user);
        self.pending_claims
            .insert(actor_id.clone(), PendingClaim { amount });
        self.total_claimed = self.total_claimed.saturating_add(amount);

        // Batch storage_deposit (auto-register) + ft_transfer on the FT contract.
        // storage_deposit is idempotent: refunds if already registered (NEP-145).
        // Batch acts as a unit: if ft_transfer fails, registration is also reverted.
        let _ = Promise::new(self.social_token.clone())
            .function_call(
                "storage_deposit".to_string(),
                serde_json::json!({
                    "account_id": actor_id,
                    "registration_only": true
                })
                .to_string()
                .into_bytes(),
                FT_STORAGE_DEPOSIT,
                GAS_STORAGE_DEPOSIT,
            )
            .function_call(
                "ft_transfer".to_string(),
                serde_json::json!({ "receiver_id": actor_id, "amount": U128(amount) })
                    .to_string()
                    .into_bytes(),
                ONE_YOCTO,
                GAS_FT_TRANSFER,
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_claim_callback".to_string(),
                    serde_json::json!({ "account_id": actor_id, "amount": U128(amount) })
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    GAS_CALLBACK,
                ),
            );

        Ok(serde_json::json!({
            "status": "pending",
            "amount": amount.to_string(),
        }))
    }
}

#[near]
impl RewardsContract {
    /// Rolls back `claimable` and `total_claimed` if `ft_transfer` failed.
    #[private]
    pub fn on_claim_callback(
        &mut self,
        #[callback_result] call_result: Result<(), PromiseError>,
        account_id: AccountId,
        amount: U128,
    ) {
        let pending = self.pending_claims.remove(&account_id);

        if call_result.is_ok() {
            events::emit_reward_claimed(&account_id, amount.0);
        } else {
            if let Some(pending) = pending {
                let mut user = self.users.get(&account_id).cloned().unwrap_or_default();
                user.claimable = user.claimable.saturating_add(pending.amount);
                user.total_claimed = user.total_claimed.saturating_sub(pending.amount);
                self.users.insert(account_id.clone(), user);
                self.total_claimed = self.total_claimed.saturating_sub(pending.amount);
            }
            events::emit_claim_failed(&account_id, amount.0);
        }
    }
}
