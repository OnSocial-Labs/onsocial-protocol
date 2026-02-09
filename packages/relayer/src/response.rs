//! Response types for the relayer API.

use serde::Serialize;
use serde_json::Value;

/// Response from the execute endpoint.
#[derive(Serialize)]
pub struct ExecuteResponse {
    pub success: bool,
    /// "pending" for async submissions, "final" once confirmed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
}

impl ExecuteResponse {
    /// Final (synchronous) success — used by key pool operations and future sync mode.
    #[allow(dead_code)]
    pub fn ok(result: Option<Value>, tx_hash: String) -> Self {
        Self {
            success: true,
            status: Some("final".into()),
            result,
            error: None,
            tx_hash: Some(tx_hash),
        }
    }

    pub fn pending(tx_hash: String) -> Self {
        Self {
            success: true,
            status: Some("pending".into()),
            result: None,
            error: None,
            tx_hash: Some(tx_hash),
        }
    }

    pub fn err(error: impl Into<String>, tx_hash: Option<String>) -> Self {
        Self {
            success: false,
            status: None,
            result: None,
            error: Some(error.into()),
            tx_hash,
        }
    }
}

/// Response from the /tx/:hash status endpoint.
#[derive(Serialize)]
pub struct TxStatusResponse {
    pub tx_hash: String,
    /// "pending", "success", "failure", or "error"
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl TxStatusResponse {
    pub fn pending_status(tx_hash: String) -> Self {
        Self { tx_hash, status: "pending".into(), result: None, error: None }
    }

    pub fn final_ok(tx_hash: String, result: Option<Value>) -> Self {
        Self { tx_hash, status: "success".into(), result, error: None }
    }

    pub fn final_err(tx_hash: String, error: String) -> Self {
        Self { tx_hash, status: "failure".into(), result: None, error: Some(error) }
    }

    pub fn err(error: impl Into<String>) -> Self {
        Self { tx_hash: String::new(), status: "error".into(), result: None, error: Some(error.into()) }
    }
}

/// Key pool statistics.
#[derive(Serialize)]
pub struct KeyPoolStats {
    pub active_keys: usize,
    pub warm_keys: usize,
    pub draining_keys: usize,
    pub total_in_flight: u32,
    pub utilization: f32,
}

/// Response from the health endpoint.
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub relayer_account: String,
    pub contract_id: String,
    pub uptime_secs: u64,
    pub requests: u64,
    pub active_rpc: String,
    pub failovers: u64,
    pub key_pool: KeyPoolStats,
}
