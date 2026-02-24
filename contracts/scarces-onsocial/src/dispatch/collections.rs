use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_collections(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::CreateCollection { params } => {
                self.create_collection(actor_id, params)?;
                Ok(Value::Null)
            }
            Action::UpdateCollectionPrice {
                collection_id,
                new_price_near,
            } => {
                self.update_collection_price(actor_id, collection_id, new_price_near)?;
                Ok(Value::Null)
            }
            Action::UpdateCollectionTiming {
                collection_id,
                start_time,
                end_time,
            } => {
                self.update_collection_timing(actor_id, collection_id, start_time, end_time)?;
                Ok(Value::Null)
            }
            Action::MintFromCollection {
                collection_id,
                quantity,
                receiver_id,
            } => {
                self.mint_from_collection(
                    actor_id,
                    &collection_id,
                    quantity,
                    receiver_id.as_ref(),
                )?;
                Ok(Value::Null)
            }
            Action::AirdropFromCollection {
                collection_id,
                receivers,
            } => {
                self.airdrop_from_collection(actor_id, &collection_id, receivers)?;
                Ok(Value::Null)
            }
            Action::DeleteCollection { collection_id } => {
                self.delete_collection(actor_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::PauseCollection { collection_id } => {
                self.pause_collection(actor_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::ResumeCollection { collection_id } => {
                self.resume_collection(actor_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::SetAllowlist {
                collection_id,
                entries,
            } => {
                self.set_allowlist(actor_id, &collection_id, entries)?;
                Ok(Value::Null)
            }
            Action::RemoveFromAllowlist {
                collection_id,
                accounts,
            } => {
                self.remove_from_allowlist(actor_id, &collection_id, accounts)?;
                Ok(Value::Null)
            }
            Action::SetCollectionMetadata {
                collection_id,
                metadata,
            } => {
                self.set_collection_metadata(actor_id, &collection_id, metadata)?;
                Ok(Value::Null)
            }
            Action::SetCollectionAppMetadata {
                app_id,
                collection_id,
                metadata,
            } => {
                self.set_collection_app_metadata(actor_id, &app_id, &collection_id, metadata)?;
                Ok(Value::Null)
            }
            Action::WithdrawUnclaimedRefunds { collection_id } => {
                self.withdraw_unclaimed_refunds(actor_id, &collection_id)?;
                Ok(Value::Null)
            }
            _ => unreachable!("dispatch_collections called with non-collection action"),
        }
    }
}
