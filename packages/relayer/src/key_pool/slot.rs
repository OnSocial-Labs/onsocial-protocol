//! Key slot and RAII guard types.

use crate::signer::RelayerSigner;
use near_crypto::PublicKey;
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex as AsyncMutex;

// --- Key states ---
pub(crate) const WARMUP: u8 = 0;
pub(crate) const ACTIVE: u8 = 1;
pub(crate) const DRAINING: u8 = 2;
pub(crate) const DEAD: u8 = 3;

/// A single key slot in the pool.
pub struct KeySlot {
    pub(crate) signer: RelayerSigner,
    /// 0=warmup, 1=active, 2=draining, 3=dead.
    pub(crate) state: AtomicU8,
    pub(crate) in_flight: AtomicU32,
    /// Local nonce counter — incremented atomically, never queries chain mid-flight.
    pub(crate) nonce: AtomicU64,
    pub(crate) last_used: AtomicU64,
    pub(crate) created_at: u64,
    /// Serializes RPC submissions per-key to preserve nonce ordering.
    pub submit_lock: AsyncMutex<()>,
}

impl KeySlot {
    pub(crate) fn new(signer: RelayerSigner, nonce: u64) -> Self {
        Self {
            signer,
            state: AtomicU8::new(WARMUP),
            in_flight: AtomicU32::new(0),
            nonce: AtomicU64::new(nonce),
            last_used: AtomicU64::new(0),
            created_at: now_secs(),
            submit_lock: AsyncMutex::new(()),
        }
    }

    pub(crate) fn is_active(&self) -> bool {
        self.state.load(Ordering::Relaxed) == ACTIVE
    }
}

/// RAII guard from [`KeyPool::acquire`]. Decrements `in_flight` on drop.
pub struct KeyGuard {
    pub(crate) slot: Arc<KeySlot>,
    pub nonce: u64,
}

impl KeyGuard {
    pub fn signer(&self) -> &RelayerSigner {
        &self.slot.signer
    }

    pub fn public_key(&self) -> PublicKey {
        self.slot.signer.public_key()
    }

    /// Hold across sign + send_tx_async to guarantee nonce ordering.
    pub async fn lock_submit(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.slot.submit_lock.lock().await
    }
}

impl Drop for KeyGuard {
    fn drop(&mut self) {
        self.slot.in_flight.fetch_sub(1, Ordering::Relaxed);
    }
}

pub(crate) fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
