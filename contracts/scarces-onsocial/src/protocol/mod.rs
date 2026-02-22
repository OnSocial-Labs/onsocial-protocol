mod types;

pub use types::*;

pub use onsocial_auth::Auth;

pub use crate::collections::AllowlistEntry;
pub use crate::scarce::types::TransferItem;

// Storage boundary: nonce namespace must remain distinct from other contracts.
pub const NONCE_PREFIX: u8 = 0x06;

// Signature-domain boundary for payload verification.
pub const DOMAIN_PREFIX: &str = "onsocial:marketplace";
