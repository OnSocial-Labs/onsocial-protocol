//! Application state shared across handlers.

use crate::config::Config;
use crate::rpc::RpcClient;
use near_crypto::InMemorySigner;
use std::sync::atomic::AtomicU64;
use std::time::Instant;
use tracing::info;

/// Shared application state.
pub struct AppState {
    pub config: Config,
    pub rpc: RpcClient,
    pub signer: InMemorySigner,
    pub start_time: Instant,
    pub request_count: AtomicU64,
}

impl AppState {
    /// Create application state from configuration.
    pub fn new(config: Config) -> Result<Self, crate::Error> {
        // Try loading from RELAYER_KEYS_JSON env var first, then fall back to file
        let signer = if let Ok(keys_json) = std::env::var("RELAYER_KEYS_JSON") {
            parse_keys_json(&keys_json)?
        } else {
            InMemorySigner::from_file(&config.keys_path.as_ref())
                .map_err(|e| crate::Error::Config(format!("Failed to load key: {e}")))?
        };

        info!(account = %signer.account_id, "Loaded relayer key");

        Ok(Self {
            rpc: RpcClient::new(&config.rpc_url, &config.fallback_rpc_url),
            config,
            signer,
            start_time: Instant::now(),
            request_count: AtomicU64::new(0),
        })
    }
}

/// Parse keys JSON in the near-cli format: [{"account_id": "...", "public_key": "...", "secret_key": "..."}]
fn parse_keys_json(json: &str) -> Result<InMemorySigner, crate::Error> {
    use near_crypto::SecretKey;
    use std::str::FromStr;

    #[derive(serde::Deserialize)]
    struct KeyFile {
        account_id: String,
        #[serde(alias = "private_key")]
        secret_key: String,
    }

    // Try parsing as array first (near-cli format)
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

    Ok(InMemorySigner::from_secret_key(
        key.account_id
            .parse()
            .map_err(|e| crate::Error::Config(format!("Invalid account: {e}")))?,
        secret_key,
    ))
}
