use crate::*;

impl Contract {
    pub(crate) fn set_collection_metadata(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        metadata: Option<String>,
    ) -> Result<(), MarketplaceError> {
        let mut collection = self
            .collections
            .get(collection_id)
            .cloned()
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?;

        self.check_collection_authority(actor_id, &collection)?;

        // State transition invariant: None preserves state; Some("") clears; Some(json) replaces.
        if let Some(m) = metadata {
            if m.is_empty() {
                collection.metadata = None;
            } else {
                crate::validation::validate_metadata_json(&m)?;
                collection.metadata = Some(m);
            }
        } else {
            return Ok(());
        }

        let before = self.storage_usage_flushed();
        self.collections
            .insert(collection_id.to_string(), collection.clone());
        let after = self.storage_usage_flushed();

        match after.cmp(&before) {
            std::cmp::Ordering::Greater => {
                self.charge_storage_waterfall(
                    actor_id,
                    after - before,
                    collection.app_id.as_ref(),
                )?;
            }
            std::cmp::Ordering::Less => {
                self.release_storage_waterfall(
                    actor_id,
                    before - after,
                    collection.app_id.as_ref(),
                );
            }
            std::cmp::Ordering::Equal => {}
        }

        events::emit_collection_metadata_update(actor_id, collection_id);
        Ok(())
    }

    // Security boundary: app metadata is controlled by app authority and only for collections bound to that app.
    pub(crate) fn set_collection_app_metadata(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        collection_id: &str,
        metadata: Option<String>,
    ) -> Result<(), MarketplaceError> {
        let pool = self
            .app_pools
            .get(app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        if !Self::is_app_authority(pool, actor_id) {
            return Err(MarketplaceError::Unauthorized(
                "Only app owner or moderator can set app metadata on collections".into(),
            ));
        }

        let mut collection = self
            .collections
            .get(collection_id)
            .cloned()
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?;

        if collection.app_id.as_ref() != Some(app_id) {
            return Err(MarketplaceError::Unauthorized(
                "Collection does not belong to this app".into(),
            ));
        }

        // State transition invariant: None preserves state; Some("") clears; Some(json) replaces.
        if let Some(m) = metadata {
            if m.is_empty() {
                collection.app_metadata = None;
            } else {
                crate::validation::validate_metadata_json(&m)?;
                collection.app_metadata = Some(m);
            }
        } else {
            return Ok(());
        }

        let before = self.storage_usage_flushed();
        self.collections
            .insert(collection_id.to_string(), collection.clone());
        let after = self.storage_usage_flushed();

        match after.cmp(&before) {
            std::cmp::Ordering::Greater => {
                self.charge_storage_waterfall(
                    actor_id,
                    after - before,
                    collection.app_id.as_ref(),
                )?;
            }
            std::cmp::Ordering::Less => {
                self.release_storage_waterfall(
                    actor_id,
                    before - after,
                    collection.app_id.as_ref(),
                );
            }
            std::cmp::Ordering::Equal => {}
        }

        events::emit_collection_app_metadata_update(actor_id, app_id, collection_id);
        Ok(())
    }
}
