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

impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            max_key_length: 256,
            max_path_depth: 12,
            max_batch_size: 10,
            max_value_bytes: 10 * 1024,
            platform_onboarding_bytes: default_platform_onboarding_bytes(),
            platform_daily_refill_bytes: default_platform_daily_refill_bytes(),
            platform_allowance_max_bytes: default_platform_allowance_max_bytes(),
            intents_executors: Vec::new(),
        }
    }
}

pub fn validate_intents_executors(executors: &[AccountId]) -> Result<(), &'static str> {
    if executors.len() > 50 {
        return Err("Too many intents executors");
    }
    let mut copy = executors.to_vec();
    copy.sort();
    copy.dedup();
    if copy.len() != executors.len() {
        return Err("Duplicate intents executor entries");
    }
    Ok(())
}

impl GovernanceConfig {
    pub fn validate_patch(
        &self,
        max_key_length: Option<u16>,
        max_path_depth: Option<u16>,
        max_batch_size: Option<u16>,
        max_value_bytes: Option<u32>,
        intents_executors: Option<&[AccountId]>,
    ) -> Result<(), &'static str> {
        let new_key = max_key_length.unwrap_or(self.max_key_length);
        let new_path = max_path_depth.unwrap_or(self.max_path_depth);
        let new_batch = max_batch_size.unwrap_or(self.max_batch_size);
        let new_value = max_value_bytes.unwrap_or(self.max_value_bytes);

        if new_key == 0 || new_path == 0 || new_batch == 0 || new_value == 0 {
            return Err("Safety limits must be non-zero");
        }

        if new_key < self.max_key_length
            || new_path < self.max_path_depth
            || new_batch < self.max_batch_size
            || new_value < self.max_value_bytes
        {
            return Err("Safety limits can only be increased");
        }

        if let Some(executors) = intents_executors {
            validate_intents_executors(executors)?;
        }

        Ok(())
    }

    pub fn validate_update(&self, current: &GovernanceConfig) -> Result<(), &'static str> {
        current.validate_patch(
            Some(self.max_key_length),
            Some(self.max_path_depth),
            Some(self.max_batch_size),
            Some(self.max_value_bytes),
            Some(&self.intents_executors),
        )
    }
}
