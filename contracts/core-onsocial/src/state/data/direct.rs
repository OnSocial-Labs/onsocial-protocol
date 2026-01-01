use near_sdk::{env, AccountId};
use near_sdk::serde_json::Value;

use crate::events::EventBatch;
use crate::json_api::set::types::{SetOptions, VerifiedContext};
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(super) fn execute_set_direct(
        &mut self,
        target_account: &AccountId,
        signer: &AccountId,
        data: Value,
        options: Option<SetOptions>,
    ) -> Result<(), SocialError> {
        let options = options.unwrap_or_default();

        let payer = env::predecessor_account_id();

        let ctx = VerifiedContext {
            actor_id: signer.clone(),
            payer_id: payer.clone(),
            // Attached deposit belongs to predecessor.
            deposit_owner: payer.clone(),
            actor_pk: Some(env::signer_account_pk()),
            auth_type: "direct",
        };

        // Validate permissions for the entire data object.
        crate::authz::cross_account::validate_cross_account_permissions_simple(
            self,
            &data,
            target_account,
            &ctx.actor_id,
            ctx.actor_pk.as_ref(),
            false,
        )?;

        let mut event_batch = EventBatch::new();

        // Marker event for indexers.
        crate::events::EventBuilder::new(crate::constants::EVENT_TYPE_CONTRACT_UPDATE, "set", payer)
            .with_path(&format!("{}/meta_tx", target_account.as_str()))
            .with_target(target_account)
            .with_field("auth_type", ctx.auth_type)
            .with_field("actor_id", ctx.actor_id.to_string())
            .with_field("payer_id", ctx.payer_id.to_string())
            .emit(&mut event_batch);

        self.execute_set_operations_with_batch(
            &ctx,
            &mut event_batch,
            target_account,
            data,
            options,
            None,
        )
    }
}
