//! RPC client with automatic failover.
//!
//! Wraps `near_jsonrpc_client::JsonRpcClient` with primary → fallback failover,
//! retry with exponential backoff, and a circuit breaker.
//! Signs and sends transactions using the pool's local nonce — no hidden cache.

use near_crypto::{PublicKey, Signer};
use near_jsonrpc_client::methods;
use near_jsonrpc_client::JsonRpcClient;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::{Action, SignedTransaction, Transaction, TransactionV0};
use near_primitives::types::{AccountId, BlockReference, Finality, Nonce};
use near_primitives::views::{AccessKeyView, FinalExecutionOutcomeView};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use tokio::sync::RwLock;
use tracing::{info, warn};

/// How long a cached block hash stays valid (seconds).
const BLOCK_HASH_TTL_SECS: u64 = 30;

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

/// RPC client with primary → fallback failover and block hash caching.
pub struct RpcClient {
    primary: JsonRpcClient,
    fallback: JsonRpcClient,
    primary_url: String,
    fallback_url: String,
    circuit: Mutex<CircuitState>,
    total_failovers: AtomicU64,
    /// Cached (block_hash, fetched_at). Refreshed when older than BLOCK_HASH_TTL_SECS.
    cached_block_hash: RwLock<Option<(CryptoHash, Instant)>>,
}

impl RpcClient {
    pub fn new(primary_url: &str, fallback_url: &str) -> Self {
        info!(primary = primary_url, fallback = fallback_url, "RPC client initialized with failover");
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
        }
    }

    // ── TX construction & submission ──────────────────────────────────

    /// Get a recent block hash, using cache when fresh (< 30s old).
    /// Eliminates redundant RPC round-trips on every TX.
    pub async fn latest_block_hash(&self) -> Result<CryptoHash, crate::Error> {
        // Fast path: read lock, check cache freshness
        {
            let cache = self.cached_block_hash.read().await;
            if let Some((hash, when)) = *cache {
                if when.elapsed().as_secs() < BLOCK_HASH_TTL_SECS {
                    return Ok(hash);
                }
            }
        }
        // Slow path: fetch from RPC, update cache
        let client = self.active();
        let block = client
            .call(methods::block::RpcBlockRequest {
                block_reference: BlockReference::Finality(Finality::Final),
            })
            .await
            .map_err(|e| crate::Error::Rpc(format!("block query failed: {e}")))?;
        let hash = block.header.hash;
        {
            let mut cache = self.cached_block_hash.write().await;
            *cache = Some((hash, Instant::now()));
        }
        Ok(hash)
    }

    /// Query an access key's on-chain nonce.
    pub async fn query_access_key(
        &self,
        account_id: &AccountId,
        public_key: &PublicKey,
    ) -> Result<AccessKeyView, crate::Error> {
        let client = self.active();
        let resp = client
            .call(methods::query::RpcQueryRequest {
                block_reference: BlockReference::Finality(Finality::Final),
                request: near_primitives::views::QueryRequest::ViewAccessKey {
                    account_id: account_id.clone(),
                    public_key: public_key.clone(),
                },
            })
            .await
            .map_err(|e| crate::Error::Rpc(format!("access_key query failed: {e}")))?;

        match resp.kind {
            near_jsonrpc_primitives::types::query::QueryResponseKind::AccessKey(ak) => Ok(ak),
            other => Err(crate::Error::Rpc(format!(
                "unexpected query response: {other:?}"
            ))),
        }
    }

    /// Build, sign, and send a transaction (blocking commit).
    ///
    /// Uses the caller-provided `nonce` — the pool's atomic counter is the
    /// single source of truth.
    pub async fn send_tx(
        &self,
        signer: &Signer,
        signer_id: &AccountId,
        receiver_id: &AccountId,
        nonce: Nonce,
        block_hash: CryptoHash,
        actions: Vec<Action>,
    ) -> Result<FinalExecutionOutcomeView, crate::Error> {
        let signed = Transaction::V0(TransactionV0 {
            signer_id: signer_id.clone(),
            public_key: signer.public_key(),
            nonce,
            receiver_id: receiver_id.clone(),
            block_hash,
            actions,
        })
        .sign(signer);
        self.send_signed_tx(signed).await
    }

    /// Send an already-signed transaction and wait for finality.
    pub async fn send_signed_tx(
        &self,
        signed_tx: SignedTransaction,
    ) -> Result<FinalExecutionOutcomeView, crate::Error> {
        let client = self.active();
        let outcome = client
            .call(methods::broadcast_tx_commit::RpcBroadcastTxCommitRequest { signed_transaction: signed_tx })
            .await
            .map_err(|e| crate::Error::Rpc(format!("broadcast_tx_commit failed: {e}")))?;
        Ok(outcome)
    }

    /// Fire-and-forget: send a signed TX and return the hash immediately (~50ms).
    pub async fn send_tx_async(
        &self,
        signed_tx: SignedTransaction,
    ) -> Result<CryptoHash, crate::Error> {
        let client = self.active();
        let tx_hash = client
            .call(methods::broadcast_tx_async::RpcBroadcastTxAsyncRequest { signed_transaction: signed_tx })
            .await
            .map_err(|e| crate::Error::Rpc(format!("broadcast_tx_async failed: {e}")))?;
        Ok(tx_hash)
    }

    /// Query the status of a previously-submitted TX.
    pub async fn tx_status(
        &self,
        tx_hash: CryptoHash,
        sender_id: &AccountId,
    ) -> Result<FinalExecutionOutcomeView, crate::Error> {
        let client = self.active();
        let resp = client
            .call(methods::tx::RpcTransactionStatusRequest {
                transaction_info:
                    methods::tx::TransactionInfo::TransactionId {
                        tx_hash,
                        sender_account_id: sender_id.clone(),
                    },
                wait_until: near_primitives::views::TxExecutionStatus::Final,
            })
            .await
            .map_err(|e| crate::Error::Rpc(format!("tx_status query failed: {e}")))?;

        resp.final_execution_outcome
            .map(|e| e.into_outcome())
            .ok_or_else(|| crate::Error::Rpc("TX not finalized yet".into()))
    }

    // ── Failover / circuit breaker ───────────────────────────────────

    /// Get the active client (primary unless circuit is open).
    pub fn active(&self) -> &JsonRpcClient {
        if self.is_circuit_open() {
            &self.fallback
        } else {
            &self.primary
        }
    }

    /// Get the fallback client.
    pub fn fallback_client(&self) -> &JsonRpcClient {
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
