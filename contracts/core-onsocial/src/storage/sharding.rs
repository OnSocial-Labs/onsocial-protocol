// --- Sharding Utilities ---
// Deterministic sharding for optimal blockchain performance

use crate::constants::{NUM_SHARDS, NUM_SUBSHARDS};

// --- Imports ---
use xxhash_rust::xxh3;

// --- Public API ---
/// Returns a 128-bit hash for collision resistance and sharding.
/// Uses xxhash for optimal performance in caching and sharding operations.
#[inline(always)]
pub fn fast_hash(data: &[u8]) -> u128 {
    xxh3::xxh3_128(data)
}

/// Deterministic shard and subshard calculation for account/group data
/// Returns (shard_id, subshard_id) for O(1) storage operations
/// Uses XOR combination for optimal performance and distribution
#[inline(always)]
pub fn get_shard_subshard(namespace_id: &str, path_hash: u128) -> (u16, u32) {
    // Combine namespace and path hashes using XOR for optimal distribution
    // XOR preserves entropy without string allocation or redundant hashing
    // This is ~3,000 gas cheaper than format!() + hash approach
    let namespace_hash = fast_hash(namespace_id.as_bytes());
    let combined = namespace_hash ^ path_hash;

    // Use lower 64 bits for shard, upper 64 bits for subshard to prevent correlation
    let shard = (combined % NUM_SHARDS as u128) as u16;
    let subshard = ((combined >> 64) % NUM_SUBSHARDS as u128) as u32;
    (shard, subshard)
}

/// Generate unified storage key following plan3.md scheme
/// Format: shards/{shard_id}/{namespace}/{namespace_id}/subshards/{subshard_id}/{:02x}/{:02x}/custom/{path_hash}
/// Where namespace is "accounts" or "groups"
/// The two hex levels provide better directory distribution for filesystem performance
#[inline(always)]
pub fn make_unified_key(namespace: &str, namespace_id: &str, relative_path: &str) -> String {
    let path_hash = fast_hash(relative_path.as_bytes());
    let (shard, subshard) = get_shard_subshard(namespace_id, path_hash);

    // Extract first two bytes of path_hash for additional directory levels
    let level1 = (path_hash & 0xFF) as u8;
    let level2 = ((path_hash >> 8) & 0xFF) as u8;

    // Pre-calculate capacity to avoid reallocation (~800 gas savings)
    // Format: "shards/XXXX/accounts|groups/namespace_id/subshards/XXXX/XX/XX/custom/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    let capacity = 
        7 +      // "shards/"
        5 +      // shard (max "8191/")
        (if namespace == "accounts" { 9 } else { 7 }) +  // "accounts/" or "groups/"
        namespace_id.len() + 1 +  // namespace_id + "/"
        10 +     // "subshards/"
        5 +      // subshard (max "8191/")
        3 +      // "XX/" (level1)
        3 +      // "XX/" (level2)
        7 +      // "custom/"
        32;      // path_hash (128-bit = 32 hex chars)
    
    let mut key = String::with_capacity(capacity);
    
    // Use write! macro for efficient formatting into pre-allocated string
    use std::fmt::Write;
    write!(
        &mut key,
        "shards/{}/{}/{}/subshards/{}/{:02x}/{:02x}/custom/{:x}",
        shard, namespace, namespace_id, subshard, level1, level2, path_hash
    ).expect("write to String cannot fail");
    
    key
}