//! Authentication and request correlation middleware.

use axum::extract::Request;
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use std::sync::OnceLock;
use subtle::ConstantTimeEq;

/// Cached API key from env. `None` = dev mode (no auth).
static API_KEY: OnceLock<Option<String>> = OnceLock::new();

fn expected_api_key() -> &'static Option<String> {
    API_KEY.get_or_init(|| {
        std::env::var("RELAYER_API_KEY")
            .ok()
            .filter(|k| !k.is_empty())
    })
}

/// Validate `X-Api-Key` or `Authorization: Bearer` header.
/// Bypassed if `RELAYER_API_KEY` is unset (dev mode).
/// Uses constant-time comparison to prevent timing attacks.
pub async fn api_key_auth(request: Request, next: Next) -> Response {
    let expected = match expected_api_key() {
        Some(key) => key,
        None => return next.run(request).await,
    };

    let provided = request
        .headers()
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or_else(|| {
            request
                .headers()
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.strip_prefix("Bearer "))
                .map(|s| s.to_string())
        });

    match provided {
        Some(ref key)
            if key.len() == expected.len() && key.as_bytes().ct_eq(expected.as_bytes()).into() =>
        {
            next.run(request).await
        }
        _ => {
            let body = serde_json::json!({
                "success": false,
                "error": "Unauthorized: invalid or missing API key"
            });
            (StatusCode::UNAUTHORIZED, axum::Json(body)).into_response()
        }
    }
}

/// Propagate or generate `x-request-id` for end-to-end correlation.
pub async fn inject_request_id(mut request: Request, next: Next) -> Response {
    let request_id = request
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            format!("rel-{:016x}", rng.gen::<u64>())
        });

    // Store for handler access.
    request
        .extensions_mut()
        .insert(RequestId(request_id.clone()));

    let mut response = next.run(request).await;

    // Echo back for end-to-end tracing.
    if let Ok(val) = HeaderValue::from_str(&request_id) {
        response.headers_mut().insert("x-request-id", val);
    }

    response
}

/// Request correlation ID, extractable from `Request::extensions()`.
#[derive(Clone, Debug)]
pub struct RequestId(pub String);
