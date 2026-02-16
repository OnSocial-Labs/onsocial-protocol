//! Typed error handling for the marketplace contract.
//!
//! Uses `#[derive(near_sdk::FunctionError)]` from the NEAR SDK to enable
//! `#[handle_result]` on public methods. When a method returns
//! `Err(MarketplaceError::Xxx)`, the SDK calls `env::panic_str()`
//! with the Display message — same on-wire behaviour as raw panics,
//! but with structured, testable code.

use near_sdk_macros::NearSchema;

#[derive(NearSchema, near_sdk::FunctionError)]
#[abi(borsh, json)]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum MarketplaceError {
    /// Caller lacks permission (wrong owner, not approved, etc.)
    Unauthorized(String),
    /// Invalid parameters, IDs, or data from the caller.
    InvalidInput(String),
    /// Requested entity does not exist.
    NotFound(String),
    /// Operation not allowed given current contract state.
    InvalidState(String),
    /// Attached deposit is too low.
    InsufficientDeposit(String),
    /// Storage balance is too low.
    InsufficientStorage(String),
    /// Internal invariant violation (should never happen).
    InternalError(String),
}

impl std::fmt::Display for MarketplaceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            Self::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            Self::NotFound(msg) => write!(f, "Not found: {}", msg),
            Self::InvalidState(msg) => write!(f, "Invalid state: {}", msg),
            Self::InsufficientDeposit(msg) => write!(f, "Insufficient deposit: {}", msg),
            Self::InsufficientStorage(msg) => write!(f, "Insufficient storage: {}", msg),
            Self::InternalError(msg) => write!(f, "Internal error: {}", msg),
        }
    }
}
