// --- Modules ---
pub(crate) mod models;
pub(crate) mod operations;
pub(crate) mod platform;

// SocialPlatform API surface (impl blocks consolidated here).
pub(crate) mod data;
pub(crate) mod permissions;
pub(crate) mod storage_pools;

// --- Re-exports ---
pub use models::{ContractStatus, SocialPlatform};

