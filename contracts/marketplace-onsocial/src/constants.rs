//! Marketplace-wide constants.

use near_sdk::NearToken;

/// Cost per byte of NEAR storage, sourced from the SDK's genesis config.
/// Delegates to `env::storage_byte_cost()` so the value automatically tracks
/// any future protocol-level changes.
#[inline]
pub fn storage_byte_cost() -> u128 {
    near_sdk::env::storage_byte_cost().as_yoctonear()
}

/// Maximum token ID length
pub const MAX_TOKEN_ID_LEN: usize = 256;

/// Default total marketplace fee in basis points (200 = 2.0%).
/// Matches NEAR ecosystem norms (Mintbase, Paras) for competitive creator adoption.
pub const DEFAULT_TOTAL_FEE_BPS: u16 = 200;

/// Default app-pool split: portion of total fee routed to the app pool (50 = 0.5%).
/// Only applies when the sale has an app_id whose pool exists.
pub const DEFAULT_APP_POOL_FEE_BPS: u16 = 50;

/// Default platform storage pool split: portion of total fee (when no app_id) routed to
/// the contract-level platform storage pool (50 = 0.5%).
/// Sponsors storage for standalone operations so users never pay hidden storage costs.
/// Protocol retains the remaining 1.5% as revenue.
pub const DEFAULT_PLATFORM_STORAGE_FEE_BPS: u16 = 50;

/// Minimum platform storage pool balance that must remain after an owner withdrawal.
/// Keeps the pool operational as a storage sponsor between sales.
/// 10 NEAR sponsors ~1 billion token-mint storage operations at current rates.
pub const PLATFORM_STORAGE_MIN_RESERVE: u128 = 10_000_000_000_000_000_000_000_000; // 10 NEAR

/// Default per-user byte cap from a single app pool (50 KB lifetime)
pub const DEFAULT_APP_MAX_USER_BYTES: u64 = 50_000;

/// Basis points denominator (10,000 = 100%)
pub const BASIS_POINTS: u16 = 10_000;

/// Maximum total royalty (5000 = 50%)
pub const MAX_ROYALTY_BPS: u32 = 5_000;

/// Delimiter for unique sale ID
/// ":" is not a valid character in NEAR account IDs, preventing sale_id key collisions.
pub const DELIMETER: &str = ":";

/// No deposit / 1 yocto
pub const NO_DEPOSIT: NearToken = NearToken::from_yoctonear(0);
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

// Native Scarce constants
pub const MAX_COLLECTION_SUPPLY: u32 = 100_000;
pub const MAX_METADATA_LEN: usize = 16_384;
pub const MAX_BATCH_MINT: u32 = 10;
pub const MAX_AIRDROP_RECIPIENTS: u32 = 50;
pub const MAX_BATCH_TRANSFER: u32 = 20;

// Gas constants (TGas)
pub const DEFAULT_CALLBACK_GAS: u64 = 50;
pub const DEFAULT_SCARCE_TRANSFER_GAS: u64 = 50;
pub const DEFAULT_RESOLVE_PURCHASE_GAS: u64 = 125;
pub const MAX_RESOLVE_PURCHASE_GAS: u64 = 200;
