use near_sdk::{env, Promise, AccountId, PublicKey, NearToken, Gas};
use crate::{state::Relayer, ext_auth};
use crate::errors::RelayerError;
use crate::events::RelayerEvent;
use crate::types::SignedDelegateAction;
use crate::relay;
use near_sdk::borsh::to_vec;

pub fn sponsor_account_with_registrar(
    relayer: &mut Relayer,
    new_account_id: AccountId,
    public_key: PublicKey,
    is_multi_sig: bool,
    multi_sig_threshold: Option<u32>,
) -> Result<Promise, RelayerError> {
    let balance = env::account_balance();
    if balance.as_yoctonear() < relayer.min_balance {
        RelayerEvent::LowBalance { balance: balance.as_yoctonear() }.emit();
        return Err(RelayerError::InsufficientBalance);
    }
    let is_mainnet = env::current_account_id().to_string().ends_with(".near");
    let registrar = if is_mainnet {
        "registrar.near".parse().unwrap()
    } else {
        "testnet".parse().unwrap()
    };
    let account_id_str = new_account_id.to_string();
    let account_name = account_id_str
        .split('.')
        .next()
        .ok_or(RelayerError::InvalidAccountId)?;
    if is_mainnet {
        let len = account_name.len();
        if len < 3 || len > 16 {
            return Err(RelayerError::InvalidAccountId);
        }
    } else if !account_id_str.ends_with(".testnet") {
        return Err(RelayerError::InvalidAccountId);
    }
    let min_funding = 50_000_000_000_000_000_000_000; // 0.05 NEAR
    let funding_amount = relayer.sponsor_amount.max(min_funding);
    let creation_deposit = if is_mainnet {
        funding_amount / 10
    } else {
        1_820_000_000_000_000_000_000 // 0.00182 NEAR
    };
    let args = to_vec(&(
        new_account_id.to_string(),
        public_key.clone()
    )).map_err(|_| RelayerError::InvalidAccountId)?;
    let promise = Promise::new(registrar)
        .function_call(
            "create_account".to_string(),
            args,
            NearToken::from_yoctonear(creation_deposit),
            Gas::from_tgas(relayer.cross_contract_gas),
        )
        .then(
            Promise::new(new_account_id.clone())
                .add_full_access_key(public_key.clone())
                .transfer(NearToken::from_yoctonear(funding_amount)),
        )
        .then(
            ext_auth::ext(relayer.auth_contract.clone())
                .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
                .register_key(new_account_id.clone(), public_key, Some(30), is_multi_sig, multi_sig_threshold)
        );
    RelayerEvent::AccountSponsored { account_id: new_account_id.clone() }.emit();
    Ok(promise)
}

pub fn sponsor_account_signed(
    relayer: &mut Relayer,
    signed_delegate: SignedDelegateAction,
) -> Result<Promise, RelayerError> {
    relay::relay_meta_transaction(relayer, signed_delegate)
}