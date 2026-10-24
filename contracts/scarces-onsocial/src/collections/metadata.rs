use crate::*;
use near_sdk::serde_json;

fn template_extra_u64(template: &serde_json::Value, key: &str) -> Option<u64> {
    let extra_str = template.get("extra")?.as_str()?;
    let extra: serde_json::Value = serde_json::from_str(extra_str).ok()?;
    extra.get(key)?.as_u64()
}

fn template_event_ends_at(template: &serde_json::Value) -> Option<u64> {
    template_extra_u64(template, "eventEndsAt")
}

fn template_event_starts_at(template: &serde_json::Value) -> Option<u64> {
    template_extra_u64(template, "eventStartsAt")
}

fn metadata_event_starts_at(existing: Option<&str>) -> Option<u64> {
    let raw = existing.map(str::trim).filter(|s| !s.is_empty())?;
    let meta: serde_json::Value = serde_json::from_str(raw).ok()?;
    meta.get("eventStartsAt")?.as_u64()
}

const SALE_CLOSE_MINUTE_MS: u64 = 60_000;

/// A sale close stored in nanoseconds sits on the same minute as an event end
/// in milliseconds. The app signs a blank ticket close as that event end.
fn sale_close_matches_event_end(end_time_ns: u64, event_end_ms: u64) -> bool {
    let end_ms = end_time_ns / crate::NS_PER_MS;
    end_ms / SALE_CLOSE_MINUTE_MS == event_end_ms / SALE_CLOSE_MINUTE_MS
}

/// New sale close, in nanoseconds, when postpone should carry the sale with
/// the event. `None` leaves the sale clock alone: no close, or a close on an
/// earlier minute. The open time is never cleared.
fn sale_end_after_postpone(
    start_time_ns: Option<u64>,
    end_time_ns: Option<u64>,
    event_end_ms: Option<u64>,
    new_event_end_ms: u64,
) -> Result<Option<u64>, MarketplaceError> {
    let (Some(end_ns), Some(anchor_ms)) = (end_time_ns, event_end_ms) else {
        return Ok(None);
    };
    if !sale_close_matches_event_end(end_ns, anchor_ms) {
        return Ok(None);
    }
    let next_ns = new_event_end_ms
        .checked_mul(crate::NS_PER_MS)
        .ok_or_else(|| {
            MarketplaceError::InvalidInput("New event end is too far to set the sale close.".into())
        })?;
    if start_time_ns.is_some_and(|start| next_ns <= start) {
        return Err(MarketplaceError::InvalidInput(
            "New event end must stay after the sale open.".into(),
        ));
    }
    if next_ns == end_ns {
        return Ok(None);
    }
    Ok(Some(next_ns))
}

/// Keep series, cover, and the rest of freeform metadata. Record what moved.
fn merge_postpone_metadata(
    existing: Option<&str>,
    previous_end: Option<u64>,
    start_move: Option<(u64, u64)>,
) -> Result<String, MarketplaceError> {
    let mut meta = match existing.map(str::trim).filter(|s| !s.is_empty()) {
        Some(raw) => {
            serde_json::from_str::<serde_json::Value>(raw).unwrap_or(serde_json::json!({}))
        }
        None => serde_json::json!({}),
    };
    if !meta.is_object() {
        meta = serde_json::json!({});
    }
    let obj = meta.as_object_mut().ok_or_else(|| {
        MarketplaceError::InternalError("Collection metadata is not a JSON object".into())
    })?;
    if let Some(previous_ms) = previous_end {
        obj.insert(
            "eventEndsAtPrevious".into(),
            serde_json::Value::from(previous_ms),
        );
    }
    if let Some((previous_ms, next_ms)) = start_move {
        obj.insert(
            "eventStartsAtPrevious".into(),
            serde_json::Value::from(previous_ms),
        );
        obj.insert("eventStartsAt".into(), serde_json::Value::from(next_ms));
    }
    serde_json::to_string(&meta).map_err(|_| {
        MarketplaceError::InternalError("Failed to serialize collection metadata".into())
    })
}

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

    pub(crate) fn update_collection_template_expiry(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        expires_at_ms: u64,
        starts_at_ms: Option<u64>,
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
        let template_exp = template.get("expires_at").and_then(|v| v.as_u64());
        if crate::scarce::admission_closed(
            template_exp,
            collection.event_ends_at,
            crate::time::now_ms(),
        ) {
            return Err(MarketplaceError::InvalidState("Event has ended".into()));
        }
        let prior_end = collection
            .event_ends_at
            .or_else(|| template_event_ends_at(&template));
        let current_start = metadata_event_starts_at(collection.metadata.as_deref())
            .or_else(|| template_event_starts_at(&template));
        let start_move = match starts_at_ms {
            Some(next_start) if current_start != Some(next_start) => {
                let Some(current_start) = current_start else {
                    return Err(MarketplaceError::InvalidInput("Event has no start".into()));
                };
                if crate::time::now_ms() >= current_start {
                    return Err(MarketplaceError::InvalidState("Event has started".into()));
                }
                if next_start <= crate::time::now_ms() {
                    return Err(MarketplaceError::InvalidInput(
                        "New start must be in the future".into(),
                    ));
                }
                if next_start >= expires_at_ms {
                    return Err(MarketplaceError::InvalidInput(
                        "New start must be before the new end".into(),
                    ));
                }
                crate::validation::validate_nep177_timestamp_ms("starts_at", Some(next_start))?;
                Some((current_start, next_start))
            }
            _ => None,
        };
        // Door end the sale may be pinned to. Prefer the postpone override,
        // then the template expiry buyers already see.
        let sale_anchor_ms = collection
            .event_ends_at
            .or(template_exp)
            .or_else(|| template_event_ends_at(&template));
        let followed_sale_end = sale_end_after_postpone(
            collection.start_time,
            collection.end_time,
            sale_anchor_ms,
            expires_at_ms,
        )?;
        let end_move = prior_end.filter(|prior| *prior != expires_at_ms);
        if end_move.is_some() || start_move.is_some() {
            let next_meta =
                merge_postpone_metadata(collection.metadata.as_deref(), end_move, start_move)?;
            crate::validation::validate_metadata_json(&next_meta)?;
            collection.metadata = Some(next_meta);
        }
        let obj = template.as_object_mut().ok_or_else(|| {
            MarketplaceError::InvalidState("Collection template is not a JSON object".into())
        })?;

        obj.insert("expires_at".into(), expires_at_ms.into());

        if let Some(extra_str) = obj.get("extra").and_then(|v| v.as_str())
            && let Ok(mut extra_json) = serde_json::from_str::<serde_json::Value>(extra_str)
            && let Some(extra_obj) = extra_json.as_object_mut()
        {
            let mut changed = false;
            if extra_obj.contains_key("eventEndsAt") {
                extra_obj.insert("eventEndsAt".into(), expires_at_ms.into());
                changed = true;
            }
            if let Some((_, next_start)) = start_move
                && extra_obj.contains_key("eventStartsAt")
            {
                extra_obj.insert("eventStartsAt".into(), next_start.into());
                changed = true;
            }
            if changed {
                let next_extra = serde_json::to_string(&extra_json).map_err(|_| {
                    MarketplaceError::InternalError("Failed to serialize template extra".into())
                })?;
                obj.insert("extra".into(), serde_json::Value::String(next_extra));
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
        collection.event_ends_at = Some(expires_at_ms);
        if let Some(end_ns) = followed_sale_end {
            collection.end_time = Some(end_ns);
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
        if let Some(end_ns) = followed_sale_end {
            events::emit_collection_timing_updated(
                actor_id,
                collection_id,
                collection.start_time,
                Some(end_ns),
            );
        }
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

#[cfg(test)]
mod sale_follow_tests {
    use super::{sale_close_matches_event_end, sale_end_after_postpone};
    use crate::NS_PER_MS;

    const EVENT_MS: u64 = 1_700_086_400_000;
    const NEW_EVENT_MS: u64 = 1_700_345_600_000;
    const OPEN_NS: u64 = 1_700_000_000_000_000_000;

    #[test]
    fn same_minute_follows_and_an_earlier_minute_stays() {
        let same_ns = EVENT_MS * NS_PER_MS;
        assert!(sale_close_matches_event_end(same_ns, EVENT_MS));
        assert!(!sale_close_matches_event_end(
            (EVENT_MS - 60_000) * NS_PER_MS,
            EVENT_MS
        ));
        assert_eq!(
            sale_end_after_postpone(Some(OPEN_NS), Some(same_ns), Some(EVENT_MS), NEW_EVENT_MS)
                .unwrap(),
            Some(NEW_EVENT_MS * NS_PER_MS)
        );
        assert_eq!(
            sale_end_after_postpone(
                Some(OPEN_NS),
                Some((EVENT_MS - 60_000) * NS_PER_MS),
                Some(EVENT_MS),
                NEW_EVENT_MS
            )
            .unwrap(),
            None
        );
        assert_eq!(
            sale_end_after_postpone(None, None, Some(EVENT_MS), NEW_EVENT_MS).unwrap(),
            None
        );
        assert!(
            sale_end_after_postpone(
                Some(NEW_EVENT_MS * NS_PER_MS),
                Some(same_ns),
                Some(EVENT_MS),
                NEW_EVENT_MS
            )
            .is_err()
        );
    }
}
