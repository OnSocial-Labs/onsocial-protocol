// --- Imports ---
use near_sdk_macros::NearSchema;

#[derive(
    NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
)]
#[abi(json, borsh)]
pub struct BorshExtra {
    pub key: String,
    pub value: BorshValue,
}

#[derive(
    NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
)]
#[abi(json, borsh)]
pub enum BorshValue {
    String(String),
    Number(String), // Use string representation for numbers to maintain Borsh compatibility
    Bool(bool),
    Null,
}
#[derive(
    NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
)]
#[abi(json, borsh)]
pub struct Extra {
    pub key: String,
    pub value: String,
}

#[derive(
    NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
)]
#[abi(json, borsh)]
pub struct BaseEventData {
    pub block_height: u64,
    pub timestamp: u64,
    pub author: String,
    pub shard_id: Option<u16>,
    pub subshard_id: Option<u32>,
    pub path_hash: Option<u128>, // Add path_hash for sharding support
    pub extra: Vec<BorshExtra>, // Direct Borsh extras - no string conversion
    // Substreams-compatible fields
    pub evt_id: String,
    pub log_index: u32,
}

#[derive(
    NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    borsh::BorshSerialize,
    borsh::BorshDeserialize,
)]
#[abi(json, borsh)]
pub struct Event {
    pub evt_standard: String,
    pub version: String,
    pub evt_type: String,
    pub op_type: String,  // ← Changed from "operation" to "op_type"
    pub data: Option<BaseEventData>,
}

#[derive(NearSchema, serde::Serialize, serde::Deserialize, Clone)]
#[abi(json, borsh)]
pub struct EventConfig {
    pub emit: bool,
    pub event_type: Option<String>,
}
