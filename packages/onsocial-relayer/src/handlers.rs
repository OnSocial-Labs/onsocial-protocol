//! HTTP request handlers.

use crate::metrics::METRICS;
use crate::middleware::RequestId;
use crate::response::{ExecuteResponse, HealthResponse, KeyPoolStats, TxStatusResponse};
use crate::state::AppState;
use axum::extract::{FromRequest, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use near_gas::NearGas;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::{Action, FunctionCallAction};
use near_primitives::views::FinalExecutionStatus;
use serde::Deserialize;
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tracing::{error, info, warn};

/// Query parameters for the `/execute` endpoint.
#[derive(Deserialize, Default)]
pub struct ExecuteParams {
    /// `wait=true` → `broadcast_tx_commit` (synchronous, confirmed result).
    #[serde(default)]
    pub wait: bool,
}

/// Readiness probe. 200 once pool has active keys.
pub async fn ready(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    if !state.ready.load(Ordering::Relaxed) && state.key_pool.active_count() > 0 {
        state.ready.store(true, Ordering::Relaxed);
    }

    if state.ready.load(Ordering::Relaxed) {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}

/// Prometheus metrics.
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
            per_contract: state
                .allowed_contracts
                .iter()
                .map(|c| (c.to_string(), pool.active_count_for(c)))
                .collect(),
        },
    })
}

/// Forward a request to the contract's `execute()` method.
pub async fn execute(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ExecuteParams>,
    request_parts: axum::extract::Request,
) -> (StatusCode, Json<ExecuteResponse>) {
    let start = std::time::Instant::now();
    METRICS.tx_total.fetch_add(1, Ordering::Relaxed);
    state.request_count.fetch_add(1, Ordering::Relaxed);

    let req_id = request_parts
        .extensions()
        .get::<RequestId>()
        .map(|r| r.0.clone())
        .unwrap_or_default();

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

    // Route to correct contract; `target_account` is required.
    let contract_id = match request.get("target_account").and_then(|v| v.as_str()) {
        Some(ta) => {
            let parsed = match ta.parse::<near_primitives::types::AccountId>() {
                Ok(id) => id,
                Err(_) => {
                    METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(ExecuteResponse::err(
                            format!("Invalid target_account: {ta}"),
                            None,
                        )),
                    );
                }
            };
            if !state.allowed_contracts.contains(&parsed) {
                METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ExecuteResponse::err(
                        format!("Contract not allowed: {parsed}"),
                        None,
                    )),
                );
            }
            parsed
        }
        None => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err("Missing 'target_account' field", None)),
            );
        }
    };
    info!(req_id = %req_id, contract = %contract_id, "Routing to contract");

    let gas = NearGas::from_tgas(state.config.gas_tgas);
    let deposit = state.config.storage_deposit;

    let guard = match state.key_pool.acquire(&contract_id) {
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

    // Hold per-key lock for nonce ordering.
    let _submit_guard = guard.lock_submit().await;

    let actions = build_execute_actions(&request, gas, deposit);
    let signed_tx = match guard
        .signer()
        .sign_transaction(guard.nonce, &contract_id, block_hash, actions)
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

    if params.wait {
        match state.rpc.send_signed_tx(signed_tx).await {
            Ok(outcome) => {
                METRICS.tx_success.fetch_add(1, Ordering::Relaxed);
                METRICS.record_tx_duration(start);
                let hash = format!("{}", outcome.transaction_outcome.id);
                match &outcome.status {
                    FinalExecutionStatus::SuccessValue(bytes) => {
                        let value: Option<Value> = serde_json::from_slice(bytes).ok();
                        info!(req_id = %req_id, tx_hash = %hash, "TX committed (success)");
                        (StatusCode::OK, Json(ExecuteResponse::success(hash, value)))
                    }
                    FinalExecutionStatus::Failure(e) => {
                        let err_msg = format!("{e:?}");
                        warn!(req_id = %req_id, tx_hash = %hash, error = %err_msg, "TX committed (failure)");
                        (
                            StatusCode::OK,
                            Json(ExecuteResponse::failure(hash, err_msg)),
                        )
                    }
                    _ => {
                        info!(req_id = %req_id, tx_hash = %hash, "TX committed (pending status)");
                        (StatusCode::ACCEPTED, Json(ExecuteResponse::pending(hash)))
                    }
                }
            }
            Err(e) => {
                let err_str = format!("{e}");

                // Nonce error — re-sync and retry once
                if err_str.contains("InvalidNonce") || err_str.contains("nonce") {
                    METRICS.nonce_retries.fetch_add(1, Ordering::Relaxed);
                    warn!(req_id = %req_id, "Nonce error on commit, re-syncing and retrying");
                    let pk = guard.public_key();
                    let _ = state.key_pool.handle_nonce_error(&pk, &state.rpc).await;

                    if let Some(result) = retry_after_nonce_error_sync(
                        &state,
                        &contract_id,
                        &request,
                        gas,
                        deposit,
                        block_hash,
                    )
                    .await
                    {
                        METRICS.tx_success.fetch_add(1, Ordering::Relaxed);
                        METRICS.record_tx_duration(start);
                        return result;
                    }
                }

                METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
                METRICS.record_tx_duration(start);
                error!(req_id = %req_id, error = %e, "Commit broadcast failed");
                (
                    StatusCode::BAD_GATEWAY,
                    Json(ExecuteResponse::err("Transaction broadcast failed", None)),
                )
            }
        }
    } else {
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

                    if let Some(result) = retry_after_nonce_error(
                        &state,
                        &contract_id,
                        &request,
                        gas,
                        deposit,
                        block_hash,
                        &contract_id,
                    )
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

/// Retry once after nonce re-sync (async mode).
async fn retry_after_nonce_error(
    state: &AppState,
    contract_id: &near_primitives::types::AccountId,
    request: &Value,
    gas: NearGas,
    deposit: u128,
    fallback_block_hash: CryptoHash,
    target_contract: &near_primitives::types::AccountId,
) -> Option<(StatusCode, Json<ExecuteResponse>)> {
    let retry_guard = state.key_pool.acquire(target_contract).ok()?;
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

/// Retry once after nonce re-sync (sync/commit mode).
async fn retry_after_nonce_error_sync(
    state: &AppState,
    contract_id: &near_primitives::types::AccountId,
    request: &Value,
    gas: NearGas,
    deposit: u128,
    fallback_block_hash: CryptoHash,
) -> Option<(StatusCode, Json<ExecuteResponse>)> {
    let retry_guard = state.key_pool.acquire(contract_id).ok()?;
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

    let outcome = state.rpc.send_signed_tx(retry_tx).await.ok()?;
    let hash = format!("{}", outcome.transaction_outcome.id);
    match &outcome.status {
        FinalExecutionStatus::SuccessValue(bytes) => {
            let value: Option<Value> = serde_json::from_slice(bytes).ok();
            info!(tx_hash = %hash, "TX commit retry succeeded");
            Some((StatusCode::OK, Json(ExecuteResponse::success(hash, value))))
        }
        FinalExecutionStatus::Failure(e) => {
            let err_msg = format!("{e:?}");
            warn!(tx_hash = %hash, error = %err_msg, "TX commit retry failed on-chain");
            Some((
                StatusCode::OK,
                Json(ExecuteResponse::failure(hash, err_msg)),
            ))
        }
        _ => Some((StatusCode::ACCEPTED, Json(ExecuteResponse::pending(hash)))),
    }
}

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
