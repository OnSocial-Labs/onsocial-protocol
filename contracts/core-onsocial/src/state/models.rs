// --- Imports ---
use std::default::Default;

use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::store::LookupMap;
use near_sdk::AccountId;
use near_sdk_macros::NearSchema;

use crate::config::GovernanceConfig;

// --- Structs ---
#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Default,
)]
#[abi(json, borsh)]
pub struct UserStorageUsage {
    pub used_bytes: u64,
}

#[derive(
    NearSchema, BorshDeserialize, BorshSerialize, serde::Serialize, serde::Deserialize, Clone,
)]
#[abi(json, borsh)]
pub enum DataValue {
    Value(Vec<u8>),
    Deleted(u64), // block height when deleted
}

#[derive(
    NearSchema, BorshDeserialize, BorshSerialize, serde::Serialize, serde::Deserialize, Clone,
)]
#[abi(json, borsh)]
pub struct DataEntry {
    pub value: DataValue,
    pub tags: Vec<String>,
    pub metadata: Vec<u8>,
    pub block_height: u64,
}

#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Default,
)]
#[abi(json, borsh)]
pub struct SharedStoragePool {
    pub storage_balance: u128,
    pub used_bytes: u64,
    /// The sum of the maximum number of bytes of storage that are shared between all accounts.
    /// This number might be larger than the total number of bytes of storage that are available.
    pub shared_bytes: u64,
}

impl SharedStoragePool {
    /// Calculate available bytes in the pool
    /// Available bytes = total pool capacity - currently used bytes
    /// Note: This represents remaining capacity, but allocations should also check against shared_bytes
    pub fn available_bytes(&self) -> u64 {
        let total_capacity_bytes = (self.storage_balance / near_sdk::env::storage_byte_cost().as_yoctonear()) as u64;
        total_capacity_bytes.saturating_sub(self.used_bytes)
    }

    /// Check if pool can allocate additional bytes
    /// This checks both available capacity and prevents over-allocation beyond pool limits
    pub fn can_allocate_additional(&self, additional_bytes: u64) -> bool {
        // Check if we have enough remaining capacity
        self.available_bytes() >= additional_bytes
    }
}

// --- Enums ---
#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Copy,
    PartialEq,
    Debug,
)]
#[abi(json, borsh)]
pub enum ContractStatus {
    Genesis,
    Live,
    ReadOnly,
}

#[derive(NearSchema, BorshDeserialize, BorshSerialize)]
#[abi(borsh)]
pub struct SocialPlatform {
    pub version: String,
    pub status: ContractStatus,
    pub manager: AccountId,
    pub config: GovernanceConfig,
    /// Top-level shard lookup. Maps shard id -> shard prefix bytes (opaque).
    pub shard_lookup: LookupMap<u16, Vec<u8>>,
    pub shared_storage_pools: LookupMap<AccountId, SharedStoragePool>,
    /// Consolidated user storage data: balance, usage, and shared allocations
    pub user_storage: LookupMap<AccountId, crate::storage::Storage>,
}
