use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

#[near(event_json(standard = "nep297"))]
#[allow(dead_code)] // Suppress dead code warning for unused variants
pub enum StakingEvent {
    #[event_version("1.0.0")]
    ContractUpgraded { manager: AccountId, timestamp: u64 },
    #[event_version("1.0.0")]
    StateMigrated {
        old_version: String,
        new_version: String,
    },
    #[event_version("1.0.0")]
    Staked { account: AccountId, amount: U128 },
    #[event_version("1.0.0")]
    Unstaked { account: AccountId, amount: U128 },
}
