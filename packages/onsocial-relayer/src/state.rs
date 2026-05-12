//! Shared application state initialization.

use crate::config::{Config, ScalingConfig, SignerMode};
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
    /// Inner FunctionCall methods accepted on `/execute_delegate` delegates
    /// (e.g. `execute`, `execute_admin`). Sourced from `config.allowed_methods`.
    pub allowed_methods: Vec<String>,
    pub start_time: Instant,
    pub request_count: AtomicU64,
    /// `/ready` returns 503 until `min_keys` are active.
    pub ready: std::sync::atomic::AtomicBool,
    #[cfg(feature = "gcp")]
    pub kms_client: Option<Arc<crate::kms::KmsClient>>,
}

impl AppState {
    pub async fn new(config: Config) -> Result<Self, crate::Error> {
        let rpc = RpcClient::new(&config.rpc_url, &config.fallback_rpc_url);

        // Parse the canonical allowlist.
        let allowed_contracts: Vec<near_primitives::types::AccountId> = config
            .allowed_contracts
            .iter()
            .filter_map(|s| {
                s.parse()
                    .map_err(|e| {
                        warn!(contract = %s, error = %e, "Ignoring invalid allowed_contract");
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

        // Validate the inner-method allowlist up front so an empty list can
        // never silently reject every delegate.
        let allowed_methods: Vec<String> = config
            .allowed_methods
            .iter()
            .map(|m| m.trim().to_string())
            .filter(|m| !m.is_empty())
            .collect();
        if allowed_methods.is_empty() {
            return Err(crate::Error::Config(
                "No valid methods configured in RELAYER_ALLOWED_METHODS".into(),
            ));
        }
        info!(methods = ?allowed_methods, "Allowed inner methods");

        let scaling = ScalingConfig::default();
        let delegate_min_keys = config.delegate_pool_size.max(1) as usize;

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
                    info!(account = %account_id, mode = "kms", "Bootstrapping KMS pool");
                    bootstrap_kms_pool(&config, &rpc, &account_id, &allowed_contracts, scaling)
                        .await?
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
                    let pool = bootstrap_local_pool(
                        &config,
                        &rpc,
                        &account_id,
                        &allowed_contracts,
                        admin,
                        scaling,
                    )
                    .await?;
                    (pool, None)
                };
                #[cfg(not(feature = "gcp"))]
                let result = bootstrap_local_pool(
                    &config,
                    &rpc,
                    &account_id,
                    &allowed_contracts,
                    admin,
                    scaling,
                )
                .await?;
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

        let ready = std::sync::atomic::AtomicBool::new(
            key_pool.active_delegate_count() >= delegate_min_keys,
        );

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
    allowed_contracts: &[near_primitives::types::AccountId],
    admin_signer: RelayerSigner,
    scaling: ScalingConfig,
) -> Result<KeyPool, crate::Error> {
    let store = if let Ok(enc_key) = std::env::var("RELAYER_KEY_ENCRYPTION_SECRET") {
        KeyStore::new_encrypted(config.pool_store_path.clone().into(), &enc_key)?
    } else {
        warn!("No RELAYER_KEY_ENCRYPTION_SECRET set — using plaintext key store (dev mode)");
        KeyStore::new_plaintext(config.pool_store_path.clone().into())
    };

    let stored_pairs = store.load()?;
    let stored_keys: Vec<(SecretKey, near_crypto::PublicKey)> = stored_pairs
        .into_iter()
        .filter_map(|(_pk_str, sk_str)| {
            let sk: SecretKey = sk_str.parse().ok()?;
            let pk = sk.public_key();
            Some((sk, pk))
        })
        .collect();

    // Fall back to legacy single key if no pool keys stored
    let stored_keys = if stored_keys.is_empty() {
        info!("No pool keys stored, checking for legacy single key");
        match load_legacy_signer(config) {
            Ok(signer) => match &signer {
                Signer::InMemory(ims) => {
                    info!(key = %ims.public_key, "Using legacy key as initial pool key");
                    vec![(ims.secret_key.clone(), ims.public_key.clone())]
                }
                _ => {
                    warn!("Unsupported signer variant, pool starts cold");
                    vec![]
                }
            },
            Err(e) => {
                warn!(error = %e, "No legacy key found, pool starts cold");
                vec![]
            }
        }
    } else {
        stored_keys
    };

    let pool_config = PoolConfig {
        account_id: account_id.clone(),
        allowed_contracts: allowed_contracts.to_vec(),
        admin_signer,
        scaling,
        store,
        allowed_methods: config.allowed_methods.clone(),
    };

    bootstrap_pool_from_chain(rpc, pool_config, stored_keys).await
}

/// Bootstrap pool from GCP Cloud KMS.
#[cfg(feature = "gcp")]
async fn bootstrap_kms_pool(
    config: &Config,
    rpc: &RpcClient,
    account_id: &near_primitives::types::AccountId,
    allowed_contracts: &[near_primitives::types::AccountId],
    scaling: ScalingConfig,
) -> Result<(KeyPool, Option<Arc<crate::kms::KmsClient>>), crate::Error> {
    use crate::kms::KmsClient;
    use crate::signer::RelayerSigner;

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

    // --- Admin key (full-access, for AddKey/DeleteKey) ---
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
            "NEP-366 delegate signer provisioning requires the KMS admin signer to be a FullAccess key".into(),
        ));
    }

    let store = KeyStore::new_plaintext("/dev/null".into());

    let kms_context = crate::key_pool::KmsContext {
        client: Arc::clone(&kms_client),
        project: config.gcp_kms_project.clone(),
        location: config.gcp_kms_location.clone(),
        keyring: config.gcp_kms_keyring.clone(),
        delegate_key_prefix: delegate_key_prefix(&config.instance_name),
        next_index: std::sync::atomic::AtomicU32::new(0),
        next_delegate_index: std::sync::atomic::AtomicU32::new(0),
    };

    let pool_config = PoolConfig {
        account_id: account_id.clone(),
        allowed_contracts: allowed_contracts.to_vec(),
        admin_signer,
        scaling,
        store,
        allowed_methods: config.allowed_methods.clone(),
    };

    let pool = KeyPool::new(pool_config, Vec::new(), Vec::new()).with_kms(kms_context);

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

fn load_legacy_signer(config: &Config) -> Result<Signer, crate::Error> {
    if let Ok(keys_json) = std::env::var("RELAYER_KEYS_JSON") {
        parse_keys_json(&keys_json)
    } else {
        near_crypto::InMemorySigner::from_file(config.keys_path.as_ref())
            .map_err(|e| crate::Error::Config(format!("Failed to load key: {e}")))
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
