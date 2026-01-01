use crate::state::models::{SharedStoragePool, SocialPlatform};

#[derive(Clone, Debug)]
pub(crate) enum SponsorOutcome {
    GroupSpend {
        group_id: String,
        payer: near_sdk::AccountId,
        bytes: u64,
        remaining_allowance: Option<u64>,
    },
}

impl SocialPlatform {
    /// Allocate storage bytes from pools in priority order.
    pub(super) fn allocate_storage_from_pools(
        &mut self,
        storage: &mut crate::storage::Storage,
        full_path: &str,
        payer: &near_sdk::AccountId,
        bytes: u64,
    ) -> Option<SponsorOutcome> {
        // Priority 1: Platform pool
        storage.refill_platform_allowance(&self.config);

        if storage.platform_sponsored && storage.try_use_platform_allowance(bytes) {
            if self.try_allocate_from_platform_pool(bytes) {
                storage.platform_pool_used_bytes =
                    storage.platform_pool_used_bytes.saturating_add(bytes);
                return None;
            }
            storage.platform_allowance = storage.platform_allowance.saturating_add(bytes);
            storage.platform_sponsored = false;
        }

        // Priority 2: Group pool
        if let Some(group_id) = SharedStoragePool::extract_group_id_from_path(full_path) {
            let quota_key = Self::group_sponsor_quota_key(payer, &group_id);
            let mut quota = self.group_sponsor_quotas.get(&quota_key).cloned();

            // Lazy-sync non-override quota to latest group default.
            if let Some(q) = quota.as_mut() {
                if !q.is_override {
                    if let Some(default_policy) = self.group_sponsor_defaults.get(&group_id) {
                        if q.applied_default_version != default_policy.version {
                            q.enabled = default_policy.enabled;
                            q.daily_refill_bytes = default_policy.daily_refill_bytes;
                            q.allowance_max_bytes = default_policy.allowance_max_bytes;
                            q.applied_default_version = default_policy.version;
                        }
                    }
                }
            }

            if quota.is_none() {
                if let Some(default_policy) = self.group_sponsor_defaults.get(&group_id) {
                    if default_policy.enabled {
                        quota = Some(crate::state::models::GroupSponsorAccount {
                            is_override: false,
                            applied_default_version: default_policy.version,
                            enabled: true,
                            daily_refill_bytes: default_policy.daily_refill_bytes,
                            allowance_max_bytes: default_policy.allowance_max_bytes,
                            allowance_bytes: default_policy.allowance_max_bytes,
                            last_refill_ns: near_sdk::env::block_timestamp(),
                        });
                    }
                }
            }
            if let Some(q) = quota.as_mut() {
                let now = near_sdk::env::block_timestamp();
                q.refill(now);
                if !q.can_spend(bytes) {
                    // Quota exhausted; fall through.
                    self.group_sponsor_quotas.insert(quota_key, q.clone());
                } else if self.try_allocate_from_group_pool(&group_id, bytes) {
                    storage.group_pool_used_bytes = storage.group_pool_used_bytes.saturating_add(bytes);

                    // Track per-(payer,group) to bound refunds on delete.
                    let k = Self::group_usage_key(payer, &group_id);
                    let prev = self.group_pool_usage.get(&k).copied().unwrap_or(0);
                    self.group_pool_usage.insert(k, prev.saturating_add(bytes));

                    q.spend(bytes);
                    self.group_sponsor_quotas.insert(quota_key, q.clone());

                    return Some(SponsorOutcome::GroupSpend {
                        group_id,
                        payer: payer.clone(),
                        bytes,
                        remaining_allowance: Some(q.allowance_bytes),
                    });
                } else {
                    // Pool exhausted; persist refill.
                    self.group_sponsor_quotas.insert(quota_key, q.clone());
                }
            } else if self.try_allocate_from_group_pool(&group_id, bytes) {
                storage.group_pool_used_bytes = storage.group_pool_used_bytes.saturating_add(bytes);

                let k = Self::group_usage_key(payer, &group_id);
                let prev = self.group_pool_usage.get(&k).copied().unwrap_or(0);
                self.group_pool_usage.insert(k, prev.saturating_add(bytes));
                return Some(SponsorOutcome::GroupSpend {
                    group_id,
                    payer: payer.clone(),
                    bytes,
                    remaining_allowance: None,
                });
            }
        }

        // Priority 3: Personal sponsor allocation
        if let Some(shared) = storage.shared_storage.as_mut() {
            if shared.is_valid_for_path(full_path) && shared.can_use_additional_bytes(bytes) {
                if let Some(pool) = self.shared_storage_pools.get(&shared.pool_id).cloned() {
                    if pool.can_allocate_additional(bytes) {
                        shared.used_bytes = shared.used_bytes.saturating_add(bytes);
                        self.add_pool_usage(&shared.pool_id.clone(), bytes);
                        return None;
                    }
                }
            }
        }

        // Priority 4: Personal balance
        None
    }

    /// Deallocate storage bytes back to pools.
    pub(super) fn deallocate_storage_to_pools(
        &mut self,
        storage: &mut crate::storage::Storage,
        full_path: &str,
        payer: &near_sdk::AccountId,
        bytes: u64,
    ) {
        let mut remaining = bytes;

        // Refund platform pool, bounded by account usage.
        if remaining > 0 && storage.platform_pool_used_bytes > 0 {
            let refund = remaining.min(storage.platform_pool_used_bytes);
            if refund > 0 {
                if self.try_deallocate_from_platform_pool(refund) {
                    storage.platform_pool_used_bytes =
                        storage.platform_pool_used_bytes.saturating_sub(refund);
                    remaining = remaining.saturating_sub(refund);
                }
            }
        }

        // Refund group pool, bounded by payer usage.
        if remaining > 0 {
            if let Some(group_id) = SharedStoragePool::extract_group_id_from_path(full_path) {
                let k = Self::group_usage_key(payer, &group_id);
                let used = self.group_pool_usage.get(&k).copied().unwrap_or(0);
                if used > 0 {
                    let refund = remaining.min(used);
                    if refund > 0 && self.try_deallocate_from_group_pool(&group_id, refund) {
                        storage.group_pool_used_bytes =
                            storage.group_pool_used_bytes.saturating_sub(refund);
                        self.group_pool_usage.insert(k, used.saturating_sub(refund));
                        remaining = remaining.saturating_sub(refund);
                    }
                }
            }
        }

        // Refund sponsor pool, bounded by sponsor usage.
        if remaining > 0 {
            if let Some(shared) = storage.shared_storage.as_mut() {
                if shared.used_bytes > 0 {
                    let refund = remaining.min(shared.used_bytes);
                    if refund > 0 {
                        shared.used_bytes = shared.used_bytes.saturating_sub(refund);
                        self.subtract_pool_usage(&shared.pool_id.clone(), refund);
                    }
                }
            }
        }

        // Remaining bytes paid by personal balance require no pool accounting.
    }

    fn try_allocate_from_platform_pool(&mut self, bytes: u64) -> bool {
        let platform_account = Self::platform_pool_account();
        if let Some(pool) = self.shared_storage_pools.get(&platform_account) {
            if pool.can_allocate_additional(bytes) {
                let mut updated = pool.clone();
                updated.used_bytes = updated.used_bytes.saturating_add(bytes);
                self.shared_storage_pools.insert(platform_account, updated);
                return true;
            }
        }
        false
    }

    fn try_deallocate_from_platform_pool(&mut self, bytes: u64) -> bool {
        let platform_account = Self::platform_pool_account();
        if let Some(pool) = self.shared_storage_pools.get(&platform_account) {
            let mut updated = pool.clone();
            updated.used_bytes = updated.used_bytes.saturating_sub(bytes);
            self.shared_storage_pools.insert(platform_account, updated);
            return true;
        }
        false
    }

    fn try_allocate_from_group_pool(&mut self, group_id: &str, bytes: u64) -> bool {
        let Ok(pool_key) = SharedStoragePool::group_pool_key(group_id) else {
            return false;
        };
        if let Some(pool) = self.shared_storage_pools.get(&pool_key) {
            if pool.can_allocate_additional(bytes) {
                let mut updated = pool.clone();
                updated.used_bytes = updated.used_bytes.saturating_add(bytes);
                self.shared_storage_pools.insert(pool_key, updated);
                return true;
            }
        }
        false
    }

    fn try_deallocate_from_group_pool(&mut self, group_id: &str, bytes: u64) -> bool {
        let Ok(pool_key) = SharedStoragePool::group_pool_key(group_id) else {
            return false;
        };
        if let Some(pool) = self.shared_storage_pools.get(&pool_key) {
            let mut updated = pool.clone();
            updated.used_bytes = updated.used_bytes.saturating_sub(bytes);
            self.shared_storage_pools.insert(pool_key, updated);
            return true;
        }
        false
    }

    fn add_pool_usage(&mut self, pool_id: &near_sdk::AccountId, bytes: u64) {
        if let Some(pool) = self.shared_storage_pools.get(pool_id) {
            let mut updated = pool.clone();
            updated.used_bytes = updated.used_bytes.saturating_add(bytes);
            self.shared_storage_pools.insert(pool_id.clone(), updated);
        }
    }

    fn subtract_pool_usage(&mut self, pool_id: &near_sdk::AccountId, bytes: u64) {
        if let Some(pool) = self.shared_storage_pools.get(pool_id) {
            let mut updated = pool.clone();
            updated.used_bytes = updated.used_bytes.saturating_sub(bytes);
            self.shared_storage_pools.insert(pool_id.clone(), updated);
        }
    }
}
