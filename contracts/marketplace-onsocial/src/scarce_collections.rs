//! Lazy Scarce Collection management.
//! Create and manage collections that mint on purchase.

use crate::internal::{check_at_least_one_yocto, check_one_yocto};
use crate::*;
use near_sdk::serde_json;

// ── #[payable] public methods (direct transactions) ──────────────────────────

#[near]
impl Contract {
    /// Create a new lazy-minted scarce collection.
    #[payable]
    #[handle_result]
    pub fn create_collection(
        &mut self,
        params: CollectionConfig,
    ) -> Result<(), MarketplaceError> {
        check_at_least_one_yocto()?;
        let creator_id = env::predecessor_account_id();
        self.internal_create_collection(&creator_id, params)
    }

    /// Update collection price (only creator).
    #[payable]
    #[handle_result]
    pub fn update_collection_price(&mut self, collection_id: String, new_price_near: U128) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        self.internal_update_collection_price(&caller, collection_id, new_price_near)
    }

    /// Update collection timing (only creator).
    #[payable]
    #[handle_result]
    pub fn update_collection_timing(
        &mut self,
        collection_id: String,
        start_time: Option<u64>,
        end_time: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        self.internal_update_collection_timing(&caller, collection_id, start_time, end_time)
    }

    /// Delete an empty collection (minted_count == 0). Creator only.
    #[payable]
    #[handle_result]
    pub fn delete_collection(&mut self, collection_id: String) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        self.internal_delete_collection(&caller, &collection_id)
    }
}

// ── Internal implementations (shared by execute() and #[payable] methods) ────

impl Contract {
    pub(crate) fn internal_create_collection(
        &mut self,
        creator_id: &AccountId,
        params: CollectionConfig,
    ) -> Result<(), MarketplaceError> {
        let CollectionConfig {
            collection_id, total_supply, metadata_template, price_near,
            start_time, end_time,
            options: crate::ScarceOptions {
                royalty, app_id, transferable, burnable,
            },
            renewable, revocation_mode, max_redeems,
            mint_mode, metadata, max_per_wallet,
            start_price, allowlist_price,
        } = params;

        if collection_id.is_empty() || collection_id.len() > 64 {
            return Err(MarketplaceError::InvalidInput("Collection ID must be 1-64 characters".into()));
        }
        // Reject delimiter characters that collide with internal key formats:
        //   ':'  → token ID format (collection_id:serial)
        //   '\0' → offer key format (token_id\0buyer_id)
        //   '.'  → sale ID format (contract.token_id)
        if collection_id.contains(':') || collection_id.contains('\0') || collection_id.contains('.') {
            return Err(MarketplaceError::InvalidInput(
                "Collection ID cannot contain ':', '.', or null characters".into(),
            ));
        }
        if total_supply == 0 || total_supply > MAX_COLLECTION_SUPPLY {
            return Err(MarketplaceError::InvalidInput(format!(
                "Total supply must be 1-{}", MAX_COLLECTION_SUPPLY
            )));
        }
        if metadata_template.len() > MAX_METADATA_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Metadata template exceeds max length of {}", MAX_METADATA_LEN
            )));
        }

        let _: TokenMetadata = serde_json::from_str(&metadata_template)
            .map_err(|_| MarketplaceError::InvalidInput("Invalid metadata template JSON".into()))?;

        if let (Some(start), Some(end)) = (start_time, end_time) {
            if end <= start {
                return Err(MarketplaceError::InvalidInput("End time must be after start time".into()));
            }
        }

        // Merge app default royalty + creator royalty, then validate total
        let merged_royalty = self.merge_royalties(app_id.as_ref(), royalty);
        if let Some(ref r) = merged_royalty {
            if r.is_empty() {
                return Err(MarketplaceError::InvalidInput("Royalty map cannot be empty if provided".into()));
            }
            Self::validate_royalty(r)?;
        }

        // Validate collection metadata JSON if provided
        if let Some(ref m) = metadata {
            Self::validate_metadata_json(m)?;
        }

        // Validate max_per_wallet
        if let Some(max) = max_per_wallet {
            if max == 0 {
                return Err(MarketplaceError::InvalidInput("max_per_wallet must be > 0".into()));
            }
        }

        // Validate Dutch auction start_price
        if let Some(sp) = &start_price {
            if sp.0 <= price_near.0 {
                return Err(MarketplaceError::InvalidInput(
                    "start_price must be greater than price_near (floor) for Dutch auction".into(),
                ));
            }
            if start_time.is_none() || end_time.is_none() {
                return Err(MarketplaceError::InvalidInput(
                    "Dutch auction requires both start_time and end_time".into(),
                ));
            }
        }

        // Validate allowlist price
        if let Some(alp) = &allowlist_price {
            if start_time.is_none() {
                return Err(MarketplaceError::InvalidInput(
                    "allowlist_price requires start_time (WL phase = before start_time)".into(),
                ));
            }
            if alp.0 == 0 && price_near.0 != 0 {
                return Err(MarketplaceError::InvalidInput(
                    "allowlist_price must be > 0 unless collection is free".into(),
                ));
            }
        }

        // Curated-app gate: if the app is curated, only owner/moderator can create.
        if let Some(ref app) = app_id {
            if let Some(pool) = self.app_pools.get(app) {
                if pool.curated
                    && creator_id != &pool.owner_id
                    && !pool.moderators.contains(creator_id)
                {
                    return Err(MarketplaceError::Unauthorized(
                        "This app is curated — only the app owner or a moderator can create collections".into(),
                    ));
                }
            }
        }

        if self.collections.contains_key(&collection_id) {
            return Err(MarketplaceError::InvalidState("Collection ID already exists".into()));
        }

        let collection = LazyCollection {
            creator_id: creator_id.clone(),
            collection_id: collection_id.clone(),
            total_supply,
            minted_count: 0,
            metadata_template,
            price_near,
            start_price,
            start_time,
            end_time,
            created_at: env::block_timestamp(),
            app_id: app_id.clone(),
            royalty: merged_royalty,
            renewable,
            revocation_mode,
            max_redeems,
            burnable,
            mint_mode,
            max_per_wallet,
            transferable,
            paused: false,
            redeemed_count: 0,
            fully_redeemed_count: 0,
            cancelled: false,
            refund_pool: 0,
            refund_per_token: 0,
            refunded_count: 0,
            refund_deadline: None,
            total_revenue: 0,
            allowlist_price,
            banned: false,
            metadata,
            app_metadata: None,
        };

        let before = env::storage_usage();

        self.collections.insert(collection_id.clone(), collection);

        if !self.collections_by_creator.contains_key(creator_id) {
            self.collections_by_creator.insert(
                creator_id.clone(),
                IterableSet::new(StorageKey::CollectionsByCreatorInner {
                    account_id_hash: env::sha256(creator_id.as_bytes()),
                }),
            );
        }
        self.collections_by_creator
            .get_mut(creator_id)
            .unwrap()
            .insert(collection_id.clone());

        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        // Charge storage via app pool → user balance waterfall
        self.charge_storage_waterfall(creator_id, bytes_used as u64, app_id.as_ref())?;

        events::emit_collection_created(creator_id, &collection_id, total_supply, price_near);
        Ok(())
    }

    pub(crate) fn internal_update_collection_price(
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
            return Err(MarketplaceError::Unauthorized("Only collection creator can update price".into()));
        }

        collection.price_near = new_price_near;
        self.collections.insert(collection_id.clone(), collection);
        events::emit_collection_price_updated(caller, &collection_id, new_price_near);
        Ok(())
    }

    pub(crate) fn internal_update_collection_timing(
        &mut self,
        caller: &AccountId,
        collection_id: String,
        start_time: Option<u64>,
        end_time: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        if let (Some(start), Some(end)) = (start_time, end_time) {
            if end <= start {
                return Err(MarketplaceError::InvalidInput("End time must be after start time".into()));
            }
        }

        let mut collection = self
            .collections
            .get(&collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        if &collection.creator_id != caller {
            return Err(MarketplaceError::Unauthorized("Only collection creator can update timing".into()));
        }

        collection.start_time = start_time;
        collection.end_time = end_time;
        self.collections.insert(collection_id.clone(), collection);
        events::emit_collection_timing_updated(caller, &collection_id, start_time, end_time);
        Ok(())
    }

    pub(crate) fn is_collection_active(&self, collection: &LazyCollection) -> bool {
        if collection.banned {
            return false;
        }
        if collection.cancelled {
            return false;
        }
        if collection.paused {
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

    /// Pause minting from a collection. Creator only.
    /// Unlike cancel, paused collections can be resumed.
    pub(crate) fn internal_pause_collection(
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
            return Err(MarketplaceError::InvalidState("Cannot pause a cancelled collection".into()));
        }
        if collection.paused {
            return Err(MarketplaceError::InvalidState("Collection is already paused".into()));
        }

        collection.paused = true;
        self.collections.insert(collection_id.to_string(), collection);

        events::emit_collection_paused(actor_id, collection_id);
        Ok(())
    }

    /// Resume minting from a paused collection. Creator only.
    pub(crate) fn internal_resume_collection(
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
            return Err(MarketplaceError::InvalidState("Collection is not paused".into()));
        }

        collection.paused = false;
        self.collections.insert(collection_id.to_string(), collection);

        events::emit_collection_resumed(actor_id, collection_id);
        Ok(())
    }

    // ── Allowlist ────────────────────────────────────────────────────────────

    /// Add or update allowlist entries for a collection.
    /// Each entry specifies a wallet and its max early-access mint allocation.
    /// Creator only. Max 100 entries per call.
    pub(crate) fn internal_set_allowlist(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        entries: Vec<crate::protocol::AllowlistEntry>,
    ) -> Result<(), MarketplaceError> {
        if entries.is_empty() || entries.len() > 100 {
            return Err(MarketplaceError::InvalidInput("1-100 entries per call".into()));
        }

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;

        let before = env::storage_usage();

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

        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);
        if bytes_used > 0 {
            self.charge_storage_waterfall(actor_id, bytes_used as u64, collection.app_id.as_ref())?;
        }

        events::emit_allowlist_updated(actor_id, collection_id, &accounts, entries.len() as u32);
        Ok(())
    }

    /// Remove wallets from the allowlist. Creator only.
    pub(crate) fn internal_remove_from_allowlist(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        accounts: Vec<AccountId>,
    ) -> Result<(), MarketplaceError> {
        if accounts.is_empty() || accounts.len() > 100 {
            return Err(MarketplaceError::InvalidInput("1-100 accounts per call".into()));
        }

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(actor_id, &collection)?;

        for account in &accounts {
            let key = format!("{}:al:{}", collection_id, account);
            self.collection_allowlist.remove(&key);
        }

        events::emit_allowlist_updated(actor_id, collection_id, &accounts, 0);
        Ok(())
    }

    /// Delete an empty collection (minted_count == 0).
    /// Only the collection creator can delete.
    /// Frees up the collection storage.
    pub(crate) fn internal_delete_collection(
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

        // Remove from collections map
        self.collections.remove(collection_id);

        // Remove from creator's collection set
        if let Some(creator_set) = self.collections_by_creator.get_mut(&collection.creator_id) {
            creator_set.remove(collection_id);
            if creator_set.is_empty() {
                self.collections_by_creator.remove(&collection.creator_id);
            }
        }

        events::emit_collection_deleted(actor_id, collection_id);
        Ok(())
    }

    /// Set collection-level metadata (only creator).
    pub(crate) fn internal_set_collection_metadata(
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

        // Only creator — app owner uses ban/unban, not metadata edits
        self.check_collection_authority(actor_id, &collection)?;

        // None = no change, Some("") = clear, Some(json) = replace
        if let Some(m) = metadata {
            if m.is_empty() {
                collection.metadata = None;
            } else {
                Self::validate_metadata_json(&m)?;
                collection.metadata = Some(m);
            }
        } else {
            return Ok(()); // None = no change, skip storage + event
        }

        let before = env::storage_usage();
        self.collections
            .insert(collection_id.to_string(), collection.clone());
        let after = env::storage_usage();

        // Charge storage delta through the waterfall
        if after > before {
            let bytes_added = (after - before) as u64;
            self.charge_storage_waterfall(actor_id, bytes_added, collection.app_id.as_ref())?;
        }

        events::emit_collection_metadata_update(actor_id, collection_id);
        Ok(())
    }

    /// Set app-level metadata on a collection. App owner or moderator only.
    /// The collection must belong to the given app.
    pub(crate) fn internal_set_collection_app_metadata(
        &mut self,
        actor_id: &AccountId,
        app_id: &AccountId,
        collection_id: &str,
        metadata: Option<String>,
    ) -> Result<(), MarketplaceError> {
        let pool = self.app_pools.get(app_id).ok_or_else(|| {
            MarketplaceError::NotFound(format!("App pool not found: {}", app_id))
        })?;
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

        match collection.app_id {
            Some(ref coll_app) if coll_app == app_id => {}
            _ => {
                return Err(MarketplaceError::Unauthorized(
                    "Collection does not belong to this app".into(),
                ));
            }
        }

        // None = no change, Some("") = clear, Some(json) = replace
        if let Some(m) = metadata {
            if m.is_empty() {
                collection.app_metadata = None;
            } else {
                Self::validate_metadata_json(&m)?;
                collection.app_metadata = Some(m);
            }
        } else {
            return Ok(()); // None = no change, skip storage + event
        }

        let before = env::storage_usage();
        self.collections
            .insert(collection_id.to_string(), collection.clone());
        let after = env::storage_usage();

        if after > before {
            let bytes_added = (after - before) as u64;
            self.charge_storage_waterfall(actor_id, bytes_added, collection.app_id.as_ref())?;
        }

        events::emit_collection_app_metadata_update(actor_id, app_id, collection_id);
        Ok(())
    }
}
