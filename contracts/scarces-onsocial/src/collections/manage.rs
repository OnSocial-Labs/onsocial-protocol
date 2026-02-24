use crate::*;
use near_sdk::json_types::U128;

impl Contract {
    pub(crate) fn update_collection_price(
        &mut self,
        caller: &AccountId,
        collection_id: String,
        new_price_near: U128,
    ) -> Result<(), MarketplaceError> {
        let mut collection = self
            .collections
            .get(&collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        if &collection.creator_id != caller {
            return Err(MarketplaceError::Unauthorized(
                "Only collection creator can update price".into(),
            ));
        }

        if let Some(sp) = &collection.start_price {
            if new_price_near.0 >= sp.0 {
                return Err(MarketplaceError::InvalidInput(
                    "price_near must remain below start_price for Dutch auction".into(),
                ));
            }
        }

        let old_price = collection.price_near;
        collection.price_near = new_price_near;
        self.collections.insert(collection_id.clone(), collection);
        events::emit_collection_price_updated(caller, &collection_id, old_price, new_price_near);
        Ok(())
    }

    pub(crate) fn update_collection_timing(
        &mut self,
        caller: &AccountId,
        collection_id: String,
        start_time: Option<u64>,
        end_time: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        if let (Some(start), Some(end)) = (start_time, end_time) {
            if end <= start {
                return Err(MarketplaceError::InvalidInput(
                    "End time must be after start time".into(),
                ));
            }
        }

        let mut collection = self
            .collections
            .get(&collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        if &collection.creator_id != caller {
            return Err(MarketplaceError::Unauthorized(
                "Only collection creator can update timing".into(),
            ));
        }

        if collection.start_price.is_some() && (start_time.is_none() || end_time.is_none()) {
            return Err(MarketplaceError::InvalidInput(
                "Dutch auction requires both start_time and end_time".into(),
            ));
        }

        collection.start_time = start_time;
        collection.end_time = end_time;
        self.collections.insert(collection_id.clone(), collection);
        events::emit_collection_timing_updated(caller, &collection_id, start_time, end_time);
        Ok(())
    }

    pub(crate) fn is_collection_active(&self, collection: &LazyCollection) -> bool {
        if collection.banned || collection.cancelled || collection.paused {
            return false;
        }
        let now = env::block_timestamp();
        if collection.minted_count >= collection.total_supply {
            return false;
        }
        if let Some(start) = collection.start_time {
            if now < start {
                return false;
            }
        }
        if let Some(end) = collection.end_time {
            if now > end {
                return false;
            }
        }
        true
    }

    // State transition invariant: paused collections remain resumable; cancelled collections are terminal.
    pub(crate) fn pause_collection(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
    ) -> Result<(), MarketplaceError> {
        let mut collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;
        if collection.cancelled {
            return Err(MarketplaceError::InvalidState(
                "Cannot pause a cancelled collection".into(),
            ));
        }
        if collection.paused {
            return Err(MarketplaceError::InvalidState(
                "Collection is already paused".into(),
            ));
        }

        collection.paused = true;
        self.collections
            .insert(collection_id.to_string(), collection);

        events::emit_collection_paused(actor_id, collection_id);
        Ok(())
    }

    pub(crate) fn resume_collection(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
    ) -> Result<(), MarketplaceError> {
        let mut collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;
        if !collection.paused {
            return Err(MarketplaceError::InvalidState(
                "Collection is not paused".into(),
            ));
        }

        collection.paused = false;
        self.collections
            .insert(collection_id.to_string(), collection);

        events::emit_collection_resumed(actor_id, collection_id);
        Ok(())
    }

    pub(crate) fn delete_collection(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
    ) -> Result<(), MarketplaceError> {
        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;

        if collection.minted_count != 0 {
            return Err(MarketplaceError::InvalidState(
                "Cannot delete a collection that has minted tokens".into(),
            ));
        }

        let before = env::storage_usage();
        self.collections.remove(collection_id);

        if let Some(creator_set) = self.collections_by_creator.get_mut(&collection.creator_id) {
            creator_set.remove(collection_id);
            if creator_set.is_empty() {
                self.collections_by_creator.remove(&collection.creator_id);
            }
        }

        let after = env::storage_usage();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(
                &collection.creator_id,
                bytes_freed as u64,
                collection.app_id.as_ref(),
            );
        }

        events::emit_collection_deleted(actor_id, collection_id, &collection.creator_id);
        Ok(())
    }

    pub(crate) fn set_collection_banned(&mut self, collection_id: &str, banned: bool) {
        if let Some(mut collection) = self.collections.get(collection_id).cloned() {
            collection.banned = banned;
            self.collections
                .insert(collection_id.to_string(), collection);
        }
    }
}
