//! Key pools for contract-scoped FunctionCall keys and NEP-366 delegate signers.

mod bootstrap;
mod rotation;
mod scaling;
mod slot;

pub use bootstrap::bootstrap_pool_from_chain;
pub use slot::{KeyGuard, KeySlot};

use crate::config::ScalingConfig;
use crate::key_store::KeyStore;
use crate::signer::RelayerSigner;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::Action;
use near_primitives::types::AccountId;
use near_primitives::views::{AccessKeyPermissionView, FinalExecutionOutcomeView};
use slot::{now_secs, ACTIVE, DRAINING, WARMUP};
#[cfg(feature = "gcp")]
use std::sync::atomic::AtomicU32;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;
use tracing::info;

#[cfg(feature = "gcp")]
pub struct KmsContext {
    pub client: Arc<crate::kms::KmsClient>,
    pub project: String,
    pub location: String,
    pub keyring: String,
    pub delegate_key_prefix: String,
    pub next_index: AtomicU32,
    pub next_delegate_index: AtomicU32,
}

/// Constructor bundle for [`KeyPool`].
pub struct PoolConfig {
    pub account_id: AccountId,
    pub allowed_contracts: Vec<AccountId>,
    pub admin_signer: RelayerSigner,
    pub scaling: ScalingConfig,
    pub store: KeyStore,
    pub allowed_methods: Vec<String>,
}

pub enum FullAccessTxOutcome {
    Committed(Box<FinalExecutionOutcomeView>),
    Submitted(CryptoHash),
}

pub struct KeyPool {
    pub(crate) account_id: AccountId,
    pub(crate) allowed_contracts: Vec<AccountId>,
    pub(crate) admin_signer: RelayerSigner,
    pub(crate) slots: std::sync::RwLock<Vec<Arc<KeySlot>>>,
    pub(crate) delegate_slots: std::sync::RwLock<Vec<Arc<KeySlot>>>,
    next: AtomicU64,
    delegate_next: AtomicU64,
    pub(crate) config: ScalingConfig,
    pub(crate) store: KeyStore,
    pub(crate) last_scale_event: AtomicU64,
    pub(crate) allowed_methods: Vec<String>,
    /// Serializes AddKey/DeleteKey to prevent admin nonce races.
    pub(crate) admin_tx_lock: AsyncMutex<()>,
    #[cfg(feature = "gcp")]
    pub(crate) kms: Option<KmsContext>,
}

impl KeyPool {
    pub fn new(
        pool_config: PoolConfig,
        initial_signers: Vec<(RelayerSigner, u64, AccountId)>,
        delegate_signers: Vec<(RelayerSigner, u64)>,
    ) -> Self {
        let slots: Vec<Arc<KeySlot>> = initial_signers
            .into_iter()
            .map(|(signer, nonce, target)| {
                let slot = KeySlot::new(signer, nonce, target);
                slot.state.store(ACTIVE, Ordering::Relaxed);
                Arc::new(slot)
            })
            .collect();

        let delegate_target = pool_config.account_id.clone();
        let delegate_slots: Vec<Arc<KeySlot>> = delegate_signers
            .into_iter()
            .map(|(signer, nonce)| {
                let slot = KeySlot::new(signer, nonce, delegate_target.clone());
                slot.state.store(ACTIVE, Ordering::Relaxed);
                Arc::new(slot)
            })
            .collect();

        info!(
            active_keys = slots.len(),
            delegate_keys = delegate_slots.len(),
            account = %pool_config.account_id,
            contracts = ?pool_config.allowed_contracts,
            "Key pool initialized"
        );

        Self {
            account_id: pool_config.account_id,
            allowed_contracts: pool_config.allowed_contracts,
            admin_signer: pool_config.admin_signer,
            slots: std::sync::RwLock::new(slots),
            delegate_slots: std::sync::RwLock::new(delegate_slots),
            next: AtomicU64::new(0),
            delegate_next: AtomicU64::new(0),
            config: pool_config.scaling,
            store: pool_config.store,
            last_scale_event: AtomicU64::new(0),
            allowed_methods: pool_config.allowed_methods,
            admin_tx_lock: AsyncMutex::new(()),
            #[cfg(feature = "gcp")]
            kms: None,
        }
    }

    #[cfg(feature = "gcp")]
    pub fn with_kms(mut self, kms: KmsContext) -> Self {
        self.kms = Some(kms);
        self
    }

    /// Add HSM-backed signers as WARMUP; `ensure_contracts_covered` registers and promotes them.
    pub fn with_unregistered(
        self,
        signers: Vec<(RelayerSigner, u64, near_primitives::types::AccountId)>,
    ) -> Self {
        if signers.is_empty() {
            return self;
        }
        let count = signers.len();
        {
            let mut slots = self.write_slots();
            for (signer, nonce, target) in signers {
                let slot = KeySlot::new(signer, nonce, target);
                slots.push(Arc::new(slot));
            }
        }
        info!(
            warmup_added = count,
            "Added unregistered KMS keys as WARMUP slots"
        );
        self
    }

    pub(crate) fn is_kms_mode(&self) -> bool {
        #[cfg(feature = "gcp")]
        {
            self.kms.is_some()
        }
        #[cfg(not(feature = "gcp"))]
        {
            false
        }
    }

    pub(crate) fn read_slots(&self) -> std::sync::RwLockReadGuard<'_, Vec<Arc<KeySlot>>> {
        self.slots.read().unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn write_slots(&self) -> std::sync::RwLockWriteGuard<'_, Vec<Arc<KeySlot>>> {
        self.slots.write().unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn read_delegate_slots(&self) -> std::sync::RwLockReadGuard<'_, Vec<Arc<KeySlot>>> {
        self.delegate_slots
            .read()
            .unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn write_delegate_slots(
        &self,
    ) -> std::sync::RwLockWriteGuard<'_, Vec<Arc<KeySlot>>> {
        self.delegate_slots
            .write()
            .unwrap_or_else(|e| e.into_inner())
    }

    /// Lock-free round-robin acquire. Nonce incremented atomically (SeqCst).
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

    /// Round-robin acquire of ANY active key, regardless of which
    /// `target_contract` it was provisioned for. Used by the NEP-366
    /// delegate path where the OUTER receiver is the user's account
    /// (not a contract from the allowlist), so contract-affinity does
    /// not apply. Nonce is still incremented per slot.
    pub fn acquire_any(&self) -> Result<KeyGuard, crate::Error> {
        let slots = self.read_slots();
        let len = slots.len();
        if len == 0 {
            return Err(crate::Error::KeyPool("No keys in pool".into()));
        }

        let start = self.next.fetch_add(1, Ordering::Relaxed) as usize;
        for i in 0..len {
            let idx = (start + i) % len;
            let slot = &slots[idx];
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

        Err(crate::Error::KeyPool("No active keys in pool".into()))
    }

    /// Round-robin acquire from the full-access NEP-366 delegate signer pool.
    pub fn acquire_delegate(&self) -> Result<KeyGuard, crate::Error> {
        let slots = self.read_delegate_slots();
        let len = slots.len();
        if len == 0 {
            return Err(crate::Error::KeyPool(
                "No full-access delegate signers in pool".into(),
            ));
        }

        let start = self.delegate_next.fetch_add(1, Ordering::Relaxed) as usize;
        for i in 0..len {
            let idx = (start + i) % len;
            let slot = &slots[idx];
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

        Err(crate::Error::KeyPool(
            "No active full-access delegate signers in pool".into(),
        ))
    }

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

    pub fn total_in_flight(&self) -> u32 {
        self.read_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE)
            .map(|s| s.in_flight.load(Ordering::Relaxed))
            .sum()
    }

    /// Returns `f32::MAX` when pool is empty (forces scale-up).
    pub fn per_key_load(&self) -> f32 {
        let active = self.active_count();
        if active == 0 {
            return f32::MAX;
        }
        self.total_in_flight() as f32 / active as f32
    }

    pub fn active_delegate_count(&self) -> usize {
        self.read_delegate_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE)
            .count()
    }

    pub fn delegate_total_in_flight(&self) -> u32 {
        self.read_delegate_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE)
            .map(|s| s.in_flight.load(Ordering::Relaxed))
            .sum()
    }

    pub fn delegate_per_key_load(&self) -> f32 {
        let active = self.active_delegate_count();
        if active == 0 {
            return f32::MAX;
        }
        self.delegate_total_in_flight() as f32 / active as f32
    }

    pub fn active_count_for(&self, contract: &AccountId) -> usize {
        self.read_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE && s.target_contract == *contract)
            .count()
    }

    pub fn in_flight_for(&self, contract: &AccountId) -> u32 {
        self.read_slots()
            .iter()
            .filter(|s| s.state.load(Ordering::Relaxed) == ACTIVE && s.target_contract == *contract)
            .map(|s| s.in_flight.load(Ordering::Relaxed))
            .sum()
    }

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

    /// Sign and submit a NEP-366 outer transaction using a full-access delegate lane.
    pub async fn submit_delegate_transaction(
        &self,
        rpc: &crate::rpc::RpcClient,
        receiver_id: &AccountId,
        actions: Vec<Action>,
        wait: bool,
    ) -> Result<FullAccessTxOutcome, crate::Error> {
        let key_guard = self.acquire_delegate()?;
        let _submit_guard = key_guard.lock_submit().await;

        let block_hash = rpc.latest_block_hash().await?;
        let signed_tx = key_guard
            .signer()
            .sign_transaction(key_guard.nonce, receiver_id, block_hash, actions)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("Delegate TX signing failed: {e}")))?;

        if wait {
            rpc.send_signed_tx(signed_tx)
                .await
                .map(Box::new)
                .map(FullAccessTxOutcome::Committed)
        } else {
            rpc.send_tx_async(signed_tx)
                .await
                .map(FullAccessTxOutcome::Submitted)
        }
    }

    /// Sign and submit a transaction with the relayer's full-access admin key.
    /// NEP-366 outer `Action::Delegate` transactions are not FunctionCall
    /// actions, so contract-scoped function-call pool keys cannot authorize them.
    pub async fn submit_full_access_transaction(
        &self,
        rpc: &crate::rpc::RpcClient,
        receiver_id: &AccountId,
        actions: Vec<Action>,
        wait: bool,
    ) -> Result<FullAccessTxOutcome, crate::Error> {
        let _admin_guard = self.admin_tx_lock.lock().await;

        let admin_public_key = self.admin_signer.public_key();
        let admin_ak = rpc
            .query_access_key(&self.account_id, &admin_public_key)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("admin access_key query: {e}")))?;

        if !matches!(&admin_ak.permission, AccessKeyPermissionView::FullAccess) {
            return Err(crate::Error::Config(
                "NEP-366 delegate relay requires the relayer admin signer to be a FullAccess key"
                    .into(),
            ));
        }

        let block_hash = rpc.latest_block_hash().await?;
        let signed_tx = self
            .admin_signer
            .sign_transaction(admin_ak.nonce + 1, receiver_id, block_hash, actions)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("Admin TX signing failed: {e}")))?;

        if wait {
            rpc.send_signed_tx(signed_tx)
                .await
                .map(Box::new)
                .map(FullAccessTxOutcome::Committed)
        } else {
            rpc.send_tx_async(signed_tx)
                .await
                .map(FullAccessTxOutcome::Submitted)
        }
    }

    /// Guarantee: every contract has ≥ `min_keys / N` active keys after return.
    /// KMS mode promotes WARMUP→ACTIVE; local mode provisions new keys on-chain.
    pub async fn ensure_contracts_covered(
        &self,
        rpc: &crate::rpc::RpcClient,
    ) -> Result<(), crate::Error> {
        let num = self.allowed_contracts.len().max(1) as u32;
        let need = (self.config.min_keys / num).max(1) as usize;

        for target in &self.allowed_contracts {
            let mut have = self.active_count_for(target);
            if have >= need {
                continue;
            }

            let warm_for = self.warm_count_for(target);
            if warm_for > 0 {
                let to_register = ((need - have) as u32).min(warm_for as u32);
                let registered = self
                    .register_and_promote_warm(rpc, target, to_register)
                    .await?;
                have += registered;
                if registered > 0 {
                    tracing::info!(
                        contract = %target, registered, have, need,
                        "Bootstrap: registered and promoted warm keys"
                    );
                }
            }

            if have >= need {
                continue;
            }

            let deficit = (need - have) as u32;

            // Legacy FunctionCall pool path. The active NEP-366 endpoint uses
            // the delegate signer pool provisioned by `ensure_delegate_pool`.
            if self.is_kms_mode() {
                tracing::error!(
                    contract = %target, have, need, deficit,
                    "CRITICAL: KMS pool under-provisioned after promoting all warm keys. \
                     Legacy FunctionCall pool keys are unavailable; use `/execute_delegate` \
                     with the FullAccess delegate signer pool."
                );
                continue;
            }

            tracing::info!(
                contract = %target, have, need, adding = deficit,
                "Bootstrap: provisioning keys for under-covered contract"
            );
            self.scale_up_for_contract(rpc, deficit, target).await?;
        }
        Ok(())
    }

    pub fn warm_count_for(&self, contract: &AccountId) -> usize {
        self.read_slots()
            .iter()
            .filter(|s| {
                s.state.load(std::sync::atomic::Ordering::Relaxed) == WARMUP
                    && s.target_contract == *contract
            })
            .count()
    }

    /// AddKey on-chain for WARMUP slots, sync nonces, promote to ACTIVE.
    async fn register_and_promote_warm(
        &self,
        rpc: &crate::rpc::RpcClient,
        target: &AccountId,
        max: u32,
    ) -> Result<usize, crate::Error> {
        let mut to_register: Vec<near_crypto::PublicKey> = Vec::new();
        for slot in self.read_slots().iter() {
            if to_register.len() as u32 >= max {
                break;
            }
            if slot.state.load(std::sync::atomic::Ordering::Relaxed) == WARMUP
                && slot.target_contract == *target
            {
                to_register.push(slot.signer.public_key());
            }
        }

        if to_register.is_empty() {
            return Ok(0);
        }

        // Idempotent: NEAR returns "already exists" for duplicates.
        self.register_keys_on_chain(rpc, &to_register, target)
            .await?;

        let matching_slots: Vec<Arc<KeySlot>> = self
            .read_slots()
            .iter()
            .filter(|slot| {
                slot.state.load(std::sync::atomic::Ordering::Relaxed) == WARMUP
                    && slot.target_contract == *target
                    && to_register.contains(&slot.signer.public_key())
            })
            .cloned()
            .collect();

        let mut promoted = 0;
        for slot in &matching_slots {
            match rpc
                .query_access_key(&self.account_id, &slot.signer.public_key())
                .await
            {
                Ok(ak) => {
                    slot.nonce
                        .store(ak.nonce, std::sync::atomic::Ordering::Relaxed);
                }
                Err(e) => {
                    tracing::warn!(
                        key = %slot.signer.public_key(),
                        error = %e,
                        "Nonce sync failed for registered key — will re-sync on first use"
                    );
                }
            }
            slot.state
                .store(ACTIVE, std::sync::atomic::Ordering::Relaxed);
            promoted += 1;
        }

        Ok(promoted)
    }
}

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
            Vec::new(),
        )
    }

    pub(crate) fn make_test_pool_with_delegate_keys(n: u8) -> KeyPool {
        let pool = make_test_pool(0);
        for i in 1..=n {
            let signer = make_test_signer(i);
            let slot = KeySlot::new(signer, 2000 + i as u64, pool.relayer_account().clone());
            slot.state.store(slot::ACTIVE, Ordering::Relaxed);
            pool.write_delegate_slots().push(Arc::new(slot));
        }
        pool
    }

    pub(crate) fn dummy_rpc() -> RpcClient {
        RpcClient::new("http://127.0.0.1:1", "http://127.0.0.1:2")
    }

    pub(crate) fn test_contract() -> AccountId {
        "core.testnet".parse().unwrap()
    }

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

    #[test]
    fn test_acquire_delegate_round_robin() {
        let pool = make_test_pool_with_delegate_keys(3);
        let g1 = pool.acquire_delegate().unwrap();
        let g2 = pool.acquire_delegate().unwrap();
        let g3 = pool.acquire_delegate().unwrap();
        let keys: Vec<String> = vec![
            g1.public_key().to_string(),
            g2.public_key().to_string(),
            g3.public_key().to_string(),
        ];
        let unique: std::collections::HashSet<&String> = keys.iter().collect();
        assert_eq!(unique.len(), 3);
        assert_eq!(pool.delegate_total_in_flight(), 3);
    }

    #[test]
    fn test_acquire_delegate_empty_pool_errors() {
        let pool = make_test_pool(0);
        assert!(pool.acquire_delegate().is_err());
    }
}
