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
    pub fn update_contract(&mut self) -> Result<Promise, errors::SocialError> {
        let caller = env::predecessor_account_id();
        if !self.state.is_manager(&caller) {
            return Err(errors::SocialError::Unauthorized);
        }
        let code = env::input()
            .ok_or(errors::SocialError::MissingInput)?
            .to_vec();
        events::SocialEvent::ContractUpgraded {
            manager: caller.clone(),
            timestamp: env::block_timestamp_ms(),
        }
        .emit();
        Ok(Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_yoctonear(0),
                Gas::from_tgas(250),
            ))
    }

    // Placeholder for methods (e.g., create_post, like_post)
}
