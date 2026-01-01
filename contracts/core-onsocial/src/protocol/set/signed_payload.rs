use near_sdk::{
    json_types::U64,
    serde::{Deserialize, Serialize},
    serde_json::Value,
    AccountId,
    PublicKey,
};

use crate::SetOptions;

#[derive(
    near_sdk_macros::NearSchema,
    Serialize,
    Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct SignedSetPayload {
    pub target_account: AccountId,
    pub public_key: PublicKey,
    pub nonce: U64,
    pub expires_at_ms: U64,
    /// Reserved for DelegateAction; `null` for SignedPayload.
    pub action: Option<Value>,
    pub data: Value,
    pub options: Option<SetOptions>,
}
