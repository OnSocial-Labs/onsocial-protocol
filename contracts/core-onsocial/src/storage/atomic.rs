use near_sdk::AccountId;

use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub fn handle_share_storage_atomic(
        &mut self,
        pool_owner: &AccountId,
        target_id: &AccountId,
        max_bytes: u64,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        if max_bytes < crate::constants::MIN_STORAGE_BYTES {
            let msg = format!("Max bytes must be at least {}", crate::constants::MIN_STORAGE_BYTES);
            return Err(crate::invalid_input!(msg));
        }

        if pool_owner == target_id {
            return Err(crate::invalid_input!("Cannot share storage with yourself"));
        }

        let target_storage = self.user_storage.get(target_id).cloned().unwrap_or_default();
        if target_storage.shared_storage.is_some() {
            return Err(crate::invalid_input!("Target account already has shared storage allocation"));
        }

        let pool = self.shared_storage_pools.get(pool_owner).cloned().unwrap_or_default();
        if !pool.can_allocate_additional(max_bytes) {
            return Err(crate::insufficient_storage!("Pool has insufficient capacity"));
        }

        let mut pool_storage = self.user_storage.get(pool_owner).cloned().unwrap_or_default();
        pool_storage.storage_tracker.start_tracking();

        let shared_storage = crate::storage::models::AccountSharedStorage {
            max_bytes,
            used_bytes: 0,
            pool_id: pool_owner.clone(),
        };

        let mut updated_target = target_storage;
        updated_target.shared_storage = Some(shared_storage);
        updated_target.storage_tracker.reset();
        self.user_storage.insert(target_id.clone(), updated_target);

        let mut updated_pool = pool;
        updated_pool.shared_bytes = updated_pool.shared_bytes.saturating_add(max_bytes);
        self.shared_storage_pools.insert(pool_owner.clone(), updated_pool);

        pool_storage.storage_tracker.stop_tracking();
        let delta = pool_storage.storage_tracker.delta();
        pool_storage.storage_tracker.reset();

        if delta > 0 {
            pool_storage.used_bytes = pool_storage.used_bytes.saturating_add(delta as u64);
            pool_storage.assert_storage_covered()?;
        } else if delta < 0 {
            pool_storage.used_bytes = pool_storage.used_bytes.saturating_sub(delta.unsigned_abs() as u64);
        }

        self.user_storage.insert(pool_owner.clone(), pool_storage);

        EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "share_storage", pool_owner.clone())
            .with_field("pool_id", pool_owner.to_string())
            .with_field("target", target_id.to_string())
            .with_field("max_bytes", max_bytes.to_string())
            .emit(event_batch);

        Ok(())
    }

    pub fn handle_return_shared_storage_atomic(
        &mut self,
        account_id: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let mut storage = self.user_storage.get(account_id).cloned().unwrap_or_default();

        let shared = storage.shared_storage.take()
            .ok_or_else(|| crate::invalid_input!("No shared storage allocation to return"))?;

        storage.storage_tracker.start_tracking();

        if let Some(mut pool) = self.shared_storage_pools.get(&shared.pool_id).cloned() {
            pool.used_bytes = pool.used_bytes.saturating_sub(shared.used_bytes);
            pool.shared_bytes = pool.shared_bytes.saturating_sub(shared.max_bytes);
            self.shared_storage_pools.insert(shared.pool_id.clone(), pool);
        }

        storage.used_bytes = storage.used_bytes.saturating_sub(shared.used_bytes);

        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        storage.storage_tracker.reset();

        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
        } else if delta < 0 {
            storage.used_bytes = storage.used_bytes.saturating_sub(delta.unsigned_abs() as u64);
        }

        storage.assert_storage_covered()?;
        self.user_storage.insert(account_id.clone(), storage);

        EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "return_storage", account_id.clone())
            .with_field("pool_id", shared.pool_id.to_string())
            .with_field("max_bytes", shared.max_bytes.to_string())
            .with_field("used_bytes", shared.used_bytes.to_string())
            .emit(event_batch);

        Ok(())
    }
}