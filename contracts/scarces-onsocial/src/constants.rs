use near_sdk::NearToken;

pub const MAX_TOKEN_ID_LEN: usize = 256;

pub const DEFAULT_TOTAL_FEE_BPS: u16 = 200;
pub const DEFAULT_APP_POOL_FEE_BPS: u16 = 50;
pub const DEFAULT_PLATFORM_STORAGE_FEE_BPS: u16 = 50;
pub const MAX_TOTAL_FEE_BPS: u16 = 300;
pub const MIN_TOTAL_FEE_BPS: u16 = 100;
pub const MIN_POOL_FEE_BPS: u16 = 25;
pub const MAX_POOL_FEE_BPS: u16 = 100;
pub const PLATFORM_STORAGE_MIN_RESERVE: u128 = 10_000_000_000_000_000_000_000_000; // 10 NEAR
pub const DEFAULT_APP_MAX_USER_BYTES: u64 = 50_000;

pub const BASIS_POINTS: u16 = 10_000; // 100%
pub const MAX_ROYALTY_BPS: u32 = 5_000; // 50%
// Storage key invariant: delimiter cannot appear in NEAR account IDs, preventing sale_id key collisions.
pub const DELIMETER: &str = ":";
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

pub const MAX_COLLECTION_SUPPLY: u32 = 100_000;
pub const DEFAULT_REFUND_DEADLINE_NS: u64 = 90 * 24 * 60 * 60 * 1_000_000_000;
// Refund safety invariant: minimum deadline prevents immediate organizer withdrawal before holder claims.
pub const MIN_REFUND_DEADLINE_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
pub const MAX_METADATA_LEN: usize = 16_384;
pub const MAX_BATCH_MINT: u32 = 10;
pub const MAX_AIRDROP_RECIPIENTS: u32 = 50;
pub const MAX_BATCH_TRANSFER: u32 = 20;
pub const MAX_INTENTS_EXECUTORS: usize = 50;

pub const DEFAULT_CALLBACK_GAS: u64 = 50;
pub const DEFAULT_SCARCE_TRANSFER_GAS: u64 = 50;
pub const DEFAULT_RESOLVE_PURCHASE_GAS: u64 = 125;
pub const MAX_RESOLVE_PURCHASE_GAS: u64 = 200;
pub const GAS_NEAR_WITHDRAW_TGAS: u64 = 15;
pub const GAS_UNWRAP_CALLBACK_TGAS: u64 = 20;
pub const GAS_MIGRATE_TGAS: u64 = 200;
