use crate::*;

impl Contract {
    pub(crate) fn add_moderator(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        account_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        let mut pool = self
            .app_pools
            .remove(app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        if actor_id != &pool.owner_id {
            self.app_pools.insert(app_id.clone(), pool);
            return Err(MarketplaceError::only_owner("pool owner"));
        }
        if pool.moderators.contains(&account_id) {
            self.app_pools.insert(app_id.clone(), pool);
            return Err(MarketplaceError::InvalidState(
                "Account is already a moderator".to_string(),
            ));
        }
        if pool.moderators.len() >= 20 {
            self.app_pools.insert(app_id.clone(), pool);
            return Err(MarketplaceError::InvalidInput(
                "Maximum 20 moderators per app".to_string(),
            ));
        }
        pool.moderators.push(account_id.clone());
        self.app_pools.insert(app_id.clone(), pool);
        events::emit_moderator_added(actor_id, app_id, &account_id);
        Ok(())
    }

    pub(crate) fn remove_moderator(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        account_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        let mut pool = self
            .app_pools
            .remove(app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        if actor_id != &pool.owner_id {
            self.app_pools.insert(app_id.clone(), pool);
            return Err(MarketplaceError::only_owner("pool owner"));
        }
        let before = pool.moderators.len();
        pool.moderators.retain(|m| m != account_id);
        if pool.moderators.len() == before {
            self.app_pools.insert(app_id.clone(), pool);
            return Err(MarketplaceError::NotFound(
                "Account is not a moderator".to_string(),
            ));
        }
        self.app_pools.insert(app_id.clone(), pool);
        events::emit_moderator_removed(actor_id, app_id, account_id);
        Ok(())
    }

    pub(crate) fn ban_collection(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        collection_id: &str,
        reason: Option<&str>,
    ) -> Result<(), MarketplaceError> {
        let pool = self
            .app_pools
            .get(app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        if !Self::is_app_authority(pool, actor_id) {
            return Err(MarketplaceError::Unauthorized(
                "Only app owner or moderator can ban collections".to_string(),
            ));
        }

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        match collection.app_id {
            Some(ref coll_app) if coll_app == app_id => {}
            _ => {
                return Err(MarketplaceError::Unauthorized(
                    "Collection does not belong to this app".into(),
                ));
            }
        }

        if collection.banned {
            return Err(MarketplaceError::InvalidState(
                "Collection is already banned".into(),
            ));
        }

        self.set_collection_banned(collection_id, true);
        events::emit_collection_banned(actor_id, collection_id, reason);
        Ok(())
    }

    pub(crate) fn unban_collection(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        collection_id: &str,
    ) -> Result<(), MarketplaceError> {
        let pool = self
            .app_pools
            .get(app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        if !Self::is_app_authority(pool, actor_id) {
            return Err(MarketplaceError::Unauthorized(
                "Only app owner or moderator can unban collections".to_string(),
            ));
        }

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        match collection.app_id {
            Some(ref coll_app) if coll_app == app_id => {}
            _ => {
                return Err(MarketplaceError::Unauthorized(
                    "Collection does not belong to this app".into(),
                ));
            }
        }

        if !collection.banned {
            return Err(MarketplaceError::InvalidState(
                "Collection is not banned".into(),
            ));
        }

        self.set_collection_banned(collection_id, false);
        events::emit_collection_unbanned(actor_id, collection_id);
        Ok(())
    }
}
