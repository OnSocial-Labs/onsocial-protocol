use crate::errors::StakingError;
use crate::events::StakingEvent;
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};

mod errors;
mod events;
mod state;
mod state_versions;
#[cfg(test)]
mod tests;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct StakingOnsocial {
    state: state::StakingContractState,
}

#[near]
impl StakingOnsocial {
    #[init]
    pub fn new(manager: AccountId) -> Self {
        Self {
            state: state::StakingContractState::new(manager),
        }
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        Self {
            state: state::StakingContractState::migrate(),
        }
    }

    #[handle_result]
    pub fn update_contract(&mut self) -> Result<Promise, StakingError> {
        let caller = env::predecessor_account_id();
        if !self.state.is_manager(&caller) {
            return Err(StakingError::Unauthorized);
        }
        let code = env::input().ok_or(StakingError::MissingInput)?.to_vec();
        StakingEvent::ContractUpgraded {
            manager: caller.clone(),
            timestamp: env::block_timestamp_ms(),
        }
        .emit();
        let promise = Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_yoctonear(0),
                Gas::from_tgas(250),
            );
        env::log_str(&format!(
            "update_contract: prepaid={} TGas, used={} TGas, remaining={} TGas",
            env::prepaid_gas().as_tgas(),
            env::used_gas().as_tgas(),
            env::prepaid_gas()
                .as_tgas()
                .saturating_sub(env::used_gas().as_tgas())
        ));
        Ok(promise)
    }

    #[handle_result]
    pub fn set_manager(&mut self, new_manager: AccountId) -> Result<(), StakingError> {
        let caller = env::predecessor_account_id();
        if !self.state.is_manager(&caller) {
            return Err(StakingError::Unauthorized);
        }
        self.state.manager = new_manager.clone();
        env::log_str(&format!("Manager updated to {}", new_manager));
        Ok(())
    }

    // Placeholder methods for staking functionality
    #[payable]
    #[handle_result]
    pub fn stake(&mut self, _amount: u128) -> Result<(), StakingError> {
        // To be implemented
        Err(StakingError::MissingInput)
    }

    #[handle_result]
    pub fn unstake(&mut self, _amount: u128) -> Result<(), StakingError> {
        // To be implemented
        Err(StakingError::MissingInput)
    }

    // View methods
    pub fn get_manager(&self) -> AccountId {
        self.state.manager.clone()
    }

    pub fn get_version(&self) -> String {
        self.state.version.clone()
    }
}
