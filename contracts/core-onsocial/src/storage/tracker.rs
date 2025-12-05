// --- External imports ---
use near_sdk::env;

// --- Structs ---
/// Helper to measure storage usage deltas across an operation.
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize, borsh::BorshDeserialize, borsh::BorshSerialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageTracker {
    /// Bytes added during the tracked operation.
    pub bytes_added: u64,

    /// Bytes released during the tracked operation.
    pub bytes_released: u64,

    /// Storage usage recorded at start of tracking.
    initial_storage_usage: Option<u64>,
}

// --- Safety guard for the storage tracker ---
impl Drop for StorageTracker {
    fn drop(&mut self) {
        assert!(self.is_empty(), "Bug: non-tracked storage change detected. Storage tracker was not properly reset.");
    }
}

// --- Impl ---
impl StorageTracker {
    /// Record the current storage usage as the baseline.
    #[inline(always)]
    pub fn start_tracking(&mut self) {
        assert!(
            self.initial_storage_usage.replace(env::storage_usage()).is_none(),
            "Storage tracker is already tracking - cannot start tracking twice"
        );
    }

    /// Capture the delta since `start_tracking` and update counters.
    #[inline(always)]
    pub fn stop_tracking(&mut self) {
        let initial_usage = self
            .initial_storage_usage
            .take()
            .expect("Storage tracker wasn't actively tracking - call start_tracking() first");
        
        let current = env::storage_usage();
        if current >= initial_usage {
            self.bytes_added += current - initial_usage;
        } else {
            self.bytes_released += initial_usage - current;
        }
    }

    /// Consumes the other storage tracker changes and merges them into this one.
    /// The other tracker must not be actively tracking.
    pub fn consume(&mut self, other: &mut StorageTracker) {
        assert!(
            other.initial_storage_usage.is_none(),
            "Cannot consume a storage tracker that is actively tracking"
        );
        
        self.bytes_added += other.bytes_added;
        self.bytes_released += other.bytes_released;
        
        // Reset the consumed tracker
        other.bytes_added = 0;
        other.bytes_released = 0;
    }

    /// Net change: positive => bytes added; negative => bytes freed.
    #[inline(always)]
    pub fn delta(&self) -> i64 {
        self.bytes_added as i64 - self.bytes_released as i64
    }

    /// Reset the tracker to zeroed state.
    /// Panics if the tracker is currently active.
    pub fn reset(&mut self) {
        assert!(
            self.initial_storage_usage.is_none(),
            "Cannot reset storage tracker while actively tracking"
        );
        
        self.bytes_added = 0;
        self.bytes_released = 0;
    }

    /// Returns true if no bytes are added or released, and the tracker is not active.
    #[inline(always)]
    pub fn is_empty(&self) -> bool {
        self.bytes_added == 0 && self.bytes_released == 0 && self.initial_storage_usage.is_none()
    }
}
