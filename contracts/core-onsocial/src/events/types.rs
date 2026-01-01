use crate::constants::{EVENT_STANDARD, EVENT_VERSION};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{Map, Value};
use near_sdk_macros::NearSchema;

#[derive(NearSchema, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Event {
    pub standard: String,
    pub version: String,
    pub event: String,
    pub data: Vec<EventData>,
}

#[derive(NearSchema, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct EventData {
    pub operation: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partition_id: Option<u16>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Event {
    pub fn new(event_type: &str, data: Vec<EventData>) -> Self {
        Self {
            standard: EVENT_STANDARD.to_string(),
            version: EVENT_VERSION.to_string(),
            event: event_type.to_string(),
            data,
        }
    }
}
