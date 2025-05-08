use crate::errors::AuthError;
use crate::state::AuthContractState;
use crate::types::{KeyInfo, RotateKeyArgs};
use near_sdk::{env, near, AccountId, PanicOnDefault, Promise, PublicKey};

pub mod errors;
mod events;
pub mod state;
pub mod state_versions;
#[cfg(test)]
mod tests;
pub mod types;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AuthContract {
    state: AuthContractState,
}

#[near]
impl AuthContract {
    #[init]
    pub fn new() -> Self {
        Self {
            state: AuthContractState::new(),
        }
    }

    pub fn is_authorized(
        &mut self,
        account_id: AccountId,
        public_key: PublicKey,
        signatures: Option<Vec<Vec<u8>>>,
    ) -> bool {
        self.state
            .is_authorized(&account_id, &public_key, signatures)
    }

    #[handle_result]
    pub fn register_key(
        &mut self,
        account_id: AccountId,
        public_key: PublicKey,
        expiration_days: Option<u32>,
        is_multi_sig: bool,
        multi_sig_threshold: Option<u32>,
    ) -> Result<(), AuthError> {
        self.state.register_key(
            &env::predecessor_account_id(),
            &account_id,
            public_key,
            expiration_days,
            is_multi_sig,
            multi_sig_threshold,
        )
    }

    #[handle_result]
    pub fn remove_key(
        &mut self,
        account_id: AccountId,
        public_key: PublicKey,
    ) -> Result<(), AuthError> {
        self.state
            .remove_key(&env::predecessor_account_id(), &account_id, public_key)
    }

    #[handle_result]
    pub fn rotate_key(&mut self, args: RotateKeyArgs) -> Result<(), AuthError> {
        self.state.rotate_key(&env::predecessor_account_id(), args)
    }

    #[handle_result]
    pub fn remove_expired_keys(&mut self, account_id: AccountId) -> Result<(), AuthError> {
        self.state.remove_expired_keys(&account_id)
    }

    #[handle_result]
    pub fn remove_inactive_accounts(&mut self, account_id: AccountId) -> Result<(), AuthError> {
        self.state.remove_inactive_accounts(account_id)
    }

    pub fn get_inactive_accounts(&self, limit: u32, offset: u32) -> Vec<AccountId> {
        self.state.get_inactive_accounts(limit, offset)
    }

    pub fn get_key_info(&self, account_id: AccountId, public_key: PublicKey) -> Option<KeyInfo> {
        self.state.get_key_info(&account_id, &public_key)
    }

    pub fn get_keys(&self, account_id: AccountId, limit: u32, offset: u32) -> Vec<KeyInfo> {
        self.state.get_keys(&account_id, limit, offset)
    }

    #[handle_result]
    pub fn update_contract(&mut self) -> Result<Promise, AuthError> {
        self.state.update_contract()
    }

    #[handle_result]
    pub fn set_manager(&mut self, new_manager: AccountId) -> Result<(), AuthError> {
        self.state
            .set_manager(&env::predecessor_account_id(), new_manager)
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        Self {
            state: AuthContractState::migrate(),
        }
    }
}
