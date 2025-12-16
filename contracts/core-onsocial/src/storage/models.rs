// --- External imports ---
use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::AccountId;
use near_sdk_macros::NearSchema;

// --- Structs ---
/// Storage metadata for an account: balance, usage and optional shared allocation.
#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Default,
)]
#[derive(Debug)]
pub struct Storage {
    /// Total storage balance (yoctoNEAR) for the account.
    pub balance: u128,

    /// Bytes used by the account.
    pub used_bytes: u64,

    /// Optional shared storage allocation from a pool (for group-level sponsorship).
    pub shared_storage: Option<AccountSharedStorage>,

    /// Whether this user's storage is sponsored by the platform pool on-demand.
    /// When true, storage costs are paid from the platform pool as usage occurs.
    /// This is more efficient than pre-allocating fixed amounts.
    #[serde(default)]
    pub platform_sponsored: bool,

    /// Storage usage tracker for account operations.
    #[serde(skip)]
    pub storage_tracker: crate::storage::tracker::StorageTracker,
}

impl Storage {
    /// Ensure the account's balance covers its effective usage.
    #[inline(always)]
    pub fn assert_storage_covered(&self) -> Result<(), crate::errors::SocialError> {
        let shared_bytes_used = self
            .shared_storage
            .as_ref()
            .map(|s| s.used_bytes)
            .unwrap_or(0);
        let used_bytes = self.used_bytes;
        let effective_bytes =
            crate::storage::calculate_effective_bytes(used_bytes, shared_bytes_used);
        let storage_balance_needed =
            crate::storage::calculate_storage_balance_needed(effective_bytes);

        if storage_balance_needed > self.balance {
            return Err(crate::errors::SocialError::InsufficientStorage(
                format!("Not enough storage balance. Required: {}, Available: {}",
                    storage_balance_needed, self.balance)
            ));
        }
        Ok(())
    }
}

/// Shared storage allocation details for an account derived from a pool.
#[derive(
    NearSchema, BorshDeserialize, BorshSerialize, serde::Serialize, serde::Deserialize, Clone, Debug,
)]
#[abi(json, borsh)]
pub struct AccountSharedStorage {
    /// Maximum bytes allowed from the pool.
    pub max_bytes: u64,

    /// Bytes currently used from the pool.
    pub used_bytes: u64,

    /// Pool account ID providing the shared storage.
    pub pool_id: AccountId,
}

impl AccountSharedStorage {
    /// Check if account can use additional shared bytes
    #[inline(always)]
    pub fn can_use_additional_bytes(&self, additional_bytes: u64) -> bool {
        self.used_bytes.saturating_add(additional_bytes) <= self.max_bytes
    }
}
