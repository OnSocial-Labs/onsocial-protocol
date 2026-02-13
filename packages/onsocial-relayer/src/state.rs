//! Application state shared across all handlers.

use crate::config::{Config, ScalingConfig, SignerMode};
use crate::key_pool::{bootstrap_pool_from_chain, KeyPool};
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
    pub contract_id: near_primitives::types::AccountId,
    pub start_time: Instant,
    pub request_count: AtomicU64,
    /// False until pool has `min_keys` active. `/ready` returns 503 until then.
    pub ready: std::sync::atomic::AtomicBool,
    #[cfg(feature = "gcp")]
    pub kms_client: Option<Arc<crate::kms::KmsClient>>,
}

impl AppState {
    /// Initialize from config. Local mode loads keys from disk; KMS mode uses HSM.
    pub async fn new(config: Config) -> Result<Self, crate::Error> {
        let rpc = RpcClient::new(&config.rpc_url, &config.fallback_rpc_url);

        let contract_id: near_primitives::types::AccountId = config
            .contract_id
            .parse()
            .map_err(|e| crate::Error::Config(format!("Invalid contract_id: {e}")))?;

        let scaling = ScalingConfig::default();
        let scaling_min_keys = scaling.min_keys as usize;

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
                    bootstrap_kms_pool(&config, &rpc, &account_id, &contract_id, scaling).await?
                }
            }
            SignerMode::Local => {
                // Load admin key from disk (local mode only)
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
                        &contract_id,
                        admin,
                        scaling,
                    )
                    .await?;
                    (pool, None)
                };
                #[cfg(not(feature = "gcp"))]
                let result =
                    bootstrap_local_pool(&config, &rpc, &account_id, &contract_id, admin, scaling)
                        .await?;
                result
            }
        };

        #[cfg(feature = "gcp")]
        let (key_pool, kms_client) = key_pool;

        let key_pool = Arc::new(key_pool);

        info!(
            active = key_pool.active_count(),
            mode = ?config.signer_mode,
            "Relayer ready with key pool"
        );

        // Mark ready once we have at least min_keys active.
        let ready = std::sync::atomic::AtomicBool::new(key_pool.active_count() >= scaling_min_keys);

        Ok(Self {
            rpc,
            contract_id,
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

/// Bootstrap pool from local keys on disk.
async fn bootstrap_local_pool(
    config: &Config,
    rpc: &RpcClient,
    account_id: &near_primitives::types::AccountId,
    contract_id: &near_primitives::types::AccountId,
    admin_signer: RelayerSigner,
    scaling: ScalingConfig,
) -> Result<KeyPool, crate::Error> {
    // Set up key store
    let store = if let Ok(enc_key) = std::env::var("RELAYER_KEY_ENCRYPTION_SECRET") {
        KeyStore::new_encrypted(config.pool_store_path.clone().into(), &enc_key)?
    } else {
        warn!("No RELAYER_KEY_ENCRYPTION_SECRET set — using plaintext key store (dev mode)");
        KeyStore::new_plaintext(config.pool_store_path.clone().into())
    };

    // Load stored keys from disk
    let stored_pairs = store.load()?;
    let stored_keys: Vec<(SecretKey, near_crypto::PublicKey)> = stored_pairs
        .into_iter()
        .filter_map(|(_pk_str, sk_str)| {
            let sk: SecretKey = sk_str.parse().ok()?;
            let pk = sk.public_key();
            Some((sk, pk))
        })
        .collect();

    // If no stored keys, fall back to the legacy single key (RELAYER_KEYS_JSON or file)
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

    bootstrap_pool_from_chain(
        rpc,
        account_id,
        contract_id,
        admin_signer,
        stored_keys,
        scaling,
        store,
        config.allowed_methods.clone(),
    )
    .await
}

/// Bootstrap pool from GCP Cloud KMS. Zero private keys on server.
#[cfg(feature = "gcp")]
async fn bootstrap_kms_pool(
    config: &Config,
    rpc: &RpcClient,
    account_id: &near_primitives::types::AccountId,
    contract_id: &near_primitives::types::AccountId,
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
        pool_size = config.gcp_kms_pool_size,
        admin_key = %config.gcp_kms_admin_key,
        "Initializing GCP Cloud KMS"
    );

    let kms_client = Arc::new(KmsClient::new()?);

    // --- Admin key from KMS (full-access, for AddKey/DeleteKey) ---
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

    // --- Pool keys from KMS (function-call, for execute TXs) ---

    // Fetch public keys for each pool key from KMS (with bootstrap retry)
    let mut pool_signers: Vec<(RelayerSigner, u64)> = Vec::new();
    const BOOTSTRAP_MAX_RETRIES: u32 = 3;
    const BOOTSTRAP_BASE_DELAY_MS: u64 = 2000;

    for i in 0..config.gcp_kms_pool_size {
        let key_name = format!("pool-key-{i}");
        let mut last_err = None;

        for attempt in 0..BOOTSTRAP_MAX_RETRIES {
            if attempt > 0 {
                let delay =
                    std::time::Duration::from_millis(BOOTSTRAP_BASE_DELAY_MS * 2u64.pow(attempt));
                warn!(
                    key = i,
                    attempt,
                    delay_ms = delay.as_millis() as u64,
                    "Retrying KMS key init"
                );
                tokio::time::sleep(delay).await;
            }

            match kms_client
                .init_key_ref(
                    &config.gcp_kms_project,
                    &config.gcp_kms_location,
                    &config.gcp_kms_keyring,
                    &key_name,
                    1, // version
                    account_id,
                )
                .await
            {
                Ok(key_ref) => {
                    // Query on-chain nonce for this key
                    let nonce = match rpc.query_access_key(account_id, &key_ref.public_key).await {
                        Ok(ak) => ak.nonce,
                        Err(_) => {
                            info!(key = %key_ref.public_key, "KMS key not yet registered on-chain (nonce=0)");
                            0
                        }
                    };

                    info!(
                        key = i,
                        public_key = %key_ref.public_key,
                        nonce = nonce,
                        "KMS pool key ready"
                    );

                    let signer = RelayerSigner::Kms {
                        key_ref,
                        client: Arc::clone(&kms_client),
                    };

                    pool_signers.push((signer, nonce));
                    last_err = None;
                    break;
                }
                Err(e) => {
                    warn!(key = i, attempt, error = %e, "KMS key init failed");
                    last_err = Some(e);
                }
            }
        }

        if let Some(e) = last_err {
            return Err(crate::Error::Config(format!(
                "Failed to init KMS pool-key-{i} after {BOOTSTRAP_MAX_RETRIES} attempts: {e}"
            )));
        }
    }

    if pool_signers.is_empty() {
        return Err(crate::Error::Config(
            "No KMS pool keys could be initialized".into(),
        ));
    }

    // No key store needed for KMS
    let store = KeyStore::new_plaintext("/dev/null".into());

    // Build KMS context so the autoscaler can create keys on demand
    let kms_context = crate::key_pool::KmsContext {
        client: Arc::clone(&kms_client),
        project: config.gcp_kms_project.clone(),
        location: config.gcp_kms_location.clone(),
        keyring: config.gcp_kms_keyring.clone(),
        next_index: std::sync::atomic::AtomicU32::new(config.gcp_kms_pool_size),
    };

    let pool = KeyPool::new(
        account_id.clone(),
        contract_id.clone(),
        admin_signer,
        pool_signers,
        scaling,
        store,
        config.allowed_methods.clone(),
    )
    .with_kms(kms_context);

    Ok((pool, Some(kms_client)))
}

/// Load admin full-access key from env or file.
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

/// Load legacy single signer (backward compat).
fn load_legacy_signer(config: &Config) -> Result<Signer, crate::Error> {
    if let Ok(keys_json) = std::env::var("RELAYER_KEYS_JSON") {
        parse_keys_json(&keys_json)
    } else {
        near_crypto::InMemorySigner::from_file(config.keys_path.as_ref())
            .map_err(|e| crate::Error::Config(format!("Failed to load key: {e}")))
    }
}

/// Parse keys JSON in the near-cli format.
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
