use crate::*;

impl Contract {
    pub(crate) fn set_allowlist(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        entries: Vec<crate::protocol::AllowlistEntry>,
    ) -> Result<(), MarketplaceError> {
        if entries.is_empty() || entries.len() > 100 {
            return Err(MarketplaceError::InvalidInput(
                "1-100 entries per call".into(),
            ));
        }

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;

        let before = self.storage_usage_flushed();

        let mut accounts = Vec::with_capacity(entries.len());
        for entry in &entries {
            let key = format!("{}:al:{}", collection_id, entry.account_id);
            if entry.allocation > 0 {
                self.collection_allowlist.insert(key, entry.allocation);
            } else {
                self.collection_allowlist.remove(&key);
            }
            accounts.push(entry.account_id.clone());
        }

        let after = self.storage_usage_flushed();
        let bytes_used = after.saturating_sub(before);
        if bytes_used > 0 {
            self.charge_storage_waterfall(actor_id, bytes_used, collection.app_id.as_ref())?;
        }

        events::emit_allowlist_updated(actor_id, collection_id, &accounts, entries.len() as u32);
        Ok(())
    }

    pub(crate) fn remove_from_allowlist(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        accounts: Vec<AccountId>,
    ) -> Result<(), MarketplaceError> {
        if accounts.is_empty() || accounts.len() > 100 {
            return Err(MarketplaceError::InvalidInput(
                "1-100 accounts per call".into(),
            ));
        }

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;

        let before = self.storage_usage_flushed();
        for account in &accounts {
            let key = format!("{}:al:{}", collection_id, account);
            self.collection_allowlist.remove(&key);
        }

        let after = self.storage_usage_flushed();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(
                actor_id,
                bytes_freed,
                collection.app_id.as_ref(),
            );
        }

        events::emit_allowlist_removed(actor_id, collection_id, &accounts);
        Ok(())
    }
}
