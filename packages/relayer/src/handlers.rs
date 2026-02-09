//! HTTP request handlers.

use crate::response::{ExecuteResponse, HealthResponse, KeyPoolStats, TxStatusResponse};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use near_gas::NearGas;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::{Action, FunctionCallAction};
use near_primitives::views::FinalExecutionStatus;
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tracing::{error, info, warn};

/// Health check with basic metrics.
pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = &state.key_pool;
    Json(HealthResponse {
        status: "ok",
        relayer_account: pool.relayer_account().to_string(),
        contract_id: state.config.contract_id.clone(),
        uptime_secs: state.start_time.elapsed().as_secs(),
        requests: state.request_count.load(Ordering::Relaxed),
        active_rpc: state.rpc.active_url().to_string(),
        failovers: state.rpc.failover_count(),
        key_pool: KeyPoolStats {
            active_keys: pool.active_count(),
            warm_keys: pool.warm_count(),
            draining_keys: pool.draining_count(),
            total_in_flight: pool.total_in_flight(),
            utilization: pool.utilization(),
        },
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

    // Acquire a key from the pool
    let guard = match state.key_pool.acquire() {
        Ok(g) => g,
        Err(e) => {
            error!(error = %e, "Key pool exhausted");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ExecuteResponse::err("Relayer busy, try again", None)),
            );
        }
    };

    // Call contract with retry + failover
    let gas = NearGas::from_tgas(state.config.gas_tgas);

    // Build the function call action
    let args = serde_json::to_vec(&serde_json::json!({ "request": request }))
        .expect("json serialization cannot fail");

    let actions = vec![Action::FunctionCall(Box::new(FunctionCallAction {
        method_name: "execute".to_string(),
        args,
        gas: gas.as_gas(),
        deposit: 0,
    }))];

    // Async fire-and-forget: sign TX and broadcast without waiting for finality
    let block_hash = match state.rpc.latest_block_hash().await {
        Ok(h) => h,
        Err(e) => {
            error!(error = %e, "Failed to get block hash");
            return (
                StatusCode::BAD_GATEWAY,
                Json(ExecuteResponse::err(format!("RPC unavailable: {e}"), None)),
            );
        }
    };

    let signer_id = state.key_pool.account_id.clone();
    let signed_tx = near_primitives::transaction::Transaction::V0(
        near_primitives::transaction::TransactionV0 {
            signer_id,
            public_key: guard.signer().public_key(),
            nonce: guard.nonce,
            receiver_id: contract_id.clone(),
            block_hash,
            actions,
        },
    )
    .sign(guard.signer());

    match state.rpc.send_tx_async(signed_tx).await {
        Ok(tx_hash) => {
            state.rpc.record_success();
            info!(tx_hash = %tx_hash, "TX submitted (async)");
            (
                StatusCode::ACCEPTED,
                Json(ExecuteResponse::pending(tx_hash.to_string())),
            )
        }
        Err(e) => {
            let err_str = format!("{e}");

            // Nonce error — re-sync and retry once
            if err_str.contains("InvalidNonce") || err_str.contains("nonce") {
                warn!("Nonce error on async send, re-syncing");
                let pk = guard.public_key();
                let _ = state.key_pool.handle_nonce_error(&pk, &state.rpc).await;
            }

            state.rpc.record_failure();
            error!(error = %e, "Async broadcast failed");
            (
                StatusCode::BAD_GATEWAY,
                Json(ExecuteResponse::err(format!("Broadcast failed: {e}"), None)),
            )
        }
    }
}

/// Query the status of a previously submitted transaction.
/// `GET /tx/:tx_hash`
pub async fn tx_status(
    State(state): State<Arc<AppState>>,
    Path(tx_hash_str): Path<String>,
) -> impl IntoResponse {
    let tx_hash: CryptoHash = match tx_hash_str.parse() {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(TxStatusResponse::err("Invalid tx_hash format")),
            );
        }
    };

    let sender_id = &state.key_pool.account_id;

    match state.rpc.tx_status(tx_hash, sender_id).await {
        Ok(outcome) => {
            let hash = format!("{}", outcome.transaction_outcome.id);
            match &outcome.status {
                FinalExecutionStatus::SuccessValue(bytes) => {
                    let value: Option<Value> = serde_json::from_slice(bytes).ok();
                    (StatusCode::OK, Json(TxStatusResponse::final_ok(hash, value)))
                }
                FinalExecutionStatus::Failure(e) => (
                    StatusCode::OK,
                    Json(TxStatusResponse::final_err(hash, format!("{e:?}"))),
                ),
                FinalExecutionStatus::Started | FinalExecutionStatus::NotStarted => (
                    StatusCode::OK,
                    Json(TxStatusResponse::pending_status(hash)),
                ),
            }
        }
        Err(e) => {
            // TX not found yet — likely still pending
            let err_str = format!("{e}");
            if err_str.contains("UNKNOWN_TRANSACTION") || err_str.contains("not found") {
                (StatusCode::OK, Json(TxStatusResponse::pending_status(tx_hash_str)))
            } else {
                (StatusCode::BAD_GATEWAY, Json(TxStatusResponse::err(format!("RPC error: {e}"))))
            }
        }
    }
}


