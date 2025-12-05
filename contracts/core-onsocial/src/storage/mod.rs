// --- Modules ---
pub mod atomic;
pub mod key;
pub mod models;
pub mod operations;
pub mod sharding;
pub mod tracker;
pub mod utils;

// --- Re-exports ---
pub use key::StorageKey;
pub use models::Storage;
// StorageOperation enum retained internally for parsing but no longer re-exported; unified `set` API handles all mutations.
pub use sharding::fast_hash;

// --- Utility function re-exports ---
pub use utils::{
    calculate_effective_bytes, calculate_storage_balance_needed,
    soft_delete_entry,
    validate_depositor, validate_withdrawal_amount,
};
