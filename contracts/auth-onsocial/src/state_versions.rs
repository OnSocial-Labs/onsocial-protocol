use near_sdk::borsh::{BorshSerialize, BorshDeserialize};
use near_sdk::store::{LookupMap, IterableSet, Vector};
use near_sdk::AccountId;
use crate::types::KeyInfo;

#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
pub struct StateV010 {
    pub version: String,
    pub keys: LookupMap<AccountId, IterableSet<KeyInfo>>,
    pub last_active_timestamps: LookupMap<AccountId, u64>,
    pub registered_accounts: Vector<AccountId>,
    pub manager: AccountId,
}

#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
pub struct StateV011 {
    pub version: String,
    pub keys: LookupMap<AccountId, IterableSet<KeyInfo>>,
    pub last_active_timestamps: LookupMap<AccountId, u64>,
    pub registered_accounts: Vector<AccountId>,
    pub manager: AccountId,
    pub max_keys_per_account: u32,
}