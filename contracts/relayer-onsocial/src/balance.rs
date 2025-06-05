use crate::constants::MIN_ALLOWANCE;
use crate::errors::RelayerError;
use crate::events::log_deposit_event;
use crate::state::Relayer;
use near_sdk::env;
use near_sdk::json_types::U128;

pub fn deposit(relayer: &mut Relayer) -> Result<(), RelayerError> {
    let predecessor = env::predecessor_account_id();
    relayer.deposit_guard.enter()?;

    let deposit_amount = env::attached_deposit().as_yoctonear();
    if deposit_amount < MIN_ALLOWANCE {
        relayer.deposit_guard.exit();
        return Err(RelayerError::InvalidInput(
            "Deposit amount must be at least 0.1 NEAR".to_string(),
        ));
    }

    log_deposit_event(
        relayer,
        "received",
        &predecessor,
        U128(deposit_amount),
        None,
        env::block_timestamp_ms(),
    );

    relayer.deposit_guard.exit();
    Ok(())
}
