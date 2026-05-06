use near_sdk::serde_json::Value;
use near_sdk::{AccountId, env};

use crate::SocialError;
use crate::protocol::{Options, Request};
use crate::state::models::SocialPlatform;

/// Post-auth execution context.
///
/// Auth model is predecessor-trusted only. For NEP-366 meta-tx inner
/// receipts the runtime sets `predecessor_account_id = signer_id =
/// delegate.sender_id`, so this context always resolves to the real user.
pub struct ExecuteContext {
    pub actor_id: AccountId,
    pub payer_id: AccountId,
    pub deposit_owner: AccountId,
    pub attached_balance: u128,
    pub options: Options,
}

impl SocialPlatform {
    pub fn execute(&mut self, request: Request) -> Result<Value, SocialError> {
        let Request {
            target_account,
            action,
            options,
        } = request;

        let options = options.unwrap_or_default();

        let mut ctx = self.build_execute_context(options.clone());

        let target_account = target_account.unwrap_or_else(|| ctx.actor_id.clone());

        let result = self.dispatch_action(&action, &target_account, &mut ctx)?;

        self.finalize_execute_deposit(&mut ctx, &options)?;

        Ok(result)
    }

    /// Predecessor-only context construction (NEP-366 compatible).
    fn build_execute_context(&self, options: Options) -> ExecuteContext {
        let predecessor = env::predecessor_account_id();
        let attached_balance = env::attached_deposit().as_yoctonear();

        ExecuteContext {
            actor_id: predecessor.clone(),
            payer_id: predecessor.clone(),
            deposit_owner: predecessor,
            attached_balance,
            options,
        }
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
