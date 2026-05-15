use near_sdk::serde_json::Value;
use near_sdk::{AccountId, env};

use crate::SocialError;
use crate::events::EventBatch;
use crate::state::data::helpers::SetOperation;
use crate::state::execute::ExecuteContext;
use crate::state::models::SocialPlatform;
use crate::state::set_context::VerifiedContext;

impl SocialPlatform {
    pub(super) fn execute_action_set(
        &mut self,
        target_account: &AccountId,
        data: Value,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        let options = ctx.options.clone();

        // Resolve actor's public key for key-based permission fallback.
        // Auth is predecessor-trusted: for standard transactions and NEP-366
        // inner receipts the signer's public key is the access key used to
        // submit the (outer) transaction.
        let actor_pk = env::signer_account_pk();

        let verified = VerifiedContext {
            actor_id: ctx.actor_id.clone(),
            payer_id: ctx.payer_id.clone(),
            deposit_owner: ctx.deposit_owner.clone(),
        };

        crate::domain::authz::cross_account::validate_cross_account_permissions_simple(
            self,
            &data,
            target_account,
            &verified.actor_id,
            &actor_pk,
        )?;

        let mut event_batch = EventBatch::new();

        crate::events::EventBuilder::new(
            crate::constants::EVENT_TYPE_CONTRACT_UPDATE,
            "set",
            ctx.payer_id.clone(),
        )
        .with_path(&format!("{}/meta_tx", target_account.as_str()))
        .with_target(target_account)
        .with_field("actor_id", ctx.actor_id.to_string())
        .with_field("payer_id", ctx.payer_id.to_string())
        .emit(&mut event_batch);

        let op = SetOperation {
            target_account,
            data,
            options,
        };
        self.execute_set_operations_with_balance(
            &verified,
            &mut event_batch,
            op,
            &mut ctx.attached_balance,
        )
    }
}
