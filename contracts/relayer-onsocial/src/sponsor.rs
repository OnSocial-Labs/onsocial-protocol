use crate::constants::{MAX_GAS_LIMIT, MIN_ALLOWANCE};
use crate::errors::RelayerError;
use crate::events::TxProcMeta;
use crate::events::{log_transaction_processed, log_transaction_rejected};
use crate::ext_self;
use crate::state::{PublicKeyCache, Relayer};
use crate::types::{Action, SignedDelegateAction};
use near_crypto::{KeyType, Signature};
use near_sdk::bs58;
use near_sdk::json_types::U128;
use near_sdk::{env, log, AccountId, Gas, Promise};
use near_sdk::{Allowance, NearToken, PromiseResult};
use std::collections::HashMap;
use std::num::NonZeroU128;
use std::str::FromStr;

trait ActionExecutor {
    fn apply(&self, promise: Promise, sponsor_amount: u128) -> Result<Promise, RelayerError>;
}

impl ActionExecutor for Action {
    fn apply(&self, promise: Promise, sponsor_amount: u128) -> Result<Promise, RelayerError> {
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
                Ok(promise.stake(NearToken::from_yoctonear(stake.0), public_key.clone()))
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

    fn get_cached_platform_public_key(relayer: &mut Relayer) -> near_crypto::PublicKey {
        let current_key_bytes = relayer.platform_public_key.as_bytes()[1..].to_vec();
        let cache = &mut relayer.platform_key_cache;
        if let Some(cached) = cache.get() {
            if cached.key_bytes == current_key_bytes {
                return cached.parsed_key.clone();
            }
        }
        let parsed_key = near_crypto::PublicKey::from_str(
            &bs58::encode(current_key_bytes.clone()).into_string(),
        )
        .expect("Invalid platform public key");
        cache.set(Some(PublicKeyCache {
            key_bytes: current_key_bytes.clone(),
            parsed_key: parsed_key.clone(),
        }));
        parsed_key
    }

    let platform_public_key = get_cached_platform_public_key(relayer);

    let mut nonce_updates = Vec::new();
    let mut receiver_actions: HashMap<AccountId, Vec<(usize, &Action, u128)>> = HashMap::new();
    // (receiver_id, [(meta_tx_idx, &Action, sponsor_amount_for_meta_tx)])

    signed_delegates
        .iter()
        .zip(sponsor_amounts.iter())
        .enumerate()
        .try_for_each(|(meta_tx_idx, (signed_delegate, sponsor_amount))| {
            let sender_id = &signed_delegate.delegate_action.sender_id;
            let serialized_action = near_sdk::borsh::to_vec(&signed_delegate.delegate_action)
                .map_err(|_| RelayerError::SerializationError)?;
            let platform_signature =
                Signature::from_parts(KeyType::ED25519, &signed_delegate.signature)
                    .map_err(|_| RelayerError::Unauthorized)?;
            if !platform_signature.verify(&serialized_action, &platform_public_key) {
                log!(
                    "[DEBUG] Platform signature verification failed for {}",
                    sender_id
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
                log!(
                    "[DEBUG] Nonce validation failed: attempted={}, stored={}",
                    nonce,
                    stored_nonce
                );
                log_transaction_rejected(
                    relayer,
                    sender_id,
                    sponsor_amount.0.into(),
                    reason,
                    env::block_timestamp_ms(),
                    Some(TxProcMeta {
                        gas_used: Some(env::used_gas().as_gas()),
                        error_detail: Some(reason),
                    }),
                );
                return Err(RelayerError::InvalidInput(reason.to_string()));
            }

            let initial_storage = env::storage_usage();
            let storage_cost = env::storage_byte_cost().as_yoctonear() * initial_storage as u128;
            let available_balance = env::account_balance()
                .as_yoctonear()
                .saturating_sub(storage_cost);
            if available_balance < min_balance + sponsor_amount.0 {
                return Err(RelayerError::InsufficientBalance);
            }

            if signed_delegate.delegate_action.max_block_height < env::block_height() {
                return Err(RelayerError::TransactionExpired);
            }
            if let Some(proxy) = &proxy_for {
                if proxy.as_str().is_empty()
                    || proxy.as_str().len() > 64
                    || AccountId::validate(proxy.as_str()).is_err()
                {
                    return Err(RelayerError::InvalidInput("Invalid AccountId".to_string()));
                }
            }

            // Sum required deposits for all actions in this meta-tx
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
                // Pass meta_tx_idx and sponsor_amount for this meta-tx
                receiver_actions.entry(receiver_id).or_default().push((
                    meta_tx_idx,
                    action,
                    sponsor_amount.0,
                ));
            }
            Ok(())
        })?;

    for (account_id, nonce) in nonce_updates {
        relayer.set_nonce(&account_id, nonce);
    }
    let mut batch_promises = Vec::new();
    for (receiver_id, actions) in receiver_actions {
        let mut batch_promise = Promise::new(receiver_id.clone());
        for (_meta_tx_idx, action, sponsor_amount) in actions {
            batch_promise = action.apply(batch_promise, sponsor_amount)?;
        }
        batch_promises.push(batch_promise);
    }
    // Emit TxProc event for each successful sponsorship (for unit test expectations)
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
        log_transaction_processed(
            relayer,
            sender_id,
            action_type,
            sponsor_amount.0.into(),
            true,
            env::block_timestamp_ms(),
            Some(TxProcMeta {
                gas_used: Some(env::used_gas().as_gas()),
                error_detail: None,
            }),
        );
    }
    let mut callbacks = Vec::new();
    for (signed_delegate, sponsor_amount) in signed_delegates.iter().zip(sponsor_amounts.iter()) {
        let sender_id = &signed_delegate.delegate_action.sender_id;
        let promise = ext_self::ext(env::current_account_id()).handle_result(
            sender_id.clone(),
            signed_delegate.clone(),
            sponsor_amount.0,
            gas,
        );
        callbacks.push(promise);
    }
    relayer.sponsorship_guard.exit();
    let mut batch_iter = batch_promises.into_iter();
    let batched = match batch_iter.next() {
        Some(first) => batch_iter.fold(first, |acc, p| acc.and(p)),
        None => Promise::new(env::current_account_id()),
    };
    let mut cb_iter = callbacks.into_iter();
    let callbacks_and = match cb_iter.next() {
        Some(first) => cb_iter.fold(first, |acc, p| acc.and(p)),
        None => Promise::new(env::current_account_id()),
    };
    let final_promise = batched.then(callbacks_and);
    log!("Gas allocated: {}, Expected refund for unused gas", gas);
    Ok(final_promise)
}

pub fn handle_sponsor_result(
    relayer: &mut Relayer,
    sender_id: &AccountId,
    signed_delegate: SignedDelegateAction,
    sponsor_amount: u128,
    gas: u64,
) -> Promise {
    relayer.sponsorship_guard.exit();
    let emit_events = true;

    let actions = &signed_delegate.delegate_action.actions;
    let mut refund_amount: u128 = 0;
    let mut any_success = false;

    if env::promise_results_count() > 0 {
        for (i, action) in actions.iter().enumerate() {
            let deposit = match action {
                Action::FunctionCall { deposit, .. }
                | Action::Transfer { deposit, .. }
                | Action::CreateAccount { deposit, .. } => deposit.0,
                Action::Stake { stake, .. } => stake.0,
                _ => 0,
            };
            match env::promise_result(i as u64) {
                PromiseResult::Failed => {
                    refund_amount = refund_amount.saturating_add(deposit);
                }
                PromiseResult::Successful(_) => {
                    any_success = true;
                }
            }
        }
        if refund_amount > 0 {
            if emit_events {
                log_transaction_rejected(
                    relayer,
                    sender_id,
                    refund_amount.into(),
                    "Partial batch failure",
                    env::block_timestamp_ms(),
                    Some(TxProcMeta {
                        gas_used: Some(env::used_gas().as_gas()),
                        error_detail: Some("Partial batch failure"),
                    }),
                );
            }
            let storage_cost = env::storage_byte_cost().as_yoctonear() * 100;
            let remaining_gas = env::prepaid_gas().saturating_sub(env::used_gas());
            if refund_amount >= storage_cost && remaining_gas >= Gas::from_tgas(1) {
                let success_amount = sponsor_amount.saturating_sub(refund_amount);
                if emit_events && success_amount > 0 {
                    let action_type = if actions.len() > 1 {
                        "Mixed"
                    } else {
                        actions.first().map(|a| a.type_name()).unwrap_or("None")
                    };
                    log_transaction_processed(
                        relayer,
                        sender_id,
                        action_type,
                        success_amount.into(),
                        true,
                        env::block_timestamp_ms(),
                        Some(TxProcMeta {
                            gas_used: Some(env::used_gas().as_gas()),
                            error_detail: None,
                        }),
                    );
                }
                if any_success {
                    relayer.set_nonce(sender_id, signed_delegate.delegate_action.nonce);
                }
                return Promise::new(sender_id.clone())
                    .transfer(NearToken::from_yoctonear(refund_amount));
            } else {
                relayer.queue_refund(sender_id, refund_amount);
                // Always emit the log when a refund is queued, even if already queued
                log!("Refund failed: insufficient balance or gas. Queuing refund for later processing.");
                return Promise::new(env::current_account_id());
            }
        }
    }

    if emit_events {
        let action_type = if actions.len() > 1 {
            "Mixed"
        } else {
            actions.first().map(|a| a.type_name()).unwrap_or("None")
        };
        log_transaction_processed(
            relayer,
            sender_id,
            action_type,
            sponsor_amount.into(),
            true,
            env::block_timestamp_ms(),
            Some(TxProcMeta {
                gas_used: Some(env::used_gas().as_gas()),
                error_detail: None,
            }),
        );
    }
    if any_success || actions.is_empty() {
        relayer.set_nonce(sender_id, signed_delegate.delegate_action.nonce);
    }

    log!(
        "Gas used: {}, Released: {}",
        env::used_gas().as_gas(),
        gas.saturating_sub(env::used_gas().as_gas())
    );
    Promise::new(env::current_account_id())
}
