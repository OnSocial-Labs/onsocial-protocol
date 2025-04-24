use near_sdk::{near, AccountId};
use near_sdk::json_types::U128;

#[near(event_json(standard = "nep297"))]
pub enum RelayerEvent {
    #[event_version("1.0.0")]
    LowBalance { balance: u128 },
    #[event_version("1.0.0")]
    LowGas { remaining_gas: u64 },
    #[event_version("1.0.0")]
    AccountSponsored { account_id: AccountId },
    #[event_version("1.0.0")]
    AuthAdded { auth_account: AccountId, key_hash: String },
    #[event_version("1.0.0")]
    AuthRemoved { auth_account: AccountId, key_hash: String },
    #[event_version("1.0.0")]
    CrossChainSignatureResult { chain: String, request_id: u64, result: Vec<u8> },
    #[event_version("1.0.0")]
    BridgeResult { sender_id: AccountId, action_type: String, result: Vec<u8> },
    #[event_version("1.0.0")]
    BridgeTransferInitiated { 
        token: String, 
        amount: U128, 
        destination_chain: String, 
        recipient: String, 
        sender: AccountId, 
        nonce: u64 
    },
    #[event_version("1.0.0")]
    BridgeTransferCompleted { 
        token: String, 
        amount: U128, 
        destination_chain: String, 
        recipient: String, 
        sender: AccountId, 
        signature: Vec<u8> 
    },
    #[event_version("1.0.0")]
    BridgeTransferFailed { 
        token: String, 
        amount: U128, 
        destination_chain: String, 
        recipient: String, 
        sender: AccountId, 
        nonce: u64 
    },
    #[event_version("1.0.0")]
    OffloadRecipientUpdated { new_recipient: AccountId },
    #[event_version("1.0.0")]
    SponsorAmountUpdated { new_amount: u128 },
    #[event_version("1.0.0")]
    SponsorGasUpdated { new_gas: u64 },
    #[event_version("1.0.0")]
    CrossContractGasUpdated { new_gas: u64 },
    #[event_version("1.0.0")]
    MigrationGasUpdated { new_gas: u64 },
    #[event_version("1.0.0")]
    OmniLockerContractUpdated { new_locker_contract: AccountId },
    #[event_version("1.0.0")]
    ChainMpcMappingAdded { chain: String, mpc_contract: AccountId },
    #[event_version("1.0.0")]
    ChainMpcMappingRemoved { chain: String },
    #[event_version("1.0.0")]
    ChunkSizeUpdated { new_size: usize },
    #[event_version("1.0.0")]
    AuthContractUpdated { new_auth_contract: AccountId },
    #[event_version("1.0.0")]
    FtWrapperContractUpdated { new_ft_wrapper_contract: AccountId },
    #[event_version("1.0.0")]
    MinBalanceUpdated { new_min: u128 },
    #[event_version("1.0.0")]
    MaxBalanceUpdated { new_max: u128 },
    #[event_version("1.0.0")]
    BaseFeeUpdated { new_fee: u128 },
    #[event_version("1.0.0")]
    FeeCharged { action: String, fee: u128, sender: AccountId },
    #[event_version("1.0.0")]
    ManagerChanged { old_manager: AccountId, new_manager: AccountId, timestamp: u64 },
    #[event_version("1.0.0")]
    ContractUpgraded { manager: AccountId, timestamp: u64 },
    #[event_version("1.0.0")]
    StateMigrated { old_version: String, new_version: String },
}
