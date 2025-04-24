use near_sdk::{env, AccountId, PublicKey, Gas};
use crate::{ext_auth, state::Relayer};
use crate::errors::RelayerError;
use crate::events::RelayerEvent;

pub fn register_existing_account(
    relayer: &mut Relayer,
    account_id: AccountId,
    public_key: PublicKey,
    expiration_days: Option<u32>,
    is_multi_sig: bool,
    multi_sig_threshold: Option<u32>,
) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if caller != account_id {
        return Err(RelayerError::Unauthorized);
    }
    if public_key.as_bytes().len() != 33 || public_key.as_bytes()[0] != 0 {
        return Err(RelayerError::InvalidSignature);
    }
    ext_auth::ext(relayer.auth_contract.clone())
        .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
        .register_key(
            account_id.clone(),
            public_key.clone(),
            expiration_days,
            is_multi_sig,
            multi_sig_threshold,
        );
    let key_hash = hex::encode(env::sha256(&public_key.as_bytes()));
    RelayerEvent::AuthAdded { auth_account: account_id, key_hash }.emit();
    Ok(())
}

pub fn remove_key(relayer: &mut Relayer, account_id: AccountId, public_key: PublicKey) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if caller != account_id {
        return Err(RelayerError::Unauthorized);
    }
    ext_auth::ext(relayer.auth_contract.clone())
        .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
        .remove_key(account_id.clone(), public_key.clone());
    let key_hash = hex::encode(env::sha256(&public_key.as_bytes()));
    RelayerEvent::AuthRemoved { auth_account: account_id, key_hash }.emit();
    Ok(())
}

pub fn set_cross_contract_gas(relayer: &mut Relayer, new_gas: u64) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    if new_gas < 15_000_000_000_000 || new_gas > 100_000_000_000_000 {
        return Err(RelayerError::AmountTooLow);
    }
    relayer.cross_contract_gas = new_gas;
    RelayerEvent::CrossContractGasUpdated { new_gas }.emit();
    let remaining_gas = env::prepaid_gas().as_tgas().saturating_sub(env::used_gas().as_tgas());
    env::log_str(&format!(
        "set_cross_contract_gas: prepaid={} TGas, used={} TGas, remaining={} TGas",
        env::prepaid_gas().as_tgas(),
        env::used_gas().as_tgas(),
        remaining_gas
    ));
    Ok(())
}

pub fn set_migration_gas(relayer: &mut Relayer, new_gas: u64) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    if new_gas < 15_000_000_000_000 || new_gas > 200_000_000_000_000 {
        return Err(RelayerError::AmountTooLow);
    }
    relayer.migration_gas = new_gas;
    RelayerEvent::MigrationGasUpdated { new_gas }.emit();
    let remaining_gas = env::prepaid_gas().as_tgas().saturating_sub(env::used_gas().as_tgas());
    env::log_str(&format!(
        "set_migration_gas: prepaid={} TGas, used={} TGas, remaining={} TGas",
        env::prepaid_gas().as_tgas(),
        env::used_gas().as_tgas(),
        remaining_gas
    ));
    Ok(())
}

pub fn set_omni_locker_contract(relayer: &mut Relayer, new_locker_contract: AccountId) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    relayer.omni_locker_contract.set(Some(new_locker_contract.clone()));
    RelayerEvent::OmniLockerContractUpdated { new_locker_contract }.emit();
    Ok(())
}

pub fn set_offload_recipient(relayer: &mut Relayer, new_recipient: AccountId) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    relayer.offload_recipient = new_recipient.clone();
    RelayerEvent::OffloadRecipientUpdated { new_recipient }.emit();
    Ok(())
}

pub fn set_manager(relayer: &mut Relayer, new_manager: AccountId) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    relayer.manager = new_manager.clone();
    RelayerEvent::ManagerChanged { old_manager: caller, new_manager, timestamp: env::block_timestamp_ms() }.emit();
    Ok(())
}

pub fn set_sponsor_amount(relayer: &mut Relayer, new_amount: u128) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    if new_amount < 10_000_000_000_000_000_000_000 {
        return Err(RelayerError::AmountTooLow);
    }
    relayer.sponsor_amount = new_amount;
    RelayerEvent::SponsorAmountUpdated { new_amount }.emit();
    Ok(())
}

pub fn set_sponsor_gas(relayer: &mut Relayer, new_gas: u64) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    if new_gas < 50_000_000_000_000 || new_gas > 300_000_000_000_000 {
        return Err(RelayerError::AmountTooLow);
    }
    relayer.sponsor_gas = new_gas;
    RelayerEvent::SponsorGasUpdated { new_gas }.emit();
    Ok(())
}

pub fn set_chunk_size(relayer: &mut Relayer, new_size: usize) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    if new_size < 1 || new_size > 5 {
        return Err(RelayerError::AmountTooLow);
    }
    relayer.chunk_size = new_size;
    RelayerEvent::ChunkSizeUpdated { new_size }.emit();
    let remaining_gas = env::prepaid_gas().as_tgas().saturating_sub(env::used_gas().as_tgas());
    env::log_str(&format!(
        "set_chunk_size: prepaid={} TGas, used={} TGas, remaining={} TGas",
        env::prepaid_gas().as_tgas(),
        env::used_gas().as_tgas(),
        remaining_gas
    ));
    Ok(())
}

pub fn add_chain_mpc_mapping(relayer: &mut Relayer, chain: String, mpc_contract: AccountId) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    relayer.chain_mpc_mapping.insert(chain.clone(), mpc_contract.clone());
    RelayerEvent::ChainMpcMappingAdded { chain, mpc_contract }.emit();
    Ok(())
}

pub fn remove_chain_mpc_mapping(relayer: &mut Relayer, chain: String) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    relayer.chain_mpc_mapping.remove(&chain);
    RelayerEvent::ChainMpcMappingRemoved { chain }.emit();
    Ok(())
}

pub fn set_auth_contract(relayer: &mut Relayer, new_auth_contract: AccountId) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    relayer.auth_contract = new_auth_contract.clone();
    RelayerEvent::AuthContractUpdated { new_auth_contract }.emit();
    Ok(())
}

pub fn set_ft_wrapper_contract(relayer: &mut Relayer, new_ft_wrapper_contract: AccountId) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    relayer.ft_wrapper_contract = new_ft_wrapper_contract.clone();
    RelayerEvent::FtWrapperContractUpdated { new_ft_wrapper_contract }.emit();
    Ok(())
}

pub fn set_base_fee(relayer: &mut Relayer, new_fee: u128, signatures: Option<Vec<Vec<u8>>>) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    // Allow zero fee without signatures for flexibility
    if new_fee > 0 {
        if let Some(sigs) = signatures {
            if sigs.len() < 2 {
                return Err(RelayerError::InsufficientSignatures);
            }
        } else {
            return Err(RelayerError::InsufficientSignatures);
        }
        let min_fee = 100_000_000_000_000_000_000; // 0.0001 NEAR
        if new_fee < min_fee {
            return Err(RelayerError::FeeTooLow);
        }
    }
    relayer.base_fee = new_fee;
    RelayerEvent::BaseFeeUpdated { new_fee }.emit();
    Ok(())
}

pub fn set_min_balance(relayer: &mut Relayer, new_min: u128) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    if new_min > relayer.max_balance {
        return Err(RelayerError::AmountTooLow);
    }
    relayer.min_balance = new_min;
    RelayerEvent::MinBalanceUpdated { new_min }.emit();
    Ok(())
}

pub fn set_max_balance(relayer: &mut Relayer, new_max: u128) -> Result<(), RelayerError> {
    let caller = env::predecessor_account_id();
    if !relayer.is_manager(&caller) {
        return Err(RelayerError::Unauthorized);
    }
    if new_max < relayer.min_balance {
        return Err(RelayerError::AmountTooLow);
    }
    relayer.max_balance = new_max;
    RelayerEvent::MaxBalanceUpdated { new_max }.emit();
    Ok(())
}