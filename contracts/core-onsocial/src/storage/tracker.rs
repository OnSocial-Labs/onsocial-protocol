use near_sdk::env;

#[derive(Clone, Debug, Default)]
pub struct StorageTracker {
    bytes_added: u64,
    bytes_released: u64,
    initial_storage_usage: Option<u64>,
}

impl Drop for StorageTracker {
    fn drop(&mut self) {
        if !self.is_empty() {
            debug_assert!(false, "Bug: storage tracker not reset (non-empty at drop)");
            #[cfg(debug_assertions)]
            env::log_str("WARN: Bug: storage tracker not reset (non-empty at drop)");
        }
    }
}

impl StorageTracker {
    #[inline(always)]
    pub fn start_tracking(&mut self) {
        if self.initial_storage_usage.is_some() {
            debug_assert!(false, "Storage tracker already active");
            env::log_str("WARN: Bug: storage tracker already active");
            return;
        }

        self.initial_storage_usage = Some(env::storage_usage());
    }

    #[inline(always)]
    pub fn stop_tracking(&mut self) {
        let Some(initial) = self.initial_storage_usage.take() else {
            debug_assert!(false, "Storage tracker not active");
            return;
        };

        let current = env::storage_usage();
        if current >= initial {
            self.bytes_added = self.bytes_added.saturating_add(current - initial);
        } else {
            self.bytes_released = self.bytes_released.saturating_add(initial - current);
        }
    }

    #[inline(always)]
    pub fn delta(&self) -> i128 {
        self.bytes_added as i128 - self.bytes_released as i128
    }

    pub fn reset(&mut self) {
        if self.initial_storage_usage.is_some() {
            debug_assert!(false, "Cannot reset while active");
            env::log_str("WARN: Bug: cannot reset storage tracker while active");
            return;
        }
        self.bytes_added = 0;
        self.bytes_released = 0;
    }

    #[inline(always)]
    pub fn is_empty(&self) -> bool {
        self.bytes_added == 0 && self.bytes_released == 0 && self.initial_storage_usage.is_none()
    }

    #[inline(always)]
    pub fn track<T>(&mut self, f: impl FnOnce() -> T) -> (T, i128) {
        self.start_tracking();
        let out = f();
        self.stop_tracking();
        let delta = self.delta();
        self.reset();
        (out, delta)
    }

    #[inline(always)]
    pub fn track_result<T, E>(&mut self, f: impl FnOnce() -> Result<T, E>) -> Result<(T, i128), E> {
        self.start_tracking();
        let res = f();
        self.stop_tracking();
        let delta = self.delta();
        self.reset();
        res.map(|out| (out, delta))
    }
}
