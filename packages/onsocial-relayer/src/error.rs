//! Relayer error types.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use std::fmt;

#[derive(Debug)]
pub enum Error {
    Config(String),
    Rpc(String),
    KeyPool(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Config(msg) => write!(f, "config error: {msg}"),
            Error::Rpc(msg) => write!(f, "rpc error: {msg}"),
            Error::KeyPool(msg) => write!(f, "key pool error: {msg}"),
        }
    }
}

impl std::error::Error for Error {}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let (status, public_msg) = match &self {
            Error::Config(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal configuration error",
            ),
            Error::Rpc(_) => (StatusCode::BAD_GATEWAY, "RPC communication error"),
            Error::KeyPool(_) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Service temporarily unavailable",
            ),
        };
        let body = serde_json::json!({
            "success": false,
            "error": public_msg
        });
        (status, Json(body)).into_response()
    }
}
