use crate::*;
use near_sdk::json_types::U128;

#[near(serializers = [json])]
pub struct ContractInfo {
    pub version: String,
    pub owner_id: AccountId,
    pub social_token: AccountId,
    pub max_daily: U128,
    pub pool_balance: U128,
    pub total_credited: U128,
    pub total_claimed: U128,
    pub intents_executors: Vec<AccountId>,
    pub authorized_callers: Vec<AccountId>,
    pub app_ids: Vec<String>,
}

/// Input for `register_app`. All budgets default to 0 (unlimited).
#[near(serializers = [json])]
#[derive(Clone)]
pub struct RegisterApp {
    pub app_id: String,
    pub label: String,
    pub daily_cap: U128,
    pub reward_per_action: U128,
    pub authorized_callers: Vec<AccountId>,
    /// Lifetime token budget. 0 = unlimited.
    #[serde(default)]
    pub total_budget: U128,
    /// Aggregate daily budget across all users. 0 = unlimited.
    #[serde(default)]
    pub daily_budget: U128,
}

/// Input for `update_app`. Only provided fields are changed.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct UpdateApp {
    pub app_id: String,
    #[serde(default)]
    pub daily_cap: Option<U128>,
    #[serde(default)]
    pub reward_per_action: Option<U128>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub authorized_callers: Option<Vec<AccountId>>,
    /// Lifetime token budget. 0 = unlimited.
    #[serde(default)]
    pub total_budget: Option<U128>,
    /// Aggregate daily budget across all users. 0 = unlimited.
    #[serde(default)]
    pub daily_budget: Option<U128>,
}

#[near]
impl RewardsContract {
    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.require_owner();
        let old_owner = self.owner_id.clone();
        self.owner_id = new_owner.clone();
        events::emit_owner_transferred(&old_owner, &new_owner);
    }

    pub fn set_max_daily(&mut self, new_max: U128) {
        self.require_owner();
        let old_max = self.max_daily;
        self.max_daily = new_max.0;
        events::emit_max_daily_updated(&self.owner_id, old_max, new_max.0);
    }

    pub fn add_authorized_caller(&mut self, account_id: AccountId) {
        self.require_owner();
        if !self.authorized_callers.contains(&account_id) {
            self.authorized_callers.push(account_id.clone());
        }
        events::emit_authorized_caller_added(&self.owner_id, &account_id);
    }

    pub fn remove_authorized_caller(&mut self, account_id: AccountId) {
        self.require_owner();
        self.authorized_callers.retain(|c| c != &account_id);
        events::emit_authorized_caller_removed(&self.owner_id, &account_id);
    }

    pub fn add_intents_executor(&mut self, executor: AccountId) {
        self.require_owner();
        if !self.intents_executors.contains(&executor) {
            self.intents_executors.push(executor.clone());
        }
        events::emit_intents_executor_added(&self.owner_id, &executor);
    }

    pub fn remove_intents_executor(&mut self, executor: AccountId) {
        self.require_owner();
        self.intents_executors.retain(|e| e != &executor);
        events::emit_intents_executor_removed(&self.owner_id, &executor);
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
        let old = contract.version.clone();
        contract.version = CONTRACT_VERSION.to_string();
        events::emit_contract_upgraded(&contract.owner_id, &old, CONTRACT_VERSION);
        contract
    }

    pub fn register_app(&mut self, config: RegisterApp) {
        self.require_owner();
        require!(!config.app_id.is_empty(), "app_id cannot be empty");
        require!(
            !self.app_configs.contains_key(&config.app_id),
            "App already registered"
        );

        let app_id = config.app_id.clone();
        self.app_configs.insert(
            app_id.clone(),
            AppConfig {
                label: config.label,
                daily_cap: config.daily_cap.0,
                reward_per_action: config.reward_per_action.0,
                authorized_callers: config.authorized_callers,
                active: true,
                total_budget: config.total_budget.0,
                total_credited: 0,
                daily_budget: config.daily_budget.0,
                daily_budget_spent: 0,
                budget_last_day: 0,
            },
        );
        self.app_ids.push(app_id.clone());

        events::emit(
            "APP_REGISTERED",
            &self.owner_id.clone(),
            near_sdk::serde_json::json!({
                "app_id": app_id,
                "daily_cap": config.daily_cap.0.to_string(),
                "reward_per_action": config.reward_per_action.0.to_string(),
                "total_budget": config.total_budget.0.to_string(),
                "daily_budget": config.daily_budget.0.to_string(),
            }),
        );
    }

    /// Update an existing app config. Only provided fields are changed.
    pub fn update_app(&mut self, update: UpdateApp) {
        self.require_owner();
        let mut config = self
            .app_configs
            .get(&update.app_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("App not found"));

        if let Some(cap) = update.daily_cap {
            config.daily_cap = cap.0;
        }
        if let Some(rate) = update.reward_per_action {
            config.reward_per_action = rate.0;
        }
        if let Some(a) = update.active {
            config.active = a;
        }
        if let Some(callers) = update.authorized_callers {
            config.authorized_callers = callers;
        }
        if let Some(budget) = update.total_budget {
            config.total_budget = budget.0;
        }
        if let Some(db) = update.daily_budget {
            config.daily_budget = db.0;
        }

        self.app_configs.insert(update.app_id.clone(), config);

        events::emit(
            "APP_UPDATED",
            &self.owner_id.clone(),
            near_sdk::serde_json::json!({ "app_id": update.app_id }),
        );
    }

    /// Deactivate an app (stops new credits, existing claimable unaffected).
    pub fn deactivate_app(&mut self, app_id: String) {
        self.require_owner();
        let mut config = self
            .app_configs
            .get(&app_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("App not found"));
        config.active = false;
        self.app_configs.insert(app_id, config);
    }
}
