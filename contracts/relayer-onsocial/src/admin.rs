use crate::errors::RelayerError;
use crate::events::{log_config_changed, log_funds_offloaded};
use crate::require_manager;
use crate::state::Relayer;
use ed25519_dalek::Signature as DalekSignature;
use ed25519_dalek::Verifier;
use near_sdk::{env, AccountId, NearToken, Promise};

pub fn set_manager(relayer: &mut Relayer, new_manager: AccountId) -> Result<(), RelayerError> {
    require_manager!(relayer, env::predecessor_account_id());
    AccountId::validate(new_manager.as_str())
        .map_err(|_| RelayerError::InvalidInput("Invalid AccountId".to_string()))?;
    if relayer.manager == new_manager {
        return Ok(());
    }
    let old_manager = relayer.manager.to_string();
    relayer.manager = new_manager;
    log_config_changed(
        relayer,
        "manager",
        &old_manager,
        relayer.manager.as_str(),
        &env::predecessor_account_id(),
        env::block_timestamp_ms(),
    );
    Ok(())
}

pub fn set_balance_limits(relayer: &mut Relayer, min: u128) -> Result<(), RelayerError> {
    require_manager!(relayer, env::predecessor_account_id());
    const MIN_MIN_BALANCE: u128 = 6_000_000_000_000_000_000_000_000;
    if min < MIN_MIN_BALANCE {
        return Err(RelayerError::InvalidInput(
            "min_balance cannot be less than 6 NEAR".to_string(),
        ));
    }
    if relayer.min_balance == min {
        return Ok(());
    }
    let old_min = relayer.min_balance;
    relayer.min_balance = min;
    log_config_changed(
        relayer,
        "min_balance",
        &old_min.to_string(),
        &min.to_string(),
        &env::predecessor_account_id(),
        env::block_timestamp_ms(),
    );
    Ok(())
}

pub fn offload_funds(
    relayer: &mut Relayer,
    amount: u128,
    signature: Vec<u8>,
    challenge: Vec<u8>,
) -> Result<Promise, RelayerError> {
    let recipient = relayer.offload_recipient.clone();
    crate::require!(
        amount > 0,
        RelayerError::InvalidInput("Amount must be greater than zero".to_string())
    );
    crate::require!(
        amount >= relayer.offload_threshold,
        RelayerError::InvalidInput("Amount is below offload threshold".to_string())
    );
    let available_balance = env::account_balance()
        .as_yoctonear()
        .saturating_sub(env::account_locked_balance().as_yoctonear());
    crate::require!(
        available_balance >= relayer.offload_threshold,
        RelayerError::InsufficientBalance
    );
    crate::require!(
        available_balance >= amount + relayer.min_balance,
        RelayerError::InsufficientBalance
    );
    let serialized = near_sdk::borsh::to_vec(&(amount, &recipient, &challenge))
        .map_err(|_| RelayerError::SerializationError)?;
    let pk = relayer.get_cached_platform_public_key()?;
    let sig: DalekSignature = signature
        .as_slice()
        .try_into()
        .map(DalekSignature::from_bytes)
        .map_err(|_| RelayerError::InvalidInput("Invalid signature format".to_string()))?;
    if pk.verify(&serialized, &sig).is_err() {
        return Err(RelayerError::Unauthorized);
    }
    log_funds_offloaded(relayer, amount, &recipient, env::block_timestamp_ms());
    Ok(Promise::new(recipient).transfer(NearToken::from_yoctonear(amount)))
}

pub fn pause(relayer: &mut Relayer, caller: &AccountId) -> Result<(), RelayerError> {
    require_manager!(relayer, *caller);
    if relayer.paused {
        return Ok(());
    }
    relayer.paused = true;
    let ts = env::block_timestamp_ms();
    crate::events::log_paused(relayer, caller, ts);
    Ok(())
}

pub fn unpause(relayer: &mut Relayer, caller: &AccountId) -> Result<(), RelayerError> {
    require_manager!(relayer, *caller);
    if !relayer.paused {
        return Ok(());
    }
    relayer.paused = false;
    let ts = env::block_timestamp_ms();
    crate::events::log_unpaused(relayer, caller, ts);
    Ok(())
}

pub fn set_platform_public_key(
    relayer: &mut Relayer,
    new_key: Vec<u8>,
    challenge: Vec<u8>,
    signature: Vec<u8>,
) -> Result<(), RelayerError> {
    require_manager!(relayer, env::predecessor_account_id());
    if new_key.len() != 32 {
        return Err(RelayerError::InvalidInput(
            "platform_public_key must be 32 bytes".to_string(),
        ));
    }
    let serialized = near_sdk::borsh::to_vec(&(new_key.clone(), &challenge))
        .map_err(|_| RelayerError::SerializationError)?;
    let pk = relayer.get_cached_platform_public_key()?;
    let sig: DalekSignature = signature
        .as_slice()
        .try_into()
        .map(DalekSignature::from_bytes)
        .map_err(|_| RelayerError::InvalidInput("Invalid signature format".to_string()))?;
    if pk.verify(&serialized, &sig).is_err() {
        return Err(RelayerError::Unauthorized);
    }
    if relayer.platform_public_key == new_key.as_slice() {
        return Ok(());
    }
    relayer.platform_public_key.copy_from_slice(&new_key);
    log_config_changed(
        relayer,
        "platform_public_key",
        "[old key omitted]",
        "[new key omitted]",
        &env::predecessor_account_id(),
        env::block_timestamp_ms(),
    );
    relayer.platform_key_cache.set(None);
    Ok(())
}
