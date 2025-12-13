// --- Constants ---

// --- Imports ---
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk_macros::NearSchema;

/// Governance configuration for contract operations.
///
/// This configuration controls operational limits to prevent DoS attacks
/// while allowing flexibility for different use cases. All limits can only
/// be increased (never decreased) to prevent malicious governance attacks.
///
/// Design Philosophy:
/// - Start conservative, allow increases via governance
/// - Gas limits provide primary DoS protection
/// - Configuration enables adaptation without code changes
#[derive(NearSchema)]
#[abi(borsh, json)]
#[derive(BorshDeserialize, BorshSerialize, Clone, serde::Serialize, serde::Deserialize)]
pub struct GovernanceConfig {
    /// Maximum key length for storage operations.
    /// Prevents extremely long keys that could cause gas issues.
    /// Default: 256 chars - allows complex paths while limiting abuse.
    pub max_key_length: u16,

    /// Maximum path depth for nested operations.
    /// Prevents infinite recursion and stack overflows.
    /// Default: 12 levels - allows complex hierarchies while limiting abuse.
    pub max_path_depth: u16,

    /// Maximum operations per batch transaction.
    /// Balances efficiency with gas limits and DoS prevention.
    /// Default: 100 operations - allows bulk operations while limiting impact.
    pub max_batch_size: u16,

    /// Minimum gas for cross-contract calls (in TGas).
    /// Ensures called contracts have sufficient gas to execute.
    /// Default: 10 TGas - reasonable minimum for most operations.
    pub min_promise_gas_tgas: u64,
}

// --- Default Implementation ---
impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            // Conservative defaults based on analysis and testing
            max_key_length: 256,    // Allows complex paths, prevents abuse
            max_path_depth: 12,     // Allows hierarchies, prevents recursion
            max_batch_size: 100,    // Allows bulk ops, prevents spam
            min_promise_gas_tgas: 10, // Reasonable minimum for cross-contract calls
        }
    }
}

// --- Public API ---
impl GovernanceConfig {
    /// Validate that new config only increases limits (anti-DoS).
    ///
    /// This prevents malicious governance from reducing limits to break
    /// existing functionality or create DoS conditions. Only increases
    /// are allowed to maintain backwards compatibility.
    ///
    /// Returns error if any value is decreased, or if gas thresholds are below minimums.
    pub fn validate_update(&self, current: &GovernanceConfig) -> Result<(), &'static str> {
        // Only allow increases to prevent breaking existing usage
        if self.max_key_length < current.max_key_length
            || self.max_batch_size < current.max_batch_size
            || self.max_path_depth < current.max_path_depth
        {
            return Err("Configuration values can only be increased");
        }

        // Gas minimums are absolute requirements for functionality
        if self.min_promise_gas_tgas < 10 {
            return Err("Minimum promise gas cannot be less than 10 TGas");
        }
        Ok(())
    }
}
