//! Relayer configuration.

use serde::Deserialize;
use std::time::Duration;

/// Configuration for the simple relayer.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "defaults::rpc_url")]
    pub rpc_url: String,

    #[serde(default = "defaults::fallback_rpc_url")]
    pub fallback_rpc_url: String,

    #[serde(default = "defaults::contract_id")]
    pub contract_id: String,

    #[serde(default = "defaults::keys_path")]
    pub keys_path: String,

    #[serde(default = "defaults::bind_address")]
    pub bind_address: String,

    #[serde(default = "defaults::gas_tgas")]
    pub gas_tgas: u64,

    /// Path to admin full-access key (for AddKey/DeleteKey).
    #[serde(default = "defaults::admin_key_path")]
    pub admin_key_path: String,

    /// Path to encrypted key store.
    #[serde(default = "defaults::pool_store_path")]
    pub pool_store_path: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            rpc_url: defaults::rpc_url(),
            fallback_rpc_url: defaults::fallback_rpc_url(),
            contract_id: defaults::contract_id(),
            keys_path: defaults::keys_path(),
            bind_address: defaults::bind_address(),
            gas_tgas: defaults::gas_tgas(),
            admin_key_path: defaults::admin_key_path(),
            pool_store_path: defaults::pool_store_path(),
        }
    }
}

/// Scaling configuration for the key pool.
#[derive(Debug, Clone)]
pub struct ScalingConfig {
    pub min_keys: u32,
    pub max_keys: u32,
    pub scale_up_threshold: f32,
    pub scale_down_threshold: f32,
    pub scale_down_idle: Duration,
    pub cooldown: Duration,
    pub batch_size: u32,
    pub max_key_age: Duration,
}

impl Default for ScalingConfig {
    fn default() -> Self {
        Self {
            min_keys: std::env::var("RELAYER_MIN_KEYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2),
            max_keys: std::env::var("RELAYER_MAX_KEYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100),
            scale_up_threshold: 0.8,
            scale_down_threshold: 0.2,
            scale_down_idle: Duration::from_secs(300),
            cooldown: Duration::from_secs(30),
            batch_size: 5,
            max_key_age: Duration::from_secs(
                std::env::var("RELAYER_MAX_KEY_AGE")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(86400),
            ),
        }
    }
}

mod defaults {
    /// Build a private Lava RPC URL from API key + network.
    fn build_lava_url(network: &str) -> Option<String> {
        let key = std::env::var("LAVA_API_KEY").ok()?;
        if key.is_empty() {
            return None;
        }
        let chain = if network.contains("mainnet") { "near" } else { "neart" };
        Some(format!("https://g.w.lavanet.xyz/gateway/{chain}/rpc-http/{key}"))
    }

    fn network() -> String {
        std::env::var("RELAYER_NETWORK")
            .or_else(|_| std::env::var("NEAR_NETWORK"))
            .unwrap_or_else(|_| "testnet".into())
    }

    pub fn rpc_url() -> String {
        // Priority: RELAYER_RPC_URL > LAVA_API_KEY > public Lava
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
        "core.onsocial.testnet".into()
    }

    pub fn keys_path() -> String {
        "./account_keys/relayer.onsocial.testnet.json".into()
    }

    pub fn bind_address() -> String {
        "0.0.0.0:3040".into()
    }

    pub fn gas_tgas() -> u64 {
        100
    }

    pub fn admin_key_path() -> String {
        std::env::var("RELAYER_ADMIN_KEY_PATH")
            .unwrap_or_else(|_| "./account_keys/relayer-admin.json".into())
    }

    pub fn pool_store_path() -> String {
        std::env::var("RELAYER_POOL_STORE_PATH")
            .unwrap_or_else(|_| "./data/pool_keys.enc".into())
    }
}
