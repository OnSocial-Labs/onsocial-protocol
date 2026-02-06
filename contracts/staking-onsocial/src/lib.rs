//! SOCIAL Token Staking Contract
//!
//! Rewards release continuously at 0.2%/week (pro-rata per second).
//! Time-lock bonuses: 1-6mo=10%, 7-12mo=20%, 13-24mo=35%, 25+mo=50%
//! Reward formula: (user_stake_seconds / total_stake_seconds) × total_released - claimed

use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, env,
    json_types::U128, near, require, serde_json, store::LookupMap,
};
use primitive_types::U256;

// --- Constants ---

const MONTH_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;
const WEEK_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
const NS_PER_SEC: u64 = 1_000_000_000;
const WEEKLY_RATE_BPS: u128 = 20; // 0.2% per week
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(50);
const GAS_CALLBACK: Gas = Gas::from_tgas(50);
const GAS_MIGRATE: Gas = Gas::from_tgas(200);
const STORAGE_DEPOSIT: u128 = 5_000_000_000_000_000_000_000;
const CONTRACT_VERSION: u32 = 1;
const VALID_LOCK_PERIODS: [u64; 5] = [1, 6, 12, 24, 48];
const MIN_STAKE: u128 = 10_000_000_000_000_000;
const EVENT_STANDARD: &str = "onsocial";
const EVENT_VERSION: &str = "1.0.0";

// --- Storage Keys ---

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Accounts,
    StoragePaid,
    PendingUnlocks,
}

// --- Types ---

#[derive(Clone, Default)]
#[near(serializers = [json, borsh])]
pub struct Account {
    pub locked_amount: u128,
    pub unlock_at: u64,
    pub lock_months: u64,
    pub last_update_time: u64,
    pub stake_seconds: u128,
    pub rewards_claimed: u128,
    pub tracked_effective_stake: u128,
}

/// Rollback snapshot for failed unlock.
#[derive(Clone)]
#[near(serializers = [json, borsh])]
pub struct PendingUnlock {
    pub amount: u128,
    pub effective: u128,
    pub old_locked: u128,
    pub old_unlock_at: u64,
    pub old_lock_months: u64,
}

// --- Contract State ---

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OnsocialStaking {
    version: u32,
    token_id: AccountId,
    owner_id: AccountId,
    accounts: LookupMap<AccountId, Account>,
    storage_paid: LookupMap<AccountId, bool>,
    pending_unlocks: LookupMap<AccountId, PendingUnlock>,
    total_locked: u128,
    total_effective_stake: u128,
    infra_pool: u128,
    total_stake_seconds: u128,
    last_global_update: u64,
    total_rewards_released: u128,
    last_release_time: u64,
    scheduled_pool: u128,
}

#[near]
impl OnsocialStaking {
    #[init]
    pub fn new(token_id: AccountId, owner_id: AccountId) -> Self {
        let now = env::block_timestamp();
        Self {
            version: CONTRACT_VERSION,
            token_id,
            owner_id,
            accounts: LookupMap::new(StorageKey::Accounts),
            storage_paid: LookupMap::new(StorageKey::StoragePaid),
            pending_unlocks: LookupMap::new(StorageKey::PendingUnlocks),
            total_locked: 0,
            total_effective_stake: 0,
            infra_pool: 0,
            total_stake_seconds: 0,
            last_global_update: now,
            total_rewards_released: 0,
            last_release_time: now,
            scheduled_pool: 0,
        }
    }

    // --- Storage (NEP-145) ---

    /// Fixed storage; excess deposit is refunded.
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
                let _ = Promise::new(env::predecessor_account_id())
                    .transfer(NearToken::from_yoctonear(deposit));
            }
            return StorageBalance {
                total: U128(STORAGE_DEPOSIT),
                available: U128(0),
            };
        }

        require!(deposit >= STORAGE_DEPOSIT, "Attach at least 0.005 NEAR");
        self.storage_paid.insert(account_id.clone(), true);

        self.emit_event(
            "STORAGE_DEPOSIT",
            &account_id,
            serde_json::json!({
                "deposit": STORAGE_DEPOSIT.to_string()
            }),
        );

        let refund = deposit.saturating_sub(STORAGE_DEPOSIT);
        if refund > 0 {
            let _ = Promise::new(env::predecessor_account_id())
                .transfer(NearToken::from_yoctonear(refund));
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
        self.storage_paid
            .contains_key(&account_id)
            .then_some(StorageBalance {
                total: U128(STORAGE_DEPOSIT),
                available: U128(0),
            })
    }

    // --- NEP-141 Token Receiver ---

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(
            env::predecessor_account_id() == self.token_id,
            "Wrong token"
        );
        require!(amount.0 > 0, "Amount must be positive");

        let parsed: serde_json::Value =
            serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Invalid JSON"));

        let action = parsed["action"]
            .as_str()
            .unwrap_or_else(|| env::panic_str("Missing action"));

        match action {
            "lock" => {
                require!(
                    self.storage_paid.contains_key(&sender_id),
                    "Call storage_deposit first"
                );
                let months = parsed["months"]
                    .as_u64()
                    .unwrap_or_else(|| env::panic_str("Missing months"));
                require!(VALID_LOCK_PERIODS.contains(&months), "Invalid lock period");
                self.internal_lock(sender_id, amount.0, months);
            }
            "credits" => self.internal_purchase_credits(sender_id, amount.0),
            "fund_scheduled" => self.internal_fund_scheduled(amount.0),
            _ => env::panic_str("Unknown action"),
        }

        U128(0)
    }

    // --- Core: Rewards Release ---

    /// Releases rewards pro-rata by elapsed time. Pauses clock when no stakers.
    fn release_due_rewards(&mut self) {
        if self.scheduled_pool == 0 {
            return;
        }

        let now = env::block_timestamp();

        if self.total_effective_stake == 0 {
            self.last_release_time = now;
            return;
        }

        let elapsed = now.saturating_sub(self.last_release_time);
        if elapsed == 0 {
            return;
        }

        let to_release = compute_continuous_release(self.scheduled_pool, elapsed);
        if to_release == 0 {
            return;
        }

        let final_remaining = self.scheduled_pool.saturating_sub(to_release);
        let final_remaining = if final_remaining > 0 && final_remaining < 1000 {
            0
        } else {
            final_remaining
        };
        let final_released = self.scheduled_pool.saturating_sub(final_remaining);

        self.scheduled_pool = final_remaining;
        self.total_rewards_released = self.total_rewards_released.saturating_add(final_released);
        self.last_release_time = now;

        if final_released > 0 {
            self.emit_event(
                "REWARDS_RELEASED",
                &env::current_account_id(),
                serde_json::json!({
                    "amount": final_released.to_string(),
                    "elapsed_ns": elapsed.to_string(),
                    "total_released": self.total_rewards_released.to_string(),
                    "remaining_pool": self.scheduled_pool.to_string()
                }),
            );
        }
    }

    fn update_global_stake_seconds(&mut self) {
        let now = env::block_timestamp();
        if now <= self.last_global_update {
            return;
        }

        let elapsed_sec = now.saturating_sub(self.last_global_update) / NS_PER_SEC;
        if elapsed_sec > 0 && self.total_effective_stake > 0 {
            let additional = u256_mul(self.total_effective_stake, elapsed_sec as u128);
            self.total_stake_seconds = self.total_stake_seconds.saturating_add(additional);
        }
        self.last_global_update = now;
    }

    // --- Core: Account Sync ---

    /// Syncs account and global state to current timestamp.
    fn sync_account(&mut self, account_id: &AccountId) {
        self.release_due_rewards();
        self.update_global_stake_seconds();

        let mut account = self.accounts.get(account_id).cloned().unwrap_or_default();
        let now = env::block_timestamp();

        let effective = self.effective_stake(&account);
        if effective > 0 && account.last_update_time > 0 && account.last_update_time < now {
            let elapsed_sec = now.saturating_sub(account.last_update_time) / NS_PER_SEC;
            if elapsed_sec > 0 {
                let additional = u256_mul(effective, elapsed_sec as u128);
                account.stake_seconds = account.stake_seconds.saturating_add(additional);
            }
        }

        if account.tracked_effective_stake != effective {
            self.total_effective_stake = self
                .total_effective_stake
                .saturating_sub(account.tracked_effective_stake)
                .saturating_add(effective);
            account.tracked_effective_stake = effective;
        }

        account.last_update_time = now;
        self.accounts.insert(account_id.clone(), account);
    }

    // --- Staking Operations ---

    fn internal_lock(&mut self, account_id: AccountId, amount: u128, months: u64) {
        require!(amount >= MIN_STAKE, "Minimum stake is 0.01 SOCIAL");
        require!(
            !self.pending_unlocks.contains_key(&account_id),
            "Unlock pending"
        );
        self.sync_account(&account_id);

        let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();

        if account.locked_amount > 0 && account.lock_months != months {
            env::panic_str("Cannot add with different lock period. Use extend_lock first.");
        }

        let now = env::block_timestamp();
        let old_effective = account.tracked_effective_stake;

        account.locked_amount = account.locked_amount.saturating_add(amount);
        account.unlock_at = now.saturating_add(months.saturating_mul(MONTH_NS));
        account.lock_months = months;
        account.last_update_time = now;

        let new_effective = self.effective_stake(&account);

        self.total_locked = self.total_locked.saturating_add(amount);
        self.total_effective_stake = self
            .total_effective_stake
            .saturating_sub(old_effective)
            .saturating_add(new_effective);

        account.tracked_effective_stake = new_effective;
        self.accounts.insert(account_id.clone(), account.clone());

        self.emit_event(
            "STAKE_LOCK",
            &account_id,
            serde_json::json!({
                "amount": amount.to_string(),
                "months": months,
                "effective_stake": new_effective.to_string()
            }),
        );
    }

    pub fn extend_lock(&mut self, months: u64) {
        require!(VALID_LOCK_PERIODS.contains(&months), "Invalid lock period");
        let account_id = env::predecessor_account_id();
        require!(
            !self.pending_unlocks.contains_key(&account_id),
            "Unlock pending"
        );
        self.sync_account(&account_id);

        let mut account = self
            .accounts
            .get(&account_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("No account"));
        require!(account.locked_amount > 0, "No tokens locked");
        require!(
            months >= account.lock_months,
            "New period must be >= current"
        );

        let now = env::block_timestamp();
        let new_unlock = now.saturating_add(months.saturating_mul(MONTH_NS));
        require!(new_unlock > account.unlock_at, "New unlock must be later");

        let old_effective = account.tracked_effective_stake;
        account.unlock_at = new_unlock;
        account.lock_months = months;
        account.last_update_time = now;
        let new_effective = self.effective_stake(&account);

        self.total_effective_stake = self
            .total_effective_stake
            .saturating_sub(old_effective)
            .saturating_add(new_effective);

        account.tracked_effective_stake = new_effective;
        self.accounts.insert(account_id.clone(), account);

        self.emit_event(
            "STAKE_EXTEND",
            &account_id,
            serde_json::json!({
                "new_months": months,
                "new_effective": new_effective.to_string()
            }),
        );
    }

    pub fn renew_lock(&mut self) {
        let account_id = env::predecessor_account_id();
        require!(
            !self.pending_unlocks.contains_key(&account_id),
            "Unlock pending"
        );
        let account = self
            .accounts
            .get(&account_id)
            .unwrap_or_else(|| env::panic_str("No account"));
        require!(account.locked_amount > 0, "No tokens locked");
        self.extend_lock(account.lock_months);
    }

    pub fn unlock(&mut self) -> Promise {
        let account_id = env::predecessor_account_id();
        self.sync_account(&account_id);

        let account = self
            .accounts
            .get(&account_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("No account"));
        require!(
            env::block_timestamp() >= account.unlock_at,
            "Lock not expired"
        );
        require!(account.locked_amount > 0, "No tokens to unlock");

        let amount = account.locked_amount;
        let effective = account.tracked_effective_stake;
        let old_account = account.clone();

        self.total_locked = self.total_locked.saturating_sub(amount);
        self.total_effective_stake = self.total_effective_stake.saturating_sub(effective);

        self.pending_unlocks.insert(
            account_id.clone(),
            PendingUnlock {
                amount,
                effective,
                old_locked: old_account.locked_amount,
                old_unlock_at: old_account.unlock_at,
                old_lock_months: old_account.lock_months,
            },
        );

        let mut account = account;
        account.locked_amount = 0;
        account.unlock_at = 0;
        account.lock_months = 0;
        account.tracked_effective_stake = 0;
        self.accounts.insert(account_id.clone(), account);

        self.ft_transfer_with_callback(
            account_id.clone(),
            amount,
            "on_unlock_callback",
            serde_json::json!({ "account_id": account_id }),
        )
    }

    #[private]
    pub fn on_unlock_callback(
        &mut self,
        #[callback_result] call_result: Result<(), PromiseError>,
        account_id: AccountId,
    ) {
        let pending = self
            .pending_unlocks
            .remove(&account_id)
            .unwrap_or_else(|| env::panic_str("No pending unlock"));

        if call_result.is_ok() {
            self.emit_event(
                "STAKE_UNLOCK",
                &account_id,
                serde_json::json!({
                    "amount": pending.amount.to_string()
                }),
            );
        } else {
            let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();
            account.locked_amount = pending.old_locked;
            account.unlock_at = pending.old_unlock_at;
            account.lock_months = pending.old_lock_months;
            account.tracked_effective_stake = pending.effective;
            self.accounts.insert(account_id.clone(), account);
            self.total_locked += pending.amount;
            self.total_effective_stake += pending.effective;
            self.emit_event(
                "UNLOCK_FAILED",
                &account_id,
                serde_json::json!({
                    "amount": pending.amount.to_string()
                }),
            );
        }
    }

    // --- Rewards ---

    /// Calculates claimable rewards with projected releases.
    fn calculate_claimable(&self, account: &Account) -> u128 {
        self.calculate_claimable_internal(account, true)
    }

    fn calculate_claimable_internal(&self, account: &Account, project_releases: bool) -> u128 {
        let total_released = if project_releases {
            self.project_total_released()
        } else {
            self.total_rewards_released
        };

        if self.total_stake_seconds == 0 && self.total_effective_stake == 0 {
            return 0;
        }
        if total_released == 0 {
            return 0;
        }

        let now = env::block_timestamp();
        let mut user_ss = account.stake_seconds;
        let effective = self.effective_stake(account);

        if effective > 0 && account.last_update_time > 0 && account.last_update_time < now {
            let elapsed_sec = now.saturating_sub(account.last_update_time) / NS_PER_SEC;
            user_ss = user_ss.saturating_add(u256_mul(effective, elapsed_sec as u128));
        }

        let mut total_ss = self.total_stake_seconds;
        if self.last_global_update < now && self.total_effective_stake > 0 {
            let elapsed_sec = now.saturating_sub(self.last_global_update) / NS_PER_SEC;
            total_ss =
                total_ss.saturating_add(u256_mul(self.total_effective_stake, elapsed_sec as u128));
        }

        if total_ss == 0 {
            return 0;
        }

        let total_earned = u256_mul_div(total_released, user_ss, total_ss);
        total_earned.saturating_sub(account.rewards_claimed)
    }

    /// Projects total released rewards for view calls without mutating state.
    fn project_total_released(&self) -> u128 {
        if self.total_effective_stake == 0 || self.scheduled_pool == 0 {
            return self.total_rewards_released;
        }

        let now = env::block_timestamp();
        let elapsed = now.saturating_sub(self.last_release_time);
        if elapsed == 0 {
            return self.total_rewards_released;
        }

        let released = compute_continuous_release(self.scheduled_pool, elapsed);
        self.total_rewards_released.saturating_add(released)
    }

    pub fn claim_rewards(&mut self) -> Promise {
        let account_id = env::predecessor_account_id();
        require!(
            !self.pending_unlocks.contains_key(&account_id),
            "Unlock pending"
        );
        self.sync_account(&account_id);

        let account = self
            .accounts
            .get(&account_id)
            .unwrap_or_else(|| env::panic_str("No account"));

        let claimable = self.calculate_claimable_internal(account, false);
        require!(claimable > 0, "No rewards to claim");

        let mut account = account.clone();
        account.rewards_claimed = account.rewards_claimed.saturating_add(claimable);
        self.accounts.insert(account_id.clone(), account);

        self.ft_transfer_with_callback(
            account_id.clone(),
            claimable,
            "on_claim_callback",
            serde_json::json!({
                "account_id": account_id,
                "amount": U128(claimable)
            }),
        )
    }

    #[private]
    pub fn on_claim_callback(
        &mut self,
        #[callback_result] call_result: Result<(), PromiseError>,
        account_id: AccountId,
        amount: U128,
    ) {
        if call_result.is_ok() {
            self.emit_event(
                "REWARDS_CLAIM",
                &account_id,
                serde_json::json!({
                    "amount": amount.0.to_string()
                }),
            );
        } else {
            let mut account = self.accounts.get(&account_id).cloned().unwrap_or_default();
            account.rewards_claimed = account.rewards_claimed.saturating_sub(amount.0);
            self.accounts.insert(account_id.clone(), account);
            self.emit_event(
                "CLAIM_FAILED",
                &account_id,
                serde_json::json!({
                    "amount": amount.0.to_string()
                }),
            );
        }
    }

    // --- Credits & Funding ---

    fn internal_purchase_credits(&mut self, account_id: AccountId, amount: u128) {
        self.release_due_rewards();

        let infra_share = amount * 60 / 100;
        let rewards_share = amount - infra_share;

        self.infra_pool = self.infra_pool.saturating_add(infra_share);
        self.scheduled_pool = self.scheduled_pool.saturating_add(rewards_share);

        self.emit_event(
            "CREDITS_PURCHASE",
            &account_id,
            serde_json::json!({
                "amount": amount.to_string(),
                "infra_share": infra_share.to_string(),
                "rewards_share": rewards_share.to_string()
            }),
        );
    }

    fn internal_fund_scheduled(&mut self, amount: u128) {
        self.scheduled_pool = self.scheduled_pool.saturating_add(amount);
        self.emit_event(
            "SCHEDULED_FUND",
            &self.owner_id.clone(),
            serde_json::json!({
                "amount": amount.to_string(),
                "total_pool": self.scheduled_pool.to_string()
            }),
        );
    }

    // --- Owner Functions ---

    #[payable]
    pub fn withdraw_infra(&mut self, amount: U128, receiver_id: AccountId) -> Promise {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Attach 1 yoctoNEAR"
        );
        require!(env::predecessor_account_id() == self.owner_id, "Not owner");
        require!(amount.0 <= self.infra_pool, "Insufficient balance");

        self.infra_pool = self.infra_pool.saturating_sub(amount.0);

        self.ft_transfer_with_callback(
            receiver_id.clone(),
            amount.0,
            "on_withdraw_infra_callback",
            serde_json::json!({ "amount": amount, "receiver_id": receiver_id }),
        )
    }

    #[private]
    pub fn on_withdraw_infra_callback(
        &mut self,
        #[callback_result] call_result: Result<(), PromiseError>,
        amount: U128,
        receiver_id: AccountId,
    ) {
        if call_result.is_ok() {
            self.emit_event(
                "INFRA_WITHDRAW",
                &self.owner_id.clone(),
                serde_json::json!({
                    "amount": amount.0.to_string(),
                    "receiver_id": receiver_id
                }),
            );
        } else {
            self.infra_pool += amount.0;
            self.emit_event(
                "WITHDRAW_INFRA_FAILED",
                &receiver_id,
                serde_json::json!({
                    "amount": amount.0.to_string()
                }),
            );
        }
    }

    #[payable]
    pub fn set_owner(&mut self, new_owner: AccountId) {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Attach 1 yoctoNEAR"
        );
        require!(env::predecessor_account_id() == self.owner_id, "Not owner");
        let old = self.owner_id.clone();
        self.owner_id = new_owner.clone();
        self.emit_event(
            "OWNER_CHANGED",
            &old,
            serde_json::json!({
                "old_owner": old, "new_owner": new_owner
            }),
        );
    }

    pub fn update_contract(&self) -> Promise {
        require!(env::predecessor_account_id() == self.owner_id, "Not owner");
        let code = env::input().expect("No input").to_vec();
        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                GAS_MIGRATE,
            )
            .as_return()
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mut contract: Self = env::state_read().expect("State read failed");
        let old = contract.version;
        contract.version = CONTRACT_VERSION;
        contract.emit_event(
            "CONTRACT_UPGRADE",
            &contract.owner_id.clone(),
            serde_json::json!({ "old_version": old, "new_version": CONTRACT_VERSION }),
        );
        contract
    }

    // --- Views ---

    pub fn get_account(&self, account_id: AccountId) -> AccountView {
        let account = self.accounts.get(&account_id).cloned().unwrap_or_default();
        let effective = self.effective_stake(&account);
        let claimable = self.calculate_claimable(&account);

        AccountView {
            locked_amount: U128(account.locked_amount),
            unlock_at: account.unlock_at,
            lock_months: account.lock_months,
            effective_stake: U128(effective),
            claimable_rewards: U128(claimable),
            stake_seconds: U128(account.stake_seconds),
            rewards_claimed: U128(account.rewards_claimed),
        }
    }

    /// Returns contract stats with projected values for consistency with get_account.
    pub fn get_stats(&self) -> ContractStats {
        let projected_released = self.project_total_released();
        let release_delta = projected_released.saturating_sub(self.total_rewards_released);
        let projected_pool = self.scheduled_pool.saturating_sub(release_delta);

        ContractStats {
            version: self.version,
            token_id: self.token_id.clone(),
            owner_id: self.owner_id.clone(),
            total_locked: U128(self.total_locked),
            total_effective_stake: U128(self.total_effective_stake),
            total_stake_seconds: U128(self.total_stake_seconds),
            total_rewards_released: U128(projected_released),
            scheduled_pool: U128(projected_pool),
            infra_pool: U128(self.infra_pool),
            last_release_time: self.last_release_time,
        }
    }

    pub fn get_lock_status(&self, account_id: AccountId) -> LockStatus {
        let account = self.accounts.get(&account_id).cloned().unwrap_or_default();
        let now = env::block_timestamp();
        let expired = account.unlock_at > 0 && now >= account.unlock_at;

        let bonus = match account.lock_months {
            0 => 0,
            1..=6 => 10,
            7..=12 => 20,
            13..=24 => 35,
            _ => 50,
        };

        LockStatus {
            is_locked: account.locked_amount > 0,
            locked_amount: U128(account.locked_amount),
            lock_months: account.lock_months,
            unlock_at: account.unlock_at,
            can_unlock: account.locked_amount > 0 && expired,
            time_remaining_ns: account.unlock_at.saturating_sub(now),
            bonus_percent: bonus,
            effective_stake: U128(self.effective_stake(&account)),
            lock_expired: expired,
        }
    }

    /// Returns accumulation rate for live UI counters.
    pub fn get_reward_rate(&self, account_id: AccountId) -> RewardRateInfo {
        let account = self.accounts.get(&account_id).cloned().unwrap_or_default();
        let effective = self.effective_stake(&account);
        let claimable = self.calculate_claimable(&account);
        let weekly_release = self.scheduled_pool * WEEKLY_RATE_BPS / 10_000;

        let rewards_per_second = if self.total_effective_stake > 0 && weekly_release > 0 {
            u256_mul_div(
                u256_mul_div(weekly_release, effective, self.total_effective_stake),
                1,
                7 * 24 * 60 * 60,
            )
        } else {
            0
        };

        RewardRateInfo {
            claimable_now: U128(claimable),
            rewards_per_second: U128(rewards_per_second),
            effective_stake: U128(effective),
            total_effective_stake: U128(self.total_effective_stake),
            weekly_pool_release: U128(weekly_release),
        }
    }

    /// Triggers reward release and stake-seconds update.
    pub fn poke(&mut self) {
        self.release_due_rewards();
        self.update_global_stake_seconds();
    }

    // --- Helpers ---

    fn effective_stake(&self, account: &Account) -> u128 {
        self.effective_stake_with_bonus(account)
    }

    fn effective_stake_with_bonus(&self, account: &Account) -> u128 {
        if account.locked_amount == 0 {
            return 0;
        }
        let bonus: u128 = match account.lock_months {
            0 => 0,
            1..=6 => 10,
            7..=12 => 20,
            13..=24 => 35,
            _ => 50,
        };
        u256_mul_div(account.locked_amount, 100 + bonus, 100)
    }

    fn emit_event(&self, event: &str, account_id: &AccountId, mut data: serde_json::Value) {
        if let serde_json::Value::Object(ref mut map) = data {
            map.insert(
                "account_id".into(),
                serde_json::json!(account_id.to_string()),
            );
        }
        let log = serde_json::json!({
            "standard": EVENT_STANDARD,
            "version": EVENT_VERSION,
            "event": event,
            "data": [data]
        });
        env::log_str(&format!("EVENT_JSON:{}", log));
    }

    fn ft_transfer_with_callback(
        &self,
        receiver: AccountId,
        amount: u128,
        callback: &str,
        args: serde_json::Value,
    ) -> Promise {
        Promise::new(self.token_id.clone())
            .function_call(
                "ft_transfer".to_string(),
                serde_json::json!({ "receiver_id": receiver, "amount": U128(amount) })
                    .to_string()
                    .into_bytes(),
                NearToken::from_yoctonear(1),
                GAS_FT_TRANSFER,
            )
            .then(Promise::new(env::current_account_id()).function_call(
                callback.to_string(),
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_CALLBACK,
            ))
    }
}

// --- U256 Helpers ---

fn u256_mul(a: u128, b: u128) -> u128 {
    let result = U256::from(a) * U256::from(b);
    if result > U256::from(u128::MAX) {
        env::panic_str("Arithmetic overflow in u256_mul");
    }
    result.as_u128()
}

/// Returns 0 if divisor is 0.
fn u256_mul_div(a: u128, b: u128, c: u128) -> u128 {
    if c == 0 {
        return 0;
    }
    let result = U256::from(a) * U256::from(b) / U256::from(c);
    if result > U256::from(u128::MAX) {
        env::panic_str("Arithmetic overflow in u256_mul_div");
    }
    result.as_u128()
}

/// Calculates release amount: compound decay for complete weeks + linear for partial.
fn compute_continuous_release(pool: u128, elapsed_ns: u64) -> u128 {
    if pool == 0 || elapsed_ns == 0 {
        return 0;
    }

    let complete_weeks = elapsed_ns / WEEK_NS;
    let partial_ns = elapsed_ns % WEEK_NS;

    let mut remaining = pool;
    if complete_weeks > 0 {
        remaining = compute_remaining_pool(pool, complete_weeks);
    }

    let partial_release = if partial_ns > 0 && remaining > 0 {
        u256_mul_div(
            u256_mul_div(remaining, WEEKLY_RATE_BPS, 10_000),
            partial_ns as u128,
            WEEK_NS as u128,
        )
    } else {
        0
    };

    let final_remaining = remaining.saturating_sub(partial_release);
    pool.saturating_sub(final_remaining)
}

/// Pool × 0.998^weeks via O(log n) exponentiation.
fn compute_remaining_pool(pool: u128, weeks: u64) -> u128 {
    if weeks == 0 || pool == 0 {
        return pool;
    }

    const PRECISION: u128 = 1_000_000_000_000_000_000;
    const DECAY_FACTOR: u128 = 998_000_000_000_000_000;

    let factor = u256_pow(DECAY_FACTOR, weeks, PRECISION);
    u256_mul_div(pool, factor, PRECISION)
}

/// Fixed-point exponentiation via binary method.
fn u256_pow(base: u128, exp: u64, precision: u128) -> u128 {
    if exp == 0 {
        return precision;
    }

    let p = U256::from(precision);
    let mut result = U256::from(precision);
    let mut b = U256::from(base);
    let mut e = exp;

    while e > 0 {
        if e & 1 == 1 {
            result = result * b / p;
        }
        b = b * b / p;
        e >>= 1;
    }

    result.as_u128()
}

// --- View Types ---

#[near(serializers = [json])]
pub struct AccountView {
    pub locked_amount: U128,
    pub unlock_at: u64,
    pub lock_months: u64,
    pub effective_stake: U128,
    pub claimable_rewards: U128,
    pub stake_seconds: U128,
    pub rewards_claimed: U128,
}

#[near(serializers = [json])]
pub struct ContractStats {
    pub version: u32,
    pub token_id: AccountId,
    pub owner_id: AccountId,
    pub total_locked: U128,
    pub total_effective_stake: U128,
    pub total_stake_seconds: U128,
    pub total_rewards_released: U128,
    pub scheduled_pool: U128,
    pub infra_pool: U128,
    pub last_release_time: u64,
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
pub struct RewardRateInfo {
    pub claimable_now: U128,
    pub rewards_per_second: U128,
    pub effective_stake: U128,
    pub total_effective_stake: U128,
    pub weekly_pool_release: U128,
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
