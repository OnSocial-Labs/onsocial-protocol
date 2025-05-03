use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

#[near(event_json(standard = "nep297"))]
pub enum FtWrapperEvent {
    #[event_version("1.0.0")]
    TokenAdded { token: AccountId },
    #[event_version("1.0.0")]
    TokenRemoved { token: AccountId },
    #[event_version("1.0.0")]
    FtTransfer {
        token: AccountId,
        sender: AccountId,
        receiver: AccountId,
        amount: U128,
    },
    #[event_version("1.0.0")]
    StorageDeposited {
        token: AccountId,
        account_id: AccountId,
        amount: U128,
    },
    #[event_version("1.0.0")]
    StorageWithdrawn {
        token: AccountId,
        account_id: AccountId,
        amount: U128,
    },
    #[event_version("1.0.0")]
    StorageUnregistered {
        token: AccountId,
        account_id: AccountId,
    },
    #[event_version("1.0.0")]
    GasUpdated { gas_tgas: u64 },
    #[event_version("1.0.0")]
    LowBalance { balance: u128 },
    #[event_version("1.0.0")]
    StorageDepositUpdated { storage_deposit: U128 },
    #[event_version("1.0.0")]
    ContractUpgraded { manager: AccountId, timestamp: u64 },
    #[event_version("1.0.0")]
    ManagerUpdated { new_manager: AccountId },
    #[event_version("1.0.0")]
    StateMigrated {
        old_version: String,
        new_version: String,
    },
    #[event_version("1.0.0")]
    TransferFinalized {
        token: AccountId,
        recipient: AccountId,
        amount: U128,
        fee: U128,
        source_chain: String,
    },
}
