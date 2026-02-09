//! Application state shared across handlers.

use crate::config::{Config, ScalingConfig};
use crate::key_pool::{bootstrap_pool_from_chain, KeyPool};
use crate::key_store::KeyStore;
use crate::rpc::RpcClient;
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
    pub start_time: Instant,
    pub request_count: AtomicU64,
}

impl AppState {
    /// Create application state from configuration.
    /// Loads admin key, bootstraps key pool from stored keys + chain nonces.
    pub async fn new(config: Config) -> Result<Self, crate::Error> {
        let rpc = RpcClient::new(&config.rpc_url, &config.fallback_rpc_url);

        // Load admin key (full-access, for AddKey/DeleteKey)
        let admin_signer = load_admin_key(&config)?;
        let account_id = admin_signer.get_account_id().clone();
        info!(account = %account_id, "Loaded admin key");
        let contract_id: near_primitives::types::AccountId = config
            .contract_id
            .parse()
            .map_err(|e| crate::Error::Config(format!("Invalid contract_id: {e}")))?;

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
            match load_legacy_signer(&config) {
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

        // Bootstrap pool: sync nonces from chain
        let scaling = ScalingConfig::default();

        let key_pool = bootstrap_pool_from_chain(
            &rpc,
            &account_id,
            &contract_id,
            admin_signer,
            stored_keys,
            scaling,
            store,
        )
        .await?;

        let key_pool = Arc::new(key_pool);

        info!(
            active = key_pool.active_count(),
            account = %account_id,
            "Relayer ready with key pool"
        );

        Ok(Self {
            rpc,
            config,
            key_pool,
            start_time: Instant::now(),
            request_count: AtomicU64::new(0),
        })
    }
}

/// Load the admin full-access key from RELAYER_ADMIN_KEY_PATH or RELAYER_ADMIN_KEY_JSON.
fn load_admin_key(config: &Config) -> Result<Signer, crate::Error> {
    if let Ok(json) = std::env::var("RELAYER_ADMIN_KEY_JSON") {
        return parse_keys_json(&json);
    }
    if std::path::Path::new(&config.admin_key_path).exists() {
        near_crypto::InMemorySigner::from_file(config.admin_key_path.as_ref())
            .map_err(|e| crate::Error::Config(format!("Failed to load admin key: {e}")))
    } else if let Ok(json) = std::env::var("RELAYER_KEYS_JSON") {
        parse_keys_json(&json)
    } else {
        near_crypto::InMemorySigner::from_file(config.keys_path.as_ref())
            .map_err(|e| crate::Error::Config(format!("Failed to load key: {e}")))
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
            .map_err(|e| crate::Error::Config(format!("Invalid key JSON: {e}")))?;
        keys.into_iter()
            .next()
            .ok_or_else(|| crate::Error::Config("Empty key array".to_string()))?
    } else {
        serde_json::from_str(json)
            .map_err(|e| crate::Error::Config(format!("Invalid key JSON: {e}")))?
    };

    let secret_key = SecretKey::from_str(&key.secret_key)
        .map_err(|e| crate::Error::Config(format!("Invalid secret key: {e}")))?;

    Ok(near_crypto::InMemorySigner::from_secret_key(
        key.account_id
            .parse()
            .map_err(|e| crate::Error::Config(format!("Invalid account: {e}")))?,
        secret_key,
    ))
}
