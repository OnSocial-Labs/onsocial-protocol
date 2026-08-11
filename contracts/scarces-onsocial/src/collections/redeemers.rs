use crate::*;

impl Contract {
    pub(crate) fn add_redeemer(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        account_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        let mut collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;

        if collection.redeemers.contains(&account_id) {
            return Err(MarketplaceError::InvalidState(
                "Account is already a redeemer".into(),
            ));
        }
        if collection.redeemers.len() >= MAX_COLLECTION_REDEEMERS {
            return Err(MarketplaceError::InvalidInput(format!(
                "Maximum {} redeemers per collection",
                MAX_COLLECTION_REDEEMERS
            )));
        }

        collection.redeemers.push(account_id.clone());
        self.collections
            .insert(collection_id.to_string(), collection);
        events::emit_redeemer_added(actor_id, collection_id, &account_id);
        Ok(())
    }

    pub(crate) fn remove_redeemer(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        account_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        let mut collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;

        let before = collection.redeemers.len();
        collection.redeemers.retain(|id| id != account_id);
        if collection.redeemers.len() == before {
            return Err(MarketplaceError::NotFound(
                "Account is not a redeemer".into(),
            ));
        }

        self.collections
            .insert(collection_id.to_string(), collection);
        events::emit_redeemer_removed(actor_id, collection_id, account_id);
        Ok(())
    }
}
