//! Fee and pricing helpers: Dutch pricing, payment routing, fee splits, views.

pub mod types;
mod pricing;
mod routing;
mod views;

pub(crate) use pricing::{compute_dutch_price, refund_excess};
pub use types::FeeConfig;
pub(crate) use types::PrimarySaleResult;
