//! HTTP router setup.

use crate::handlers;
use crate::state::AppState;
use axum::routing::{get, post};
use axum::Router;
use std::sync::Arc;

/// Create the application router.
pub fn create(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(handlers::health))
        .route("/execute", post(handlers::execute))
        .route("/tx/{tx_hash}", get(handlers::tx_status))
        .with_state(state)
}
