use crate::constants::{MAX_GAS_LIMIT, MIN_ALLOWANCE};
use crate::errors::RelayerError;
use crate::events::TxProcMeta;
use crate::events::{log_transaction_processed, log_transaction_rejected, LogTxProcessedArgs};
use crate::state::Relayer;
use crate::types::{Action, SignedDelegateAction};
use ed25519_dalek::{Signature as DalekSignature, Verifier};
use near_sdk::json_types::U128;
use near_sdk::{env, log, AccountId, Promise};
use near_sdk::{Allowance, NearToken};
use std::collections::HashMap;
use std::num::NonZeroU128;

impl Action {
    pub fn apply_action(
        &self,
        promise: Promise,
        sponsor_amount: u128,
    ) -> Result<Promise, RelayerError> {
        match self {
            Action::FunctionCall {
                method_name,
                args,
                deposit,
                gas,
                ..
            } => {
                if deposit.0 > sponsor_amount {
                    return Err(RelayerError::InsufficientBalance);
                }
                Ok(promise.function_call(
                    method_name.clone(),
                    args.clone(),
                    NearToken::from_yoctonear(deposit.0),
                    *gas,
                ))
            }
            Action::Transfer { deposit, .. } => {
                if deposit.0 > sponsor_amount {
                    return Err(RelayerError::InsufficientBalance);
                }
                Ok(promise.transfer(NearToken::from_yoctonear(deposit.0)))
            }
            Action::AddKey {
                public_key,
                access_key,
                ..
            } => {
                let min_allowance = MIN_ALLOWANCE;
                let actual_allowance = access_key.allowance.unwrap_or(U128(1)).0;
                crate::require!(
                    actual_allowance >= min_allowance,
                    RelayerError::InvalidInput(
                        "Allowance too low: must be at least 0.1 NEAR".to_string()
                    )
                );
                let allowance_value = NonZeroU128::new(actual_allowance).ok_or_else(|| {
                    RelayerError::InvalidInput("Allowance value must be non-zero".to_string())
                })?;
                Ok(promise.add_access_key_allowance(
                    public_key.clone(),
                    Allowance::Limited(allowance_value),
                    env::current_account_id(),
                    access_key.method_names.join(","),
                ))
            }
            Action::CreateAccount { deposit, .. } => {
                if deposit.0 > sponsor_amount {
                    return Err(RelayerError::InsufficientBalance);
                }
                Ok(promise
                    .create_account()
                    .transfer(NearToken::from_yoctonear(deposit.0)))
            }
            Action::Stake {
                stake, public_key, ..
            } => {
                if stake.0 > sponsor_amount {
                    return Err(RelayerError::InsufficientBalance);
                }
                let pk = near_sdk::PublicKey::from_parts(
                    near_sdk::CurveType::ED25519,
                    public_key.clone().into(),
                )
                .map_err(|_| RelayerError::InvalidInput("Invalid public key bytes".to_string()))?;
                Ok(promise.stake(NearToken::from_yoctonear(stake.0), pk))
            }
        }
    }
}

pub fn sponsor_transactions(
    relayer: &mut Relayer,
    signed_delegates: Vec<SignedDelegateAction>,
    sponsor_amounts: Vec<U128>,
    gas: u64,
    proxy_for: Option<AccountId>,
) -> Result<Promise, RelayerError> {
    let min_balance = relayer.min_balance;
    relayer.sponsorship_guard.enter()?;

    crate::require!(
        env::prepaid_gas().as_gas() >= gas,
        RelayerError::InvalidInput("Insufficient prepaid gas".to_string())
    );
    crate::require!(
        gas <= MAX_GAS_LIMIT,
        RelayerError::InvalidInput("Gas exceeds contract max_gas_limit".to_string())
    );
    crate::require!(
        signed_delegates.len() == sponsor_amounts.len(),
        RelayerError::InvalidInput("Mismatched input lengths".to_string())
    );
    crate::require!(
        !signed_delegates.is_empty(),
        RelayerError::InvalidInput("No transactions provided".to_string())
    );

    for (signed_delegate, _sponsor_amount) in signed_delegates.iter().zip(sponsor_amounts.iter()) {
        for action in &signed_delegate.delegate_action.actions {
            match action {
                Action::Transfer { deposit, .. } | Action::CreateAccount { deposit, .. } => {
                    if deposit.0 == 0 {
                        relayer.sponsorship_guard.exit();
                        return Err(RelayerError::InvalidInput(
                            "Deposit must be greater than zero".to_string(),
                        ));
                    }
                }
                Action::Stake { stake, .. } => {
                    if stake.0 == 0 {
                        relayer.sponsorship_guard.exit();
                        return Err(RelayerError::InvalidInput(
                            "Stake must be greater than zero".to_string(),
                        ));
                    }
                }
                Action::FunctionCall { .. } | Action::AddKey { .. } => {}
            }
        }
    }

    let platform_public_key = relayer.get_cached_platform_public_key()?;
    let mut nonce_updates = Vec::new();
    let mut receiver_actions: HashMap<AccountId, Vec<(usize, &Action, u128)>> = HashMap::new();

    for (meta_tx_idx, (signed_delegate, sponsor_amount)) in signed_delegates
        .iter()
        .zip(sponsor_amounts.iter())
        .enumerate()
    {
        let sender_id = &signed_delegate.delegate_action.sender_id;
        let action_type = if signed_delegate.delegate_action.actions.len() > 1 {
            "Mixed"
        } else {
            signed_delegate
                .delegate_action
                .actions
                .first()
                .map(|a| a.type_name())
                .unwrap_or("None")
        };
        let serialized_action = near_sdk::borsh::to_vec(&signed_delegate.delegate_action)
            .map_err(|_| RelayerError::SerializationError)?;
        let sig: DalekSignature = signed_delegate
            .signature
            .as_slice()
            .try_into()
            .map(DalekSignature::from_bytes)
            .map_err(|_| RelayerError::Unauthorized)?;
        if platform_public_key
            .verify(&serialized_action, &sig)
            .is_err()
        {
            log_transaction_rejected(
                relayer,
                sender_id,
                sponsor_amount.0.into(),
                "Invalid signature",
                env::block_timestamp_ms(),
                action_type,
                Some(TxProcMeta {
                    gas_used: Some(env::used_gas().as_gas()),
                    error_detail: Some("Signature verification failed"),
                }),
            );
            relayer.sponsorship_guard.exit();
            return Err(RelayerError::Unauthorized);
        }
        let nonce = signed_delegate.delegate_action.nonce;
        let stored_nonce = relayer.get_nonce(sender_id);
        if nonce != stored_nonce + 1 {
            let reason = if nonce <= stored_nonce {
                "Nonce too low or reused"
            } else {
                "Nonce must increment by 1"
            };
            log_transaction_rejected(
                relayer,
                sender_id,
                sponsor_amount.0.into(),
                reason,
                env::block_timestamp_ms(),
                action_type,
                Some(TxProcMeta {
                    gas_used: Some(env::used_gas().as_gas()),
                    error_detail: Some(reason),
                }),
            );
            relayer.sponsorship_guard.exit();
            return Err(RelayerError::InvalidInput(reason.to_string()));
        }
        let initial_storage = env::storage_usage();
        let storage_cost = env::storage_byte_cost().as_yoctonear() * initial_storage as u128;
        let available_balance = env::account_balance()
            .as_yoctonear()
            .saturating_sub(storage_cost);
        if available_balance < min_balance + sponsor_amount.0 {
            log_transaction_rejected(
                relayer,
                sender_id,
                sponsor_amount.0.into(),
                "Insufficient balance",
                env::block_timestamp_ms(),
                action_type,
                Some(TxProcMeta {
                    gas_used: Some(env::used_gas().as_gas()),
                    error_detail: Some("Insufficient balance"),
                }),
            );
            relayer.sponsorship_guard.exit();
            return Err(RelayerError::InsufficientBalance);
        }
        if signed_delegate.delegate_action.max_block_height < env::block_height() {
            log_transaction_rejected(
                relayer,
                sender_id,
                sponsor_amount.0.into(),
                "Transaction expired",
                env::block_timestamp_ms(),
                action_type,
                Some(TxProcMeta {
                    gas_used: Some(env::used_gas().as_gas()),
                    error_detail: Some("Transaction expired"),
                }),
            );
            relayer.sponsorship_guard.exit();
            return Err(RelayerError::TransactionExpired);
        }
        if let Some(proxy) = &proxy_for {
            if proxy.as_str().is_empty()
                || proxy.as_str().len() > 64
                || AccountId::validate(proxy.as_str()).is_err()
            {
                log_transaction_rejected(
                    relayer,
                    sender_id,
                    sponsor_amount.0.into(),
                    "Invalid proxy account",
                    env::block_timestamp_ms(),
                    action_type,
                    Some(TxProcMeta {
                        gas_used: Some(env::used_gas().as_gas()),
                        error_detail: Some("Invalid AccountId"),
                    }),
                );
                relayer.sponsorship_guard.exit();
                return Err(RelayerError::InvalidInput("Invalid AccountId".to_string()));
            }
        }
        let actions = &signed_delegate.delegate_action.actions;
        let total_required: u128 = actions
            .iter()
            .map(|action| match action {
                Action::FunctionCall { deposit, .. }
                | Action::Transfer { deposit, .. }
                | Action::CreateAccount { deposit, .. } => deposit.0,
                Action::Stake { stake, .. } => stake.0,
                _ => 0,
            })
            .sum();
        if sponsor_amount.0 < total_required {
            log_transaction_rejected(
                relayer,
                sender_id,
                sponsor_amount.0.into(),
                "Insufficient sponsor amount",
                env::block_timestamp_ms(),
                action_type,
                Some(TxProcMeta {
                    gas_used: Some(env::used_gas().as_gas()),
                    error_detail: Some("Sponsor amount too low"),
                }),
            );
            relayer.sponsorship_guard.exit();
            return Err(RelayerError::InsufficientBalance);
        }
        nonce_updates.push((sender_id.clone(), nonce));
        for action in actions {
            let receiver_id = match action {
                Action::FunctionCall { receiver_id, .. }
                | Action::Transfer { receiver_id, .. }
                | Action::AddKey { receiver_id, .. }
                | Action::CreateAccount { receiver_id, .. }
                | Action::Stake { receiver_id, .. } => receiver_id.clone(),
            };
            receiver_actions.entry(receiver_id).or_default().push((
                meta_tx_idx,
                action,
                sponsor_amount.0,
            ));
        }
    }

    relayer.batch_update_nonces(nonce_updates.into_iter().map(|(a, n)| (a, Some(n))));

    let mut batch_promises = Vec::new();
    for (receiver_id, actions) in receiver_actions {
        let mut batch_promise = Promise::new(receiver_id.clone());
        for (_meta_tx_idx, action, sponsor_amount) in actions {
            batch_promise = action.apply_action(batch_promise, sponsor_amount)?;
        }
        batch_promises.push(batch_promise);
    }

    for (signed_delegate, sponsor_amount) in signed_delegates.iter().zip(sponsor_amounts.iter()) {
        let sender_id = &signed_delegate.delegate_action.sender_id;
        let action_type = if signed_delegate.delegate_action.actions.len() > 1 {
            "Mixed"
        } else {
            signed_delegate
                .delegate_action
                .actions
                .first()
                .map(|a| a.type_name())
                .unwrap_or("None")
        };
        log_transaction_processed(LogTxProcessedArgs {
            relayer,
            sender_id,
            action_type,
            amount: sponsor_amount.0.into(),
            signature_verified: true,
            timestamp: env::block_timestamp_ms(),
            action_context: action_type,
            meta: Some(TxProcMeta {
                gas_used: Some(env::used_gas().as_gas()),
                error_detail: None,
            }),
        });
    }

    relayer.sponsorship_guard.exit();
    let mut batch_iter = batch_promises.into_iter();
    let batched = match batch_iter.next() {
        Some(first) => batch_iter.fold(first, |acc, p| acc.and(p)),
        None => Promise::new(env::current_account_id()),
    };

    log!("Gas allocated: {}", gas);
    Ok(batched)
}
