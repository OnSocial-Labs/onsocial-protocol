// --- Group Module ---
// Central hub for all group-related functionality in the OnSocial protocol

pub mod content;       // NEW: Group content operations (writing, validation, transformation)
pub mod core;          // Core storage struct, helpers, and basic getters
pub mod governance;
pub mod permission_types;
pub mod group_api;     // Direct group API methods
pub mod kv_permissions; // Direct KV permission system
pub mod members;       // Member management, join requests, blacklist
pub mod operations;    // Group CRUD operations and stats

// --- Re-exports ---
// Re-export main types for easy access
pub use content::GroupContentManager; // NEW: Clean group content interface
pub use core::GroupStorage;
pub use permission_types::ProposalType;