//! Relayer configuration.

use serde::Deserialize;

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
}
