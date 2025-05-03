use crate::errors::FtWrapperError;
use crate::events::FtWrapperEvent;
use crate::state::FtWrapperContractState;
use crate::types::{
    BridgeTransferArgs, FinalizeTransferArgs, FtTransferArgs, RequestChainSignatureArgs,
    StorageBalance, StorageBalanceBounds,
};
use near_sdk::json_types::U128;
use near_sdk::{env, ext_contract, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};

mod admin;
mod errors;
mod events;
mod ft;
mod state;
mod state_versions;
mod types;

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance;
    fn ft_balance_of(&self, account_id: AccountId) -> U128;
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance>;
    fn storage_balance_bounds(&self) -> StorageBalanceBounds;
}

#[ext_contract(ext_self)]
pub trait SelfCallback {
    fn handle_registration(&mut self, token: AccountId, account_id: AccountId) -> Promise;
    fn handle_storage_deposit(&mut self, token: AccountId, account_id: AccountId) -> Promise;
    fn handle_balance_check(&mut self, token: AccountId, account_id: AccountId) -> bool;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct FtWrapperContract {
    state: FtWrapperContractState,
}

#[near]
impl FtWrapperContract {
    #[init]
    pub fn new(manager: AccountId, relayer_contract: AccountId, storage_deposit: U128) -> Self {
        Self {
            state: FtWrapperContractState::new(manager, relayer_contract, storage_deposit),
        }
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        use near_sdk::borsh;
        use state_versions::{StateV010, StateV011};

        const CURRENT_VERSION: &str = "0.1.1";

        // Read raw state bytes, default to empty if none
        let state_bytes: Vec<u8> = env::state_read().unwrap_or_default();

        // Try current version (0.1.1)
        if let Ok(state) = borsh::from_slice::<FtWrapperContractState>(&state_bytes) {
            if state.version == CURRENT_VERSION {
                env::log_str("State is already at latest version");
                return Self { state };
            }
        }

        // Try version 0.1.1
        if let Ok(old_state) = borsh::from_slice::<StateV011>(&state_bytes) {
            if old_state.version == "0.1.1" {
                env::log_str("Migrating from state version 0.1.1");
                let new_state = FtWrapperContractState {
                    version: CURRENT_VERSION.to_string(),
                    manager: old_state.manager,
                    relayer_contract: old_state.relayer_contract,
                    supported_tokens: old_state.supported_tokens,
                    storage_deposit: old_state.storage_deposit,
                    cross_contract_gas: old_state.cross_contract_gas,
                    storage_balances: old_state.storage_balances,
                    min_balance: old_state.min_balance,
                    max_balance: old_state.max_balance,
                    fee_percentage: old_state.fee_percentage,
                };
                FtWrapperEvent::StateMigrated {
                    old_version: "0.1.1".to_string(),
                    new_version: CURRENT_VERSION.to_string(),
                }
                .emit();
                return Self { state: new_state };
            }
        }

        // Try version 0.1.0
        if let Ok(old_state) = borsh::from_slice::<StateV010>(&state_bytes) {
            if old_state.version == "0.1.0" {
                env::log_str("Migrating from state version 0.1.0");
                let new_state = FtWrapperContractState {
                    version: CURRENT_VERSION.to_string(),
                    manager: old_state.manager,
                    relayer_contract: old_state.relayer_contract,
                    supported_tokens: old_state.supported_tokens,
                    storage_deposit: old_state.storage_deposit,
                    cross_contract_gas: old_state.cross_contract_gas,
                    storage_balances: old_state.storage_balances,
                    min_balance: old_state.min_balance,
                    max_balance: old_state.max_balance,
                    fee_percentage: 0,
                };
                FtWrapperEvent::StateMigrated {
                    old_version: "0.1.0".to_string(),
                    new_version: CURRENT_VERSION.to_string(),
                }
                .emit();
                return Self { state: new_state };
            }
        }

        env::log_str("No valid prior state found, initializing new state");
        Self {
            state: FtWrapperContractState::new(
                env::current_account_id(),
                env::current_account_id(),
                U128(1_250_000_000_000_000_000_000),
            ),
        }
    }

    #[payable]
    #[handle_result]
    pub fn deposit(&mut self) -> Result<(), FtWrapperError> {
        let caller = env::predecessor_account_id();
        if !self.state.is_manager(&caller) {
            return Err(FtWrapperError::Unauthorized);
        }
        let deposit = env::attached_deposit().as_yoctonear();
        let balance = env::account_balance().as_yoctonear() + deposit;
        if balance > self.state.max_balance {
            let excess = balance - self.state.max_balance;
            Promise::new(caller).transfer(NearToken::from_yoctonear(excess));
        }
        Ok(())
    }

    pub fn ft_transfer(&mut self, args: FtTransferArgs) -> Promise {
        self.ft_transfer_internal(args).expect("FT transfer failed")
    }

    pub fn request_chain_signature(&mut self, args: RequestChainSignatureArgs) -> Promise {
        self.request_chain_signature_internal(args)
            .expect("Chain signature request failed")
    }

    pub fn bridge_transfer(&mut self, args: BridgeTransferArgs) -> Promise {
        self.bridge_transfer_internal(args)
            .expect("Bridge transfer failed")
    }

    pub fn finalize_transfer(&mut self, args: FinalizeTransferArgs) -> Promise {
        self.finalize_transfer_internal(args)
            .expect("Finalize transfer failed")
    }

    pub fn storage_deposit(
        &mut self,
        token: AccountId,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.storage_deposit_internal(token, account_id, registration_only)
            .expect("Storage deposit failed")
    }

    #[payable]
    pub fn storage_withdraw(&mut self, token: AccountId, amount: Option<U128>) -> StorageBalance {
        self.storage_withdraw_internal(token, amount)
            .expect("Storage withdraw failed")
    }

    pub fn storage_balance_of(&self, token: AccountId, account_id: AccountId) -> Promise {
        self.storage_balance_of_internal(token, account_id)
    }

    pub fn storage_balance_bounds(&self, token: AccountId) -> Promise {
        self.storage_balance_bounds_internal(token)
    }

    #[payable]
    pub fn storage_unregister(&mut self, token: AccountId, force: Option<bool>) -> bool {
        self.storage_unregister_internal(token, force)
            .expect("Storage unregister failed")
    }

    #[handle_result]
    pub fn add_supported_token(&mut self, token: AccountId) -> Result<(), FtWrapperError> {
        self.add_supported_token_internal(token)
    }

    #[handle_result]
    pub fn remove_supported_token(&mut self, token: AccountId) -> Result<(), FtWrapperError> {
        self.remove_supported_token_internal(token)
    }

    #[handle_result]
    pub fn set_cross_contract_gas(&mut self, gas_tgas: u64) -> Result<(), FtWrapperError> {
        self.set_cross_contract_gas_internal(gas_tgas)
    }

    #[handle_result]
    pub fn set_storage_deposit(&mut self, storage_deposit: U128) -> Result<(), FtWrapperError> {
        self.set_storage_deposit_internal(storage_deposit)
    }

    #[handle_result]
    pub fn set_manager(&mut self, new_manager: AccountId) -> Result<(), FtWrapperError> {
        self.state.set_manager(new_manager.clone())?;
        FtWrapperEvent::ManagerUpdated { new_manager }.emit();
        Ok(())
    }

    pub fn get_supported_tokens(&self) -> Vec<AccountId> {
        self.state.supported_tokens.to_vec()
    }

    pub fn ft_balance_of(&self, token: AccountId, account_id: AccountId) -> Promise {
        self.ft_balance_of_internal(token, account_id)
    }

    #[handle_result]
    pub fn update_contract(&mut self) -> Result<Promise, FtWrapperError> {
        let caller = env::predecessor_account_id();
        if !self.state.is_manager(&caller) {
            return Err(FtWrapperError::Unauthorized);
        }
        let code = env::input().ok_or(FtWrapperError::Unauthorized)?.to_vec();
        FtWrapperEvent::ContractUpgraded {
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

    #[private]
    pub fn handle_registration(&mut self, token: AccountId, account_id: AccountId) -> Promise {
        self.handle_registration_internal(token, account_id)
    }

    #[private]
    pub fn handle_storage_deposit(&mut self, token: AccountId, account_id: AccountId) -> Promise {
        self.handle_storage_deposit_internal(token, account_id)
    }

    #[private]
    pub fn handle_balance_check(
        &mut self,
        token: AccountId,
        account_id: AccountId,
        balance: U128,
    ) -> bool {
        crate::ft::handle_balance_check(&mut self.state, token, account_id, balance)
    }

    fn ft_transfer_internal(&mut self, args: FtTransferArgs) -> Result<Promise, FtWrapperError> {
        crate::ft::ft_transfer(&mut self.state, args)
    }

    fn request_chain_signature_internal(
        &mut self,
        args: RequestChainSignatureArgs,
    ) -> Result<Promise, FtWrapperError> {
        crate::ft::request_chain_signature(&mut self.state, args)
    }

    fn bridge_transfer_internal(
        &mut self,
        args: BridgeTransferArgs,
    ) -> Result<Promise, FtWrapperError> {
        crate::ft::bridge_transfer(&mut self.state, args)
    }

    fn finalize_transfer_internal(
        &mut self,
        args: FinalizeTransferArgs,
    ) -> Result<Promise, FtWrapperError> {
        crate::ft::finalize_transfer(&mut self.state, args)
    }

    fn storage_deposit_internal(
        &mut self,
        token: AccountId,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> Result<StorageBalance, FtWrapperError> {
        crate::ft::storage_deposit(&mut self.state, token, account_id, registration_only)
    }

    fn storage_withdraw_internal(
        &mut self,
        token: AccountId,
        amount: Option<U128>,
    ) -> Result<StorageBalance, FtWrapperError> {
        crate::ft::storage_withdraw(&mut self.state, token, amount)
    }

    fn storage_balance_of_internal(&self, token: AccountId, account_id: AccountId) -> Promise {
        crate::ft::storage_balance_of(&self.state, token, account_id)
    }

    fn storage_balance_bounds_internal(&self, token: AccountId) -> Promise {
        crate::ft::storage_balance_bounds(&self.state, token)
    }

    fn storage_unregister_internal(
        &mut self,
        token: AccountId,
        force: Option<bool>,
    ) -> Result<bool, FtWrapperError> {
        crate::ft::storage_unregister(&mut self.state, token, force)
    }

    fn add_supported_token_internal(&mut self, token: AccountId) -> Result<(), FtWrapperError> {
        crate::admin::add_supported_token(&mut self.state, token)
    }

    fn remove_supported_token_internal(&mut self, token: AccountId) -> Result<(), FtWrapperError> {
        crate::admin::remove_supported_token(&mut self.state, token)
    }

    fn set_cross_contract_gas_internal(&mut self, gas_tgas: u64) -> Result<(), FtWrapperError> {
        crate::admin::set_cross_contract_gas(&mut self.state, gas_tgas)
    }

    fn set_storage_deposit_internal(
        &mut self,
        storage_deposit: U128,
    ) -> Result<(), FtWrapperError> {
        crate::admin::set_storage_deposit(&mut self.state, storage_deposit)
    }

    fn ft_balance_of_internal(&self, token: AccountId, account_id: AccountId) -> Promise {
        crate::ft::ft_balance_of(&self.state, token, account_id)
    }

    fn handle_registration_internal(&mut self, token: AccountId, account_id: AccountId) -> Promise {
        crate::ft::handle_registration(&mut self.state, token, account_id)
    }

    fn handle_storage_deposit_internal(
        &mut self,
        token: AccountId,
        account_id: AccountId,
    ) -> Promise {
        crate::ft::handle_storage_deposit(&mut self.state, token, account_id)
    }
}

#[cfg(test)]
mod tests;
