use near_sdk::{
    env,
    serde_json::Value,
    store::LookupMap,
    AccountId,
    NearToken,
    Promise,
};
use crate::state::models::{ContractStatus, SocialPlatform, DataEntry};
use crate::events::{EventBatch, EventBuilder};
use crate::{config::GovernanceConfig, errors::*, storage::StorageKey, unauthorized, invalid_input};

pub struct UnusedDepositEventMeta<'a> {
    pub auth_type: &'a str,
    pub actor_id: &'a AccountId,
    pub payer_id: &'a AccountId,
    pub target_account: &'a AccountId,
}

impl SocialPlatform {
    #[inline(always)]
    pub fn current_caller() -> AccountId {
        env::predecessor_account_id()
    }

    /// Prefer for user-authorized actions to prevent intermediary abuse.
    #[inline(always)]
    pub fn transaction_signer() -> AccountId {
        env::signer_account_id()
    }

    #[inline(always)]
    pub fn platform_pool_account() -> AccountId {
        env::current_account_id()
    }



    #[inline(always)]
    pub fn new() -> Self {
        let manager = Self::current_caller();
        let config = GovernanceConfig::default();
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            status: ContractStatus::Genesis, // Start in Genesis mode for production safety
            manager,
            config: config.clone(),
            shared_storage_pools: LookupMap::new(StorageKey::SharedStoragePools),
            user_storage: LookupMap::new(StorageKey::UserStorage),
            group_pool_usage: LookupMap::new(StorageKey::GroupPoolUsage),
            group_sponsor_quotas: LookupMap::new(StorageKey::GroupSponsorQuotas),
            group_sponsor_defaults: LookupMap::new(StorageKey::GroupSponsorDefaults),
            execution_payer: None,
        }
    }

    pub fn storage_get(&self, key: &str) -> Option<Value> {
        if let Some(entry) = self.get_entry(key) {
            if let crate::state::models::DataValue::Value(data) = entry.value {
                serde_json::from_slice(&data).ok()
            } else {
                None
            }
        } else {
            None
        }
    }

    pub fn storage_set(&mut self, key: &str, value: &Value) -> Result<(), SocialError> {
        let serialized = serde_json::to_vec(value)
            .map_err(|_| invalid_input!("Serialization failed"))?;

        if serialized.len() > self.config.max_value_bytes as usize {
            return Err(invalid_input!("Value payload too large"));
        }
        
        let entry = DataEntry {
            value: crate::state::models::DataValue::Value(serialized),
            block_height: near_sdk::env::block_height(),
        };

        self.insert_entry(key, entry).map(|_| ())
    }

    pub fn storage_get_string(&self, key: &str) -> Option<String> {
        if let Some(entry) = self.get_entry(key) {
            if let crate::state::models::DataValue::Value(data) = entry.value {
                String::from_utf8(data).ok()
            } else {
                None
            }
        } else {
            None
        }
    }

    pub fn storage_write_string(
        &mut self,
        key: &str,
        value: &str,
        attached_balance: Option<&mut u128>,
    ) -> Result<(), SocialError> {
        let data = value.as_bytes().to_vec();

        let entry = DataEntry {
            value: crate::state::models::DataValue::Value(data),
            block_height: near_sdk::env::block_height(),
        };

        self.insert_entry_with_fallback(key, entry, attached_balance)?;
        Ok(())
    }
}

impl SocialPlatform {
    pub fn assert_storage_covered_with_platform(&self, storage: &crate::storage::Storage) -> Result<(), SocialError> {
        storage.assert_storage_covered()
    }

    /// Set the execution payer for proposal execution.
    /// When set, group path storage costs are charged to this account.
    #[inline(always)]
    pub fn set_execution_payer(&mut self, payer: AccountId) {
        self.execution_payer = Some(payer);
    }

    /// Clear the execution payer after proposal execution.
    #[inline(always)]
    pub fn clear_execution_payer(&mut self) {
        self.execution_payer = None;
    }

    #[inline(always)]
    pub fn validate_state(&self, require_manager: bool) -> Result<(), SocialError> {
        if self.status != ContractStatus::Live {
            return Err(SocialError::ContractReadOnly);
        }
        if require_manager {
            self.require_manager()?;
        }
        Ok(())
    }

    #[inline(always)]
    pub fn require_manager(&self) -> Result<(), SocialError> {
        let caller = Self::current_caller();
        if caller != self.manager {
            return Err(unauthorized!("manager_operation", caller.to_string()));
        }
        Ok(())
    }

    #[inline(always)]
    pub fn require_manager_one_yocto(&self) -> Result<(), SocialError> {
        if near_sdk::env::attached_deposit().as_yoctonear() != 1 {
            return Err(crate::invalid_input!(
                "Requires attached deposit of exactly 1 yoctoNEAR"
            ));
        }
        self.require_manager()
    }

    pub fn get_account_storage(&self, account_id: &str) -> Option<crate::storage::Storage> {
        let account_id_parsed: near_sdk::AccountId = crate::validation::parse_account_id_str_opt(account_id)?;
        self.user_storage.get(&account_id_parsed).cloned()
    }

    pub fn credit_storage_balance(&mut self, account_id: &near_sdk::AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        let mut storage = self.user_storage.get(account_id).cloned().unwrap_or_default();
        storage.balance = storage.balance.saturating_add(amount);
        self.user_storage.insert(account_id.clone(), storage);
    }

    /// Lock storage balance for proposal execution.
    /// The locked amount cannot be spent until unlocked.
    pub fn lock_storage_balance(
        &mut self,
        account_id: &AccountId,
        amount: u128,
    ) -> Result<(), SocialError> {
        let mut storage = self.user_storage.get(account_id).cloned().unwrap_or_default();
        storage.lock_balance(amount)?;
        self.user_storage.insert(account_id.clone(), storage);
        Ok(())
    }

    /// Unlock previously locked storage balance.
    pub fn unlock_storage_balance(&mut self, account_id: &AccountId, amount: u128) {
        if let Some(mut storage) = self.user_storage.get(account_id).cloned() {
            storage.unlock_balance(amount);
            self.user_storage.insert(account_id.clone(), storage);
        }
    }

    /// Finalize leftover deposit: refund or credit to storage balance.
    pub fn finalize_unused_attached_deposit(
        &mut self,
        attached_balance: &mut u128,
        deposit_owner: &AccountId,
        refund_unused_deposit: bool,
        reason: &'static str,
        event_batch: &mut EventBatch,
        meta: Option<UnusedDepositEventMeta<'_>>,
    ) -> Result<(), SocialError> {
        let amount = *attached_balance;
        if amount == 0 {
            return Ok(());
        }

        if refund_unused_deposit {
            Promise::new(deposit_owner.clone())
                .transfer(NearToken::from_yoctonear(amount))
                .detach();

            let mut builder = EventBuilder::new(
                crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                "refund_unused_deposit",
                deposit_owner.clone(),
            )
            .with_field("amount", amount.to_string());

            if let Some(meta) = meta {
                builder = builder
                    .with_field("auth_type", meta.auth_type)
                    .with_field("actor_id", meta.actor_id.to_string())
                    .with_field("payer_id", meta.payer_id.to_string())
                    .with_target(meta.target_account);
            }

            builder.emit(event_batch);
        } else {
            self.credit_storage_balance(deposit_owner, amount);

            let mut builder = EventBuilder::new(
                crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                "auto_deposit",
                deposit_owner.clone(),
            )
            .with_field("amount", amount.to_string())
            .with_field("reason", reason);

            if let Some(meta) = meta {
                builder = builder
                    .with_field("auth_type", meta.auth_type)
                    .with_field("actor_id", meta.actor_id.to_string())
                    .with_field("payer_id", meta.payer_id.to_string())
                    .with_target(meta.target_account);
            }

            builder.emit(event_batch);
        }

        *attached_balance = 0;
        Ok(())
    }
}

impl Default for SocialPlatform {
    fn default() -> Self {
        Self::new()
    }
}
