//! Marketplace-wide constants.

use near_sdk::NearToken;

/// Cost per byte of NEAR storage (10^19 yoctoNEAR = 0.00001 NEAR per byte)
pub const STORAGE_BYTE_COST: u128 = 10_000_000_000_000_000_000;

/// Maximum token ID length
pub const MAX_TOKEN_ID_LEN: usize = 256;

/// Default total marketplace fee in basis points (250 = 2.5%)
pub const DEFAULT_TOTAL_FEE_BPS: u16 = 250;

/// Default app-pool split: portion of fee routed to app pool (100 = 1%)
pub const DEFAULT_APP_POOL_FEE_BPS: u16 = 100;

/// Default per-user byte cap from a single app pool (50 KB lifetime)
pub const DEFAULT_APP_MAX_USER_BYTES: u64 = 50_000;

/// Basis points denominator (10,000 = 100%)
pub const BASIS_POINTS: u16 = 10_000;

/// Maximum total royalty (5000 = 50%)
pub const MAX_ROYALTY_BPS: u32 = 5_000;

/// Delimiter for unique sale ID
pub const DELIMETER: &str = ".";

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
