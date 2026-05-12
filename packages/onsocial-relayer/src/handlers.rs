//! HTTP request handlers.

use crate::metrics::METRICS;
use crate::middleware::RequestId;
use crate::response::{ExecuteResponse, HealthResponse, KeyPoolStats, TxStatusResponse};
use crate::state::AppState;
use crate::Error;
use axum::extract::{FromRequest, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::Action;
use near_primitives::views::FinalExecutionStatus;
use serde::Deserialize;
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tracing::{error, info, warn};

/// Query parameters for the `/execute_delegate` endpoint.
#[derive(Deserialize, Default)]
pub struct ExecuteParams {
    /// `wait=true` → `broadcast_tx_commit` (synchronous, confirmed result).
    #[serde(default)]
    pub wait: bool,
}

/// Readiness probe. 200 once pool has active keys.
pub async fn ready(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    if !state.ready.load(Ordering::Relaxed)
        && state.key_pool.active_delegate_count() >= state.config.delegate_pool_size.max(1) as usize
    {
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
        state.key_pool.active_delegate_count(),
        0,
        state.key_pool.delegate_total_in_flight(),
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

    let status = if rpc_status == "unavailable" || pool.active_delegate_count() == 0 {
        "unavailable"
    } else if kms_status == "degraded" || rpc_status == "degraded" {
        "degraded"
    } else {
        "ok"
    };

    Json(HealthResponse {
        status,
        relayer_account: pool.relayer_account().to_string(),
        allowed_contracts: state
            .allowed_contracts
            .iter()
            .map(ToString::to_string)
            .collect(),
        uptime_secs: state.start_time.elapsed().as_secs(),
        requests: state.request_count.load(Ordering::Relaxed),
        active_rpc: state.rpc.active_url().to_string(),
        failovers: state.rpc.failover_count(),
        rpc_status,
        key_pool: KeyPoolStats {
            active_keys: pool.active_delegate_count(),
            warm_keys: 0,
            draining_keys: 0,
            total_in_flight: pool.delegate_total_in_flight(),
            per_key_load: pool.delegate_per_key_load(),
            per_contract: std::collections::HashMap::new(),
        },
    })
}

// ---------------------------------------------------------------------------
// /execute_delegate — NEP-366 meta-transaction relay.
//
// Body: { "signed_delegate": "<base64 borsh SignedDelegateAction>" }
// Query: ?wait=true (optional, broadcast_tx_commit)
//
// Per NEP-366 the OUTER transaction must be:
//   signer  = relayer
//   receiver = delegate.sender_id  (= the user account)
//   actions = [Action::Delegate(signed_delegate)]
//
// On-chain, the runtime expands this into an inner receipt
//   predecessor = signer = sender = user
// so contracts that call `env::signer_account_id()` see the real user
// (and explorers attribute the call to the user account).
//
// We allow-list the inner `delegate.receiver_id` against
// `state.allowed_contracts` so users cannot use our relayer to call
// arbitrary contracts.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ExecuteDelegateBody {
    /// Base64 standard encoding of `borsh(SignedDelegateAction)`.
    pub signed_delegate: String,
}

pub async fn execute_delegate(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ExecuteParams>,
    request_parts: axum::extract::Request,
) -> (StatusCode, Json<ExecuteResponse>) {
    use crate::key_pool::FullAccessTxOutcome;
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    use near_primitives::action::delegate::SignedDelegateAction;
    use near_primitives::borsh::BorshDeserialize;

    let start = std::time::Instant::now();
    METRICS.tx_total.fetch_add(1, Ordering::Relaxed);
    state.request_count.fetch_add(1, Ordering::Relaxed);

    let req_id = request_parts
        .extensions()
        .get::<RequestId>()
        .map(|r| r.0.clone())
        .unwrap_or_default();

    let body: ExecuteDelegateBody =
        match axum::Json::<ExecuteDelegateBody>::from_request(request_parts, &state).await {
            Ok(axum::Json(v)) => v,
            Err(e) => {
                METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
                warn!(req_id = %req_id, error = %e, "Invalid delegate body");
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ExecuteResponse::err(
                        "Body must be { signed_delegate: <base64> }",
                        None,
                    )),
                );
            }
        };

    let bytes = match B64.decode(body.signed_delegate.as_bytes()) {
        Ok(b) => b,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            warn!(req_id = %req_id, error = %e, "signed_delegate base64 decode failed");
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err(
                    "signed_delegate is not valid base64",
                    None,
                )),
            );
        }
    };

    let signed_delegate: SignedDelegateAction = match SignedDelegateAction::try_from_slice(&bytes) {
        Ok(sd) => sd,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            warn!(req_id = %req_id, error = %e, "signed_delegate borsh decode failed");
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err(
                    "signed_delegate is not a valid borsh SignedDelegateAction",
                    None,
                )),
            );
        }
    };

    // Verify user signature locally so we don't waste a relayer nonce on a
    // doomed tx (the protocol re-verifies on-chain).
    if !signed_delegate.verify() {
        METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
        warn!(req_id = %req_id, "delegate signature verification failed");
        return (
            StatusCode::UNAUTHORIZED,
            Json(ExecuteResponse::err(
                "Invalid signature on SignedDelegateAction",
                None,
            )),
        );
    }

    let inner_receiver = signed_delegate.delegate_action.receiver_id.clone();
    let inner_sender = signed_delegate.delegate_action.sender_id.clone();

    if !state.allowed_contracts.contains(&inner_receiver) {
        METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
        warn!(
            req_id = %req_id,
            receiver = %inner_receiver,
            "delegate inner receiver not in allowlist"
        );
        return (
            StatusCode::BAD_REQUEST,
            Json(ExecuteResponse::err(
                format!("Inner receiver not allowed: {inner_receiver}"),
                None,
            )),
        );
    }

    // ── Inner-action shape check ────────────────────────────────────────
    // Sessions only ever submit `execute` FunctionCalls with zero deposit.
    // Reject anything else so a stolen session key cannot be coerced into
    // calling other methods or attaching value through the relayer.
    if signed_delegate.delegate_action.actions.is_empty() {
        METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
        warn!(req_id = %req_id, "delegate has no inner actions");
        return (
            StatusCode::BAD_REQUEST,
            Json(ExecuteResponse::err(
                "Delegate must contain at least one action",
                None,
            )),
        );
    }
    for nda in &signed_delegate.delegate_action.actions {
        let action: Action = nda.clone().into();
        let fc = match &action {
            Action::FunctionCall(fc) => fc.as_ref(),
            other => {
                METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
                warn!(
                    req_id = %req_id,
                    kind = ?std::mem::discriminant(other),
                    "delegate inner action is not a FunctionCall"
                );
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ExecuteResponse::err(
                        "Only FunctionCall inner actions are allowed",
                        None,
                    )),
                );
            }
        };
        if !state.allowed_methods.iter().any(|m| m == &fc.method_name) {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            warn!(
                req_id = %req_id,
                method = %fc.method_name,
                allowed = ?state.allowed_methods,
                "delegate inner method not in allowlist"
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err(
                    format!("Inner method not allowed: {}", fc.method_name),
                    None,
                )),
            );
        }
        if fc.deposit != 0 {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            warn!(
                req_id = %req_id,
                deposit = %fc.deposit,
                "delegate inner action carries a deposit"
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err("Inner action deposit must be 0", None)),
            );
        }
    }

    info!(
        req_id = %req_id,
        sender = %inner_sender,
        receiver = %inner_receiver,
        actions = signed_delegate.delegate_action.actions.len(),
        "Relaying NEP-366 delegate"
    );

    let actions: Vec<Action> = vec![Action::Delegate(Box::new(signed_delegate))];
    let submitted = match state
        .key_pool
        .submit_delegate_transaction(&state.rpc, &inner_sender, actions, params.wait)
        .await
    {
        Ok(outcome) => outcome,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            let (status, public_error) = match &e {
                Error::Config(_) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Relayer delegate signer is not configured correctly",
                ),
                Error::Rpc(_) => (StatusCode::BAD_GATEWAY, "RPC temporarily unavailable"),
                Error::KeyPool(_) => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Relayer delegate signer is temporarily unavailable",
                ),
            };
            error!(req_id = %req_id, error = %e, "Delegate tx submission failed");
            return (status, Json(ExecuteResponse::err(public_error, None)));
        }
    };

    METRICS.tx_success.fetch_add(1, Ordering::Relaxed);
    METRICS.record_tx_duration(start);

    match submitted {
        FullAccessTxOutcome::Committed(outcome) => {
            let hash = format!("{}", outcome.transaction_outcome.id);
            match &outcome.status {
                FinalExecutionStatus::SuccessValue(bytes) => {
                    let value: Option<Value> = serde_json::from_slice(bytes).ok();
                    info!(req_id = %req_id, tx_hash = %hash, "Delegate TX committed (success)");
                    (StatusCode::OK, Json(ExecuteResponse::success(hash, value)))
                }
                FinalExecutionStatus::Failure(e) => {
                    let err_msg = format!("{e:?}");
                    warn!(req_id = %req_id, tx_hash = %hash, error = %err_msg, "Delegate TX committed (failure)");
                    (
                        StatusCode::OK,
                        Json(ExecuteResponse::failure(hash, err_msg)),
                    )
                }
                _ => (StatusCode::ACCEPTED, Json(ExecuteResponse::pending(hash))),
            }
        }
        FullAccessTxOutcome::Submitted(tx_hash) => {
            info!(req_id = %req_id, tx_hash = %tx_hash, "Delegate TX submitted (async)");
            (
                StatusCode::ACCEPTED,
                Json(ExecuteResponse::pending(tx_hash.to_string())),
            )
        }
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

/// `GET /latest_block` — finalized block hash + height. Used by SDK
/// clients to compute `max_block_height` for NEP-366 SignedDelegateAction.
pub async fn latest_block(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.rpc.latest_block().await {
        Ok((hash, height)) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "block_hash": hash.to_string(),
                "block_height": height,
            })),
        ),
        Err(e) => {
            error!(error = %e, "latest_block RPC error");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "RPC temporarily unavailable"})),
            )
        }
    }
}
