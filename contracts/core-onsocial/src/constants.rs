//! Core constants for OnSocial Protocol
//!
//! Design Philosophy:
//! - Constants chosen for optimal performance/security balance
//! - Values based on extensive sharding analysis and benchmarks
//! - Runtime gas limits provide additional safety bounds
//! - Configuration prioritizes scalability over minimalism

// --- System Limits & Performance ---
/// Minimum storage bytes required for account creation.
/// Based on NEAR protocol requirements + metadata overhead.
/// Value: 2000 bytes = ~2KB minimum account storage
/// Ensures accounts have enough storage for basic operations.
pub const MIN_STORAGE_BYTES: u64 = 2000;

/// Maximum event type string length for gas efficiency.
/// Prevents DoS via extremely long event types.
/// Value: 32 chars allows descriptive names while limiting gas usage
/// Balance between expressiveness and gas costs.
pub const MAX_EVENT_TYPE_LENGTH: usize = 32;

/// Shard key prefix for storage optimization.
/// Single character to minimize key length while maintaining uniqueness.
pub const SHARD_KEY_PREFIX: &str = "s";

/// Group key prefix for namespace separation.
/// Single character for efficient path parsing and storage.
pub const GROUP_KEY_PREFIX: &str = "g";

// --- Sharding Configuration ---
/// Number of top-level shards for data distribution.
///
/// DESIGN DECISIONS:
/// - Must be power of 2 (8192 = 2^13) for efficient modulo operations
/// - Provides 67M total storage slots (8192 × 8192)
/// - Balances collision resistance with memory efficiency
///
/// PERFORMANCE IMPACT:
/// - Lower values = more collisions, higher load per shard
/// - Higher values = more memory for shard lookups, better distribution
/// - Current value optimized for 1M+ accounts with 100+ paths each
///
/// COLLISION ANALYSIS:
/// - 128-bit hash space divided by 8192 = ~2^107 possibilities per shard
/// - Effectively eliminates collision risk for foreseeable usage
pub const NUM_SHARDS: u16 = 8192;

/// Subshards per shard for fine-grained distribution.
///
/// DESIGN DECISIONS:
/// - Same value as NUM_SHARDS for symmetric distribution
/// - Provides deterministic O(1) lookups via double hashing
/// - Reduces hot spots while maintaining cache efficiency
/// - Allows horizontal scaling without rebalancing
///
/// LOAD DISTRIBUTION:
/// - Two-level hashing prevents shard/subshard correlation
/// - Lower 64 bits of hash → shard selection
/// - Upper 64 bits of hash → subshard selection
/// - Independent distributions prevent clustering
pub const NUM_SUBSHARDS: u32 = 8192;

// --- Event System ---
/// Standard identifier for OnSocial events.
/// Used for event filtering and protocol identification.
pub const EVENT_STANDARD: &str = "onsocial";

/// Protocol version for event compatibility.
/// Semantic versioning for client compatibility checks.
pub const EVENT_VERSION: &str = "1.0.0";

/// Event prefix for efficient log filtering.
/// Short prefix minimizes storage while enabling fast searches.
pub const EVENT_PREFIX: &str = "EVENT:";

// --- Unified UPDATE event types for all domains ---
// Event types follow DOMAIN_ACTION pattern for consistency

// --- Path Prefixes ---
// Note: Most path prefixes removed for maximum flexibility
// Only essential prefixes kept for core functionality

/// Groups namespace prefix.
/// Separates group data from account data for efficient routing.
pub const PATH_PREFIX_GROUPS: &str = "groups";

/// Permissions namespace prefix.
/// Isolates permission data for security and performance.
pub const PATH_PREFIX_PERMISSIONS: &str = "permissions";

// --- Metadata & Schema ---
/// Metadata schema version for meta_v1 layout.
/// Enables future schema evolution while maintaining compatibility.
/// Increment when metadata structure changes significantly.
pub const METADATA_SCHEMA_VERSION: u8 = 1;

// --- Content & Event Types ---
// Content types (used in paths)
// Note: Content types are now handled by client-side parsing for maximum flexibility

// Event types (emitted in events)

// Unified UPDATE event types for all domains
/// Data modification events (set operations).
pub const EVENT_TYPE_DATA_UPDATE: &str = "DATA_UPDATE";

/// Storage-related events (deposits, withdrawals, allocations).
pub const EVENT_TYPE_STORAGE_UPDATE: &str = "STORAGE_UPDATE";

/// Permission changes and access control events.
pub const EVENT_TYPE_PERMISSION_UPDATE: &str = "PERMISSION_UPDATE";

/// Group management and membership events.
pub const EVENT_TYPE_GROUP_UPDATE: &str = "GROUP_UPDATE";

/// Contract governance and status changes.
pub const EVENT_TYPE_CONTRACT_UPDATE: &str = "CONTRACT_UPDATE";

// --- Voting Configuration ---
/// Default quorum percentage for group proposals.
/// 50% of members must participate for valid votes.
/// Balances democracy with decision efficiency.
pub const DEFAULT_VOTING_QUORUM: u8 = 50; // 50% of members needed

/// Default voting period in nanoseconds.
/// 7 days allows sufficient time for member participation.
/// Long enough for global coordination, short enough for timely decisions.
pub const DEFAULT_VOTING_PERIOD: u64 = 7 * 24 * 60 * 60 * 1_000_000_000; // 7 days in nanoseconds

/// Minimum participation quorum as fraction.
/// 51% of members must vote to ensure meaningful participation.
/// Prevents premature execution and ensures broad community engagement.
pub const VOTING_PARTICIPATION_QUORUM: f64 = 0.51; // 51% of members must vote

/// Majority threshold for proposal approval.
/// >50% required to prevent ties and ensure clear majorities.
/// > Simple majority with tie-breaker protection.
pub const VOTING_MAJORITY_THRESHOLD: f64 = 0.5001; // >50% of members must approve

// --- Storage Keys ---
/// Suffix for shared storage allocation keys.
/// Unique identifier to prevent conflicts with user data.
/// Short but distinctive for efficient key generation.
pub const SHARED_STORAGE_KEY_SUFFIX: &str = "shared_storage";

// --- JSON Field Keys ---
/// Standard metadata field name.
/// Consistent across all data structures for client compatibility.
pub const METADATA_KEY: &str = "metadata";

/// Expiration timestamp field.
/// Standard field for time-based data cleanup.
pub const EXPIRES_AT_KEY: &str = "expires_at";

/// Tag array field for categorization.
/// Enables efficient filtering and search capabilities.
pub const TAGS_KEY: &str = "tags";
