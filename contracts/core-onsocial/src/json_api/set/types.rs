use near_sdk::{AccountId, PublicKey};
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::Value;

use crate::events::EventBatch;
use crate::SocialError;

pub struct OperationContext<'a> {
    pub event_batch: &'a mut EventBatch,
    pub success_paths: &'a mut Vec<String>,
    pub errors: &'a mut Vec<SocialError>,
    /// Remaining attached balance for auto-deposit fallback.
    pub attached_balance: Option<&'a mut u128>,
}

pub struct DataOperationContext<'a> {
    pub value: &'a Value,
    pub account_id: &'a AccountId,
    pub predecessor: &'a AccountId,
    pub full_path: &'a str,
}

pub struct ApiOperationContext<'a> {
    pub event_batch: &'a mut EventBatch,
    pub attached_balance: &'a mut u128,
    pub processed_accounts: &'a mut std::collections::HashSet<AccountId>,
}

pub struct VerifiedContext {
    pub actor_id: AccountId,
    pub payer_id: AccountId,
    pub deposit_owner: AccountId,
    pub actor_pk: Option<PublicKey>,
    pub auth_type: &'static str,
}

#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde", tag = "type", rename_all = "snake_case")]
pub enum Auth {
    Direct,
    SignedPayload {
        public_key: PublicKey,
        nonce: U64,
        expires_at_ms: U64,
        signature: Base64VecU8,
    },
    DelegateAction {
        public_key: PublicKey,
        nonce: U64,
        expires_at_ms: U64,
        signature: Base64VecU8,
        action: Value,
    },
    Intent {
        actor_id: AccountId,
        intent: Value,
    },
}

impl Default for Auth {
    fn default() -> Self {
        Self::Direct
    }
}

/// Unified request for `set`.
#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct SetRequest {
    /// Target namespace (defaults to tx signer for `Direct`).
    pub target_account: Option<AccountId>,
    pub data: Value,
    pub options: Option<SetOptions>,

    /// Auth mode (defaults to `Direct`).
    pub auth: Option<Auth>,
}

/// Options for `set`.
#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Default,
    Clone,
)]
pub struct SetOptions {
    /// If true, refund unused attached deposit to `deposit_owner`.
    #[serde(default)]
    pub refund_unused_deposit: bool,
}
