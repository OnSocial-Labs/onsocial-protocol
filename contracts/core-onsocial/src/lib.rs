use crate::state::models::SocialPlatform;
use near_sdk::{near, json_types::U64, serde_json::Value, PanicOnDefault};

pub use near_sdk::PublicKey;

mod config;
pub mod constants;
mod errors;
mod events;
mod api;
mod protocol;
mod domain;

pub use errors::SocialError;

// Domain modules live under `domain/`.
mod state;
mod status;
mod storage;
mod validation;
pub use protocol::{Auth, SetOptions, SetRequest};
#[cfg(test)]
mod tests;

#[derive(
    near_sdk_macros::NearSchema,
    near_sdk::serde::Serialize,
    near_sdk::serde::Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct PlatformPoolInfo {
    pub storage_balance: u128,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub shared_bytes: u64,
    pub available_bytes: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    platform: SocialPlatform,
}

#[derive(
    near_sdk_macros::NearSchema,
    near_sdk::serde::Serialize,
    near_sdk::serde::Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct EntryView {
    pub requested_key: String,
    pub full_key: String,
    pub value: Option<Value>,
    pub block_height: Option<U64>,
    pub deleted: bool,
}

