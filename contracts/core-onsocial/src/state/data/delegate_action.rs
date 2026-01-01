use near_sdk::AccountId;
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::Value;
use near_sdk::PublicKey;

use crate::json_api::set::types::SetOptions;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(super) fn execute_set_delegate_action(
        &mut self,
        target_account: &AccountId,
        public_key: PublicKey,
        nonce: U64,
        expires_at_ms: U64,
        signature: Base64VecU8,
        action: Value,
        data: Value,
        options: Option<SetOptions>,
    ) -> Result<(), SocialError> {
        self.execute_set_domain_signed(
            "delegate_action",
            "onsocial:delegate_action:set:v1",
            target_account,
            public_key,
            nonce,
            expires_at_ms,
            signature,
            Some(action),
            None,
            data,
            options,
        )
    }
}
