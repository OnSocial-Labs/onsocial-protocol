use crate::errors::FtWrapperError;
use crate::events::FtWrapperEvent;
use crate::state::FtWrapperContractState;
use near_sdk::json_types::U128;
use near_sdk::{env, AccountId};

pub fn add_supported_token(
    state: &mut FtWrapperContractState,
    token: AccountId,
) -> Result<(), FtWrapperError> {
    let caller = env::predecessor_account_id();
    if !state.is_manager(&caller) {
        return Err(FtWrapperError::Unauthorized);
    }
    if state.supported_tokens.contains(&token) {
        return Err(FtWrapperError::TokenNotSupported); // Token already exists
    }
    state.supported_tokens.push(token.clone());
    FtWrapperEvent::TokenAdded { token }.emit();
    Ok(())
}

pub fn remove_supported_token(
    state: &mut FtWrapperContractState,
    token: AccountId,
) -> Result<(), FtWrapperError> {
    let caller = env::predecessor_account_id();
    if !state.is_manager(&caller) {
        return Err(FtWrapperError::Unauthorized);
    }
    if let Some(index) = state.supported_tokens.iter().position(|t| t == &token) {
        state.supported_tokens.remove(index);
        FtWrapperEvent::TokenRemoved { token }.emit();
        Ok(())
    } else {
        Err(FtWrapperError::TokenNotSupported)
    }
}

pub fn set_cross_contract_gas(
    state: &mut FtWrapperContractState,
    gas_tgas: u64,
) -> Result<(), FtWrapperError> {
    let caller = env::predecessor_account_id();
    if !state.is_manager(&caller) {
        return Err(FtWrapperError::Unauthorized);
    }
    state.cross_contract_gas = gas_tgas * 1_000_000_000_000; // Convert TGas to Gas
    FtWrapperEvent::GasUpdated { gas_tgas }.emit();
    Ok(())
}

pub fn set_storage_deposit(
    state: &mut FtWrapperContractState,
    storage_deposit: U128,
) -> Result<(), FtWrapperError> {
    let caller = env::predecessor_account_id();
    if !state.is_manager(&caller) {
        return Err(FtWrapperError::Unauthorized);
    }
    if storage_deposit.0 < 1_250_000_000_000_000_000_000 {
        // Minimum 0.00125 NEAR
        return Err(FtWrapperError::AmountTooLow);
    }
    state.storage_deposit = storage_deposit;
    FtWrapperEvent::StorageDepositUpdated { storage_deposit }.emit();
    Ok(())
}
