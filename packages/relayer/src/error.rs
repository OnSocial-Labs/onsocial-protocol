//! Error types for the relayer.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use std::fmt;

/// Relayer error type.
#[derive(Debug)]
pub enum Error {
    /// Configuration error.
    Config(String),
    /// RPC communication error.
    Rpc(String),
    /// Key pool error (exhausted, scaling failure, etc.).
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
        let status = match &self {
            Error::Config(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Error::Rpc(_) => StatusCode::BAD_GATEWAY,
            Error::KeyPool(_) => StatusCode::SERVICE_UNAVAILABLE,
        };
        let body = serde_json::json!({
            "success": false,
            "error": self.to_string()
        });
        (status, Json(body)).into_response()
    }
}
