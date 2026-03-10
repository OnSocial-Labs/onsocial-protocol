//! Pool bootstrap and nonce synchronization.

use super::KeyPool;
use super::PoolConfig;
use crate::rpc::RpcClient;
use crate::signer::RelayerSigner;
use near_crypto::{PublicKey, SecretKey};
use near_primitives::types::AccountId;
use std::sync::atomic::Ordering;
use tracing::{info, warn};

impl KeyPool {
    /// Re-sync a key's nonce from chain after InvalidNonce.
    pub async fn handle_nonce_error(
        &self,
        public_key: &PublicKey,
        rpc: &RpcClient,
    ) -> Result<(), crate::Error> {
        let slot = {
            let slots = self.read_slots();
            slots
                .iter()
                .find(|s| s.signer.public_key() == *public_key)
                .cloned()
        };

        if let Some(slot) = slot {
            match sync_nonce_from_chain(rpc, &self.account_id, public_key).await {
                Ok(nonce) => {
                    slot.nonce.store(nonce, Ordering::SeqCst);
                    info!(key = %public_key, nonce, "Nonce re-synced from chain");
                }
                Err(e) => {
                    warn!(key = %public_key, error = %e, "Failed to re-sync nonce");
                }
            }
        }
        Ok(())
    }
}

/// Query a single key's nonce from chain.
pub(crate) async fn sync_nonce_from_chain(
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

/// Bootstrap a [`KeyPool`] from encrypted local keys and on-chain state.
/// FullAccess keys are skipped — they belong to the admin signer.
pub async fn bootstrap_pool_from_chain(
    rpc: &RpcClient,
    pool_config: PoolConfig,
    stored_keys: Vec<(SecretKey, PublicKey)>,
) -> Result<KeyPool, crate::Error> {
    let mut signers_with_nonces: Vec<(RelayerSigner, u64, AccountId)> = Vec::new();

    for (secret_key, public_key) in &stored_keys {
        match rpc
            .query_access_key(&pool_config.account_id, public_key)
            .await
        {
            Ok(ak) => {
                // Detect which contract this key is authorized for.
                let target = match &ak.permission {
                    near_primitives::views::AccessKeyPermissionView::FunctionCall {
                        receiver_id,
                        ..
                    } => match receiver_id.parse::<AccountId>() {
                        Ok(id) => id,
                        Err(e) => {
                            warn!(
                                key = %public_key,
                                receiver = %receiver_id,
                                error = %e,
                                "Skipping key with unparseable receiver_id"
                            );
                            continue;
                        }
                    },
                    near_primitives::views::AccessKeyPermissionView::FullAccess => {
                        warn!(key = %public_key, "Skipping FullAccess key during bootstrap");
                        continue;
                    }
                };

                let signer = near_crypto::InMemorySigner::from_secret_key(
                    pool_config.account_id.clone(),
                    secret_key.clone(),
                );
                let relayer_signer = RelayerSigner::Local { signer };
                signers_with_nonces.push((relayer_signer, ak.nonce, target.clone()));
                info!(key = %public_key, nonce = ak.nonce, contract = %target, "Synced key from chain");
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

    Ok(KeyPool::new(pool_config, signers_with_nonces))
}

#[cfg(test)]
mod tests {
    use super::super::tests::{dummy_rpc, make_test_pool};
    use near_crypto::KeyType;

    #[tokio::test]
    async fn test_handle_nonce_error_unknown_key_is_noop() {
        let pool = make_test_pool(2);
        let rpc = dummy_rpc();
        let unknown = near_crypto::SecretKey::from_random(KeyType::ED25519).public_key();

        let result = pool.handle_nonce_error(&unknown, &rpc).await;
        assert!(result.is_ok());
    }
}
