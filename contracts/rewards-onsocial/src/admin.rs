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
        self.authorized_callers.insert(account_id.clone());
        events::emit_authorized_caller_added(&self.owner_id, &account_id);
    }

    pub fn remove_authorized_caller(&mut self, account_id: AccountId) {
        self.require_owner();
        self.authorized_callers.remove(&account_id);
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
}
