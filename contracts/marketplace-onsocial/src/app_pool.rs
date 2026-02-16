//! Per-app isolated storage pools.
//!
//! Apps register a pool, fund it with NEAR, and users consume bytes
//! from the pool up to a per-user lifetime cap. When the pool is empty
//! or the user exceeds the cap, the waterfall falls through to Tier 3
//! (user balance).

use crate::internal::check_one_yocto;
use crate::*;

// ── Public payable methods ───────────────────────────────────────────────────

#[near]
impl Contract {
    /// Fund an existing app pool with attached NEAR.
    #[payable]
    #[handle_result]
    pub fn fund_app_pool(&mut self, app_id: AccountId) -> Result<(), MarketplaceError> {
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Must attach NEAR".to_string(),
            ));
        }

        let mut pool = self.app_pools.remove(&app_id).ok_or_else(|| {
            MarketplaceError::NotFound(format!("App pool not found: {}", app_id))
        })?;
        pool.balance += deposit;
        self.app_pools.insert(app_id.clone(), pool.clone());

        events::emit_app_pool_fund(
            &env::predecessor_account_id(),
            &app_id,
            deposit,
            pool.balance,
        );
        Ok(())
    }

    /// Withdraw unused NEAR from an app pool (only pool owner).
    /// Requires 1 yoctoNEAR to ensure Full Access Key (prevents function-call key abuse).
    #[payable]
    #[handle_result]
    pub fn withdraw_app_pool(&mut self, app_id: AccountId, amount: U128) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        let mut pool = self.app_pools.remove(&app_id).ok_or_else(|| {
            MarketplaceError::NotFound(format!("App pool not found: {}", app_id))
        })?;
        if caller != pool.owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only pool owner can withdraw".to_string(),
            ));
        }
        if amount.0 > pool.balance {
            return Err(MarketplaceError::InsufficientDeposit(
                "Insufficient pool balance".to_string(),
            ));
        }

        pool.balance -= amount.0;
        self.app_pools.insert(app_id.clone(), pool.clone());

        let _ = Promise::new(caller.clone()).transfer(NearToken::from_yoctonear(amount.0));

        events::emit_app_pool_withdraw(&caller, &app_id, amount.0, pool.balance);
        Ok(())
    }
}

// ── Views ────────────────────────────────────────────────────────────────────

#[near]
impl Contract {
    /// Get app pool info.
    pub fn get_app_pool(&self, app_id: AccountId) -> Option<AppPool> {
        self.app_pools.get(&app_id).cloned()
    }

    /// Get a user's usage from a specific app pool.
    pub fn get_app_user_usage(&self, account_id: AccountId, app_id: AccountId) -> u64 {
        let key = format!("{}:{}", account_id, app_id);
        self.app_user_usage.get(&key).copied().unwrap_or(0)
    }

    /// Get a user's remaining allowance from an app pool.
    pub fn get_app_user_remaining(&self, account_id: AccountId, app_id: AccountId) -> u64 {
        let key = format!("{}:{}", account_id, app_id);
        let used = self.app_user_usage.get(&key).copied().unwrap_or(0);
        if let Some(pool) = self.app_pools.get(&app_id) {
            pool.max_user_bytes.saturating_sub(used)
        } else {
            0
        }
    }

    /// Get user storage info (Tier 3).
    pub fn get_user_storage(&self, account_id: AccountId) -> UserStorageBalance {
        self.user_storage.get(&account_id).cloned().unwrap_or_default()
    }

    /// Get app metadata JSON. Returns None if app pool doesn't exist.
    /// Equivalent to `get_app_pool(app_id).metadata` but avoids
    /// exposing financial fields when only branding info is needed.
    pub fn get_app_metadata(&self, app_id: AccountId) -> Option<Value> {
        self.app_pools
            .get(&app_id)
            .and_then(|pool| pool.metadata.as_ref())
            .and_then(|json_str| near_sdk::serde_json::from_str(json_str).ok())
    }

    /// Resolve the effective base_uri for a collection:
    /// collection metadata → app metadata → contract-level base_uri.
    /// Parses "base_uri" from the free-form JSON metadata at each level.
    pub fn resolve_base_uri(&self, collection_id: String) -> Option<String> {
        // 1. Collection-level
        if let Some(collection) = self.collections.get(&collection_id) {
            if let Some(uri) = Self::extract_base_uri(collection.metadata.as_deref()) {
                return Some(uri);
            }
            // 2. App-level
            if let Some(ref app_id) = collection.app_id {
                if let Some(pool) = self.app_pools.get(app_id) {
                    if let Some(uri) = Self::extract_base_uri(pool.metadata.as_deref()) {
                        return Some(uri);
                    }
                }
            }
        }
        // 3. Contract-level
        self.contract_metadata.base_uri.clone()
    }
}

// ── Internal helpers (called from execute dispatch) ──────────────────────────

impl Contract {
    /// Register a new app pool.
    pub(crate) fn internal_register_app(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        max_user_bytes: Option<u64>,
        default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
        primary_sale_bps: Option<u16>,
        metadata: Option<String>,
    ) -> Result<(), MarketplaceError> {
        if self.app_pools.contains_key(app_id) {
            return Err(MarketplaceError::InvalidState(
                "App pool already registered".to_string(),
            ));
        }

        // Validate royalty if provided
        if let Some(ref r) = default_royalty {
            Self::validate_royalty_map(r)?;
        }

        let bps = primary_sale_bps.unwrap_or(0);
        if bps > MAX_ROYALTY_BPS as u16 {
            return Err(MarketplaceError::InvalidInput(
                "Primary sale commission cannot exceed 50%".to_string(),
            ));
        }

        // Validate metadata is valid JSON if provided
        if let Some(ref m) = metadata {
            Self::validate_metadata_json(m)?;
        }

        let pool = AppPool {
            owner_id: actor_id.clone(),
            balance: 0,
            used_bytes: 0,
            max_user_bytes: max_user_bytes.unwrap_or(DEFAULT_APP_MAX_USER_BYTES),
            default_royalty,
            primary_sale_bps: bps,
            metadata,
        };

        self.app_pools.insert(app_id.clone(), pool);

        events::emit_app_pool_register(actor_id, app_id);
        Ok(())
    }

    /// Update app pool config (only pool owner).
    pub(crate) fn internal_set_app_config(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        max_user_bytes: Option<u64>,
        default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
        primary_sale_bps: Option<u16>,
        metadata: Option<String>,
    ) -> Result<(), MarketplaceError> {
        let mut pool = self.app_pools.remove(app_id).ok_or_else(|| {
            MarketplaceError::NotFound(format!("App pool not found: {}", app_id))
        })?;
        if actor_id != &pool.owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only pool owner can configure".to_string(),
            ));
        }

        if let Some(max) = max_user_bytes {
            pool.max_user_bytes = max;
        }

        if let Some(ref r) = default_royalty {
            Self::validate_royalty_map(r)?;
        }
        if let Some(r) = default_royalty {
            if r.is_empty() {
                pool.default_royalty = None;
            } else {
                pool.default_royalty = Some(r);
            }
        }

        if let Some(bps) = primary_sale_bps {
            if bps > MAX_ROYALTY_BPS as u16 {
                return Err(MarketplaceError::InvalidInput(
                    "Primary sale commission cannot exceed 50%".to_string(),
                ));
            }
            pool.primary_sale_bps = bps;
        }

        // Replace metadata entirely (None = no change, Some("") = clear)
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

    /// Validate a royalty map: max 10 recipients, each > 0 bps, total <= MAX_ROYALTY_BPS.
    fn validate_royalty_map(royalty: &std::collections::HashMap<AccountId, u32>) -> Result<(), MarketplaceError> {
        if royalty.is_empty() {
            return Ok(()); // Empty map is valid (used to clear)
        }
        if royalty.len() > 10 {
            return Err(MarketplaceError::InvalidInput(
                "Maximum 10 royalty recipients".to_string(),
            ));
        }
        let total: u32 = royalty.values().sum();
        if total > MAX_ROYALTY_BPS {
            return Err(MarketplaceError::InvalidInput(format!(
                "Total royalty {} bps exceeds max {} bps (50%)",
                total, MAX_ROYALTY_BPS
            )));
        }
        for (_, bps) in royalty.iter() {
            if *bps == 0 {
                return Err(MarketplaceError::InvalidInput(
                    "Each royalty share must be > 0 bps".to_string(),
                ));
            }
        }
        Ok(())
    }

    /// Extract "base_uri" from a JSON metadata string.
    fn extract_base_uri(metadata: Option<&str>) -> Option<String> {
        metadata
            .and_then(|s| near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(s).ok())
            .and_then(|v| v.get("base_uri")?.as_str().map(|s| s.to_string()))
    }
}
