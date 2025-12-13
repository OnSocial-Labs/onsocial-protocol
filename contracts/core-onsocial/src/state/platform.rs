// --- Imports ---
use near_sdk::{
    env,
    serde_json::Value,
    store::LookupMap,
    AccountId,
};
// borsh helpers are used via `borsh::from_slice` / `borsh::to_vec` directly

use crate::state::models::{ContractStatus, SocialPlatform, DataEntry};
use crate::{config::GovernanceConfig, errors::*, storage::StorageKey, unauthorized, invalid_input};
use crate::validation::validate_account_id;

// --- Impl ---
impl SocialPlatform {
    /// Get the immediate caller (contract or user that directly called this method)
    /// Use this for contract integrations where the contract itself needs permissions
    #[inline(always)]
    pub fn current_caller() -> AccountId {
        env::predecessor_account_id()
    }

    /// Get the original transaction signer (the actual user who signed the transaction)
    /// Use this for user-centric operations to prevent permission abuse via intermediary contracts
    /// 
    /// SECURITY: This prevents malicious contracts from using delegated permissions
    /// when called by other users. Only the original signer can authorize the action.
    #[inline(always)]
    pub fn transaction_signer() -> AccountId {
        env::signer_account_id()
    }



    #[inline(always)]
    pub fn new() -> Self {
        let manager = Self::current_caller();
        // Use cached validation instead of direct env call
        if validate_account_id(&manager).is_err() {
            env::panic_str(ERR_INVALID_ACCOUNT_ID);
        }
        let config = GovernanceConfig::default();
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            status: ContractStatus::Genesis, // Start in Genesis mode for production safety
            manager,
            config: config.clone(),
            shared_storage_pools: LookupMap::new(StorageKey::SharedStoragePools.as_vec()),
            user_storage: LookupMap::new(StorageKey::UserStorage.as_vec()),
        }
    }

    /// Simple storage get operation - O(1) lookup
    pub fn storage_get(&self, key: &str) -> Option<Value> {
        // Use the updated get_entry method which handles both KV and IterableMap storage
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

    /// Simple storage set operation - O(1) write
    pub fn storage_set(&mut self, key: &str, value: &Value) -> Result<(), SocialError> {
        let serialized = serde_json::to_vec(value)
            .map_err(|_| invalid_input!("Serialization failed"))?;
        
        let entry = DataEntry {
            value: crate::state::models::DataValue::Value(serialized),
            metadata: vec![],
            block_height: near_sdk::env::block_height(),
            tags: vec![],
        };

        // Use the updated insert_entry method which handles both KV and IterableMap storage
        self.insert_entry(key, entry).map(|_| ())
    }

    /// Get string value from storage (for direct KV permissions)
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

    /// Write string value to storage (for direct KV permissions)
    pub fn storage_write_string(&mut self, key: &str, value: &str) -> Result<(), SocialError> {
        let data = value.as_bytes().to_vec();

        let entry = DataEntry {
            value: crate::state::models::DataValue::Value(data),
            metadata: vec![],
            block_height: near_sdk::env::block_height(),
            tags: vec![],
        };

        // Use the updated insert_entry method which handles both KV and IterableMap storage
        self.insert_entry(key, entry).map(|_| ())
    }

    // REMOVED: storage_remove() - old implementation no longer used
    // Use proper API methods for data removal (soft deletes via set with null, member removal APIs, etc.)
}

impl SocialPlatform {
















    #[inline(always)]
    pub fn validate_state(&self, require_manager: bool) -> Result<(), SocialError> {
        if self.status != ContractStatus::Live {
            return Err(SocialError::ContractReadOnly);
        }
        if require_manager && Self::current_caller() != self.manager {
            return Err(unauthorized!(
                "manager_operation",
                Self::current_caller().to_string()
            ));
        }
        Ok(())
    }
}

// --- Default Implementation ---
impl Default for SocialPlatform {
    fn default() -> Self {
        Self::new()
    }
}
