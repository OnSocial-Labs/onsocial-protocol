use near_sdk_macros::NearSchema;

#[derive(NearSchema, near_sdk::FunctionError)]
#[abi(borsh, json)]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum SocialError {
    InsufficientStorage(String),
    Unauthorized(String, String),
    InvalidInput(String),
    ContractReadOnly,
    PermissionDenied(String, String),
}

impl std::fmt::Display for SocialError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InsufficientStorage(msg) => write!(f, "{}", msg),
            Self::Unauthorized(op, acc) => write!(f, "Unauthorized: {} by {}", op, acc),
            Self::InvalidInput(msg) => write!(f, "{}", msg),
            Self::ContractReadOnly => write!(f, "Contract is read-only"),
            Self::PermissionDenied(op, path) => write!(f, "Permission denied: {} on {}", op, path),
        }
    }
}

#[macro_export]
macro_rules! invalid_input {
    ($msg:expr) => {
        $crate::errors::SocialError::InvalidInput($msg.into())
    };
}

#[macro_export]
macro_rules! unauthorized {
    ($op:expr, $acc:expr) => {
        $crate::errors::SocialError::Unauthorized($op.into(), $acc.into())
    };
}

#[macro_export]
macro_rules! permission_denied {
    ($op:expr, $path:expr) => {
        $crate::errors::SocialError::PermissionDenied($op.into(), $path.into())
    };
}

#[macro_export]
macro_rules! insufficient_storage {
    ($msg:expr) => {
        $crate::errors::SocialError::InsufficientStorage($msg.into())
    };
}
