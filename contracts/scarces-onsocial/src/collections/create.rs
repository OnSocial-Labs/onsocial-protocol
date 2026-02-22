use crate::*;
use near_sdk::serde_json;

impl Contract {
    pub(crate) fn create_collection(
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
        // Storage key invariant: reject separators used in composite keys to prevent keyspace collisions.
        if collection_id.contains(':')
            || collection_id.contains('\0')
            || collection_id.contains('.')
        {
            return Err(MarketplaceError::InvalidInput(
                "Collection ID cannot contain ':', '.', or null characters".into(),
            ));
        }
        // Storage key invariant: reserve standalone and lazy-listing key prefixes.
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
            crate::validation::validate_metadata_json(m)?;
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
}
