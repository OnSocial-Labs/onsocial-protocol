// --- Submodules ---
pub mod account;
pub mod permissions;
pub mod set;
pub mod get;

// --- Re-exports ---
// Re-export all public functions from submodules to maintain the same API surface
// Note: These are currently unused as methods are called directly on SocialPlatform
// pub use account::*;
// pub use permissions::*;
// pub use set::*;
// pub use get::*;
// pub use content::*;
