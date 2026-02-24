use crate::*;
use near_sdk::serde_json::Value;

#[near]
impl Contract {
    #[payable]
    #[handle_result]
    pub fn execute(&mut self, request: Request) -> Result<Value, MarketplaceError> {
        let Request {
            target_account,
            action,
            auth,
            options,
        } = request;

        let auth = auth.unwrap_or_default();
        let options = options.unwrap_or_default();

        let action_json = near_sdk::serde_json::to_value(&action)
            .map_err(|_| MarketplaceError::InternalError("Failed to serialize action".into()))?;

        let auth_ctx = onsocial_auth::authenticate(
            &auth,
            target_account.as_ref(),
            &action_json,
            protocol::NONCE_PREFIX,
            &self.intents_executors,
            protocol::DOMAIN_PREFIX,
        )
        .map_err(|e| MarketplaceError::Unauthorized(format!("Auth failed: {:?}", e)))?;

        let actor_id = auth_ctx.actor_id.clone();
        let deposit_owner = auth_ctx.deposit_owner.clone();
        let mut attached_balance = auth_ctx.attached_balance;

        if let Some((ref owner, ref public_key, nonce)) = auth_ctx.signed_nonce {
            let new_bytes = onsocial_auth::nonce::record_nonce(
                protocol::NONCE_PREFIX,
                owner,
                public_key,
                nonce,
            );
            if new_bytes > 0 {
                let cost = new_bytes as u128 * env::storage_byte_cost().as_yoctonear();
                attached_balance = attached_balance.saturating_sub(cost);
            }
        }

        // Security boundary: confirmation-requiring direct auth must include deposit to force wallet-signature path.
        if auth_ctx.auth_type == "direct" && action.requires_confirmation() {
            let deposit = env::attached_deposit().as_yoctonear();
            if deposit == 0 {
                return Err(MarketplaceError::InsufficientDeposit(
                    "Direct auth requires 1 yoctoNEAR confirmation deposit for this action".into(),
                ));
            }
        }

        self.pending_attached_balance = attached_balance;

        // Relayer funding rule: payment actions may draw prepaid balance when attached balance is zero.
        let user_drawn = if self.pending_attached_balance == 0 && action.uses_prepaid_balance() {
            self.draw_user_balance(&actor_id)
        } else {
            0
        };

        // State/accounting invariant: dispatch must not bypass balance cleanup.
        let result = self.dispatch_action(action, &actor_id);

        // Accounting invariant: restore drawn prepaid amount first, then finalize remaining attached funds.
        let mut remaining = core::mem::take(&mut self.pending_attached_balance);
        if user_drawn > 0 {
            remaining = self.restore_user_balance(&actor_id, remaining, user_drawn);
        }
        if remaining > 0 {
            self.finalize_unused_deposit(remaining, &deposit_owner, &options);
        }

        result
    }
}
