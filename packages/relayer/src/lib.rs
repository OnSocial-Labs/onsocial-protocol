//! # OnSocial Relayer
//!
//! A minimal relayer for gasless transactions. Forwards pre-signed requests
//! to the OnSocial contract which verifies signatures on-chain.
//!
//! ## Quick Start
//! ```bash
//! cargo run --bin simple-relayer
//! ```
//!
//! ## Endpoints
//! - `GET /health` - Health check with metrics
//! - `POST /execute` - Forward signed request to contract

pub mod config;
mod error;
mod handlers;
pub mod key_pool;
pub mod key_store;
mod response;
mod router;
pub mod rpc;
mod state;

pub use config::Config;
pub use error::Error;
pub use router::create as create_router;
pub use state::AppState;
