// --- Storage Key Utilities ---
// Simple key generation for optimal storage efficiency

use crate::constants::NUM_PARTITIONS;

// --- Imports ---
use xxhash_rust::xxh3;

// --- Public API ---
/// Returns a 128-bit hash for partition calculation.
/// Uses xxhash for optimal performance.
#[inline(always)]
pub fn fast_hash(data: &[u8]) -> u128 {
    xxh3::xxh3_128(data)
}

/// Calculate partition ID for event routing (off-chain indexers only)
/// Partitions by namespace_id so all user/group data goes to same partition
/// This enables better cache locality and simpler indexer queries
#[inline(always)]
pub fn get_partition(namespace_id: &str) -> u16 {
    let hash = fast_hash(namespace_id.as_bytes());
    (hash % NUM_PARTITIONS as u128) as u16
}

/// Generate simple storage key
/// Format: {namespace_id}/{relative_path} for accounts
/// Format: groups/{group_id}/{relative_path} for groups
/// 
/// This is ~70% shorter than the old sharded keys, saving storage costs
/// and enabling human-readable debugging.
#[inline(always)]
pub fn make_key(namespace: &str, namespace_id: &str, relative_path: &str) -> String {
    if namespace == "groups" {
        format!("groups/{}/{}", namespace_id, relative_path)
    } else {
        format!("{}/{}", namespace_id, relative_path)
    }
}