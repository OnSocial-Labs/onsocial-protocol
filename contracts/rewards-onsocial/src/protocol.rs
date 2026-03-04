use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};
pub use onsocial_auth::Auth;

/// Must be unique across all contracts sharing the same nonce store.
pub const NONCE_PREFIX: u8 = 0x07;
pub const DOMAIN_PREFIX: &str = "onsocial:rewards";

#[near(serializers = [json])]
#[serde(tag = "type", rename_all = "snake_case")]
#[derive(Clone)]
pub enum Action {
    CreditReward {
        account_id: AccountId,
        amount: U128,
        #[serde(default)]
        source: Option<String>,
    },
    Claim,
}

impl Action {
    /// No action requires confirmation deposit; authorization is caller-based.
    pub fn requires_confirmation(&self) -> bool {
        false
    }
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct Request {
    pub target_account: Option<AccountId>,
    pub action: Action,
    pub auth: Option<Auth>,
    pub options: Option<Options>,
}

#[near(serializers = [json])]
#[derive(Default, Clone)]
pub struct Options {
    #[serde(default)]
    pub refund_unused_deposit: bool,
}
