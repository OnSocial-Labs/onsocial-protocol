//! Dispatch arms for admin and app-pool management operations.

use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_admin(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::SetFeeRecipient { fee_recipient } => {
                // Requires 1 yoctoNEAR; owner only.
                crate::guards::check_one_yocto()?;
                self.check_contract_owner(actor_id)?;
                let old_recipient = self.fee_recipient.clone();
                self.fee_recipient = fee_recipient;
                events::emit_fee_recipient_changed(actor_id, &old_recipient, &self.fee_recipient);
                Ok(Value::Null)
            }
            Action::UpdateFeeConfig {
                total_fee_bps,
                app_pool_fee_bps,
                platform_storage_fee_bps,
            } => {
                // Requires 1 yoctoNEAR; owner only.
                crate::guards::check_one_yocto()?;
                self.check_contract_owner(actor_id)?;
                self.internal_update_fee_config(
                    total_fee_bps,
                    app_pool_fee_bps,
                    platform_storage_fee_bps,
                )?;
                Ok(Value::Null)
            }
            Action::RegisterApp { app_id, params } => {
                self.internal_register_app(actor_id, &app_id, params)?;
                Ok(Value::Null)
            }
            Action::SetAppConfig { app_id, params } => {
                self.internal_set_app_config(actor_id, &app_id, params)?;
                Ok(Value::Null)
            }
            Action::TransferAppOwnership { app_id, new_owner } => {
                self.internal_transfer_app_ownership(actor_id, &app_id, new_owner)?;
                Ok(Value::Null)
            }
            Action::AddModerator { app_id, account_id } => {
                self.internal_add_moderator(actor_id, &app_id, account_id)?;
                Ok(Value::Null)
            }
            Action::RemoveModerator { app_id, account_id } => {
                self.internal_remove_moderator(actor_id, &app_id, &account_id)?;
                Ok(Value::Null)
            }
            Action::BanCollection {
                app_id,
                collection_id,
                reason,
            } => {
                self.internal_ban_collection(actor_id, &app_id, &collection_id, reason.as_deref())?;
                Ok(Value::Null)
            }
            Action::UnbanCollection {
                app_id,
                collection_id,
            } => {
                self.internal_unban_collection(actor_id, &app_id, &collection_id)?;
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_admin called with non-admin action"),
        }
    }
}
