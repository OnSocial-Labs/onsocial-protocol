// Lazy Collection Management
// Create and manage NFT collections that mint on purchase

use crate::*;
use near_sdk::{require, serde_json};

#[near]
impl Contract {
    /// Create a new lazy-minted collection
    /// Example: 10,000 concert tickets that mint when purchased
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

        // Validate inputs
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
            format!(
                "Metadata template exceeds max length of {}",
                MAX_METADATA_LEN
            )
        );

        // Validate metadata template is valid JSON
        let _: TokenMetadata =
            serde_json::from_str(&metadata_template).expect("Invalid metadata template JSON");

        // Validate timing
        if let (Some(start), Some(end)) = (start_time, end_time) {
            require!(end > start, "End time must be after start time");
        }

        let creator_id = env::predecessor_account_id();
        self.assert_storage_available(&creator_id);

        // Ensure collection doesn't already exist
        require!(
            !self.collections.contains_key(&collection_id),
            "Collection ID already exists"
        );

        // Create collection
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

        // Store collection
        self.collections.insert(collection_id.clone(), collection);

        // Add to creator's collections index - get or create
        if !self.collections_by_creator.contains_key(&creator_id) {
            self.collections_by_creator.insert(
                creator_id.clone(),
                IterableSet::new(StorageKey::CollectionsByCreatorInner {
                    account_id_hash: env::sha256(creator_id.as_bytes()),
                }),
            );
        }

        // Now insert collection_id (set is guaranteed to exist)
        self.collections_by_creator
            .get_mut(&creator_id)
            .unwrap()
            .insert(collection_id.clone());

        // Emit event
        crate::events::emit_collection_created_event(
            &creator_id,
            &collection_id,
            total_supply,
            price_near,
        );

        env::log_str(&format!(
            "Collection created: {} by {} - {} items at {} yoctoNEAR each",
            collection_id, creator_id, total_supply, price_near.0
        ));
    }

    /// Update collection price (only creator)
    #[payable]
    pub fn update_collection_price(&mut self, collection_id: String, new_price_near: U128) {
        assert_one_yocto();

        require!(new_price_near.0 > 0, "Price must be greater than 0");

        let collection = self
            .collections
            .get(&collection_id)
            .expect("Collection not found")
            .clone();

        let caller = env::predecessor_account_id();
        require!(
            collection.creator_id == caller,
            "Only collection creator can update price"
        );

        let old_price = collection.price_near;
        let mut collection = collection;
        collection.price_near = new_price_near;

        self.collections.insert(collection_id.clone(), collection);

        env::log_str(&format!(
            "Collection price updated: {} from {} to {} yoctoNEAR",
            collection_id, old_price.0, new_price_near.0
        ));
    }

    /// Update collection timing (only creator)
    #[payable]
    pub fn update_collection_timing(
        &mut self,
        collection_id: String,
        start_time: Option<u64>,
        end_time: Option<u64>,
    ) {
        assert_one_yocto();

        // Validate timing
        if let (Some(start), Some(end)) = (start_time, end_time) {
            require!(end > start, "End time must be after start time");
        }

        let mut collection = self
            .collections
            .get(&collection_id)
            .expect("Collection not found")
            .clone();

        let caller = env::predecessor_account_id();
        require!(
            collection.creator_id == caller,
            "Only collection creator can update timing"
        );

        collection.start_time = start_time;
        collection.end_time = end_time;

        self.collections.insert(collection_id.clone(), collection);

        env::log_str(&format!("Collection timing updated: {}", collection_id));
    }

    /// Check if collection is currently active for minting
    pub(crate) fn is_collection_active(&self, collection: &LazyCollection) -> bool {
        let now = env::block_timestamp();

        // Check if sold out
        if collection.minted_count >= collection.total_supply {
            return false;
        }

        // Check start time
        if let Some(start) = collection.start_time {
            if now < start {
                return false;
            }
        }

        // Check end time
        if let Some(end) = collection.end_time {
            if now > end {
                return false;
            }
        }

        true
    }
}

fn assert_at_least_one_yocto() {
    require!(
        env::attached_deposit() >= ONE_YOCTO,
        "Requires attached deposit of at least 1 yoctoNEAR"
    );
}

fn assert_one_yocto() {
    require!(
        env::attached_deposit() == ONE_YOCTO,
        "Requires attached deposit of exactly 1 yoctoNEAR"
    );
}
