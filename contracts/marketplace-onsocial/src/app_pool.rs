use crate::internal::check_one_yocto;
use crate::*;

// --- Public payable methods ---

#[near]
impl Contract {
    #[payable]
    #[handle_result]
    pub fn fund_app_pool(&mut self, app_id: AccountId) -> Result<(), MarketplaceError> {
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Must attach NEAR".to_string(),
            ));
        }

        let mut pool = self
            .app_pools
            .remove(&app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        pool.balance += deposit;
        let new_balance = pool.balance;
        self.app_pools.insert(app_id.clone(), pool);

        events::emit_app_pool_fund(
            &env::predecessor_account_id(),
            &app_id,
            deposit,
            new_balance,
        );
        Ok(())
    }

    /// Panics unless exactly 1 yoctoNEAR is attached (Full Access Key guard).
    #[payable]
    #[handle_result]
    pub fn withdraw_app_pool(
        &mut self,
        app_id: AccountId,
        amount: U128,
    ) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        let mut pool = self
            .app_pools
            .remove(&app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        if caller != pool.owner_id {
            self.app_pools.insert(app_id.clone(), pool);
            return Err(MarketplaceError::only_owner("pool owner"));
        }
        if amount.0 > pool.balance {
            return Err(MarketplaceError::InsufficientDeposit(
                "Insufficient pool balance".to_string(),
            ));
        }

        pool.balance -= amount.0;
        let new_balance = pool.balance;
        self.app_pools.insert(app_id.clone(), pool);

        let _ = Promise::new(caller.clone()).transfer(NearToken::from_yoctonear(amount.0));

        events::emit_app_pool_withdraw(&caller, &app_id, amount.0, new_balance);
        Ok(())
    }
}

// --- Views ---

#[near]
impl Contract {
    pub fn get_app_pool(&self, app_id: AccountId) -> Option<AppPool> {
        self.app_pools.get(&app_id).cloned()
    }

    pub fn get_app_user_usage(&self, account_id: AccountId, app_id: AccountId) -> u64 {
        let key = format!("{}:{}", account_id, app_id);
        self.app_user_usage.get(&key).copied().unwrap_or(0)
    }

    pub fn get_app_user_remaining(&self, account_id: AccountId, app_id: AccountId) -> u64 {
        let key = format!("{}:{}", account_id, app_id);
        let used = self.app_user_usage.get(&key).copied().unwrap_or(0);
        if let Some(pool) = self.app_pools.get(&app_id) {
            pool.max_user_bytes.saturating_sub(used)
        } else {
            0
        }
    }

    pub fn get_user_storage(&self, account_id: AccountId) -> UserStorageBalance {
        self.user_storage
            .get(&account_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn get_app_metadata(&self, app_id: AccountId) -> Option<Value> {
        self.app_pools
            .get(&app_id)
            .and_then(|pool| pool.metadata.as_ref())
            .and_then(|json_str| near_sdk::serde_json::from_str(json_str).ok())
    }

    /// Resolution order: collection metadata → app metadata → contract base_uri.
    pub fn resolve_base_uri(&self, collection_id: String) -> Option<String> {
        if let Some(collection) = self.collections.get(&collection_id) {
            if let Some(uri) = Self::extract_base_uri(collection.metadata.as_deref()) {
                return Some(uri);
            }
            if let Some(ref app_id) = collection.app_id {
                if let Some(pool) = self.app_pools.get(app_id) {
                    if let Some(uri) = Self::extract_base_uri(pool.metadata.as_deref()) {
                        return Some(uri);
                    }
                }
            }
        }
        self.contract_metadata.base_uri.clone()
    }
}

// --- Internal helpers ---

impl Contract {
    pub(crate) fn internal_register_app(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        params: AppConfig,
    ) -> Result<(), MarketplaceError> {
        if self.app_pools.contains_key(app_id) {
            return Err(MarketplaceError::InvalidState(
                "App pool already registered".to_string(),
            ));
        }

        // Anti-squatting: actor must be app_id, a parent account, or contract owner.
        if actor_id != app_id
            && !app_id.as_str().ends_with(&format!(".{}", actor_id))
            && actor_id != &self.owner_id
        {
            return Err(MarketplaceError::Unauthorized(
                "Can only register an app_id you own (exact match or sub-account)".to_string(),
            ));
        }

        let AppConfig {
            max_user_bytes,
            default_royalty,
            primary_sale_bps,
            curated,
            metadata,
        } = params;

        if let Some(ref r) = default_royalty {
            Self::validate_royalty(r)?;
        }

        let bps = primary_sale_bps.unwrap_or(0);
        if bps as u32 > MAX_ROYALTY_BPS {
            return Err(MarketplaceError::InvalidInput(
                "Primary sale commission cannot exceed 50%".to_string(),
            ));
        }

        if let Some(ref m) = metadata {
            Self::validate_metadata_json(m)?;
        }

        // Attached deposit seeds pool balance; NEAR protocol handles storage staking from contract balance.
        let initial_balance = env::attached_deposit().as_yoctonear();

        let pool = AppPool {
            owner_id: actor_id.clone(),
            balance: initial_balance,
            used_bytes: 0,
            max_user_bytes: max_user_bytes.unwrap_or(DEFAULT_APP_MAX_USER_BYTES),
            default_royalty,
            primary_sale_bps: bps,
            moderators: Vec::new(),
            curated: curated.unwrap_or(false),
            metadata,
        };

        self.app_pools.insert(app_id.clone(), pool);

        events::emit_app_pool_register(actor_id, app_id, initial_balance);
        Ok(())
    }

    pub(crate) fn internal_set_app_config(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        params: AppConfig,
    ) -> Result<(), MarketplaceError> {
        let mut pool = self
            .app_pools
            .remove(app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        if actor_id != &pool.owner_id {
            self.app_pools.insert(app_id.clone(), pool);
            return Err(MarketplaceError::only_owner("pool owner"));
        }

        let AppConfig {
            max_user_bytes,
            default_royalty,
            primary_sale_bps,
            curated,
            metadata,
        } = params;

        if let Some(max) = max_user_bytes {
            pool.max_user_bytes = max;
        }

        if let Some(r) = default_royalty {
            Self::validate_royalty(&r)?;
            pool.default_royalty = if r.is_empty() { None } else { Some(r) };
        }

        if let Some(bps) = primary_sale_bps {
            if bps as u32 > MAX_ROYALTY_BPS {
                return Err(MarketplaceError::InvalidInput(
                    "Primary sale commission cannot exceed 50%".to_string(),
                ));
            }
            pool.primary_sale_bps = bps;
        }

        if let Some(c) = curated {
            pool.curated = c;
        }

        // None = no change; Some("") = clear metadata.
        if let Some(m) = metadata {
            if m.is_empty() {
                pool.metadata = None;
            } else {
                Self::validate_metadata_json(&m)?;
                pool.metadata = Some(m);
            }
        }

        self.app_pools.insert(app_id.clone(), pool);

        events::emit_app_config_update(actor_id, app_id);
        Ok(())
    }

    pub(crate) fn is_app_authority(pool: &AppPool, actor_id: &AccountId) -> bool {
        actor_id == &pool.owner_id || pool.moderators.contains(actor_id)
    }

    // Owner only; max 20 moderators per app.
    pub(crate) fn internal_add_moderator(
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

    pub(crate) fn internal_remove_moderator(
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

    // App owner or moderator; collection must belong to this app.
    pub(crate) fn internal_ban_collection(
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

        let mut collection = self
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

        collection.banned = true;
        self.collections
            .insert(collection_id.to_string(), collection);

        events::emit_collection_banned(actor_id, collection_id, reason);
        Ok(())
    }

    // App owner or moderator; collection must belong to this app.
    pub(crate) fn internal_unban_collection(
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

        let mut collection = self
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

        collection.banned = false;
        self.collections
            .insert(collection_id.to_string(), collection);

        events::emit_collection_unbanned(actor_id, collection_id);
        Ok(())
    }

    // Single-step ownership transfer; no pending/accept pattern.
    pub(crate) fn internal_transfer_app_ownership(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        new_owner: AccountId,
    ) -> Result<(), MarketplaceError> {
        let mut pool = self
            .app_pools
            .remove(app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        if actor_id != &pool.owner_id {
            self.app_pools.insert(app_id.clone(), pool);
            return Err(MarketplaceError::only_owner("pool owner"));
        }
        let old_owner = pool.owner_id.clone();
        pool.owner_id = new_owner.clone();
        self.app_pools.insert(app_id.clone(), pool);
        events::emit_app_owner_transferred(&old_owner, &new_owner, app_id);
        Ok(())
    }

    fn extract_base_uri(metadata: Option<&str>) -> Option<String> {
        metadata
            .and_then(|s| near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(s).ok())
            .and_then(|v| v.get("base_uri")?.as_str().map(|s| s.to_string()))
    }
}
