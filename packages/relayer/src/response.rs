//! Response types for the relayer API.

use serde::Serialize;
use serde_json::Value;

/// Response from the execute endpoint.
#[derive(Serialize)]
pub struct ExecuteResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
}

impl ExecuteResponse {
    pub fn ok(result: Option<Value>, tx_hash: String) -> Self {
        Self {
            success: true,
            result,
            error: None,
            tx_hash: Some(tx_hash),
        }
    }

    pub fn err(error: impl Into<String>, tx_hash: Option<String>) -> Self {
        Self {
            success: false,
            result: None,
            error: Some(error.into()),
            tx_hash,
        }
    }
}

/// Response from the health endpoint.
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub relayer_account: String,
    pub contract_id: String,
    pub uptime_secs: u64,
    pub requests: u64,
}
