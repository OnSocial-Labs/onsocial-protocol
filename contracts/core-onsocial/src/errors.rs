// --- Imports ---
use near_sdk::{env, FunctionError};
use near_sdk_macros::NearSchema;

// --- Error Constants ---
// Path and validation errors
pub const ERR_INVALID_PATH_LENGTH: &str = "Invalid path length";
pub const ERR_INVALID_PATH_FORMAT: &str = "Invalid path format";
pub const ERR_INVALID_PATH_DEPTH: &str = "Path depth exceeded";
// REMOVED: ERR_DOUBLE_SLASHES - double slash validation removed for gas efficiency
pub const ERR_INVALID_ACCOUNT_ID: &str = "Invalid account id in path";

// Group and content errors
pub const ERR_GROUP_NOT_FOUND: &str = "Group not found";
pub const ERR_MEMBER_DRIVEN_JOIN_REQUESTS: &str = "Member-driven groups handle join requests through proposals only";
pub const ERR_GROUP_ID_TOO_SHORT: &str = "Group ID must be 1-64 characters";
pub const ERR_GROUP_ID_INVALID_CHARS: &str = "Group ID can only contain alphanumeric characters, underscores, and hyphens";
pub const ERR_CONFIG_NOT_OBJECT: &str = "Config must be a JSON object";

// Event and batch errors
pub const ERR_EVENT_DATA_MUST_BE_OBJECT: &str = "Event data must be object";
pub const ERR_FAILED_TO_ENCODE_EVENT: &str = "Failed to encode event";
// REMOVED: ERR_EVENT_TOO_LARGE - event size limits removed as redundant

// Validation errors
// REMOVED: ERR_VALUE_TOO_LARGE - JSON size validation removed for gas efficiency
// REMOVED: ERR_JSON_DEPTH_EXCEEDED - JSON depth validation removed as overkill
pub const ERR_INVALID_JSON_FORMAT: &str = "Invalid JSON format";

// --- Error Types ---
/// Unified error type for social contract operations
#[derive(NearSchema)]
#[abi(borsh, json)]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum SocialError {
    InsufficientDeposit(String),
    InsufficientStorage(String),
    Unauthorized(String, String),
    InvalidInput(String),
    InvalidOperation(String),
    NotFound(String),
    ContractReadOnly,
    PermissionDenied(String, String),
    AccountNotFound,
    GroupNotFound(String),
    InvalidGroupData(String),
}

impl std::fmt::Display for SocialError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let msg = match self {
            Self::InsufficientDeposit(msg) => msg,
            Self::InsufficientStorage(msg) => msg,
            Self::Unauthorized(op, acc) => &format!("Unauthorized: {} by {}", op, acc),
            Self::InvalidInput(msg) => msg,
            Self::InvalidOperation(msg) => msg,
            Self::NotFound(msg) => msg,
            Self::ContractReadOnly => "Contract is read-only",
            Self::PermissionDenied(op, ref path) => {
                &format!("Permission denied: {} on {}", op, path)
            }
            Self::AccountNotFound => "Account not found",
            Self::GroupNotFound(msg) => msg,
            Self::InvalidGroupData(msg) => msg,
        };
        write!(f, "{}", msg)
    }
}

impl FunctionError for SocialError {
    fn panic(&self) -> ! {
        env::panic_str(&self.to_string());
    }
}

// --- Error Macros ---
// Essential error construction macros
#[macro_export]
macro_rules! invalid_input {
    ($msg:expr) => {
        SocialError::InvalidInput($msg.into())
    };
}

#[macro_export]
macro_rules! not_found {
    ($msg:expr) => {
        SocialError::NotFound($msg.into())
    };
}

#[macro_export]
macro_rules! unauthorized {
    ($op:expr, $acc:expr) => {
        SocialError::Unauthorized($op.into(), $acc.into())
    };
}

#[macro_export]
macro_rules! permission_denied {
    ($op:expr, $path:expr) => {
        SocialError::PermissionDenied($op.into(), $path.into())
    };
}

#[macro_export]
macro_rules! insufficient_deposit {
    ($msg:expr) => {
        SocialError::InsufficientDeposit($msg.into())
    };
}

#[macro_export]
macro_rules! insufficient_storage {
    ($msg:expr) => {
        SocialError::InsufficientStorage($msg.into())
    };
}
