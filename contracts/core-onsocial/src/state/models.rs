use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::store::LookupMap;
use near_sdk::{env, AccountId};
use near_sdk_macros::NearSchema;

use crate::config::GovernanceConfig;

#[derive(
    NearSchema, BorshDeserialize, BorshSerialize, serde::Serialize, serde::Deserialize, Clone,
)]
#[abi(json, borsh)]
pub enum DataValue {
    Value(Vec<u8>),
    Deleted(u64),
}

#[derive(
    NearSchema, BorshDeserialize, BorshSerialize, serde::Serialize, serde::Deserialize, Clone,
)]
#[abi(json, borsh)]
pub struct DataEntry {
    pub value: DataValue,
    pub block_height: u64,
}

#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Default,
)]
#[abi(json, borsh)]
pub struct SharedStoragePool {
    pub storage_balance: u128,
    pub used_bytes: u64,
    /// Sum of per-account max allocations (may exceed capacity).
    pub shared_bytes: u64,
}

impl SharedStoragePool {
    pub fn available_bytes(&self) -> u64 {
        let total_capacity_u128 = self.storage_balance / env::storage_byte_cost().as_yoctonear();
        let total_capacity_bytes = u64::try_from(total_capacity_u128).unwrap_or(u64::MAX);
        total_capacity_bytes.saturating_sub(self.used_bytes)
    }

    pub fn can_allocate_additional(&self, additional_bytes: u64) -> bool {
        self.available_bytes() >= additional_bytes
    }

    pub fn group_pool_key(group_id: &str) -> Result<AccountId, crate::errors::SocialError> {
        if group_id.is_empty() {
            return Err(crate::invalid_input!("group_id cannot be empty"));
        }
        format!("{}{}{}", crate::constants::GROUP_POOL_PREFIX, group_id, crate::constants::GROUP_POOL_SUFFIX)
            .parse()
            .map_err(|_| crate::invalid_input!(format!("Invalid group_id for pool key: {}", group_id)))
    }

    pub fn extract_group_id_from_pool_key(pool_id: &AccountId) -> Option<String> {
        let s = pool_id.as_str();
        s.strip_prefix(crate::constants::GROUP_POOL_PREFIX)?
            .strip_suffix(crate::constants::GROUP_POOL_SUFFIX)
            .filter(|id| !id.is_empty())
            .map(String::from)
    }

    pub fn extract_group_id_from_path(path: &str) -> Option<String> {
        crate::storage::utils::extract_group_id_from_path(path)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
    }
}

#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Default,
    Debug,
)]
#[abi(json, borsh)]
pub struct GroupSponsorAccount {
    /// True = explicit override; false = derived from group default (lazily synced).
    #[serde(default)]
    pub is_override: bool,

    /// Version of group default last applied; enables lazy sync without iteration.
    #[serde(default)]
    pub applied_default_version: u64,

    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub daily_refill_bytes: u64,
    #[serde(default)]
    pub allowance_max_bytes: u64,
    #[serde(default)]
    pub allowance_bytes: u64,
    #[serde(default)]
    pub last_refill_ns: u64,
}

#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Default,
    Debug,
)]
#[abi(json, borsh)]
pub struct GroupSponsorDefault {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub daily_refill_bytes: u64,
    #[serde(default)]
    pub allowance_max_bytes: u64,

    /// Monotonic; incremented on update to trigger lazy sync of derived quotas.
    #[serde(default)]
    pub version: u64,
}

impl GroupSponsorAccount {
    pub fn refill(&mut self, now_ns: u64) {
        if !self.enabled {
            return;
        }

        if self.last_refill_ns == 0 {
            self.last_refill_ns = now_ns;
            return;
        }

        let elapsed_ns = now_ns.saturating_sub(self.last_refill_ns);
        // Rate-limit: skip sub-minute intervals.
        if elapsed_ns < crate::constants::NANOS_PER_MINUTE {
            return;
        }

        // At/above max: advance timestamp only (no clamp-down, no refill accumulation).
        if self.allowance_bytes >= self.allowance_max_bytes {
            self.last_refill_ns = now_ns;
            return;
        }

        let refill_u128 = (elapsed_ns as u128)
            .saturating_mul(self.daily_refill_bytes as u128)
            / (crate::constants::NANOS_PER_DAY as u128);

        let refill_bytes = u64::try_from(refill_u128).unwrap_or(u64::MAX);
        if refill_bytes > 0 {
            self.allowance_bytes = self
                .allowance_bytes
                .saturating_add(refill_bytes)
                .min(self.allowance_max_bytes);
            self.last_refill_ns = now_ns;
        }
    }

    #[inline(always)]
    pub fn can_spend(&self, bytes: u64) -> bool {
        !self.enabled || self.allowance_bytes >= bytes
    }

    #[inline(always)]
    pub fn spend(&mut self, bytes: u64) {
        if self.enabled {
            self.allowance_bytes = self.allowance_bytes.saturating_sub(bytes);
        }
    }
}
#[derive(
    NearSchema,
    BorshDeserialize,
    BorshSerialize,
    serde::Serialize,
    serde::Deserialize,
    Clone,
    Copy,
    PartialEq,
    Debug,
)]
#[abi(json, borsh)]
pub enum ContractStatus {
    Genesis,
    Live,
    ReadOnly,
}

#[derive(NearSchema, BorshDeserialize, BorshSerialize)]
#[abi(borsh)]
pub struct SocialPlatform {
    pub version: String,
    pub status: ContractStatus,
    pub manager: AccountId,
    pub config: GovernanceConfig,
    pub shared_storage_pools: LookupMap<AccountId, SharedStoragePool>,
    pub user_storage: LookupMap<AccountId, crate::storage::Storage>,
    pub group_pool_usage: LookupMap<String, u64>,
    pub group_sponsor_quotas: LookupMap<String, GroupSponsorAccount>,
    pub group_sponsor_defaults: LookupMap<String, GroupSponsorDefault>,
    /// Temporary override for storage payer during proposal execution.
    /// When set, group path storage is charged to this account instead of predecessor.
    /// This ensures proposers pay for execution costs from their deposited balance.
    #[borsh(skip)]
    pub execution_payer: Option<AccountId>,
}
