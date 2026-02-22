//! Dispatch arms for lazy-listing management operations.

use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_lazy_listings(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::CreateLazyListing { params } => {
                let listing_id = self.internal_create_lazy_listing(actor_id, params)?;
                Ok(Value::String(listing_id))
            }
            Action::CancelLazyListing { listing_id } => {
                self.internal_cancel_lazy_listing(actor_id, &listing_id)?;
                Ok(Value::Null)
            }
            Action::UpdateLazyListingPrice {
                listing_id,
                new_price,
            } => {
                self.internal_update_lazy_listing_price(actor_id, &listing_id, new_price.0)?;
                Ok(Value::Null)
            }
            Action::UpdateLazyListingExpiry {
                listing_id,
                new_expires_at,
            } => {
                self.internal_update_lazy_listing_expiry(actor_id, &listing_id, new_expires_at)?;
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_lazy_listings called with non-lazy-listing action"),
        }
    }
}
