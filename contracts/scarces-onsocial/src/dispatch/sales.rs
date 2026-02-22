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
                self.list_native_scarce(actor_id, &token_id, price, expires_at)?;
                Ok(Value::Null)
            }
            Action::DelistNativeScarce { token_id } => {
                self.delist_native_scarce(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::ListNativeScarceAuction { token_id, params } => {
                self.list_native_scarce_auction(actor_id, &token_id, params)?;
                Ok(Value::Null)
            }
            Action::SettleAuction { token_id } => {
                self.settle_auction(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::CancelAuction { token_id } => {
                self.cancel_auction(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::DelistScarce {
                scarce_contract_id,
                token_id,
            } => {
                self.delist_scarce(actor_id, &scarce_contract_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::UpdatePrice {
                scarce_contract_id,
                token_id,
                price,
            } => {
                self.update_price(actor_id, &scarce_contract_id, &token_id, price)?;
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_sales called with non-sale action"),
        }
    }
}
