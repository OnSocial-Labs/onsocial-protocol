//! Relayer configuration.

use serde::Deserialize;
use std::time::Duration;

/// Signing backend: `local` (in-memory) or `kms` (GCP Cloud KMS HSM).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SignerMode {
    #[default]
    Local,
    Kms,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "defaults::rpc_url")]
    pub rpc_url: String,

    #[serde(default = "defaults::fallback_rpc_url")]
    pub fallback_rpc_url: String,

    #[serde(default = "defaults::contract_id")]
    pub contract_id: String,

    /// Env: `RELAYER_ACCOUNT_ID`. In local mode, derived from admin key if unset.
    #[serde(default = "defaults::relayer_account_id")]
    pub relayer_account_id: String,

    #[serde(default = "defaults::keys_path")]
    pub keys_path: String,

    #[serde(default = "defaults::bind_address")]
    pub bind_address: String,

    #[serde(default = "defaults::gas_tgas")]
    pub gas_tgas: u64,

    /// yoctoNEAR deposit per `execute()` call. Default: 0.
    /// FunctionCall keys cannot attach deposits (NEAR protocol restriction).
    /// Use FullAccess keys or fund the contract's platform pool instead.
    #[serde(default = "defaults::storage_deposit")]
    pub storage_deposit: u128,

    #[serde(default = "defaults::admin_key_path")]
    pub admin_key_path: String,

    #[serde(default = "defaults::pool_store_path")]
    pub pool_store_path: String,

    // --- KMS configuration (signer_mode = kms) ---
    #[serde(default)]
    pub signer_mode: SignerMode,

    #[serde(default = "defaults::gcp_kms_project")]
    pub gcp_kms_project: String,

    #[serde(default = "defaults::gcp_kms_location")]
    pub gcp_kms_location: String,

    #[serde(default = "defaults::gcp_kms_keyring")]
    pub gcp_kms_keyring: String,

    #[serde(default = "defaults::gcp_kms_pool_size")]
    pub gcp_kms_pool_size: u32,

    /// Admin signer key name in KMS. Env: `GCP_KMS_ADMIN_KEY`.
    #[serde(default = "defaults::gcp_kms_admin_key")]
    pub gcp_kms_admin_key: String,

    /// Env: `RELAYER_ALLOWED_METHODS` (comma-separated, default: `execute`).
    #[serde(default = "defaults::allowed_methods")]
    pub allowed_methods: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            rpc_url: defaults::rpc_url(),
            fallback_rpc_url: defaults::fallback_rpc_url(),
            contract_id: defaults::contract_id(),
            relayer_account_id: defaults::relayer_account_id(),
            keys_path: defaults::keys_path(),
            bind_address: defaults::bind_address(),
            gas_tgas: defaults::gas_tgas(),
            storage_deposit: defaults::storage_deposit(),
            admin_key_path: defaults::admin_key_path(),
            pool_store_path: defaults::pool_store_path(),
            signer_mode: SignerMode::default(),
            gcp_kms_project: defaults::gcp_kms_project(),
            gcp_kms_location: defaults::gcp_kms_location(),
            gcp_kms_keyring: defaults::gcp_kms_keyring(),
            gcp_kms_pool_size: defaults::gcp_kms_pool_size(),
            gcp_kms_admin_key: defaults::gcp_kms_admin_key(),
            allowed_methods: defaults::allowed_methods(),
        }
    }
}

/// Autoscaling thresholds and limits for the key pool.
#[derive(Debug, Clone)]
pub struct ScalingConfig {
    pub min_keys: u32,
    pub max_keys: u32,
    /// Scale-up threshold: avg in-flight TXs per key.
    pub scale_up_per_key: f32,
    /// Scale-down threshold (must also exceed `scale_down_idle`).
    pub scale_down_per_key: f32,
    pub scale_down_idle: Duration,
    pub cooldown: Duration,
    pub batch_size: u32,
    pub max_key_age: Duration,
    /// Pre-warmed spare keys on-chain. Promote to ACTIVE in ~0ms on spikes. 0 = disabled.
    pub warm_buffer: u32,
}

impl Default for ScalingConfig {
    fn default() -> Self {
        let mut cfg = Self {
            min_keys: std::env::var("RELAYER_MIN_KEYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2),
            max_keys: std::env::var("RELAYER_MAX_KEYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100),
            scale_up_per_key: std::env::var("RELAYER_SCALE_UP_PER_KEY")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10.0),
            scale_down_per_key: std::env::var("RELAYER_SCALE_DOWN_PER_KEY")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2.0),
            scale_down_idle: Duration::from_secs(300),
            cooldown: Duration::from_secs(30),
            batch_size: 5,
            warm_buffer: std::env::var("RELAYER_WARM_BUFFER")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2),
            max_key_age: Duration::from_secs(
                std::env::var("RELAYER_MAX_KEY_AGE")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(86400),
            ),
        };
        if cfg.max_keys < cfg.min_keys {
            tracing::warn!(
                min_keys = cfg.min_keys,
                max_keys = cfg.max_keys,
                "max_keys < min_keys — clamping max_keys to min_keys"
            );
            cfg.max_keys = cfg.min_keys;
        }
        const ABSOLUTE_MAX: u32 = 200;
        if cfg.max_keys > ABSOLUTE_MAX {
            tracing::warn!(
                max_keys = cfg.max_keys,
                cap = ABSOLUTE_MAX,
                "max_keys exceeds absolute cap — clamping"
            );
            cfg.max_keys = ABSOLUTE_MAX;
        }
        cfg
    }
}

mod defaults {
    // URL constants synced with: packages/onsocial-rpc/src/index.ts
    // Primary: Private Lava (LAVA_API_KEY from GSM/env)
    // Fallback: FASTNEAR public endpoints
    fn build_lava_url(network: &str) -> Option<String> {
        let key = std::env::var("LAVA_API_KEY").ok()?;
        if key.is_empty() {
            return None;
        }
        let chain = if network.contains("mainnet") {
            "near"
        } else {
            "neart"
        };
        Some(format!(
            "https://g.w.lavanet.xyz/gateway/{chain}/rpc-http/{key}"
        ))
    }

    fn network() -> String {
        std::env::var("RELAYER_NETWORK")
            .or_else(|_| std::env::var("NEAR_NETWORK"))
            .unwrap_or_else(|_| "testnet".into())
    }

    pub fn rpc_url() -> String {
        if let Ok(url) = std::env::var("RELAYER_RPC_URL") {
            if !url.is_empty() {
                return url;
            }
        }
        let net = network();
        if let Some(url) = build_lava_url(&net) {
            return url;
        }
        if net.contains("mainnet") {
            "https://near.lava.build".into()
        } else {
            "https://neart.lava.build".into()
        }
    }

    pub fn fallback_rpc_url() -> String {
        let net = network();
        if net.contains("mainnet") {
            "https://free.rpc.fastnear.com".into()
        } else {
            "https://test.rpc.fastnear.com".into()
        }
    }

    pub fn contract_id() -> String {
        std::env::var("RELAYER_CONTRACT_ID").unwrap_or_else(|_| {
            let net = network();
            if net.contains("mainnet") {
                "core.onsocial.near".into()
            } else {
                "core.onsocial.testnet".into()
            }
        })
    }

    pub fn relayer_account_id() -> String {
        std::env::var("RELAYER_ACCOUNT_ID").unwrap_or_else(|_| {
            let net = network();
            if net.contains("mainnet") {
                "relayer.onsocial.near".into()
            } else {
                "relayer.onsocial.testnet".into()
            }
        })
    }

    pub fn keys_path() -> String {
        let net = network();
        if net.contains("mainnet") {
            "./account_keys/relayer.onsocial.near.json".into()
        } else {
            "./account_keys/relayer.onsocial.testnet.json".into()
        }
    }

    pub fn bind_address() -> String {
        "0.0.0.0:3040".into()
    }

    pub fn gas_tgas() -> u64 {
        100
    }

    pub fn storage_deposit() -> u128 {
        std::env::var("RELAYER_STORAGE_DEPOSIT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0)
    }

    pub fn admin_key_path() -> String {
        std::env::var("RELAYER_ADMIN_KEY_PATH")
            .unwrap_or_else(|_| "./account_keys/relayer-admin.json".into())
    }

    pub fn pool_store_path() -> String {
        std::env::var("RELAYER_POOL_STORE_PATH").unwrap_or_else(|_| "./data/pool_keys.enc".into())
    }

    pub fn gcp_kms_project() -> String {
        std::env::var("GCP_KMS_PROJECT").unwrap_or_default()
    }

    pub fn gcp_kms_location() -> String {
        std::env::var("GCP_KMS_LOCATION").unwrap_or_else(|_| "global".into())
    }

    pub fn gcp_kms_keyring() -> String {
        std::env::var("GCP_KMS_KEYRING").unwrap_or_default()
    }

    pub fn gcp_kms_pool_size() -> u32 {
        std::env::var("GCP_KMS_POOL_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10)
    }

    pub fn gcp_kms_admin_key() -> String {
        std::env::var("GCP_KMS_ADMIN_KEY").unwrap_or_else(|_| "admin-key".into())
    }

    pub fn allowed_methods() -> Vec<String> {
        std::env::var("RELAYER_ALLOWED_METHODS")
            .ok()
            .map(|v| {
                v.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_else(|| vec!["execute".into()])
    }
}
