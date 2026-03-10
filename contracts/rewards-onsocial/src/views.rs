use crate::*;
use near_sdk::json_types::U128;

#[near(serializers = [json])]
#[derive(Clone)]
pub struct AppConfigView {
    pub label: String,
    pub daily_cap: U128,
    pub reward_per_action: U128,
    pub authorized_callers: Vec<AccountId>,
    pub active: bool,
    pub total_budget: U128,
    pub total_credited: U128,
    pub daily_budget: U128,
    pub daily_budget_spent: U128,
    pub budget_last_day: u64,
}

impl From<&AppConfig> for AppConfigView {
    fn from(c: &AppConfig) -> Self {
        Self {
            label: c.label.clone(),
            daily_cap: U128(c.daily_cap),
            reward_per_action: U128(c.reward_per_action),
            authorized_callers: c.authorized_callers.clone(),
            active: c.active,
            total_budget: U128(c.total_budget),
            total_credited: U128(c.total_credited),
            daily_budget: U128(c.daily_budget),
            daily_budget_spent: U128(c.daily_budget_spent),
            budget_last_day: c.budget_last_day,
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct UserRewardView {
    pub claimable: U128,
    pub daily_earned: U128,
    pub last_day: u64,
    pub total_earned: U128,
    pub total_claimed: U128,
}

impl From<&UserReward> for UserRewardView {
    fn from(u: &UserReward) -> Self {
        Self {
            claimable: U128(u.claimable),
            daily_earned: U128(u.daily_earned),
            last_day: u.last_day,
            total_earned: U128(u.total_earned),
            total_claimed: U128(u.total_claimed),
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct UserAppRewardView {
    pub daily_earned: U128,
    pub last_day: u64,
    pub total_earned: U128,
}

impl From<&UserAppReward> for UserAppRewardView {
    fn from(r: &UserAppReward) -> Self {
        Self {
            daily_earned: U128(r.daily_earned),
            last_day: r.last_day,
            total_earned: U128(r.total_earned),
        }
    }
}

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
            authorized_callers: self.authorized_callers.clone(),
            app_ids: self.app_ids.clone(),
        }
    }

    pub fn get_user_reward(&self, account_id: AccountId) -> Option<UserRewardView> {
        self.users.get(&account_id).map(UserRewardView::from)
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

    pub fn get_app_config(&self, app_id: String) -> Option<AppConfigView> {
        self.app_configs.get(&app_id).map(AppConfigView::from)
    }

    pub fn get_all_apps(&self) -> Vec<String> {
        self.app_ids.clone()
    }

    pub fn get_user_app_reward(
        &self,
        account_id: AccountId,
        app_id: String,
    ) -> Option<UserAppRewardView> {
        let key = Self::user_app_key(&account_id, &app_id);
        self.user_app_rewards.get(&key).map(UserAppRewardView::from)
    }
}
