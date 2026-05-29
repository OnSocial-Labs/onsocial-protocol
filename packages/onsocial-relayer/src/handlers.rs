//! HTTP request handlers.

use crate::key_pool::FullAccessTxOutcome;
use crate::metrics::METRICS;
use crate::middleware::RequestId;
use crate::response::{ExecuteResponse, HealthResponse, KeyPoolStats, TxStatusResponse};
use crate::state::AppState;
use crate::Error;
use axum::extract::{FromRequest, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use near_gas::NearGas;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::{Action, FunctionCallAction, TransferAction};
use near_primitives::types::AccountId;
use near_primitives::views::FinalExecutionStatus;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tracing::{error, info, warn};

/// Query parameters for protected execution endpoints.
#[derive(Deserialize, Default)]
pub struct ExecuteParams {
    /// `wait=true` → `broadcast_tx_commit` (synchronous, confirmed result).
    #[serde(default)]
    pub wait: bool,
}

const MAX_DELEGATE_INNER_DEPOSIT_YOCTO: u128 = 1;

fn validate_delegate_inner_action(
    action: &Action,
    allowed_methods: &[String],
) -> Result<(), String> {
    let fc = match action {
        Action::FunctionCall(fc) => fc.as_ref(),
        _ => return Err("Only FunctionCall inner actions are allowed".to_string()),
    };

    if !allowed_methods.iter().any(|m| m == &fc.method_name) {
        return Err(format!("Inner method not allowed: {}", fc.method_name));
    }

    if fc.deposit > MAX_DELEGATE_INNER_DEPOSIT_YOCTO {
        return Err(format!(
            "Inner action deposit exceeds max {MAX_DELEGATE_INNER_DEPOSIT_YOCTO} yoctoNEAR"
        ));
    }

    Ok(())
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

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RewardsServiceAction {
    CreditReward {
        account_id: AccountId,
        amount: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        source: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        app_id: Option<String>,
    },
    Claim {
        account_id: AccountId,
    },
}

#[derive(Debug, Deserialize)]
pub struct ExecuteRewardsBody {
    pub action: RewardsServiceAction,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SocialSpendSettlementRequest {
    pub season_id: String,
    pub root: String,
    pub total_amount: String,
    pub active: bool,
}

pub async fn execute_delegate(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ExecuteParams>,
    request_parts: axum::extract::Request,
) -> (StatusCode, Json<ExecuteResponse>) {
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
    // Sessions only submit allowlisted FunctionCalls. Permit the standard
    // 1-yocto confirmation deposit, but reject value-bearing deposits so a
    // stolen session key cannot be coerced into spending user funds through
    // the relayer.
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
        if let Err(message) = validate_delegate_inner_action(&action, &state.allowed_methods) {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            warn!(
                req_id = %req_id,
                error = %message,
                allowed = ?state.allowed_methods,
                "delegate inner action rejected"
            );
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err(message, None)),
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

    full_access_tx_response(&req_id, "delegate", submitted)
}

// ---------------------------------------------------------------------------
// /execute_rewards — private service relay for rewards contract actions.
//
// Body: { "action": { "type": "credit_reward" | "claim", ... } }
// Query: ?wait=true (optional, broadcast_tx_commit)
//
// This is intentionally narrower than the old generic `/execute` endpoint:
// it always calls the configured rewards contract's `execute` method with
// zero deposit and only accepts the rewards action enum. The direct transaction
// is signed by the relayer account through the same FullAccess KMS lane pool
// used for NEP-366 outer transactions, so the rewards contract sees
// `env::predecessor_account_id() == relayer.onsocial.*`.
// ---------------------------------------------------------------------------
pub async fn execute_rewards(
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

    let body: ExecuteRewardsBody =
        match axum::Json::<ExecuteRewardsBody>::from_request(request_parts, &state).await {
            Ok(axum::Json(v)) => v,
            Err(e) => {
                METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
                warn!(req_id = %req_id, error = %e, "Invalid rewards body");
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ExecuteResponse::err(
                        "Body must be { action: <rewards action> }",
                        None,
                    )),
                );
            }
        };

    if let Err(error) = validate_rewards_action(&body.action) {
        METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
        warn!(req_id = %req_id, error = %error, "Invalid rewards action");
        return (
            StatusCode::BAD_REQUEST,
            Json(ExecuteResponse::err(error, None)),
        );
    }

    let rewards_contract = match state.config.rewards_contract_id.parse::<AccountId>() {
        Ok(account_id) => account_id,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            error!(req_id = %req_id, error = %e, contract = %state.config.rewards_contract_id, "Invalid rewards contract config");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ExecuteResponse::err(
                    "Relayer rewards contract is not configured correctly",
                    None,
                )),
            );
        }
    };

    if !state.allowed_contracts.contains(&rewards_contract) {
        METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
        error!(req_id = %req_id, contract = %rewards_contract, "Rewards contract not in allowlist");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ExecuteResponse::err(
                "Relayer rewards contract is not allowlisted",
                None,
            )),
        );
    }

    let action_type = match &body.action {
        RewardsServiceAction::CreditReward { .. } => "credit_reward",
        RewardsServiceAction::Claim { .. } => "claim",
    };
    info!(req_id = %req_id, action = action_type, contract = %rewards_contract, "Relaying rewards service action");

    let actions = build_rewards_execute_actions(&body.action, state.config.gas_tgas);
    let submitted = match state
        .key_pool
        .submit_delegate_transaction(&state.rpc, &rewards_contract, actions, params.wait)
        .await
    {
        Ok(outcome) => outcome,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            let (status, public_error) = match &e {
                Error::Config(_) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Relayer rewards signer is not configured correctly",
                ),
                Error::Rpc(_) => (StatusCode::BAD_GATEWAY, "RPC temporarily unavailable"),
                Error::KeyPool(_) => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Relayer rewards signer is temporarily unavailable",
                ),
            };
            error!(req_id = %req_id, error = %e, "Rewards tx submission failed");
            return (status, Json(ExecuteResponse::err(public_error, None)));
        }
    };

    METRICS.tx_success.fetch_add(1, Ordering::Relaxed);
    METRICS.record_tx_duration(start);

    full_access_tx_response(&req_id, "rewards", submitted)
}

// ---------------------------------------------------------------------------
// /execute_transfer — private service endpoint for welcome NEAR drips.
//
// Body: { "recipient_id": "...", "amount_yocto": "..." }
// Query: ?wait=true (optional, broadcast_tx_commit)
//
// Transfers NEAR from the relayer account to a user wallet. Amount is capped
// server-side to prevent abuse if backend credentials leak.
// ---------------------------------------------------------------------------

const MAX_TRANSFER_YOCTO: u128 = 25_000_000_000_000_000_000_000; // 0.025 NEAR

#[derive(Deserialize)]
pub struct ExecuteTransferBody {
    pub recipient_id: String,
    pub amount_yocto: String,
}

pub async fn execute_transfer(
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

    let body: ExecuteTransferBody =
        match axum::Json::<ExecuteTransferBody>::from_request(request_parts, &state).await {
            Ok(axum::Json(v)) => v,
            Err(e) => {
                METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
                warn!(req_id = %req_id, error = %e, "Invalid transfer body");
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ExecuteResponse::err(
                        "Body must be { recipient_id, amount_yocto }",
                        None,
                    )),
                );
            }
        };

    let recipient_id = match body.recipient_id.parse::<AccountId>() {
        Ok(account_id) => account_id,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            warn!(req_id = %req_id, error = %e, recipient = %body.recipient_id, "Invalid transfer recipient");
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err("Invalid recipient_id", None)),
            );
        }
    };

    let amount_yocto = match body.amount_yocto.parse::<u128>() {
        Err(_) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err("Invalid amount_yocto", None)),
            );
        }
        Ok(0) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err(
                    "Transfer amount must be positive",
                    None,
                )),
            );
        }
        Ok(amount) if amount > MAX_TRANSFER_YOCTO => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            return (
                StatusCode::BAD_REQUEST,
                Json(ExecuteResponse::err(
                    "Transfer amount exceeds relayer cap",
                    None,
                )),
            );
        }
        Ok(amount) => amount,
    };

    if recipient_id == *state.key_pool.relayer_account() {
        METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
        return (
            StatusCode::BAD_REQUEST,
            Json(ExecuteResponse::err(
                "Cannot transfer to relayer account",
                None,
            )),
        );
    }

    info!(
        req_id = %req_id,
        recipient = %recipient_id,
        amount_yocto = %amount_yocto,
        "Relaying welcome NEAR transfer"
    );

    let actions = vec![Action::Transfer(TransferAction {
        deposit: amount_yocto,
    })];

    let submitted = match state
        .key_pool
        .submit_delegate_transaction(&state.rpc, &recipient_id, actions, params.wait)
        .await
    {
        Ok(outcome) => outcome,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            let (status, public_error) = match &e {
                Error::Config(_) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Relayer transfer signer is not configured correctly",
                ),
                Error::Rpc(_) => (StatusCode::BAD_GATEWAY, "RPC temporarily unavailable"),
                Error::KeyPool(_) => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Relayer transfer signer is temporarily unavailable",
                ),
            };
            error!(req_id = %req_id, error = %e, "Transfer tx submission failed");
            return (status, Json(ExecuteResponse::err(public_error, None)));
        }
    };

    METRICS.tx_success.fetch_add(1, Ordering::Relaxed);
    METRICS.record_tx_duration(start);

    full_access_tx_response(&req_id, "transfer", submitted)
}

// ---------------------------------------------------------------------------
// /execute_social_spend_settlement — private settlement publisher.
//
// Body: { "season_id", "root", "total_amount", "active" }
// Query: ?wait=true (optional, broadcast_tx_commit)
//
// This endpoint is intentionally narrow: it can only call
// `publish_season_root` on the configured social-spend contract with exactly
// 1 yoctoNEAR. The proof/indexer service owns reward math; relayer only owns
// the authorized settlement-publisher signature.
// ---------------------------------------------------------------------------
pub async fn execute_social_spend_settlement(
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

    let body: SocialSpendSettlementRequest =
        match axum::Json::<SocialSpendSettlementRequest>::from_request(request_parts, &state).await
        {
            Ok(axum::Json(v)) => v,
            Err(e) => {
                METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
                warn!(req_id = %req_id, error = %e, "Invalid social-spend settlement body");
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ExecuteResponse::err(
                        "Body must be { season_id, root, total_amount, active }",
                        None,
                    )),
                );
            }
        };

    if let Err(error) = validate_social_spend_settlement(&body) {
        METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
        warn!(req_id = %req_id, error = %error, "Invalid social-spend settlement");
        return (
            StatusCode::BAD_REQUEST,
            Json(ExecuteResponse::err(error, None)),
        );
    }

    let social_spend_contract = match state.config.social_spend_contract_id.parse::<AccountId>() {
        Ok(account_id) => account_id,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            error!(req_id = %req_id, error = %e, contract = %state.config.social_spend_contract_id, "Invalid social-spend contract config");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ExecuteResponse::err(
                    "Relayer social-spend contract is not configured correctly",
                    None,
                )),
            );
        }
    };

    info!(
        req_id = %req_id,
        contract = %social_spend_contract,
        season_id = %body.season_id,
        total_amount = %body.total_amount,
        active = body.active,
        "Relaying social-spend settlement root"
    );

    let actions = build_social_spend_settlement_actions(&body, state.config.gas_tgas);
    let submitted = match state
        .key_pool
        .submit_delegate_transaction(&state.rpc, &social_spend_contract, actions, params.wait)
        .await
    {
        Ok(outcome) => outcome,
        Err(e) => {
            METRICS.tx_error.fetch_add(1, Ordering::Relaxed);
            let (status, public_error) = match &e {
                Error::Config(_) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Relayer social-spend signer is not configured correctly",
                ),
                Error::Rpc(_) => (StatusCode::BAD_GATEWAY, "RPC temporarily unavailable"),
                Error::KeyPool(_) => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Relayer social-spend signer is temporarily unavailable",
                ),
            };
            error!(req_id = %req_id, error = %e, "Social-spend settlement tx submission failed");
            return (status, Json(ExecuteResponse::err(public_error, None)));
        }
    };

    METRICS.tx_success.fetch_add(1, Ordering::Relaxed);
    METRICS.record_tx_duration(start);

    full_access_tx_response(&req_id, "social_spend_settlement", submitted)
}

fn validate_rewards_action(action: &RewardsServiceAction) -> Result<(), String> {
    match action {
        RewardsServiceAction::CreditReward { amount, .. } => {
            let parsed = amount
                .parse::<u128>()
                .map_err(|_| "credit_reward amount must be a decimal u128 string".to_string())?;
            if parsed == 0 {
                return Err("credit_reward amount must be greater than 0".to_string());
            }
        }
        RewardsServiceAction::Claim { .. } => {}
    }
    Ok(())
}

fn build_rewards_execute_actions(action: &RewardsServiceAction, gas_tgas: u64) -> Vec<Action> {
    let args = serde_json::to_vec(&serde_json::json!({
        "request": {
            "action": action,
        }
    }))
    .unwrap_or_default();

    vec![Action::FunctionCall(Box::new(FunctionCallAction {
        method_name: "execute".to_string(),
        args,
        gas: NearGas::from_tgas(gas_tgas).as_gas(),
        deposit: 0,
    }))]
}

fn validate_social_spend_settlement(
    settlement: &SocialSpendSettlementRequest,
) -> Result<(), String> {
    if settlement.season_id.is_empty() || settlement.season_id.len() > 64 {
        return Err("season_id must be 1-64 characters".to_string());
    }
    if !settlement
        .season_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("season_id may only contain ASCII letters, numbers, '-' and '_'".to_string());
    }

    let root = B64
        .decode(settlement.root.as_bytes())
        .map_err(|_| "root must be valid base64".to_string())?;
    if root.len() != 32 {
        return Err("root must decode to exactly 32 bytes".to_string());
    }

    let total_amount = settlement
        .total_amount
        .parse::<u128>()
        .map_err(|_| "total_amount must be a decimal u128 string".to_string())?;
    if total_amount == 0 {
        return Err("total_amount must be greater than 0".to_string());
    }

    Ok(())
}

fn build_social_spend_settlement_actions(
    settlement: &SocialSpendSettlementRequest,
    gas_tgas: u64,
) -> Vec<Action> {
    let args = serde_json::to_vec(&serde_json::json!({
        "season_id": settlement.season_id,
        "root": settlement.root,
        "total_amount": settlement.total_amount,
        "active": settlement.active,
    }))
    .unwrap_or_default();

    vec![Action::FunctionCall(Box::new(FunctionCallAction {
        method_name: "publish_season_root".to_string(),
        args,
        gas: NearGas::from_tgas(gas_tgas).as_gas(),
        deposit: 1,
    }))]
}

fn full_access_tx_response(
    req_id: &str,
    kind: &str,
    submitted: FullAccessTxOutcome,
) -> (StatusCode, Json<ExecuteResponse>) {
    match submitted {
        FullAccessTxOutcome::Committed(outcome) => {
            let hash = format!("{}", outcome.transaction_outcome.id);
            match &outcome.status {
                FinalExecutionStatus::SuccessValue(bytes) => {
                    let value: Option<Value> = serde_json::from_slice(bytes).ok();
                    info!(req_id = %req_id, tx_hash = %hash, kind = %kind, "TX committed (success)");
                    (StatusCode::OK, Json(ExecuteResponse::success(hash, value)))
                }
                FinalExecutionStatus::Failure(e) => {
                    let err_msg = format!("{e:?}");
                    warn!(req_id = %req_id, tx_hash = %hash, kind = %kind, error = %err_msg, "TX committed (failure)");
                    (
                        StatusCode::OK,
                        Json(ExecuteResponse::failure(hash, err_msg)),
                    )
                }
                _ => (StatusCode::ACCEPTED, Json(ExecuteResponse::pending(hash))),
            }
        }
        FullAccessTxOutcome::Submitted(tx_hash) => {
            info!(req_id = %req_id, tx_hash = %tx_hash, kind = %kind, "TX submitted (async)");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewards_action_validation_rejects_bad_credit_amount() {
        let action = RewardsServiceAction::CreditReward {
            account_id: "alice.testnet".parse().unwrap(),
            amount: "0".to_string(),
            source: Some("telegram".to_string()),
            app_id: Some("onsocial_telegram".to_string()),
        };

        assert_eq!(
            validate_rewards_action(&action),
            Err("credit_reward amount must be greater than 0".to_string())
        );
    }

    #[test]
    fn rewards_execute_action_wraps_claim_account_id() {
        let action = RewardsServiceAction::Claim {
            account_id: "alice.testnet".parse().unwrap(),
        };

        let actions = build_rewards_execute_actions(&action, 100);
        let Action::FunctionCall(fc) = &actions[0] else {
            panic!("expected FunctionCall");
        };

        assert_eq!(fc.method_name, "execute");
        assert_eq!(fc.deposit, 0);
        let args: Value = serde_json::from_slice(&fc.args).unwrap();
        assert_eq!(args["request"]["action"]["type"], "claim");
        assert_eq!(args["request"]["action"]["account_id"], "alice.testnet");
    }

    #[test]
    fn social_spend_settlement_validation_rejects_bad_root() {
        let settlement = SocialSpendSettlementRequest {
            season_id: "season0".to_string(),
            root: "not-base64".to_string(),
            total_amount: "100".to_string(),
            active: true,
        };

        assert_eq!(
            validate_social_spend_settlement(&settlement),
            Err("root must be valid base64".to_string())
        );
    }

    #[test]
    fn social_spend_settlement_action_calls_publish_root_with_one_yocto() {
        let settlement = SocialSpendSettlementRequest {
            season_id: "season0".to_string(),
            root: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=".to_string(),
            total_amount: "900000000000000000".to_string(),
            active: true,
        };

        assert!(validate_social_spend_settlement(&settlement).is_ok());
        let actions = build_social_spend_settlement_actions(&settlement, 100);
        let Action::FunctionCall(fc) = &actions[0] else {
            panic!("expected FunctionCall");
        };

        assert_eq!(fc.method_name, "publish_season_root");
        assert_eq!(fc.deposit, 1);
        let args: Value = serde_json::from_slice(&fc.args).unwrap();
        assert_eq!(args["season_id"], "season0");
        assert_eq!(args["root"], "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
        assert_eq!(args["total_amount"], "900000000000000000");
        assert_eq!(args["active"], true);
    }

    #[test]
    fn delegate_validation_allows_one_yocto_confirmation_deposit() {
        let action = Action::FunctionCall(Box::new(FunctionCallAction {
            method_name: "execute".to_string(),
            args: vec![],
            gas: 100_000_000_000_000,
            deposit: 1,
        }));

        assert!(validate_delegate_inner_action(&action, &["execute".to_string()]).is_ok());
    }

    #[test]
    fn delegate_validation_rejects_value_bearing_deposits() {
        let action = Action::FunctionCall(Box::new(FunctionCallAction {
            method_name: "execute".to_string(),
            args: vec![],
            gas: 100_000_000_000_000,
            deposit: 2,
        }));

        assert_eq!(
            validate_delegate_inner_action(&action, &["execute".to_string()]),
            Err("Inner action deposit exceeds max 1 yoctoNEAR".to_string())
        );
    }

    #[test]
    fn delegate_validation_rejects_non_allowlisted_methods() {
        let action = Action::FunctionCall(Box::new(FunctionCallAction {
            method_name: "danger".to_string(),
            args: vec![],
            gas: 100_000_000_000_000,
            deposit: 0,
        }));

        assert_eq!(
            validate_delegate_inner_action(&action, &["execute".to_string()]),
            Err("Inner method not allowed: danger".to_string())
        );
    }
}
