// Collection View Methods
// Query collections, availability, and statistics

use crate::*;

#[near]
impl Contract {
    /// Get collection details
    pub fn get_collection(&self, collection_id: String) -> Option<LazyCollection> {
        self.collections.get(&collection_id).cloned()
    }

    /// Get collection availability (remaining items)
    pub fn get_collection_availability(&self, collection_id: String) -> u32 {
        match self.collections.get(&collection_id) {
            Some(collection) => collection.total_supply - collection.minted_count,
            None => 0,
        }
    }

    /// Check if collection is sold out
    pub fn is_collection_sold_out(&self, collection_id: String) -> bool {
        match self.collections.get(&collection_id) {
            Some(collection) => collection.minted_count >= collection.total_supply,
            None => true,
        }
    }

    /// Check if collection is currently active for minting
    pub fn is_collection_mintable(&self, collection_id: String) -> bool {
        match self.collections.get(&collection_id) {
            Some(collection) => {
                let now = env::block_timestamp();
                let not_sold_out = collection.minted_count < collection.total_supply;
                let started = collection.start_time.map_or(true, |start| now >= start);
                let not_ended = collection.end_time.map_or(true, |end| now <= end);
                not_sold_out && started && not_ended
            }
            None => false,
        }
    }

    /// Get collection mint progress
    pub fn get_collection_progress(&self, collection_id: String) -> Option<CollectionProgress> {
        self.collections
            .get(&collection_id)
            .map(|collection| CollectionProgress {
                minted: collection.minted_count,
                total: collection.total_supply,
                remaining: collection.total_supply - collection.minted_count,
                percentage: if collection.total_supply > 0 {
                    (collection.minted_count as f64 / collection.total_supply as f64 * 100.0) as u32
                } else {
                    0
                },
            })
    }

    /// Get all collections by creator (paginated)
    pub fn get_collections_by_creator(
        &self,
        creator_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<LazyCollection> {
        let collections_set = match self.collections_by_creator.get(&creator_id) {
            Some(set) => set,
            None => return vec![],
        };

        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;

        collections_set
            .iter()
            .skip(start)
            .take(limit)
            .filter_map(|collection_id| self.collections.get(collection_id.as_str()).cloned())
            .collect()
    }

    /// Get number of collections by creator
    pub fn get_collections_count_by_creator(&self, creator_id: AccountId) -> u64 {
        self.collections_by_creator
            .get(&creator_id)
            .map(|set| set.len() as u64)
            .unwrap_or(0)
    }

    /// Get all active collections (not sold out, within time window)
    /// Note: For large datasets, use Substreams indexer to query active collections efficiently
    /// This method is provided for convenience but may hit gas limits with many collections
    pub fn get_active_collections(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<LazyCollection> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;

        let now = env::block_timestamp();

        self.collections
            .iter()
            .filter(|(_, collection)| {
                let not_sold_out = collection.minted_count < collection.total_supply;
                let started = collection.start_time.map_or(true, |start| now >= start);
                let not_ended = collection.end_time.map_or(true, |end| now <= end);
                not_sold_out && started && not_ended
            })
            .skip(start)
            .take(limit)
            .map(|(_, collection)| collection.clone())
            .collect()
    }

    /// Get total number of collections
    pub fn get_total_collections(&self) -> u64 {
        self.collections.len() as u64
    }

    /// Get paginated list of all collections
    pub fn get_all_collections(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<LazyCollection> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;

        self.collections
            .iter()
            .skip(start)
            .take(limit)
            .map(|(_, collection)| collection.clone())
            .collect()
    }

    /// Get collection statistics
    pub fn get_collection_stats(&self, collection_id: String) -> Option<CollectionStats> {
        self.collections.get(&collection_id).map(|collection| {
            let total_revenue = collection.minted_count as u128 * collection.price_near.0;
            let marketplace_fees =
                (total_revenue * MARKETPLACE_FEE_BPS as u128) / BASIS_POINTS as u128;
            let creator_revenue = total_revenue - marketplace_fees;

            // Check if active inline to avoid borrow checker issues
            let now = env::block_timestamp();
            let not_sold_out = collection.minted_count < collection.total_supply;
            let started = collection.start_time.map_or(true, |start| now >= start);
            let not_ended = collection.end_time.map_or(true, |end| now <= end);
            let is_active = not_sold_out && started && not_ended;

            CollectionStats {
                collection_id: collection.collection_id.clone(),
                creator_id: collection.creator_id.clone(),
                total_supply: collection.total_supply,
                minted_count: collection.minted_count,
                remaining: collection.total_supply - collection.minted_count,
                price_near: collection.price_near,
                total_revenue: U128(total_revenue),
                creator_revenue: U128(creator_revenue),
                marketplace_fees: U128(marketplace_fees),
                is_active,
                is_sold_out: collection.minted_count >= collection.total_supply,
                created_at: collection.created_at,
            }
        })
    }
}

/// Collection progress information
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
#[derive(near_sdk::NearSchema)]
pub struct CollectionProgress {
    pub minted: u32,
    pub total: u32,
    pub remaining: u32,
    pub percentage: u32, // 0-100
}

/// Collection statistics
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
#[derive(near_sdk::NearSchema)]
pub struct CollectionStats {
    pub collection_id: String,
    pub creator_id: AccountId,
    pub total_supply: u32,
    pub minted_count: u32,
    pub remaining: u32,
    pub price_near: U128,
    pub total_revenue: U128,
    pub creator_revenue: U128,
    pub marketplace_fees: U128,
    pub is_active: bool,
    pub is_sold_out: bool,
    pub created_at: u64,
}
