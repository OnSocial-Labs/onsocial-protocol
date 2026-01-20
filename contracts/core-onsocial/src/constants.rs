//! Contract-wide constants for OnSocial core.

// --- Time ---

pub const NANOS_PER_MINUTE: u64 = 60_000_000_000;
pub const NANOS_PER_DAY: u64 = 86_400_000_000_000;

// --- Storage Limits ---

/// Minimum allocation when sharing storage with another user (2 KB).
pub const MIN_SHARED_STORAGE_BYTES: u64 = 2_000;
/// Minimum deposit for any storage pool (group, shared, platform) (10 KB ≈ 0.01 NEAR).
pub const MIN_POOL_DEPOSIT_BYTES: u64 = 10_000;
/// Minimum platform onboarding bytes (6 KB).
pub const MIN_PLATFORM_ONBOARDING_BYTES: u64 = 6_000;
/// Minimum platform daily refill bytes (3 KB).
pub const MIN_PLATFORM_DAILY_REFILL_BYTES: u64 = 3_000;
/// Minimum platform allowance max bytes (6 KB).
pub const MIN_PLATFORM_ALLOWANCE_MAX_BYTES: u64 = 6_000;

// --- Key Formats ---

/// Path suffix for shared storage entries: `{account}/shared_storage`.
pub const SHARED_STORAGE_PATH_SUFFIX: &str = "/shared_storage";
/// Group pool key prefix: `group-{group_id}.pool`.
pub const GROUP_POOL_PREFIX: &str = "group-";
pub const GROUP_POOL_SUFFIX: &str = ".pool";

// --- Partitioning ---

/// Number of hash partitions for data sharding. Must be power of 2.
pub const NUM_PARTITIONS: u16 = 4096;

// --- Events (NEP-297) ---

pub const EVENT_STANDARD: &str = "onsocial";
pub const EVENT_VERSION: &str = "1.0.0";
pub const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

pub const EVENT_TYPE_DATA_UPDATE: &str = "DATA_UPDATE";
pub const EVENT_TYPE_STORAGE_UPDATE: &str = "STORAGE_UPDATE";
pub const EVENT_TYPE_PERMISSION_UPDATE: &str = "PERMISSION_UPDATE";
pub const EVENT_TYPE_GROUP_UPDATE: &str = "GROUP_UPDATE";
pub const EVENT_TYPE_CONTRACT_UPDATE: &str = "CONTRACT_UPDATE";

// --- Governance: Voting ---

/// Basis points denominator (10000 = 100%).
pub const BPS_DENOMINATOR: u16 = 10_000;

pub const DEFAULT_VOTING_PERIOD: u64 = 7 * 24 * 60 * 60 * 1_000_000_000; // 7 days
pub const MIN_VOTING_PERIOD: u64 = 60 * 60 * 1_000_000_000; // 1 hour
pub const MAX_VOTING_PERIOD: u64 = 365 * 24 * 60 * 60 * 1_000_000_000; // 365 days

pub const DEFAULT_VOTING_PARTICIPATION_QUORUM_BPS: u16 = 5_100; // 51%
pub const DEFAULT_VOTING_MAJORITY_THRESHOLD_BPS: u16 = 5_001; // 50.01%
pub const MIN_VOTING_PARTICIPATION_QUORUM_BPS: u16 = 100; // 1%
pub const MIN_VOTING_MAJORITY_THRESHOLD_BPS: u16 = 5_001; // >50%

// --- Governance: Proposals ---

/// Minimum deposit to create a proposal (0.1 NEAR).
/// Credited to proposer's storage balance; partially locked until completion.
pub const MIN_PROPOSAL_DEPOSIT: u128 = 100_000_000_000_000_000_000_000;

/// Amount locked from proposer's balance during proposal lifecycle (0.05 NEAR).
/// Invariant: PROPOSAL_EXECUTION_LOCK < MIN_PROPOSAL_DEPOSIT.
pub const PROPOSAL_EXECUTION_LOCK: u128 = 50_000_000_000_000_000_000_000;
