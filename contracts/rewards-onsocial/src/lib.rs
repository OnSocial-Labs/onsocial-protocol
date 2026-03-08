//! OnSocial Rewards Contract — gasless reward distribution via `onsocial-auth`.
//!
//! Invariants:
//!   - `pool_balance` tracks actual SOCIAL tokens held; decremented on credit, restored on failed claim.
//!   - `pending_claims` enables optimistic claim with rollback on cross-contract failure.
//!   - Only `social_token` is accepted via `ft_on_transfer`; all outgoing transfers target `social_token`.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError, env, near, require,
};

mod admin;
mod dispatch;
mod errors;
mod events;
mod execute;
mod ft_receiver;
mod protocol;
mod views;

#[cfg(test)]
mod tests;

pub use admin::{ContractInfo, RegisterApp, UpdateApp};
pub use errors::RewardsError;
pub use protocol::{Action, Auth, Options, Request};

pub const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
pub const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(10);
pub const GAS_CALLBACK: Gas = Gas::from_tgas(10);
pub const GAS_MIGRATE: Gas = Gas::from_tgas(200);
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
/// NEP-145 registration deposit for the SOCIAL token contract.
/// Standard FT registration costs ~1.25 milliNEAR; we send 2 milliNEAR for safety margin.
/// `registration_only: true` ensures excess is refunded, already-registered accounts get full refund.
pub const FT_STORAGE_DEPOSIT: NearToken = NearToken::from_millinear(2);
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const NS_PER_DAY: u64 = 86_400_000_000_000;

#[derive(near_sdk::BorshStorageKey)]
#[near]
enum StorageKey {
    Users,
    PendingClaims,
    AppConfigs,
    UserAppRewards,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct UserReward {
    pub claimable: u128,
    /// Resets when `last_day` changes (global daily across all apps).
    pub daily_earned: u128,
    pub last_day: u64,
    pub total_earned: u128,
    pub total_claimed: u128,
}

/// Per-app configuration. Owner registers apps with individual daily caps.
#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct AppConfig {
    /// Display label (e.g. "OnSocial Telegram", "Partner Game").
    pub label: String,
    /// Per-user daily cap for this app. 0 = paused.
    pub daily_cap: u128,
    pub reward_per_action: u128,
    /// Only these callers can credit for this app.
    pub authorized_callers: Vec<AccountId>,
    pub active: bool,
    /// Lifetime token budget for this app. 0 = unlimited.
    pub total_budget: u128,
    pub total_credited: u128,
    /// Aggregate daily budget across all users for this app. 0 = unlimited.
    #[serde(default)]
    pub daily_budget: u128,
    #[serde(default)]
    pub daily_budget_spent: u128,
    #[serde(default)]
    pub budget_last_day: u64,
}

/// Per-user per-app daily tracking. Keyed by `"{account_id}:{app_id}"`.
#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct UserAppReward {
    pub daily_earned: u128,
    pub last_day: u64,
    pub total_earned: u128,
}

/// Stored during claim; used to rollback if `ft_transfer` fails.
#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct PendingClaim {
    pub amount: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct RewardsContract {
    pub version: String,
    pub owner_id: AccountId,
    /// Only this token is accepted in `ft_on_transfer` and used in `ft_transfer`.
    pub social_token: AccountId,
    /// Global per-user per-day earning cap (applies when no app_id is specified).
    pub max_daily: u128,
    pub(crate) users: LookupMap<AccountId, UserReward>,
    pub authorized_callers: Vec<AccountId>,
    /// Enables optimistic claim with rollback on cross-contract failure.
    pub(crate) pending_claims: LookupMap<AccountId, PendingClaim>,
    /// Must be `Vec` — `onsocial_auth::authenticate` expects `&[AccountId]`.
    pub intents_executors: Vec<AccountId>,
    /// Tracked separately from on-chain balance for accounting safety.
    pub pool_balance: u128,
    pub total_credited: u128,
    pub total_claimed: u128,
    /// Per-app reward config. Keyed by app_id (e.g. "onsocial_telegram").
    pub(crate) app_configs: LookupMap<String, AppConfig>,
    /// Per-user per-app daily tracking. Key = "{account_id}:{app_id}".
    pub(crate) user_app_rewards: LookupMap<String, UserAppReward>,
    pub app_ids: Vec<String>,
}

#[near]
impl RewardsContract {
    #[init]
    pub fn new(owner_id: AccountId, social_token: AccountId, max_daily: U128) -> Self {
        Self {
            version: CONTRACT_VERSION.to_string(),
            owner_id,
            social_token,
            max_daily: max_daily.0,
            users: LookupMap::new(StorageKey::Users),
            authorized_callers: Vec::new(),
            pending_claims: LookupMap::new(StorageKey::PendingClaims),
            intents_executors: Vec::new(),
            pool_balance: 0,
            total_credited: 0,
            total_claimed: 0,
            app_configs: LookupMap::new(StorageKey::AppConfigs),
            user_app_rewards: LookupMap::new(StorageKey::UserAppRewards),
            app_ids: Vec::new(),
        }
    }

    pub(crate) fn current_day(&self) -> u64 {
        env::block_timestamp() / NS_PER_DAY
    }

    pub(crate) fn check_owner(&self) -> Result<(), RewardsError> {
        if env::predecessor_account_id() == self.owner_id {
            Ok(())
        } else {
            Err(RewardsError::Unauthorized("Only owner".into()))
        }
    }

    pub(crate) fn user_app_key(account_id: &AccountId, app_id: &str) -> String {
        format!("{}:{}", account_id, app_id)
    }
}
