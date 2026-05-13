//! Delegate signer pool bootstrap.

use super::{KeyPool, PoolConfig};
use crate::rpc::RpcClient;
use crate::signer::RelayerSigner;
use near_crypto::{PublicKey, SecretKey};
use near_primitives::views::AccessKeyPermissionView;
use tracing::{info, warn};

/// Bootstrap a [`KeyPool`] from persisted local keys and on-chain state.
/// Only FullAccess keys are accepted as delegate signer lanes.
pub async fn bootstrap_pool_from_chain(
    rpc: &RpcClient,
    pool_config: PoolConfig,
    stored_keys: Vec<(SecretKey, PublicKey)>,
) -> Result<KeyPool, crate::Error> {
    let mut delegate_signers: Vec<(RelayerSigner, u64)> = Vec::new();

    for (secret_key, public_key) in &stored_keys {
        match rpc
            .query_access_key(&pool_config.account_id, public_key)
            .await
        {
            Ok(access_key) => match &access_key.permission {
                AccessKeyPermissionView::FullAccess => {
                    let signer = near_crypto::InMemorySigner::from_secret_key(
                        pool_config.account_id.clone(),
                        secret_key.clone(),
                    );
                    delegate_signers.push((RelayerSigner::Local { signer }, access_key.nonce));
                    info!(key = %public_key, nonce = access_key.nonce, "Synced FullAccess delegate key from chain");
                }
                AccessKeyPermissionView::FunctionCall { receiver_id, .. } => {
                    warn!(
                        key = %public_key,
                        receiver = %receiver_id,
                        "Ignoring non-FullAccess access key in delegate key store"
                    );
                }
            },
            Err(e) => {
                warn!(key = %public_key, error = %e, "Stored key not found on chain, skipping");
            }
        }
    }

    info!(
        delegate_synced = delegate_signers.len(),
        total_stored = stored_keys.len(),
        "Delegate key bootstrap complete"
    );

    let admin_access_key = rpc
        .query_access_key(
            &pool_config.account_id,
            &pool_config.admin_signer.public_key(),
        )
        .await
        .map_err(|e| crate::Error::KeyPool(format!("admin access_key query: {e}")))?;
    if !matches!(
        &admin_access_key.permission,
        AccessKeyPermissionView::FullAccess
    ) {
        return Err(crate::Error::Config(
            "delegate signer provisioning requires the relayer admin signer to be a FullAccess key"
                .into(),
        ));
    }

    Ok(KeyPool::new(pool_config, delegate_signers))
}
