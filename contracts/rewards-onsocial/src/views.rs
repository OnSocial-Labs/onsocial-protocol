use crate::*;
use near_sdk::json_types::U128;

#[near]
impl RewardsContract {
    pub fn get_contract_info(&self) -> ContractInfo {
        admin::ContractInfo {
            version: self.version.clone(),
            owner_id: self.owner_id.clone(),
            social_token: self.social_token.clone(),
            max_daily: U128(self.max_daily),
            pool_balance: U128(self.pool_balance),
            total_credited: U128(self.total_credited),
            total_claimed: U128(self.total_claimed),
            intents_executors: self.intents_executors.clone(),
            // LookupSet is not iterable; use CALLER_ADDED/CALLER_REMOVED events for audit.
            authorized_callers: Vec::new(),
        }
    }

    pub fn get_user_reward(&self, account_id: AccountId) -> Option<UserReward> {
        self.users.get(&account_id).cloned()
    }

    pub fn get_claimable(&self, account_id: AccountId) -> U128 {
        U128(
            self.users
                .get(&account_id)
                .map(|u| u.claimable)
                .unwrap_or(0),
        )
    }

    pub fn get_pool_balance(&self) -> U128 {
        U128(self.pool_balance)
    }

    pub fn get_max_daily(&self) -> U128 {
        U128(self.max_daily)
    }
}
