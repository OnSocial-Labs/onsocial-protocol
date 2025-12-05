// --- Imports ---
use near_sdk::AccountId;
use serde_json::Value;
use std::collections::HashMap;

use crate::state::models::SocialPlatform;

// --- Impl ---
impl SocialPlatform {
    /// Get data with direct lookups. Pagination handled off-chain by UI.
    /// 
    /// NOTE: This is a view function. If keys don't contain account prefixes,
    /// either provide `account_id` or use full paths like "alice.near/posts/1".
    pub fn get(
        &self,
        keys: Vec<String>,           // Exact keys to fetch
        account_id: Option<AccountId>,
        data_type: Option<String>,   // Single item lookup by type
        include_metadata: Option<bool>,
    ) -> HashMap<String, Value> {
        // For view calls, we can't use predecessor_account_id.
        // If account_id is not provided, we'll only work with full paths in keys.
        // Keys like "alice.near/posts/1" or "groups/mygroup/config" work without account_id.

        // If data_type is specified, account_id is required
        if let Some(ref dtype) = data_type {
            if let Some(ref acct) = account_id {
                return self.get_by_type(acct, dtype, include_metadata);
            }
            // Can't get by type without account_id in view call
            return HashMap::new();
        }

        // Direct lookups for specific keys only
        if !keys.is_empty() {
            // Pass account_id as Option - get_specific_keys will handle full paths
            return self.get_specific_keys_view(&keys, account_id.as_ref(), include_metadata);
        }

        // No iteration - return empty
        HashMap::new()
    }

    /// Get specific keys with direct lookups (no iteration needed)
    /// Supports view calls - doesn't require predecessor_account_id
    /// 
    /// ## Blockchain Transparency
    /// 
    /// ⚠️ All data on NEAR blockchain is publicly readable via RPC regardless of contract logic.
    /// This method returns any requested data without permission checks because:
    /// 
    /// 1. **Blockchain Reality**: Anyone can call `near view-state` and read all contract storage
    /// 2. **Honest Design**: No false sense of privacy through "permission checks"
    /// 3. **Performance**: No unnecessary permission validation overhead
    /// 
    /// ## Privacy Options for Applications
    /// 
    /// Applications should implement privacy at these layers:
    /// 
    /// - **UI Layer**: Hide private group content in the interface (social convention)
    /// - **Encryption**: Encrypt sensitive data client-side before storing
    /// - **Off-chain**: Store private content on IPFS/Arweave with access control
    /// 
    /// **"Private groups" control membership (who can join/post), NOT data visibility.**
    fn get_specific_keys_view(&self, keys: &[String], account_id: Option<&AccountId>, include_metadata: Option<bool>) -> HashMap<String, Value> {
        let mut results = HashMap::new();

        for key in keys {
            // Determine if key is full path or relative
            let full_path = if key.starts_with("groups/") || 
                (key.contains('/') && AccountId::try_from(key.split('/').next().unwrap().to_string()).is_ok()) {
                // Key is full path like "alice.near/posts/post1" or "groups/mygroup/config"
                key.clone()
            } else if let Some(acct) = account_id {
                // Key is relative to account_id like "posts/post1"
                format!("{}/{}", acct, key)
            } else {
                // No account_id and not a full path - skip this key
                continue;
            };

            // No permission checks - blockchain data is public by design
            if include_metadata.unwrap_or(false) {
                // Return both data and metadata
                if let Some(entry) = self.get_entry(&full_path) {
                    if let crate::state::models::DataValue::Value(data) = &entry.value {
                        if let Ok(data_value) = serde_json::from_slice::<Value>(data) {
                            let metadata_value = if entry.metadata.is_empty() {
                                Value::Null
                            } else {
                                serde_json::from_slice::<Value>(&entry.metadata).unwrap_or(Value::Null)
                            };
                            
                            let mut combined = serde_json::Map::new();
                            combined.insert("data".to_string(), data_value);
                            combined.insert("metadata".to_string(), metadata_value);
                            results.insert(key.clone(), Value::Object(combined));
                        }
                    }
                }
            } else {
                // Use storage_get for direct key lookup with full path
                if let Some(value) = self.storage_get(&full_path) {
                    results.insert(key.clone(), value);
                }
            }
        }

        results
    }

    /// Get data by type - single item lookups
    fn get_by_type(
        &self,
        account_id: &AccountId,
        data_type: &str,
        include_metadata: Option<bool>,
    ) -> HashMap<String, Value> {
        match data_type {
            "config" => {
                // Direct config lookup
                let config_key = format!("groups/{}/config", account_id);
                let mut results = HashMap::new();
                
                if include_metadata.unwrap_or(false) {
                    if let Some(entry) = self.get_entry(&config_key) {
                        if let crate::state::models::DataValue::Value(data) = &entry.value {
                            if let Ok(data_value) = serde_json::from_slice::<Value>(data) {
                                let metadata_value = if entry.metadata.is_empty() {
                                    Value::Null
                                } else {
                                    serde_json::from_slice::<Value>(&entry.metadata).unwrap_or(Value::Null)
                                };
                                
                                let mut combined = serde_json::Map::new();
                                combined.insert("data".to_string(), data_value);
                                combined.insert("metadata".to_string(), metadata_value);
                                results.insert("config".to_string(), Value::Object(combined));
                            }
                        }
                    }
                } else if let Some(value) = self.storage_get(&config_key) {
                    results.insert("config".to_string(), value);
                }
                results
            }
            _ => HashMap::new(),
        }
    }

}