//! HTTP router and middleware stack.

use crate::handlers;
use crate::middleware::{api_key_auth, inject_request_id};
use crate::state::AppState;
use axum::extract::DefaultBodyLimit;
use axum::middleware;
use axum::routing::{get, post};
use axum::Router;
use std::sync::Arc;
use tower::limit::ConcurrencyLimitLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

const MAX_BODY_SIZE: usize = 1024 * 1024; // 1 MB
const MAX_CONCURRENT_EXECUTE: usize = 256;
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

pub fn create(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
        .allow_headers(Any);

    let execute_route = Router::new()
        .route("/execute", post(handlers::execute))
        .layer(middleware::from_fn(api_key_auth))
        .layer(ConcurrencyLimitLayer::new(MAX_CONCURRENT_EXECUTE));

    let public_routes = Router::new()
        .route("/health", get(handlers::health))
        .route("/ready", get(handlers::ready))
        .route("/metrics", get(handlers::metrics))
        .route("/tx/{tx_hash}", get(handlers::tx_status));

    public_routes
        .merge(execute_route)
        .layer(middleware::from_fn(inject_request_id))
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            REQUEST_TIMEOUT,
        ))
        .layer(DefaultBodyLimit::max(MAX_BODY_SIZE))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
