use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_admin(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::SetAppConfig { app_id, params } => {
                self.set_app_config(actor_id, &app_id, params)?;
                Ok(Value::Null)
            }
            Action::TransferAppOwnership { app_id, new_owner } => {
                self.transfer_app_ownership(actor_id, &app_id, new_owner)?;
                Ok(Value::Null)
            }
            Action::AddModerator { app_id, account_id } => {
                self.add_moderator(actor_id, &app_id, account_id)?;
                Ok(Value::Null)
            }
            Action::RemoveModerator { app_id, account_id } => {
                self.remove_moderator(actor_id, &app_id, &account_id)?;
                Ok(Value::Null)
            }
            Action::BanCollection {
                app_id,
                collection_id,
                reason,
            } => {
                self.ban_collection(actor_id, &app_id, &collection_id, reason.as_deref())?;
                Ok(Value::Null)
            }
            Action::UnbanCollection {
                app_id,
                collection_id,
            } => {
                self.unban_collection(actor_id, &app_id, &collection_id)?;
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_admin called with non-admin action"),
        }
    }
}
