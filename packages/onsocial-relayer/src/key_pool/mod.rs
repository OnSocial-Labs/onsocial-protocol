//! FullAccess signer lanes for NEP-366 delegate and rewards relay.

mod bootstrap;
mod scaling;
mod slot;

pub use bootstrap::bootstrap_pool_from_chain;
pub use slot::{KeyGuard, KeySlot};

use crate::key_store::KeyStore;
use crate::signer::RelayerSigner;
use near_crypto::Signer;
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::{Action, SignedTransaction};
use near_primitives::types::AccountId;
use near_primitives::views::{AccessKeyPermissionView, FinalExecutionOutcomeView};
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
    pub next_delegate_index: AtomicU32,
}

/// Constructor bundle for [`KeyPool`].
pub struct PoolConfig {
    pub account_id: AccountId,
    pub admin_signer: RelayerSigner,
    pub store: KeyStore,
}

pub enum FullAccessTxOutcome {
    Committed(Box<FinalExecutionOutcomeView>),
    Submitted(CryptoHash),
}

pub struct KeyPool {
    pub(crate) account_id: AccountId,
    pub(crate) admin_signer: RelayerSigner,
    pub(crate) delegate_slots: std::sync::RwLock<Vec<Arc<KeySlot>>>,
    delegate_next: AtomicU64,
    pub(crate) store: KeyStore,
    /// Serializes AddKey transactions to prevent admin nonce races.
    pub(crate) admin_tx_lock: AsyncMutex<()>,
    #[cfg(feature = "gcp")]
    pub(crate) kms: Option<KmsContext>,
}

impl KeyPool {
    pub fn new(pool_config: PoolConfig, delegate_signers: Vec<(RelayerSigner, u64)>) -> Self {
        let delegate_slots: Vec<Arc<KeySlot>> = delegate_signers
            .into_iter()
            .map(|(signer, nonce)| Arc::new(KeySlot::new(signer, nonce)))
            .collect();

        info!(
            delegate_keys = delegate_slots.len(),
            account = %pool_config.account_id,
            "Delegate signer pool initialized"
        );

        Self {
            account_id: pool_config.account_id,
            admin_signer: pool_config.admin_signer,
            delegate_slots: std::sync::RwLock::new(delegate_slots),
            delegate_next: AtomicU64::new(0),
            store: pool_config.store,
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

    /// Round-robin acquire from the FullAccess delegate signer pool.
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

    pub fn active_delegate_count(&self) -> usize {
        self.read_delegate_slots()
            .iter()
            .filter(|slot| slot.is_active())
            .count()
    }

    pub fn delegate_total_in_flight(&self) -> u32 {
        self.read_delegate_slots()
            .iter()
            .filter(|slot| slot.is_active())
            .map(|slot| slot.in_flight.load(Ordering::Relaxed))
            .sum()
    }

    pub fn delegate_per_key_load(&self) -> f32 {
        let active = self.active_delegate_count();
        if active == 0 {
            return f32::MAX;
        }
        self.delegate_total_in_flight() as f32 / active as f32
    }

    pub fn relayer_account(&self) -> &AccountId {
        &self.account_id
    }

    /// Sign and submit a transaction using a FullAccess delegate lane.
    pub async fn submit_delegate_transaction(
        &self,
        rpc: &crate::rpc::RpcClient,
        receiver_id: &AccountId,
        actions: Vec<Action>,
        wait: bool,
    ) -> Result<FullAccessTxOutcome, crate::Error> {
        let key_guard = self.acquire_delegate()?;
        let _submit_guard = key_guard.lock_submit().await;

        let signed_tx = self
            .sign_delegate_tx(
                &key_guard,
                rpc,
                receiver_id,
                actions.clone(),
                key_guard.nonce,
            )
            .await?;

        match Self::submit_signed_delegate_tx(rpc, signed_tx, wait).await {
            Ok(outcome) => Ok(outcome),
            Err(error) if Self::is_nonce_error(&error) => {
                tracing::warn!(
                    key = %key_guard.public_key(),
                    error = %error,
                    "Delegate signer nonce drift detected; resyncing and retrying once"
                );
                let public_key = key_guard.public_key();
                let access_key = rpc.query_access_key(&self.account_id, &public_key).await?;
                if !matches!(&access_key.permission, AccessKeyPermissionView::FullAccess) {
                    return Err(crate::Error::Config(
                        "delegate signer key is no longer FullAccess".into(),
                    ));
                }

                let retry_nonce = access_key.nonce + 1;
                key_guard.slot.nonce.store(retry_nonce, Ordering::SeqCst);
                let retry_tx = self
                    .sign_delegate_tx(&key_guard, rpc, receiver_id, actions, retry_nonce)
                    .await?;
                Self::submit_signed_delegate_tx(rpc, retry_tx, wait).await
            }
            Err(error) => Err(error),
        }
    }

    async fn sign_delegate_tx(
        &self,
        key_guard: &KeyGuard,
        rpc: &crate::rpc::RpcClient,
        receiver_id: &AccountId,
        actions: Vec<Action>,
        nonce: u64,
    ) -> Result<SignedTransaction, crate::Error> {
        let block_hash = rpc.latest_block_hash().await?;
        key_guard
            .signer()
            .sign_transaction(nonce, receiver_id, block_hash, actions)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("Delegate TX signing failed: {e}")))
    }

    async fn submit_signed_delegate_tx(
        rpc: &crate::rpc::RpcClient,
        signed_tx: SignedTransaction,
        wait: bool,
    ) -> Result<FullAccessTxOutcome, crate::Error> {
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

    fn is_nonce_error(error: &crate::Error) -> bool {
        let message = error.to_string();
        message.contains("InvalidNonce") || message.contains("nonce")
    }

    /// Persist local delegate keys to the configured store. Skipped for KMS keys.
    pub(crate) fn persist_keys(&self) -> Result<(), crate::Error> {
        let admin_public_key = self.admin_signer.public_key().to_string();
        let mut seen = std::collections::HashSet::new();
        let mut keys: Vec<(String, String)> = Vec::new();

        for slot in self.read_delegate_slots().iter() {
            if let Some(Signer::InMemory(ims)) = slot.signer.as_local_signer() {
                let public_key = ims.public_key.to_string();
                if slot.is_active()
                    && public_key != admin_public_key
                    && seen.insert(public_key.clone())
                {
                    keys.push((public_key, ims.secret_key.to_string()));
                }
            }
        }

        self.store.save(&self.account_id, &keys)
    }

    pub fn persist_keys_public(&self) -> Result<(), crate::Error> {
        self.persist_keys()
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::key_store::KeyStore;
    use crate::signer::RelayerSigner;
    use near_crypto::KeyType;

    pub(crate) fn make_test_signer(n: u8) -> RelayerSigner {
        let secret = near_crypto::SecretKey::from_random(KeyType::ED25519);
        let signer = near_crypto::InMemorySigner::from_secret_key(
            format!("relayer{n}.testnet").parse().unwrap(),
            secret,
        );
        RelayerSigner::Local { signer }
    }

    pub(crate) fn make_empty_test_pool() -> KeyPool {
        let admin_secret = near_crypto::SecretKey::from_random(KeyType::ED25519);
        let admin_signer = near_crypto::InMemorySigner::from_secret_key(
            "relayer.testnet".parse().unwrap(),
            admin_secret,
        );
        let admin = RelayerSigner::Local {
            signer: admin_signer,
        };
        let store = KeyStore::new_plaintext("/tmp/test_delegate_keypool".into());
        KeyPool::new(
            PoolConfig {
                account_id: "relayer.testnet".parse().unwrap(),
                admin_signer: admin,
                store,
            },
            Vec::new(),
        )
    }

    pub(crate) fn make_test_pool_with_delegate_keys(n: u8) -> KeyPool {
        let pool = make_empty_test_pool();
        for i in 1..=n {
            let signer = make_test_signer(i);
            let slot = KeySlot::new(signer, 2000 + i as u64);
            pool.write_delegate_slots().push(Arc::new(slot));
        }
        pool
    }

    #[test]
    fn test_acquire_delegate_returns_guard() {
        let pool = make_test_pool_with_delegate_keys(3);
        let guard = pool.acquire_delegate().unwrap();
        assert!(guard.nonce > 0);
        assert_eq!(pool.delegate_total_in_flight(), 1);
        drop(guard);
        assert_eq!(pool.delegate_total_in_flight(), 0);
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
        assert!(unique.len() >= 2);
        assert_eq!(pool.delegate_total_in_flight(), 3);
    }

    #[test]
    fn test_acquire_delegate_empty_pool_errors() {
        let pool = make_empty_test_pool();
        assert!(pool.acquire_delegate().is_err());
    }

    #[test]
    fn test_acquire_delegate_skips_inactive_slots() {
        let pool = make_test_pool_with_delegate_keys(3);
        {
            let slots = pool.read_delegate_slots();
            slots[0].state.store(0, Ordering::Relaxed);
            slots[1].state.store(0, Ordering::Relaxed);
        }
        let guard = pool.acquire_delegate().unwrap();
        assert_eq!(pool.active_delegate_count(), 1);
        assert_eq!(pool.delegate_total_in_flight(), 1);
        drop(guard);
    }

    #[test]
    fn test_acquire_delegate_all_inactive_errors() {
        let pool = make_test_pool_with_delegate_keys(2);
        {
            let slots = pool.read_delegate_slots();
            for slot in slots.iter() {
                slot.state.store(0, Ordering::Relaxed);
            }
        }
        assert!(pool.acquire_delegate().is_err());
    }

    #[test]
    fn test_guard_drops_release_delegate_in_flight() {
        let pool = make_test_pool_with_delegate_keys(2);
        {
            let _g1 = pool.acquire_delegate().unwrap();
            let _g2 = pool.acquire_delegate().unwrap();
            assert_eq!(pool.delegate_total_in_flight(), 2);
        }
        assert_eq!(pool.delegate_total_in_flight(), 0);
    }

    #[test]
    fn test_delegate_per_key_load() {
        let pool = make_test_pool_with_delegate_keys(2);
        let _guard = pool.acquire_delegate().unwrap();
        assert!((pool.delegate_per_key_load() - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_empty_delegate_load_is_max() {
        let pool = make_empty_test_pool();
        assert_eq!(pool.delegate_per_key_load(), f32::MAX);
    }

    #[test]
    fn test_relayer_account() {
        let pool = make_empty_test_pool();
        assert_eq!(pool.relayer_account().as_str(), "relayer.testnet");
    }
}
