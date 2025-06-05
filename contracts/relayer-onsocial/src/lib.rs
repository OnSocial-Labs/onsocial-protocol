use crate::admin::{
    offload_funds as offload_funds_impl, set_manager as set_manager_impl,
    set_platform_public_key as set_platform_public_key_impl,
};
use crate::constants::{CONFIRMATION_STRING, MAX_GAS_LIMIT};
use crate::errors::RelayerError;
use crate::events::{log_contract_initialized, log_contract_upgraded};
use crate::sponsor::{handle_sponsor_result, sponsor_transactions as sponsor_transactions_impl};
use crate::state::Relayer;
use crate::state_versions::VersionedRelayer;
use crate::types::SignedDelegateAction;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::ext_contract;
use near_sdk::json_types::U128;
use near_sdk::{env, log, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PublicKey};
use near_sdk_macros::NearSchema;

mod admin;
mod balance;
mod constants;
mod errors;
mod events;
mod sponsor;
mod state;
mod state_versions;
mod types;

#[ext_contract(ext_self)]
pub trait SelfCallback {
    fn handle_result(
        &self,
        sender_id: AccountId,
        signed_delegate: SignedDelegateAction,
        sponsor_amount: u128,
        gas: u64,
    ) -> Promise;
}

#[macro_export]
macro_rules! require_not_paused {
    ($relayer:expr) => {
        if $relayer.paused {
            return Err($crate::errors::RelayerError::Paused);
        }
    };
}

#[macro_export]
macro_rules! require_manager {
    ($relayer:expr, $caller:expr) => {
        if $caller != $relayer.manager {
            return Err($crate::errors::RelayerError::Unauthorized);
        }
    };
}

#[macro_export]
macro_rules! require {
    ($cond:expr, $err:expr) => {
        if !$cond {
            return Err($err);
        }
    };
}

#[near(contract_state)]
#[derive(Debug, PanicOnDefault)]
pub struct OnSocialRelayer {
    relayer: VersionedRelayer,
}

#[near]
impl OnSocialRelayer {
    #[init]
    #[private]
    #[handle_result]
    pub fn new(
        manager: AccountId,
        platform_public_key: PublicKey,
        offload_recipient: AccountId,
        offload_threshold: U128,
    ) -> Result<Self, RelayerError> {
        AccountId::validate(manager.as_str())
            .map_err(|_| RelayerError::InvalidInput("Invalid manager account ID".to_string()))?;
        AccountId::validate(offload_recipient.as_str()).map_err(|_| {
            RelayerError::InvalidInput("Invalid offload_recipient account ID".to_string())
        })?;
        if env::predecessor_account_id() != env::current_account_id() {
            return Err(RelayerError::Unauthorized);
        }
        let relayer = Relayer::new(
            manager,
            platform_public_key,
            offload_recipient,
            offload_threshold.0,
        );
        let versioned_relayer = VersionedRelayer { state: relayer };

        log_contract_initialized(
            versioned_relayer.as_ref(),
            &versioned_relayer.as_ref().manager,
            0,
            env::block_timestamp_ms(),
        );

        Ok(Self {
            relayer: versioned_relayer,
        })
    }

    #[handle_result]
    pub fn pause(&mut self) -> Result<(), RelayerError> {
        crate::admin::pause(self.relayer.as_mut(), &env::predecessor_account_id())
    }

    #[handle_result]
    pub fn unpause(&mut self) -> Result<(), RelayerError> {
        crate::admin::unpause(self.relayer.as_mut(), &env::predecessor_account_id())
    }

    pub fn get_paused(&self) -> bool {
        self.relayer.as_ref().paused
    }

    #[payable]
    #[handle_result]
    pub fn deposit(&mut self) -> Result<(), RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        balance::deposit(self.relayer.as_mut())
    }

    #[handle_result]
    pub fn sponsor_transactions(
        &mut self,
        signed_delegates: Vec<SignedDelegateAction>,
        sponsor_amounts: Vec<U128>,
        gas: u64,
        proxy_for: Option<AccountId>,
    ) -> Result<Promise, RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        let relayer = self.relayer.as_mut();
        sponsor_transactions_impl(relayer, signed_delegates, sponsor_amounts, gas, proxy_for)
    }

    #[handle_result]
    pub fn offload_funds(
        &mut self,
        amount: U128,
        signature: Vec<u8>,
        challenge: Vec<u8>,
    ) -> Result<Promise, RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        // No longer require_manager! Anyone can call if signature is valid
        offload_funds_impl(self.relayer.as_mut(), amount.0, signature, challenge)
    }

    #[handle_result]
    pub fn prune_nonces_periodic(
        &mut self,
        max_age_ms: u64,
        max_accounts: u32,
        accounts: Vec<AccountId>,
    ) -> Result<(u32, Option<AccountId>), RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        require_manager!(self.relayer.as_ref(), env::predecessor_account_id());
        Ok(self
            .relayer
            .as_mut()
            .prune_nonces_periodic(max_age_ms, max_accounts, accounts))
    }

    #[handle_result]
    pub fn reset_processing_flags(&mut self) -> Result<(), RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        require_manager!(self.relayer.as_ref(), env::predecessor_account_id());
        self.relayer.as_mut().sponsorship_guard.exit();
        self.relayer.as_mut().deposit_guard.exit();
        Ok(())
    }

    pub fn get_nonce(&self, account_id: AccountId) -> u64 {
        self.relayer.as_ref().get_nonce(&account_id)
    }

    #[handle_result]
    pub fn set_manager(&mut self, new_manager: AccountId) -> Result<(), RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        set_manager_impl(self.relayer.as_mut(), new_manager)
    }

    #[handle_result]
    pub fn set_min_balance(&mut self, new_min: U128) -> Result<(), RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        crate::admin::set_balance_limits(self.relayer.as_mut(), new_min.0)
    }

    #[handle_result]
    pub fn set_platform_public_key(
        &mut self,
        new_key: PublicKey,
        challenge: Vec<u8>,
        signature: Vec<u8>,
    ) -> Result<(), RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        set_platform_public_key_impl(self.relayer.as_mut(), new_key, challenge, signature)
    }

    pub fn get_platform_public_key(&self) -> &PublicKey {
        &self.relayer.as_ref().platform_public_key
    }

    #[private]
    pub fn handle_result(
        &mut self,
        sender_id: AccountId,
        signed_delegate: SignedDelegateAction,
        sponsor_amount: u128,
        gas: u64,
    ) -> Promise {
        handle_sponsor_result(
            self.relayer.as_mut(),
            &sender_id,
            signed_delegate,
            sponsor_amount,
            gas,
        )
    }

    pub fn get_balance(&self) -> U128 {
        U128(env::account_balance().as_yoctonear())
    }

    pub fn get_min_balance(&self) -> U128 {
        U128(self.relayer.as_ref().min_balance)
    }

    pub fn get_manager(&self) -> &AccountId {
        &self.relayer.as_ref().manager
    }

    pub fn get_max_gas_limit(&self) -> u64 {
        MAX_GAS_LIMIT
    }

    #[handle_result]
    pub fn update_contract(
        &mut self,
        migrate_gas: u64,
        force_init: Option<bool>,
        confirmation: Option<String>,
    ) -> Result<Promise, RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        require_manager!(self.relayer.as_ref(), env::predecessor_account_id());
        if migrate_gas > MAX_GAS_LIMIT {
            return Err(RelayerError::InvalidInput(
                "Gas exceeds contract max_gas_limit".to_string(),
            ));
        }
        if force_init.unwrap_or(false) && confirmation.as_deref() != Some(CONFIRMATION_STRING) {
            return Err(RelayerError::InvalidInput(
                "Confirmation missing or invalid".to_string(),
            ));
        }
        let code = env::input().ok_or(RelayerError::MissingInput)?;
        log_contract_upgraded(
            self.relayer.as_ref(),
            &env::predecessor_account_id(),
            env::block_timestamp_ms(),
        );
        let relayer = self.relayer.as_ref();
        let migrate_args = MigrateArgs {
            manager: relayer.manager.clone(),
            platform_public_key: relayer.platform_public_key.clone(),
            offload_recipient: relayer.offload_recipient.clone(),
            offload_threshold: U128(relayer.offload_threshold),
            force_init: force_init.unwrap_or(false),
            confirmation,
        };
        Ok(Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                near_sdk::borsh::to_vec(&migrate_args).map_err(|_| {
                    RelayerError::InvalidInput("Failed to serialize migrate args".to_string())
                })?,
                NearToken::from_near(0),
                Gas::from_gas(migrate_gas),
            ))
    }

    #[private]
    #[init(ignore_state)]
    #[handle_result]
    pub fn migrate(args: MigrateArgs) -> Result<Self, RelayerError> {
        let MigrateArgs {
            manager,
            platform_public_key,
            offload_recipient,
            offload_threshold,
            force_init,
            confirmation,
        } = args;
        if force_init && confirmation.as_deref() != Some("I_UNDERSTAND_DATA_LOSS") {
            return Err(RelayerError::InvalidInput(
                "Confirmation missing or invalid".to_string(),
            ));
        }
        AccountId::validate(manager.as_str())
            .map_err(|_| RelayerError::InvalidInput("Invalid AccountId".to_string()))?;
        let state_bytes: Vec<u8> = env::state_read().unwrap_or_default();
        let versioned_relayer = if state_bytes.is_empty() {
            log!("[MIGRATION] State is empty. force_init: {}", force_init);
            if force_init {
                let relayer = Relayer::new(
                    manager.clone(),
                    platform_public_key.clone(),
                    offload_recipient.clone(),
                    offload_threshold.0,
                );
                let versioned = VersionedRelayer { state: relayer };
                crate::events::log_state_migrated(
                    &versioned.state,
                    "EMPTY",
                    env!("CARGO_PKG_VERSION"),
                );
                log!(
                    "Migration (init from empty) to v{} complete",
                    env!("CARGO_PKG_VERSION")
                );
                return Ok(Self { relayer: versioned });
            } else {
                log!("[MIGRATION] State is empty and force_init is false. Aborting.");
                return Err(RelayerError::InvalidState);
            }
        } else {
            VersionedRelayer::from_state_bytes_with_fallback(
                &state_bytes,
                force_init,
                manager.clone(),
                platform_public_key.clone(),
                offload_recipient.clone(),
                offload_threshold.0,
            )?
        };
        log!("Migration to v{} complete", env!("CARGO_PKG_VERSION"));
        let migrated_relayer = Relayer::migrate_with_versioned(versioned_relayer)?;
        Ok(Self {
            relayer: migrated_relayer,
        })
    }

    pub fn get_storage_usage(&self) -> u64 {
        env::storage_usage()
    }

    #[handle_result]
    pub fn process_pending_refunds(
        &mut self,
        recipient: AccountId,
    ) -> Result<Promise, RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        let relayer = self.relayer.as_mut();
        let amount = relayer.get_pending_refund(&recipient);
        if amount == 0 {
            return Err(RelayerError::InvalidInput("No pending refund".to_string()));
        }
        if env::account_balance().as_yoctonear() < amount {
            return Err(RelayerError::InsufficientBalance);
        }
        relayer.clear_refund(&recipient);
        crate::events::log_deposit_event(
            relayer,
            "withdrawn",
            &recipient,
            U128(amount),
            None,
            env::block_timestamp_ms(),
        );
        Ok(Promise::new(recipient).transfer(NearToken::from_yoctonear(amount)))
    }

    #[handle_result]
    pub fn withdraw_pending_refund(&mut self) -> Result<Promise, RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        crate::admin::withdraw_pending_refund(self.relayer.as_mut())
    }

    pub fn get_pending_refund(&self, account_id: AccountId) -> U128 {
        U128(self.relayer.as_ref().get_pending_refund(&account_id))
    }

    #[handle_result]
    pub fn set_offload_recipient(&mut self, new_recipient: AccountId) -> Result<(), RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        require_manager!(self.relayer.as_ref(), env::predecessor_account_id());
        AccountId::validate(new_recipient.as_str()).map_err(|_| {
            RelayerError::InvalidInput("Invalid offload_recipient account ID".to_string())
        })?;
        let relayer = self.relayer.as_mut();
        if relayer.offload_recipient == new_recipient {
            return Ok(());
        }
        let old = relayer.offload_recipient.clone();
        relayer.offload_recipient = new_recipient.clone();
        crate::events::log_config_changed(
            relayer,
            "offload_recipient",
            old.as_str(),
            new_recipient.as_str(),
            &env::predecessor_account_id(),
            env::block_timestamp_ms(),
        );
        Ok(())
    }

    #[handle_result]
    pub fn set_offload_threshold(&mut self, new_threshold: U128) -> Result<(), RelayerError> {
        require_not_paused!(self.relayer.as_ref());
        require_manager!(self.relayer.as_ref(), env::predecessor_account_id());
        let relayer = self.relayer.as_mut();
        // Enforce offload_threshold >= min_balance
        if new_threshold.0 < relayer.min_balance {
            return Err(RelayerError::InvalidInput(
                "Offload threshold cannot be less than min_balance".to_string(),
            ));
        }
        if relayer.offload_threshold == new_threshold.0 {
            return Ok(());
        }
        let old = relayer.offload_threshold;
        relayer.offload_threshold = new_threshold.0;
        crate::events::log_config_changed(
            relayer,
            "offload_threshold",
            &old.to_string(),
            &new_threshold.0.to_string(),
            &env::predecessor_account_id(),
            env::block_timestamp_ms(),
        );
        Ok(())
    }

    pub fn get_offload_recipient(&self) -> &AccountId {
        &self.relayer.as_ref().offload_recipient
    }

    pub fn get_offload_threshold(&self) -> U128 {
        U128(self.relayer.as_ref().offload_threshold)
    }

    #[cfg(test)]
    pub fn set_nonce_for_test(
        &mut self,
        account_id: AccountId,
        nonce: u64,
        last_updated: Option<u64>,
    ) {
        self.relayer.as_mut().set_nonce_with_timestamp(
            &account_id,
            nonce,
            last_updated.unwrap_or(env::block_timestamp_ms()),
        );
    }
}

#[derive(NearSchema, serde::Serialize, serde::Deserialize, BorshSerialize, BorshDeserialize)]
pub struct MigrateArgs {
    pub manager: AccountId,
    pub platform_public_key: PublicKey,
    pub offload_recipient: AccountId,
    pub offload_threshold: U128,
    pub force_init: bool,
    pub confirmation: Option<String>,
}

#[cfg(test)]
mod tests;
