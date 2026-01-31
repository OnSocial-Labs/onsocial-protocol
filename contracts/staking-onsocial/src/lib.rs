//! SOCIAL staking with time-lock bonuses and Synthetix-style rewards.

use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, Promise, env, json_types::U128, near, require,
    serde_json, store::LookupMap,
};
use primitive_types::U256;

const MONTH_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;
const REWARD_DURATION_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
const REWARD_DURATION_SEC: u128 = 7 * 24 * 60 * 60;
const NS_PER_SEC: u64 = 1_000_000_000;
/// Exponential decay: releases 1/260th of remaining pool weekly.
/// ~63% after 260 weeks (5 years), never fully depletes.
const DISTRIBUTION_WEEKS: u128 = 260;
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(50);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(50);
const GAS_FOR_MIGRATE: Gas = Gas::from_tgas(200);
const PRECISION: u128 = 1_000_000_000_000_000_000;
const STORAGE_DEPOSIT: u128 = 5_000_000_000_000_000_000_000;
const CONTRACT_VERSION: u32 = 1;

/// Lock periods (months). Bonuses: 1-6→10%, 7-12→20%, 13-24→35%, 25+→50%.
const VALID_LOCK_PERIODS: [u64; 5] = [1, 6, 12, 24, 48];

const EVENT_STANDARD: &str = "onsocial";
const EVENT_VERSION: &str = "1.0.0";
const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

const EVENT_STAKE_LOCK: &str = "STAKE_LOCK";
const EVENT_STAKE_UNLOCK: &str = "STAKE_UNLOCK";
const EVENT_STAKE_EXTEND: &str = "STAKE_EXTEND";
const EVENT_CREDITS_PURCHASE: &str = "CREDITS_PURCHASE";
const EVENT_REWARDS_CLAIM: &str = "REWARDS_CLAIM";
const EVENT_OWNER_CHANGED: &str = "OWNER_CHANGED";
const EVENT_INFRA_WITHDRAW: &str = "INFRA_WITHDRAW";
const EVENT_CONTRACT_UPGRADE: &str = "CONTRACT_UPGRADE";
const EVENT_SCHEDULED_FUND: &str = "SCHEDULED_FUND";
const EVENT_SCHEDULED_RELEASE: &str = "SCHEDULED_RELEASE";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Accounts,
    StoragePaid,
}

#[derive(Clone, Default)]
#[near(serializers = [json, borsh])]
pub struct Account {
    pub locked_amount: U128,
    pub unlock_at: u64,
    pub lock_months: u64,
    pub reward_per_token_paid: U128,
    pub pending_rewards: U128,
    /// Cached for lazy reconciliation with total_effective_stake.
    pub cached_effective_stake: U128,
}

#[near(contract_state)]
pub struct OnsocialStaking {
    version: u32,
    token_id: AccountId,
    owner_id: AccountId,
    accounts: LookupMap<AccountId, Account>,
    storage_paid: LookupMap<AccountId, bool>,
    total_locked: u128,
    infra_pool: u128,
    reward_per_token_stored: u128,
    total_effective_stake: u128,
    reward_rate: u128,
    period_finish: u64,
    last_update_time: u64,
    undistributed_rewards: u128,
    scheduled_rewards_pool: u128,
    next_release_time: u64,
}

impl Default for OnsocialStaking {
    fn default() -> Self {
        env::panic_str("Contract must be initialized")
    }
}

#[near]
impl OnsocialStaking {
    #[init]
    pub fn new(token_id: AccountId, owner_id: AccountId) -> Self {
        Self {
            version: CONTRACT_VERSION,
            token_id,
            owner_id,
            accounts: LookupMap::new(StorageKey::Accounts),
            storage_paid: LookupMap::new(StorageKey::StoragePaid),
            total_locked: 0,
            infra_pool: 0,
            reward_per_token_stored: 0,
            total_effective_stake: 0,
            reward_rate: 0,
            period_finish: 0,
            last_update_time: 0,
            undistributed_rewards: 0,
            scheduled_rewards_pool: 0,
            next_release_time: 0,
        }
    }

    // --- Storage (NEP-145) ---

    #[payable]
    pub fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        #[allow(unused_variables)] registration_only: Option<bool>,
    ) -> StorageBalance {
        let account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let deposit = env::attached_deposit().as_yoctonear();

        if self.storage_paid.contains_key(&account_id) {
            if deposit > 0 {
                Promise::new(env::predecessor_account_id())
                    .transfer(NearToken::from_yoctonear(deposit))
                    .detach();
            }
            return StorageBalance {
                total: U128(STORAGE_DEPOSIT),
                available: U128(0),
            };
        }

        require!(
            deposit >= STORAGE_DEPOSIT,
            "Attach at least 0.005 NEAR for storage"
        );

        self.storage_paid.insert(account_id.clone(), true);

        let refund = deposit.saturating_sub(STORAGE_DEPOSIT);
        if refund > 0 {
            Promise::new(env::predecessor_account_id())
                .transfer(NearToken::from_yoctonear(refund))
                .detach();
        }

        StorageBalance {
            total: U128(STORAGE_DEPOSIT),
            available: U128(0),
        }
    }

    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        StorageBalanceBounds {
            min: U128(STORAGE_DEPOSIT),
            max: U128(STORAGE_DEPOSIT),
        }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        if self.storage_paid.contains_key(&account_id) {
            Some(StorageBalance {
                total: U128(STORAGE_DEPOSIT),
                available: U128(0),
            })
        } else {
            None
        }
    }

    /// NEP-141 receiver. Actions: lock, credits, rewards, fund_scheduled.
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
                require!(
                    self.storage_paid.contains_key(&sender_id),
                    "Call storage_deposit with 0.005 NEAR first"
                );
                let months = parsed["months"]
                    .as_u64()
                    .unwrap_or_else(|| env::panic_str("Missing months field"));
                require!(
                    VALID_LOCK_PERIODS.contains(&months),
                    "Invalid lock period: must be 1, 6, 12, 24, or 48 months"
                );
                self.internal_lock(sender_id, amount, months);
            }
            "credits" => {
                self.internal_purchase_credits(sender_id, amount);
            }
            "fund_scheduled" => {
                self.internal_fund_scheduled(amount);
            }
            _ => env::panic_str("Unknown action"),
        }

        U128(0)
    }

    /// Resets lock timer to full duration.
    pub fn renew_lock(&mut self) {
        let account_id = env::predecessor_account_id();
        let account = self
            .accounts
            .get(&account_id)
            .unwrap_or_else(|| env::panic_str("No account found"));
        require!(account.locked_amount.0 > 0, "No tokens locked");
        self.extend_lock(account.lock_months);
    }

    /// Extends lock to new period (must be >= current).
    pub fn extend_lock(&mut self, months: u64) {
        require!(
            VALID_LOCK_PERIODS.contains(&months),
            "Invalid lock period: must be 1, 6, 12, 24, or 48 months"
        );

        let account_id = env::predecessor_account_id();
        self.update_rewards(&account_id);

        let mut account = self
            .accounts
            .get(&account_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("No account found"));

        require!(account.locked_amount.0 > 0, "No tokens locked");

        require!(
            months >= account.lock_months,
            "New period must be >= current lock period"
        );

        let now = env::block_timestamp();
        let old_unlock_at = account.unlock_at;
        let old_months = account.lock_months;
        let old_effective = self.effective_stake(&account);

        let new_unlock_at = now.saturating_add(months.saturating_mul(MONTH_NS));

        require!(
            new_unlock_at > old_unlock_at,
            "New unlock time must be later than current"
        );

        account.unlock_at = new_unlock_at;
        account.lock_months = months;

        let new_effective = self.effective_stake(&account);
        account.cached_effective_stake = U128(new_effective);

        self.accounts.insert(account_id.clone(), account);

        self.total_effective_stake = self
            .total_effective_stake
            .saturating_sub(old_effective)
            .saturating_add(new_effective);

        Self::emit_event(
            EVENT_STAKE_EXTEND,
            &account_id,
            serde_json::json!({
                "old_months": old_months,
                "new_months": months,
                "old_unlock_at": old_unlock_at,
                "new_unlock_at": new_unlock_at,
                "old_effective": old_effective.to_string(),
                "new_effective": new_effective.to_string()
            }),
        );
    }

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
        let old_unlock_at = account.unlock_at;
        let old_lock_months = account.lock_months;

        let mut account = account.clone();
        account.locked_amount = U128(0);
        account.unlock_at = 0;
        account.lock_months = 0;
        self.accounts.insert(account_id.clone(), account);
        self.total_locked = self.total_locked.saturating_sub(amount);
        self.total_effective_stake = self.total_effective_stake.saturating_sub(effective);

        self.ft_transfer_with_callback(
            account_id.clone(),
            amount,
            "on_unlock_callback".to_string(),
            serde_json::json!({
                "account_id": account_id,
                "amount": U128(amount),
                "effective": U128(effective),
                "old_unlock_at": old_unlock_at,
                "old_lock_months": old_lock_months
            })
            .to_string(),
        )
    }

    #[private]
    pub fn on_unlock_callback(
        &mut self,
        account_id: AccountId,
        amount: U128,
        effective: U128,
        old_unlock_at: u64,
        old_lock_months: u64,
    ) {
        if env::promise_result_checked(0, 100).is_ok() {
            Self::emit_event(
                EVENT_STAKE_UNLOCK,
                &account_id,
                serde_json::json!({
                    "amount": amount.0.to_string()
                }),
            );
        } else {
            let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();
            account.locked_amount = amount;
            account.unlock_at = old_unlock_at;
            account.lock_months = old_lock_months;
            self.accounts.insert(account_id.clone(), account);
            self.total_locked += amount.0;
            self.total_effective_stake += effective.0;
            Self::emit_event(
                EVENT_STAKE_UNLOCK,
                &account_id,
                serde_json::json!({
                    "amount": amount.0.to_string(),
                    "success": false,
                    "error": "Transfer failed, state restored"
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

        let mut account = account.clone();
        account.pending_rewards = U128(0);
        self.accounts.insert(account_id.clone(), account);

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
        if env::promise_result_checked(0, 100).is_ok() {
            Self::emit_event(
                EVENT_REWARDS_CLAIM,
                &account_id,
                serde_json::json!({
                    "amount": amount.0.to_string()
                }),
            );
        } else {
            let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();
            account.pending_rewards = U128(account.pending_rewards.0 + amount.0);
            self.accounts.insert(account_id.clone(), account);
            Self::emit_event(
                EVENT_REWARDS_CLAIM,
                &account_id,
                serde_json::json!({
                    "amount": amount.0.to_string(),
                    "success": false,
                    "error": "Transfer failed, state restored"
                }),
            );
        }
    }

    // --- Owner ---

    #[payable]
    pub fn withdraw_infra(&mut self, amount: U128, receiver_id: AccountId) -> Promise {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Requires exactly 1 yoctoNEAR"
        );
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can withdraw"
        );
        require!(
            amount.0 <= self.infra_pool,
            "Insufficient infra pool balance"
        );

        self.infra_pool = self.infra_pool.saturating_sub(amount.0);

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
        if env::promise_result_checked(0, 100).is_ok() {
            Self::emit_event(
                EVENT_INFRA_WITHDRAW,
                &self.owner_id.clone(),
                serde_json::json!({
                    "amount": amount.0.to_string(),
                    "receiver_id": receiver_id.to_string()
                }),
            );
        } else {
            self.infra_pool += amount.0;
            Self::emit_event(
                EVENT_INFRA_WITHDRAW,
                &self.owner_id.clone(),
                serde_json::json!({
                    "amount": amount.0.to_string(),
                    "receiver_id": receiver_id.to_string(),
                    "success": false,
                    "error": "Transfer failed, state restored"
                }),
            );
        }
    }

    #[payable]
    pub fn set_owner(&mut self, new_owner: AccountId) {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Requires exactly 1 yoctoNEAR"
        );
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

    /// Deploys new code and triggers migration.
    pub fn update_contract(&self) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can upgrade"
        );
        let code = env::input().expect("No input provided").to_vec();

        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                GAS_FOR_MIGRATE,
            )
            .as_return()
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mut contract: OnsocialStaking = env::state_read().expect("Failed to read state");
        let old_version = contract.version;
        contract.version = CONTRACT_VERSION;

        Self::emit_event(
            EVENT_CONTRACT_UPGRADE,
            &contract.owner_id,
            serde_json::json!({
                "old_version": old_version,
                "new_version": CONTRACT_VERSION
            }),
        );

        contract
    }

    // --- Views ---

    pub fn get_account(&self, account_id: AccountId) -> Account {
        self.accounts.get(&account_id).cloned().unwrap_or_default()
    }

    pub fn get_pending_rewards(&self, account_id: AccountId) -> U128 {
        let account = self.accounts.get(&account_id).cloned().unwrap_or_default();

        if account.locked_amount.0 == 0 {
            return account.pending_rewards;
        }

        let current_rpt = self.reward_per_token();
        let earned = self.calculate_earned_with_rpt(&account, current_rpt);
        U128(account.pending_rewards.0 + earned)
    }

    pub fn get_stats(&self) -> ContractStats {
        let now = env::block_timestamp();
        let remaining_time_ns = self.period_finish.saturating_sub(now);
        let remaining_time_sec = u128::from(remaining_time_ns / NS_PER_SEC);
        let in_period = if now >= self.period_finish {
            0
        } else {
            (U256::from(self.reward_rate) * U256::from(remaining_time_sec)).as_u128()
        };
        let undistributed = in_period.saturating_add(self.undistributed_rewards);

        ContractStats {
            version: self.version,
            token_id: self.token_id.clone(),
            owner_id: self.owner_id.clone(),
            total_locked: U128(self.total_locked),
            total_effective_stake: U128(self.total_effective_stake),
            undistributed_rewards: U128(undistributed),
            infra_pool: U128(self.infra_pool),
            reward_per_token: U128(self.reward_per_token()),
            reward_rate_per_day: U128(self.reward_rate.saturating_mul(86_400)),
            period_finish: self.period_finish,
        }
    }

    pub fn get_scheduled_info(&self) -> ScheduledRewardsInfo {
        let now = env::block_timestamp();
        let weekly_release = if self.scheduled_rewards_pool < DISTRIBUTION_WEEKS {
            self.scheduled_rewards_pool
        } else {
            self.scheduled_rewards_pool / DISTRIBUTION_WEEKS
        };
        let weeks_remaining = if weekly_release > 0 {
            self.scheduled_rewards_pool / weekly_release
        } else {
            0
        };

        ScheduledRewardsInfo {
            scheduled_rewards_pool: U128(self.scheduled_rewards_pool),
            weekly_release_amount: U128(weekly_release),
            next_release_time: self.next_release_time,
            release_ready: now >= self.next_release_time && self.scheduled_rewards_pool > 0,
            weeks_remaining,
        }
    }

    pub fn get_effective_stake(&self, account_id: AccountId) -> U128 {
        let account = self.accounts.get(&account_id).cloned().unwrap_or_default();
        U128(self.effective_stake(&account))
    }

    pub fn get_lock_status(&self, account_id: AccountId) -> LockStatus {
        let account = self.accounts.get(&account_id).cloned().unwrap_or_default();
        let now = env::block_timestamp();
        let lock_expired = account.unlock_at > 0 && now >= account.unlock_at;

        let bonus_percent: u32 = match account.lock_months {
            0 => 0,
            1..=6 => 10,
            7..=12 => 20,
            13..=24 => 35,
            _ => 50,
        };

        LockStatus {
            is_locked: account.locked_amount.0 > 0,
            locked_amount: account.locked_amount,
            lock_months: account.lock_months,
            unlock_at: account.unlock_at,
            can_unlock: account.locked_amount.0 > 0 && now >= account.unlock_at,
            time_remaining_ns: account.unlock_at.saturating_sub(now),
            bonus_percent,
            effective_stake: U128(self.effective_stake(&account)),
            lock_expired,
        }
    }

    pub fn get_next_reward_release(&self) -> NextReleaseInfo {
        let now = env::block_timestamp();
        let weekly_release = if self.scheduled_rewards_pool < DISTRIBUTION_WEEKS {
            self.scheduled_rewards_pool
        } else {
            self.scheduled_rewards_pool / DISTRIBUTION_WEEKS
        };

        NextReleaseInfo {
            next_release_time: self.next_release_time,
            time_until_release_ns: self.next_release_time.saturating_sub(now),
            release_ready: now >= self.next_release_time && self.scheduled_rewards_pool > 0,
            estimated_release_amount: U128(weekly_release),
            scheduled_pool_remaining: U128(self.scheduled_rewards_pool),
        }
    }

    // --- Internal ---

    fn update_reward_per_token(&mut self) {
        self.try_auto_release();

        let now = env::block_timestamp();
        let last_applicable = self.last_time_reward_applicable();
        let time_delta_ns = last_applicable.saturating_sub(self.last_update_time);
        let time_delta_sec = time_delta_ns / NS_PER_SEC;

        if time_delta_sec > 0 && self.total_effective_stake == 0 {
            let wasted_rewards =
                (U256::from(self.reward_rate) * U256::from(time_delta_sec)).as_u128();
            self.undistributed_rewards = self.undistributed_rewards.saturating_add(wasted_rewards);
        }

        self.reward_per_token_stored = self.reward_per_token();
        self.last_update_time = last_applicable;

        if self.total_effective_stake > 0
            && self.undistributed_rewards > 0
            && now >= self.period_finish
        {
            self.add_rewards_to_pool(0);
        }
    }

    fn update_rewards(&mut self, account_id: &AccountId) {
        self.update_reward_per_token();

        let account = self.accounts.get(account_id).cloned().unwrap_or_default();
        let current_effective = self.effective_stake(&account);
        let cached = account.cached_effective_stake.0;
        if cached != current_effective {
            self.total_effective_stake = self
                .total_effective_stake
                .saturating_sub(cached)
                .saturating_add(current_effective);
        }

        if account.locked_amount.0 == 0 {
            let mut updated = account;
            updated.reward_per_token_paid = U128(self.reward_per_token_stored);
            updated.cached_effective_stake = U128(0);
            self.accounts.insert(account_id.clone(), updated);
            return;
        }

        let earned = self.calculate_earned(&account);

        let mut updated = account;
        updated.pending_rewards = U128(updated.pending_rewards.0.saturating_add(earned));
        updated.reward_per_token_paid = U128(self.reward_per_token_stored);
        updated.cached_effective_stake = U128(current_effective);
        self.accounts.insert(account_id.clone(), updated);
    }

    /// Returns locked amount with time-lock bonus. No bonus after expiry.
    fn effective_stake(&self, account: &Account) -> u128 {
        if account.locked_amount.0 == 0 {
            return 0;
        }

        let now = env::block_timestamp();
        if now >= account.unlock_at && account.unlock_at > 0 {
            return account.locked_amount.0;
        }

        let bonus_percent: u128 = match account.lock_months {
            0 => 0,
            1..=6 => 10,
            7..=12 => 20,
            13..=24 => 35,
            _ => 50,
        };
        (U256::from(account.locked_amount.0) * U256::from(100 + bonus_percent) / U256::from(100))
            .as_u128()
    }

    fn last_time_reward_applicable(&self) -> u64 {
        let now = env::block_timestamp();
        if now < self.period_finish {
            now
        } else {
            self.period_finish
        }
    }

    fn reward_per_token(&self) -> u128 {
        if self.total_effective_stake == 0 {
            return self.reward_per_token_stored;
        }

        let time_delta_ns = self
            .last_time_reward_applicable()
            .saturating_sub(self.last_update_time);
        let time_delta_sec = time_delta_ns / NS_PER_SEC;

        if time_delta_sec == 0 {
            return self.reward_per_token_stored;
        }

        let rewards_accrued = U256::from(self.reward_rate) * U256::from(time_delta_sec);
        let reward_increment = (rewards_accrued * U256::from(PRECISION)
            / U256::from(self.total_effective_stake))
        .as_u128();

        self.reward_per_token_stored
            .saturating_add(reward_increment)
    }

    fn calculate_earned(&self, account: &Account) -> u128 {
        self.calculate_earned_with_rpt(account, self.reward_per_token_stored)
    }

    fn calculate_earned_with_rpt(&self, account: &Account, current_rpt: u128) -> u128 {
        let effective = self.effective_stake(account);
        if effective == 0 {
            return 0;
        }

        let reward_delta = current_rpt.saturating_sub(account.reward_per_token_paid.0);

        (U256::from(effective) * U256::from(reward_delta) / U256::from(PRECISION)).as_u128()
    }

    fn internal_lock(&mut self, account_id: AccountId, amount: u128, months: u64) {
        self.update_rewards(&account_id);

        let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();

        if account.locked_amount.0 > 0 && account.lock_months != months {
            env::panic_str(
                "Cannot add tokens with different lock period. Use extend_lock to upgrade your lock period first.",
            );
        }

        let now = env::block_timestamp();
        let unlock_at = now.saturating_add(months.saturating_mul(MONTH_NS));

        let old_effective = self.effective_stake(&account);

        account.locked_amount = U128(account.locked_amount.0.saturating_add(amount));
        account.unlock_at = unlock_at;
        account.lock_months = months;

        let new_effective = self.effective_stake(&account);
        account.cached_effective_stake = U128(new_effective);

        self.accounts.insert(account_id.clone(), account);
        self.total_locked = self.total_locked.saturating_add(amount);
        self.total_effective_stake = self
            .total_effective_stake
            .saturating_sub(old_effective)
            .saturating_add(new_effective);

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

    /// Splits: 60% infra, 40% scheduled rewards (enters weekly decay pool).
    fn internal_purchase_credits(&mut self, account_id: AccountId, amount: u128) {
        self.update_reward_per_token();

        let now = env::block_timestamp();
        if self.next_release_time == 0 {
            self.next_release_time = now;
        }

        let infra_share = amount * 60 / 100;
        let rewards_share = amount - infra_share;

        self.infra_pool = self.infra_pool.saturating_add(infra_share);
        self.scheduled_rewards_pool = self.scheduled_rewards_pool.saturating_add(rewards_share);

        // Trigger auto-release if due
        self.try_auto_release();

        Self::emit_event(
            EVENT_CREDITS_PURCHASE,
            &account_id,
            serde_json::json!({
                "amount": amount.to_string(),
                "infra_share": infra_share.to_string(),
                "rewards_share": rewards_share.to_string()
            }),
        );
    }

    fn internal_fund_scheduled(&mut self, amount: u128) {
        let now = env::block_timestamp();
        if self.next_release_time == 0 {
            self.next_release_time = now;
        }

        self.scheduled_rewards_pool = self.scheduled_rewards_pool.saturating_add(amount);

        let weekly_release = self.scheduled_rewards_pool / DISTRIBUTION_WEEKS;
        Self::emit_event(
            EVENT_SCHEDULED_FUND,
            &self.owner_id.clone(),
            serde_json::json!({
                "amount": amount.to_string(),
                "total_pool": self.scheduled_rewards_pool.to_string(),
                "weekly_release": weekly_release.to_string()
            }),
        );

        self.try_auto_release();
    }

    /// Catches up on missed weekly releases.
    fn try_auto_release(&mut self) {
        let now = env::block_timestamp();
        while now >= self.next_release_time && self.scheduled_rewards_pool > 0 {
            let release_time = self.next_release_time;
            let release = if self.scheduled_rewards_pool < DISTRIBUTION_WEEKS {
                self.scheduled_rewards_pool
            } else {
                self.scheduled_rewards_pool / DISTRIBUTION_WEEKS
            };

            if release == 0 {
                break;
            }

            self.scheduled_rewards_pool = self.scheduled_rewards_pool.saturating_sub(release);
            self.next_release_time = self.next_release_time.saturating_add(REWARD_DURATION_NS);

            let total_amount = release.saturating_add(self.undistributed_rewards);
            self.undistributed_rewards = 0;

            if release_time >= self.period_finish {
                self.reward_rate = total_amount / REWARD_DURATION_SEC;
            } else {
                let remaining_time_ns = self.period_finish.saturating_sub(release_time);
                let remaining_time_sec = u128::from(remaining_time_ns / NS_PER_SEC);
                let leftover =
                    (U256::from(self.reward_rate) * U256::from(remaining_time_sec)).as_u128();
                self.reward_rate = (leftover + total_amount) / REWARD_DURATION_SEC;
            }

            self.last_update_time = release_time;
            self.period_finish = release_time.saturating_add(REWARD_DURATION_NS);

            Self::emit_event(
                EVENT_SCHEDULED_RELEASE,
                &self.owner_id.clone(),
                serde_json::json!({
                    "amount": release.to_string(),
                    "remaining_pool": self.scheduled_rewards_pool.to_string()
                }),
            );
        }
    }

    /// Synthetix 7-day rolling distribution. reward_rate stored as tokens/second.
    fn add_rewards_to_pool(&mut self, amount: u128) {
        let now = env::block_timestamp();
        let total_amount = amount.saturating_add(self.undistributed_rewards);
        self.undistributed_rewards = 0;

        if now >= self.period_finish {
            self.reward_rate = total_amount / REWARD_DURATION_SEC;
        } else {
            let remaining_time_ns = self.period_finish.saturating_sub(now);
            let remaining_time_sec = u128::from(remaining_time_ns / NS_PER_SEC);
            let leftover =
                (U256::from(self.reward_rate) * U256::from(remaining_time_sec)).as_u128();
            self.reward_rate = (leftover + total_amount) / REWARD_DURATION_SEC;
        }

        self.last_update_time = now;
        self.period_finish = now.saturating_add(REWARD_DURATION_NS);
    }

    fn emit_event(event_type: &str, account_id: &AccountId, data: serde_json::Value) {
        let mut event_data = data;
        if let serde_json::Value::Object(ref mut map) = event_data {
            map.insert(
                "account_id".to_string(),
                serde_json::json!(account_id.to_string()),
            );
        }
        let event = serde_json::json!({
            "standard": EVENT_STANDARD,
            "version": EVENT_VERSION,
            "event": event_type,
            "data": [event_data]
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
    pub version: u32,
    pub token_id: AccountId,
    pub owner_id: AccountId,
    pub total_locked: U128,
    pub total_effective_stake: U128,
    pub undistributed_rewards: U128,
    pub infra_pool: U128,
    pub reward_per_token: U128,
    pub reward_rate_per_day: U128,
    pub period_finish: u64,
}

#[near(serializers = [json])]
pub struct ScheduledRewardsInfo {
    pub scheduled_rewards_pool: U128,
    pub weekly_release_amount: U128,
    pub next_release_time: u64,
    pub release_ready: bool,
    pub weeks_remaining: u128,
}

#[near(serializers = [json])]
pub struct LockStatus {
    pub is_locked: bool,
    pub locked_amount: U128,
    pub lock_months: u64,
    pub unlock_at: u64,
    pub can_unlock: bool,
    pub time_remaining_ns: u64,
    pub bonus_percent: u32,
    pub effective_stake: U128,
    pub lock_expired: bool,
}

#[near(serializers = [json])]
pub struct NextReleaseInfo {
    pub next_release_time: u64,
    pub time_until_release_ns: u64,
    pub release_ready: bool,
    pub estimated_release_amount: U128,
    pub scheduled_pool_remaining: U128,
}

#[near(serializers = [json])]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[near(serializers = [json])]
pub struct StorageBalanceBounds {
    pub min: U128,
    pub max: U128,
}

#[cfg(test)]
mod tests;
