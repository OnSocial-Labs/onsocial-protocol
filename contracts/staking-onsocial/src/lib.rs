//! Staking escrow with Synthetix-style pro-rata reward distribution.

use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, Promise, env, json_types::U128, near, require,
    serde_json, store::LookupMap,
};
use primitive_types::U256;

const MONTH_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;
const DAY_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);
const PRECISION: u128 = 1_000_000_000_000_000_000; // 10^18

const EVENT_STANDARD: &str = "onsocial";
const EVENT_VERSION: &str = "1.0.0";
const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

const EVENT_STAKE_LOCK: &str = "STAKE_LOCK";
const EVENT_STAKE_UNLOCK: &str = "STAKE_UNLOCK";
const EVENT_CREDITS_PURCHASE: &str = "CREDITS_PURCHASE";
const EVENT_CREDITS_DEBIT: &str = "CREDITS_DEBIT";
const EVENT_REWARDS_CLAIM: &str = "REWARDS_CLAIM";
const EVENT_REWARDS_INJECT: &str = "REWARDS_INJECT";
const EVENT_GATEWAY_ADDED: &str = "GATEWAY_ADDED";
const EVENT_GATEWAY_REMOVED: &str = "GATEWAY_REMOVED";
const EVENT_OWNER_CHANGED: &str = "OWNER_CHANGED";
const EVENT_PARAMS_UPDATED: &str = "PARAMS_UPDATED";
const EVENT_INFRA_WITHDRAW: &str = "INFRA_WITHDRAW";
const EVENT_CONTRACT_UPGRADE: &str = "CONTRACT_UPGRADE";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Accounts,
    Gateways,
}

#[derive(Clone, Default)]
#[near(serializers = [json, borsh])]
pub struct Account {
    pub locked_amount: U128,
    pub unlock_at: u64,
    pub lock_months: u64,
    pub credits: u64,
    pub credits_lifetime: u64,
    pub reward_per_token_paid: U128, // Synthetix checkpoint
    pub pending_rewards: U128,
    pub last_free_credit_day: u64,
}

#[near(contract_state)]
pub struct OnsocialStaking {
    token_id: AccountId,
    owner_id: AccountId,
    accounts: LookupMap<AccountId, Account>,
    gateways: LookupMap<AccountId, bool>,
    total_locked: u128,
    rewards_pool: u128,            // 40% of credit purchases
    infra_pool: u128,              // 60% of credit purchases
    reward_per_token_stored: u128, // Scaled by PRECISION
    total_effective_stake: u128,   // Includes lock bonuses
    credits_per_token: u64,
    free_daily_credits: u64,
}

impl Default for OnsocialStaking {
    fn default() -> Self {
        env::panic_str("Contract must be initialized")
    }
}

#[near]
impl OnsocialStaking {
    #[init]
    pub fn new(
        token_id: AccountId,
        owner_id: AccountId,
        credits_per_token: u64,
        free_daily_credits: u64,
    ) -> Self {
        require!(credits_per_token > 0, "credits_per_token must be positive");
        Self {
            token_id,
            owner_id,
            accounts: LookupMap::new(StorageKey::Accounts),
            gateways: LookupMap::new(StorageKey::Gateways),
            total_locked: 0,
            rewards_pool: 0,
            infra_pool: 0,
            reward_per_token_stored: 0,
            total_effective_stake: 0,
            credits_per_token,
            free_daily_credits,
        }
    }

    // --- FT Receiver ---

    /// Handles: `{"action":"lock","months":N}`, `{"action":"credits"}`, `{"action":"rewards"}` (owner only).
    #[payable]
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(
            env::predecessor_account_id() == self.token_id,
            "Only accepts SOCIAL token"
        );

        let amount = amount.0;
        require!(amount > 0, "Amount must be positive");

        let parsed: serde_json::Value =
            serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Invalid JSON message"));

        let action = parsed["action"]
            .as_str()
            .unwrap_or_else(|| env::panic_str("Missing action field"));

        match action {
            "lock" => {
                let months = parsed["months"]
                    .as_u64()
                    .unwrap_or_else(|| env::panic_str("Missing months field"));
                require!(
                    months == 1 || months == 6 || months == 12 || months == 24 || months == 48,
                    "Invalid lock period: must be 1, 6, 12, 24, or 48 months"
                );
                self.internal_lock(sender_id, amount, months);
            }
            "credits" => {
                self.internal_add_credits(sender_id, amount);
            }
            "rewards" => {
                require!(sender_id == self.owner_id, "Only owner can inject rewards");
                self.internal_inject_rewards(amount);
            }
            _ => env::panic_str("Unknown action"),
        }

        U128(0)
    }

    // --- User ---

    pub fn unlock(&mut self) -> Promise {
        let account_id = env::predecessor_account_id();
        self.update_rewards(&account_id);

        let account = self
            .accounts
            .get(&account_id)
            .unwrap_or_else(|| env::panic_str("No account found"));

        require!(
            env::block_timestamp() >= account.unlock_at,
            "Lock period not expired"
        );
        require!(account.locked_amount.0 > 0, "No tokens to unlock");

        let amount = account.locked_amount.0;
        let effective = self.effective_stake(account);

        self.ft_transfer_with_callback(
            account_id.clone(),
            amount,
            "on_unlock_callback".to_string(),
            serde_json::json!({
                "account_id": account_id,
                "amount": U128(amount),
                "effective": U128(effective)
            })
            .to_string(),
        )
    }

    #[private]
    pub fn on_unlock_callback(&mut self, account_id: AccountId, amount: U128, effective: U128) {
        if env::promise_result_checked(0, 0).is_ok() {
            let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();
            account.locked_amount = U128(0);
            account.unlock_at = 0;
            account.lock_months = 0;
            self.accounts.insert(account_id.clone(), account);

            self.total_locked -= amount.0;
            self.total_effective_stake = self.total_effective_stake.saturating_sub(effective.0);

            Self::emit_event(
                EVENT_STAKE_UNLOCK,
                &account_id,
                serde_json::json!({
                    "amount": amount.0.to_string()
                }),
            );
        }
    }

    pub fn claim_rewards(&mut self) -> Promise {
        let account_id = env::predecessor_account_id();
        self.update_rewards(&account_id);

        let account = self
            .accounts
            .get(&account_id)
            .unwrap_or_else(|| env::panic_str("No account found"));

        let rewards = account.pending_rewards.0;
        require!(rewards > 0, "No rewards to claim");

        self.ft_transfer_with_callback(
            account_id.clone(),
            rewards,
            "on_claim_rewards_callback".to_string(),
            serde_json::json!({
                "account_id": account_id,
                "amount": U128(rewards)
            })
            .to_string(),
        )
    }

    #[private]
    pub fn on_claim_rewards_callback(&mut self, account_id: AccountId, amount: U128) {
        if env::promise_result_checked(0, 0).is_ok() {
            let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();
            account.pending_rewards = U128(account.pending_rewards.0.saturating_sub(amount.0));
            self.accounts.insert(account_id.clone(), account);

            Self::emit_event(
                EVENT_REWARDS_CLAIM,
                &account_id,
                serde_json::json!({
                    "amount": amount.0.to_string()
                }),
            );
        }
    }

    pub fn get_pending_rewards(&self, account_id: AccountId) -> U128 {
        let account = self.accounts.get(&account_id).cloned().unwrap_or_default();

        if account.locked_amount.0 == 0 {
            return account.pending_rewards;
        }

        let earned = self.calculate_earned(&account);
        U128(account.pending_rewards.0 + earned)
    }

    // --- Gateway ---

    /// Applies daily free top-up, then debits. Returns false if insufficient credits.
    pub fn debit_credits(&mut self, account_id: AccountId, amount: u64) -> bool {
        require!(
            self.gateways
                .get(&env::predecessor_account_id())
                .unwrap_or(&false)
                == &true,
            "Only authorized gateways can debit credits"
        );

        let now = env::block_timestamp();
        let today = now / DAY_NS;

        let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();

        if account.last_free_credit_day < today {
            if self.free_daily_credits > 0 && account.credits < self.free_daily_credits {
                account.credits = self.free_daily_credits;
            }
            account.last_free_credit_day = today;
        }

        if account.credits < amount {
            return false;
        }

        account.credits -= amount;
        self.accounts.insert(account_id.clone(), account);

        Self::emit_event(
            EVENT_CREDITS_DEBIT,
            &account_id,
            serde_json::json!({
                "amount": amount,
                "gateway": env::predecessor_account_id().to_string()
            }),
        );

        true
    }

    // --- Owner ---

    pub fn add_gateway(&mut self, gateway_id: AccountId) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can add gateways"
        );
        self.gateways.insert(gateway_id.clone(), true);

        Self::emit_event(
            EVENT_GATEWAY_ADDED,
            &self.owner_id.clone(),
            serde_json::json!({
                "gateway_id": gateway_id.to_string()
            }),
        );
    }

    pub fn remove_gateway(&mut self, gateway_id: AccountId) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can remove gateways"
        );
        self.gateways.remove(&gateway_id);

        Self::emit_event(
            EVENT_GATEWAY_REMOVED,
            &self.owner_id.clone(),
            serde_json::json!({
                "gateway_id": gateway_id.to_string()
            }),
        );
    }

    pub fn withdraw_infra(&mut self, amount: U128, receiver_id: AccountId) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can withdraw"
        );
        require!(
            amount.0 <= self.infra_pool,
            "Insufficient infra pool balance"
        );

        self.ft_transfer_with_callback(
            receiver_id.clone(),
            amount.0,
            "on_withdraw_infra_callback".to_string(),
            serde_json::json!({
                "amount": amount,
                "receiver_id": receiver_id
            })
            .to_string(),
        )
    }

    #[private]
    pub fn on_withdraw_infra_callback(&mut self, amount: U128, receiver_id: AccountId) {
        if env::promise_result_checked(0, 0).is_ok() {
            self.infra_pool -= amount.0;

            Self::emit_event(
                EVENT_INFRA_WITHDRAW,
                &self.owner_id.clone(),
                serde_json::json!({
                    "amount": amount.0.to_string(),
                    "receiver_id": receiver_id.to_string()
                }),
            );
        }
    }

    pub fn set_owner(&mut self, new_owner: AccountId) {
        let old_owner = self.owner_id.clone();
        require!(env::predecessor_account_id() == old_owner, "Only owner");
        self.owner_id = new_owner.clone();

        Self::emit_event(
            EVENT_OWNER_CHANGED,
            &old_owner,
            serde_json::json!({
                "old_owner": old_owner.to_string(),
                "new_owner": new_owner.to_string()
            }),
        );
    }

    pub fn set_credits_per_token(&mut self, rate: u64) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can set credit rate"
        );
        require!(rate > 0, "Rate must be positive");
        let old_rate = self.credits_per_token;
        self.credits_per_token = rate;

        Self::emit_event(
            EVENT_PARAMS_UPDATED,
            &self.owner_id.clone(),
            serde_json::json!({
                "param": "credits_per_token",
                "old_value": old_rate,
                "new_value": rate
            }),
        );
    }

    pub fn set_free_daily_credits(&mut self, amount: u64) {
        require!(env::predecessor_account_id() == self.owner_id, "Only owner");
        let old_amount = self.free_daily_credits;
        self.free_daily_credits = amount;

        Self::emit_event(
            EVENT_PARAMS_UPDATED,
            &self.owner_id.clone(),
            serde_json::json!({
                "param": "free_daily_credits",
                "old_value": old_amount,
                "new_value": amount
            }),
        );
    }

    // --- Upgrade ---

    /// Deploys new contract code. Owner only.
    pub fn update_contract(&self) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can upgrade"
        );
        let code = env::input().expect("No input").to_vec();
        Self::emit_event(
            EVENT_CONTRACT_UPGRADE,
            &env::predecessor_account_id(),
            serde_json::json!({}),
        );
        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .as_return()
    }

    // --- View ---

    pub fn get_account(&self, account_id: AccountId) -> Account {
        self.accounts.get(&account_id).cloned().unwrap_or_default()
    }

    pub fn get_stats(&self) -> ContractStats {
        ContractStats {
            token_id: self.token_id.clone(),
            owner_id: self.owner_id.clone(),
            total_locked: U128(self.total_locked),
            total_effective_stake: U128(self.total_effective_stake),
            rewards_pool: U128(self.rewards_pool),
            infra_pool: U128(self.infra_pool),
            reward_per_token: U128(self.reward_per_token_stored),
            credits_per_token: self.credits_per_token,
            free_daily_credits: self.free_daily_credits,
        }
    }

    pub fn is_gateway(&self, account_id: AccountId) -> bool {
        *self.gateways.get(&account_id).unwrap_or(&false)
    }

    // --- Internal ---

    /// Checkpoints pending rewards before stake changes.
    fn update_rewards(&mut self, account_id: &AccountId) {
        let account = self.accounts.get(account_id).cloned().unwrap_or_default();

        if account.locked_amount.0 == 0 {
            let mut updated = account;
            updated.reward_per_token_paid = U128(self.reward_per_token_stored);
            self.accounts.insert(account_id.clone(), updated);
            return;
        }

        let earned = self.calculate_earned(&account);

        let mut updated = account;
        updated.pending_rewards = U128(updated.pending_rewards.0 + earned);
        updated.reward_per_token_paid = U128(self.reward_per_token_stored);
        self.accounts.insert(account_id.clone(), updated);
    }

    /// Stake with lock bonus: 10% (1-6mo), 20% (7-12mo), 35% (13-24mo), 50% (25-48mo).
    fn effective_stake(&self, account: &Account) -> u128 {
        if account.locked_amount.0 == 0 {
            return 0;
        }
        let bonus_percent: u128 = match account.lock_months {
            0 => 0,
            1..=6 => 10,
            7..=12 => 20,
            13..=24 => 35,
            _ => 50,
        };
        account.locked_amount.0 * (100 + bonus_percent) / 100
    }

    fn calculate_earned(&self, account: &Account) -> u128 {
        let effective = self.effective_stake(account);
        if effective == 0 {
            return 0;
        }

        let reward_delta = self
            .reward_per_token_stored
            .saturating_sub(account.reward_per_token_paid.0);

        (U256::from(effective) * U256::from(reward_delta) / U256::from(PRECISION)).as_u128()
    }

    /// Adds tokens; extends lock if new period is longer.
    fn internal_lock(&mut self, account_id: AccountId, amount: u128, months: u64) {
        self.update_rewards(&account_id);

        let now = env::block_timestamp();
        let unlock_at = now + (months * MONTH_NS);

        let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();

        let old_effective = self.effective_stake(&account);

        account.locked_amount = U128(account.locked_amount.0 + amount);
        if unlock_at > account.unlock_at {
            account.unlock_at = unlock_at;
        }
        if months > account.lock_months {
            account.lock_months = months;
        }

        let new_effective = self.effective_stake(&account);

        self.accounts.insert(account_id.clone(), account);
        self.total_locked += amount;
        let was_zero = self.total_effective_stake == 0;
        self.total_effective_stake = self
            .total_effective_stake
            .saturating_sub(old_effective)
            .saturating_add(new_effective);

        if was_zero && self.total_effective_stake > 0 && self.rewards_pool > 0 {
            self.reward_per_token_stored += (U256::from(self.rewards_pool) * U256::from(PRECISION)
                / U256::from(self.total_effective_stake))
            .as_u128();
        }

        Self::emit_event(
            EVENT_STAKE_LOCK,
            &account_id,
            serde_json::json!({
                "amount": amount.to_string(),
                "months": months,
                "unlock_at": unlock_at
            }),
        );
    }

    /// Splits payment 60% infra / 40% rewards, grants credits.
    fn internal_add_credits(&mut self, account_id: AccountId, amount: u128) {
        let credits = amount.saturating_mul(self.credits_per_token as u128) / 10_u128.pow(18);
        let credits = credits as u64;
        require!(credits > 0, "Amount too small for credits");

        let infra_share = amount * 60 / 100;
        let rewards_share = amount - infra_share;

        self.infra_pool += infra_share;
        self.rewards_pool += rewards_share;

        if self.total_effective_stake > 0 {
            self.reward_per_token_stored += (U256::from(rewards_share) * U256::from(PRECISION)
                / U256::from(self.total_effective_stake))
            .as_u128();
        }

        let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();

        account.credits += credits;
        account.credits_lifetime += credits;

        self.accounts.insert(account_id.clone(), account);

        Self::emit_event(
            EVENT_CREDITS_PURCHASE,
            &account_id,
            serde_json::json!({
                "amount": amount.to_string(),
                "credits": credits
            }),
        );
    }

    fn internal_inject_rewards(&mut self, amount: u128) {
        self.rewards_pool += amount;

        if self.total_effective_stake > 0 {
            self.reward_per_token_stored += (U256::from(amount) * U256::from(PRECISION)
                / U256::from(self.total_effective_stake))
            .as_u128();
        }

        Self::emit_event(
            EVENT_REWARDS_INJECT,
            &self.owner_id.clone(),
            serde_json::json!({
                "amount": amount.to_string()
            }),
        );
    }

    fn emit_event(event_type: &str, account_id: &AccountId, data: serde_json::Value) {
        let event = serde_json::json!({
            "standard": EVENT_STANDARD,
            "version": EVENT_VERSION,
            "event": event_type,
            "data": [{
                "account_id": account_id.to_string(),
                "extra": data
            }]
        });
        env::log_str(&format!("{EVENT_JSON_PREFIX}{}", event));
    }

    fn ft_transfer_with_callback(
        &self,
        receiver_id: AccountId,
        amount: u128,
        callback_method: String,
        callback_args: String,
    ) -> Promise {
        Promise::new(self.token_id.clone())
            .function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::json!({
                    "receiver_id": receiver_id,
                    "amount": U128(amount),
                })
                .to_string()
                .into_bytes(),
                NearToken::from_yoctonear(1),
                GAS_FOR_FT_TRANSFER,
            )
            .then(Promise::new(env::current_account_id()).function_call(
                callback_method,
                callback_args.into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_FOR_CALLBACK,
            ))
    }
}

#[near(serializers = [json])]
pub struct ContractStats {
    pub token_id: AccountId,
    pub owner_id: AccountId,
    pub total_locked: U128,
    pub total_effective_stake: U128,
    pub rewards_pool: U128,
    pub infra_pool: U128,
    pub reward_per_token: U128,
    pub credits_per_token: u64,
    pub free_daily_credits: u64,
}

#[cfg(test)]
mod tests;
