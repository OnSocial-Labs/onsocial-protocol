/// Minimum bytes when sharing storage with another user.
pub const MIN_SHARED_STORAGE_BYTES: u64 = 2000;
pub const MAX_INTENT_BYTES: usize = 16 * 1024;
pub const NUM_PARTITIONS: u16 = 4096;

pub const EVENT_STANDARD: &str = "onsocial";
pub const EVENT_VERSION: &str = "1.0.0";
pub const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

pub const EVENT_TYPE_DATA_UPDATE: &str = "DATA_UPDATE";
pub const EVENT_TYPE_STORAGE_UPDATE: &str = "STORAGE_UPDATE";
pub const EVENT_TYPE_PERMISSION_UPDATE: &str = "PERMISSION_UPDATE";
pub const EVENT_TYPE_GROUP_UPDATE: &str = "GROUP_UPDATE";
pub const EVENT_TYPE_CONTRACT_UPDATE: &str = "CONTRACT_UPDATE";

pub const BPS_DENOMINATOR: u16 = 10_000;
pub const DEFAULT_VOTING_PERIOD: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
pub const DEFAULT_VOTING_PARTICIPATION_QUORUM_BPS: u16 = 5_100;
pub const DEFAULT_VOTING_MAJORITY_THRESHOLD_BPS: u16 = 5_001;
pub const MIN_VOTING_PERIOD: u64 = 60 * 60 * 1_000_000_000;
pub const MAX_VOTING_PERIOD: u64 = 365 * 24 * 60 * 60 * 1_000_000_000;
pub const MIN_VOTING_PARTICIPATION_QUORUM_BPS: u16 = 100; // 1% minimum
pub const MIN_VOTING_MAJORITY_THRESHOLD_BPS: u16 = 5_001; // Must be > 50%

pub const SHARED_STORAGE_PATH_SUFFIX: &str = "/shared_storage";

/// Minimum deposit required to create a proposal (0.1 NEAR).
/// This deposit is credited to proposer's storage balance and locked until proposal completes.
/// The locked amount ensures proposers can pay for execution costs.
pub const MIN_PROPOSAL_DEPOSIT: u128 = 100_000_000_000_000_000_000_000;

/// Amount locked from proposer's balance for proposal execution (0.05 NEAR).
/// This is less than MIN_PROPOSAL_DEPOSIT to leave room for proposal storage costs.
/// Unlocked when proposal is executed, rejected, expired, or cancelled.
pub const PROPOSAL_EXECUTION_LOCK: u128 = 50_000_000_000_000_000_000_000;

pub const NANOS_PER_MINUTE: u64 = 60_000_000_000;
pub const NANOS_PER_DAY: u64 = 86_400_000_000_000;

/// Format prefix for group storage pool keys.
pub const GROUP_POOL_PREFIX: &str = "group-";
/// Format suffix for group storage pool keys.
pub const GROUP_POOL_SUFFIX: &str = ".pool";

