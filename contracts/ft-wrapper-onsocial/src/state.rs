use crate::errors::FtWrapperError;
use crate::types::StorageBalance;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, AccountId};
use near_sdk_macros::NearSchema;

#[derive(BorshSerialize, BorshDeserialize, NearSchema)]
#[abi(borsh)]
pub struct FtWrapperContractState {
    pub version: String,
    pub manager: AccountId,
    pub relayer_contract: AccountId,
    pub supported_tokens: Vec<AccountId>,
    pub storage_deposit: U128,
    pub cross_contract_gas: u64,
    pub storage_balances: LookupMap<(AccountId, AccountId), StorageBalance>,
    pub min_balance: u128,
    pub max_balance: u128,
    pub fee_percentage: u64, // Added for 0.1.1
}

impl FtWrapperContractState {
    pub fn new(manager: AccountId, relayer_contract: AccountId, storage_deposit: U128) -> Self {
        Self {
            version: "0.1.1".to_string(), // Updated to 0.1.1
            manager,
            relayer_contract,
            supported_tokens: Vec::new(),
            storage_deposit,
            cross_contract_gas: 100_000_000_000_000,
            storage_balances: LookupMap::new(b"s".to_vec()),
            min_balance: 10_000_000_000_000_000_000_000_000,
            max_balance: 1_000_000_000_000_000_000_000_000_000,
            fee_percentage: 0, // Default value
        }
    }

    pub fn is_manager(&self, account_id: &AccountId) -> bool {
        &self.manager == account_id
    }

    pub fn assert_balance(&self) -> Result<(), FtWrapperError> {
        let balance = env::account_balance().as_yoctonear();
        if balance < self.min_balance {
            return Err(FtWrapperError::LowBalance);
        }
        Ok(())
    }

    pub fn set_manager(&mut self, new_manager: AccountId) -> Result<(), FtWrapperError> {
        let caller = env::predecessor_account_id();
        if !self.is_manager(&caller) {
            return Err(FtWrapperError::Unauthorized);
        }
        self.manager = new_manager.clone();
        Ok(())
    }
}
