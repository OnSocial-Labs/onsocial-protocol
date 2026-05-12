//! Scale-up/down operations for the key pool.

use super::slot::{now_secs, KeySlot, ACTIVE, DRAINING, WARMUP};
use super::KeyPool;
use crate::rpc::RpcClient;
use crate::signer::RelayerSigner;
use near_crypto::{PublicKey, SecretKey, Signer};
use near_primitives::views::AccessKeyPermissionView;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

impl KeyPool {
    /// Ensure enough full-access signer lanes exist for NEP-366 delegate relay.
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
        #[cfg(feature = "gcp")]
        if let Some(ref kms) = self.kms {
            self.provision_kms_delegate_keys(rpc, kms, deficit).await?;
            return Ok(());
        }

        self.provision_local_delegate_keys(rpc, deficit).await?;
        if let Err(e) = self.persist_keys() {
            warn!(error = %e, "Failed to persist delegate key store after scale-up");
        }
        Ok(())
    }

    /// Scale up: create N keys *per contract* and register on-chain.
    pub async fn scale_up(&self, rpc: &RpcClient, count: u32) -> Result<(), crate::Error> {
        #[cfg(feature = "gcp")]
        if let Some(ref kms) = self.kms {
            return self.scale_up_kms(rpc, kms, count).await;
        }

        self.scale_up_local(rpc, count).await
    }

    /// Scale up for a single contract (safety-net provisioning).
    pub async fn scale_up_for_contract(
        &self,
        rpc: &RpcClient,
        count: u32,
        target: &near_primitives::types::AccountId,
    ) -> Result<(), crate::Error> {
        #[cfg(feature = "gcp")]
        if let Some(ref kms) = self.kms {
            self.provision_kms_keys(rpc, kms, count, target).await?;
            return Ok(());
        }

        self.provision_local_keys(rpc, count, target).await?;
        if let Err(e) = self.persist_keys() {
            warn!(error = %e, "Failed to persist key store after scale-up");
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
            "Full-access delegate AddKey batch submitted"
        );

        for (secret_key, public_key) in &new_keys {
            let mut nonce = None;
            for attempt in 0..3 {
                match rpc.query_access_key(&self.account_id, public_key).await {
                    Ok(ak) => {
                        if !matches!(&ak.permission, AccessKeyPermissionView::FullAccess) {
                            return Err(crate::Error::KeyPool(format!(
                                "delegate key {public_key} was registered without FullAccess"
                            )));
                        }
                        nonce = Some(ak.nonce);
                        break;
                    }
                    Err(e) => {
                        if attempt < 2 {
                            tokio::time::sleep(Duration::from_millis(500)).await;
                        } else {
                            warn!(key = %public_key, error = %e, "Delegate key added on-chain but nonce sync failed");
                        }
                    }
                }
            }

            let signer = near_crypto::InMemorySigner::from_secret_key(
                self.account_id.clone(),
                secret_key.clone(),
            );
            let relayer_signer = RelayerSigner::Local { signer };
            self.insert_delegate_signer(relayer_signer, nonce.unwrap_or(0));
            info!(key = %public_key, nonce = nonce.unwrap_or(0), "New local delegate signer added to pool");
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
                "Full-access delegate AddKey batch submitted"
            );

            for key_ref in to_register {
                let nonce = match rpc
                    .query_access_key(&self.account_id, &key_ref.public_key)
                    .await
                {
                    Ok(ak) => {
                        if !matches!(&ak.permission, AccessKeyPermissionView::FullAccess) {
                            return Err(crate::Error::KeyPool(format!(
                                "KMS delegate key {} was registered without FullAccess",
                                key_ref.public_key
                            )));
                        }
                        ak.nonce
                    }
                    Err(e) => {
                        warn!(key = %key_ref.public_key, error = %e, "KMS delegate key registered but nonce sync failed");
                        0
                    }
                };
                active_refs.push((key_ref, nonce));
            }
        }

        for (key_ref, nonce) in active_refs {
            let pk = key_ref.public_key.clone();
            let signer = RelayerSigner::Kms {
                key_ref,
                client: Arc::clone(&kms.client),
            };
            self.insert_delegate_signer(signer, nonce);
            info!(key = %pk, nonce, "KMS delegate signer added to pool");
        }

        Ok(())
    }

    fn insert_delegate_signer(&self, signer: RelayerSigner, nonce: u64) {
        let public_key = signer.public_key();
        let mut slots = self.write_delegate_slots();
        if let Some(slot) = slots
            .iter()
            .find(|slot| slot.signer.public_key() == public_key)
        {
            slot.nonce.store(nonce, Ordering::Relaxed);
            slot.state.store(ACTIVE, Ordering::Relaxed);
            return;
        }

        let slot = KeySlot::new(signer, nonce, self.account_id.clone());
        slot.state.store(ACTIVE, Ordering::Relaxed);
        slots.push(Arc::new(slot));
    }

    pub async fn scale_up_local(&self, rpc: &RpcClient, count: u32) -> Result<(), crate::Error> {
        for target in &self.allowed_contracts {
            self.provision_local_keys(rpc, count, target).await?;
        }

        if let Err(e) = self.persist_keys() {
            warn!(error = %e, "Failed to persist key store after scale-up");
        }

        Ok(())
    }

    async fn provision_local_keys(
        &self,
        rpc: &RpcClient,
        count: u32,
        target: &near_primitives::types::AccountId,
    ) -> Result<(), crate::Error> {
        let mut new_keys: Vec<(SecretKey, PublicKey)> = Vec::with_capacity(count as usize);

        for _ in 0..count {
            let secret_key = SecretKey::from_random(near_crypto::KeyType::ED25519);
            let public_key = secret_key.public_key();
            new_keys.push((secret_key, public_key));
        }

        let public_keys: Vec<PublicKey> = new_keys.iter().map(|(_, pk)| pk.clone()).collect();
        self.register_keys_on_chain(rpc, &public_keys, target)
            .await?;

        info!(count, contract = %target, mode = "local", "AddKey batch submitted");

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
            let n = nonce.unwrap_or(0);
            let signer = near_crypto::InMemorySigner::from_secret_key(
                self.account_id.clone(),
                secret_key.clone(),
            );
            let relayer_signer = RelayerSigner::Local { signer };
            let slot = KeySlot::new(relayer_signer, n, target.clone());
            slot.state.store(ACTIVE, Ordering::Relaxed);
            if nonce.is_some() {
                info!(key = %public_key, nonce = n, contract = %target, "New local key added to pool");
            } else {
                warn!(key = %public_key, contract = %target, "Key added with nonce=0, will re-sync on first use");
            }
            self.write_slots().push(Arc::new(slot));
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
        for target in &self.allowed_contracts {
            self.provision_kms_keys(rpc, kms, count, target).await?;
        }
        Ok(())
    }

    /// Provision `count` KMS keys for one contract (HSM createKey + AddKey).
    #[cfg(feature = "gcp")]
    async fn provision_kms_keys(
        &self,
        rpc: &RpcClient,
        kms: &super::KmsContext,
        count: u32,
        target: &near_primitives::types::AccountId,
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
        self.register_keys_on_chain(rpc, &public_keys, target)
            .await?;

        info!(count, contract = %target, mode = "kms", "AddKey batch submitted");

        let mut nonce_handles = tokio::task::JoinSet::new();
        let target_clone = target.clone();
        for key_ref in key_refs {
            let account_id = self.account_id.clone();
            let pk = key_ref.public_key.clone();
            let rpc_url = rpc.primary_url().to_string();
            let fallback_url = rpc.fallback_url().to_string();
            let tgt = target_clone.clone();
            nonce_handles.spawn(async move {
                let rpc = RpcClient::new(&rpc_url, &fallback_url);
                let nonce = match rpc.query_access_key(&account_id, &pk).await {
                    Ok(ak) => Some(ak.nonce),
                    Err(e) => {
                        warn!(key = %pk, error = %e, "KMS key registered but nonce sync failed");
                        None
                    }
                };
                (key_ref, pk, nonce, tgt)
            });
        }

        while let Some(result) = nonce_handles.join_next().await {
            match result {
                Ok((key_ref, pk, nonce_opt, tgt)) => {
                    let n = nonce_opt.unwrap_or(0);
                    let signer = RelayerSigner::Kms {
                        key_ref,
                        client: Arc::clone(&kms.client),
                    };
                    let slot = KeySlot::new(signer, n, tgt);
                    slot.state.store(ACTIVE, Ordering::Relaxed);
                    self.write_slots().push(Arc::new(slot));
                    if nonce_opt.is_some() {
                        info!(key = %pk, nonce = n, contract = %target, "New KMS key added to pool");
                    } else {
                        warn!(key = %pk, contract = %target, "KMS key added with nonce=0, will re-sync on first use");
                    }
                }
                Err(e) => {
                    warn!(error = %e, "KMS nonce sync task panicked");
                }
            }
        }

        Ok(())
    }

    /// Batch AddKey. Holds `admin_tx_lock` to prevent admin nonce races.
    pub(crate) async fn register_keys_on_chain(
        &self,
        rpc: &RpcClient,
        public_keys: &[PublicKey],
        target_contract: &near_primitives::types::AccountId,
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
                                receiver_id: target_contract.to_string(),
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

    /// Batch FullAccess AddKey for NEP-366 delegate signer lanes.
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

    /// Drain N idle keys, then batch DeleteKey. Reverts on RPC failure.
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

    /// Batch DeleteKey. Holds `admin_tx_lock` to prevent admin nonce races.
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

    /// Persist active/warm local keys to encrypted store. Skipped for KMS.
    pub(crate) fn persist_keys(&self) -> Result<(), crate::Error> {
        let admin_public_key = self.admin_signer.public_key().to_string();
        let mut seen = std::collections::HashSet::new();
        let mut keys: Vec<(String, String)> = Vec::new();

        let mut collect_slot = |slot: &Arc<KeySlot>| {
            let st = slot.state.load(Ordering::Relaxed);
            if st == ACTIVE || st == WARMUP {
                if let Some(Signer::InMemory(ims)) = slot.signer.as_local_signer() {
                    let public_key = ims.public_key.to_string();
                    if public_key != admin_public_key && seen.insert(public_key.clone()) {
                        keys.push((public_key, ims.secret_key.to_string()));
                    }
                }
            }
        };

        for slot in self.read_slots().iter() {
            collect_slot(slot);
        }
        for slot in self.read_delegate_slots().iter() {
            collect_slot(slot);
        }

        self.store.save(&self.account_id, &keys)
    }

    pub fn persist_keys_public(&self) -> Result<(), crate::Error> {
        self.persist_keys()
    }
}
