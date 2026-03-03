//! Self-scaling key pool for NEAR function-call access keys.
//!
//! Lock-free round-robin acquisition (~20ns). Background autoscaler handles
//! provisioning, rotation, and cleanup.

mod bootstrap;
mod rotation;
mod scaling;
mod slot;

pub use bootstrap::bootstrap_pool_from_chain;
pub use slot::{KeyGuard, KeySlot};

use crate::config::ScalingConfig;
use crate::key_store::KeyStore;
use crate::signer::RelayerSigner;
use near_primitives::types::AccountId;
use slot::{now_secs, ACTIVE, DRAINING, WARMUP};
#[cfg(feature = "gcp")]
use std::sync::atomic::AtomicU32;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;
use tracing::info;

/// KMS context for on-demand key creation (only with `gcp` feature).
#[cfg(feature = "gcp")]
pub struct KmsContext {
    pub client: Arc<crate::kms::KmsClient>,
    pub project: String,
    pub location: String,
    pub keyring: String,
    pub next_index: AtomicU32,
}

/// Everything needed to construct a [`KeyPool`].
///
/// Groups constructor parameters so callers never hit
/// `clippy::too_many_arguments`. The pool consumes this struct; build it
/// once in `state.rs` and hand it to [`KeyPool::new`] or
/// [`bootstrap_pool_from_chain`].
pub struct PoolConfig {
    /// The relayer's NEAR account that owns the pool keys.
    pub account_id: AccountId,
    /// All contracts the pool provisions FunctionCall keys for.
    /// Each contract gets its own set of keys (NEAR restriction:
    /// one `receiver_id` per FunctionCall key). Adding a new contract
    /// is a one-line env-var change — the autoscaler provisions keys
    /// for it automatically on next tick.
    pub allowed_contracts: Vec<AccountId>,
    /// Full-access key for AddKey/DeleteKey. Local (dev) or KMS (production).
    pub admin_signer: RelayerSigner,
    /// Autoscaling thresholds and limits.
    pub scaling: ScalingConfig,
    /// Encrypted key store for local-mode keys. KMS mode uses `/dev/null`.
    pub store: KeyStore,
    /// Methods FunctionCall keys are allowed to call (e.g. `["execute"]`).
    pub allowed_methods: Vec<String>,
}

/// The self-scaling key pool.
pub struct KeyPool {
    pub(crate) account_id: AccountId,
    /// All contracts the pool provisions keys for.
    pub(crate) allowed_contracts: Vec<AccountId>,
    /// Full-access key for AddKey/DeleteKey. Local (dev) or KMS (production).
    pub(crate) admin_signer: RelayerSigner,
    pub(crate) slots: std::sync::RwLock<Vec<Arc<KeySlot>>>,
    next: AtomicU64,
    pub(crate) config: ScalingConfig,
    pub(crate) store: KeyStore,
    pub(crate) last_scale_event: AtomicU64,
    pub(crate) allowed_methods: Vec<String>,
    /// Serializes admin TXs (AddKey/DeleteKey) to prevent nonce races.
    pub(crate) admin_tx_lock: AsyncMutex<()>,
    #[cfg(feature = "gcp")]
    pub(crate) kms: Option<KmsContext>,
}

impl KeyPool {
    /// Bootstrap a new pool from config + pre-loaded signers.
    ///
    /// Empty `initial_signers` starts cold — the autoscaler will provision
    /// keys on the next tick.
    pub fn new(
        pool_config: PoolConfig,
        initial_signers: Vec<(RelayerSigner, u64, AccountId)>,
    ) -> Self {
        let slots: Vec<Arc<KeySlot>> = initial_signers
            .into_iter()
            .map(|(signer, nonce, target)| {
                let slot = KeySlot::new(signer, nonce, target);
                slot.state.store(ACTIVE, Ordering::Relaxed);
                Arc::new(slot)
            })
            .collect();

        info!(
            active_keys = slots.len(),
            account = %pool_config.account_id,
            contracts = ?pool_config.allowed_contracts,
            "Key pool initialized"
        );

        Self {
            account_id: pool_config.account_id,
            allowed_contracts: pool_config.allowed_contracts,
            admin_signer: pool_config.admin_signer,
            slots: std::sync::RwLock::new(slots),
            next: AtomicU64::new(0),
            config: pool_config.scaling,
            store: pool_config.store,
            last_scale_event: AtomicU64::new(0),
            allowed_methods: pool_config.allowed_methods,
            admin_tx_lock: AsyncMutex::new(()),
            #[cfg(feature = "gcp")]
            kms: None,
        }
    }

    /// Set KMS context for on-demand key creation.
    #[cfg(feature = "gcp")]
    pub fn with_kms(mut self, kms: KmsContext) -> Self {
        self.kms = Some(kms);
        self
    }

    // --- Slot accessors ---

    pub(crate) fn read_slots(&self) -> std::sync::RwLockReadGuard<'_, Vec<Arc<KeySlot>>> {
        self.slots.read().unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn write_slots(&self) -> std::sync::RwLockWriteGuard<'_, Vec<Arc<KeySlot>>> {
        self.slots.write().unwrap_or_else(|e| e.into_inner())
    }

    // --- Hot path ---

    /// Acquire a key for a transaction targeting `target_contract`.
    /// Returns an RAII guard. O(N) worst case, typically O(1) for sparse pools.
    pub fn acquire(&self, target_contract: &AccountId) -> Result<KeyGuard, crate::Error> {
        let slots = self.read_slots();
        let len = slots.len();
        if len == 0 {
            return Err(crate::Error::KeyPool("No keys in pool".into()));
        }

        let start = self.next.fetch_add(1, Ordering::Relaxed) as usize;
        for i in 0..len {
            let idx = (start + i) % len;
            let slot = &slots[idx];
            if slot.is_active() && slot.target_contract == *target_contract {
                slot.in_flight.fetch_add(1, Ordering::Relaxed);
                let nonce = slot.nonce.fetch_add(1, Ordering::SeqCst) + 1;
                slot.last_used.store(now_secs(), Ordering::Relaxed);
                return Ok(KeyGuard {
                    slot: Arc::clone(slot),
                    nonce,
                });
            }
        }

        Err(crate::Error::KeyPool(format!(
            "No keys available for contract {target_contract}"
        )))
    }

    // --- Diagnostics ---

    pub fn active_count(&self) -> usize {
        self.read_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE)
            .count()
    }

    pub fn warm_count(&self) -> usize {
        self.read_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == WARMUP)
            .count()
    }

    pub fn draining_count(&self) -> usize {
        self.read_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == DRAINING)
            .count()
    }

    /// Total in-flight TXs across ACTIVE keys (excludes DRAINING).
    pub fn total_in_flight(&self) -> u32 {
        self.read_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE)
            .map(|s| s.in_flight.load(Ordering::Relaxed))
            .sum()
    }

    /// Average in-flight TXs per active key. Returns `f32::MAX` when empty.
    pub fn per_key_load(&self) -> f32 {
        let active = self.active_count();
        if active == 0 {
            return f32::MAX;
        }
        self.total_in_flight() as f32 / active as f32
    }

    // --- Per-contract diagnostics ---

    /// Active keys authorized for a specific contract.
    pub fn active_count_for(&self, contract: &AccountId) -> usize {
        self.read_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE && s.target_contract == *contract)
            .count()
    }

    /// In-flight TXs across active keys for a specific contract.
    pub fn in_flight_for(&self, contract: &AccountId) -> u32 {
        self.read_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE && s.target_contract == *contract)
            .map(|s| s.in_flight.load(Ordering::Relaxed))
            .sum()
    }

    /// Per-key load for a specific contract. Returns `f32::MAX` when no keys.
    pub fn per_key_load_for(&self, contract: &AccountId) -> f32 {
        let active = self.active_count_for(contract);
        if active == 0 {
            return f32::MAX;
        }
        self.in_flight_for(contract) as f32 / active as f32
    }

    pub fn relayer_account(&self) -> &AccountId {
        &self.account_id
    }
}

// --- Test helpers (shared across sub-module tests) ---

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::key_store::KeyStore;
    use crate::rpc::RpcClient;
    use crate::signer::RelayerSigner;
    use near_crypto::KeyType;

    pub(crate) fn make_test_signer(n: u8) -> RelayerSigner {
        let secret = near_crypto::SecretKey::from_random(KeyType::ED25519);
        let signer = near_crypto::InMemorySigner::from_secret_key(
            format!("test{n}.testnet").parse().unwrap(),
            secret,
        );
        RelayerSigner::Local { signer }
    }

    pub(crate) fn make_test_pool(n: u8) -> KeyPool {
        make_test_pool_with_config(n, ScalingConfig::default())
    }

    pub(crate) fn make_test_pool_with_config(n: u8, config: ScalingConfig) -> KeyPool {
        let admin_secret = near_crypto::SecretKey::from_random(KeyType::ED25519);
        let admin_signer = near_crypto::InMemorySigner::from_secret_key(
            "test0.testnet".parse().unwrap(),
            admin_secret,
        );
        let admin = RelayerSigner::Local {
            signer: admin_signer,
        };
        let contract_id: AccountId = "core.testnet".parse().unwrap();
        let signers: Vec<(RelayerSigner, u64, AccountId)> = (1..=n)
            .map(|i| (make_test_signer(i), 1000 + i as u64, contract_id.clone()))
            .collect();
        let store = KeyStore::new_plaintext("/tmp/test_keypool".into());
        KeyPool::new(
            PoolConfig {
                account_id: "relayer.testnet".parse().unwrap(),
                allowed_contracts: vec![contract_id],
                admin_signer: admin,
                scaling: config,
                store,
                allowed_methods: vec!["execute".into()],
            },
            signers,
        )
    }

    /// Dummy RPC client for tests that accept `&RpcClient` but don't call it.
    pub(crate) fn dummy_rpc() -> RpcClient {
        RpcClient::new("http://127.0.0.1:1", "http://127.0.0.1:2")
    }

    pub(crate) fn test_contract() -> AccountId {
        "core.testnet".parse().unwrap()
    }

    // --- Acquire / Guard / Diagnostics ---

    #[test]
    fn test_acquire_returns_guard() {
        let pool = make_test_pool(3);
        let guard = pool.acquire(&test_contract()).unwrap();
        assert!(guard.nonce > 0);
        assert_eq!(pool.total_in_flight(), 1);
        drop(guard);
        assert_eq!(pool.total_in_flight(), 0);
    }

    #[test]
    fn test_acquire_round_robin() {
        let pool = make_test_pool(3);
        let c = test_contract();
        let g1 = pool.acquire(&c).unwrap();
        let g2 = pool.acquire(&c).unwrap();
        let g3 = pool.acquire(&c).unwrap();
        let keys: Vec<String> = vec![
            g1.public_key().to_string(),
            g2.public_key().to_string(),
            g3.public_key().to_string(),
        ];
        let unique: std::collections::HashSet<&String> = keys.iter().collect();
        assert!(unique.len() >= 2);
        assert_eq!(pool.total_in_flight(), 3);
    }

    #[test]
    fn test_acquire_empty_pool_errors() {
        let pool = make_test_pool(0);
        assert!(pool.acquire(&test_contract()).is_err());
    }

    #[test]
    fn test_acquire_skips_non_active_slots() {
        let pool = make_test_pool(3);
        {
            let slots = pool.read_slots();
            slots[0].state.store(slot::DRAINING, Ordering::Relaxed);
            slots[1].state.store(slot::DRAINING, Ordering::Relaxed);
        }
        let guard = pool.acquire(&test_contract()).unwrap();
        assert_eq!(pool.active_count(), 1);
        assert_eq!(pool.total_in_flight(), 1);
        drop(guard);
    }

    #[test]
    fn test_acquire_all_draining_errors() {
        let pool = make_test_pool(2);
        {
            let slots = pool.read_slots();
            for s in slots.iter() {
                s.state.store(slot::DRAINING, Ordering::Relaxed);
            }
        }
        assert!(pool.acquire(&test_contract()).is_err());
    }

    #[test]
    fn test_guard_drops_release_in_flight() {
        let pool = make_test_pool(2);
        let c = test_contract();
        {
            let _g1 = pool.acquire(&c).unwrap();
            let _g2 = pool.acquire(&c).unwrap();
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
    fn test_per_key_load_no_traffic() {
        let pool = make_test_pool(5);
        assert_eq!(pool.per_key_load(), 0.0);
    }

    #[test]
    fn test_per_key_load_with_traffic() {
        let pool = make_test_pool(2);
        let _g1 = pool.acquire(&test_contract()).unwrap();
        assert!((pool.per_key_load() - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_per_key_load_empty_pool_forces_scale_up() {
        let pool = make_test_pool(0);
        assert_eq!(pool.per_key_load(), f32::MAX);
    }

    #[test]
    fn test_per_key_load_high_traffic() {
        let pool = make_test_pool(2);
        {
            let slots = pool.read_slots();
            slots[0].in_flight.store(12, Ordering::Relaxed);
            slots[1].in_flight.store(8, Ordering::Relaxed);
        }
        assert!((pool.per_key_load() - 10.0).abs() < 0.01);
    }

    // --- Per-contract diagnostics ---

    #[test]
    fn test_active_count_for_filters_by_contract() {
        let pool = make_test_pool(3);
        let core = test_contract();
        assert_eq!(pool.active_count_for(&core), 3);

        let other: AccountId = "scarces.testnet".parse().unwrap();
        assert_eq!(pool.active_count_for(&other), 0);
    }

    #[test]
    fn test_per_key_load_for_no_keys_returns_max() {
        let pool = make_test_pool(2);
        let other: AccountId = "scarces.testnet".parse().unwrap();
        assert_eq!(pool.per_key_load_for(&other), f32::MAX);
    }

    #[test]
    fn test_per_key_load_for_with_traffic() {
        let pool = make_test_pool(2);
        let _g1 = pool.acquire(&test_contract()).unwrap();
        assert!((pool.per_key_load_for(&test_contract()) - 0.5).abs() < 0.01);
    }
}
