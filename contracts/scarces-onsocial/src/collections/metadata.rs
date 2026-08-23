use crate::*;
use near_sdk::serde_json;

impl Contract {
    fn collection_browse_meta<'a>(
        collection: &'a LazyCollection,
        parsed: Option<&'a TokenMetadata>,
        royalty_json: Option<&'a str>,
        kind: Option<&'a str>,
    ) -> events::CollectionBrowseMeta<'a> {
        events::CollectionBrowseMeta {
            title: parsed.and_then(|m| m.title.as_deref()),
            media: parsed.and_then(|m| m.media.as_deref()),
            description: parsed.and_then(|m| m.description.as_deref()),
            kind,
            metadata_template: Some(collection.metadata_template.as_str()),
            metadata: collection.metadata.as_deref(),
            royalty_json,
        }
    }

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
                    collection.app_id.as_deref(),
                )?;
            }
            std::cmp::Ordering::Less => {
                self.release_storage_waterfall(
                    actor_id,
                    before - after,
                    collection.app_id.as_deref(),
                );
            }
            std::cmp::Ordering::Equal => {}
        }

        let parsed = serde_json::from_str::<TokenMetadata>(&collection.metadata_template).ok();
        let kind = events::kind_from_extra(parsed.as_ref().and_then(|m| m.extra.as_deref()));
        let royalty_json = collection
            .royalty
            .as_ref()
            .and_then(|r| serde_json::to_string(r).ok());
        events::emit_collection_metadata_update(
            actor_id,
            collection_id,
            Self::collection_browse_meta(
                &collection,
                parsed.as_ref(),
                royalty_json.as_deref(),
                kind.as_deref(),
            ),
        );
        Ok(())
    }

    /// Rain-day postpone: rewrite the mint template's `expires_at` (and the
    /// `extra.eventEndsAt` display field when present) so tokens minted after
    /// a date change match the renewed ones. Renewable collections only —
    /// same gate as `renew_token` ("Allow date changes").
    pub(crate) fn update_collection_template_expiry(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        expires_at_ms: u64,
    ) -> Result<(), MarketplaceError> {
        let mut collection = self
            .collections
            .get(collection_id)
            .cloned()
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?;

        self.check_collection_authority(actor_id, &collection)?;

        if !collection.renewable {
            return Err(MarketplaceError::InvalidState(
                "Collection is not renewable".into(),
            ));
        }
        if expires_at_ms <= crate::time::now_ms() {
            return Err(MarketplaceError::InvalidInput(
                "New expiry must be in the future".into(),
            ));
        }
        crate::validation::validate_nep177_timestamp_ms("expires_at", Some(expires_at_ms))?;

        // Rewrite as generic JSON so unknown template keys survive untouched.
        let mut template: serde_json::Value = serde_json::from_str(&collection.metadata_template)
            .map_err(|_| {
            MarketplaceError::InvalidState("Collection template is not valid JSON".into())
        })?;
        let obj = template.as_object_mut().ok_or_else(|| {
            MarketplaceError::InvalidState("Collection template is not a JSON object".into())
        })?;
        obj.insert("expires_at".into(), expires_at_ms.into());

        // `extra` is a JSON string field; sync eventEndsAt when it exists.
        if let Some(extra_str) = obj.get("extra").and_then(|v| v.as_str()) {
            if let Ok(mut extra_json) = serde_json::from_str::<serde_json::Value>(extra_str) {
                if let Some(extra_obj) = extra_json.as_object_mut() {
                    if extra_obj.contains_key("eventEndsAt") {
                        extra_obj.insert("eventEndsAt".into(), expires_at_ms.into());
                        let next_extra = serde_json::to_string(&extra_json).map_err(|_| {
                            MarketplaceError::InternalError(
                                "Failed to serialize template extra".into(),
                            )
                        })?;
                        obj.insert("extra".into(), serde_json::Value::String(next_extra));
                    }
                }
            }
        }

        let next_template = serde_json::to_string(&template)
            .map_err(|_| MarketplaceError::InternalError("Failed to serialize template".into()))?;
        if next_template.len() > MAX_METADATA_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Metadata template exceeds max length of {}",
                MAX_METADATA_LEN
            )));
        }
        collection.metadata_template = next_template;

        let before = self.storage_usage_flushed();
        self.collections
            .insert(collection_id.to_string(), collection.clone());
        let after = self.storage_usage_flushed();

        match after.cmp(&before) {
            std::cmp::Ordering::Greater => {
                self.charge_storage_waterfall(
                    actor_id,
                    after - before,
                    collection.app_id.as_deref(),
                )?;
            }
            std::cmp::Ordering::Less => {
                self.release_storage_waterfall(
                    actor_id,
                    before - after,
                    collection.app_id.as_deref(),
                );
            }
            std::cmp::Ordering::Equal => {}
        }

        let parsed = serde_json::from_str::<TokenMetadata>(&collection.metadata_template).ok();
        let kind = events::kind_from_extra(parsed.as_ref().and_then(|m| m.extra.as_deref()));
        let royalty_json = collection
            .royalty
            .as_ref()
            .and_then(|r| serde_json::to_string(r).ok());
        events::emit_collection_metadata_update(
            actor_id,
            collection_id,
            Self::collection_browse_meta(
                &collection,
                parsed.as_ref(),
                royalty_json.as_deref(),
                kind.as_deref(),
            ),
        );
        Ok(())
    }

    // Security boundary: app metadata is controlled by app authority and only for collections bound to that app.
    pub(crate) fn set_collection_app_metadata(
        &mut self,
        actor_id: &AccountId,
        app_id: &str,
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

        if collection.app_id.as_deref() != Some(app_id) {
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
                    collection.app_id.as_deref(),
                )?;
            }
            std::cmp::Ordering::Less => {
                self.release_storage_waterfall(
                    actor_id,
                    before - after,
                    collection.app_id.as_deref(),
                );
            }
            std::cmp::Ordering::Equal => {}
        }

        events::emit_collection_app_metadata_update(
            actor_id,
            app_id,
            collection_id,
            collection.app_metadata.as_deref(),
        );
        Ok(())
    }
}
