//! Lazy scarce collection management — lazy-minted collections that mint on purchase.

use crate::internal::{check_at_least_one_yocto, check_one_yocto};
use crate::*;
use near_sdk::serde_json;

#[near]
impl Contract {
    /// Create a new lazy-minted scarce collection.
    #[payable]
    #[handle_result]
    pub fn create_collection(&mut self, params: CollectionConfig) -> Result<(), MarketplaceError> {
        check_at_least_one_yocto()?;
        let creator_id = env::predecessor_account_id();
        self.internal_create_collection(&creator_id, params)?;
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit > ONE_YOCTO.as_yoctonear() {
            let _ = Promise::new(creator_id)
                .transfer(NearToken::from_yoctonear(deposit - ONE_YOCTO.as_yoctonear()));
        }
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn update_collection_price(
        &mut self,
        collection_id: String,
        new_price_near: U128,
    ) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        self.internal_update_collection_price(&caller, collection_id, new_price_near)
    }

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

    #[payable]
    #[handle_result]
    pub fn delete_collection(&mut self, collection_id: String) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        self.internal_delete_collection(&caller, &collection_id)
    }
}

impl Contract {
    pub(crate) fn internal_create_collection(
        &mut self,
        creator_id: &AccountId,
        params: CollectionConfig,
    ) -> Result<(), MarketplaceError> {
        let CollectionConfig {
            collection_id,
            total_supply,
            metadata_template,
            price_near,
            start_time,
            end_time,
            options:
                crate::ScarceOptions {
                    royalty,
                    app_id,
                    transferable,
                    burnable,
                },
            renewable,
            revocation_mode,
            max_redeems,
            mint_mode,
            metadata,
            max_per_wallet,
            start_price,
            allowlist_price,
        } = params;

        if collection_id.is_empty() || collection_id.len() > 64 {
            return Err(MarketplaceError::InvalidInput(
                "Collection ID must be 1-64 characters".into(),
            ));
        }
        // These delimiters are used as separators in internal composite keys;
        // allowing them in a collection_id would create ambiguous key collisions.
        if collection_id.contains(':')
            || collection_id.contains('\0')
            || collection_id.contains('.')
        {
            return Err(MarketplaceError::InvalidInput(
                "Collection ID cannot contain ':', '.', or null characters".into(),
            ));
        }
        // "s" and "ll" are reserved prefixes for standalone token IDs ("s:{N}") and
        // lazy listing IDs ("ll:{N}"). Blocking them prevents collection_id_from_token_id
        // from producing false collection matches for standalone tokens.
        if collection_id == "s" || collection_id == "ll" {
            return Err(MarketplaceError::InvalidInput(
                "Collection ID 's' and 'll' are reserved".into(),
            ));
        }
        if total_supply == 0 || total_supply > MAX_COLLECTION_SUPPLY {
            return Err(MarketplaceError::InvalidInput(format!(
                "Total supply must be 1-{}",
                MAX_COLLECTION_SUPPLY
            )));
        }
        if metadata_template.len() > MAX_METADATA_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Metadata template exceeds max length of {}",
                MAX_METADATA_LEN
            )));
        }

        let _: TokenMetadata = serde_json::from_str(&metadata_template)
            .map_err(|_| MarketplaceError::InvalidInput("Invalid metadata template JSON".into()))?;

        if let (Some(start), Some(end)) = (start_time, end_time) {
            if end <= start {
                return Err(MarketplaceError::InvalidInput(
                    "End time must be after start time".into(),
                ));
            }
        }

        let merged_royalty = self.merge_royalties(app_id.as_ref(), royalty)?;
        if let Some(ref r) = merged_royalty {
            if r.is_empty() {
                return Err(MarketplaceError::InvalidInput(
                    "Royalty map cannot be empty if provided".into(),
                ));
            }
        }

        if let Some(ref m) = metadata {
            Self::validate_metadata_json(m)?;
        }

        if let Some(max) = max_per_wallet {
            if max == 0 {
                return Err(MarketplaceError::InvalidInput(
                    "max_per_wallet must be > 0".into(),
                ));
            }
        }

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
            return Err(MarketplaceError::InvalidState(
                "Collection ID already exists".into(),
            ));
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

    pub(crate) fn internal_update_collection_timing(
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

    /// Unlike `cancelled`, a paused collection can be resumed.
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

    // ── Allowlist ────────────────────────────────────────────────────────────

    /// Add or update allowlist entries (max 100 per call).
    /// Allocation of 0 removes the entry.
    pub(crate) fn internal_set_allowlist(
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

    pub(crate) fn internal_remove_from_allowlist(
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

        let before = env::storage_usage();
        for account in &accounts {
            let key = format!("{}:al:{}", collection_id, account);
            self.collection_allowlist.remove(&key);
        }

        let after = env::storage_usage();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(actor_id, bytes_freed as u64, collection.app_id.as_ref());
        }

        events::emit_allowlist_removed(actor_id, collection_id, &accounts);
        Ok(())
    }

    /// Only deletable when `minted_count == 0`; storage is released back through the waterfall.
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

        self.check_collection_authority(actor_id, &collection)?;

        // None = no-op; Some("") = clear; Some(json) = replace
        if let Some(m) = metadata {
            if m.is_empty() {
                collection.metadata = None;
            } else {
                Self::validate_metadata_json(&m)?;
                collection.metadata = Some(m);
            }
        } else {
            return Ok(());
        }

        let before = env::storage_usage();
        self.collections
            .insert(collection_id.to_string(), collection.clone());
        let after = env::storage_usage();

        match after.cmp(&before) {
            std::cmp::Ordering::Greater => {
                self.charge_storage_waterfall(actor_id, (after - before) as u64, collection.app_id.as_ref())?;
            }
            std::cmp::Ordering::Less => {
                self.release_storage_waterfall(actor_id, (before - after) as u64, collection.app_id.as_ref());
            }
            std::cmp::Ordering::Equal => {}
        }

        events::emit_collection_metadata_update(actor_id, collection_id);
        Ok(())
    }

    /// App-level metadata is independent of the creator's `metadata` field.
    /// The collection must belong to the given app.
    pub(crate) fn internal_set_collection_app_metadata(
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

        match collection.app_id {
            Some(ref coll_app) if coll_app == app_id => {}
            _ => {
                return Err(MarketplaceError::Unauthorized(
                    "Collection does not belong to this app".into(),
                ));
            }
        }

        // None = no-op; Some("") = clear; Some(json) = replace
        if let Some(m) = metadata {
            if m.is_empty() {
                collection.app_metadata = None;
            } else {
                Self::validate_metadata_json(&m)?;
                collection.app_metadata = Some(m);
            }
        } else {
            return Ok(());
        }

        let before = env::storage_usage();
        self.collections
            .insert(collection_id.to_string(), collection.clone());
        let after = env::storage_usage();

        match after.cmp(&before) {
            std::cmp::Ordering::Greater => {
                self.charge_storage_waterfall(actor_id, (after - before) as u64, collection.app_id.as_ref())?;
            }
            std::cmp::Ordering::Less => {
                self.release_storage_waterfall(actor_id, (before - after) as u64, collection.app_id.as_ref());
            }
            std::cmp::Ordering::Equal => {}
        }

        events::emit_collection_app_metadata_update(actor_id, app_id, collection_id);
        Ok(())
    }
}
