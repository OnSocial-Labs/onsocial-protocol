use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_withdrawals(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::StorageWithdraw => {
                self.storage_withdraw(actor_id)?;
                Ok(Value::Null)
            }
            Action::WithdrawAppPool { app_id, amount } => {
                self.withdraw_app_pool(actor_id, &app_id, amount)?;
                Ok(Value::Null)
            }
            Action::WithdrawPlatformStorage { amount } => {
                let _ = self.withdraw_platform_storage(actor_id, amount)?;
                // Promise is returned; result is Null to caller.
                Ok(Value::Null)
            }
            Action::SetSpendingCap { cap } => {
                self.set_spending_cap(actor_id, cap.map(|c| c.0));
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_withdrawals called with non-withdrawal action"),
        }
    }
}
