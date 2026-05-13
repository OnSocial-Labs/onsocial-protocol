//! Provisioning for FullAccess delegate signer lanes.

use super::slot::KeySlot;
use super::KeyPool;
use crate::rpc::RpcClient;
use crate::signer::RelayerSigner;
use near_crypto::{PublicKey, SecretKey};
use near_primitives::views::AccessKeyPermissionView;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

impl KeyPool {
    /// Ensure enough FullAccess signer lanes exist for relay submission.
    pub async fn ensure_delegate_pool(
        &self,
        rpc: &RpcClient,
        desired: u32,
    ) -> Result<(), crate::Error> {
        let desired = desired.max(1) as usize;
        let active = self.active_delegate_count();
        if active >= desired {
            return Ok(());
        }

        let deficit = (desired - active) as u32;
        let used_kms = {
            #[cfg(feature = "gcp")]
            {
                if let Some(ref kms) = self.kms {
                    self.provision_kms_delegate_keys(rpc, kms, deficit).await?;
                    true
                } else {
                    false
                }
            }
            #[cfg(not(feature = "gcp"))]
            {
                false
            }
        };

        if !used_kms {
            self.provision_local_delegate_keys(rpc, deficit).await?;
            if let Err(e) = self.persist_keys() {
                warn!(error = %e, "Failed to persist delegate key store after provisioning");
            }
        }

        let active_after = self.active_delegate_count();
        if active_after < desired {
            return Err(crate::Error::KeyPool(format!(
                "delegate signer pool under-provisioned after sync: active={active_after}, desired={desired}"
            )));
        }
        Ok(())
    }

    async fn provision_local_delegate_keys(
        &self,
        rpc: &RpcClient,
        count: u32,
    ) -> Result<(), crate::Error> {
        let mut new_keys: Vec<(SecretKey, PublicKey)> = Vec::with_capacity(count as usize);

        for _ in 0..count {
            let secret_key = SecretKey::from_random(near_crypto::KeyType::ED25519);
            let public_key = secret_key.public_key();
            new_keys.push((secret_key, public_key));
        }

        let public_keys: Vec<PublicKey> = new_keys.iter().map(|(_, pk)| pk.clone()).collect();
        self.register_full_access_keys_on_chain(rpc, &public_keys)
            .await?;

        info!(
            count,
            mode = "local",
            "FullAccess delegate AddKey batch submitted"
        );

        for (secret_key, public_key) in &new_keys {
            let nonce = match self.sync_full_access_delegate_nonce(rpc, public_key).await {
                Ok(nonce) => nonce,
                Err(e) => {
                    warn!(key = %public_key, error = %e, "Skipping delegate key until nonce can be synced");
                    continue;
                }
            };

            let signer = near_crypto::InMemorySigner::from_secret_key(
                self.account_id.clone(),
                secret_key.clone(),
            );
            let relayer_signer = RelayerSigner::Local { signer };
            self.insert_delegate_signer(relayer_signer, nonce);
            info!(key = %public_key, nonce, "New local delegate signer added to pool");
        }

        Ok(())
    }

    #[cfg(feature = "gcp")]
    async fn provision_kms_delegate_keys(
        &self,
        rpc: &RpcClient,
        kms: &super::KmsContext,
        count: u32,
    ) -> Result<(), crate::Error> {
        let base_idx = kms.next_delegate_index.fetch_add(count, Ordering::Relaxed);
        let key_ids: Vec<String> = (base_idx..base_idx + count)
            .map(|idx| format!("{}-key-{idx}", kms.delegate_key_prefix))
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
                info!(key_id = kid, public_key = %key_ref.public_key, "KMS delegate key ready");
                Ok::<_, crate::Error>(key_ref)
            });
        }

        let mut key_refs = Vec::with_capacity(count as usize);
        while let Some(result) = handles.join_next().await {
            let key_ref =
                result.map_err(|e| crate::Error::KeyPool(format!("KMS task panicked: {e}")))??;
            key_refs.push(key_ref);
        }

        let mut to_register = Vec::new();
        let mut active_refs = Vec::new();
        for key_ref in key_refs {
            match rpc
                .query_access_key(&self.account_id, &key_ref.public_key)
                .await
            {
                Ok(ak) => {
                    if !matches!(&ak.permission, AccessKeyPermissionView::FullAccess) {
                        return Err(crate::Error::KeyPool(format!(
                            "KMS delegate key {} exists on-chain without FullAccess",
                            key_ref.public_key
                        )));
                    }
                    active_refs.push((key_ref, ak.nonce));
                }
                Err(_) => to_register.push(key_ref),
            }
        }

        if !to_register.is_empty() {
            let public_keys: Vec<PublicKey> =
                to_register.iter().map(|kr| kr.public_key.clone()).collect();
            self.register_full_access_keys_on_chain(rpc, &public_keys)
                .await?;
            info!(
                count = public_keys.len(),
                mode = "kms",
                "FullAccess delegate AddKey batch submitted"
            );

            for key_ref in to_register {
                match self
                    .sync_full_access_delegate_nonce(rpc, &key_ref.public_key)
                    .await
                {
                    Ok(nonce) => active_refs.push((key_ref, nonce)),
                    Err(e) => {
                        warn!(key = %key_ref.public_key, error = %e, "Skipping KMS delegate key until nonce can be synced");
                    }
                }
            }
        }

        for (key_ref, nonce) in active_refs {
            let public_key = key_ref.public_key.clone();
            let signer = RelayerSigner::Kms {
                key_ref,
                client: Arc::clone(&kms.client),
            };
            self.insert_delegate_signer(signer, nonce);
            info!(key = %public_key, nonce, "KMS delegate signer added to pool");
        }

        Ok(())
    }

    async fn sync_full_access_delegate_nonce(
        &self,
        rpc: &RpcClient,
        public_key: &PublicKey,
    ) -> Result<u64, crate::Error> {
        const MAX_ATTEMPTS: u32 = 10;

        for attempt in 1..=MAX_ATTEMPTS {
            match rpc.query_access_key(&self.account_id, public_key).await {
                Ok(access_key) => {
                    if !matches!(&access_key.permission, AccessKeyPermissionView::FullAccess) {
                        return Err(crate::Error::KeyPool(format!(
                            "delegate key {public_key} exists on-chain without FullAccess"
                        )));
                    }
                    return Ok(access_key.nonce);
                }
                Err(error) if attempt < MAX_ATTEMPTS => {
                    let delay_ms = 500 * u64::from(attempt).min(6);
                    warn!(
                        key = %public_key,
                        attempt,
                        delay_ms,
                        error = %error,
                        "Delegate key nonce not visible yet; retrying"
                    );
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                }
                Err(error) => {
                    return Err(crate::Error::Rpc(format!(
                        "delegate key nonce sync failed after {MAX_ATTEMPTS} attempts: {error}"
                    )));
                }
            }
        }

        Err(crate::Error::Rpc(
            "delegate key nonce sync failed unexpectedly".into(),
        ))
    }

    fn insert_delegate_signer(&self, signer: RelayerSigner, nonce: u64) {
        let public_key = signer.public_key();
        let mut slots = self.write_delegate_slots();
        if let Some(slot) = slots
            .iter()
            .find(|slot| slot.signer.public_key() == public_key)
        {
            slot.nonce.store(nonce, Ordering::Relaxed);
            slot.state.store(super::slot::ACTIVE, Ordering::Relaxed);
            return;
        }

        slots.push(Arc::new(KeySlot::new(signer, nonce)));
    }

    /// Batch FullAccess AddKey for delegate signer lanes.
    pub(crate) async fn register_full_access_keys_on_chain(
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
                        permission: near_primitives::account::AccessKeyPermission::FullAccess,
                    },
                }
                .into()
            })
            .collect();

        let admin_ak = rpc
            .query_access_key(&self.account_id, &self.admin_signer.public_key())
            .await
            .map_err(|e| crate::Error::KeyPool(format!("admin access_key query: {e}")))?;
        if !matches!(&admin_ak.permission, AccessKeyPermissionView::FullAccess) {
            return Err(crate::Error::Config(
                "delegate signer provisioning requires a FullAccess admin key".into(),
            ));
        }

        let block_hash = rpc.latest_block_hash().await?;
        let signed_tx = self
            .admin_signer
            .sign_transaction(admin_ak.nonce + 1, &self.account_id, block_hash, actions)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("Admin TX signing failed: {e}")))?;

        rpc.send_signed_tx(signed_tx)
            .await
            .map_err(|e| crate::Error::KeyPool(format!("FullAccess AddKey batch failed: {e}")))?;

        Ok(())
    }
}
