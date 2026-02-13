//! # OnSocial Relayer
//!
//! Gasless TX relayer. Forwards signed requests to the on-chain contract.
//! Supports local Ed25519 keys or GCP Cloud KMS (`--features gcp`).
//!
//! ## Endpoints
//! - `GET  /health`     - Pool/KMS/RPC status
//! - `GET  /ready`      - Readiness probe (503 until bootstrapped)
//! - `POST /execute`    - Relay signed request to contract
//! - `GET  /tx/:hash`   - Query TX status
//! - `GET  /metrics`    - Prometheus metrics

pub mod config;
mod error;
mod handlers;
pub mod key_pool;
pub mod key_store;
#[cfg(feature = "gcp")]
pub mod kms;
pub mod metrics;
mod middleware;
mod response;
mod router;
pub mod rpc;
pub mod signer;
mod state;

pub use config::Config;
pub use error::Error;
pub use router::create as create_router;
pub use state::AppState;
