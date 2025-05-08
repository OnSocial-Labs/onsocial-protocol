use crate::errors::FtWrapperError;
use crate::events::FtWrapperEvent;
use crate::state_versions::StateV010;
use crate::types::StorageBalance;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, AccountId};
use near_sdk_macros::NearSchema;
use semver::Version;

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
    pub fee_percentage: u64,
}

impl FtWrapperContractState {
    pub fn new(manager: AccountId, relayer_contract: AccountId, storage_deposit: U128) -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            manager,
            relayer_contract,
            supported_tokens: Vec::new(),
            storage_deposit,
            cross_contract_gas: 100_000_000_000_000,
            storage_balances: LookupMap::new(b"s".to_vec()),
            min_balance: 10_000_000_000_000_000_000_000_000,
            max_balance: 1_000_000_000_000_000_000_000_000_000,
            fee_percentage: 0,
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
        self.manager = new_manager;
        Ok(())
    }

    pub fn migrate() -> Self {
        const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
        let current_version =
            Version::parse(CURRENT_VERSION).expect("Invalid current version in Cargo.toml");

        let state_bytes: Vec<u8> = env::state_read().unwrap_or_default();

        // Try current version
        if let Ok(state) = borsh::from_slice::<FtWrapperContractState>(&state_bytes) {
            if let Ok(state_version) = Version::parse(&state.version) {
                if state_version >= current_version {
                    env::log_str("State is at current or newer version, no migration needed");
                    return state;
                }
            }
        }

        // Try version 0.1.0
        if let Ok(old_state) = borsh::from_slice::<StateV010>(&state_bytes) {
            if let Ok(old_version) = Version::parse(&old_state.version) {
                if old_version <= Version::parse("0.1.0").unwrap() {
                    env::log_str(&format!(
                        "Migrating from state version {}",
                        old_state.version
                    ));
                    let new_state = FtWrapperContractState {
                        version: CURRENT_VERSION.to_string(),
                        manager: old_state.manager,
                        relayer_contract: old_state.relayer_contract,
                        supported_tokens: old_state.supported_tokens,
                        storage_deposit: old_state.storage_deposit,
                        cross_contract_gas: old_state.cross_contract_gas,
                        storage_balances: old_state.storage_balances,
                        min_balance: old_state.min_balance,
                        max_balance: old_state.max_balance,
                        fee_percentage: 0,
                    };
                    FtWrapperEvent::StateMigrated {
                        old_version: old_state.version,
                        new_version: CURRENT_VERSION.to_string(),
                    }
                    .emit();
                    return new_state;
                }
            }
        }

        // If no valid state was found or version is unknown, initialize a new state
        env::log_str("No valid prior state found or unknown version, initializing new state");
        Self::new(
            env::current_account_id(),
            "relayer.testnet".parse::<AccountId>().unwrap(),
            U128(1_250_000_000_000_000_000_000),
        )
    }
}
