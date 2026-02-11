//! On-chain auth for OnSocial contracts: signature verification, nonce
//! management, and shared auth types via NEAR host functions.

mod auth_types;
mod authenticate;
pub mod nonce;
mod verify;

pub use auth_types::{Auth, AuthContext};
pub use authenticate::authenticate;
pub use verify::{Verify, verify_signature};
