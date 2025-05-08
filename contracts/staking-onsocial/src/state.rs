use near_sdk::borsh::{BorshSerialize, BorshDeserialize};
use near_sdk::{env, AccountId};

#[derive(BorshSerialize, BorshDeserialize)]
pub struct StakingContractState {
    pub version: String,
    pub manager: AccountId,
}

impl StakingContractState {
    pub fn new(manager: AccountId) -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            manager,
        }
    }

    pub fn is_manager(&self, account_id: &AccountId) -> bool {
        &self.manager == account_id
    }

    pub fn migrate() -> Self {
        match env::state_read::<super::state_versions::StateV010>() {
            Some(prev) => Self {
                version: env!("CARGO_PKG_VERSION").to_string(),
                manager: prev.manager,
            },
            None => Self {
                version: env!("CARGO_PKG_VERSION").to_string(),
                manager: env::current_account_id(),
            },
        }
    }
}