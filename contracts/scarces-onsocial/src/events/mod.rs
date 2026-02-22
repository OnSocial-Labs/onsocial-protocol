mod builder;
mod types;

mod app_pool;
mod collection;
mod contract;
mod lazy_listing;
mod offer;
mod scarce;
mod storage;

pub use app_pool::*;
pub use collection::*;
pub use contract::*;
pub use lazy_listing::*;
pub use offer::*;
pub use scarce::*;
pub use storage::*;

pub(crate) const STANDARD: &str = "onsocial";
pub(crate) const VERSION: &str = "1.0.0";
pub(crate) const PREFIX: &str = "EVENT_JSON:";

pub(crate) const SCARCE: &str = "SCARCE_UPDATE";
pub(crate) const COLLECTION: &str = "COLLECTION_UPDATE";
pub(crate) const STORAGE: &str = "STORAGE_UPDATE";
pub(crate) const APP_POOL: &str = "APP_POOL_UPDATE";
pub(crate) const CONTRACT: &str = "CONTRACT_UPDATE";
pub(crate) const OFFER: &str = "OFFER_UPDATE";
pub(crate) const LAZY_LISTING: &str = "LAZY_LISTING_UPDATE";
