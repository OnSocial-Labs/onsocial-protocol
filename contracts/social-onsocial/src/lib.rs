use crate::errors::SocialError;
use crate::events::SocialEvent;
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};

mod errors;
mod events;
mod state;
mod state_versions;
#[cfg(test)]
mod tests;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SocialOnsocial {
    state: state::SocialContractState,
}

#[near]
impl SocialOnsocial {
    #[init]
    pub fn new(manager: AccountId) -> Self {
        Self {
            state: state::SocialContractState::new(manager),
        }
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        Self {
            state: state::SocialContractState::migrate(),
        }
    }

    #[handle_result]
    pub fn update_contract(&mut self) -> Result<Promise, SocialError> {
        let caller = env::predecessor_account_id();
        if !self.state.is_manager(&caller) {
            return Err(SocialError::Unauthorized);
        }
        let code = env::input().ok_or(SocialError::MissingInput)?.to_vec();
        SocialEvent::ContractUpgraded {
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
    pub fn set_manager(&mut self, new_manager: AccountId) -> Result<(), SocialError> {
        let caller = env::predecessor_account_id();
        if !self.state.is_manager(&caller) {
            return Err(SocialError::Unauthorized);
        }
        self.state.manager = new_manager.clone();
        env::log_str(&format!("Manager updated to {}", new_manager));
        Ok(())
    }

    // Placeholder methods for social functionality
    #[handle_result]
    pub fn create_post(&mut self, _content: String) -> Result<(), SocialError> {
        // To be implemented
        Err(SocialError::MissingInput)
    }

    #[handle_result]
    pub fn like_post(&mut self, _post_id: String) -> Result<(), SocialError> {
        // To be implemented
        Err(SocialError::MissingInput)
    }

    // View methods
    pub fn get_manager(&self) -> AccountId {
        self.state.manager.clone()
    }

    pub fn get_version(&self) -> String {
        self.state.version.clone()
    }
}
