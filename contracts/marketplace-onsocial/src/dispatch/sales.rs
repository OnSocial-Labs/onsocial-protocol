//! Dispatch arms for listing, delisting, and auction operations.

use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_sales(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::ListNativeScarce {
                token_id,
                price,
                expires_at,
            } => {
                self.internal_list_native_scarce(actor_id, &token_id, price, expires_at)?;
                Ok(Value::Null)
            }
            Action::DelistNativeScarce { token_id } => {
                self.internal_delist_native_scarce(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::ListNativeScarceAuction { token_id, params } => {
                self.internal_list_native_scarce_auction(actor_id, &token_id, params)?;
                Ok(Value::Null)
            }
            Action::SettleAuction { token_id } => {
                self.internal_settle_auction(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::CancelAuction { token_id } => {
                self.internal_cancel_auction(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::DelistScarce {
                scarce_contract_id,
                token_id,
            } => {
                self.internal_delist_scarce(actor_id, &scarce_contract_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::UpdatePrice {
                scarce_contract_id,
                token_id,
                price,
            } => {
                self.internal_update_price(actor_id, &scarce_contract_id, &token_id, price)?;
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_sales called with non-sale action"),
        }
    }
}
