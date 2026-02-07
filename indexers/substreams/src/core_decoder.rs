//! NEP-297 JSON decoder for core-onsocial contract events
//!
//! Format: `EVENT_JSON:{"standard":"onsocial","version":"1.0.0","event":"...","data":[...]}`
//!
//! No more Borsh decoding needed - just standard JSON parsing!

use serde::Deserialize;
use serde_json::Value;

/// NEP-297 event structure (matches Event in contract types.rs)
#[derive(Deserialize, Debug, Clone)]
pub struct OnSocialEvent {
    #[serde(default)]
    pub standard: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub event: String,
    #[serde(default)]
    pub data: Vec<EventData>,
}

/// Event data payload (matches EventData in contract types.rs)
#[derive(Deserialize, Debug, Clone)]
pub struct EventData {
    #[serde(default)]
    pub operation: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub partition_id: Option<u16>,
    /// All other fields are captured here
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}

/// Decode a NEP-297 JSON event from log string
pub fn decode_onsocial_event(json_data: &str) -> Result<OnSocialEvent, DecodeError> {
    serde_json::from_str(json_data)
        .map_err(|e| DecodeError::Json(e.to_string()))
}

#[derive(Debug)]
pub enum DecodeError {
    Json(String),
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeError::Json(e) => write!(f, "JSON decode error: {}", e),
        }
    }
}
