//! Gasless relayer protocol: Action enum, Request envelope, Auth re-export.

mod types;

pub use types::*;

pub use onsocial_auth::Auth;

// Re-exported from their owning modules
pub use crate::collections::AllowlistEntry;
pub use crate::scarce::types::TransferItem;

// Nonce storage prefix — distinct from core-onsocial (0x05).
pub const NONCE_PREFIX: u8 = 0x06;

// Domain prefix for signed-payload verification.
pub const DOMAIN_PREFIX: &str = "onsocial:marketplace";
