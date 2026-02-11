//! Shared authentication types for the OnSocial protocol.

use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::Value;
use near_sdk::{AccountId, PublicKey};

/// Authentication mode for the unified `execute()` API.
///
/// - `Direct` — standard NEAR transaction (default).
/// - `SignedPayload` — off-chain signed action, relayer submits tx.
/// - `DelegateAction` — signed payload with nested delegation.
/// - `Intent` — whitelisted executor acts on behalf of a user.
#[derive(near_sdk_macros::NearSchema, serde::Serialize, serde::Deserialize, Clone)]
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

/// Verified identity context returned by [`authenticate`](crate::authenticate).
/// Contracts use this to determine the actor, payer, and pending nonce.
pub struct AuthContext {
    /// Whose data/permissions are affected.
    pub actor_id: AccountId,
    /// Gas/storage payer (transaction signer or relayer).
    pub payer_id: AccountId,
    /// Deposit owner for refund purposes.
    pub deposit_owner: AccountId,
    /// `"direct"` | `"signed_payload"` | `"delegate_action"` | `"intent"`.
    pub auth_type: &'static str,
    /// Attached deposit in yoctoNEAR.
    pub attached_balance: u128,
    /// Set when nonce must be recorded after action dispatch.
    pub signed_nonce: Option<(AccountId, PublicKey, u64)>,
}
