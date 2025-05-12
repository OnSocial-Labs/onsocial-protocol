use near_sdk::{near, AccountId};

#[near(event_json(standard = "nep297"))]
#[allow(dead_code)] // Suppress dead code warning for unused variants
pub enum SocialEvent {
    #[event_version("1.0.0")]
    ContractUpgraded { manager: AccountId, timestamp: u64 },
    #[event_version("1.0.0")]
    StateMigrated {
        old_version: String,
        new_version: String,
    },
    #[event_version("1.0.0")]
    PostCreated { author: AccountId, post_id: String },
    #[event_version("1.0.0")]
    PostLiked { liker: AccountId, post_id: String },
}
