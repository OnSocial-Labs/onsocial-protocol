//! Relayer configuration.

use serde::{Deserialize, Deserializer};

/// Signing backend.
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

    #[serde(default = "defaults::relayer_account_id")]
    pub relayer_account_id: String,

    /// Stable instance name used to partition KMS signer lanes across replicas.
    #[serde(default = "defaults::instance_name")]
    pub instance_name: String,

    #[serde(default = "defaults::keys_path")]
    pub keys_path: String,

    #[serde(default = "defaults::bind_address")]
    pub bind_address: String,

    #[serde(default = "defaults::gas_tgas")]
    pub gas_tgas: u64,

    #[serde(default = "defaults::admin_key_path")]
    pub admin_key_path: String,

    /// Local delegate signer store path used only in local signing mode.
    #[serde(default = "defaults::delegate_store_path")]
    pub delegate_store_path: String,

    /// Number of FullAccess signer lanes dedicated to relayer submissions.
    #[serde(default = "defaults::delegate_pool_size")]
    pub delegate_pool_size: u32,

    #[serde(default)]
    pub signer_mode: SignerMode,

    #[serde(default = "defaults::gcp_kms_project")]
    pub gcp_kms_project: String,

    #[serde(default = "defaults::gcp_kms_location")]
    pub gcp_kms_location: String,

    #[serde(default = "defaults::gcp_kms_keyring")]
    pub gcp_kms_keyring: String,

    #[serde(default = "defaults::gcp_kms_admin_key")]
    pub gcp_kms_admin_key: String,

    #[serde(default = "defaults::allowed_methods")]
    pub allowed_methods: Vec<String>,

    /// Rewards contract used by the private service relay endpoint.
    #[serde(default = "defaults::rewards_contract_id")]
    pub rewards_contract_id: String,

    /// Social-spend contract used by the private settlement publisher endpoint.
    #[serde(default = "defaults::social_spend_contract_id")]
    pub social_spend_contract_id: String,

    /// Canonical contract allowlist.
    #[serde(
        default = "defaults::allowed_contracts",
        deserialize_with = "deserialize_allowed_contracts"
    )]
    pub allowed_contracts: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            rpc_url: defaults::rpc_url(),
            fallback_rpc_url: defaults::fallback_rpc_url(),
            relayer_account_id: defaults::relayer_account_id(),
            instance_name: defaults::instance_name(),
            keys_path: defaults::keys_path(),
            bind_address: defaults::bind_address(),
            gas_tgas: defaults::gas_tgas(),
            admin_key_path: defaults::admin_key_path(),
            delegate_store_path: defaults::delegate_store_path(),
            delegate_pool_size: defaults::delegate_pool_size(),
            signer_mode: SignerMode::default(),
            gcp_kms_project: defaults::gcp_kms_project(),
            gcp_kms_location: defaults::gcp_kms_location(),
            gcp_kms_keyring: defaults::gcp_kms_keyring(),
            gcp_kms_admin_key: defaults::gcp_kms_admin_key(),
            allowed_methods: defaults::allowed_methods(),
            rewards_contract_id: defaults::rewards_contract_id(),
            social_spend_contract_id: defaults::social_spend_contract_id(),
            allowed_contracts: defaults::allowed_contracts(),
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum AllowedContractsInput {
    List(Vec<String>),
    String(String),
}

fn deserialize_allowed_contracts<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let input = AllowedContractsInput::deserialize(deserializer)?;

    Ok(match input {
        AllowedContractsInput::List(contracts) => contracts,
        AllowedContractsInput::String(contracts) => contracts
            .split(',')
            .map(str::trim)
            .filter(|contract| !contract.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
    })
}

mod defaults {
    fn build_lava_url(network: &str, lava_api_key: Option<&str>) -> Option<String> {
        let key = lava_api_key?;
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

    fn default_fastnear_url(network: &str) -> String {
        if network.contains("mainnet") {
            "https://free.rpc.fastnear.com".into()
        } else {
            "https://test.rpc.fastnear.com".into()
        }
    }

    pub(super) fn resolve_rpc_url(
        network: &str,
        explicit_url: Option<String>,
        lava_api_key: Option<String>,
    ) -> String {
        if let Some(url) = explicit_url.filter(|url| !url.is_empty()) {
            return url;
        }

        if let Some(url) = build_lava_url(network, lava_api_key.as_deref()) {
            return url;
        }

        default_fastnear_url(network)
    }

    pub fn rpc_url() -> String {
        let net = network();
        resolve_rpc_url(
            &net,
            std::env::var("RELAYER_RPC_URL").ok(),
            std::env::var("LAVA_API_KEY").ok(),
        )
    }

    pub fn fallback_rpc_url() -> String {
        let net = network();
        resolve_rpc_url(&net, std::env::var("RELAYER_FALLBACK_RPC_URL").ok(), None)
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

    pub fn instance_name() -> String {
        std::env::var("RELAYER_INSTANCE_NAME").unwrap_or_else(|_| "relayer".into())
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

    pub fn admin_key_path() -> String {
        std::env::var("RELAYER_ADMIN_KEY_PATH")
            .unwrap_or_else(|_| "./account_keys/relayer-admin.json".into())
    }

    pub fn delegate_store_path() -> String {
        std::env::var("RELAYER_DELEGATE_STORE_PATH")
            .unwrap_or_else(|_| "./data/delegate_signers.enc".into())
    }

    pub fn delegate_pool_size() -> u32 {
        let default_size = 50;
        std::env::var("RELAYER_DELEGATE_POOL_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(default_size)
            .max(1)
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

    pub fn gcp_kms_admin_key() -> String {
        std::env::var("GCP_KMS_ADMIN_KEY").unwrap_or_else(|_| "admin-key".into())
    }

    pub fn allowed_methods() -> Vec<String> {
        vec!["execute".into(), "execute_admin".into()]
    }

    pub fn rewards_contract_id() -> String {
        std::env::var("RELAYER_REWARDS_CONTRACT_ID")
            .or_else(|_| std::env::var("REWARDS_CONTRACT"))
            .unwrap_or_else(|_| rewards_contract_id_for_network(&network()))
    }

    pub(super) fn rewards_contract_id_for_network(network: &str) -> String {
        if network.contains("mainnet") {
            "rewards.onsocial.near".into()
        } else {
            "rewards.onsocial.testnet".into()
        }
    }

    pub fn social_spend_contract_id() -> String {
        std::env::var("RELAYER_SOCIAL_SPEND_CONTRACT_ID")
            .or_else(|_| std::env::var("SOCIAL_SPEND_CONTRACT"))
            .unwrap_or_else(|_| social_spend_contract_id_for_network(&network()))
    }

    pub(super) fn social_spend_contract_id_for_network(network: &str) -> String {
        if network.contains("mainnet") {
            "social-spend.onsocial.near".into()
        } else {
            "social-spend.onsocial.testnet".into()
        }
    }

    pub fn allowed_contracts() -> Vec<String> {
        allowed_contracts_for_network(&network())
    }

    pub(super) fn allowed_contracts_for_network(network: &str) -> Vec<String> {
        if network.contains("mainnet") {
            vec!["rewards.onsocial.near".into()]
        } else {
            vec![
                "core.onsocial.testnet".into(),
                "scarces.onsocial.testnet".into(),
                "rewards.onsocial.testnet".into(),
            ]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::defaults;

    #[test]
    fn resolve_rpc_url_prefers_explicit_env_override() {
        let url = defaults::resolve_rpc_url(
            "mainnet",
            Some("https://custom-rpc.example.com".into()),
            Some("lava-key".into()),
        );

        assert_eq!(url, "https://custom-rpc.example.com");
    }

    #[test]
    fn resolve_rpc_url_uses_keyed_lava_before_fastnear() {
        let url = defaults::resolve_rpc_url("mainnet", None, Some("lava-key".into()));

        assert_eq!(
            url,
            "https://g.w.lavanet.xyz/gateway/near/rpc-http/lava-key"
        );
    }

    #[test]
    fn resolve_rpc_url_falls_back_to_fastnear_without_lava_key() {
        let url = defaults::resolve_rpc_url("mainnet", None, None);

        assert_eq!(url, "https://free.rpc.fastnear.com");
    }

    #[test]
    fn resolve_rpc_url_uses_testnet_fastnear_without_lava_key() {
        let url = defaults::resolve_rpc_url("testnet", None, None);

        assert_eq!(url, "https://test.rpc.fastnear.com");
    }

    #[test]
    fn default_allowed_contracts_include_all_testnet_contracts() {
        let contracts = defaults::allowed_contracts_for_network("testnet");

        assert!(contracts
            .iter()
            .any(|contract| contract == "core.onsocial.testnet"));
        assert!(contracts
            .iter()
            .any(|contract| contract == "scarces.onsocial.testnet"));
        assert!(contracts
            .iter()
            .any(|contract| contract == "rewards.onsocial.testnet"));
    }

    #[test]
    fn default_allowed_contracts_only_include_rewards_on_mainnet() {
        let contracts = defaults::allowed_contracts_for_network("mainnet");

        assert_eq!(contracts, vec!["rewards.onsocial.near".to_string()]);
    }

    #[test]
    fn default_rewards_contract_tracks_network() {
        assert_eq!(
            defaults::rewards_contract_id_for_network("mainnet"),
            "rewards.onsocial.near"
        );
        assert_eq!(
            defaults::rewards_contract_id_for_network("testnet"),
            "rewards.onsocial.testnet"
        );
    }

    #[test]
    fn default_social_spend_contract_tracks_network() {
        assert_eq!(
            defaults::social_spend_contract_id_for_network("mainnet"),
            "social-spend.onsocial.near"
        );
        assert_eq!(
            defaults::social_spend_contract_id_for_network("testnet"),
            "social-spend.onsocial.testnet"
        );
    }

    #[test]
    fn rewards_contract_prefers_explicit_override() {
        unsafe {
            std::env::set_var("RELAYER_REWARDS_CONTRACT_ID", "custom-rewards.testnet");
        }

        assert_eq!(defaults::rewards_contract_id(), "custom-rewards.testnet");

        unsafe {
            std::env::remove_var("RELAYER_REWARDS_CONTRACT_ID");
        }
    }

    #[test]
    fn social_spend_contract_prefers_explicit_override() {
        unsafe {
            std::env::set_var(
                "RELAYER_SOCIAL_SPEND_CONTRACT_ID",
                "custom-social-spend.testnet",
            );
        }

        assert_eq!(
            defaults::social_spend_contract_id(),
            "custom-social-spend.testnet"
        );

        unsafe {
            std::env::remove_var("RELAYER_SOCIAL_SPEND_CONTRACT_ID");
        }
    }

    #[test]
    fn config_parses_allowed_contracts_from_csv_string() {
        let config: super::Config = serde_json::from_value(serde_json::json!({
            "allowed_contracts": "rewards.onsocial.near, core.onsocial.near"
        }))
        .expect("config should deserialize");

        assert_eq!(
            config.allowed_contracts,
            vec![
                "rewards.onsocial.near".to_string(),
                "core.onsocial.near".to_string()
            ]
        );
    }

    #[test]
    fn config_parses_allowed_contracts_from_array() {
        let config: super::Config = serde_json::from_value(serde_json::json!({
            "allowed_contracts": ["rewards.onsocial.near", "core.onsocial.near"]
        }))
        .expect("config should deserialize");

        assert_eq!(
            config.allowed_contracts,
            vec![
                "rewards.onsocial.near".to_string(),
                "core.onsocial.near".to_string()
            ]
        );
    }
}
