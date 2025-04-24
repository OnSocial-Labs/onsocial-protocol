use near_sdk::{env, NearToken, Promise};
use crate::state::Relayer;
use crate::errors::RelayerError;

pub fn deposit(relayer: &mut Relayer) -> Result<(), RelayerError> {
    let deposit = env::attached_deposit().as_yoctonear();
    let balance = env::account_balance().as_yoctonear() + deposit;
    if balance > relayer.max_balance {
        let excess = balance - relayer.max_balance;
        Promise::new(relayer.offload_recipient.clone())
            .transfer(NearToken::from_yoctonear(excess));
    }
    Ok(())
}