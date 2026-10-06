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
                usd_e6,
                min_near,
            } => {
                let min = min_near.map(|value| value.0).unwrap_or(0);
                if let Some(usd) = usd_e6 {
                    self.validate_dollar_listing(DOLLAR_SCOPE_SALE, &token_id, usd.0)?;
                }
                let list_price = if usd_e6.is_some() {
                    Contract::stored_near_for_dollar(min)
                } else {
                    price
                };
                self.list_native_scarce(
                    actor_id,
                    &token_id,
                    list_price,
                    expires_at,
                    usd_e6.map(|usd| usd.0),
                )?;
                if let Some(usd) = usd_e6 {
                    self.write_dollar(DOLLAR_SCOPE_SALE, &token_id, usd.0, min, actor_id)?;
                } else {
                    self.clear_dollar(DOLLAR_SCOPE_SALE, &token_id, actor_id);
                }
                Ok(Value::Null)
            }
            Action::DelistNativeScarce { token_id } => {
                self.delist_native_scarce(actor_id, &token_id)?;
                self.clear_dollar(DOLLAR_SCOPE_SALE, &token_id, actor_id);
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
                usd_e6,
                min_near,
            } => {
                let min = min_near.map(|value| value.0).unwrap_or(0);
                if let Some(usd) = usd_e6 {
                    self.validate_dollar_listing(DOLLAR_SCOPE_SALE, &token_id, usd.0)?;
                }
                let next_price = if usd_e6.is_some() {
                    Contract::stored_near_for_dollar(min)
                } else {
                    price
                };
                self.update_price(
                    actor_id,
                    &scarce_contract_id,
                    &token_id,
                    next_price,
                    usd_e6.map(|usd| usd.0),
                )?;
                if let Some(usd) = usd_e6 {
                    self.write_dollar(DOLLAR_SCOPE_SALE, &token_id, usd.0, min, actor_id)?;
                } else {
                    self.clear_dollar(DOLLAR_SCOPE_SALE, &token_id, actor_id);
                }
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_sales called with non-sale action"),
        }
    }
}
