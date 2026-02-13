//! HTTP request handlers.

use crate::metrics::METRICS;
use crate::middleware::RequestId;
use crate::response::{ExecuteResponse, HealthResponse, KeyPoolStats, TxStatusResponse};
use crate::state::AppState;
use axum::extract::{FromRequest, Path, State};
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

/// Readiness probe. Returns 200 once pool has active keys and RPC is reachable.
pub async fn ready(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    // Lazily flip ready once pool is healthy.
    if !state.ready.load(Ordering::Relaxed) && state.key_pool.active_count() > 0 {
        state.ready.store(true, Ordering::Relaxed);
    }

    if state.ready.load(Ordering::Relaxed) {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}

/// Prometheus metrics in text exposition format.
pub async fn metrics(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let body = METRICS.render(
        state.key_pool.active_count(),
        state.key_pool.warm_count(),
        state.key_pool.total_in_flight(),
    );
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "text/plain; version=0.0.4",
        )],
        body,
    )
}

/// Health check with pool, KMS, and RPC status.
pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = &state.key_pool;

    #[cfg(feature = "gcp")]
    let kms_status = if let Some(ref kms) = state.kms_client {
        match kms.health_check().await {
            Ok(()) => "ok",
            Err(_) => "degraded",
        }
    } else {
        "n/a"
    };
    #[cfg(not(feature = "gcp"))]
    let kms_status = "n/a";

    let rpc_status = state.rpc.health_check().await.unwrap_or("unavailable");

    let status = if rpc_status == "unavailable" || pool.active_count() == 0 {
        "unavailable"
    } else if kms_status == "degraded" || rpc_status == "degraded" {
        "degraded"
    } else {
        "ok"
    };

    Json(HealthResponse {
        status,
        relayer_account: pool.relayer_account().to_string(),
        contract_id: state.contract_id.to_string(),
        uptime_secs: state.start_time.elapsed().as_secs(),
        requests: state.request_count.load(Ordering::Relaxed),
        active_rpc: state.rpc.active_url().to_string(),
        failovers: state.rpc.failover_count(),
        rpc_status,
        key_pool: KeyPoolStats {
            active_keys: pool.active_count(),
            warm_keys: pool.warm_count(),
            draining_keys: pool.draining_count(),
            total_in_flight: pool.total_in_flight(),
            per_key_load: pool.per_key_load(),
        },
    })
}

/// Forward a request to the contract's `execute()` method.
pub async fn execute(
    State(state): State<Arc<AppState>>,
    request_parts: axum::extract::Request,
) -> (StatusCode, Json<ExecuteResponse>) {
    let start = std::time::Instant::now();
    METRICS.tx_total.fetch_add(1, Ordering::Relaxed);
    state.request_count.fetch_add(1, Ordering::Relaxed);

    // Extract correlation ID (set by middleware).
    let req_id = request_parts
        .extensions()
        .get::<RequestId>()
        .map(|r| r.0.clone())
        .unwrap_or_default();

    // Parse JSON body
    let request: Value = match axum::Json::<Value>::from_request(request_parts, &state).await {
        Ok(axum::Json(v)) => v,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            warn!(req_id = %req_id, error = %e, "Invalid JSON body");
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err("Invalid JSON body", None)),
            );
        }
    };

    let action_type = request
        .get("action")
        .and_then(|a| a.get("type"))
        .and_then(|t| t.as_str())
        .unwrap_or("unknown");

    info!(req_id = %req_id, action = action_type, "Relaying request");

    // Validate request structure
    if !request.is_object() {
        METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
        warn!(req_id = %req_id, "Invalid request format");
        return (
            StatusCode::BAD_REQUEST,
            Json(ExecuteResponse::err("Request must be a JSON object", None)),
        );
    }

    if request.get("action").is_none() {
        METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
        return (
            StatusCode::BAD_REQUEST,
            Json(ExecuteResponse::err("Missing 'action' field", None)),
        );
    }

    let contract_id = &state.contract_id;
    let gas = NearGas::from_tgas(state.config.gas_tgas);
    let deposit = state.config.storage_deposit;

    // Acquire a key from the pool
    let guard = match state.key_pool.acquire() {
        Ok(g) => g,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            error!(req_id = %req_id, error = %e, "Key pool exhausted");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ExecuteResponse::err("Relayer busy, try again", None)),
            );
        }
    };

    // Get a recent block hash
    let block_hash = match state.rpc.latest_block_hash().await {
        Ok(h) => h,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            error!(req_id = %req_id, error = %e, "Failed to get block hash");
            return (
                StatusCode::BAD_GATEWAY,
                Json(ExecuteResponse::err("RPC temporarily unavailable", None)),
            );
        }
    };

    // Sign and submit, holding per-key lock for nonce ordering.
    let _submit_guard = guard.lock_submit().await;

    let actions = build_execute_actions(&request, gas, deposit);
    let signed_tx = match guard
        .signer()
        .sign_transaction(guard.nonce, contract_id, block_hash, actions)
        .await
    {
        Ok(tx) => tx,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            error!(req_id = %req_id, error = %e, "Transaction signing failed");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ExecuteResponse::err("Transaction signing failed", None)),
            );
        }
    };

    match state.rpc.send_tx_async(signed_tx).await {
        Ok(tx_hash) => {
            METRICS.tx_success.fetch_add(1, Ordering::Relaxed);
            METRICS.record_tx_duration(start);
            info!(req_id = %req_id, tx_hash = %tx_hash, "TX submitted (async)");
            (
                StatusCode::ACCEPTED,
                Json(ExecuteResponse::pending(tx_hash.to_string())),
            )
        }
        Err(e) => {
            let err_str = format!("{e}");

            // Nonce error — re-sync nonce, re-sign, and retry once
            if err_str.contains("InvalidNonce") || err_str.contains("nonce") {
                METRICS.nonce_retries.fetch_add(1, Ordering::Relaxed);
                warn!(req_id = %req_id, "Nonce error on async send, re-syncing and retrying");
                let pk = guard.public_key();
                let _ = state.key_pool.handle_nonce_error(&pk, &state.rpc).await;

                if let Some(result) =
                    retry_after_nonce_error(&state, contract_id, &request, gas, deposit, block_hash)
                        .await
                {
                    METRICS.tx_success.fetch_add(1, Ordering::Relaxed);
                    METRICS.record_tx_duration(start);
                    return result;
                }
            }

            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            METRICS.record_tx_duration(start);
            error!(req_id = %req_id, error = %e, "Async broadcast failed");
            (
                StatusCode::BAD_GATEWAY,
                Json(ExecuteResponse::err("Transaction broadcast failed", None)),
            )
        }
    }
}

/// Build the FunctionCall actions for a relayed execute request.
fn build_execute_actions(request: &Value, gas: NearGas, deposit: u128) -> Vec<Action> {
    let args = serde_json::to_vec(&serde_json::json!({ "request": request })).unwrap_or_default();

    vec![Action::FunctionCall(Box::new(FunctionCallAction {
        method_name: "execute".to_string(),
        args,
        gas: gas.as_gas(),
        deposit,
    }))]
}

/// Retry once after nonce error: acquire fresh key, re-sign, re-submit.
async fn retry_after_nonce_error(
    state: &AppState,
    contract_id: &near_primitives::types::AccountId,
    request: &Value,
    gas: NearGas,
    deposit: u128,
    fallback_block_hash: CryptoHash,
) -> Option<(StatusCode, Json<ExecuteResponse>)> {
    let retry_guard = state.key_pool.acquire().ok()?;
    let _submit = retry_guard.lock_submit().await;
    let bh = state
        .rpc
        .latest_block_hash()
        .await
        .unwrap_or(fallback_block_hash);
    let retry_actions = build_execute_actions(request, gas, deposit);

    let retry_tx = retry_guard
        .signer()
        .sign_transaction(retry_guard.nonce, contract_id, bh, retry_actions)
        .await
        .ok()?;

    let tx_hash = state.rpc.send_tx_async(retry_tx).await.ok()?;
    info!(tx_hash = %tx_hash, "TX retry succeeded after nonce re-sync");
    Some((
        StatusCode::ACCEPTED,
        Json(ExecuteResponse::pending(tx_hash.to_string())),
    ))
}

/// Query TX status. `GET /tx/:tx_hash`
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

    let sender_id = state.key_pool.relayer_account();

    match state.rpc.tx_status(tx_hash, sender_id).await {
        Ok(outcome) => {
            let hash = format!("{}", outcome.transaction_outcome.id);
            match &outcome.status {
                FinalExecutionStatus::SuccessValue(bytes) => {
                    let value: Option<Value> = serde_json::from_slice(bytes).ok();
                    (
                        StatusCode::OK,
                        Json(TxStatusResponse::final_ok(hash, value)),
                    )
                }
                FinalExecutionStatus::Failure(e) => (
                    StatusCode::OK,
                    Json(TxStatusResponse::final_err(hash, format!("{e:?}"))),
                ),
                FinalExecutionStatus::Started | FinalExecutionStatus::NotStarted => {
                    (StatusCode::OK, Json(TxStatusResponse::pending_status(hash)))
                }
            }
        }
        Err(e) => {
            // TX not found — likely still pending
            let err_str = format!("{e}");
            if err_str.contains("UNKNOWN_TRANSACTION") || err_str.contains("not found") {
                (
                    StatusCode::OK,
                    Json(TxStatusResponse::pending_status(tx_hash_str)),
                )
            } else {
                error!(error = %e, "TX status RPC error");
                (
                    StatusCode::BAD_GATEWAY,
                    Json(TxStatusResponse::err("RPC temporarily unavailable")),
                )
            }
        }
    }
}
