use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{Map, Value};
use near_sdk_macros::NearSchema;

#[derive(NearSchema, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub(crate) struct Event {
    pub(crate) standard: String,
    pub(crate) version: String,
    pub(crate) event: String,
    pub(crate) data: Vec<EventData>,
}

#[derive(NearSchema, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub(crate) struct EventData {
    pub(crate) operation: String,
    pub(crate) author: String,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}
