use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_lazy_listings(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::CreateLazyListing {
                params,
                usd_e6,
                min_near,
            } => {
                let min = min_near.map(|value| value.0).unwrap_or(0);
                let mut params = params;
                if let Some(usd) = usd_e6 {
                    self.validate_dollar_listing(DOLLAR_SCOPE_LAZY, "pending", usd.0)?;
                    params.price = Contract::stored_near_for_dollar(min);
                }
                let listing_id =
                    self.create_lazy_listing(actor_id, params, usd_e6.map(|usd| usd.0))?;
                if let Some(usd) = usd_e6 {
                    self.write_dollar(DOLLAR_SCOPE_LAZY, &listing_id, usd.0, min, actor_id)?;
                }
                Ok(Value::String(listing_id))
            }
            Action::CancelLazyListing { listing_id } => {
                self.cancel_lazy_listing(actor_id, &listing_id)?;
                self.clear_dollar(DOLLAR_SCOPE_LAZY, &listing_id, actor_id);
                Ok(Value::Null)
            }
            Action::UpdateLazyListingPrice {
                listing_id,
                new_price,
                usd_e6,
                min_near,
            } => {
                let min = min_near.map(|value| value.0).unwrap_or(0);
                if let Some(usd) = usd_e6 {
                    self.validate_dollar_listing(DOLLAR_SCOPE_LAZY, &listing_id, usd.0)?;
                }
                let stored = if usd_e6.is_some() {
                    Contract::stored_near_for_dollar(min).0
                } else {
                    new_price.0
                };
                self.update_lazy_listing_price(
                    actor_id,
                    &listing_id,
                    stored,
                    usd_e6.map(|usd| usd.0),
                )?;
                if let Some(usd) = usd_e6 {
                    self.write_dollar(DOLLAR_SCOPE_LAZY, &listing_id, usd.0, min, actor_id)?;
                } else {
                    self.clear_dollar(DOLLAR_SCOPE_LAZY, &listing_id, actor_id);
                }
                Ok(Value::Null)
            }
            Action::UpdateLazyListingExpiry {
                listing_id,
                new_expires_at,
            } => {
                self.update_lazy_listing_expiry(actor_id, &listing_id, new_expires_at)?;
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_lazy_listings called with non-lazy-listing action"),
        }
    }
}
