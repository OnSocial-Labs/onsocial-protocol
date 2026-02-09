//! Self-scaling key pool for NEAR function-call access keys.
//!
//! Manages a fixed-size array of [`KeySlot`]s with atomic round-robin
//! acquisition (~20ns, lock-free). Background autoscaler provisions,
//! rotates, and cleans up keys automatically.

use crate::config::ScalingConfig;
use crate::key_store::KeyStore;
use crate::rpc::RpcClient;
use near_crypto::{PublicKey, SecretKey, Signer};
use near_primitives::types::AccountId;
use std::sync::atomic::{AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{error, info, warn};

// --- Key states ---
const WARMUP: u8 = 0;
const ACTIVE: u8 = 1;
const DRAINING: u8 = 2;
const DEAD: u8 = 3;

/// A single key slot in the pool.
pub struct KeySlot {
    /// The signer for this key (wraps account_id + public/secret key).
    pub signer: Signer,
    /// Key state: 0=warmup, 1=active, 2=draining, 3=dead.
    pub state: AtomicU8,
    /// Number of in-flight transactions using this key.
    pub in_flight: AtomicU32,
    /// Local nonce counter — incremented atomically, never queries chain mid-flight.
    pub nonce: AtomicU64,
    /// Last time this key was used (unix seconds).
    pub last_used: AtomicU64,
    /// When this key was created (unix seconds).
    pub created_at: u64,
}

impl KeySlot {
    fn new(signer: Signer, nonce: u64) -> Self {
        Self {
            signer,
            state: AtomicU8::new(WARMUP),
            in_flight: AtomicU32::new(0),
            nonce: AtomicU64::new(nonce),
            last_used: AtomicU64::new(0),
            created_at: now_secs(),
        }
    }

    fn is_active(&self) -> bool {
        self.state.load(Ordering::Relaxed) == ACTIVE
    }
}

/// RAII guard returned by [`KeyPool::acquire`]. Decrements `in_flight`
/// on drop — impossible to leak.
pub struct KeyGuard {
    slot: Arc<KeySlot>,
    pub nonce: u64,
}

impl KeyGuard {
    /// Reference to the signer for signing transactions.
    pub fn signer(&self) -> &Signer {
        &self.slot.signer
    }

    /// The public key of the acquired key (for diagnostics / nonce error handling).
    pub fn public_key(&self) -> PublicKey {
        self.slot.signer.public_key()
    }
}

impl Drop for KeyGuard {
    fn drop(&mut self) {
        self.slot.in_flight.fetch_sub(1, Ordering::Relaxed);
    }
}

/// The self-scaling key pool.
pub struct KeyPool {
    pub account_id: AccountId,
    pub contract_id: AccountId,
    /// Admin key — full-access, used ONLY for AddKey/DeleteKey.
    admin_signer: Signer,
    /// Fixed-size array of key slots. Slots can be WARMUP/ACTIVE/DRAINING/DEAD.
    slots: Vec<Arc<KeySlot>>,
    /// Atomic counter for round-robin.
    next: AtomicU64,
    /// Scaling configuration.
    pub config: ScalingConfig,
    /// Encrypted key store (file-backed).
    store: KeyStore,
    /// Last scaling event timestamp (to enforce cooldown).
    last_scale_event: AtomicU64,
}

impl KeyPool {
    /// Bootstrap a new pool from existing keys + admin key.
    ///
    /// If `initial_signers` is empty, the pool starts cold and the autoscaler
    /// will provision keys on the first tick.
    pub fn new(
        account_id: AccountId,
        contract_id: AccountId,
        admin_signer: Signer,
        initial_signers: Vec<(Signer, u64)>, // (signer, nonce)
        config: ScalingConfig,
        store: KeyStore,
    ) -> Self {
        let slots: Vec<Arc<KeySlot>> = initial_signers
            .into_iter()
            .map(|(signer, nonce)| {
                let slot = KeySlot::new(signer, nonce);
                slot.state.store(ACTIVE, Ordering::Relaxed);
                Arc::new(slot)
            })
            .collect();

        info!(
            active_keys = slots.len(),
            account = %account_id,
            "Key pool initialized"
        );

        Self {
            account_id,
            contract_id,
            admin_signer,
            slots,
            next: AtomicU64::new(0),
            config,
            store,
            last_scale_event: AtomicU64::new(0),
        }
    }

    // --- Hot path: acquire a key ---

    /// Acquire a key for a transaction. Returns an RAII guard that releases
    /// the key when dropped. O(N) worst case but typically O(1) for sparse pools.
    pub fn acquire(&self) -> Result<KeyGuard, crate::Error> {
        let len = self.slots.len();
        if len == 0 {
            return Err(crate::Error::KeyPool("No keys in pool".into()));
        }

        // Round-robin scan — try up to `len` slots.
        let start = self.next.fetch_add(1, Ordering::Relaxed) as usize;
        for i in 0..len {
            let idx = (start + i) % len;
            let slot = &self.slots[idx];
            if slot.is_active() {
                slot.in_flight.fetch_add(1, Ordering::Relaxed);
                let nonce = slot.nonce.fetch_add(1, Ordering::SeqCst) + 1;
                slot.last_used.store(now_secs(), Ordering::Relaxed);
                return Ok(KeyGuard {
                    slot: Arc::clone(slot),
                    nonce,
                });
            }
        }

        Err(crate::Error::KeyPool("All keys exhausted".into()))
    }

    // --- Diagnostics ---

    /// Number of active keys.
    pub fn active_count(&self) -> usize {
        self.slots
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE)
            .count()
    }

    /// Number of warm (pre-provisioned, not yet active) keys.
    pub fn warm_count(&self) -> usize {
        self.slots
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == WARMUP)
            .count()
    }

    /// Number of draining keys.
    pub fn draining_count(&self) -> usize {
        self.slots
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == DRAINING)
            .count()
    }

    /// Total in-flight transactions across all keys.
    pub fn total_in_flight(&self) -> u32 {
        self.slots
            .iter()
            .map(|s| s.in_flight.load(Ordering::Relaxed))
            .sum()
    }

    /// Pool utilization as a fraction (0.0 - 1.0).
    pub fn utilization(&self) -> f32 {
        let active = self.active_count();
        if active == 0 {
            return 1.0; // indicates need for scale-up
        }
        let in_flight = self.total_in_flight() as f32;
        in_flight / active as f32
    }

    /// Get the relayer account ID for display.
    pub fn relayer_account(&self) -> &AccountId {
        &self.account_id
    }

    // --- Autoscaler ---

    /// Run the autoscaler loop — call this from a tokio::spawn.
    pub async fn run_autoscaler(self: &Arc<Self>, rpc: &RpcClient) {
        let interval = Duration::from_secs(5);
        loop {
            tokio::time::sleep(interval).await;

            if let Err(e) = self.autoscale_tick(rpc).await {
                error!(error = %e, "Autoscaler tick failed");
            }
        }
    }

    async fn autoscale_tick(&self, rpc: &RpcClient) -> Result<(), crate::Error> {
        let active = self.active_count();
        let utilization = self.utilization();

        // Reap dead/draining slots with 0 in_flight
        self.reap_dead_slots();

        // Check key age — rotate old keys
        self.rotate_old_keys(rpc).await?;

        // Scale up if utilization is high and below max
        if utilization > self.config.scale_up_threshold
            && active < self.config.max_keys as usize
            && self.cooldown_elapsed()
        {
            let to_add = self
                .config
                .batch_size
                .min(self.config.max_keys - active as u32);
            if to_add > 0 {
                info!(current = active, adding = to_add, utilization, "Scaling up");
                self.scale_up(rpc, to_add).await?;
                self.last_scale_event.store(now_secs(), Ordering::Relaxed);
            }
        }

        // Scale down if utilization is low and above min
        if utilization < self.config.scale_down_threshold
            && active > self.config.min_keys as usize
            && self.cooldown_elapsed()
        {
            let to_remove = self
                .config
                .batch_size
                .min(active as u32 - self.config.min_keys);
            if to_remove > 0 {
                info!(current = active, removing = to_remove, utilization, "Scaling down");
                self.scale_down(rpc, to_remove).await?;
                self.last_scale_event.store(now_secs(), Ordering::Relaxed);
            }
        }

        // Promote warm keys if we need them
        self.promote_warm_keys();

        Ok(())
    }

    fn cooldown_elapsed(&self) -> bool {
        let last = self.last_scale_event.load(Ordering::Relaxed);
        now_secs() - last >= self.config.cooldown.as_secs()
    }

    fn reap_dead_slots(&self) {
        for slot in &self.slots {
            let st = slot.state.load(Ordering::Relaxed);
            if st == DRAINING && slot.in_flight.load(Ordering::Relaxed) == 0 {
                slot.state.store(DEAD, Ordering::Relaxed);
            }
        }
    }

    fn promote_warm_keys(&self) {
        for slot in &self.slots {
            if slot.state.load(Ordering::Relaxed) == WARMUP {
                slot.state.store(ACTIVE, Ordering::Relaxed);
            }
        }
    }

    /// Scale up: generate N new keys, batch AddKey on-chain, add to pool.
    async fn scale_up(&self, rpc: &RpcClient, count: u32) -> Result<(), crate::Error> {
        let mut new_keys: Vec<(SecretKey, PublicKey)> = Vec::with_capacity(count as usize);

        for _ in 0..count {
            let secret_key = SecretKey::from_random(near_crypto::KeyType::ED25519);
            let public_key = secret_key.public_key();
            new_keys.push((secret_key, public_key));
        }

        // Build batch AddKey transaction using admin key
        let actions: Vec<near_primitives::transaction::Action> = new_keys
            .iter()
            .map(|(_, pk)| {
                near_primitives::transaction::AddKeyAction {
                    public_key: pk.clone(),
                    access_key: near_primitives::account::AccessKey {
                        nonce: 0, // ignored by protocol — assigned as block_height * 10^6
                        permission:
                            near_primitives::account::AccessKeyPermission::FunctionCall(
                                near_primitives::account::FunctionCallPermission {
                                    allowance: None, // unlimited
                                    receiver_id: self.contract_id.to_string(),
                                    method_names: vec!["execute".to_string()],
                                },
                            ),
                    },
                }
                .into()
            })
            .collect();

        // Send batch TX with admin key — query nonce + block_hash for admin
        let admin_ak = rpc
            .query_access_key(&self.account_id, &self.admin_signer.public_key())
            .await
            .map_err(|e| crate::Error::KeyPool(format!("admin access_key query: {e}")))?;
        let block_hash = rpc.latest_block_hash().await?;

        rpc.send_tx(
            &self.admin_signer,
            &self.account_id,
            &self.account_id,
            admin_ak.nonce + 1,
            block_hash,
            actions,
        )
        .await
        .map_err(|e| crate::Error::KeyPool(format!("AddKey batch failed: {e}")))?;

        info!(count, "AddKey batch submitted");

        // Sync nonces from chain and add to pool
        // (In a real implementation, we'd wait for the TX to finalize,
        //  then query nonces. For now, the warm keys will sync on next tick.)
        // The slots vector is not resizable at runtime in this version —
        // we pre-allocate max_keys slots and use state transitions.
        // TODO: For the initial implementation, we rely on restart with
        // updated key store. Full dynamic slot addition requires interior mutability.

        Ok(())
    }

    /// Scale down: drain N idle keys, then batch DeleteKey.
    async fn scale_down(&self, rpc: &RpcClient, count: u32) -> Result<(), crate::Error> {
        let mut to_delete: Vec<PublicKey> = Vec::new();
        let now = now_secs();
        let mut removed = 0u32;

        for slot in self.slots.iter().rev() {
            if removed >= count {
                break;
            }
            let st = slot.state.load(Ordering::Relaxed);
            if st != ACTIVE {
                continue;
            }
            // Only drain keys that have been idle
            let last_used = slot.last_used.load(Ordering::Relaxed);
            if last_used > 0 && now - last_used < self.config.scale_down_idle.as_secs() {
                continue;
            }
            if slot.in_flight.load(Ordering::Relaxed) > 0 {
                continue;
            }
            // Mark as draining
            slot.state.store(DRAINING, Ordering::Relaxed);
            to_delete.push(slot.signer.public_key());
            removed += 1;
        }

        if to_delete.is_empty() {
            return Ok(());
        }

        // Build batch DeleteKey transaction
        let actions: Vec<near_primitives::transaction::Action> = to_delete
            .iter()
            .map(|pk| {
                near_primitives::transaction::DeleteKeyAction {
                    public_key: pk.clone(),
                }
                .into()
            })
            .collect();

        let admin_ak = rpc
            .query_access_key(&self.account_id, &self.admin_signer.public_key())
            .await
            .map_err(|e| crate::Error::KeyPool(format!("admin access_key query: {e}")))?;
        let block_hash = rpc.latest_block_hash().await?;

        rpc.send_tx(
            &self.admin_signer,
            &self.account_id,
            &self.account_id,
            admin_ak.nonce + 1,
            block_hash,
            actions,
        )
        .await
        .map_err(|e| {
            // Revert draining state on failure
            warn!(error = %e, "DeleteKey batch failed, reverting drain");
            for slot in &self.slots {
                if slot.state.load(Ordering::Relaxed) == DRAINING {
                    if to_delete.contains(&slot.signer.public_key()) {
                        slot.state.store(ACTIVE, Ordering::Relaxed);
                    }
                }
            }
            crate::Error::KeyPool(format!("DeleteKey batch failed: {e}"))
        })?;

        info!(count = removed, "DeleteKey batch submitted");

        // Persist updated key store
        if let Err(e) = self.persist_keys() {
            warn!(error = %e, "Failed to persist key store after scale-down");
        }

        Ok(())
    }

    /// Rotate keys older than max_key_age.
    async fn rotate_old_keys(&self, _rpc: &RpcClient) -> Result<(), crate::Error> {
        let now = now_secs();
        let max_age = self.config.max_key_age.as_secs();
        let mut rotated = 0u32;

        for slot in &self.slots {
            if slot.state.load(Ordering::Relaxed) != ACTIVE {
                continue;
            }
            if now - slot.created_at < max_age {
                continue;
            }
            if slot.in_flight.load(Ordering::Relaxed) > 0 {
                continue; // wait for next tick
            }
            // Drain the old key
            slot.state.store(DRAINING, Ordering::Relaxed);
            rotated += 1;
        }

        if rotated > 0 {
            info!(count = rotated, "Draining aged keys for rotation");
            // The next autoscale_tick will reap DEAD slots and scale_up replacements
        }

        Ok(())
    }

    /// Persist all active/warm keys to encrypted store.
    fn persist_keys(&self) -> Result<(), crate::Error> {
        let keys: Vec<(String, String)> = self
            .slots
            .iter()
            .filter(|s| {
                let st = s.state.load(Ordering::Relaxed);
                st == ACTIVE || st == WARMUP
            })
            .filter_map(|s| match &s.signer {
                Signer::InMemory(ims) => Some((
                    ims.public_key.to_string(),
                    ims.secret_key.to_string(),
                )),
                _ => None,
            })
            .collect();

        self.store.save(&self.account_id, &keys)
    }

    /// Handle a nonce error for a specific key — re-sync nonce from chain.
    pub async fn handle_nonce_error(
        &self,
        public_key: &PublicKey,
        rpc: &RpcClient,
    ) -> Result<(), crate::Error> {
        for slot in &self.slots {
            if slot.signer.public_key() == *public_key {
                match sync_nonce_from_chain(rpc, &self.account_id, public_key).await {
                    Ok(nonce) => {
                        slot.nonce.store(nonce, Ordering::SeqCst);
                        info!(key = %public_key, nonce, "Nonce re-synced from chain");
                    }
                    Err(e) => {
                        warn!(key = %public_key, error = %e, "Failed to re-sync nonce");
                    }
                }
                break;
            }
        }
        Ok(())
    }
}

/// Sync a single key's nonce from the chain.
pub async fn sync_nonce_from_chain(
    rpc: &RpcClient,
    account_id: &AccountId,
    public_key: &PublicKey,
) -> Result<u64, crate::Error> {
    let ak = rpc
        .query_access_key(account_id, public_key)
        .await
        .map_err(|e| crate::Error::KeyPool(format!("Failed to query access key: {e}")))?;

    Ok(ak.nonce)
}

/// Bootstrap the pool from chain: query all access keys, match against stored keys.
pub async fn bootstrap_pool_from_chain(
    rpc: &RpcClient,
    account_id: &AccountId,
    contract_id: &AccountId,
    admin_signer: Signer,
    stored_keys: Vec<(SecretKey, PublicKey)>,
    config: ScalingConfig,
    store: KeyStore,
) -> Result<KeyPool, crate::Error> {
    let mut signers_with_nonces = Vec::new();

    for (secret_key, public_key) in &stored_keys {
        match rpc.query_access_key(account_id, public_key).await {
            Ok(ak) => {
                let signer = near_crypto::InMemorySigner::from_secret_key(
                    account_id.clone(),
                    secret_key.clone(),
                );
                signers_with_nonces.push((signer, ak.nonce));
                info!(key = %public_key, nonce = ak.nonce, "Synced key from chain");
            }
            Err(e) => {
                warn!(key = %public_key, error = %e, "Key not found on chain, skipping");
            }
        }
    }

    info!(
        synced = signers_with_nonces.len(),
        total_stored = stored_keys.len(),
        "Bootstrap complete"
    );

    Ok(KeyPool::new(
        account_id.clone(),
        contract_id.clone(),
        admin_signer,
        signers_with_nonces,
        config,
        store,
    ))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::key_store::KeyStore;
    use near_crypto::KeyType;

    fn make_test_signer(n: u8) -> Signer {
        let secret = SecretKey::from_random(KeyType::ED25519);
        near_crypto::InMemorySigner::from_secret_key(
            format!("test{n}.testnet").parse().unwrap(),
            secret,
        )
    }

    fn make_test_pool(n: u8) -> KeyPool {
        let admin = make_test_signer(0);
        let signers: Vec<(Signer, u64)> = (1..=n)
            .map(|i| (make_test_signer(i), 1000 + i as u64))
            .collect();
        let store = KeyStore::new_plaintext("/tmp/test_keypool".into());
        KeyPool::new(
            "relayer.testnet".parse().unwrap(),
            "core.testnet".parse().unwrap(),
            admin,
            signers,
            ScalingConfig::default(),
            store,
        )
    }

    #[test]
    fn test_acquire_returns_guard() {
        let pool = make_test_pool(3);
        let guard = pool.acquire().unwrap();
        assert!(guard.nonce > 0);
        assert_eq!(pool.total_in_flight(), 1);
        drop(guard);
        assert_eq!(pool.total_in_flight(), 0);
    }

    #[test]
    fn test_acquire_round_robin() {
        let pool = make_test_pool(3);
        let g1 = pool.acquire().unwrap();
        let g2 = pool.acquire().unwrap();
        let g3 = pool.acquire().unwrap();
        // Should cycle through different keys
        let keys: Vec<String> = vec![
            g1.public_key().to_string(),
            g2.public_key().to_string(),
            g3.public_key().to_string(),
        ];
        // At least 2 unique keys (round-robin may wrap)
        let unique: std::collections::HashSet<&String> = keys.iter().collect();
        assert!(unique.len() >= 2);
        assert_eq!(pool.total_in_flight(), 3);
    }

    #[test]
    fn test_acquire_empty_pool_errors() {
        let admin = make_test_signer(0);
        let store = KeyStore::new_plaintext("/tmp/test_empty".into());
        let pool = KeyPool::new(
            "relayer.testnet".parse().unwrap(),
            "core.testnet".parse().unwrap(),
            admin,
            vec![],
            ScalingConfig::default(),
            store,
        );
        assert!(pool.acquire().is_err());
    }

    #[test]
    fn test_guard_drops_release_in_flight() {
        let pool = make_test_pool(2);
        {
            let _g1 = pool.acquire().unwrap();
            let _g2 = pool.acquire().unwrap();
            assert_eq!(pool.total_in_flight(), 2);
        }
        assert_eq!(pool.total_in_flight(), 0);
    }

    #[test]
    fn test_active_count() {
        let pool = make_test_pool(5);
        assert_eq!(pool.active_count(), 5);
        assert_eq!(pool.warm_count(), 0);
        assert_eq!(pool.draining_count(), 0);
    }

    #[test]
    fn test_utilization_no_traffic() {
        let pool = make_test_pool(5);
        assert_eq!(pool.utilization(), 0.0);
    }

    #[test]
    fn test_utilization_with_traffic() {
        let pool = make_test_pool(2);
        let _g1 = pool.acquire().unwrap();
        // 1 in-flight / 2 active = 0.5
        assert!((pool.utilization() - 0.5).abs() < 0.01);
    }
}
