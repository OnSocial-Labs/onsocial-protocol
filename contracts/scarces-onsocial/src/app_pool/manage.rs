use crate::*;

impl Contract {
    pub(crate) fn fund_app_pool(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        deposit: u128,
    ) -> Result<(), MarketplaceError> {
        if deposit == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Must attach NEAR".to_string(),
            ));
        }

        let mut pool = self
            .app_pools
            .remove(app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        pool.balance.0 = pool.balance.0.saturating_add(deposit);
        let new_balance = pool.balance.0;
        self.app_pools.insert(app_id.clone(), pool);

        events::emit_app_pool_fund(actor_id, app_id, deposit, new_balance);
        Ok(())
    }

    pub(crate) fn withdraw_app_pool(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        amount: U128,
    ) -> Result<(), MarketplaceError> {
        let mut pool = self
            .app_pools
            .remove(app_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("App pool not found: {}", app_id)))?;
        if actor_id != &pool.owner_id {
            self.app_pools.insert(app_id.clone(), pool);
            return Err(MarketplaceError::only_owner("pool owner"));
        }
        if amount.0 > pool.balance.0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Insufficient pool balance".to_string(),
            ));
        }

        pool.balance.0 -= amount.0;
        let new_balance = pool.balance.0;
        self.app_pools.insert(app_id.clone(), pool);

        let _ = Promise::new(actor_id.clone()).transfer(NearToken::from_yoctonear(amount.0));

        events::emit_app_pool_withdraw(actor_id, app_id, amount.0, new_balance);
        Ok(())
    }
}

impl Contract {
    pub(crate) fn register_app(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        params: AppConfig,
        initial_balance: u128,
    ) -> Result<(), MarketplaceError> {
        if self.app_pools.contains_key(app_id) {
            return Err(MarketplaceError::InvalidState(
                "App pool already registered".to_string(),
            ));
        }

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
            crate::validation::validate_royalty(r)?;
        }

        let bps = primary_sale_bps.unwrap_or(0);
        if bps as u32 > MAX_ROYALTY_BPS {
            return Err(MarketplaceError::InvalidInput(
                "Primary sale commission cannot exceed 50%".to_string(),
            ));
        }

        if let Some(ref m) = metadata {
            crate::validation::validate_metadata_json(m)?;
        }

        let pool = AppPool {
            owner_id: actor_id.clone(),
            balance: U128(initial_balance),
            used_bytes: 0,
            max_user_bytes: max_user_bytes.unwrap_or(DEFAULT_APP_MAX_USER_BYTES),
            default_royalty,
            primary_sale_bps: bps,
            moderators: Vec::new(),
            curated: curated.unwrap_or(false),
            metadata,
        };

        self.app_pools.insert(app_id.clone(), pool);
        self.app_pool_ids.insert(app_id.clone());

        events::emit_app_pool_register(actor_id, app_id, initial_balance);
        Ok(())
    }

    pub(crate) fn set_app_config(
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
            crate::validation::validate_royalty(&r)?;
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

        // State transition invariant: None preserves metadata; Some("") clears persisted metadata.
        if let Some(m) = metadata {
            if m.is_empty() {
                pool.metadata = None;
            } else {
                crate::validation::validate_metadata_json(&m)?;
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

    // State transition guarantee: ownership transfer is immediate and single-step.
    pub(crate) fn transfer_app_ownership(
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

    pub(crate) fn extract_base_uri(metadata: Option<&str>) -> Option<String> {
        metadata
            .and_then(|s| near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(s).ok())
            .and_then(|v| v.get("base_uri")?.as_str().map(|s| s.to_string()))
    }
}
