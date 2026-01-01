use crate::json_api::set::types::{Auth, SetRequest};
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    /// Single write entrypoint.
    pub fn set(&mut self, request: SetRequest) -> Result<(), SocialError> {
        let SetRequest {
            target_account,
            data,
            options,
            auth,
        } = request;
        let auth = auth.unwrap_or_default();

        match auth {
            Auth::Direct => {
                // Use the tx signer for permission checks.
                let signer = Self::transaction_signer();
                let target_account = target_account.unwrap_or_else(|| signer.clone());

                self.execute_set_direct(&target_account, &signer, data, options)
            }

            Auth::SignedPayload {
                public_key,
                nonce,
                expires_at_ms,
                signature,
            } => {
                let Some(target_account) = target_account else {
                    return Err(crate::invalid_input!(
                        "target_account is required for signed_payload"
                    ));
                };

                self.execute_set_signed_payload(
                    &target_account,
                    public_key,
                    nonce,
                    expires_at_ms,
                    signature,
                    data,
                    options,
                )
            }

            Auth::DelegateAction {
                public_key,
                nonce,
                expires_at_ms,
                signature,
                action,
            } => {
                let Some(target_account) = target_account else {
                    return Err(crate::invalid_input!(
                        "target_account is required for delegate_action"
                    ));
                };
                self.execute_set_delegate_action(
                    &target_account,
                    public_key,
                    nonce,
                    expires_at_ms,
                    signature,
                    action,
                    data,
                    options,
                )
            }

            Auth::Intent { actor_id, intent } => {
                let target_account = target_account.unwrap_or_else(|| actor_id.clone());
                if target_account != actor_id {
                    return Err(crate::invalid_input!(
                        "In intent mode, target_account must equal actor_id"
                    ));
                }

                self.execute_set_intent_executor(
                    &target_account,
                    &actor_id,
                    intent,
                    data,
                    options,
                )
            }
        }
    }
}
