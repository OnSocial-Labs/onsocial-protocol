// --- Storage Operations Module ---
// Extracted from platform.rs to separate storage concerns from core platform logic
// Uses social-db pattern: track at operation level, not at storage_write level

use crate::state::models::{DataEntry, SocialPlatform};

// REMOVED: write_with_tracking() - tracking now happens at the insert_entry level
// This matches the social-db pattern where tracking wraps the entire operation

impl SocialPlatform {
    /// Get entry from unified sharded storage using plan3.md scheme.
    /// Returns None if the entry doesn't exist.
    /// Note: This method returns soft-deleted entries; filtering happens in the get() method.
    pub fn get_entry(&self, full_path: &str) -> Option<DataEntry> {
        // NOTE: Permission keys now use normal sharded paths (groups/{id}/permissions/* or {account}/permissions/*)
        // No special case needed - they go through the standard sharding system below
        
        // Special case for shared storage keys (they don't follow normal path structure)
        if full_path.contains(crate::constants::SHARED_STORAGE_KEY_SUFFIX) {
            let unified_key = crate::storage::sharding::make_unified_key("accounts", full_path, "");
            if let Some(serialized) = near_sdk::env::storage_read(unified_key.as_bytes()) {
                if let Ok(entry) = borsh::from_slice::<DataEntry>(&serialized) {
                    return Some(entry);
                }
            }
            return None;
        }

        // Parse path to determine namespace and extract components
        let (namespace, namespace_id, relative_path) = if let Some((group_id, rel_path)) = crate::storage::utils::parse_groups_path(full_path) {
            ("groups", group_id, rel_path)
        } else if let Some((account_id, rel_path)) = crate::storage::utils::parse_path(full_path) {
            ("accounts", account_id, rel_path)
        } else {
            return None; // Invalid path format
        };

        // Generate unified key using plan3.md scheme
        let unified_key = crate::storage::sharding::make_unified_key(namespace, namespace_id, relative_path);
        
        // Direct storage lookup using unified sharding
        if let Some(serialized) = near_sdk::env::storage_read(unified_key.as_bytes()) {
            if let Ok(entry) = borsh::from_slice::<DataEntry>(&serialized) {
                // Check if entry is soft deleted - soft deleted entries should be visible
                // to preserve data integrity
                if matches!(entry.value, crate::state::models::DataValue::Deleted(_)) {
                    return Some(entry);
                }

                return Some(entry);
            }
        }
        
        None
    }

    /// Insert or replace an entry at `full_path` using unified sharding.
    /// Uses plan3.md scheme for O(1) storage operations with runtime tracking.
    /// Follows social-db pattern: track entire operation including serialization overhead.
    /// Returns previous entry if any.
    pub fn insert_entry(&mut self, full_path: &str, entry: DataEntry) -> Result<Option<DataEntry>, crate::errors::SocialError> {
        // NOTE: Permission keys now use normal sharded paths (groups/{id}/permissions/* or {account}/permissions/*)
        // No special case needed - they go through the standard sharding system below
        
        // Special case for shared storage keys (they don't follow normal path structure)
        if full_path.contains(crate::constants::SHARED_STORAGE_KEY_SUFFIX) {
            let unified_key = crate::storage::sharding::make_unified_key("accounts", full_path, "");
            
            // Get existing entry for return value (before tracking starts)
            let existing_entry = if let Some(serialized) = near_sdk::env::storage_read(unified_key.as_bytes()) {
                borsh::from_slice::<DataEntry>(&serialized).ok()
            } else {
                None
            };

            // Serialize the new entry
            let serialized_entry = match borsh::to_vec(&entry) {
                Ok(data) => data,
                Err(_) => return Ok(None),
            };

            // Determine account owner
            let owner = full_path.split('/').next().unwrap_or(full_path);
            let account_id = owner.parse::<near_sdk::AccountId>()
                .map_err(|_| crate::errors::SocialError::InvalidInput("Invalid account ID".to_string()))?;

            // Get or create storage for tracking
            let mut storage = self.user_storage.get(&account_id).cloned().unwrap_or_default();

            // Start tracking BEFORE storage operations
            storage.storage_tracker.start_tracking();

            // Perform storage write
            near_sdk::env::storage_write(unified_key.as_bytes(), &serialized_entry);

            // Stop tracking AFTER storage operations
            storage.storage_tracker.stop_tracking();
            
            // Apply delta to usage counters
            let delta = storage.storage_tracker.delta();
            if delta > 0 {
                storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
                
                // Handle shared storage allocation if present
                if let Some(shared) = storage.shared_storage.as_mut() {
                    shared.used_bytes = shared.used_bytes.saturating_add(delta as u64);
                    
                    // Update pool usage
                    if let Some(pool) = self.shared_storage_pools.get(&shared.pool_id) {
                        let mut updated_pool = pool.clone();
                        updated_pool.used_bytes = updated_pool.used_bytes.saturating_add(delta as u64);
                        self.shared_storage_pools.insert(shared.pool_id.clone(), updated_pool);
                    }
                }
            } else if delta < 0 {
                let abs_bytes = delta.unsigned_abs();
                storage.used_bytes = storage.used_bytes.saturating_sub(abs_bytes);
                
                // Handle shared storage deallocation if present
                if let Some(shared) = storage.shared_storage.as_mut() {
                    shared.used_bytes = shared.used_bytes.saturating_sub(abs_bytes);
                    
                    // Update pool usage
                    if let Some(pool) = self.shared_storage_pools.get(&shared.pool_id) {
                        let mut updated_pool = pool.clone();
                        updated_pool.used_bytes = updated_pool.used_bytes.saturating_sub(abs_bytes);
                        self.shared_storage_pools.insert(shared.pool_id.clone(), updated_pool);
                    }
                }
            }
            
            // Reset tracker after applying changes
            storage.storage_tracker.reset();
            
            // Assert storage coverage
            storage.assert_storage_covered()?;
            
            // Save updated storage
            self.user_storage.insert(account_id, storage);

            return Ok(existing_entry);
        }

        // Parse path to determine namespace and extract components
        let (namespace, namespace_id, relative_path) = if let Some((group_id, rel_path)) = crate::storage::utils::parse_groups_path(full_path) {
            ("groups", group_id, rel_path)
        } else if let Some((account_id, rel_path)) = crate::storage::utils::parse_path(full_path) {
            ("accounts", account_id, rel_path)
        } else {
            return Ok(None); // Invalid path format
        };

        // Generate unified key using plan3.md scheme
        let unified_key = crate::storage::sharding::make_unified_key(namespace, namespace_id, relative_path);

        // Get existing entry for return value (before tracking starts)
        let existing_entry = if let Some(serialized) = near_sdk::env::storage_read(unified_key.as_bytes()) {
            borsh::from_slice::<DataEntry>(&serialized).ok()
        } else {
            None
        };

        // Serialize the new entry
        let serialized_entry = match borsh::to_vec(&entry) {
            Ok(data) => data,
            Err(_) => return Ok(None), // Serialization failed
        };

        // Determine who pays for storage
        let account_id = if namespace == "groups" {
            // For group operations, charge the predecessor account (caller/executor)
            // Storage allocation happens at the API level for both direct calls and governance executions
            near_sdk::env::predecessor_account_id()
        } else {
            namespace_id.parse::<near_sdk::AccountId>()
                .map_err(|_| crate::errors::SocialError::InvalidInput("Invalid account ID".to_string()))?
        };

        // Get or create storage for tracking
        let mut storage = self.user_storage.get(&account_id).cloned().unwrap_or_default();

        // Start tracking BEFORE storage operations
        storage.storage_tracker.start_tracking();

        // Perform storage write
        near_sdk::env::storage_write(unified_key.as_bytes(), &serialized_entry);

        // Stop tracking AFTER storage operations
        storage.storage_tracker.stop_tracking();
        
        // Apply delta to usage counters
        let delta = storage.storage_tracker.delta();
        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
            
            // Handle shared storage allocation if present
            if let Some(shared) = storage.shared_storage.as_mut() {
                shared.used_bytes = shared.used_bytes.saturating_add(delta as u64);
                
                // Update pool usage
                if let Some(pool) = self.shared_storage_pools.get(&shared.pool_id) {
                    let mut updated_pool = pool.clone();
                    updated_pool.used_bytes = updated_pool.used_bytes.saturating_add(delta as u64);
                    self.shared_storage_pools.insert(shared.pool_id.clone(), updated_pool);
                }
            }
        } else if delta < 0 {
            let abs_bytes = delta.unsigned_abs();
            storage.used_bytes = storage.used_bytes.saturating_sub(abs_bytes);
            
            // Handle shared storage deallocation if present
            if let Some(shared) = storage.shared_storage.as_mut() {
                shared.used_bytes = shared.used_bytes.saturating_sub(abs_bytes);
                
                // Update pool usage
                if let Some(pool) = self.shared_storage_pools.get(&shared.pool_id) {
                    let mut updated_pool = pool.clone();
                    updated_pool.used_bytes = updated_pool.used_bytes.saturating_sub(abs_bytes);
                    self.shared_storage_pools.insert(shared.pool_id.clone(), updated_pool);
                }
            }
        }
        
        // Reset tracker after applying changes
        storage.storage_tracker.reset();
        
        // Assert storage coverage
        storage.assert_storage_covered()?;
        
        // Save updated storage
        self.user_storage.insert(account_id, storage);

        Ok(existing_entry)
    }

    // REMOVED: remove_entry() - old implementation no longer used
    // Use soft_delete_entry() or proper API methods (remove_group_member, etc.) instead
}
