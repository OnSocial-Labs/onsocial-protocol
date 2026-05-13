//! Delegate signer slot and RAII guard types.

use crate::signer::RelayerSigner;
use near_crypto::PublicKey;
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;

pub(crate) const ACTIVE: u8 = 1;

pub struct KeySlot {
    pub(crate) signer: RelayerSigner,
    pub(crate) state: AtomicU8,
    pub(crate) in_flight: AtomicU32,
    /// Incremented atomically; never queries chain mid-flight.
    pub(crate) nonce: AtomicU64,
    /// Serializes RPC submissions per key to preserve nonce ordering.
    pub submit_lock: AsyncMutex<()>,
}

impl KeySlot {
    pub(crate) fn new(signer: RelayerSigner, nonce: u64) -> Self {
        Self {
            signer,
            state: AtomicU8::new(ACTIVE),
            in_flight: AtomicU32::new(0),
            nonce: AtomicU64::new(nonce),
            submit_lock: AsyncMutex::new(()),
        }
    }

    pub(crate) fn is_active(&self) -> bool {
        self.state.load(Ordering::Relaxed) == ACTIVE
    }
}

/// RAII guard. Decrements `in_flight` on drop.
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

    /// Hold across sign + send to guarantee nonce ordering.
    pub async fn lock_submit(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.slot.submit_lock.lock().await
    }
}

impl Drop for KeyGuard {
    fn drop(&mut self) {
        self.slot.in_flight.fetch_sub(1, Ordering::Relaxed);
    }
}
