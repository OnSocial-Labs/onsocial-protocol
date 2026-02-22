use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_payments(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::PurchaseFromCollection {
                collection_id,
                quantity,
                max_price_per_token,
            } => {
                let deposit = core::mem::take(&mut self.pending_attached_balance);
                self.purchase_from_collection(
                    actor_id,
                    collection_id,
                    quantity,
                    max_price_per_token,
                    deposit,
                )?;
                Ok(Value::Null)
            }
            Action::PurchaseLazyListing { listing_id } => {
                let deposit = core::mem::take(&mut self.pending_attached_balance);
                let token_id =
                    self.purchase_lazy_listing(actor_id, listing_id, deposit)?;
                Ok(Value::String(token_id))
            }
            Action::PurchaseNativeScarce { token_id } => {
                let deposit = core::mem::take(&mut self.pending_attached_balance);
                self.purchase_native_scarce(actor_id, token_id, deposit)?;
                Ok(Value::Null)
            }
            Action::PlaceBid { token_id, amount } => {
                let bid_amount = amount.0;
                if self.pending_attached_balance < bid_amount {
                    return Err(MarketplaceError::InsufficientDeposit(format!(
                        "Insufficient deposit for bid: need {}, have {}",
                        bid_amount, self.pending_attached_balance
                    )));
                }
                self.pending_attached_balance -= bid_amount;
                self.place_bid(actor_id, token_id, bid_amount)?;
                Ok(Value::Null)
            }
            Action::MakeOffer {
                token_id,
                amount,
                expires_at,
            } => {
                let offer_amount = amount.0;
                if self.pending_attached_balance < offer_amount {
                    return Err(MarketplaceError::InsufficientDeposit(format!(
                        "Insufficient deposit for offer: need {}, have {}",
                        offer_amount, self.pending_attached_balance
                    )));
                }
                self.pending_attached_balance -= offer_amount;
                self.make_offer(actor_id, &token_id, offer_amount, expires_at)?;
                Ok(Value::Null)
            }
            Action::MakeCollectionOffer {
                collection_id,
                amount,
                expires_at,
            } => {
                let offer_amount = amount.0;
                if self.pending_attached_balance < offer_amount {
                    return Err(MarketplaceError::InsufficientDeposit(format!(
                        "Insufficient deposit for collection offer: need {}, have {}",
                        offer_amount, self.pending_attached_balance
                    )));
                }
                self.pending_attached_balance -= offer_amount;
                self.make_collection_offer(
                    actor_id,
                    &collection_id,
                    offer_amount,
                    expires_at,
                )?;
                Ok(Value::Null)
            }
            Action::CancelCollection {
                collection_id,
                refund_per_token,
                refund_deadline_ns,
            } => {
                let deposit = core::mem::take(&mut self.pending_attached_balance);
                self.cancel_collection(
                    actor_id,
                    &collection_id,
                    refund_per_token,
                    refund_deadline_ns,
                    deposit,
                )?;
                Ok(Value::Null)
            }
            Action::FundAppPool { app_id } => {
                let deposit = core::mem::take(&mut self.pending_attached_balance);
                self.fund_app_pool(actor_id, &app_id, deposit)?;
                Ok(Value::Null)
            }
            Action::StorageDeposit { account_id } => {
                let deposit = core::mem::take(&mut self.pending_attached_balance);
                let storage_account = account_id.as_ref().unwrap_or(actor_id);
                self.storage_deposit(storage_account, deposit)?;
                Ok(Value::Null)
            }
            Action::RegisterApp { app_id, params } => {
                let deposit = core::mem::take(&mut self.pending_attached_balance);
                self.register_app(actor_id, &app_id, params, deposit)?;
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_payments called with non-payment action"),
        }
    }
}
