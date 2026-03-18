use crate::*;
use near_sdk::serde_json::Value;

#[near]
impl RewardsContract {
    #[handle_result]
    pub fn execute(&mut self, request: Request) -> Result<Value, RewardsError> {
        let Request {
            target_account,
            action,
            auth,
            options: _options,
        } = request;

        let auth = auth.unwrap_or_default();

        let action_json = near_sdk::serde_json::to_value(&action)
            .map_err(|_| RewardsError::InternalError("Failed to serialize action".into()))?;

        let auth_ctx = onsocial_auth::authenticate(
            &auth,
            target_account.as_ref(),
            &action_json,
            protocol::NONCE_PREFIX,
            &self.intents_executors,
            protocol::DOMAIN_PREFIX,
        )
        .map_err(|e| RewardsError::Unauthorized(format!("Auth failed: {e:?}")))?;

        let actor_id = auth_ctx.actor_id.clone();

        if let Some((ref owner, ref public_key, nonce)) = auth_ctx.signed_nonce {
            onsocial_auth::nonce::record_nonce(protocol::NONCE_PREFIX, owner, public_key, nonce);
        }

        self.dispatch_action(action, &actor_id)
    }
}
