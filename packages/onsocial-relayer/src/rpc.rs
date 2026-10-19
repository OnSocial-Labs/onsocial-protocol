//! RPC client with primary → fallback failover and circuit breaker.

use near_crypto::PublicKey;
use near_jsonrpc_client::methods;
use near_jsonrpc_client::JsonRpcClient;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::SignedTransaction;
use near_primitives::types::{AccountId, BlockReference, Finality};
use near_primitives::views::{AccessKeyView, FinalExecutionOutcomeView};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::metrics::METRICS;

const BLOCK_HASH_TTL_SECS: u64 = 30;

const CIRCUIT_BREAKER_THRESHOLD: u64 = 5;
const CIRCUIT_BREAKER_WINDOW_MS: u64 = 30_000;
/// Lava answers 429 for the whole plan. Stay on the fallback until that quota recovers.
const RATE_LIMIT_WINDOW_MS: u64 = 10 * 60 * 1000;
struct CircuitState {
    failures: u64,
    last_failure_ms: u64,
    open: bool,
    open_window_ms: u64,
}

pub struct RpcClient {
    primary: JsonRpcClient,
    fallback: JsonRpcClient,
    primary_url: String,
    fallback_url: String,
    circuit: Mutex<CircuitState>,
    total_failovers: AtomicU64,
    cached_block_hash: RwLock<Option<(CryptoHash, Instant)>>,
    block_hash_stale: std::sync::atomic::AtomicBool,
}

impl RpcClient {
    pub fn new(primary_url: &str, fallback_url: &str) -> Self {
        info!(
            primary = primary_url,
            fallback = fallback_url,
            "RPC client initialized with failover"
        );
        Self {
            primary: JsonRpcClient::connect(primary_url),
            fallback: JsonRpcClient::connect(fallback_url),
            primary_url: primary_url.to_string(),
            fallback_url: fallback_url.to_string(),
            circuit: Mutex::new(CircuitState {
                failures: 0,
                last_failure_ms: 0,
                open: false,
                open_window_ms: CIRCUIT_BREAKER_WINDOW_MS,
            }),
            total_failovers: AtomicU64::new(0),
            cached_block_hash: RwLock::new(None),
            block_hash_stale: std::sync::atomic::AtomicBool::new(false),
        }
    }

    pub fn primary_url(&self) -> &str {
        &self.primary_url
    }

    pub fn fallback_url(&self) -> &str {
        &self.fallback_url
    }

    // --- TX submission ---

    /// Recent block hash, cached for <30s.
    pub async fn latest_block_hash(&self) -> Result<CryptoHash, crate::Error> {
        // Fast path: cached
        if !self.block_hash_stale.load(Ordering::Relaxed) {
            let cache = self.cached_block_hash.read().await;
            if let Some((hash, when)) = *cache {
                if when.elapsed().as_secs() < BLOCK_HASH_TTL_SECS {
                    return Ok(hash);
                }
            }
        }
        // Slow path: RPC with failover. An open circuit skips a rate-limited primary.
        let from_primary = !self.is_circuit_open();
        let block = match self
            .active()
            .call(methods::block::RpcBlockRequest {
                block_reference: BlockReference::Finality(Finality::Final),
            })
            .await
        {
            Ok(b) => {
                self.record_success(from_primary);
                b
            }
            Err(e) => {
                self.record_failure(is_rate_limited_error(&e));
                warn!(error = %e, "Primary RPC block query failed, trying fallback");
                self.fallback
                    .call(methods::block::RpcBlockRequest {
                        block_reference: BlockReference::Finality(Finality::Final),
                    })
                    .await
                    .map_err(|e2| {
                        crate::Error::Rpc(format!(
                            "block query failed on both RPCs: primary={e}, fallback={e2}"
                        ))
                    })?
            }
        };
        let hash = block.header.hash;
        {
            let mut cache = self.cached_block_hash.write().await;
            *cache = Some((hash, Instant::now()));
            self.block_hash_stale.store(false, Ordering::Relaxed);
        }
        Ok(hash)
    }

    /// Latest finalized block hash + height. Not cached (used only by
    /// NEP-366 delegate flows; client typically caches the result).
    pub async fn latest_block(&self) -> Result<(CryptoHash, u64), crate::Error> {
        let req = || methods::block::RpcBlockRequest {
            block_reference: BlockReference::Finality(Finality::Final),
        };
        let from_primary = !self.is_circuit_open();
        let block = match self.active().call(req()).await {
            Ok(b) => {
                self.record_success(from_primary);
                b
            }
            Err(e) => {
                self.record_failure(is_rate_limited_error(&e));
                warn!(error = %e, "Primary RPC latest_block failed, trying fallback");
                self.fallback.call(req()).await.map_err(|e2| {
                    crate::Error::Rpc(format!("latest_block failed: primary={e}, fallback={e2}"))
                })?
            }
        };
        Ok((block.header.hash, block.header.height))
    }

    /// Query access key nonce. Automatic failover.
    pub async fn query_access_key(
        &self,
        account_id: &AccountId,
        public_key: &PublicKey,
    ) -> Result<AccessKeyView, crate::Error> {
        let make_request = || methods::query::RpcQueryRequest {
            block_reference: BlockReference::Finality(Finality::Final),
            request: near_primitives::views::QueryRequest::ViewAccessKey {
                account_id: account_id.clone(),
                public_key: public_key.clone(),
            },
        };

        let from_primary = !self.is_circuit_open();
        let resp = match self.active().call(make_request()).await {
            Ok(r) => {
                self.record_success(from_primary);
                r
            }
            Err(e) => {
                self.record_failure(is_rate_limited_error(&e));
                warn!(error = %e, "RPC access_key query failed, trying fallback");
                self.fallback.call(make_request()).await.map_err(|e2| {
                    crate::Error::Rpc(format!(
                        "access_key query failed: primary={e}, fallback={e2}"
                    ))
                })?
            }
        };

        match resp.kind {
            near_jsonrpc_primitives::types::query::QueryResponseKind::AccessKey(ak) => Ok(ak),
            other => Err(crate::Error::Rpc(format!(
                "unexpected query response: {other:?}"
            ))),
        }
    }

    /// `broadcast_tx_commit`. Automatic failover.
    pub async fn send_signed_tx(
        &self,
        signed_tx: SignedTransaction,
    ) -> Result<FinalExecutionOutcomeView, crate::Error> {
        let from_primary = !self.is_circuit_open();
        let client = self.active();
        match client
            .call(methods::broadcast_tx_commit::RpcBroadcastTxCommitRequest {
                signed_transaction: signed_tx.clone(),
            })
            .await
        {
            Ok(outcome) => {
                self.record_success(from_primary);
                Ok(outcome)
            }
            Err(e) => {
                self.record_failure(is_rate_limited_error(&e));
                warn!(error = %e, "Primary broadcast_tx_commit failed, trying fallback");
                let outcome = self
                    .fallback
                    .call(methods::broadcast_tx_commit::RpcBroadcastTxCommitRequest {
                        signed_transaction: signed_tx,
                    })
                    .await
                    .map_err(|e2| {
                        crate::Error::Rpc(format!(
                            "broadcast_tx_commit failed: primary={e}, fallback={e2}"
                        ))
                    })?;
                Ok(outcome)
            }
        }
    }

    /// `send_tx_async`. Returns hash immediately.
    pub async fn send_tx_async(
        &self,
        signed_tx: SignedTransaction,
    ) -> Result<CryptoHash, crate::Error> {
        let from_primary = !self.is_circuit_open();
        match self
            .active()
            .call(methods::broadcast_tx_async::RpcBroadcastTxAsyncRequest {
                signed_transaction: signed_tx.clone(),
            })
            .await
        {
            Ok(hash) => {
                self.record_success(from_primary);
                Ok(hash)
            }
            Err(e) => {
                self.record_failure(is_rate_limited_error(&e));
                warn!(error = %e, "Primary send_tx_async failed, trying fallback");
                let hash = self
                    .fallback
                    .call(methods::broadcast_tx_async::RpcBroadcastTxAsyncRequest {
                        signed_transaction: signed_tx,
                    })
                    .await
                    .map_err(|e2| {
                        crate::Error::Rpc(format!(
                            "broadcast_tx_async failed: primary={e}, fallback={e2}"
                        ))
                    })?;
                Ok(hash)
            }
        }
    }

    pub async fn tx_status(
        &self,
        tx_hash: CryptoHash,
        sender_id: &AccountId,
    ) -> Result<FinalExecutionOutcomeView, crate::Error> {
        let make_request = || methods::tx::RpcTransactionStatusRequest {
            transaction_info: methods::tx::TransactionInfo::TransactionId {
                tx_hash,
                sender_account_id: sender_id.clone(),
            },
            wait_until: near_primitives::views::TxExecutionStatus::Final,
        };

        let from_primary = !self.is_circuit_open();
        let resp = match self.active().call(make_request()).await {
            Ok(r) => {
                self.record_success(from_primary);
                r
            }
            Err(e) => {
                self.record_failure(is_rate_limited_error(&e));
                self.fallback.call(make_request()).await.map_err(|e2| {
                    crate::Error::Rpc(format!("tx_status failed: primary={e}, fallback={e2}"))
                })?
            }
        };

        resp.final_execution_outcome
            .map(|e| e.into_outcome())
            .ok_or_else(|| crate::Error::Rpc("TX not finalized yet".into()))
    }

    pub async fn health_check(&self) -> Result<&'static str, crate::Error> {
        match self
            .primary
            .call(methods::block::RpcBlockRequest {
                block_reference: BlockReference::Finality(Finality::Final),
            })
            .await
        {
            Ok(_) => Ok("ok"),
            Err(_) => {
                match self
                    .fallback
                    .call(methods::block::RpcBlockRequest {
                        block_reference: BlockReference::Finality(Finality::Final),
                    })
                    .await
                {
                    Ok(_) => Ok("degraded"),
                    Err(e) => Err(crate::Error::Rpc(format!("Both RPCs unreachable: {e}"))),
                }
            }
        }
    }

    // --- Failover / circuit breaker ---

    fn active(&self) -> &JsonRpcClient {
        if self.is_circuit_open() {
            &self.fallback
        } else {
            &self.primary
        }
    }

    /// A fallback success must not clear the breaker. Lava can 429 while FastNear is fine.
    fn record_success(&self, from_primary: bool) {
        if !from_primary {
            return;
        }
        let mut circuit = self.circuit.lock().unwrap_or_else(|e| e.into_inner());
        if circuit.failures > 0 || circuit.open {
            info!(primary = %self.primary_url, "Primary RPC recovered");
            circuit.failures = 0;
            circuit.open = false;
        }
    }

    fn record_failure(&self, rate_limited: bool) {
        METRICS.rpc_errors.fetch_add(1, Ordering::Relaxed);
        let mut circuit = self.circuit.lock().unwrap_or_else(|e| e.into_inner());
        circuit.failures += 1;
        circuit.last_failure_ms = now_ms();
        if rate_limited {
            circuit.failures = circuit.failures.max(CIRCUIT_BREAKER_THRESHOLD);
            circuit.open_window_ms = RATE_LIMIT_WINDOW_MS;
        } else if !circuit.open {
            circuit.open_window_ms = CIRCUIT_BREAKER_WINDOW_MS;
        }
        if circuit.failures >= CIRCUIT_BREAKER_THRESHOLD && !circuit.open {
            circuit.open = true;
            self.total_failovers.fetch_add(1, Ordering::Relaxed);
            METRICS.rpc_failovers.fetch_add(1, Ordering::Relaxed);
            // Invalidate block hash cache — fallback may have different chain head
            self.block_hash_stale.store(true, Ordering::Relaxed);
            warn!(
                failures = circuit.failures,
                rate_limited,
                fallback = %self.fallback_url,
                "Circuit breaker opened — routing to fallback"
            );
        }
    }

    pub fn is_circuit_open(&self) -> bool {
        let mut circuit = self.circuit.lock().unwrap_or_else(|e| e.into_inner());
        if !circuit.open {
            return false;
        }
        if now_ms() - circuit.last_failure_ms > circuit.open_window_ms {
            circuit.open = false;
            circuit.failures = 0;
            info!(primary = %self.primary_url, "Circuit breaker half-open, retrying primary");
            return false;
        }
        true
    }

    pub fn failover_count(&self) -> u64 {
        self.total_failovers.load(Ordering::Relaxed)
    }

    pub fn active_url(&self) -> &str {
        if self.is_circuit_open() {
            &self.fallback_url
        } else {
            &self.primary_url
        }
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn is_rate_limited_error(err: &impl std::fmt::Display) -> bool {
    let message = err.to_string();
    let lower = message.to_ascii_lowercase();
    message.contains("429")
        || lower.contains("rate limit")
        || lower.contains("too many requests")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_opens_the_circuit_and_a_fallback_success_leaves_it_open() {
        let rpc = RpcClient::new("http://primary.invalid", "http://fallback.invalid");
        rpc.record_failure(true);
        rpc.record_success(false);
        assert!(rpc.is_circuit_open());
        assert_eq!(rpc.active_url(), "http://fallback.invalid");
        assert_eq!(rpc.failover_count(), 1);
    }

    #[test]
    fn primary_success_closes_the_circuit() {
        let rpc = RpcClient::new("http://primary.invalid", "http://fallback.invalid");
        rpc.record_failure(true);
        assert!(rpc.is_circuit_open());
        rpc.record_success(true);
        assert!(!rpc.is_circuit_open());
        assert_eq!(rpc.active_url(), "http://primary.invalid");
    }

    #[test]
    fn rate_limit_message_is_detected() {
        assert!(is_rate_limited_error(
            &"HTTP 429: You've reached your RPC rate limit."
        ));
        assert!(!is_rate_limited_error(&"connection timed out"));
    }
}
