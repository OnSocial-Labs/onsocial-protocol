use near_sdk_macros::NearSchema;

#[derive(NearSchema, near_sdk::FunctionError)]
#[abi(json)]
#[derive(Debug, Clone, serde::Serialize)]
pub enum MarketplaceError {
    Unauthorized(String),
    InvalidInput(String),
    NotFound(String),
    InvalidState(String),
    InsufficientDeposit(String),
    InsufficientStorage(String),
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

impl MarketplaceError {
    pub fn token_not_found() -> Self {
        Self::NotFound("Token not found".into())
    }
    pub fn collection_not_found() -> Self {
        Self::NotFound("Collection not found".into())
    }
    pub fn sale_not_found() -> Self {
        Self::NotFound("No sale found".into())
    }
    pub fn app_pool_not_found(id: &near_sdk::AccountId) -> Self {
        Self::NotFound(format!("App pool not found: {}", id))
    }
    pub fn listing_not_found() -> Self {
        Self::NotFound("Lazy listing not found".into())
    }
    pub fn soulbound(context: &str) -> Self {
        Self::InvalidState(format!(
            "Cannot {} a non-transferable (soulbound) token",
            context
        ))
    }
    pub fn only_owner(what: &str) -> Self {
        Self::Unauthorized(format!("Only {} can perform this action", what))
    }
}
