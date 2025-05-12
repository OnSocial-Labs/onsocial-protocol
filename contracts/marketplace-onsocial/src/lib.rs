use crate::errors::MarketplaceError;
use crate::events::MarketplaceEvent;
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};

mod errors;
mod events;
mod state;
mod state_versions;
#[cfg(test)]
mod tests;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MarketplaceOnsocial {
    state: state::MarketplaceContractState,
}

#[near]
impl MarketplaceOnsocial {
    #[init]
    pub fn new(manager: AccountId) -> Self {
        Self {
            state: state::MarketplaceContractState::new(manager),
        }
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        Self {
            state: state::MarketplaceContractState::migrate(),
        }
    }

    #[handle_result]
    pub fn update_contract(&mut self) -> Result<Promise, MarketplaceError> {
        let caller = env::predecessor_account_id();
        if !self.state.is_manager(&caller) {
            return Err(MarketplaceError::Unauthorized);
        }
        let code = env::input().ok_or(MarketplaceError::MissingInput)?.to_vec();
        MarketplaceEvent::ContractUpgraded {
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
    pub fn set_manager(&mut self, new_manager: AccountId) -> Result<(), MarketplaceError> {
        let caller = env::predecessor_account_id();
        if !self.state.is_manager(&caller) {
            return Err(MarketplaceError::Unauthorized);
        }
        self.state.manager = new_manager.clone();
        env::log_str(&format!("Manager updated to {}", new_manager));
        Ok(())
    }

    // Placeholder methods for marketplace functionality
    #[handle_result]
    pub fn list_item(&mut self, _item_id: String, _price: u128) -> Result<(), MarketplaceError> {
        // To be implemented
        Err(MarketplaceError::MissingInput)
    }

    #[handle_result]
    pub fn buy_item(&mut self, _item_id: String) -> Result<(), MarketplaceError> {
        // To be implemented
        Err(MarketplaceError::MissingInput)
    }

    // View methods
    pub fn get_manager(&self) -> AccountId {
        self.state.manager.clone()
    }

    pub fn get_version(&self) -> String {
        self.state.version.clone()
    }
}
