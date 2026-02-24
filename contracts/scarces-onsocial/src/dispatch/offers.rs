use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_offers(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::AcceptOffer { token_id, buyer_id } => {
                self.accept_offer(actor_id, &token_id, &buyer_id)?;
                Ok(Value::Null)
            }
            Action::CancelOffer { token_id } => {
                self.cancel_offer(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::AcceptCollectionOffer {
                collection_id,
                token_id,
                buyer_id,
            } => {
                self.accept_collection_offer(actor_id, &collection_id, &token_id, &buyer_id)?;
                Ok(Value::Null)
            }
            Action::CancelCollectionOffer { collection_id } => {
                self.cancel_collection_offer(actor_id, &collection_id)?;
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_offers called with non-offer action"),
        }
    }
}
