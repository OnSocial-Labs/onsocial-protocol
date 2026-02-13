//! Prometheus metrics (lock-free atomics, zero allocation on hot path).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

pub static METRICS: Metrics = Metrics::new();

pub struct Metrics {
    // --- Traffic ---
    pub tx_total: AtomicU64,
    pub tx_success: AtomicU64,
    pub tx_error: AtomicU64,
    pub nonce_retries: AtomicU64,

    // --- Latency (μs, updated via CAS) ---
    pub tx_duration_us_sum: AtomicU64,
    pub tx_duration_us_max: AtomicU64,

    // --- KMS ---
    pub kms_sign_total: AtomicU64,
    pub kms_sign_errors: AtomicU64,
    pub kms_sign_duration_us_sum: AtomicU64,

    // --- RPC ---
    pub rpc_failovers: AtomicU64,
    pub rpc_errors: AtomicU64,
}

impl Metrics {
    const fn new() -> Self {
        Self {
            tx_total: AtomicU64::new(0),
            tx_success: AtomicU64::new(0),
            tx_error: AtomicU64::new(0),
            nonce_retries: AtomicU64::new(0),
            tx_duration_us_sum: AtomicU64::new(0),
            tx_duration_us_max: AtomicU64::new(0),
            kms_sign_total: AtomicU64::new(0),
            kms_sign_errors: AtomicU64::new(0),
            kms_sign_duration_us_sum: AtomicU64::new(0),
            rpc_failovers: AtomicU64::new(0),
            rpc_errors: AtomicU64::new(0),
        }
    }

    pub fn record_tx_duration(&self, start: Instant) {
        let us = start.elapsed().as_micros() as u64;
        self.tx_duration_us_sum.fetch_add(us, Ordering::Relaxed);
        // CAS loop for max tracking
        let mut cur = self.tx_duration_us_max.load(Ordering::Relaxed);
        while us > cur {
            match self.tx_duration_us_max.compare_exchange_weak(
                cur,
                us,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(actual) => cur = actual,
            }
        }
    }

    pub fn record_kms_sign_duration(&self, start: Instant) {
        let us = start.elapsed().as_micros() as u64;
        self.kms_sign_duration_us_sum
            .fetch_add(us, Ordering::Relaxed);
        self.kms_sign_total.fetch_add(1, Ordering::Relaxed);
    }

    /// Render in Prometheus text exposition format.
    pub fn render(&self, pool_active: usize, pool_warm: usize, pool_in_flight: u32) -> String {
        let tx_total = self.tx_total.load(Ordering::Relaxed);
        let tx_success = self.tx_success.load(Ordering::Relaxed);
        let tx_error = self.tx_error.load(Ordering::Relaxed);
        let nonce_retries = self.nonce_retries.load(Ordering::Relaxed);
        let tx_dur_sum = self.tx_duration_us_sum.load(Ordering::Relaxed);
        let tx_dur_max = self.tx_duration_us_max.swap(0, Ordering::Relaxed);
        let kms_total = self.kms_sign_total.load(Ordering::Relaxed);
        let kms_errors = self.kms_sign_errors.load(Ordering::Relaxed);
        let kms_dur_sum = self.kms_sign_duration_us_sum.load(Ordering::Relaxed);
        let rpc_failovers = self.rpc_failovers.load(Ordering::Relaxed);
        let rpc_errors = self.rpc_errors.load(Ordering::Relaxed);

        // Convert μs to seconds for Prometheus conventions
        let tx_dur_sum_s = tx_dur_sum as f64 / 1_000_000.0;
        let tx_dur_max_s = tx_dur_max as f64 / 1_000_000.0;
        let kms_dur_sum_s = kms_dur_sum as f64 / 1_000_000.0;

        format!(
            "\
# HELP relayer_tx_total Total execute requests received.\n\
# TYPE relayer_tx_total counter\n\
relayer_tx_total {tx_total}\n\
# HELP relayer_tx_success_total Successful TX submissions (HTTP 202).\n\
# TYPE relayer_tx_success_total counter\n\
relayer_tx_success_total {tx_success}\n\
# HELP relayer_tx_error_total Failed TX submissions.\n\
# TYPE relayer_tx_error_total counter\n\
relayer_tx_error_total {tx_error}\n\
# HELP relayer_nonce_retries_total Nonce re-sync retries.\n\
# TYPE relayer_nonce_retries_total counter\n\
relayer_nonce_retries_total {nonce_retries}\n\
# HELP relayer_tx_duration_seconds_sum Total handler time (seconds).\n\
# TYPE relayer_tx_duration_seconds_sum counter\n\
relayer_tx_duration_seconds_sum {tx_dur_sum_s:.6}\n\
# HELP relayer_tx_duration_seconds_max Max handler time since last scrape (seconds).\n\
# TYPE relayer_tx_duration_seconds_max gauge\n\
relayer_tx_duration_seconds_max {tx_dur_max_s:.6}\n\
# HELP relayer_kms_sign_total Total KMS sign operations.\n\
# TYPE relayer_kms_sign_total counter\n\
relayer_kms_sign_total {kms_total}\n\
# HELP relayer_kms_sign_errors_total KMS sign failures (after retries).\n\
# TYPE relayer_kms_sign_errors_total counter\n\
relayer_kms_sign_errors_total {kms_errors}\n\
# HELP relayer_kms_sign_duration_seconds_sum Total KMS sign time (seconds).\n\
# TYPE relayer_kms_sign_duration_seconds_sum counter\n\
relayer_kms_sign_duration_seconds_sum {kms_dur_sum_s:.6}\n\
# HELP relayer_rpc_failovers_total RPC primary-to-fallback failovers.\n\
# TYPE relayer_rpc_failovers_total counter\n\
relayer_rpc_failovers_total {rpc_failovers}\n\
# HELP relayer_rpc_errors_total RPC errors.\n\
# TYPE relayer_rpc_errors_total counter\n\
relayer_rpc_errors_total {rpc_errors}\n\
# HELP relayer_key_pool_active Active signing keys.\n\
# TYPE relayer_key_pool_active gauge\n\
relayer_key_pool_active {pool_active}\n\
# HELP relayer_key_pool_warm Pre-warmed spare keys.\n\
# TYPE relayer_key_pool_warm gauge\n\
relayer_key_pool_warm {pool_warm}\n\
# HELP relayer_key_pool_in_flight In-flight TXs across all keys.\n\
# TYPE relayer_key_pool_in_flight gauge\n\
relayer_key_pool_in_flight {pool_in_flight}\n"
        )
    }
}
