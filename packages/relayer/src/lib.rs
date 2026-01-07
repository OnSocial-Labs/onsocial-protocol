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

mod config;
mod error;
mod handlers;
mod response;
mod router;
mod state;

pub use config::Config;
pub use error::Error;
pub use router::create as create_router;
pub use state::AppState;
