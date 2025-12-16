// --- Imports ---
use near_sdk::AccountId;

use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::{SocialError};

// --- Impl ---
impl SocialPlatform {
    /// Atomically handle share storage operation to prevent inconsistent state
    pub fn handle_share_storage_atomic(
        &mut self,
        pool_owner: &AccountId,
        target_id: &AccountId,
        max_bytes: u64,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        // Validate minimum bytes
        if max_bytes < crate::constants::MIN_STORAGE_BYTES {
            let msg = format!("Max bytes must be at least {}", crate::constants::MIN_STORAGE_BYTES);
            return Err(crate::invalid_input!(msg));
        }

        // Check if target already has shared storage
        let target_storage = self.user_storage.get(target_id).cloned().unwrap_or_default();
        if target_storage.shared_storage.is_some() {
            return Err(crate::invalid_input!("Target account already has shared storage allocation"));
        }

        // Check pool has sufficient capacity
        let pool = self.shared_storage_pools.get(pool_owner).cloned().unwrap_or_default();
        if !pool.can_allocate_additional(max_bytes) {
            return Err(crate::insufficient_storage!("Pool has insufficient capacity"));
        }

        // Get pool owner storage for tracking
        let mut pool_storage = self.user_storage.get(pool_owner).cloned().unwrap_or_default();

        // Start tracking storage changes
        pool_storage.storage_tracker.start_tracking();

        // Create shared storage allocation
        let shared_storage = crate::storage::models::AccountSharedStorage {
            max_bytes,
            used_bytes: 0,
            pool_id: pool_owner.clone(),
        };

        // Update target storage
        let mut updated_target = target_storage;
        updated_target.shared_storage = Some(shared_storage);
        // Reset any active trackers before storing
        updated_target.storage_tracker.reset();
        self.user_storage.insert(target_id.clone(), updated_target);

        // Update pool (atomic with target update)
        let mut updated_pool = pool;
        updated_pool.shared_bytes = updated_pool.shared_bytes.saturating_add(max_bytes);
        self.shared_storage_pools.insert(pool_owner.clone(), updated_pool);

        // Stop tracking and update pool owner usage
        pool_storage.storage_tracker.stop_tracking();
        let delta = pool_storage.storage_tracker.delta();
        pool_storage.storage_tracker.reset(); // Reset immediately after calculating delta
        
        if delta > 0 {
            pool_storage.used_bytes = pool_storage.used_bytes.saturating_add(delta as u64);
            pool_storage.assert_storage_covered()?;
        }

        // Save updated pool storage
        self.user_storage.insert(pool_owner.clone(), pool_storage);

        // Emit event
        EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "share_storage", pool_owner.clone())
            .with_field("target", target_id.to_string())
            .with_field("max_bytes", max_bytes.to_string())
            .emit(event_batch);

        Ok(())
    }

    /// Atomically handle return shared storage operation
    pub fn handle_return_shared_storage_atomic(
        &mut self,
        account_id: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        // Get storage for the account
        let mut storage = self.user_storage.get(account_id).cloned().unwrap_or_default();

        let shared = storage.shared_storage.take()
            .ok_or_else(|| crate::invalid_input!("No shared storage allocation to return"))?;

        // Start tracking
        storage.storage_tracker.start_tracking();

        // Update pool (subtract used and allocated bytes)
        if let Some(mut pool) = self.shared_storage_pools.get(&shared.pool_id).cloned() {
            pool.used_bytes = pool.used_bytes.saturating_sub(shared.used_bytes);
            pool.shared_bytes = pool.shared_bytes.saturating_sub(shared.max_bytes);
            self.shared_storage_pools.insert(shared.pool_id.clone(), pool);
        }

        // Adjust account usage
        storage.used_bytes = storage.used_bytes.saturating_sub(shared.used_bytes);

        // Stop tracking and update usage
        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        storage.storage_tracker.reset(); // Reset immediately after calculating delta
        
        if delta < 0 {
            let abs_bytes = delta.unsigned_abs();
            storage.used_bytes = storage.used_bytes.saturating_sub(abs_bytes);
        }

        storage.assert_storage_covered()?;
        
        // Save updated storage
        self.user_storage.insert(account_id.clone(), storage);

        // Emit event with allocation details for event sourcing
        EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "return_storage", account_id.clone())
            .with_field("pool_id", shared.pool_id.to_string())
            .with_field("max_bytes", shared.max_bytes.to_string())
            .with_field("used_bytes", shared.used_bytes.to_string())
            .emit(event_batch);

        Ok(())
    }

    // NOTE: auto_allocate_platform_storage was removed in favor of on-demand sponsorship.
    // Instead of pre-allocating fixed amounts, we now use the `platform_sponsored` flag
    // which tracks usage against the platform pool in real-time (more efficient).
    // See: handle_api_data_operation() in data.rs
}