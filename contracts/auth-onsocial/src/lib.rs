use near_sdk::{near, env, AccountId, PublicKey, PanicOnDefault, Promise};
use crate::state::AuthContractState;
use crate::state_versions::{StateV010, StateV011};
use crate::types::KeyInfo;
use crate::errors::AuthError;
use crate::events::AuthEvent;

pub mod state;
pub mod state_versions;
pub mod types;
pub mod errors;
mod events;
#[cfg(test)]
mod tests;

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
        self.state.is_authorized(&account_id, &public_key, signatures)
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
        self.state.remove_key(&env::predecessor_account_id(), &account_id, public_key)
    }

    #[handle_result]
    pub fn rotate_key(
        &mut self,
        account_id: AccountId,
        old_public_key: PublicKey,
        new_public_key: PublicKey,
        expiration_days: Option<u32>,
        is_multi_sig: bool,
        multi_sig_threshold: Option<u32>,
    ) -> Result<(), AuthError> {
        self.state.rotate_key(
            &env::predecessor_account_id(),
            &account_id,
            old_public_key,
            new_public_key,
            expiration_days,
            is_multi_sig,
            multi_sig_threshold,
        )
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
        self.state.set_manager(&env::predecessor_account_id(), new_manager)
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        const CURRENT_VERSION: &str = "0.1.1";

        let state_bytes: Vec<u8> = env::state_read().unwrap_or_default();

        // Try current version (0.1.1)
        if let Ok(state) = near_sdk::borsh::from_slice::<AuthContractState>(&state_bytes) {
            if state.version == CURRENT_VERSION {
                env::log_str("State is already at latest version");
                return Self { state };
            }
        }

        // Try version 0.1.1
        if let Ok(old_state) = near_sdk::borsh::from_slice::<StateV011>(&state_bytes) {
            if old_state.version == "0.1.1" {
                env::log_str("Migrating from state version 0.1.1");
                let new_state = AuthContractState {
                    version: CURRENT_VERSION.to_string(),
                    keys: old_state.keys,
                    last_active_timestamps: old_state.last_active_timestamps,
                    registered_accounts: old_state.registered_accounts,
                    manager: old_state.manager,
                    max_keys_per_account: old_state.max_keys_per_account,
                };
                AuthEvent::StateMigrated {
                    old_version: "0.1.1".to_string(),
                    new_version: CURRENT_VERSION.to_string(),
                }.emit();
                return Self { state: new_state };
            }
        }

        // Try version 0.1.0
        if let Ok(old_state) = near_sdk::borsh::from_slice::<StateV010>(&state_bytes) {
            if old_state.version == "0.1.0" {
                env::log_str("Migrating from state version 0.1.0");
                let new_state = AuthContractState {
                    version: CURRENT_VERSION.to_string(),
                    keys: old_state.keys,
                    last_active_timestamps: old_state.last_active_timestamps,
                    registered_accounts: old_state.registered_accounts,
                    manager: old_state.manager,
                    max_keys_per_account: 100, // Default value
                };
                AuthEvent::StateMigrated {
                    old_version: "0.1.0".to_string(),
                    new_version: CURRENT_VERSION.to_string(),
                }.emit();
                return Self { state: new_state };
            }
        }

        env::log_str("No valid prior state found, initializing new state");
        Self {
            state: AuthContractState::new(),
        }
    }
}