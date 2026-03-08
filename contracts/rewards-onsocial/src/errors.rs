use near_sdk_macros::NearSchema;

#[derive(NearSchema, near_sdk::FunctionError)]
#[abi(json)]
#[derive(Debug, Clone, serde::Serialize)]
pub enum RewardsError {
    Unauthorized(String),
    InvalidInput(String),
    DailyCapReached,
    InsufficientPool(String),
    NothingToClaim,
    InvalidAmount,
    ClaimPending,
    InternalError(String),
    AppNotFound(String),
    AppInactive(String),
    AppDailyCapReached(String),
    AppBudgetExhausted(String),
    AppDailyBudgetExhausted(String),
}

impl std::fmt::Display for RewardsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            Self::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            Self::DailyCapReached => write!(f, "Daily reward cap reached"),
            Self::InsufficientPool(msg) => write!(f, "Insufficient pool: {}", msg),
            Self::NothingToClaim => write!(f, "Nothing to claim"),
            Self::InvalidAmount => write!(f, "Invalid amount"),
            Self::ClaimPending => write!(f, "Claim already pending"),
            Self::InternalError(msg) => write!(f, "Internal error: {}", msg),
            Self::AppNotFound(id) => write!(f, "App not found: {}", id),
            Self::AppInactive(id) => write!(f, "App inactive: {}", id),
            Self::AppDailyCapReached(id) => write!(f, "App daily cap reached: {}", id),
            Self::AppBudgetExhausted(id) => write!(f, "App total budget exhausted: {}", id),
            Self::AppDailyBudgetExhausted(id) => {
                write!(f, "App aggregate daily budget exhausted: {}", id)
            }
        }
    }
}
