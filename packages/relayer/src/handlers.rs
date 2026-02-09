//! HTTP request handlers.

use crate::response::{ExecuteResponse, HealthResponse};
use crate::state::AppState;
use crate::rpc::RpcClient;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use near_gas::NearGas;
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tracing::{error, info, warn};

/// Health check with basic metrics.
pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok",
        relayer_account: state.signer.account_id.to_string(),
        contract_id: state.config.contract_id.clone(),
        uptime_secs: state.start_time.elapsed().as_secs(),
        requests: state.request_count.load(Ordering::Relaxed),
        active_rpc: state.rpc.active_url().to_string(),
        failovers: state.rpc.failover_count(),
    })
}

/// Forward a signed request to the contract's execute() method.
pub async fn execute(
    State(state): State<Arc<AppState>>,
    Json(request): Json<Value>,
) -> impl IntoResponse {
    state.request_count.fetch_add(1, Ordering::Relaxed);

    let action_type = request
        .get("action")
        .and_then(|a| a.get("type"))
        .and_then(|t| t.as_str())
        .unwrap_or("unknown");

    info!(action = action_type, "Relaying request");

    // Validate request structure
    if !request.is_object() {
        warn!("Invalid request format");
        return (
            StatusCode::BAD_REQUEST,
            Json(ExecuteResponse::err("Request must be a JSON object", None)),
        );
    }

    if request.get("action").is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ExecuteResponse::err("Missing 'action' field", None)),
        );
    }

    // Parse contract ID
    let contract_id: near_primitives::types::AccountId = match state.config.contract_id.parse() {
        Ok(id) => id,
        Err(e) => {
            error!(error = %e, "Invalid contract ID");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ExecuteResponse::err("Invalid contract configuration", None)),
            );
        }
    };

    // Call contract with retry + failover
    let gas = NearGas::from_tgas(state.config.gas_tgas);

    // Try active provider (primary unless circuit is open)
    let result = try_call_with_retries(&state, &contract_id, &request, gas, false).await;

    match result {
        Ok(outcome) => {
            state.rpc.record_success();
            let tx_hash = outcome.outcome().id.to_string();

            if outcome.is_success() {
                let value: Option<Value> = outcome.json().ok();
                (StatusCode::OK, Json(ExecuteResponse::ok(value, tx_hash)))
            } else {
                let error = outcome
                    .failures()
                    .first()
                    .map(|f| format!("{f:?}"))
                    .unwrap_or_else(|| "Execution failed".into());
                (
                    StatusCode::BAD_REQUEST,
                    Json(ExecuteResponse::err(error, Some(tx_hash))),
                )
            }
        }
        Err(primary_err) => {
            // Primary exhausted — try fallback
            state.rpc.record_failure();
            warn!(error = %primary_err, "Primary RPC failed, trying fallback");

            match try_call_with_retries(&state, &contract_id, &request, gas, true).await {
                Ok(outcome) => {
                    let tx_hash = outcome.outcome().id.to_string();
                    if outcome.is_success() {
                        let value: Option<Value> = outcome.json().ok();
                        (StatusCode::OK, Json(ExecuteResponse::ok(value, tx_hash)))
                    } else {
                        let error = outcome
                            .failures()
                            .first()
                            .map(|f| format!("{f:?}"))
                            .unwrap_or_else(|| "Execution failed".into());
                        (
                            StatusCode::BAD_REQUEST,
                            Json(ExecuteResponse::err(error, Some(tx_hash))),
                        )
                    }
                }
                Err(e) => {
                    error!(error = %e, "All RPC providers failed");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ExecuteResponse::err(format!("All RPC providers failed: {e}"), None)),
                    )
                }
            }
        }
    }
}

/// Try calling the contract with retries on a specific provider.
async fn try_call_with_retries(
    state: &AppState,
    contract_id: &near_primitives::types::AccountId,
    request: &Value,
    gas: NearGas,
    use_fallback: bool,
) -> Result<near_fetch::result::ExecutionFinalResult, near_fetch::Error> {
    let client = if use_fallback {
        state.rpc.fallback()
    } else {
        state.rpc.active()
    };

    let max_retries = RpcClient::max_retries();
    let mut last_err = None;

    for attempt in 0..=max_retries {
        if attempt > 0 {
            let delay = RpcClient::retry_delay(attempt - 1);
            warn!(attempt, delay_ms = delay.as_millis() as u64, "Retrying RPC call");
            tokio::time::sleep(delay).await;
        }

        match client
            .call(&state.signer, contract_id, "execute")
            .args_json(serde_json::json!({ "request": request }))
            .gas(gas)
            .transact()
            .await
        {
            Ok(outcome) => return Ok(outcome),
            Err(e) => {
                last_err = Some(e);
            }
        }
    }

    Err(last_err.unwrap())
}
