use near_sdk::{PublicKey};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk_macros::NearSchema;
use std::cmp::Ordering;

#[derive(Clone, Serialize, Deserialize, BorshSerialize, BorshDeserialize, NearSchema)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
#[abi(json, borsh)]
pub struct KeyInfo {
    pub public_key: PublicKey,
    pub expiration_timestamp: Option<u64>,
    pub is_multi_sig: bool,
    pub multi_sig_threshold: Option<u32>,
}

impl PartialEq for KeyInfo {
    fn eq(&self, other: &Self) -> bool {
        self.public_key == other.public_key
    }
}

impl Eq for KeyInfo {}

impl std::hash::Hash for KeyInfo {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.public_key.hash(state);
    }
}

impl PartialOrd for KeyInfo {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.public_key.cmp(&other.public_key))
    }
}

impl Ord for KeyInfo {
    fn cmp(&self, other: &Self) -> Ordering {
        self.public_key.cmp(&other.public_key)
    }
}