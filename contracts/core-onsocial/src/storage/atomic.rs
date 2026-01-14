//! # Atomic Storage Pool Operations
//!
//! This module provides atomic operations for shared storage allocation and deallocation.
//!
//! ## Ownership Model
//! - Pool ownership is implicit: the pool key (`AccountId`) is the owner's account ID
//! - Each account can have at most one active shared storage allocation
//!
//! ## Invariants
//! - `pool.shared_bytes >= sum(allocation.max_bytes)` for all active allocations from this pool
//! - `pool.used_bytes <= total_capacity` where `total_capacity = pool.storage_balance / byte_cost`
//! - `allocation.used_bytes <= allocation.max_bytes`
//! - `allocation.used_bytes <= pool.used_bytes` (allocation usage is subset of pool usage)
//!
//! ## Event Guarantees
//! - Events are emitted only on successful state transitions
//! - Each event includes final pool state for indexer consistency

use near_sdk::{env, AccountId};

use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(crate) fn handle_share_storage_atomic(
        &mut self,
        pool_owner: &AccountId,
        target_id: &AccountId,
        max_bytes: u64,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        if max_bytes < crate::constants::MIN_SHARED_STORAGE_BYTES {
            let msg = format!("Max bytes must be at least {}", crate::constants::MIN_SHARED_STORAGE_BYTES);
            return Err(crate::invalid_input!(msg));
        }

        if pool_owner == target_id {
            return Err(crate::invalid_input!("Cannot share storage with yourself"));
        }

        let target_storage = self.user_storage.get(target_id).cloned().unwrap_or_default();
        if target_storage.shared_storage.is_some() {
            return Err(crate::invalid_input!("Target account already has shared storage allocation"));
        }

        let pool = self.shared_storage_pools.get(pool_owner).cloned()
            .ok_or_else(|| crate::invalid_input!("Shared storage pool does not exist"))?;
        if !pool.can_allocate_additional(max_bytes) {
            return Err(crate::insufficient_storage!("Pool has insufficient capacity"));
        }

        let shared_storage = crate::storage::account_storage::AccountSharedStorage {
            max_bytes,
            used_bytes: 0,
            pool_id: pool_owner.clone(),
        };

        let original_target = target_storage.clone();
        let mut updated_target = target_storage;
        updated_target.shared_storage = Some(shared_storage);
        updated_target.storage_tracker.reset();

        let mut updated_pool = pool.clone();
        updated_pool.shared_bytes = updated_pool.shared_bytes.saturating_add(max_bytes);

        // Measure overhead from struct inserts
        let storage_before = env::storage_usage();
        self.user_storage.insert(target_id.clone(), updated_target.clone());
        self.shared_storage_pools.insert(pool_owner.clone(), updated_pool.clone());
        let storage_after = env::storage_usage();
        let delta = storage_after.saturating_sub(storage_before);

        // Validate capacity including overhead before finalizing
        updated_pool.used_bytes = updated_pool.used_bytes.saturating_add(delta);
        if updated_pool.available_bytes() < max_bytes {
            self.user_storage.insert(target_id.clone(), original_target);
            self.shared_storage_pools.insert(pool_owner.clone(), pool);
            return Err(crate::insufficient_storage!("Pool has insufficient capacity for overhead"));
        }
        if delta > 0 {
            self.shared_storage_pools.insert(pool_owner.clone(), updated_pool.clone());
        }

        EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "share_storage", pool_owner.clone())
            .with_field("target_id", target_id.to_string())
            .with_field("max_bytes", max_bytes.to_string())
            .with_field("new_shared_bytes", updated_pool.shared_bytes.to_string())
            .with_field("new_used_bytes", updated_pool.used_bytes.to_string())
            .with_field("pool_available_bytes", updated_pool.available_bytes().to_string())
            .emit(event_batch);

        Ok(())
    }

    pub(crate) fn handle_return_shared_storage_atomic(
        &mut self,
        account_id: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let mut storage = self.user_storage.get(account_id).cloned().unwrap_or_default();

        let shared = storage.shared_storage.take()
            .ok_or_else(|| crate::invalid_input!("No shared storage allocation to return"))?;

        // Validate user can cover remaining storage without shared allocation
        storage.assert_storage_covered()?;

        let storage_before = env::storage_usage();

        let mut pool = self.shared_storage_pools.get(&shared.pool_id).cloned()
            .ok_or_else(|| crate::invalid_input!("Shared storage pool does not exist"))?;

        if shared.used_bytes > pool.used_bytes || shared.max_bytes > pool.shared_bytes {
            return Err(crate::invalid_input!("Pool state inconsistent with allocation"));
        }

        pool.used_bytes = pool.used_bytes.saturating_sub(shared.used_bytes);
        pool.shared_bytes = pool.shared_bytes.saturating_sub(shared.max_bytes);
        self.shared_storage_pools.insert(shared.pool_id.clone(), pool.clone());

        self.user_storage.insert(account_id.clone(), storage);

        let storage_after = env::storage_usage();

        // Credit freed overhead back to pool
        if storage_before > storage_after {
            let freed = storage_before - storage_after;
            pool.used_bytes = pool.used_bytes.saturating_sub(freed);
            self.shared_storage_pools.insert(shared.pool_id.clone(), pool.clone());
        }

        EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "return_storage", account_id.clone())
            .with_field("pool_id", shared.pool_id.to_string())
            .with_field("max_bytes", shared.max_bytes.to_string())
            .with_field("used_bytes", shared.used_bytes.to_string())
            .with_field("new_shared_bytes", pool.shared_bytes.to_string())
            .with_field("new_used_bytes", pool.used_bytes.to_string())
            .with_field("pool_available_bytes", pool.available_bytes().to_string())
            .emit(event_batch);

        Ok(())
    }
}