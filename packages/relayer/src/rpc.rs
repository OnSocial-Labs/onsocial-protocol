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

/// Cached block hash TTL.
const BLOCK_HASH_TTL_SECS: u64 = 30;

const CIRCUIT_BREAKER_THRESHOLD: u64 = 5;
const CIRCUIT_BREAKER_WINDOW_MS: u64 = 30_000;
struct CircuitState {
    failures: u64,
    last_failure_ms: u64,
    open: bool,
}

/// RPC client with primary → fallback failover and block hash caching.
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
            }),
            total_failovers: AtomicU64::new(0),
            cached_block_hash: RwLock::new(None),
            block_hash_stale: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// The primary RPC URL.
    pub fn primary_url(&self) -> &str {
        &self.primary_url
    }

    pub fn fallback_url(&self) -> &str {
        &self.fallback_url
    }

    // --- TX construction & submission ---

    /// Get a recent block hash, using cache when fresh (<30s).
    pub async fn latest_block_hash(&self) -> Result<CryptoHash, crate::Error> {
        // Fast path: cached and fresh
        if !self.block_hash_stale.load(Ordering::Relaxed) {
            let cache = self.cached_block_hash.read().await;
            if let Some((hash, when)) = *cache {
                if when.elapsed().as_secs() < BLOCK_HASH_TTL_SECS {
                    return Ok(hash);
                }
            }
        }
        // Slow path: fetch from RPC with failover
        let block = match self
            .primary
            .call(methods::block::RpcBlockRequest {
                block_reference: BlockReference::Finality(Finality::Final),
            })
            .await
        {
            Ok(b) => {
                self.record_success();
                b
            }
            Err(e) => {
                self.record_failure();
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

    /// Query an access key's on-chain nonce. Automatic failover.
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

        let resp = match self.active().call(make_request()).await {
            Ok(r) => {
                self.record_success();
                r
            }
            Err(e) => {
                self.record_failure();
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

    /// Send a signed transaction and wait for finality. Automatic failover.
    pub async fn send_signed_tx(
        &self,
        signed_tx: SignedTransaction,
    ) -> Result<FinalExecutionOutcomeView, crate::Error> {
        let client = self.active();
        match client
            .call(methods::broadcast_tx_commit::RpcBroadcastTxCommitRequest {
                signed_transaction: signed_tx.clone(),
            })
            .await
        {
            Ok(outcome) => {
                self.record_success();
                Ok(outcome)
            }
            Err(e) => {
                self.record_failure();
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

    /// Fire-and-forget: send a signed TX and return the hash immediately (~50ms).
    pub async fn send_tx_async(
        &self,
        signed_tx: SignedTransaction,
    ) -> Result<CryptoHash, crate::Error> {
        match self
            .active()
            .call(methods::broadcast_tx_async::RpcBroadcastTxAsyncRequest {
                signed_transaction: signed_tx.clone(),
            })
            .await
        {
            Ok(hash) => {
                self.record_success();
                Ok(hash)
            }
            Err(e) => {
                self.record_failure();
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

    /// Query TX status. Automatic failover.
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

        let resp = match self.active().call(make_request()).await {
            Ok(r) => {
                self.record_success();
                r
            }
            Err(e) => {
                self.record_failure();
                self.fallback.call(make_request()).await.map_err(|e2| {
                    crate::Error::Rpc(format!("tx_status failed: primary={e}, fallback={e2}"))
                })?
            }
        };

        resp.final_execution_outcome
            .map(|e| e.into_outcome())
            .ok_or_else(|| crate::Error::Rpc("TX not finalized yet".into()))
    }

    /// Quick connectivity check. Returns "ok", "degraded", or error.
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

    /// Active client (primary unless circuit is open).
    fn active(&self) -> &JsonRpcClient {
        if self.is_circuit_open() {
            &self.fallback
        } else {
            &self.primary
        }
    }

    fn record_success(&self) {
        let mut circuit = self.circuit.lock().unwrap_or_else(|e| e.into_inner());
        if circuit.failures > 0 {
            info!(primary = %self.primary_url, "Primary RPC recovered");
            circuit.failures = 0;
            circuit.open = false;
        }
    }

    fn record_failure(&self) {
        METRICS.rpc_errors.fetch_add(1, Ordering::Relaxed);
        let mut circuit = self.circuit.lock().unwrap_or_else(|e| e.into_inner());
        circuit.failures += 1;
        circuit.last_failure_ms = now_ms();
        if circuit.failures >= CIRCUIT_BREAKER_THRESHOLD && !circuit.open {
            circuit.open = true;
            self.total_failovers.fetch_add(1, Ordering::Relaxed);
            METRICS.rpc_failovers.fetch_add(1, Ordering::Relaxed);
            // Invalidate block hash cache — fallback may have different chain head
            self.block_hash_stale.store(true, Ordering::Relaxed);
            warn!(
                failures = circuit.failures,
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
        if now_ms() - circuit.last_failure_ms > CIRCUIT_BREAKER_WINDOW_MS {
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

    /// Currently active RPC URL.
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
