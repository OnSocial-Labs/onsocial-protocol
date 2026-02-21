use near_sdk::NearToken;

/// Returns storage byte cost in yoctoNEAR, tracking protocol-level changes.
#[inline]
pub fn storage_byte_cost() -> u128 {
    near_sdk::env::storage_byte_cost().as_yoctonear()
}

pub const MAX_TOKEN_ID_LEN: usize = 256;

pub const DEFAULT_TOTAL_FEE_BPS: u16 = 200;
// Only applied when the sale has an app_id whose pool exists.
pub const DEFAULT_APP_POOL_FEE_BPS: u16 = 50;
// Used when no app_id; sponsors platform storage costs.
pub const DEFAULT_PLATFORM_STORAGE_FEE_BPS: u16 = 50;
pub const PLATFORM_STORAGE_MIN_RESERVE: u128 = 10_000_000_000_000_000_000_000_000; // 10 NEAR
// Lifetime per-user byte cap from a single app pool.
pub const DEFAULT_APP_MAX_USER_BYTES: u64 = 50_000;

pub const BASIS_POINTS: u16 = 10_000; // 100%
pub const MAX_ROYALTY_BPS: u32 = 5_000; // 50%
// ":" is invalid in NEAR account IDs, preventing sale_id key collisions.
pub const DELIMETER: &str = ":";
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

// --- Native Scarce ---
pub const MAX_COLLECTION_SUPPLY: u32 = 100_000;
pub const DEFAULT_REFUND_DEADLINE_NS: u64 = 90 * 24 * 60 * 60 * 1_000_000_000;
// Prevents organizer from setting a near-zero deadline and draining the pool before holders can claim.
pub const MIN_REFUND_DEADLINE_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
pub const MAX_METADATA_LEN: usize = 16_384;
pub const MAX_BATCH_MINT: u32 = 10;
pub const MAX_AIRDROP_RECIPIENTS: u32 = 50;
pub const MAX_BATCH_TRANSFER: u32 = 20;
pub const MAX_INTENTS_EXECUTORS: usize = 50;

// --- Gas (TGas) ---
pub const DEFAULT_CALLBACK_GAS: u64 = 50;
pub const DEFAULT_SCARCE_TRANSFER_GAS: u64 = 50;
pub const DEFAULT_RESOLVE_PURCHASE_GAS: u64 = 125;
pub const MAX_RESOLVE_PURCHASE_GAS: u64 = 200;
