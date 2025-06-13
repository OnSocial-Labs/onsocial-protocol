use crate::state::{EventConfig, Relayer};
use crate::state_versions::VersionedRelayer;
use crate::types::SignedDelegateAction;
use near_sdk::json_types::U128;
use near_sdk::{
    env, near, require, AccountId, Gas, NearSchema, NearToken, PanicOnDefault, Promise, PublicKey,
};
use near_sdk_macros::ext_contract;

// Module declarations
mod errors;
mod events;
mod state;
mod state_versions;
#[cfg(test)]
mod tests;

// Define external contract trait for callbacks
#[ext_contract(ext_self)]
pub trait SelfCallback {
    fn handle_auth_result(
        &mut self,
        sender_id: AccountId,
        signed_delegate: SignedDelegateAction,
        sponsor_amount: u128,
        gas: u64,
        is_authorized: bool,
    ) -> Promise;
}

// Main contract struct
#[near(contract_state)]
#[derive(PanicOnDefault, NearSchema)]
#[abi(borsh)]
pub struct OnSocialRelayer {
    relayer: VersionedRelayer,
}

#[near]
impl OnSocialRelayer {
    // Initialize contract
    #[init]
    #[private]
    pub fn new(
        manager: AccountId,
        manager_public_key: PublicKey,
        offload_recipient: AccountId,
        whitelist: Vec<AccountId>,
    ) -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Unauthorized"
        );
        Self {
            relayer: VersionedRelayer::Current(Relayer::new(
                manager,
                manager_public_key,
                offload_recipient,
                whitelist,
            )),
        }
    }

    // Deposit funds
    #[payable]
    pub fn deposit(&mut self) {
        deposit(self.relayer.as_mut()).unwrap()
    }

    // Sponsor a transaction
    #[payable]
    pub fn sponsor_transaction(
        &mut self,
        #[serde(crate = "near_sdk::serde")] signed_delegate: SignedDelegateAction,
        sponsor_amount: U128,
        gas: u64,
        signature: Vec<u8>,
        proxy_for: Option<AccountId>,
    ) -> Promise {
        const REQUIRED_GAS: Gas = Gas::from_tgas(50);
        require!(
            env::prepaid_gas() >= REQUIRED_GAS,
            "Attach at least 50 TGas"
        );
        sponsor_transaction(
            self.relayer.as_mut(),
            signed_delegate,
            sponsor_amount.0,
            gas,
            signature,
            proxy_for,
        )
        .unwrap()
    }

    // Handle authorization result (callback)
    #[private]
    pub fn handle_auth_result(
        &mut self,
        sender_id: AccountId,
        #[serde(crate = "near_sdk::serde")] signed_delegate: SignedDelegateAction,
        sponsor_amount: u128,
        gas: u64,
        #[callback_unwrap] is_authorized: bool,
    ) -> Promise {
        handle_auth_result(
            self.relayer.as_mut(),
            sender_id,
            signed_delegate,
            sponsor_amount,
            gas,
            is_authorized,
        )
        .unwrap()
    }

    // Admin methods
    pub fn set_manager(&mut self, new_manager: AccountId, new_public_key: PublicKey) {
        set_manager(self.relayer.as_mut(), new_manager, new_public_key).unwrap()
    }

    pub fn set_min_balance(&mut self, new_min: U128) {
        set_min_balance(self.relayer.as_mut(), new_min.0).unwrap()
    }

    pub fn set_max_balance(&mut self, new_max: U128) {
        set_max_balance(self.relayer.as_mut(), new_max.0).unwrap()
    }

    pub fn set_offload_recipient(&mut self, new_recipient: AccountId) {
        set_offload_recipient(self.relayer.as_mut(), new_recipient).unwrap()
    }

    pub fn add_to_whitelist(&mut self, account_id: AccountId) {
        add_to_whitelist(self.relayer.as_mut(), account_id).unwrap()
    }

    pub fn remove_from_whitelist(&mut self, account_id: AccountId) {
        remove_from_whitelist(self.relayer.as_mut(), account_id).unwrap()
    }

    // View methods
    #[view]
    pub fn is_whitelisted(&self, account_id: AccountId) -> bool {
        *self
            .relayer
            .as_ref()
            .whitelist
            .get(&account_id)
            .unwrap_or(&false)
    }

    pub fn set_debug_mode(&mut self, enabled: bool) {
        require!(
            self.relayer
                .as_ref()
                .is_manager(&env::predecessor_account_id()),
            "Unauthorized"
        );
        self.relayer.as_mut().debug_mode = enabled;
    }

    pub fn set_event_transaction_processed(&mut self, enabled: bool) {
        require!(
            self.relayer
                .as_ref()
                .is_manager(&env::predecessor_account_id()),
            "Unauthorized"
        );
        self.relayer
            .as_mut()
            .event_config
            .enable_transaction_processed = enabled;
    }

    pub fn set_event_transaction_rejected(&mut self, enabled: bool) {
        require!(
            self.relayer
                .as_ref()
                .is_manager(&env::predecessor_account_id()),
            "Unauthorized"
        );
        self.relayer
            .as_mut()
            .event_config
            .enable_transaction_rejected = enabled;
    }

    pub fn set_event_deposit_received(&mut self, enabled: bool) {
        require!(
            self.relayer
                .as_ref()
                .is_manager(&env::predecessor_account_id()),
            "Unauthorized"
        );
        self.relayer.as_mut().event_config.enable_deposit_received = enabled;
    }

    pub fn set_event_funds_offloaded(&mut self, enabled: bool) {
        require!(
            self.relayer
                .as_ref()
                .is_manager(&env::predecessor_account_id()),
            "Unauthorized"
        );
        self.relayer.as_mut().event_config.enable_funds_offloaded = enabled;
    }

    pub fn set_event_manager_changed(&mut self, enabled: bool) {
        require!(
            self.relayer
                .as_ref()
                .is_manager(&env::predecessor_account_id()),
            "Unauthorized"
        );
        self.relayer.as_mut().event_config.enable_manager_changed = enabled;
    }

    pub fn set_event_contract_upgraded(&mut self, enabled: bool) {
        require!(
            self.relayer
                .as_ref()
                .is_manager(&env::predecessor_account_id()),
            "Unauthorized"
        );
        self.relayer.as_mut().event_config.enable_contract_upgraded = enabled;
    }

    pub fn set_event_state_migrated(&mut self, enabled: bool) {
        require!(
            self.relayer
                .as_ref()
                .is_manager(&env::predecessor_account_id()),
            "Unauthorized"
        );
        self.relayer.as_mut().event_config.enable_state_migrated = enabled;
    }

    pub fn set_event_whitelist_changed(&mut self, enabled: bool) {
        require!(
            self.relayer
                .as_ref()
                .is_manager(&env::predecessor_account_id()),
            "Unauthorized"
        );
        self.relayer.as_mut().event_config.enable_whitelist_changed = enabled;
    }

    // Contract upgrade
    #[private]
    pub fn update_contract(&mut self, migrate_gas: u64) -> Promise {
        const REQUIRED_GAS: Gas = Gas::from_tgas(50);
        require!(migrate_gas <= REQUIRED_GAS.as_gas(), "Gas exceeds 50 TGas");
        let predecessor = env::predecessor_account_id();
        require!(
            self.relayer.as_ref().is_manager(&predecessor),
            "Unauthorized"
        );
        let code = env::input().expect("Missing input").to_vec();
        if self.relayer.as_ref().event_config.enable_contract_upgraded {
            RelayerEvent::ContractUpgraded {
                manager: predecessor,
                timestamp: env::block_timestamp_ms(),
            }
            .emit();
        }
        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                Gas::from_gas(migrate_gas),
            )
    }

    // Additional view methods
    #[view]
    pub fn get_balance(&self) -> U128 {
        U128(env::account_balance().as_yoctonear())
    }

    #[view]
    pub fn get_min_balance(&self) -> U128 {
        U128(self.relayer.as_ref().min_balance)
    }

    #[view]
    pub fn get_max_balance(&self) -> U128 {
        U128(self.relayer.as_ref().max_balance)
    }

    #[view]
    pub fn get_offload_recipient(&self) -> AccountId {
        self.relayer.as_ref().offload_recipient.clone()
    }

    #[view]
    pub fn get_nonce(&self, account_id: AccountId) -> u64 {
        self.relayer.as_ref().get_nonce(&account_id)
    }

    #[view]
    #[result_serializer(borsh)]
    pub fn get_manager(&self) -> (AccountId, PublicKey) {
        (
            self.relayer.as_ref().manager.clone(),
            self.relayer.as_ref().manager_public_key.clone(),
        )
    }

    #[view]
    pub fn get_debug_mode(&self) -> bool {
        self.relayer.as_ref().debug_mode
    }

    #[view]
    #[result_serializer(borsh)]
    pub fn get_event_config(&self) -> EventConfig {
        self.relayer.as_ref().event_config.clone()
    }

    // State migration
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let storage_before = env::storage_usage();
        let new_state = Self {
            relayer: Relayer::migrate(),
        };
        let storage_after = env::storage_usage();
        env::log_str(&format!(
            "Migration storage change: {} bytes",
            storage_after.saturating_sub(storage_before)
        ));
        new_state
    }
}
