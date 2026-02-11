use near_sdk::serde_json::Value;
use near_sdk::{AccountId, env};

use crate::SocialError;
use crate::protocol::{Action, Auth, Options, Request};
use crate::state::models::SocialPlatform;

/// Post-auth execution context.
/// Wraps the shared `AuthContext` with contract-specific fields.
pub struct ExecuteContext {
    pub actor_id: AccountId,
    pub payer_id: AccountId,
    pub deposit_owner: AccountId,
    pub auth_type: &'static str,
    pub attached_balance: u128,
    pub signed_nonce: Option<(AccountId, near_sdk::PublicKey, u64)>,
    pub options: Options,
}

impl ExecuteContext {
    /// Build from a shared `AuthContext` plus contract-specific `Options`.
    fn from_auth_context(ctx: onsocial_auth::AuthContext, options: Options) -> Self {
        Self {
            actor_id: ctx.actor_id,
            payer_id: ctx.payer_id,
            deposit_owner: ctx.deposit_owner,
            auth_type: ctx.auth_type,
            attached_balance: ctx.attached_balance,
            signed_nonce: ctx.signed_nonce,
            options,
        }
    }
}

impl SocialPlatform {
    pub fn execute(&mut self, request: Request) -> Result<Value, SocialError> {
        let Request {
            target_account,
            action,
            auth,
            options,
        } = request;

        let auth = auth.unwrap_or_default();
        let options = options.unwrap_or_default();

        let mut ctx =
            self.verify_execute_auth(&auth, target_account.as_ref(), &action, options.clone())?;

        let target_account = target_account.unwrap_or_else(|| ctx.actor_id.clone());

        let result = self.dispatch_action(&action, &target_account, &mut ctx)?;

        self.finalize_execute_nonce(&mut ctx)?;

        self.finalize_execute_deposit(&mut ctx, &options)?;

        Ok(result)
    }

    fn verify_execute_auth(
        &mut self,
        auth: &Auth,
        target_account: Option<&AccountId>,
        action: &Action,
        options: Options,
    ) -> Result<ExecuteContext, SocialError> {
        let action_json = near_sdk::serde_json::to_value(action)
            .map_err(|_| crate::invalid_input!("Failed to serialize action"))?;

        let auth_ctx = onsocial_auth::authenticate(
            auth,
            target_account,
            &action_json,
            crate::state::data::nonce::NONCE_PREFIX,
            &self.config.intents_executors,
            "onsocial:execute",
        )
        .map_err(Self::map_auth_error)?;

        Ok(ExecuteContext::from_auth_context(auth_ctx, options))
    }

    fn map_auth_error(e: onsocial_types::AuthError) -> SocialError {
        match e {
            onsocial_types::AuthError::PayloadExpired => {
                crate::invalid_input!("Signed payload expired")
            }
            onsocial_types::AuthError::SignatureInvalid => {
                crate::permission_denied!("invalid signature", "execute")
            }
            onsocial_types::AuthError::InvalidInput(msg) => crate::invalid_input!(msg),
            onsocial_types::AuthError::Unauthorized(op, acc) => crate::unauthorized!(op, acc),
            onsocial_types::AuthError::NonceStale => crate::invalid_input!("Nonce too low"),
        }
    }

    fn finalize_execute_nonce(&mut self, ctx: &mut ExecuteContext) -> Result<(), SocialError> {
        if let Some((ref owner, ref public_key, nonce)) = ctx.signed_nonce {
            let new_bytes = Self::record_nonce(owner, public_key, nonce);
            if new_bytes > 0 {
                let cost = new_bytes as u128 * env::storage_byte_cost().as_yoctonear();
                ctx.attached_balance = ctx.attached_balance.saturating_sub(cost);
            }
        }
        Ok(())
    }

    fn finalize_execute_deposit(
        &mut self,
        ctx: &mut ExecuteContext,
        options: &Options,
    ) -> Result<(), SocialError> {
        if ctx.attached_balance > 0 {
            let mut event_batch = crate::events::EventBatch::new();
            self.finalize_unused_attached_deposit(
                &mut ctx.attached_balance,
                &ctx.deposit_owner,
                options.refund_unused_deposit,
                "unused_deposit_saved",
                &mut event_batch,
                Some(crate::state::platform::UnusedDepositEventMeta {
                    auth_type: ctx.auth_type,
                    actor_id: &ctx.actor_id,
                    payer_id: &ctx.payer_id,
                    target_account: &ctx.actor_id,
                }),
            )?;
            event_batch.emit()?;
        }
        Ok(())
    }
}
