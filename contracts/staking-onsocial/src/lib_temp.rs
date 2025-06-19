// SPDX-License-Identifier: MIT
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{
    env, near_bindgen, AccountId, Balance, Promise, BorshStorageKey, PanicOnDefault,
    json_types::{U128, U64}, serde::{Deserialize, Serialize}
};
use near_sdk::collections::{LookupMap, UnorderedMap};
use std::collections::HashMap;

// Constants
const ONE_DAY_MS: u64 = 86_400_000; // 1 day in milliseconds
const ONE_MONTH_MS: u64 = 30 * ONE_DAY_MS; // Approximate month
const REWARD_INTERVAL: u64 = ONE_DAY_MS; // Rewards distributed daily
const SOCIAL_TOKEN_DECIMALS: u128 = 1_000_000_000_000_000_000_000_000; // 24 decimals
const TOTAL_REWARD_POOL: u128 = 350_000_000 * SOCIAL_TOKEN_DECIMALS; // 350M tokens
const MONTHLY_REWARD: u128 = TOTAL_REWARD_POOL / (50 * 12); // ~583,333 tokens/month
const RELAYER_SHARE: u8 = 10; // 10% of rewards to relayer
const EMISSION_END_TIMESTAMP: u64 = 1_717_000_000_000 + 50 * 365 * ONE_DAY_MS; // 50 years from genesis (adjust genesis timestamp as needed)

// Lockup periods
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Copy)]
#[serde(crate = "near_sdk::serde")]
#[repr(u8)]
pub enum Lockup {
    OneMonth = 1,
    SixMonths = 6,
    TwelveMonths = 12,
    FortyEightMonths = 48,
}

impl Lockup {
    pub fn multiplier(&self) -> u128 {
        match self {
            Lockup::OneMonth => 1,
            Lockup::SixMonths => 2,
            Lockup::TwelveMonths => 5,
            Lockup::FortyEightMonths => 12,
        }
    }

    pub fn lock_duration_ms(&self) -> u64 {
        (*self as u64) * ONE_MONTH_MS
    }
}

// Stake struct
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Stake {
    pub amount: Balance,
    pub lock_duration: u64,
    pub start_timestamp: u64,
    pub claimed: Balance,
}

// Tier enum for user classification
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub enum Tier {
    Basic,
    Premium,
    Pro,
}

#[derive(BorshStorageKey, BorshSerialize)]
pub enum StorageKey {
    Stakes,
    UserSp,
    UserRewardDebt,
    Rewards,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct StakingContract {
    pub stakes: LookupMap<AccountId, Vec<Stake>>,
    pub user_sp: LookupMap<AccountId, Balance>,
    pub total_sp: Balance,
    pub last_reward_time: u64,
    pub acc_reward_per_sp: u128,
    pub user_reward_debt: LookupMap<AccountId, u128>,
    pub rewards: LookupMap<AccountId, Balance>,
    pub relayer_account: AccountId,
    pub total_emitted: u128,
}

#[near_bindgen]
impl StakingContract {
    #[init]
    pub fn new(relayer_account: AccountId) -> Self {
        Self {
            stakes: LookupMap::new(StorageKey::Stakes),
            user_sp: LookupMap::new(StorageKey::UserSp),
            total_sp: 0,
            last_reward_time: env::block_timestamp_ms(),
            acc_reward_per_sp: 0,
            user_reward_debt: LookupMap::new(StorageKey::UserRewardDebt),
            rewards: LookupMap::new(StorageKey::Rewards),
            relayer_account,
            total_emitted: 0,
        }
    }

    fn update_rewards(&mut self) {
        let now = env::block_timestamp_ms();
        if now <= self.last_reward_time || self.total_sp == 0 || now > EMISSION_END_TIMESTAMP {
            return;
        }

        let intervals = (now - self.last_reward_time) / REWARD_INTERVAL;
        if intervals == 0 {
            return;
        }

        // Calculate total reward for this period, capped by remaining pool
        let max_possible_reward = intervals as u128 * MONTHLY_REWARD / 30; // Approximate daily reward
        let remaining_pool = TOTAL_REWARD_POOL.saturating_sub(self.total_emitted);
        let total_reward = max_possible_reward.min(remaining_pool);
        if total_reward == 0 {
            return;
        }

        let user_reward = total_reward * (100 - RELAYER_SHARE as u128) / 100;
        self.acc_reward_per_sp += user_reward / self.total_sp;
        self.last_reward_time += intervals * REWARD_INTERVAL;

        let relayer_reward = total_reward - user_reward;
        let current = self.rewards.get(&self.relayer_account).unwrap_or(0);
        self.rewards.insert(&self.relayer_account, &(current + relayer_reward));
        self.total_emitted += total_reward;
    }

    #[payable]
    pub fn stake(&mut self, lock_period: Lockup) -> Promise {
        let amount = env::attached_deposit();
        assert!(amount > 0, "Amount must be > 0");

        self.update_rewards();

        let account_id = env::predecessor_account_id();
        let mut user_stakes = self.stakes.get(&account_id).unwrap_or_default();

        user_stakes.push(Stake {
            amount,
            lock_duration: lock_period.lock_duration_ms(),
            start_timestamp: env::block_timestamp_ms(),
            claimed: 0,
        });
        self.stakes.insert(&account_id, &user_stakes);

        let sp_gain = amount * lock_period.multiplier();
        self.total_sp += sp_gain;

        let current_sp = self.user_sp.get(&account_id).unwrap_or(0);
        self.user_sp.insert(&account_id, &(current_sp + sp_gain));

        let debt = self.acc_reward_per_sp * (current_sp + sp_gain);
        self.user_reward_debt.insert(&account_id, &debt);

        // NEP-141 token transfer (replace with actual token contract call)
        // Example: Promise::new(token_contract).function_call("ft_transfer_call", ...)
        Promise::new(env::current_account_id()).function_call(
            "ft_transfer_call".into(),
            json!({
                "receiver_id": env::current_account_id(),
                "amount": U128(amount),
                "msg": ""
            }).to_string().into_bytes(),
            0,
            10_000_000_000_000, // Adjust gas as needed
        )
    }

    pub fn claim_rewards(&mut self) -> Promise {
        self.update_rewards();

        let account_id = env::predecessor_account_id();
        let sp = self.user_sp.get(&account_id).unwrap_or(0);
        if sp == 0 {
            return Promise::new(account_id.clone());
        }

        let debt = self.user_reward_debt.get(&account_id).unwrap_or(0);
        let pending = (sp * self.acc_reward_per_sp).saturating_sub(debt);
        if pending > 0 {
            let current = self.rewards.get(&account_id).unwrap_or(0);
            self.rewards.insert(&account_id, &(current + pending));
        }

        self.user_reward_debt.insert(&account_id, &(sp * self.acc_reward_per_sp));

        // NEP-141 token transfer for rewards
        Promise::new(account_id.clone()).function_call(
            "ft_transfer".into(),
            json!({
                "receiver_id": account_id,
                "amount": U128(pending),
            }).to_string().into_bytes(),
            0,
            10_000_000_000_000,
        )
    }

    pub fn unstake(&mut self, index: usize) -> Promise {
        let account_id = env::predecessor_account_id();
        let mut user_stakes = self.stakes.get(&account_id).expect("No stakes");
        assert!(index < user_stakes.len(), "Invalid index");

        let stake = &user_stakes[index];
        let now = env::block_timestamp_ms();
        assert!(now >= stake.start_timestamp + stake.lock_duration, "Still locked");

        self.claim_rewards();

        let multiplier = match stake.lock_duration / ONE_MONTH_MS {
            1 => 1,
            6 => 2,
            12 => 5,
            48 => 12,
            _ => unreachable!(),
        };

        let sp_loss = stake.amount * multiplier;
        self.total_sp = self.total_sp.saturating_sub(sp_loss);

        let current_sp = self.user_sp.get(&account_id).unwrap_or(0);
        self.user_sp.insert(&account_id, &(current_sp.saturating_sub(sp_loss)));

        let amount = stake.amount;
        user_stakes.remove(index);
        if user_stakes.is_empty() {
            self.stakes.remove(&account_id);
        } else {
            self.stakes.insert(&account_id, &user_stakes);
        }

        // NEP-141 token transfer for unstaking
        Promise::new(account_id.clone()).function_call(
            "ft_transfer".into(),
            json!({
                "receiver_id": account_id,
                "amount": U128(amount),
            }).to_string().into_bytes(),
            0,
            10_000_000_000_000,
        )
    }

    pub fn get_rewards(&self, account_id: AccountId) -> U128 {
        U128(self.rewards.get(&account_id).unwrap_or(0))
    }

    pub fn get_user_sp(&self, account_id: AccountId) -> U128 {
        U128(self.user_sp.get(&account_id).unwrap_or(0))
    }

    pub fn get_stakes(&self, account_id: AccountId) -> Vec<Stake> {
        self.stakes.get(&account_id).unwrap_or_default()
    }

    pub fn get_user_tier(&self, account_id: AccountId) -> Tier {
        let user_sp = self.user_sp.get(&account_id).unwrap_or(0);
        let sp_percentage = if self.total_sp > 0 {
            (user_sp * 100_000) / self.total_sp // Scale for precision
        } else {
            0
        };

        if sp_percentage >= 500 { // 0.5% of total SP
            Tier::Pro
        } else if sp_percentage >= 100 { // 0.1% of total SP
            Tier::Premium
        } else {
            Tier::Basic
        }
    }

    pub fn get_remaining_emission(&self) -> U128 {
        U128(TOTAL_REWARD_POOL.saturating_sub(self.total_emitted))
    }
}