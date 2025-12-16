// --- Storage Operations Module ---
// Extracted from platform.rs to separate storage concerns from core platform logic
// Uses social-db pattern: track at operation level, not at storage_write level

use crate::state::models::{DataEntry, SocialPlatform};

// REMOVED: write_with_tracking() - tracking now happens at the insert_entry level
// This matches the social-db pattern where tracking wraps the entire operation

impl SocialPlatform {
    /// Get entry from storage using simple key format.
    /// Returns None if the entry doesn't exist.
    /// Note: This method returns soft-deleted entries; filtering happens in the get() method.
    pub fn get_entry(&self, full_path: &str) -> Option<DataEntry> {
        // NOTE: Permission keys use normal paths (groups/{id}/permissions/* or {account}/permissions/*)
        // No special case needed - they go through the standard system below
        
        // Special case for shared storage keys (they don't follow normal path structure)
        if full_path.contains(crate::constants::SHARED_STORAGE_KEY_SUFFIX) {
            let key = crate::storage::keys::make_key("accounts", full_path, "");
            if let Some(serialized) = near_sdk::env::storage_read(key.as_bytes()) {
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

        // Generate simple storage key
        let key = crate::storage::keys::make_key(namespace, namespace_id, relative_path);
        
        // Direct storage lookup
        if let Some(serialized) = near_sdk::env::storage_read(key.as_bytes()) {
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

    /// Insert or replace an entry at `full_path` using simple key format.
    /// Follows social-db pattern: track entire operation including serialization overhead.
    /// Returns previous entry if any.
    pub fn insert_entry(&mut self, full_path: &str, entry: DataEntry) -> Result<Option<DataEntry>, crate::errors::SocialError> {
        self.insert_entry_with_fallback(full_path, entry, None)
    }

    /// Insert entry with optional attached_balance fallback for auto-deposit when pool exhausts.
    /// Priority: Platform Pool → Shared Pool → Personal Balance → Attached Deposit
    pub fn insert_entry_with_fallback(
        &mut self,
        full_path: &str,
        entry: DataEntry,
        mut attached_balance: Option<&mut u128>,
    ) -> Result<Option<DataEntry>, crate::errors::SocialError> {
        // NOTE: Permission keys use normal paths (groups/{id}/permissions/* or {account}/permissions/*)
        // No special case needed - they go through the standard system below
        
        // Special case for shared storage keys (they don't follow normal path structure)
        if full_path.contains(crate::constants::SHARED_STORAGE_KEY_SUFFIX) {
            let key = crate::storage::keys::make_key("accounts", full_path, "");
            
            // Get existing entry for return value (before tracking starts)
            let existing_entry = if let Some(serialized) = near_sdk::env::storage_read(key.as_bytes()) {
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
            near_sdk::env::storage_write(key.as_bytes(), &serialized_entry);

            // Stop tracking AFTER storage operations
            storage.storage_tracker.stop_tracking();
            
            // Apply delta to usage counters
            let delta = storage.storage_tracker.delta();
            if delta > 0 {
                storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
                
                // Handle shared storage allocation if present (group-level sponsorship)
                if let Some(shared) = storage.shared_storage.as_mut() {
                    shared.used_bytes = shared.used_bytes.saturating_add(delta as u64);
                    
                    // Update pool usage
                    if let Some(pool) = self.shared_storage_pools.get(&shared.pool_id) {
                        let mut updated_pool = pool.clone();
                        updated_pool.used_bytes = updated_pool.used_bytes.saturating_add(delta as u64);
                        self.shared_storage_pools.insert(shared.pool_id.clone(), updated_pool);
                    }
                }
                // Handle platform-sponsored users (on-demand from platform pool)
                else if storage.platform_sponsored {
                    let platform_account = Self::platform_pool_account();
                    // Check if pool has enough capacity for this delta
                    let pool_has_capacity = if let Some(pool) = self.shared_storage_pools.get(&platform_account) {
                        let total_capacity = (pool.storage_balance / near_sdk::env::storage_byte_cost().as_yoctonear()) as u64;
                        pool.used_bytes.saturating_add(delta as u64) <= total_capacity
                    } else {
                        false
                    };
                    
                    if pool_has_capacity {
                        // Pool can cover - add to pool
                        if let Some(pool) = self.shared_storage_pools.get(&platform_account) {
                            let mut updated_pool = pool.clone();
                            updated_pool.used_bytes = updated_pool.used_bytes.saturating_add(delta as u64);
                            self.shared_storage_pools.insert(platform_account, updated_pool);
                        }
                    } else {
                        // Pool exhausted - gracefully fall back to personal balance
                        // The assert_storage_covered check at the end will verify personal balance
                        storage.platform_sponsored = false;
                    }
                }
            } else if delta < 0 {
                let abs_bytes = delta.unsigned_abs();
                storage.used_bytes = storage.used_bytes.saturating_sub(abs_bytes);
                
                // Handle shared storage deallocation if present (group-level sponsorship)
                if let Some(shared) = storage.shared_storage.as_mut() {
                    shared.used_bytes = shared.used_bytes.saturating_sub(abs_bytes);
                    
                    // Update pool usage
                    if let Some(pool) = self.shared_storage_pools.get(&shared.pool_id) {
                        let mut updated_pool = pool.clone();
                        updated_pool.used_bytes = updated_pool.used_bytes.saturating_sub(abs_bytes);
                        self.shared_storage_pools.insert(shared.pool_id.clone(), updated_pool);
                    }
                }
                // Handle platform-sponsored users (on-demand from platform pool)
                else if storage.platform_sponsored {
                    let platform_account = Self::platform_pool_account();
                    // Update platform pool usage in real-time
                    if let Some(pool) = self.shared_storage_pools.get(&platform_account) {
                        let mut updated_pool = pool.clone();
                        updated_pool.used_bytes = updated_pool.used_bytes.saturating_sub(abs_bytes);
                        self.shared_storage_pools.insert(platform_account, updated_pool);
                    }
                }
            }
            
            // Reset tracker after applying changes
            storage.storage_tracker.reset();
            
            // Assert storage coverage with attached deposit fallback
            // Priority chain: Platform Pool → Shared Pool → Personal Balance → Attached Deposit
            if let Err(_) = self.assert_storage_covered_with_platform(&storage) {
                // Coverage failed - try auto-deposit from attached_balance as final fallback
                if let Some(ref mut balance) = attached_balance {
                    if **balance > 0 {
                        // Auto-deposit remaining attached balance
                        let deposit_amount = **balance;
                        storage.balance = storage.balance.saturating_add(deposit_amount);
                        **balance = 0;
                        // Re-check coverage after deposit
                        self.assert_storage_covered_with_platform(&storage)?;
                    } else {
                        // No attached balance - fail with original error
                        self.assert_storage_covered_with_platform(&storage)?;
                    }
                } else {
                    // No attached_balance context - fail with original error
                    self.assert_storage_covered_with_platform(&storage)?;
                }
            }
            
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

        // Generate simple storage key
        let key = crate::storage::keys::make_key(namespace, namespace_id, relative_path);

        // Get existing entry for return value (before tracking starts)
        let existing_entry = if let Some(serialized) = near_sdk::env::storage_read(key.as_bytes()) {
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
        near_sdk::env::storage_write(key.as_bytes(), &serialized_entry);

        // Stop tracking AFTER storage operations
        storage.storage_tracker.stop_tracking();
        
        // Apply delta to usage counters
        let delta = storage.storage_tracker.delta();
        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
            
            // Handle shared storage allocation if present (group-level sponsorship)
            if let Some(shared) = storage.shared_storage.as_mut() {
                shared.used_bytes = shared.used_bytes.saturating_add(delta as u64);
                
                // Update pool usage
                if let Some(pool) = self.shared_storage_pools.get(&shared.pool_id) {
                    let mut updated_pool = pool.clone();
                    updated_pool.used_bytes = updated_pool.used_bytes.saturating_add(delta as u64);
                    self.shared_storage_pools.insert(shared.pool_id.clone(), updated_pool);
                }
            }
            // Handle platform-sponsored users (on-demand from platform pool)
            else if storage.platform_sponsored {
                let platform_account = Self::platform_pool_account();
                // Check if pool has enough capacity for this delta
                let pool_has_capacity = if let Some(pool) = self.shared_storage_pools.get(&platform_account) {
                    let total_capacity = (pool.storage_balance / near_sdk::env::storage_byte_cost().as_yoctonear()) as u64;
                    pool.used_bytes.saturating_add(delta as u64) <= total_capacity
                } else {
                    false
                };
                
                if pool_has_capacity {
                    // Pool can cover - add to pool
                    if let Some(pool) = self.shared_storage_pools.get(&platform_account) {
                        let mut updated_pool = pool.clone();
                        updated_pool.used_bytes = updated_pool.used_bytes.saturating_add(delta as u64);
                        self.shared_storage_pools.insert(platform_account, updated_pool);
                    }
                } else {
                    // Pool exhausted - gracefully fall back to personal balance
                    // The assert_storage_covered check at the end will verify personal balance
                    storage.platform_sponsored = false;
                }
            }
        } else if delta < 0 {
            let abs_bytes = delta.unsigned_abs();
            storage.used_bytes = storage.used_bytes.saturating_sub(abs_bytes);
            
            // Handle shared storage deallocation if present (group-level sponsorship)
            if let Some(shared) = storage.shared_storage.as_mut() {
                shared.used_bytes = shared.used_bytes.saturating_sub(abs_bytes);
                
                // Update pool usage
                if let Some(pool) = self.shared_storage_pools.get(&shared.pool_id) {
                    let mut updated_pool = pool.clone();
                    updated_pool.used_bytes = updated_pool.used_bytes.saturating_sub(abs_bytes);
                    self.shared_storage_pools.insert(shared.pool_id.clone(), updated_pool);
                }
            }
            // Handle platform-sponsored users (on-demand from platform pool)
            else if storage.platform_sponsored {
                let platform_account = Self::platform_pool_account();
                // Update platform pool usage in real-time
                if let Some(pool) = self.shared_storage_pools.get(&platform_account) {
                    let mut updated_pool = pool.clone();
                    updated_pool.used_bytes = updated_pool.used_bytes.saturating_sub(abs_bytes);
                    self.shared_storage_pools.insert(platform_account, updated_pool);
                }
            }
        }
        
        // Reset tracker after applying changes
        storage.storage_tracker.reset();
        
        // Assert storage coverage with attached deposit fallback
        // Priority chain: Platform Pool → Shared Pool → Personal Balance → Attached Deposit
        if let Err(_) = self.assert_storage_covered_with_platform(&storage) {
            // Coverage failed - try auto-deposit from attached_balance as final fallback
            if let Some(ref mut balance) = attached_balance {
                if **balance > 0 {
                    // Auto-deposit remaining attached balance
                    let deposit_amount = **balance;
                    storage.balance = storage.balance.saturating_add(deposit_amount);
                    **balance = 0;
                    // Re-check coverage after deposit
                    self.assert_storage_covered_with_platform(&storage)?;
                } else {
                    // No attached balance - fail with original error
                    self.assert_storage_covered_with_platform(&storage)?;
                }
            } else {
                // No attached_balance context - fail with original error
                self.assert_storage_covered_with_platform(&storage)?;
            }
        }
        
        // Save updated storage
        self.user_storage.insert(account_id, storage);

        Ok(existing_entry)
    }

    // REMOVED: remove_entry() - old implementation no longer used
    // Use soft_delete_entry() or proper API methods (remove_group_member, etc.) instead
}
