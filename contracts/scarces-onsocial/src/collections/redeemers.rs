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

        let before = self.storage_usage_flushed();
        collection.redeemers.push(account_id.clone());
        let app_id = collection.app_id.clone();
        self.collections
            .insert(collection_id.to_string(), collection);
        let after = self.storage_usage_flushed();
        let bytes_used = after.saturating_sub(before);
        if bytes_used > 0 {
            if let Err(e) = self.charge_storage_waterfall(actor_id, bytes_used, app_id.as_deref()) {
                // Roll back the roster write if storage charge fails.
                if let Some(mut rolled) = self.collections.get(collection_id).cloned() {
                    rolled.redeemers.retain(|id| id != &account_id);
                    self.collections.insert(collection_id.to_string(), rolled);
                }
                return Err(e);
            }
        }

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

        let before = self.storage_usage_flushed();
        let roster_before = collection.redeemers.len();
        collection.redeemers.retain(|id| id != account_id);
        if collection.redeemers.len() == roster_before {
            return Err(MarketplaceError::NotFound(
                "Account is not a redeemer".into(),
            ));
        }

        let app_id = collection.app_id.clone();
        self.collections
            .insert(collection_id.to_string(), collection);
        let after = self.storage_usage_flushed();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(actor_id, bytes_freed, app_id.as_deref());
        }

        events::emit_redeemer_removed(actor_id, collection_id, account_id);
        Ok(())
    }

    /// Replace the door-staff roster. Empty `account_ids` clears all redeemers.
    pub(crate) fn set_redeemers(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        account_ids: Vec<AccountId>,
    ) -> Result<(), MarketplaceError> {
        if account_ids.len() > MAX_COLLECTION_REDEEMERS {
            return Err(MarketplaceError::InvalidInput(format!(
                "Maximum {} redeemers per collection",
                MAX_COLLECTION_REDEEMERS
            )));
        }

        let mut collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;

        let mut next: Vec<AccountId> = Vec::with_capacity(account_ids.len());
        for id in account_ids {
            if !next.contains(&id) {
                next.push(id);
            }
        }

        let previous = collection.redeemers.clone();
        if previous == next {
            return Ok(());
        }

        let before = self.storage_usage_flushed();
        let app_id = collection.app_id.clone();
        collection.redeemers = next.clone();
        self.collections
            .insert(collection_id.to_string(), collection);
        let after = self.storage_usage_flushed();

        let bytes_used = after.saturating_sub(before);
        if bytes_used > 0 {
            if let Err(e) = self.charge_storage_waterfall(actor_id, bytes_used, app_id.as_deref()) {
                if let Some(mut rolled) = self.collections.get(collection_id).cloned() {
                    rolled.redeemers = previous;
                    self.collections.insert(collection_id.to_string(), rolled);
                }
                return Err(e);
            }
        }
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(actor_id, bytes_freed, app_id.as_deref());
        }

        for id in &previous {
            if !next.contains(id) {
                events::emit_redeemer_removed(actor_id, collection_id, id);
            }
        }
        for id in &next {
            if !previous.contains(id) {
                events::emit_redeemer_added(actor_id, collection_id, id);
            }
        }
        Ok(())
    }
}
