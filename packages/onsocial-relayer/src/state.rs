//! Shared application state initialization.

use crate::config::{Config, SignerMode};
use crate::key_pool::{bootstrap_pool_from_chain, KeyPool, PoolConfig};
use crate::key_store::KeyStore;
use crate::rpc::RpcClient;
use crate::signer::RelayerSigner;
use near_crypto::{SecretKey, Signer};
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use std::time::Instant;
use tracing::{info, warn};

/// Shared application state.
pub struct AppState {
    pub config: Config,
    pub rpc: RpcClient,
    pub key_pool: Arc<KeyPool>,
    pub allowed_contracts: Vec<near_primitives::types::AccountId>,
    /// Inner FunctionCall methods accepted on `/execute_delegate` delegates.
    pub allowed_methods: Vec<String>,
    pub start_time: Instant,
    pub request_count: AtomicU64,
    /// `/ready` returns 503 until the delegate signer pool reaches its target size.
    pub ready: std::sync::atomic::AtomicBool,
    #[cfg(feature = "gcp")]
    pub kms_client: Option<Arc<crate::kms::KmsClient>>,
}

impl AppState {
    pub async fn new(config: Config) -> Result<Self, crate::Error> {
        let rpc = RpcClient::new(&config.rpc_url, &config.fallback_rpc_url);

        let allowed_contracts: Vec<near_primitives::types::AccountId> = config
            .allowed_contracts
            .iter()
            .filter_map(|contract| {
                contract
                    .parse()
                    .map_err(|e| {
                        warn!(contract = %contract, error = %e, "Ignoring invalid allowed contract");
                        e
                    })
                    .ok()
            })
            .collect();

        if allowed_contracts.is_empty() {
            return Err(crate::Error::Config(
                "No valid contracts configured in RELAYER_ALLOWED_CONTRACTS".into(),
            ));
        }

        info!(contracts = ?allowed_contracts, "Allowed contracts");

        let allowed_methods: Vec<String> = config
            .allowed_methods
            .iter()
            .map(|method| method.trim().to_string())
            .filter(|method| !method.is_empty())
            .collect();
        if allowed_methods.is_empty() {
            return Err(crate::Error::Config(
                "No valid methods configured in RELAYER_ALLOWED_METHODS".into(),
            ));
        }
        info!(methods = ?allowed_methods, "Allowed inner methods");

        let delegate_target = config.delegate_pool_size.max(1) as usize;
        let key_pool = match config.signer_mode {
            SignerMode::Kms => {
                #[cfg(not(feature = "gcp"))]
                {
                    return Err(crate::Error::Config(
                        "signer_mode=kms requires the `gcp` feature flag. \
                         Rebuild with: cargo build --features gcp"
                            .into(),
                    ));
                }

                #[cfg(feature = "gcp")]
                {
                    let account_id: near_primitives::types::AccountId =
                        config.relayer_account_id.parse().map_err(|e| {
                            crate::Error::Config(format!("Invalid RELAYER_ACCOUNT_ID: {e}"))
                        })?;
                    info!(account = %account_id, mode = "kms", "Bootstrapping KMS delegate pool");
                    bootstrap_kms_pool(&config, &rpc, &account_id).await?
                }
            }
            SignerMode::Local => {
                let admin_signer = load_admin_key(&config)?;
                let account_id = admin_signer.get_account_id().clone();
                info!(account = %account_id, mode = "local", "Loaded admin key");
                let admin = RelayerSigner::Local {
                    signer: admin_signer,
                };

                #[cfg(feature = "gcp")]
                let result = {
                    let pool = bootstrap_local_pool(&config, &rpc, &account_id, admin).await?;
                    (pool, None)
                };
                #[cfg(not(feature = "gcp"))]
                let result = bootstrap_local_pool(&config, &rpc, &account_id, admin).await?;
                result
            }
        };

        #[cfg(feature = "gcp")]
        let (key_pool, kms_client) = key_pool;

        let key_pool = Arc::new(key_pool);

        if let Err(e) = key_pool
            .ensure_delegate_pool(&rpc, config.delegate_pool_size)
            .await
        {
            warn!(error = %e, "Failed to provision delegate signers");
        }

        info!(
            delegate_active = key_pool.active_delegate_count(),
            delegate_target = config.delegate_pool_size,
            mode = ?config.signer_mode,
            "Relayer ready with delegate signer pool"
        );

        let ready =
            std::sync::atomic::AtomicBool::new(key_pool.active_delegate_count() >= delegate_target);

        Ok(Self {
            rpc,
            allowed_contracts,
            allowed_methods,
            config,
            key_pool,
            start_time: Instant::now(),
            request_count: AtomicU64::new(0),
            ready,
            #[cfg(feature = "gcp")]
            kms_client,
        })
    }
}

async fn bootstrap_local_pool(
    config: &Config,
    rpc: &RpcClient,
    account_id: &near_primitives::types::AccountId,
    admin_signer: RelayerSigner,
) -> Result<KeyPool, crate::Error> {
    let store = if let Ok(enc_key) = std::env::var("RELAYER_KEY_ENCRYPTION_SECRET") {
        KeyStore::new_encrypted(config.delegate_store_path.clone().into(), &enc_key)?
    } else {
        warn!("No RELAYER_KEY_ENCRYPTION_SECRET set - using plaintext key store (dev mode)");
        KeyStore::new_plaintext(config.delegate_store_path.clone().into())
    };

    let stored_keys: Vec<(SecretKey, near_crypto::PublicKey)> = store
        .load()?
        .into_iter()
        .filter_map(|(_pk_str, sk_str)| {
            let secret_key: SecretKey = sk_str.parse().ok()?;
            let public_key = secret_key.public_key();
            Some((secret_key, public_key))
        })
        .collect();

    let pool_config = PoolConfig {
        account_id: account_id.clone(),
        admin_signer,
        store,
    };

    bootstrap_pool_from_chain(rpc, pool_config, stored_keys).await
}

/// Bootstrap pool from GCP Cloud KMS.
#[cfg(feature = "gcp")]
async fn bootstrap_kms_pool(
    config: &Config,
    rpc: &RpcClient,
    account_id: &near_primitives::types::AccountId,
) -> Result<(KeyPool, Option<Arc<crate::kms::KmsClient>>), crate::Error> {
    use crate::kms::KmsClient;

    if config.gcp_kms_project.is_empty() {
        return Err(crate::Error::Config(
            "GCP_KMS_PROJECT is required when signer_mode=kms".into(),
        ));
    }
    if config.gcp_kms_keyring.is_empty() {
        return Err(crate::Error::Config(
            "GCP_KMS_KEYRING is required when signer_mode=kms".into(),
        ));
    }

    info!(
        project = %config.gcp_kms_project,
        location = %config.gcp_kms_location,
        keyring = %config.gcp_kms_keyring,
        delegate_pool_size = config.delegate_pool_size,
        admin_key = %config.gcp_kms_admin_key,
        "Initializing GCP Cloud KMS"
    );

    let kms_client = Arc::new(KmsClient::new()?);

    let admin_key_ref = kms_client
        .init_key_ref(
            &config.gcp_kms_project,
            &config.gcp_kms_location,
            &config.gcp_kms_keyring,
            &config.gcp_kms_admin_key,
            1,
            account_id,
        )
        .await
        .map_err(|e| {
            crate::Error::Config(format!(
                "Failed to init KMS admin key '{}': {e}",
                config.gcp_kms_admin_key
            ))
        })?;

    info!(
        admin_public_key = %admin_key_ref.public_key,
        "KMS admin key ready"
    );

    let admin_signer = RelayerSigner::Kms {
        key_ref: admin_key_ref,
        client: Arc::clone(&kms_client),
    };

    let admin_access_key = rpc
        .query_access_key(account_id, &admin_signer.public_key())
        .await
        .map_err(|e| crate::Error::KeyPool(format!("admin access_key query: {e}")))?;
    if !matches!(
        &admin_access_key.permission,
        near_primitives::views::AccessKeyPermissionView::FullAccess
    ) {
        return Err(crate::Error::Config(
            "delegate signer provisioning requires the KMS admin signer to be a FullAccess key"
                .into(),
        ));
    }

    let store = KeyStore::new_plaintext("/dev/null".into());
    let kms_context = crate::key_pool::KmsContext {
        client: Arc::clone(&kms_client),
        project: config.gcp_kms_project.clone(),
        location: config.gcp_kms_location.clone(),
        keyring: config.gcp_kms_keyring.clone(),
        delegate_key_prefix: delegate_key_prefix(&config.instance_name),
        next_delegate_index: std::sync::atomic::AtomicU32::new(0),
    };

    let pool_config = PoolConfig {
        account_id: account_id.clone(),
        admin_signer,
        store,
    };

    let pool = KeyPool::new(pool_config, Vec::new()).with_kms(kms_context);

    Ok((pool, Some(kms_client)))
}

fn load_admin_key(config: &Config) -> Result<Signer, crate::Error> {
    if let Ok(json) = std::env::var("RELAYER_ADMIN_KEY_JSON") {
        return parse_keys_json(&json);
    }
    if std::path::Path::new(&config.admin_key_path).exists() {
        let json = std::fs::read_to_string(&config.admin_key_path)
            .map_err(|e| crate::Error::Config(format!("Failed to read admin key: {e}")))?;
        return parse_keys_json(&json);
    }
    if let Ok(json) = std::env::var("RELAYER_KEYS_JSON") {
        parse_keys_json(&json)
    } else {
        let json = std::fs::read_to_string(&config.keys_path)
            .map_err(|e| crate::Error::Config(format!("Failed to read key: {e}")))?;
        parse_keys_json(&json)
    }
}

fn parse_keys_json(json: &str) -> Result<Signer, crate::Error> {
    use std::str::FromStr;

    #[derive(serde::Deserialize)]
    struct KeyFile {
        account_id: String,
        #[serde(alias = "private_key")]
        secret_key: String,
    }

    let key: KeyFile = if json.trim().starts_with('[') {
        let keys: Vec<KeyFile> = serde_json::from_str(json)
            .map_err(|e| crate::Error::Config(format!("Invalid key JSON array: {e}")))?;
        keys.into_iter()
            .next()
            .ok_or_else(|| crate::Error::Config("Empty key array".to_string()))?
    } else {
        serde_json::from_str(json)
            .map_err(|e| crate::Error::Config(format!("Invalid key JSON: {e}")))?
    };

    let secret_key = SecretKey::from_str(&key.secret_key).map_err(|_| {
        crate::Error::Config("Invalid secret key format (not a valid NEAR key)".into())
    })?;

    Ok(near_crypto::InMemorySigner::from_secret_key(
        key.account_id
            .parse()
            .map_err(|e| crate::Error::Config(format!("Invalid account: {e}")))?,
        secret_key,
    ))
}

#[cfg(feature = "gcp")]
fn delegate_key_prefix(instance_name: &str) -> String {
    let mut sanitized = String::with_capacity(instance_name.len());
    for ch in instance_name.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            sanitized.push(ch);
        } else {
            sanitized.push('-');
        }
    }

    let sanitized = sanitized.trim_matches('-');
    let sanitized = if sanitized.is_empty() {
        "relayer"
    } else {
        sanitized
    };

    format!("delegate-{sanitized}")
}
