use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

#[near(event_json(standard = "nep297"))]
#[allow(dead_code)] // Suppress dead code warning for unused variants
pub enum MarketplaceEvent {
    #[event_version("1.0.0")]
    ContractUpgraded { manager: AccountId, timestamp: u64 },
    #[event_version("1.0.0")]
    StateMigrated {
        old_version: String,
        new_version: String,
    },
    #[event_version("1.0.0")]
    ItemListed {
        seller: AccountId,
        item_id: String,
        price: U128,
    },
    #[event_version("1.0.0")]
    ItemPurchased {
        buyer: AccountId,
        seller: AccountId,
        item_id: String,
        price: U128,
    },
}
