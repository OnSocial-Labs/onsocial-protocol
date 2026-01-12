use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::AccountId;
use near_sdk::NearSchema;

#[derive(NearSchema, BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct GovernanceConfig {
    pub max_key_length: u16,
    pub max_path_depth: u16,
    pub max_batch_size: u16,

    #[serde(default = "default_max_value_bytes")]
    pub max_value_bytes: u32,

    #[serde(default = "default_platform_onboarding_bytes")]
    pub platform_onboarding_bytes: u64,
    #[serde(default = "default_platform_daily_refill_bytes")]
    pub platform_daily_refill_bytes: u64,
    #[serde(default = "default_platform_allowance_max_bytes")]
    pub platform_allowance_max_bytes: u64,

    #[serde(default)]
    pub intents_executors: Vec<AccountId>,
}

fn default_platform_onboarding_bytes() -> u64 { 10_000 }
fn default_platform_daily_refill_bytes() -> u64 { 3_000 }
fn default_platform_allowance_max_bytes() -> u64 { 6_000 }
fn default_max_value_bytes() -> u32 { 10 * 1024 }

impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            max_key_length: 256,
            max_path_depth: 12,
            max_batch_size: 10,
            max_value_bytes: default_max_value_bytes(),
            platform_onboarding_bytes: default_platform_onboarding_bytes(),
            platform_daily_refill_bytes: default_platform_daily_refill_bytes(),
            platform_allowance_max_bytes: default_platform_allowance_max_bytes(),
            intents_executors: Vec::new(),
        }
    }
}

impl GovernanceConfig {
    pub fn validate_update(&self, current: &GovernanceConfig) -> Result<(), &'static str> {
        if self.max_key_length == 0
            || self.max_path_depth == 0
            || self.max_batch_size == 0
            || self.max_value_bytes == 0
        {
            return Err("Safety limits must be non-zero");
        }

        if self.max_key_length < current.max_key_length
            || self.max_batch_size < current.max_batch_size
            || self.max_path_depth < current.max_path_depth
            || self.max_value_bytes < current.max_value_bytes
        {
            return Err("Configuration values can only be increased");
        }

        // Keep the allowlist small and non-ambiguous.
        if self.intents_executors.len() > 50 {
            return Err("Too many intents executors");
        }
        let mut copy = self.intents_executors.clone();
        copy.sort();
        copy.dedup();
        if copy.len() != self.intents_executors.len() {
            return Err("Duplicate intents executor entries");
        }

        Ok(())
    }
}
