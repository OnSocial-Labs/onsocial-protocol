//! Lazy Scarce Collection management.
//! Create and manage collections that mint on purchase.

use crate::internal::{assert_at_least_one_yocto, assert_one_yocto};
use crate::*;
use near_sdk::{require, serde_json};

// ── #[payable] public methods (direct transactions) ──────────────────────────

#[near]
impl Contract {
    /// Create a new lazy-minted scarce collection.
    #[payable]
    pub fn create_collection(
        &mut self,
        collection_id: String,
        total_supply: u32,
        metadata_template: String,
        price_near: U128,
        start_time: Option<u64>,
        end_time: Option<u64>,
    ) {
        assert_at_least_one_yocto();
        let creator_id = env::predecessor_account_id();
        self.internal_create_collection(
            &creator_id, collection_id, total_supply,
            metadata_template, price_near, start_time, end_time,
        );
    }

    /// Update collection price (only creator).
    #[payable]
    pub fn update_collection_price(&mut self, collection_id: String, new_price_near: U128) {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        self.internal_update_collection_price(&caller, collection_id, new_price_near);
    }

    /// Update collection timing (only creator).
    #[payable]
    pub fn update_collection_timing(
        &mut self,
        collection_id: String,
        start_time: Option<u64>,
        end_time: Option<u64>,
    ) {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        self.internal_update_collection_timing(&caller, collection_id, start_time, end_time);
    }
}

// ── Internal implementations (shared by execute() and #[payable] methods) ────

impl Contract {
    pub(crate) fn internal_create_collection(
        &mut self,
        creator_id: &AccountId,
        collection_id: String,
        total_supply: u32,
        metadata_template: String,
        price_near: U128,
        start_time: Option<u64>,
        end_time: Option<u64>,
    ) {
        require!(
            !collection_id.is_empty() && collection_id.len() <= 64,
            "Collection ID must be 1-64 characters"
        );
        require!(
            total_supply > 0 && total_supply <= MAX_COLLECTION_SUPPLY,
            format!("Total supply must be 1-{}", MAX_COLLECTION_SUPPLY)
        );
        require!(price_near.0 > 0, "Price must be greater than 0");
        require!(
            metadata_template.len() <= MAX_METADATA_LEN,
            format!("Metadata template exceeds max length of {}", MAX_METADATA_LEN)
        );

        let _: TokenMetadata =
            serde_json::from_str(&metadata_template).expect("Invalid metadata template JSON");

        if let (Some(start), Some(end)) = (start_time, end_time) {
            require!(end > start, "End time must be after start time");
        }

        self.assert_storage_available(creator_id);

        require!(
            !self.collections.contains_key(&collection_id),
            "Collection ID already exists"
        );

        let collection = LazyCollection {
            creator_id: creator_id.clone(),
            collection_id: collection_id.clone(),
            total_supply,
            minted_count: 0,
            metadata_template,
            price_near,
            start_time,
            end_time,
            created_at: env::block_timestamp(),
        };

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

        events::emit_collection_created(creator_id, &collection_id, total_supply, price_near);
    }

    pub(crate) fn internal_update_collection_price(
        &mut self,
        caller: &AccountId,
        collection_id: String,
        new_price_near: U128,
    ) {
        require!(new_price_near.0 > 0, "Price must be greater than 0");

        let mut collection = self
            .collections
            .get(&collection_id)
            .expect("Collection not found")
            .clone();

        require!(
            &collection.creator_id == caller,
            "Only collection creator can update price"
        );

        collection.price_near = new_price_near;
        self.collections.insert(collection_id, collection);
    }

    pub(crate) fn internal_update_collection_timing(
        &mut self,
        caller: &AccountId,
        collection_id: String,
        start_time: Option<u64>,
        end_time: Option<u64>,
    ) {
        if let (Some(start), Some(end)) = (start_time, end_time) {
            require!(end > start, "End time must be after start time");
        }

        let mut collection = self
            .collections
            .get(&collection_id)
            .expect("Collection not found")
            .clone();

        require!(
            &collection.creator_id == caller,
            "Only collection creator can update timing"
        );

        collection.start_time = start_time;
        collection.end_time = end_time;
        self.collections.insert(collection_id, collection);
    }

    pub(crate) fn is_collection_active(&self, collection: &LazyCollection) -> bool {
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
}
