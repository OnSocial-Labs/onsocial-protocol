use crate::types::StorageBalance;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::AccountId;

/// State for version 0.1.0
#[derive(BorshSerialize, BorshDeserialize)]
pub struct StateV010 {
    pub version: String,
    pub manager: AccountId,
    pub relayer_contract: AccountId,
    pub supported_tokens: Vec<AccountId>,
    pub storage_deposit: U128,
    pub cross_contract_gas: u64,
    pub storage_balances: LookupMap<(AccountId, AccountId), StorageBalance>,
    pub min_balance: u128,
    pub max_balance: u128,
}
