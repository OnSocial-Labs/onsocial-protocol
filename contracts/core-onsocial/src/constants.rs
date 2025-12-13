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

/// Group key prefix for namespace separation.
/// Single character for efficient path parsing and storage.
pub const GROUP_KEY_PREFIX: &str = "g";

// --- Partition Configuration (for indexers) ---
/// Number of partitions for event routing to off-chain indexers.
/// 
/// DESIGN DECISIONS:
/// - Partitions are namespace-based (all user data in same partition)
/// - 256 partitions = power of 2 for efficient modulo
/// - Small enough to avoid over-sharding indexer infrastructure
/// - Large enough to enable horizontal scaling
///
/// NOTE: This does NOT affect on-chain storage distribution.
/// NEAR stores all contract data in a single Merkle-Patricia Trie.
/// Partitions only affect how indexers route and process events.
pub const NUM_PARTITIONS: u16 = 4096;

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
