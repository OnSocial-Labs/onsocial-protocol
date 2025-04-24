use near_sdk::{near, AccountId, Promise, PublicKey, NearToken, env, ext_contract, Gas, PromiseError};
use near_sdk::json_types::U128;
use near_sdk::{borsh, PanicOnDefault};
use crate::state::Relayer;
use crate::types::{SignedDelegateAction, Action};
use crate::errors::RelayerError;
use crate::events::RelayerEvent;

mod types;
mod errors;
mod events;
mod state;
mod admin;
mod relay;
mod sponsor;
mod balance;
mod state_versions;

#[ext_contract(ext_self)]
pub trait SelfCallback {
    fn handle_mpc_signature(&mut self, chain: String, request_id: u64, result: Vec<u8>, #[callback_result] call_result: Result<(), PromiseError>);
    fn handle_bridge_result(&mut self, sender_id: AccountId, action_type: String, result: Vec<u8>, #[callback_result] call_result: Result<(), PromiseError>);
    fn handle_bridge_transfer_result(&mut self, sender_id: AccountId, token: String, amount: U128, destination_chain: String, recipient: String, signature: Vec<u8>, #[callback_result] call_result: Result<(), PromiseError>);
    #[handle_result]
    fn handle_auth_result(&mut self, sender_id: AccountId, signed_delegate: SignedDelegateAction, is_authorized: bool) -> Result<Promise, RelayerError>;
    fn handle_registration(&mut self, account_id: AccountId, token: String, is_sender: bool, is_registered: bool) -> Promise;
}

#[ext_contract(ext_auth)]
pub trait AuthContract {
    fn is_authorized(&self, account_id: AccountId, public_key: PublicKey, signatures: Option<Vec<Vec<u8>>>) -> bool;
    fn register_key(&mut self, account_id: AccountId, public_key: PublicKey, expiration_days: Option<u32>, is_multi_sig: bool, multi_sig_threshold: Option<u32>);
    fn remove_key(&mut self, account_id: AccountId, public_key: PublicKey);
}

#[ext_contract(ext_ft_wrapper)]
pub trait FtWrapperContract {
    fn storage_deposit(&mut self, token: String, account_id: AccountId, deposit: U128);
    fn ft_transfer(&mut self, token: String, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_balance_of(&self, token: String, account_id: AccountId) -> U128;
    fn is_registered(&self, token: String, account_id: AccountId) -> bool;
}

#[ext_contract(ext_omi_locker)]
pub trait OmniLocker {
    fn lock(&mut self, token: String, amount: U128, destination_chain: String, recipient: String);
}

#[ext_contract(ext_mpc)]
pub trait MpcContract {
    fn get_nonce(&self, account_id: AccountId, tx_hash: String) -> u64;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OnSocialRelayer {
    relayer: Relayer,
}

#[near]
impl OnSocialRelayer {
    #[init]
    pub fn new(
        offload_recipient: AccountId,
        auth_contract: AccountId,
        ft_wrapper_contract: AccountId,
    ) -> Self {
        Self {
            relayer: Relayer::new(env::predecessor_account_id(), offload_recipient, auth_contract, ft_wrapper_contract),
        }
    }

    #[payable]
    pub fn deposit(&mut self) {
        balance::deposit(&mut self.relayer).expect("Deposit failed");
    }

    #[handle_result]
    pub fn relay_meta_transaction(&mut self, #[serializer(borsh)] signed_delegate: SignedDelegateAction) -> Result<Promise, RelayerError> {
        relay::relay_meta_transaction(&mut self.relayer, signed_delegate)
    }

    #[handle_result]
    pub fn relay_meta_transactions(&mut self, #[serializer(borsh)] signed_delegates: Vec<SignedDelegateAction>) -> Result<Vec<Promise>, RelayerError> {
        relay::relay_meta_transactions(&mut self.relayer, signed_delegates)
    }

    #[handle_result]
    pub fn relay_chunked_meta_transactions(&mut self, #[serializer(borsh)] signed_delegates: Vec<SignedDelegateAction>) -> Result<Vec<Promise>, RelayerError> {
        relay::relay_chunked_meta_transactions(&mut self.relayer, signed_delegates)
    }

    #[handle_result]
    pub fn sponsor_account(&mut self, #[serializer(borsh)] args: Vec<u8>) -> Result<Promise, RelayerError> {
        env::log_str(&format!("Raw args: {:?}", args));
        let (new_account_id, public_key, is_multi_sig, multi_sig_threshold): (AccountId, PublicKey, bool, Option<u32>) = borsh::from_slice(&args)
            .map_err(|e| {
                env::log_str(&format!("Deserialization failed: {:?}", e));
                RelayerError::InvalidNonce
            })?;
        env::log_str(&format!("Deserialized: {} {:?}", new_account_id, public_key));
        sponsor::sponsor_account_with_registrar(&mut self.relayer, new_account_id, public_key, is_multi_sig, multi_sig_threshold)
    }

    #[handle_result]
    pub fn sponsor_account_signed(&mut self, #[serializer(borsh)] signed_delegate: SignedDelegateAction) -> Result<Promise, RelayerError> {
        sponsor::sponsor_account_signed(&mut self.relayer, signed_delegate)
    }

    #[handle_result]
    pub fn register_existing_account(&mut self, account_id: AccountId, public_key: PublicKey, expiration_days: Option<u32>, is_multi_sig: bool, multi_sig_threshold: Option<u32>) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::register_existing_account(&mut self.relayer, account_id, public_key, expiration_days, is_multi_sig, multi_sig_threshold);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("register_existing_account: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn remove_key(&mut self, account_id: AccountId, public_key: PublicKey) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::remove_key(&mut self.relayer, account_id, public_key);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("remove_key: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_offload_recipient(&mut self, new_recipient: AccountId) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_offload_recipient(&mut self.relayer, new_recipient);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_offload_recipient: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_sponsor_amount(&mut self, new_amount: U128) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_sponsor_amount(&mut self.relayer, new_amount.0);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_sponsor_amount: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_sponsor_gas(&mut self, new_gas: u64) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_sponsor_gas(&mut self.relayer, new_gas);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_sponsor_gas: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_cross_contract_gas(&mut self, new_gas: u64) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_cross_contract_gas(&mut self.relayer, new_gas);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_cross_contract_gas: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_migration_gas(&mut self, new_gas: u64) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_migration_gas(&mut self.relayer, new_gas);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_migration_gas: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_omni_locker_contract(&mut self, new_locker_contract: AccountId) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_omni_locker_contract(&mut self.relayer, new_locker_contract);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_omni_locker_contract: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn add_chain_mpc_mapping(&mut self, chain: String, mpc_contract: AccountId) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::add_chain_mpc_mapping(&mut self.relayer, chain, mpc_contract);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("add_chain_mpc_mapping: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn remove_chain_mpc_mapping(&mut self, chain: String) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::remove_chain_mpc_mapping(&mut self.relayer, chain);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("remove_chain_mpc_mapping: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_chunk_size(&mut self, new_size: usize) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_chunk_size(&mut self.relayer, new_size);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_chunk_size: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_auth_contract(&mut self, new_auth_contract: AccountId) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_auth_contract(&mut self.relayer, new_auth_contract);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_auth_contract: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_ft_wrapper_contract(&mut self, new_ft_wrapper_contract: AccountId) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_ft_wrapper_contract(&mut self.relayer, new_ft_wrapper_contract);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_ft_wrapper_contract: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_base_fee(&mut self, new_fee: U128, signatures: Option<Vec<Vec<u8>>>) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_base_fee(&mut self.relayer, new_fee.0, signatures);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_base_fee: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_manager(&mut self, new_manager: AccountId) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_manager(&mut self.relayer, new_manager);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_manager: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn update_contract(&mut self) -> Result<Promise, RelayerError> {
        let caller = env::predecessor_account_id();
        if !self.relayer.is_manager(&caller) {
            return Err(RelayerError::Unauthorized);
        }
        let code = env::input().ok_or(RelayerError::MissingInput)?.to_vec();
        RelayerEvent::ContractUpgraded { manager: caller, timestamp: env::block_timestamp_ms() }.emit();
        let promise = Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call("migrate".to_string(), vec![], NearToken::from_yoctonear(0), Gas::from_tgas(self.relayer.migration_gas));
        env::log_str(&format!("Gas used in update_contract: {} TGas", env::used_gas().as_tgas()));
        Ok(promise)
    }

    #[handle_result]
    pub fn set_min_balance(&mut self, new_min: U128) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_min_balance(&mut self.relayer, new_min.0);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_min_balance: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    #[handle_result]
    pub fn set_max_balance(&mut self, new_max: U128) -> Result<(), RelayerError> {
        let initial_storage = env::storage_usage();
        let result = admin::set_max_balance(&mut self.relayer, new_max.0);
        let storage_used = env::storage_usage() - initial_storage;
        let storage_cost = storage_used as u128 * env::storage_byte_cost().as_yoctonear();
        if env::account_balance().as_yoctonear() < self.relayer.min_balance + storage_cost {
            RelayerEvent::LowBalance { balance: env::account_balance().as_yoctonear() }.emit();
            return Err(RelayerError::InsufficientBalance);
        }
        env::log_str(&format!("set_max_balance: storage_used={} bytes, storage_cost={} yoctoNEAR", storage_used, storage_cost));
        result
    }

    pub fn get_balance(&self) -> U128 {
        U128(env::account_balance().as_yoctonear())
    }

    pub fn get_min_balance(&self) -> U128 {
        U128(self.relayer.min_balance)
    }

    pub fn get_max_balance(&self) -> U128 {
        U128(self.relayer.max_balance)
    }

    pub fn get_sponsor_amount(&self) -> U128 {
        U128(self.relayer.sponsor_amount)
    }

    pub fn get_sponsor_gas(&self) -> u64 {
        self.relayer.sponsor_gas
    }

    pub fn get_cross_contract_gas(&self) -> u64 {
        self.relayer.cross_contract_gas
    }

    pub fn get_migration_gas(&self) -> u64 {
        self.relayer.migration_gas
    }

    pub fn get_omni_locker_contract(&self) -> AccountId {
        self.relayer.omni_locker_contract.get().clone().map(|x| x.clone()).unwrap_or_else(|| env::current_account_id())
    }

    pub fn get_chunk_size(&self) -> usize {
        self.relayer.chunk_size
    }

    pub fn get_auth_contract(&self) -> AccountId {
        self.relayer.auth_contract.clone()
    }

    pub fn get_ft_wrapper_contract(&self) -> AccountId {
        self.relayer.ft_wrapper_contract.clone()
    }

    pub fn get_base_fee(&self) -> U128 {
        U128(self.relayer.base_fee)
    }
}

#[near]
impl OnSocialRelayer {
    #[private]
    pub fn handle_mpc_signature(&mut self, chain: String, request_id: u64, result: Vec<u8>, #[callback_result] call_result: Result<(), PromiseError>) {
        if call_result.is_err() {
            env::log_str(&format!("MPC signature failed for chain {} request_id {}", chain, request_id));
            // No state changes to revert, just emit event
            RelayerEvent::CrossChainSignatureResult { chain, request_id, result: vec![] }.emit();
            return;
        }
        RelayerEvent::CrossChainSignatureResult { chain, request_id, result }.emit();
    }

    #[private]
    pub fn handle_bridge_result(&mut self, sender_id: AccountId, action_type: String, result: Vec<u8>, #[callback_result] call_result: Result<(), PromiseError>) {
        if call_result.is_err() {
            env::log_str(&format!("Bridge action {} failed for sender {}", action_type, sender_id));
            // No state changes to revert, just emit event
            RelayerEvent::BridgeResult { sender_id, action_type, result: vec![] }.emit();
            return;
        }
        RelayerEvent::BridgeResult { sender_id, action_type, result }.emit();
    }

    #[private]
    pub fn handle_bridge_transfer_result(
        &mut self,
        sender_id: AccountId,
        token: String,
        amount: U128,
        destination_chain: String,
        recipient: String,
        signature: Vec<u8>,
        #[callback_result] call_result: Result<(), PromiseError>,
    ) {
        let nonce = self.relayer.get_pending_nonce(&destination_chain);
        if call_result.is_err() {
            env::log_str(&format!("Bridge transfer failed for sender {} to chain {}", sender_id, destination_chain));
            // Revert pending transfer and refund fee
            if let Some(pending) = self.relayer.revert_pending_transfer(&destination_chain, nonce) {
                if pending.fee > 0 {
                    Promise::new(sender_id.clone())
                        .transfer(NearToken::from_yoctonear(pending.fee));
                    env::log_str(&format!("Refunded {} yoctoNEAR to {}", pending.fee, sender_id));
                }
            }
            RelayerEvent::BridgeTransferFailed {
                token,
                amount,
                destination_chain,
                recipient,
                sender: sender_id,
                nonce,
            }.emit();
            return;
        }
        // Confirm transfer and update nonce
        self.relayer.confirm_pending_transfer(&destination_chain, nonce);
        RelayerEvent::BridgeTransferCompleted {
            token,
            amount,
            destination_chain,
            recipient,
            sender: sender_id,
            signature,
        }.emit();
    }

    #[private]
    #[handle_result]
    pub fn handle_auth_result(&mut self, sender_id: AccountId, signed_delegate: SignedDelegateAction, #[callback_unwrap] is_authorized: bool) -> Result<Promise, RelayerError> {
        if !is_authorized {
            return Err(RelayerError::Unauthorized);
        }
        let tx_hash = env::sha256(&borsh::to_vec(&signed_delegate.delegate_action).map_err(|_| RelayerError::InvalidNonce)?);
        relay::verify_signature(&signed_delegate, &tx_hash)?;
        let delegate = signed_delegate.delegate_action;
        let action = delegate.actions.first().unwrap();
        let request_id = env::block_timestamp();
        let promise = relay::execute_action(&mut self.relayer, action, &sender_id, action.type_name(), Some(request_id))?;
        let promise = match action {
            Action::ChainSignatureRequest { target_chain, .. } => {
                promise.then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(Gas::from_tgas(self.relayer.cross_contract_gas))
                        .handle_mpc_signature(target_chain.clone(), request_id, Vec::new())
                )
            }
            Action::BridgeTransfer { token, amount, destination_chain, recipient, .. } => {
                promise.then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(Gas::from_tgas(self.relayer.cross_contract_gas))
                        .handle_bridge_transfer_result(sender_id.clone(), token.clone(), *amount, destination_chain.clone(), recipient.clone(), Vec::new())
                )
            }
            _ => promise.then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(self.relayer.cross_contract_gas))
                    .handle_bridge_result(sender_id.clone(), action.type_name().to_string(), Vec::new())
            ),
        };
        Ok(promise)
    }

    #[private]
    pub fn handle_registration(&mut self, account_id: AccountId, token: String, _is_sender: bool, #[callback_unwrap] is_registered: bool) -> Promise {
        if !is_registered {
            ext_ft_wrapper::ext(self.relayer.ft_wrapper_contract.clone())
                .with_static_gas(Gas::from_tgas(self.relayer.cross_contract_gas))
                .with_attached_deposit(NearToken::from_yoctonear(1_250_000_000_000_000_000_000))
                .storage_deposit(token, account_id, U128(1_250_000_000_000_000_000_000))
        } else {
            Promise::new(env::current_account_id())
        }
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        Self {
            relayer: Relayer::migrate(),
        }
    }
}

#[cfg(test)]
mod tests;
