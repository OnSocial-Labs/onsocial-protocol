use near_sdk_macros::NearSchema;

#[derive(NearSchema, near_sdk::FunctionError)]
#[abi(json)]
#[derive(Debug, Clone, serde::Serialize)]
pub enum RewardsError {
    Unauthorized(String),
    DailyCapReached,
    InsufficientPool(String),
    NothingToClaim,
    InvalidAmount,
    ClaimPending,
    InternalError(String),
}

impl std::fmt::Display for RewardsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            Self::DailyCapReached => write!(f, "Daily reward cap reached"),
            Self::InsufficientPool(msg) => write!(f, "Insufficient pool: {}", msg),
            Self::NothingToClaim => write!(f, "Nothing to claim"),
            Self::InvalidAmount => write!(f, "Invalid amount"),
            Self::ClaimPending => write!(f, "Claim already pending"),
            Self::InternalError(msg) => write!(f, "Internal error: {}", msg),
        }
    }
}
