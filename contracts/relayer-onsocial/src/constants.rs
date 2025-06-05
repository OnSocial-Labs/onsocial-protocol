//! Shared constants for the relayer contract and modules.
//!
//! Defines:
//! - Default balances and gas limits
//! - Allowance and argument limits
//! - Nonce delta and range
//! - Account ID length
//! - Confirmation string for upgrades

// Default balances and gas
pub const DEFAULT_MIN_BALANCE: u128 = 6_000_000_000_000_000_000_000_000; // 6 NEAR
pub const MAX_GAS_LIMIT: u64 = 300_000_000_000_000; // Hardcoded to 300 TGas

// Allowance and argument limits
pub const MIN_ALLOWANCE: u128 = 100_000_000_000_000_000_000; // 0.1 NEAR

// Account ID length
pub const MAX_ACCOUNT_ID_LENGTH: usize = 64;

// Confirmation string for upgrades
pub const CONFIRMATION_STRING: &str = "I_UNDERSTAND_DATA_LOSS";
