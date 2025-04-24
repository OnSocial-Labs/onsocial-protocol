use near_sdk::{near, AccountId};

#[near(event_json(standard = "nep297"))]
pub enum AuthEvent {
    #[event_version("1.0.0")]
    KeyRegistered { account_id: AccountId, public_key: String },
    #[event_version("1.0.0")]
    KeyRemoved { account_id: AccountId, public_key: String },
    #[event_version("1.0.0")]
    KeyRotated { account_id: AccountId, old_public_key: String, new_public_key: String },
    #[event_version("1.0.0")]
    ContractUpgraded { manager: AccountId, timestamp: u64 },
    #[event_version("1.0.0")]
    ManagerChanged { old_manager: AccountId, new_manager: AccountId, timestamp: u64 },
    #[event_version("1.0.0")]
    StateMigrated { old_version: String, new_version: String },
}