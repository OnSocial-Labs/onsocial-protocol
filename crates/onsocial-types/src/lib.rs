//! Shared types and pure-logic utilities for the OnSocial protocol.
//! Zero NEAR SDK dependency — usable on-chain and off-chain.

mod canonical;
mod crypto;
mod error;
mod message;

pub use canonical::canonicalize_json_value;
pub use crypto::{ed25519_public_key_bytes, ed25519_signature_bytes};
pub use error::AuthError;
pub use message::{build_signing_message, build_signing_payload};
