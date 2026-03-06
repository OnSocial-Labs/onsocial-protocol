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
                app_id,
            } => self.handle_credit_reward(
                actor_id,
                &account_id,
                amount.0,
                source.as_deref(),
                app_id.as_deref(),
            ),

            Action::Claim => self.handle_claim(actor_id),
        }
    }

    /// Deducts from `pool_balance`, credits to user. Enforces daily cap per user.
    ///
    /// If `app_id` is provided:
    ///   - Validates the app exists and is active.
    ///   - Validates the caller is in the app's `authorized_callers`.
    ///   - Enforces the app's per-user `daily_cap` via `UserAppReward`.
    ///
    /// Otherwise:
    ///   - Validates the caller is owner or in global `authorized_callers`.
    ///   - Enforces global `max_daily` via `UserReward.daily_earned`.
    ///
    /// In both cases, credits flow into the user's global `UserReward.claimable`.
    fn handle_credit_reward(
        &mut self,
        caller: &AccountId,
        account_id: &AccountId,
        amount: u128,
        source: Option<&str>,
        app_id: Option<&str>,
    ) -> Result<Value, RewardsError> {
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

        let allowed = if let Some(aid) = app_id {
            let config = self
                .app_configs
                .get(aid)
                .cloned()
                .ok_or_else(|| RewardsError::AppNotFound(aid.to_string()))?;

            if !config.active {
                return Err(RewardsError::AppInactive(aid.to_string()));
            }

            if config.total_budget > 0 && config.total_credited >= config.total_budget {
                return Err(RewardsError::AppBudgetExhausted(aid.to_string()));
            }

            let app_daily_spent = if config.budget_last_day < today {
                0
            } else {
                config.daily_budget_spent
            };
            if config.daily_budget > 0 && app_daily_spent >= config.daily_budget {
                return Err(RewardsError::AppDailyBudgetExhausted(aid.to_string()));
            }

            // App-level caller authorization (owner always allowed).
            if *caller != self.owner_id && !config.authorized_callers.contains(caller) {
                return Err(RewardsError::Unauthorized(format!(
                    "Caller {} not authorized for app '{}'",
                    caller, aid
                )));
            }

            let key = Self::user_app_key(account_id, aid);
            let mut app_reward = self.user_app_rewards.get(&key).cloned().unwrap_or_default();

            if app_reward.last_day < today {
                app_reward.daily_earned = 0;
                app_reward.last_day = today;
            }

            let remaining = config.daily_cap.saturating_sub(app_reward.daily_earned);
            if remaining == 0 {
                return Err(RewardsError::AppDailyCapReached(aid.to_string()));
            }
            let mut allowed = amount.min(remaining);

            if config.total_budget > 0 {
                let budget_remaining = config.total_budget.saturating_sub(config.total_credited);
                allowed = allowed.min(budget_remaining);
            }

            if config.daily_budget > 0 {
                let daily_remaining = config.daily_budget.saturating_sub(app_daily_spent);
                allowed = allowed.min(daily_remaining);
            }

            app_reward.daily_earned = app_reward.daily_earned.saturating_add(allowed);
            app_reward.total_earned = app_reward.total_earned.saturating_add(allowed);
            self.user_app_rewards.insert(key, app_reward);

            let mut updated_config = config;
            updated_config.total_credited = updated_config.total_credited.saturating_add(allowed);
            if updated_config.budget_last_day < today {
                updated_config.daily_budget_spent = allowed;
                updated_config.budget_last_day = today;
            } else {
                updated_config.daily_budget_spent =
                    updated_config.daily_budget_spent.saturating_add(allowed);
            }
            self.app_configs.insert(aid.to_string(), updated_config);

            allowed
        } else {
            if *caller != self.owner_id && !self.authorized_callers.contains(caller) {
                return Err(RewardsError::Unauthorized(
                    "Only owner or authorized callers can credit rewards".into(),
                ));
            }

            let user = self.users.get(account_id).cloned().unwrap_or_default();
            let daily_earned = if user.last_day < today {
                0
            } else {
                user.daily_earned
            };
            let remaining = self.max_daily.saturating_sub(daily_earned);
            if remaining == 0 {
                return Err(RewardsError::DailyCapReached);
            }
            amount.min(remaining)
        };

        let mut user = self.users.get(account_id).cloned().unwrap_or_default();
        if user.last_day < today {
            user.daily_earned = 0;
            user.last_day = today;
        }
        user.claimable = user.claimable.saturating_add(allowed);
        // Only bump global daily_earned when using global cap (no app_id).
        if app_id.is_none() {
            user.daily_earned = user.daily_earned.saturating_add(allowed);
        }
        user.total_earned = user.total_earned.saturating_add(allowed);
        self.pool_balance = self.pool_balance.saturating_sub(allowed);
        self.total_credited = self.total_credited.saturating_add(allowed);
        self.users.insert(account_id.clone(), user);

        events::emit_reward_credited(account_id, allowed, source, caller, app_id);

        let mut result = serde_json::json!({
            "credited": allowed.to_string(),
        });
        if let Some(aid) = app_id {
            let key = Self::user_app_key(account_id, aid);
            let app_reward = self.user_app_rewards.get(&key).cloned().unwrap_or_default();
            let config = self.app_configs.get(aid).cloned().unwrap_or_default();
            result["app_id"] = serde_json::json!(aid);
            result["app_remaining_daily"] = serde_json::json!(
                config
                    .daily_cap
                    .saturating_sub(app_reward.daily_earned)
                    .to_string()
            );
            if config.total_budget > 0 {
                result["app_remaining_budget"] = serde_json::json!(
                    config
                        .total_budget
                        .saturating_sub(config.total_credited)
                        .to_string()
                );
            }
            if config.daily_budget > 0 {
                result["app_remaining_daily_budget"] = serde_json::json!(
                    config
                        .daily_budget
                        .saturating_sub(config.daily_budget_spent)
                        .to_string()
                );
            }
        } else {
            let user = self.users.get(account_id).cloned().unwrap_or_default();
            result["remaining_daily"] =
                serde_json::json!(self.max_daily.saturating_sub(user.daily_earned).to_string());
        }

        Ok(result)
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

        // Batched storage_deposit + ft_transfer: atomic unit, NEP-145 idempotent registration.
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
