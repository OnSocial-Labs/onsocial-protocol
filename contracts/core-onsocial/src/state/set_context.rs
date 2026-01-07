use near_sdk::AccountId;
use near_sdk::serde_json::Value;

use crate::events::EventBatch;
use crate::SocialError;

pub(crate) struct OperationContext<'a> {
    pub event_batch: &'a mut EventBatch,
    pub success_paths: &'a mut Vec<String>,
    pub errors: &'a mut Vec<SocialError>,
    /// Remaining attached balance for auto-deposit fallback.
    pub attached_balance: Option<&'a mut u128>,
}

pub(crate) struct DataOperationContext<'a> {
    pub value: &'a Value,
    pub account_id: &'a AccountId,
    pub predecessor: &'a AccountId,
    pub full_path: &'a str,
}

pub(crate) struct ApiOperationContext<'a> {
    pub event_batch: &'a mut EventBatch,
    pub attached_balance: &'a mut u128,
    pub processed_accounts: &'a mut std::collections::HashSet<AccountId>,
}

pub(crate) struct VerifiedContext {
    pub actor_id: AccountId,
    pub payer_id: AccountId,
    pub deposit_owner: AccountId,
    pub auth_type: &'static str,
}
