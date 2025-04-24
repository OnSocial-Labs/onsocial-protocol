use near_sdk::{AccountId, env};
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::store::{LazyOption, LookupMap};
use near_sdk_macros::NearSchema;
use crate::state_versions::{StateV010, StateV011};
use crate::events::RelayerEvent;
use near_sdk::json_types::U128;

#[derive(BorshDeserialize, BorshSerialize, NearSchema)]
#[abi(borsh)]
pub struct PendingTransfer {
    pub nonce: u64,
    pub sender_id: AccountId,
    pub token: String,
    pub amount: U128,
    pub recipient: String,
    pub fee: u128,
}

#[derive(BorshDeserialize, BorshSerialize, NearSchema)]
#[abi(borsh)]
pub struct Relayer {
    pub version: String,
    pub manager: AccountId,
    pub offload_recipient: AccountId,
    pub auth_contract: AccountId,
    pub ft_wrapper_contract: AccountId,
    pub omni_locker_contract: LazyOption<AccountId>,
    pub chain_mpc_mapping: LookupMap<String, AccountId>,
    pub sponsor_amount: u128,
    pub sponsor_gas: u64,
    pub cross_contract_gas: u64,
    pub migration_gas: u64,
    pub chunk_size: usize,
    pub min_balance: u128,
    pub max_balance: u128,
    pub base_fee: u128,
    pub transfer_nonces: LookupMap<String, u64>,
    pub pending_transfers: LookupMap<String, PendingTransfer>,
}

impl Relayer {
    pub fn new(
        manager: AccountId,
        offload_recipient: AccountId,
        auth_contract: AccountId,
        ft_wrapper_contract: AccountId,
    ) -> Self {
        Self {
            version: "0.1.1".to_string(),
            manager,
            offload_recipient,
            auth_contract,
            ft_wrapper_contract,
            omni_locker_contract: LazyOption::new(b"omni_locker".to_vec(), Some(env::current_account_id())),
            chain_mpc_mapping: LookupMap::new(b"chain_mpc".to_vec()),
            sponsor_amount: 10_000_000_000_000_000_000_000,
            sponsor_gas: 100_000_000_000_000,
            cross_contract_gas: 100_000_000_000_000, // Default: 100 TGas for cross-contract calls
            migration_gas: 200_000_000_000_000, // Default: 200 TGas for migrations
            chunk_size: 5, // Default: 5 for chunked transactions
            min_balance: 10_000_000_000_000_000_000_000_000,
            max_balance: 1_000_000_000_000_000_000_000_000_000,
            base_fee: 100_000_000_000_000_000_000,
            transfer_nonces: LookupMap::new(b"nonces".to_vec()),
            pending_transfers: LookupMap::new(b"pending_transfers".to_vec()),
        }
    }

    pub fn is_manager(&self, account_id: &AccountId) -> bool {
        &self.manager == account_id
    }

    pub fn get_pending_nonce(&self, chain: &str) -> u64 {
        self.transfer_nonces.get(chain).copied().unwrap_or(0)
    }

    pub fn add_pending_transfer(
        &mut self,
        chain: String,
        nonce: u64,
        sender_id: AccountId,
        token: String,
        amount: U128,
        recipient: String,
        fee: u128,
    ) {
        let key = format!("{}-{}", chain, nonce);
        self.pending_transfers.insert(key, PendingTransfer {
            nonce,
            sender_id,
            token,
            amount,
            recipient,
            fee,
        });
    }

    pub fn confirm_pending_transfer(&mut self, chain: &str, nonce: u64) {
        let key = format!("{}-{}", chain, nonce);
        self.pending_transfers.remove(&key);
        let current_nonce = self.transfer_nonces.get(chain).copied().unwrap_or(0);
        if nonce >= current_nonce {
            self.transfer_nonces.insert(chain.to_string(), nonce + 1);
        }
    }

    pub fn revert_pending_transfer(&mut self, chain: &str, nonce: u64) -> Option<PendingTransfer> {
        let key = format!("{}-{}", chain, nonce);
        self.pending_transfers.remove(&key)
    }

    pub fn migrate() -> Self {
        const CURRENT_VERSION: &str = "0.1.1";

        // Read raw state bytes, default to empty if none
        let state_bytes: Vec<u8> = env::state_read().unwrap_or_default();

        // Try current version (0.1.1)
        if let Ok(state) = borsh::from_slice::<Relayer>(&state_bytes) {
            if state.version == CURRENT_VERSION {
                env::log_str("State is already at latest version");
                return state;
            }
        }

        // Try version 0.1.1
        if let Ok(old_state) = borsh::from_slice::<StateV011>(&state_bytes) {
            if old_state.version == "0.1.1" {
                env::log_str("Migrating from state version 0.1.1");
                let new_state = Relayer {
                    version: CURRENT_VERSION.to_string(),
                    manager: old_state.manager,
                    offload_recipient: old_state.offload_recipient,
                    auth_contract: old_state.auth_contract,
                    ft_wrapper_contract: old_state.ft_wrapper_contract,
                    omni_locker_contract: old_state.omni_locker_contract,
                    chain_mpc_mapping: old_state.chain_mpc_mapping,
                    sponsor_amount: old_state.sponsor_amount,
                    sponsor_gas: old_state.sponsor_gas,
                    cross_contract_gas: old_state.cross_contract_gas,
                    migration_gas: old_state.migration_gas,
                    chunk_size: old_state.chunk_size,
                    min_balance: old_state.min_balance,
                    max_balance: old_state.max_balance,
                    base_fee: old_state.base_fee,
                    transfer_nonces: LookupMap::new(b"nonces".to_vec()),
                    pending_transfers: LookupMap::new(b"pending_transfers".to_vec()),
                };
                RelayerEvent::StateMigrated {
                    old_version: "0.1.1".to_string(),
                    new_version: CURRENT_VERSION.to_string(),
                }.emit();
                return new_state;
            }
        }

        // Try version 0.1.0
        if let Ok(old_state) = borsh::from_slice::<StateV010>(&state_bytes) {
            if old_state.version == "0.1.0" {
                env::log_str("Migrating from state version 0.1.0");
                let new_state = Relayer {
                    version: CURRENT_VERSION.to_string(),
                    manager: old_state.manager,
                    offload_recipient: old_state.offload_recipient,
                    auth_contract: old_state.auth_contract,
                    ft_wrapper_contract: old_state.ft_wrapper_contract,
                    omni_locker_contract: old_state.omni_locker_contract,
                    chain_mpc_mapping: old_state.chain_mpc_mapping,
                    sponsor_amount: old_state.sponsor_amount,
                    sponsor_gas: old_state.sponsor_gas,
                    cross_contract_gas: old_state.cross_contract_gas,
                    migration_gas: old_state.migration_gas,
                    chunk_size: old_state.chunk_size,
                    min_balance: 10_000_000_000_000_000_000_000_000,
                    max_balance: 1_000_000_000_000_000_000_000_000_000,
                    base_fee: 100_000_000_000_000_000_000,
                    transfer_nonces: LookupMap::new(b"nonces".to_vec()),
                    pending_transfers: LookupMap::new(b"pending_transfers".to_vec()),
                };
                RelayerEvent::StateMigrated {
                    old_version: "0.1.0".to_string(),
                    new_version: CURRENT_VERSION.to_string(),
                }.emit();
                return new_state;
            }
        }

        env::log_str("No valid prior state found, initializing new state");
        Self::new(
            env::current_account_id(),
            "recipient.testnet".parse::<AccountId>().unwrap(),
            "auth.testnet".parse::<AccountId>().unwrap(),
            "ft.testnet".parse::<AccountId>().unwrap(),
        )
    }
}
