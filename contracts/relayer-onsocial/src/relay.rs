use near_sdk::{Promise, Allowance, NearToken, env, AccountId, Gas};
use near_sdk::borsh::{self, BorshSerialize, BorshDeserialize};
use core::num::NonZeroU128;
use crate::{ext_self, ext_auth, ext_ft_wrapper, ext_omi_locker, ext_mpc, state::Relayer, types::{SignedDelegateAction, Action, SignatureScheme}, errors::RelayerError, events::RelayerEvent};
use near_crypto::{KeyType};
use ed25519_dalek::{Verifier, Signature as Ed25519Signature, VerifyingKey};
use base64::engine::general_purpose::STANDARD as Base64;
use base64::Engine;

#[derive(BorshSerialize, BorshDeserialize)]
struct SignRequest {
    payload: Vec<u8>,
    path: String,
    key_version: u32,
    request_id: u64,
}

#[derive(BorshSerialize, BorshDeserialize)]
struct BridgeTransferPayload {
    token: String,
    amount: u128,
    destination_chain: String,
    recipient: String,
    sender: AccountId,
    nonce: u64,
}

pub fn verify_signature(signed_delegate: &SignedDelegateAction, tx_hash: &[u8]) -> Result<(), RelayerError> {
    let payload = borsh::to_vec(&signed_delegate.delegate_action).map_err(|_| RelayerError::InvalidNonce)?;
    if env::sha256(&payload) != tx_hash {
        return Err(RelayerError::InvalidSignature);
    }
    match signed_delegate.scheme {
        SignatureScheme::Ed25519 => {
            let signature_bytes: [u8; 64] = signed_delegate.signature.clone().try_into().map_err(|_| RelayerError::Unauthorized)?;
            let signature = Ed25519Signature::from_bytes(&signature_bytes);
            let public_key_bytes = signed_delegate.public_key.as_bytes();
            if public_key_bytes.len() != 33 || public_key_bytes[0] != KeyType::ED25519 as u8 {
                return Err(RelayerError::Unauthorized);
            }
            let ed25519_key = VerifyingKey::from_bytes(&public_key_bytes[1..33].try_into().unwrap())
                .map_err(|_| RelayerError::Unauthorized)?;
            ed25519_key.verify(&payload, &signature).map_err(|_| RelayerError::Unauthorized)?;
        }
    }
    Ok(())
}

pub fn relay_meta_transaction(relayer: &mut Relayer, signed_delegate: SignedDelegateAction) -> Result<Promise, RelayerError> {
    assert!(env::prepaid_gas() >= Gas::from_tgas(250), "Attach at least 250 TGas");
    if signed_delegate.delegate_action.actions.len() > 1 {
        return Err(RelayerError::InvalidNonce);
    }
    let sender_id = &signed_delegate.delegate_action.sender_id;
    // Verify signer matches sender_id to prevent intermediary manipulation
    if env::signer_account_id() != *sender_id {
        return Err(RelayerError::Unauthorized);
    }
    let balance = env::account_balance().as_yoctonear();
    if balance < relayer.min_balance {
        RelayerEvent::LowBalance { balance }.emit();
        return Err(RelayerError::InsufficientBalance);
    }
    let tx_hash = env::sha256(&borsh::to_vec(&signed_delegate.delegate_action).map_err(|_| RelayerError::InvalidNonce)?);
    let mpc_contract = relayer.chain_mpc_mapping.get("testnet").cloned().unwrap_or("v1.signer-prod.testnet".parse().unwrap());
    let promise = ext_mpc::ext(mpc_contract)
        .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
        .get_nonce(sender_id.clone(), Base64.encode(tx_hash.clone()))
        .then(
            ext_auth::ext(relayer.auth_contract.clone())
                .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
                .is_authorized(sender_id.clone(), signed_delegate.public_key.clone(), signed_delegate.multi_signatures.clone())
        )
        .then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
                .handle_auth_result(sender_id.clone(), signed_delegate.clone(), true)
        );
    let remaining_gas = env::prepaid_gas().as_tgas().saturating_sub(env::used_gas().as_tgas());
    // Alert if remaining gas is low
    if remaining_gas < 50 {
        RelayerEvent::LowGas { remaining_gas }.emit();
    }
    env::log_str(&format!(
        "relay_meta_transaction: prepaid={} TGas, used={} TGas, remaining={} TGas",
        env::prepaid_gas().as_tgas(),
        env::used_gas().as_tgas(),
        remaining_gas
    ));
    Ok(promise)
}

pub fn relay_meta_transactions(relayer: &mut Relayer, signed_delegates: Vec<SignedDelegateAction>) -> Result<Vec<Promise>, RelayerError> {
    assert!(env::prepaid_gas() >= Gas::from_tgas(250), "Attach at least 250 TGas");
    if signed_delegates.is_empty() || signed_delegates.len() > relayer.chunk_size {
        return Err(RelayerError::InvalidNonce);
    }
    let balance = env::account_balance().as_yoctonear();
    if balance < relayer.min_balance {
        RelayerEvent::LowBalance { balance }.emit();
        return Err(RelayerError::InsufficientBalance);
    }
    let mut promises: Vec<Promise> = Vec::new();
    let mpc_contract = relayer.chain_mpc_mapping.get("testnet").cloned().unwrap_or("v1.signer-prod.testnet".parse().unwrap());
    for signed_delegate in signed_delegates {
        let sender_id = &signed_delegate.delegate_action.sender_id;
        // Verify signer matches sender_id
        if env::signer_account_id() != *sender_id {
            return Err(RelayerError::Unauthorized);
        }
        let tx_hash = env::sha256(&borsh::to_vec(&signed_delegate.delegate_action).map_err(|_| RelayerError::InvalidNonce)?);
        let promise = ext_mpc::ext(mpc_contract.clone())
            .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
            .get_nonce(sender_id.clone(), Base64.encode(tx_hash))
            .then(
                ext_auth::ext(relayer.auth_contract.clone())
                    .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
                    .is_authorized(sender_id.clone(), signed_delegate.public_key.clone(), signed_delegate.multi_signatures.clone())
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
                    .handle_auth_result(sender_id.clone(), signed_delegate.clone(), true)
            );
        promises.push(promise);
    }
    let remaining_gas = env::prepaid_gas().as_tgas().saturating_sub(env::used_gas().as_tgas());
    if remaining_gas < 50 {
        RelayerEvent::LowGas { remaining_gas }.emit();
    }
    env::log_str(&format!(
        "relay_meta_transactions: prepaid={} TGas, used={} TGas, remaining={} TGas",
        env::prepaid_gas().as_tgas(),
        env::used_gas().as_tgas(),
        remaining_gas
    ));
    Ok(promises)
}

pub fn relay_chunked_meta_transactions(relayer: &mut Relayer, signed_delegates: Vec<SignedDelegateAction>) -> Result<Vec<Promise>, RelayerError> {
    assert!(env::prepaid_gas() >= Gas::from_tgas(250), "Attach at least 250 TGas");
    if signed_delegates.is_empty() {
        return Err(RelayerError::InvalidNonce);
    }
    let balance = env::account_balance().as_yoctonear();
    if balance < relayer.min_balance {
        RelayerEvent::LowBalance { balance }.emit();
        return Err(RelayerError::InsufficientBalance);
    }
    let mpc_contract = relayer.chain_mpc_mapping.get("testnet").cloned().unwrap_or("v1.signer-prod.testnet".parse().unwrap());
    let mut all_promises = Vec::new();
    for chunk in signed_delegates.chunks(relayer.chunk_size) {
        let chunk_promises: Vec<Promise> = chunk.iter()
            .map(|signed_delegate| {
                let sender_id = &signed_delegate.delegate_action.sender_id;
                // Verify signer matches sender_id
                if env::signer_account_id() != *sender_id {
                    return Promise::new(env::current_account_id()).function_call(
                        "panic".to_string(),
                        borsh::to_vec(&RelayerError::Unauthorized).unwrap_or_default(),
                        NearToken::from_yoctonear(0),
                        Gas::from_tgas(relayer.cross_contract_gas),
                    );
                }
                match borsh::to_vec(&signed_delegate.delegate_action) {
                    Ok(payload) => {
                        let tx_hash = env::sha256(&payload);
                        ext_mpc::ext(mpc_contract.clone())
                            .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
                            .get_nonce(sender_id.clone(), Base64.encode(tx_hash))
                            .then(
                                ext_auth::ext(relayer.auth_contract.clone())
                                    .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
                                    .is_authorized(sender_id.clone(), signed_delegate.public_key.clone(), signed_delegate.multi_signatures.clone())
                            )
                            .then(
                                ext_self::ext(env::current_account_id())
                                    .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
                                    .handle_auth_result(sender_id.clone(), signed_delegate.clone(), true)
                            )
                    }
                    Err(_) => {
                        Promise::new(env::current_account_id()).function_call(
                            "panic".to_string(),
                            borsh::to_vec(&RelayerError::InvalidNonce).unwrap_or_default(),
                            NearToken::from_yoctonear(0),
                            Gas::from_tgas(relayer.cross_contract_gas),
                        )
                    }
                }
            })
            .collect();
        all_promises.extend(chunk_promises);
    }
    let remaining_gas = env::prepaid_gas().as_tgas().saturating_sub(env::used_gas().as_tgas());
    if remaining_gas < 50 {
        RelayerEvent::LowGas { remaining_gas }.emit();
    }
    env::log_str(&format!(
        "relay_chunked_meta_transactions: prepaid={} TGas, used={} TGas, remaining={} TGas",
        env::prepaid_gas().as_tgas(),
        env::used_gas().as_tgas(),
        remaining_gas
    ));
    Ok(all_promises)
}

pub fn execute_action(
    relayer: &mut Relayer,
    action: &Action,
    sender_id: &AccountId,
    _action_type: &str,
    request_id: Option<u64>,
) -> Result<Promise, RelayerError> {
    assert!(env::prepaid_gas() >= Gas::from_tgas(250), "Attach at least 250 TGas");
    let initial_storage = env::storage_usage();
    let mut promise = Promise::new(sender_id.clone());
    match action {
        Action::FunctionCall { method_name, args, gas: _, deposit } => {
            promise = promise.function_call(
                method_name.clone(),
                args.clone(),
                NearToken::from_yoctonear(deposit.as_yoctonear()),
                Gas::from_tgas(relayer.cross_contract_gas)
            );
        }
        Action::Transfer { deposit } => {
            promise = promise.transfer(NearToken::from_yoctonear(deposit.as_yoctonear()));
        }
        Action::AddKey { public_key, allowance, receiver_id, method_names } => {
            promise = promise.add_access_key_allowance(
                public_key.clone(),
                allowance.map_or(Allowance::Unlimited, |t| Allowance::Limited(NonZeroU128::new(t.as_yoctonear()).unwrap())),
                receiver_id.clone(),
                method_names.join(",")
            );
        }
        Action::ChainSignatureRequest { target_chain, derivation_path, payload } => {
            let mpc_contract = relayer.chain_mpc_mapping.get(target_chain)
                .ok_or(RelayerError::InvalidAccountId)?;
            let request = SignRequest {
                payload: payload.clone(),
                path: derivation_path.clone(),
                key_version: 0,
                request_id: request_id.ok_or(RelayerError::InvalidNonce)?,
            };
            let args = borsh::to_vec(&request).map_err(|_| RelayerError::InvalidAccountId)?;
            promise = Promise::new(mpc_contract.clone())
                .function_call(
                    "sign".to_string(),
                    args,
                    NearToken::from_yoctonear(1),
                    Gas::from_tgas(relayer.cross_contract_gas)
                );
        }
        Action::FtTransfer { token, receiver_id, amount, memo } => {
            let sender_promise = ext_ft_wrapper::ext(relayer.ft_wrapper_contract.clone())
                .with_static_gas(Gas::from_tgas(100))
                .is_registered(token.clone(), sender_id.clone())
                .then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(Gas::from_tgas(100))
                        .handle_registration(sender_id.clone(), token.clone(), true, true)
                );
            let receiver_promise = ext_ft_wrapper::ext(relayer.ft_wrapper_contract.clone())
                .with_static_gas(Gas::from_tgas(100))
                .is_registered(token.clone(), receiver_id.clone())
                .then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(Gas::from_tgas(100))
                        .handle_registration(receiver_id.clone(), token.clone(), false, true)
                );
            promise = sender_promise
                .then(receiver_promise)
                .then(
                    ext_ft_wrapper::ext(relayer.ft_wrapper_contract.clone())
                        .with_static_gas(Gas::from_tgas(100))
                        .ft_transfer(token.clone(), receiver_id.clone(), *amount, memo.clone())
                );
        }
        Action::BridgeTransfer { token, amount, destination_chain, recipient } => {
            let fee = relayer.base_fee;
            let balance = env::account_balance().as_yoctonear();
            // Check if relayer can cover the fee
            if balance < relayer.min_balance + fee {
                RelayerEvent::LowBalance { balance }.emit();
                return Err(RelayerError::InsufficientBalance);
            }
            let total_cost = 15_000_000_000_000; // 15 TGas for lock + sign
            if fee > 0 && fee < total_cost / 1_000_000_000_000 * 1_000_000_000_000_000_000_000 {
                return Err(RelayerError::FeeTooLow);
            }
            // Store pending transfer instead of incrementing nonce immediately
            let nonce = relayer.get_pending_nonce(destination_chain);
            let lock_promise = ext_omi_locker::ext(relayer.omni_locker_contract.get().clone().map(|x| x.clone()).unwrap_or_else(|| env::current_account_id()))
                .with_static_gas(Gas::from_tgas(relayer.cross_contract_gas))
                .lock(token.clone(), *amount, destination_chain.clone(), recipient.clone());
            let mpc_contract = relayer.chain_mpc_mapping.get(destination_chain)
                .ok_or(RelayerError::InvalidNonce)?;
            let payload = BridgeTransferPayload {
                token: token.clone(),
                amount: amount.0,
                destination_chain: destination_chain.clone(),
                recipient: recipient.clone(),
                sender: sender_id.clone(),
                nonce,
            };
            let payload_bytes = borsh::to_vec(&payload).map_err(|_| RelayerError::InvalidAccountId)?;
            let sign_promise = Promise::new(mpc_contract.clone())
                .function_call(
                    "sign".to_string(),
                    borsh::to_vec(&SignRequest {
                        payload: payload_bytes,
                        path: "".to_string(),
                        key_version: 0,
                        request_id: request_id.unwrap_or(env::block_timestamp()),
                    }).map_err(|_| RelayerError::InvalidAccountId)?,
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(relayer.cross_contract_gas)
                );
            // Store pending transfer
            relayer.add_pending_transfer(
                destination_chain.clone(),
                nonce,
                sender_id.clone(),
                token.clone(),
                *amount,
                recipient.clone(),
                fee,
            );
            RelayerEvent::BridgeTransferInitiated {
                token: token.clone(),
                amount: *amount,
                destination_chain: destination_chain.clone(),
                recipient: recipient.clone(),
                sender: sender_id.clone(),
                nonce,
            }.emit();
            RelayerEvent::FeeCharged { 
                action: "BridgeTransfer".to_string(), 
                fee, 
                sender: sender_id.clone() 
            }.emit();
            promise = lock_promise.then(sign_promise);
        }
    }
    // Check storage cost
    let storage_used = env::storage_usage() - initial_storage;
    let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
    if env::account_balance().as_yoctonear() < relayer.min_balance + storage_cost {
        RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
        return Err(RelayerError::InsufficientBalance);
    }
    let remaining_gas = env::prepaid_gas().as_tgas().saturating_sub(env::used_gas().as_tgas());
    if remaining_gas < 50 {
        RelayerEvent::LowGas { remaining_gas }.emit();
    }
    env::log_str(&format!(
        "execute_action: prepaid={} TGas, used={} TGas, remaining={} TGas, storage_used={} bytes, storage_cost={} yoctoNEAR",
        env::prepaid_gas().as_tgas(),
        env::used_gas().as_tgas(),
        remaining_gas,
        storage_used,
        storage_cost
    ));
    Ok(promise)
}