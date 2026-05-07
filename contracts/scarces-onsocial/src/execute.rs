use crate::*;
use near_sdk::serde_json::Value;

#[near]
impl Contract {
    #[payable]
    #[handle_result]
    pub fn execute(&mut self, request: Request) -> Result<Value, MarketplaceError> {
        let Request { action, options } = request;

        let options = options.unwrap_or_default();

        let actor_id = env::predecessor_account_id();
        let deposit_owner = actor_id.clone();
        let attached_balance = env::attached_deposit().as_yoctonear();

        // Session FCAKs cannot attach deposit, so confirming actions require
        // a wallet-signed call.
        if action.requires_confirmation() && attached_balance == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "This action requires a 1 yoctoNEAR confirmation deposit".into(),
            ));
        }

        self.pending_attached_balance = attached_balance;

        // Gasless payment actions can draw prepaid balance.
        let user_drawn = if self.pending_attached_balance == 0 && action.uses_prepaid_balance() {
            self.draw_user_balance(&actor_id)
        } else {
            0
        };

        let result = self.dispatch_action(action, &actor_id);

        // Restore prepaid draw before refunding unused attached funds.
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
