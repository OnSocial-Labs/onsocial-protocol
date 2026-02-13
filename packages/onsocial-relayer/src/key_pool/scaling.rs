//! Scale-up and scale-down operations for the key pool.

use super::slot::{now_secs, KeySlot, ACTIVE, DRAINING, WARMUP};
use super::KeyPool;
use crate::rpc::RpcClient;
use crate::signer::RelayerSigner;
use near_crypto::{PublicKey, SecretKey, Signer};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

impl KeyPool {
    /// Scale up: create N keys and register on-chain.
    /// KMS mode creates keys in Cloud KMS HSM; local mode generates in-memory.
    pub async fn scale_up(&self, rpc: &RpcClient, count: u32) -> Result<(), crate::Error> {
        #[cfg(feature = "gcp")]
        if let Some(ref kms) = self.kms {
            return self.scale_up_kms(rpc, kms, count).await;
        }

        self.scale_up_local(rpc, count).await
    }

    /// Scale up with locally generated keys (non-KMS).
    pub async fn scale_up_local(&self, rpc: &RpcClient, count: u32) -> Result<(), crate::Error> {
        let mut new_keys: Vec<(SecretKey, PublicKey)> = Vec::with_capacity(count as usize);

        for _ in 0..count {
            let secret_key = SecretKey::from_random(near_crypto::KeyType::ED25519);
            let public_key = secret_key.public_key();
            new_keys.push((secret_key, public_key));
        }

        let public_keys: Vec<PublicKey> = new_keys.iter().map(|(_, pk)| pk.clone()).collect();
        self.register_keys_on_chain(rpc, &public_keys).await?;

        info!(count, mode = "local", "AddKey batch submitted");

        // Sync nonces (retry briefly — RPC may lag after AddKey)
        for (secret_key, public_key) in &new_keys {
            let mut nonce = None;
            for attempt in 0..3 {
                match rpc.query_access_key(&self.account_id, public_key).await {
                    Ok(ak) => {
                        nonce = Some(ak.nonce);
                        break;
                    }
                    Err(e) => {
                        if attempt < 2 {
                            tokio::time::sleep(Duration::from_millis(500)).await;
                        } else {
                            warn!(key = %public_key, error = %e, "Key added on-chain but nonce sync failed — will retry next tick");
                        }
                    }
                }
            }
            if let Some(n) = nonce {
                let signer = near_crypto::InMemorySigner::from_secret_key(
                    self.account_id.clone(),
                    secret_key.clone(),
                );
                let relayer_signer = RelayerSigner::Local { signer };
                let slot = KeySlot::new(relayer_signer, n);
                slot.state.store(ACTIVE, Ordering::Relaxed);
                self.write_slots().push(Arc::new(slot));
                info!(key = %public_key, nonce = n, "New local key added to pool");
            } else {
                let signer = near_crypto::InMemorySigner::from_secret_key(
                    self.account_id.clone(),
                    secret_key.clone(),
                );
                let relayer_signer = RelayerSigner::Local { signer };
                let slot = KeySlot::new(relayer_signer, 0);
                slot.state.store(ACTIVE, Ordering::Relaxed);
                self.write_slots().push(Arc::new(slot));
                warn!(key = %public_key, "Key added with nonce=0, will re-sync on first use");
            }
        }

        if let Err(e) = self.persist_keys() {
            warn!(error = %e, "Failed to persist key store after scale-up");
        }

        Ok(())
    }

    #[cfg(feature = "gcp")]
    async fn scale_up_kms(
        &self,
        rpc: &RpcClient,
        kms: &super::KmsContext,
        count: u32,
    ) -> Result<(), crate::Error> {
        use crate::signer::RelayerSigner;

        let base_idx = kms.next_index.fetch_add(count, Ordering::Relaxed);
        let key_ids: Vec<String> = (base_idx..base_idx + count)
            .map(|idx| format!("pool-key-{idx}"))
            .collect();

        let mut handles = tokio::task::JoinSet::new();
        for key_id in &key_ids {
            let client = Arc::clone(&kms.client);
            let project = kms.project.clone();
            let location = kms.location.clone();
            let keyring = kms.keyring.clone();
            let kid = key_id.clone();
            let account_id = self.account_id.clone();
            handles.spawn(async move {
                let key_ref = client
                    .create_key(&project, &location, &keyring, &kid, &account_id)
                    .await
                    .map_err(|e| crate::Error::KeyPool(format!("KMS create_key({kid}): {e}")))?;
                info!(key_id = kid, public_key = %key_ref.public_key, "Created KMS key");
                Ok::<_, crate::Error>(key_ref)
            });
        }

        let mut key_refs = Vec::with_capacity(count as usize);
        while let Some(result) = handles.join_next().await {
            let key_ref =
                result.map_err(|e| crate::Error::KeyPool(format!("KMS task panicked: {e}")))??;
            key_refs.push(key_ref);
        }

        let public_keys: Vec<PublicKey> = key_refs.iter().map(|kr| kr.public_key.clone()).collect();
        self.register_keys_on_chain(rpc, &public_keys).await?;

        info!(count, mode = "kms", "AddKey batch submitted");

        let mut nonce_handles = tokio::task::JoinSet::new();
        for key_ref in key_refs {
            let account_id = self.account_id.clone();
            let pk = key_ref.public_key.clone();
            let rpc_url = rpc.primary_url().to_string();
            let fallback_url = rpc.fallback_url().to_string();
            nonce_handles.spawn(async move {
                let rpc = RpcClient::new(&rpc_url, &fallback_url);
                let nonce = match rpc.query_access_key(&account_id, &pk).await {
                    Ok(ak) => Some(ak.nonce),
                    Err(e) => {
                        warn!(key = %pk, error = %e, "KMS key registered but nonce sync failed");
                        None
                    }
                };
                (key_ref, pk, nonce)
            });
        }

        while let Some(result) = nonce_handles.join_next().await {
            match result {
                Ok((key_ref, pk, nonce_opt)) => {
                    let n = nonce_opt.unwrap_or(0);
                    let signer = RelayerSigner::Kms {
                        key_ref,
                        client: Arc::clone(&kms.client),
                    };
                    let slot = KeySlot::new(signer, n);
                    slot.state.store(ACTIVE, Ordering::Relaxed);
                    self.write_slots().push(Arc::new(slot));
                    if nonce_opt.is_some() {
                        info!(key = %pk, nonce = n, "New KMS key added to pool");
                    } else {
                        warn!(key = %pk, "KMS key added with nonce=0, will re-sync on first use");
                    }
                }
                Err(e) => {
                    warn!(error = %e, "KMS nonce sync task panicked");
                }
            }
        }

        Ok(())
    }

    /// Batch AddKey via admin signer. Holds `admin_tx_lock` to prevent nonce races.
    pub(crate) async fn register_keys_on_chain(
        &self,
        rpc: &RpcClient,
        public_keys: &[PublicKey],
    ) -> Result<(), crate::Error> {
        let _admin_guard = self.admin_tx_lock.lock().await;

        let actions: Vec<near_primitives::transaction::Action> = public_keys
            .iter()
            .map(|pk| {
                near_primitives::transaction::AddKeyAction {
                    public_key: pk.clone(),
                    access_key: near_primitives::account::AccessKey {
                        nonce: 0,
                        permission: near_primitives::account::AccessKeyPermission::FunctionCall(
                            near_primitives::account::FunctionCallPermission {
                                allowance: None,
                                receiver_id: self.contract_id.to_string(),
                                method_names: self.allowed_methods.clone(),
                            },
                        ),
                    },
                }
                .into()
            })
            .collect();

        let admin_ak = rpc
            .query_access_key(&self.account_id, &self.admin_signer.public_key())
            .await
            .map_err(|e| crate::Error::KeyPool(format!("admin access_key query: {e}")))?;
        let block_hash = rpc.latest_block_hash().await?;

        let signed_tx = self
            .admin_signer
            .sign_transaction(admin_ak.nonce + 1, &self.account_id, block_hash, actions)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("Admin TX signing failed: {e}")))?;

        rpc.send_signed_tx(signed_tx)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("AddKey batch failed: {e}")))?;

        Ok(())
    }

    /// Scale down: drain N idle keys, then batch DeleteKey.
    pub async fn scale_down(&self, rpc: &RpcClient, count: u32) -> Result<(), crate::Error> {
        let mut to_delete: Vec<PublicKey> = Vec::new();
        let now = now_secs();
        let mut removed = 0u32;

        for slot in self.read_slots().iter().rev() {
            if removed >= count {
                break;
            }
            let st = slot.state.load(Ordering::Relaxed);
            if st != ACTIVE {
                continue;
            }
            let last_used = slot.last_used.load(Ordering::Relaxed);
            let last_activity = last_used.max(slot.created_at);
            if now.saturating_sub(last_activity) < self.config.scale_down_idle.as_secs() {
                continue;
            }
            if slot.in_flight.load(Ordering::Relaxed) > 0 {
                continue;
            }
            slot.state.store(DRAINING, Ordering::Relaxed);
            to_delete.push(slot.signer.public_key());
            removed += 1;
        }

        if to_delete.is_empty() {
            return Ok(());
        }

        if let Err(e) = self.submit_delete_keys(rpc, &to_delete).await {
            warn!(error = %e, "DeleteKey batch failed, reverting drain");
            for slot in self.read_slots().iter() {
                if slot.state.load(Ordering::Relaxed) == DRAINING
                    && to_delete.contains(&slot.signer.public_key())
                {
                    slot.state.store(ACTIVE, Ordering::Relaxed);
                }
            }
            return Err(e);
        }

        info!(count = removed, "DeleteKey batch submitted");

        if let Err(e) = self.persist_keys() {
            warn!(error = %e, "Failed to persist key store after scale-down");
        }

        Ok(())
    }

    /// Batch DeleteKey via admin signer. Holds `admin_tx_lock` to prevent nonce races.
    pub(crate) async fn submit_delete_keys(
        &self,
        rpc: &RpcClient,
        to_delete: &[PublicKey],
    ) -> Result<(), crate::Error> {
        let _admin_guard = self.admin_tx_lock.lock().await;

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

        let signed_tx = self
            .admin_signer
            .sign_transaction(admin_ak.nonce + 1, &self.account_id, block_hash, actions)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("Admin TX signing failed: {e}")))?;

        rpc.send_signed_tx(signed_tx)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("DeleteKey batch failed: {e}")))?;

        Ok(())
    }

    /// Persist active/warm local keys to encrypted store. KMS keys skip this.
    pub(crate) fn persist_keys(&self) -> Result<(), crate::Error> {
        let keys: Vec<(String, String)> = self
            .read_slots()
            .iter()
            .filter(|s| {
                let st = s.state.load(Ordering::Relaxed);
                st == ACTIVE || st == WARMUP
            })
            .filter_map(|s| {
                if let Some(near_signer) = s.signer.as_local_signer() {
                    match near_signer {
                        Signer::InMemory(ims) => {
                            Some((ims.public_key.to_string(), ims.secret_key.to_string()))
                        }
                        _ => None,
                    }
                } else {
                    None
                }
            })
            .collect();

        self.store.save(&self.account_id, &keys)
    }

    /// Public wrapper for shutdown-time key persistence.
    pub fn persist_keys_public(&self) -> Result<(), crate::Error> {
        self.persist_keys()
    }
}
