//! Relayer configuration.

use serde::Deserialize;

/// Configuration for the simple relayer.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "defaults::rpc_url")]
    pub rpc_url: String,

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
            contract_id: defaults::contract_id(),
            keys_path: defaults::keys_path(),
            bind_address: defaults::bind_address(),
            gas_tgas: defaults::gas_tgas(),
        }
    }
}

mod defaults {
    pub fn rpc_url() -> String {
        "https://rpc.testnet.near.org".into()
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
