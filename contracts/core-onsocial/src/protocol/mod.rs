//! Protocol types for the OnSocial contract.

pub(crate) mod canonical_json;
pub(crate) mod operation;
pub(crate) mod types;

pub use types::{Action, Auth, Options, Request};
