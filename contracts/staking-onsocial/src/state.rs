use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{json, Value};
use near_sdk::{
    borsh::{BorshDeserialize, BorshSerialize},
    collections::LookupMap,
    env,
    json_types::U128,
    near, near_bindgen, AccountId, Balance, Gas, Promise, Timestamp,
};

const TOTAL_SUPPLY: u128 = 1_000_000_000_000_000_000_000_000_000; // 1B with 24 decimals (adjust if different)
const BASE_RATE: u128 = 10_000; // Base APY 10% (10000 bps), scaled by 10000 for precision
const DECAY_FACTOR: u128 = 2; // k for exponential decay; tune for curve
const MIN_APY: u128 = 1_000; // 1% min to avoid zero

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StakeInfo {
    amount: Balance,
    lock_end: Timestamp, // Unix ns
    last_accrue_time: Timestamp,
    pending_rewards: Balance,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct StakingContract {
    stakes: LookupMap<AccountId, StakeInfo>,
    total_staked: Balance,
    rewards_pool: Balance,
    last_global_accrue: Timestamp,
    token_account: AccountId,   // social.tkn.near
    social_account: AccountId,  // core-onsocial.near
    relayer_account: AccountId, // relayer.account for gas sponsorship
}

impl Default for StakingContract {
    fn default() -> Self {
        Self {
            stakes: LookupMap::new(b"s"),
            total_staked: 0,
            rewards_pool: 0,
            last_global_accrue: 0,
            token_account: env::predecessor_account_id(), // Set on init
            social_account: env::predecessor_account_id(), // Set on init
            relayer_account: env::predecessor_account_id(), // Set on init
        }
    }
}

#[near_bindgen]
impl StakingContract {
    #[init]
    pub fn new(
        token_account: AccountId,
        social_account: AccountId,
        relayer_account: AccountId,
    ) -> Self {
        Self {
            token_account,
            social_account,
            relayer_account,
            ..Default::default()
        }
    }

    // FT callback after transfer approval
    #[private]
    pub fn ft_transfer_call(&mut self, sender_id: AccountId, amount: U128, msg: String) -> Promise {
        // Validate token sender to prevent shitty coins
        assert_eq!(
            env::predecessor_account_id(),
            self.token_account,
            "Invalid token: only {} accepted",
            self.token_account
        );
        // Parse msg for lock_period (1,6,12,48)
        let lock_months: u64 = msg.parse().expect("Invalid lock months");
        assert!([1, 6, 12, 48].contains(&lock_months), "Invalid lock period");
        let mut stake = self.stakes.get(&sender_id).unwrap_or(StakeInfo {
            amount: 0,
            lock_end: 0,
            last_accrue_time: env::block_timestamp(),
            pending_rewards: 0,
        });
        self.accrue_rewards(&mut stake);
        stake.amount += amount.0;
        stake.lock_end = env::block_timestamp() + lock_months * 30 * 24 * 3600 * 1_000_000_000; // Approx months to ns
        self.stakes.insert(&sender_id, &stake);
        self.total_staked += amount.0;
        self.update_tier(&sender_id, &stake);
        Promise::new(env::current_account_id())
    }

    pub fn unstake(&mut self, amount: U128) {
        let user = env::predecessor_account_id();
        let mut stake = self.stakes.get(&user).expect("No stake");
        assert!(env::block_timestamp() >= stake.lock_end, "Stake is locked");
        self.accrue_rewards(&mut stake);
        assert!(stake.amount >= amount.0, "Insufficient stake");
        stake.amount -= amount.0;
        self.total_staked -= amount.0;
        if stake.amount == 0 {
            self.stakes.remove(&user);
        } else {
            self.stakes.insert(&user, &stake);
        }
        // Transfer back tokens
        ext_ft::ext(self.token_account.clone())
            .with_attached_deposit(1)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(user.clone(), amount, None);
        self.update_tier(&user, &stake);
    }

    // Early unstake with penalty
    pub fn early_unstake(&mut self, amount: U128) {
        let user = env::predecessor_account_id();
        let mut stake = self.stakes.get(&user).expect("No stake");
        self.accrue_rewards(&mut stake);
        let remaining_lock = stake.lock_end.saturating_sub(env::block_timestamp());
        let max_lock_ns = 48 * 30 * 24 * 3600 * 1_000_000_000_u64;
        let penalty_rate = (remaining_lock * 20 / max_lock_ns) as u128; // Up to 20%
        let penalty = amount.0 * penalty_rate / 100;
        let relayer_share = penalty * 20 / 100; // 20% to relayer
        let burn_amount = penalty - relayer_share; // Burn 80%
        let net_amount = amount.0 - penalty;
        stake.amount -= amount.0;
        self.total_staked -= amount.0;
        // Redirect to relayer
        ext_ft::ext(self.token_account.clone())
            .with_attached_deposit(1)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(self.relayer_account.clone(), U128(relayer_share), None);
        // Burn remainder
        ext_ft::ext(self.token_account.clone())
            .with_attached_deposit(1)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer("burn.account".parse().unwrap(), U128(burn_amount), None);
        // Transfer net
        ext_ft::ext(self.token_account.clone())
            .with_attached_deposit(1)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(user.clone(), U128(net_amount), None);
        if stake.amount == 0 {
            self.stakes.remove(&user);
        } else {
            self.stakes.insert(&user, &stake);
        }
        self.update_tier(&user, &stake);
    }

    pub fn claim_rewards(&mut self) {
        let user = env::predecessor_account_id();
        let mut stake = self.stakes.get(&user).expect("No stake");
        self.accrue_rewards(&mut stake);
        let rewards = stake.pending_rewards;
        stake.pending_rewards = 0;
        self.stakes.insert(&user, &stake);
        self.rewards_pool -= rewards;
        ext_ft::ext(self.token_account.clone())
            .with_attached_deposit(1)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(user, U128(rewards), None);
    }

    #[payable] // Admin deposits fees
    pub fn deposit_rewards(&mut self, amount: U128) {
        // Assume admin check or multisig (add require in prod)
        self.rewards_pool += amount.0;
    }

    fn accrue_rewards(&mut self, stake: &mut StakeInfo) {
        let now = env::block_timestamp();
        let time_delta = now - stake.last_accrue_time;
        if time_delta == 0 {
            return;
        }
        let staked_ratio = self.total_staked * 1_000_000 / TOTAL_SUPPLY; // Precision 1e6
        let decay = staked_ratio.pow(DECAY_FACTOR as u32) as u128 / 1_000_000;
        let effective_rate = BASE_RATE.saturating_sub(decay).max(MIN_APY);
        let lock_mult = Self::get_lock_multiplier(stake.lock_end - stake.last_accrue_time);
        let user_effective = stake.amount * lock_mult;
        let user_share = user_effective / self.total_staked;
        let year_ns = 365 * 24 * 3600 * 1_000_000_000_u64 as u128;
        let accrued = self.rewards_pool * effective_rate * time_delta as u128 / (year_ns * 10_000);
        stake.pending_rewards += accrued * user_share;
        stake.last_accrue_time = now;
    }

    fn get_lock_multiplier(lock_duration_ns: u64) -> u128 {
        match lock_duration_ns / (30 * 24 * 3600 * 1_000_000_000_u64) {
            1 => 1,
            6 => 2,
            12 => 3,
            48 => 5,
            _ => 1,
        }
    }

    fn update_tier(&self, user: &AccountId, stake: &StakeInfo) {
        let lock_duration = stake.lock_end.saturating_sub(env::block_timestamp());
        let lock_mult = Self::get_lock_multiplier(lock_duration);
        let effective = stake.amount * lock_mult;
        let tier = if effective >= 100_000_000_000_000_000_000_000_000 {
            "gold"
        }
        // Adjust thresholds with decimals
        else if effective >= 10_000_000_000_000_000_000_000_000 {
            "silver"
        } else if effective >= 1_000_000_000_000_000_000_000_000 {
            "bronze"
        } else {
            "none"
        };
        // Cross-call social
        ext_social::ext(self.social_account.clone())
            .with_attached_deposit(1)
            .with_static_gas(GAS_FOR_CALL)
            .set_for(
                user.clone(),
                vec![("profile/tier".to_string(), json!(tier), None)],
            );
    }

    // View methods
    pub fn get_stake(&self, account_id: AccountId) -> StakeInfo {
        self.stakes.get(&account_id).unwrap_or_default()
    }

    pub fn get_total_staked(&self) -> U128 {
        U128(self.total_staked)
    }

    pub fn get_rewards_pool(&self) -> U128 {
        U128(self.rewards_pool)
    }

    pub fn get_accepted_token(&self) -> AccountId {
        self.token_account.clone()
    }
}

// External interfaces
#[near_bindgen]
#[ext_contract(ext_ft)]
pub trait Ft {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near_bindgen]
#[ext_contract(ext_social)]
pub trait Social {
    fn set_for(
        &mut self,
        target_account: AccountId,
        operations: Vec<(String, Value, Option<String>)>,
    );
}

const GAS_FOR_FT_TRANSFER: Gas = Gas(5_000_000_000_000);
const GAS_FOR_CALL: Gas = Gas(10_000_000_000_000);
