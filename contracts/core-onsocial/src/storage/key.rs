// --- External imports ---
use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::BorshStorageKey;

// --- Enums ---
/// Keys used to differentiate serialized collections in contract storage.
#[derive(BorshSerialize, BorshDeserialize, BorshStorageKey)]
pub enum StorageKey {
    /// Key for global shard lookup mapping (top-level)
    ShardLookup,

    /// Key for shared storage pools.
    SharedStoragePools,

    /// Key for consolidated user storage data (balance, usage, shared allocations).
    UserStorage,
}

impl StorageKey {
    /// Return the borsh-serialized key as bytes.
    #[inline(always)]
    pub fn as_vec(&self) -> Vec<u8> {
        borsh::to_vec(self).expect("Failed to serialize StorageKey")
    }
}
