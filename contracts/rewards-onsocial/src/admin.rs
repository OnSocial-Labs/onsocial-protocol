use crate::*;
use near_sdk::json_types::U128;

const MAX_APPS: usize = 100;
const MAX_APP_ID_LEN: usize = 64;
const MAX_LABEL_LEN: usize = 128;

// --- Safety ceilings (SOCIAL token = 18 decimals) ---
/// Prevents draining: max 1 SOCIAL credited per single action.
const MAX_REWARD_PER_ACTION: u128 = 1_000_000_000_000_000_000;
/// Prevents draining: max 10 SOCIAL per user per day per app.
const MAX_DAILY_CAP: u128 = 10_000_000_000_000_000_000;

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

#[near(serializers = [json])]
#[derive(Clone)]
pub struct RegisterApp {
    pub app_id: String,
    pub label: String,
    pub daily_cap: U128,
    pub reward_per_action: U128,
    pub authorized_callers: Vec<AccountId>,
    /// Lifetime token budget; 0 = unlimited.
    #[serde(default)]
    pub total_budget: U128,
    /// Aggregate daily spend across all users; 0 = unlimited.
    #[serde(default)]
    pub daily_budget: U128,
}

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
    /// Lifetime token budget; 0 = unlimited.
    #[serde(default)]
    pub total_budget: Option<U128>,
    /// Aggregate daily spend across all users; 0 = unlimited.
    #[serde(default)]
    pub daily_budget: Option<U128>,
}

#[near]
impl RewardsContract {
    #[handle_result]
    pub fn transfer_ownership(&mut self, new_owner: AccountId) -> Result<(), RewardsError> {
        self.check_owner()?;
        let old_owner = self.owner_id.clone();
        self.owner_id = new_owner.clone();
        events::emit_owner_transferred(&old_owner, &new_owner);
        Ok(())
    }

    #[handle_result]
    pub fn set_max_daily(&mut self, new_max: U128) -> Result<(), RewardsError> {
        self.check_owner()?;
        let old_max = self.max_daily;
        self.max_daily = new_max.0;
        events::emit_max_daily_updated(&self.owner_id, old_max, new_max.0);
        Ok(())
    }

    #[handle_result]
    pub fn add_authorized_caller(&mut self, account_id: AccountId) -> Result<(), RewardsError> {
        self.check_owner()?;
        if !self.authorized_callers.contains(&account_id) {
            self.authorized_callers.push(account_id.clone());
        }
        events::emit_authorized_caller_added(&self.owner_id, &account_id);
        Ok(())
    }

    #[handle_result]
    pub fn remove_authorized_caller(&mut self, account_id: AccountId) -> Result<(), RewardsError> {
        self.check_owner()?;
        self.authorized_callers.retain(|c| c != &account_id);
        events::emit_authorized_caller_removed(&self.owner_id, &account_id);
        Ok(())
    }

    #[handle_result]
    pub fn add_intents_executor(&mut self, executor: AccountId) -> Result<(), RewardsError> {
        self.check_owner()?;
        if !self.intents_executors.contains(&executor) {
            self.intents_executors.push(executor.clone());
        }
        events::emit_intents_executor_added(&self.owner_id, &executor);
        Ok(())
    }

    #[handle_result]
    pub fn remove_intents_executor(&mut self, executor: AccountId) -> Result<(), RewardsError> {
        self.check_owner()?;
        self.intents_executors.retain(|e| e != &executor);
        events::emit_intents_executor_removed(&self.owner_id, &executor);
        Ok(())
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

    #[handle_result]
    pub fn register_app(&mut self, config: RegisterApp) -> Result<(), RewardsError> {
        self.check_owner()?;
        self.validate_register_app(&config)?;

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
        Ok(())
    }

    /// Partial update; validates safety ceilings and cross-field invariants.
    #[handle_result]
    pub fn update_app(&mut self, update: UpdateApp) -> Result<(), RewardsError> {
        self.check_owner()?;
        self.validate_update_app(&update)?;

        let mut config = self.app_configs.get(&update.app_id).cloned().unwrap();

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
        Ok(())
    }

    /// Stops new credits; already-credited balances remain claimable.
    #[handle_result]
    pub fn deactivate_app(&mut self, app_id: String) -> Result<(), RewardsError> {
        self.check_owner()?;
        let mut config = self
            .app_configs
            .get(&app_id)
            .cloned()
            .ok_or_else(|| RewardsError::AppNotFound(app_id.clone()))?;
        config.active = false;
        self.app_configs.insert(app_id, config);
        Ok(())
    }
}

// --- Validation ---

impl RewardsContract {
    /// Enforces safety ceilings, length limits, and uniqueness.
    pub(crate) fn validate_register_app(&self, config: &RegisterApp) -> Result<(), RewardsError> {
        if config.app_id.is_empty() {
            return Err(RewardsError::InvalidInput("app_id cannot be empty".into()));
        }
        if config.app_id.len() > MAX_APP_ID_LEN {
            return Err(RewardsError::InvalidInput(
                "app_id too long (max 64 chars)".into(),
            ));
        }
        if config.label.is_empty() {
            return Err(RewardsError::InvalidInput("label cannot be empty".into()));
        }
        if config.label.len() > MAX_LABEL_LEN {
            return Err(RewardsError::InvalidInput(
                "label too long (max 128 chars)".into(),
            ));
        }
        if config.reward_per_action.0 == 0 {
            return Err(RewardsError::InvalidInput(
                "reward_per_action must be > 0".into(),
            ));
        }
        if config.reward_per_action.0 > MAX_REWARD_PER_ACTION {
            return Err(RewardsError::InvalidInput(
                "reward_per_action exceeds max (1 SOCIAL)".into(),
            ));
        }
        if config.daily_cap.0 == 0 {
            return Err(RewardsError::InvalidInput("daily_cap must be > 0".into()));
        }
        if config.daily_cap.0 > MAX_DAILY_CAP {
            return Err(RewardsError::InvalidInput(
                "daily_cap exceeds max (10 SOCIAL)".into(),
            ));
        }
        if config.daily_cap.0 < config.reward_per_action.0 {
            return Err(RewardsError::InvalidInput(
                "daily_cap must be >= reward_per_action".into(),
            ));
        }
        if config.total_budget.0 == 0 {
            return Err(RewardsError::InvalidInput(
                "total_budget must be > 0 (every app needs a lifetime cap)".into(),
            ));
        }
        if config.authorized_callers.is_empty() {
            return Err(RewardsError::InvalidInput(
                "authorized_callers cannot be empty".into(),
            ));
        }
        if self.app_ids.len() >= MAX_APPS {
            return Err(RewardsError::InvalidInput(
                "Maximum number of apps reached (100)".into(),
            ));
        }
        if self.app_configs.contains_key(&config.app_id) {
            return Err(RewardsError::InvalidInput("App already registered".into()));
        }
        Ok(())
    }

    /// Enforces safety ceilings and cross-field invariant: daily_cap >= reward_per_action.
    pub(crate) fn validate_update_app(&self, update: &UpdateApp) -> Result<(), RewardsError> {
        let config = self
            .app_configs
            .get(&update.app_id)
            .ok_or_else(|| RewardsError::AppNotFound(update.app_id.clone()))?;

        if let Some(cap) = update.daily_cap {
            if cap.0 == 0 {
                return Err(RewardsError::InvalidInput("daily_cap must be > 0".into()));
            }
            if cap.0 > MAX_DAILY_CAP {
                return Err(RewardsError::InvalidInput(
                    "daily_cap exceeds max (10 SOCIAL)".into(),
                ));
            }
        }
        if let Some(rate) = update.reward_per_action {
            if rate.0 == 0 {
                return Err(RewardsError::InvalidInput(
                    "reward_per_action must be > 0".into(),
                ));
            }
            if rate.0 > MAX_REWARD_PER_ACTION {
                return Err(RewardsError::InvalidInput(
                    "reward_per_action exceeds max (1 SOCIAL)".into(),
                ));
            }
        }

        let final_daily_cap = update.daily_cap.map(|c| c.0).unwrap_or(config.daily_cap);
        let final_reward = update
            .reward_per_action
            .map(|r| r.0)
            .unwrap_or(config.reward_per_action);
        if final_daily_cap < final_reward {
            return Err(RewardsError::InvalidInput(
                "daily_cap must be >= reward_per_action".into(),
            ));
        }

        if let Some(ref callers) = update.authorized_callers {
            if callers.is_empty() {
                return Err(RewardsError::InvalidInput(
                    "authorized_callers cannot be empty".into(),
                ));
            }
        }
        if let Some(budget) = update.total_budget {
            if budget.0 == 0 {
                return Err(RewardsError::InvalidInput(
                    "total_budget must be > 0 (every app needs a lifetime cap)".into(),
                ));
            }
        }
        Ok(())
    }
}
