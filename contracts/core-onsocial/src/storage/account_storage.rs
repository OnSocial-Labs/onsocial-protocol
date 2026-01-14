use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::AccountId;
use near_sdk_macros::NearSchema;

/// Account storage balance and usage tracking.
///
/// # Balance Model
/// - `balance`: Total deposited NEAR for storage
/// - `locked_balance`: Reserved for pending proposals (excluded from `available_balance()`)
/// - `used_bytes`: Total bytes stored by this account
/// - `*_pool_used_bytes`: Bytes covered by respective pools (not charged to personal balance)
///
/// # Invariant
/// `available_balance() >= storage_balance_needed(used_bytes - covered_bytes())`
#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Default,
    Debug,
)]
#[abi(json, borsh)]
pub struct Storage {
    pub balance: u128,
    pub used_bytes: u64,
    pub shared_storage: Option<AccountSharedStorage>,
    #[serde(default)]
    pub group_pool_used_bytes: u64,
    #[serde(default)]
    pub platform_pool_used_bytes: u64,
    #[serde(default)]
    pub platform_sponsored: bool,
    #[serde(default)]
    pub platform_first_write_ns: Option<u64>,
    #[serde(default)]
    pub platform_allowance: u64,
    #[serde(default)]
    pub platform_last_refill_ns: u64,
    /// Reserved for pending proposal execution.
    #[serde(default)]
    pub locked_balance: u128,
    #[serde(skip)]
    #[borsh(skip)]
    pub storage_tracker: crate::storage::tracker::StorageTracker,
}

impl Storage {
    #[inline(always)]
    fn covered_bytes(&self) -> u64 {
        let sponsor_bytes = self
            .shared_storage
            .as_ref()
            .map(|s| s.used_bytes)
            .unwrap_or(0);
        sponsor_bytes
            .saturating_add(self.group_pool_used_bytes)
            .saturating_add(self.platform_pool_used_bytes)
    }

    #[inline(always)]
    pub fn available_balance(&self) -> u128 {
        self.balance.saturating_sub(self.locked_balance)
    }

    /// Returns error if available balance cannot cover effective storage usage.
    #[inline(always)]
    pub fn assert_storage_covered(&self) -> Result<(), crate::errors::SocialError> {
        let effective_bytes = crate::storage::calculate_effective_bytes(self.used_bytes, self.covered_bytes());
        let storage_balance_needed = crate::storage::calculate_storage_balance_needed(effective_bytes);
        let available = self.available_balance();
        if storage_balance_needed > available {
            return Err(crate::errors::SocialError::InsufficientStorage(format!(
                "Required: {}, available: {} (locked: {})",
                storage_balance_needed, available, self.locked_balance
            )));
        }
        Ok(())
    }

    /// Lock balance for proposal execution.
    pub fn lock_balance(&mut self, amount: u128) -> Result<(), crate::errors::SocialError> {
        let available = self.available_balance();
        if amount > available {
            return Err(crate::errors::SocialError::InsufficientStorage(format!(
                "Cannot lock {}: only {} available (locked: {})",
                amount, available, self.locked_balance
            )));
        }
        self.locked_balance = self.locked_balance.saturating_add(amount);
        Ok(())
    }

    /// Release locked balance.
    pub fn unlock_balance(&mut self, amount: u128) {
        self.locked_balance = self.locked_balance.saturating_sub(amount);
    }

    pub fn refill_platform_allowance(&mut self, config: &crate::config::GovernanceConfig) {
        // Sponsorship activation is handled by higher-level logic.
        if !self.platform_sponsored {
            return;
        }

        let now = near_sdk::env::block_timestamp();

        // First platform-sponsored write: grant onboarding allowance.
        if self.platform_first_write_ns.is_none() {
            self.platform_first_write_ns = Some(now);
            self.platform_allowance = config
                .platform_onboarding_bytes
                .min(config.platform_allowance_max_bytes);
            self.platform_last_refill_ns = now;
            return;
        }

        let elapsed_ns = now.saturating_sub(self.platform_last_refill_ns);
        if elapsed_ns < crate::constants::NANOS_PER_MINUTE {
            return;
        }

        let refill_bytes_u128 = (elapsed_ns as u128)
            .saturating_mul(config.platform_daily_refill_bytes as u128)
            / crate::constants::NANOS_PER_DAY as u128;

        if refill_bytes_u128 == 0 {
            return;
        }

        let max_u128 = config.platform_allowance_max_bytes as u128;
        let updated_u128 = (self.platform_allowance as u128)
            .saturating_add(refill_bytes_u128)
            .min(max_u128);

        self.platform_allowance = updated_u128 as u64;
        self.platform_last_refill_ns = now;
    }

    #[inline(always)]
    pub fn try_use_platform_allowance(&mut self, bytes_needed: u64) -> bool {
        if self.platform_allowance >= bytes_needed {
            self.platform_allowance = self.platform_allowance.saturating_sub(bytes_needed);
            true
        } else {
            false
        }
    }

    #[inline(always)]
    pub fn get_platform_allowance_info(&self) -> (u64, Option<u64>) {
        (self.platform_allowance, self.platform_first_write_ns)
    }
}

#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Debug,
)]
#[abi(json, borsh)]
pub struct AccountSharedStorage {
    pub max_bytes: u64,
    pub used_bytes: u64,
    pub pool_id: AccountId,
}

impl AccountSharedStorage {
    #[inline(always)]
    pub fn can_use_additional_bytes(&self, additional_bytes: u64) -> bool {
        self.used_bytes.saturating_add(additional_bytes) <= self.max_bytes
    }

    #[inline(always)]
    pub fn is_valid_for_path(&self, path: &str) -> bool {
        use crate::state::models::SharedStoragePool;

        if let Some(pool_group_id) = SharedStoragePool::extract_group_id_from_pool_key(&self.pool_id)
        {
            if let Some(path_group_id) = SharedStoragePool::extract_group_id_from_path(path) {
                return pool_group_id == path_group_id;
            }
            return false;
        }

        // Non-group allocations must not apply to any group path.
        SharedStoragePool::extract_group_id_from_path(path).is_none()
    }
}
