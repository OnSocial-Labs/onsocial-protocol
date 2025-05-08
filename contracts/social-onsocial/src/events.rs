use near_sdk::{near, AccountId};

#[near(event_json(standard = "nep297"))]
pub enum SocialEvent {
    #[event_version("1.0.0")]
    ContractUpgraded { manager: AccountId, timestamp: u64 },
}
