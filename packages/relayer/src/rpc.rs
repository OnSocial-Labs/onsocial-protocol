//! RPC client with automatic failover.
//!
//! Wraps `near_fetch::Client` with primary → fallback failover,
//! retry with exponential backoff, and a circuit breaker.

use near_fetch::Client;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tracing::{info, warn};

/// Consecutive failures before the circuit breaker opens.
const CIRCUIT_BREAKER_THRESHOLD: u64 = 5;
/// How long (ms) before a tripped breaker retries the primary.
const CIRCUIT_BREAKER_WINDOW_MS: u64 = 30_000;
/// Max retry attempts per provider.
const MAX_RETRIES: u32 = 2;
/// Base delay for exponential backoff (ms).
const BASE_DELAY_MS: u64 = 200;

struct CircuitState {
    failures: u64,
    last_failure_ms: u64,
    open: bool,
}

/// RPC client with primary → fallback failover.
pub struct RpcClient {
    primary: Client,
    fallback: Client,
    primary_url: String,
    fallback_url: String,
    circuit: Mutex<CircuitState>,
    total_failovers: AtomicU64,
}

impl RpcClient {
    pub fn new(primary_url: &str, fallback_url: &str) -> Self {
        info!(primary = primary_url, fallback = fallback_url, "RPC client initialized with failover");
        Self {
            primary: Client::new(primary_url),
            fallback: Client::new(fallback_url),
            primary_url: primary_url.to_string(),
            fallback_url: fallback_url.to_string(),
            circuit: Mutex::new(CircuitState {
                failures: 0,
                last_failure_ms: 0,
                open: false,
            }),
            total_failovers: AtomicU64::new(0),
        }
    }

    /// Get the active client (primary unless circuit is open).
    pub fn active(&self) -> &Client {
        if self.is_circuit_open() {
            &self.fallback
        } else {
            &self.primary
        }
    }

    /// Get the fallback client.
    pub fn fallback(&self) -> &Client {
        &self.fallback
    }

    /// Record a successful primary call — resets circuit.
    pub fn record_success(&self) {
        let mut circuit = self.circuit.lock().unwrap();
        if circuit.failures > 0 {
            info!(primary = %self.primary_url, "Primary RPC recovered");
            circuit.failures = 0;
            circuit.open = false;
        }
    }

    /// Record a failed primary call — may open circuit.
    pub fn record_failure(&self) {
        let mut circuit = self.circuit.lock().unwrap();
        circuit.failures += 1;
        circuit.last_failure_ms = now_ms();
        if circuit.failures >= CIRCUIT_BREAKER_THRESHOLD && !circuit.open {
            circuit.open = true;
            self.total_failovers.fetch_add(1, Ordering::Relaxed);
            warn!(
                failures = circuit.failures,
                fallback = %self.fallback_url,
                "Circuit breaker opened — routing to fallback"
            );
        }
    }

    /// Check if primary circuit is open (should use fallback).
    pub fn is_circuit_open(&self) -> bool {
        let mut circuit = self.circuit.lock().unwrap();
        if !circuit.open {
            return false;
        }
        // Half-open: retry primary after window
        if now_ms() - circuit.last_failure_ms > CIRCUIT_BREAKER_WINDOW_MS {
            circuit.open = false;
            circuit.failures = 0;
            info!(primary = %self.primary_url, "Circuit breaker half-open, retrying primary");
            return false;
        }
        true
    }

    /// Total number of failover events (for health endpoint).
    pub fn failover_count(&self) -> u64 {
        self.total_failovers.load(Ordering::Relaxed)
    }

    /// Which URL is currently active.
    pub fn active_url(&self) -> &str {
        if self.is_circuit_open() {
            &self.fallback_url
        } else {
            &self.primary_url
        }
    }

    /// Retry delay for attempt n (0-indexed).
    pub fn retry_delay(attempt: u32) -> std::time::Duration {
        let ms = BASE_DELAY_MS * 2u64.pow(attempt);
        std::time::Duration::from_millis(ms)
    }

    /// Max retries per provider.
    pub fn max_retries() -> u32 {
        MAX_RETRIES
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
