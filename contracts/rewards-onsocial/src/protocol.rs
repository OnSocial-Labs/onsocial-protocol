use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

#[near(serializers = [json])]
#[serde(tag = "type", rename_all = "snake_case")]
#[derive(Clone)]
pub enum Action {
    CreditReward {
        account_id: AccountId,
        amount: U128,
        #[serde(default)]
        source: Option<String>,
        #[serde(default)]
        app_id: Option<String>,
    },
    Claim {
        account_id: AccountId,
    },
}

impl Action {
    pub fn requires_confirmation(&self) -> bool {
        false
    }
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct Request {
    pub action: Action,
}
