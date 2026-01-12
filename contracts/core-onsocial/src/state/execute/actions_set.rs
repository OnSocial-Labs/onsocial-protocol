use near_sdk::{env, AccountId};
use near_sdk::serde_json::Value;

use crate::events::EventBatch;
use crate::state::execute::ExecuteContext;
use crate::state::set_context::VerifiedContext;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(super) fn execute_action_set(
        &mut self,
        target_account: &AccountId,
        data: Value,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        let options = ctx.options.clone();

        // Resolve actor's public key for key-based permission fallback.
        let actor_pk = ctx.signed_nonce
            .as_ref()
            .map(|(_, pk, _)| pk.clone())
            .or_else(|| {
                if ctx.auth_type == "direct" {
                    Some(env::signer_account_pk())
                } else {
                    None
                }
            });

        let verified = VerifiedContext {
            actor_id: ctx.actor_id.clone(),
            payer_id: ctx.payer_id.clone(),
            deposit_owner: ctx.deposit_owner.clone(),
            auth_type: ctx.auth_type,
        };

        crate::domain::authz::cross_account::validate_cross_account_permissions_simple(
            self,
            &data,
            target_account,
            &verified.actor_id,
            actor_pk.as_ref(),
            false,
        )?;

        let mut event_batch = EventBatch::new();

        crate::events::EventBuilder::new(
            crate::constants::EVENT_TYPE_CONTRACT_UPDATE,
            "set",
            ctx.payer_id.clone(),
        )
        .with_path(&format!("{}/meta_tx", target_account.as_str()))
        .with_target(target_account)
        .with_field("auth_type", ctx.auth_type)
        .with_field("actor_id", ctx.actor_id.to_string())
        .with_field("payer_id", ctx.payer_id.to_string())
        .emit(&mut event_batch);

        self.execute_set_operations_with_balance(
            &verified,
            &mut event_batch,
            target_account,
            data,
            options,
            None, // Nonce already validated in execute auth
            &mut ctx.attached_balance,
        )
    }
}
