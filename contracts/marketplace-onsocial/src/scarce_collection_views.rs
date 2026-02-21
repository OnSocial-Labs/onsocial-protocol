use crate::*;

#[near]
impl Contract {
    pub fn get_collection(&self, collection_id: String) -> Option<LazyCollection> {
        self.collections.get(&collection_id).cloned()
    }

    pub fn get_collection_availability(&self, collection_id: String) -> u32 {
        match self.collections.get(&collection_id) {
            Some(collection) => collection.total_supply.saturating_sub(collection.minted_count),
            None => 0,
        }
    }

    pub fn is_collection_sold_out(&self, collection_id: String) -> bool {
        match self.collections.get(&collection_id) {
            Some(collection) => collection.minted_count >= collection.total_supply,
            None => true,
        }
    }

    pub fn is_collection_mintable(&self, collection_id: String) -> bool {
        match self.collections.get(&collection_id) {
            Some(collection) => self.is_collection_active(collection),
            None => false,
        }
    }

    pub fn get_collection_progress(&self, collection_id: String) -> Option<CollectionProgress> {
        self.collections
            .get(&collection_id)
            .map(|collection| CollectionProgress {
                minted: collection.minted_count,
                total: collection.total_supply,
                remaining: collection.total_supply.saturating_sub(collection.minted_count),
                percentage: if collection.total_supply > 0 {
                    (collection.minted_count as f64 / collection.total_supply as f64 * 100.0) as u32
                } else {
                    0
                },
            })
    }

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

    pub fn get_collections_count_by_creator(&self, creator_id: AccountId) -> u64 {
        self.collections_by_creator
            .get(&creator_id)
            .map(|set| set.len() as u64)
            .unwrap_or(0)
    }

    pub fn get_active_collections(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<LazyCollection> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;

        self.collections
            .iter()
            .filter(|(_, collection)| self.is_collection_active(collection))
            .skip(start)
            .take(limit)
            .map(|(_, collection)| collection.clone())
            .collect()
    }

    pub fn get_total_collections(&self) -> u64 {
        self.collections.len() as u64
    }

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

    pub fn get_collection_stats(&self, collection_id: String) -> Option<CollectionStats> {
        self.collections.get(&collection_id).map(|collection| {
            let current = crate::scarce_collection_purchase::compute_dutch_price(collection);
            let total_revenue = collection.total_revenue;
            let marketplace_fees =
                (total_revenue * self.fee_config.total_fee_bps as u128) / BASIS_POINTS as u128;
            let app_commission = self.calculate_app_commission(total_revenue, collection.app_id.as_ref());
            let creator_revenue = total_revenue.saturating_sub(marketplace_fees).saturating_sub(app_commission);

            let is_active = self.is_collection_active(collection);

            CollectionStats {
                collection_id: collection.collection_id.clone(),
                creator_id: collection.creator_id.clone(),
                app_id: collection.app_id.clone(),
                total_supply: collection.total_supply,
                minted_count: collection.minted_count,
                remaining: collection.total_supply.saturating_sub(collection.minted_count),
                price_near: collection.price_near,
                start_price: collection.start_price,
                current_price: U128(current),
                total_revenue: U128(total_revenue),
                creator_revenue: U128(creator_revenue),
                marketplace_fees: U128(marketplace_fees),
                is_active,
                is_sold_out: collection.minted_count >= collection.total_supply,
                cancelled: collection.cancelled,
                created_at: collection.created_at,
                renewable: collection.renewable,
                revocation_mode: collection.revocation_mode.clone(),
                max_redeems: collection.max_redeems,
                redeemed_count: collection.redeemed_count,
                fully_redeemed_count: collection.fully_redeemed_count,
                burnable: collection.burnable,
                mint_mode: collection.mint_mode.clone(),
                max_per_wallet: collection.max_per_wallet,
                transferable: collection.transferable,
                paused: collection.paused,
                banned: collection.banned,
                allowlist_price: collection.allowlist_price,
            }
        })
    }

    pub fn get_wallet_mint_count(&self, collection_id: String, account_id: AccountId) -> u32 {
        let key = format!("{}:{}", collection_id, account_id);
        self.collection_mint_counts.get(&key).copied().unwrap_or(0)
    }

    pub fn get_wallet_mint_remaining(
        &self,
        collection_id: String,
        account_id: AccountId,
    ) -> Option<u32> {
        let collection = self.collections.get(&collection_id)?;
        let max = collection.max_per_wallet?;
        let key = format!("{}:{}", collection_id, account_id);
        let minted = self.collection_mint_counts.get(&key).copied().unwrap_or(0);
        Some(max.saturating_sub(minted))
    }

    pub fn get_allowlist_allocation(&self, collection_id: String, account_id: AccountId) -> u32 {
        let key = format!("{}:al:{}", collection_id, account_id);
        self.collection_allowlist.get(&key).copied().unwrap_or(0)
    }

    pub fn is_allowlisted(&self, collection_id: String, account_id: AccountId) -> bool {
        self.get_allowlist_allocation(collection_id, account_id) > 0
    }

    /// Counts all mints, including those during the public phase.
    pub fn get_allowlist_remaining(&self, collection_id: String, account_id: AccountId) -> u32 {
        let al_key = format!("{}:al:{}", collection_id, account_id);
        let allocation = self.collection_allowlist.get(&al_key).copied().unwrap_or(0);
        if allocation == 0 {
            return 0;
        }
        let mint_key = format!("{}:{}", collection_id, account_id);
        let minted = self
            .collection_mint_counts
            .get(&mint_key)
            .copied()
            .unwrap_or(0);
        allocation.saturating_sub(minted)
    }

    #[handle_result]
    pub fn get_collection_price(&self, collection_id: String) -> Result<U128, MarketplaceError> {
        let collection = self.collections.get(&collection_id).ok_or_else(|| {
            MarketplaceError::NotFound(format!("Collection not found: {}", collection_id))
        })?;
        Ok(U128(
            crate::scarce_collection_purchase::compute_dutch_price(collection),
        ))
    }

    #[handle_result]
    pub fn calculate_collection_purchase_price(
        &self,
        collection_id: String,
        quantity: u32,
    ) -> Result<U128, MarketplaceError> {
        let collection = self.collections.get(&collection_id).ok_or_else(|| {
            MarketplaceError::NotFound(format!("Collection not found: {}", collection_id))
        })?;
        Ok(U128(
            crate::scarce_collection_purchase::compute_dutch_price(collection)
                .checked_mul(quantity as u128)
                .ok_or_else(|| MarketplaceError::InvalidInput("Price calculation overflow".into()))?,
        ))
    }
}

#[near(serializers = [json])]
pub struct CollectionProgress {
    pub minted: u32,
    pub total: u32,
    pub remaining: u32,
    /// Integer percentage 0–100; truncated (not rounded).
    pub percentage: u32,
}

#[near(serializers = [json])]
pub struct CollectionStats {
    pub collection_id: String,
    pub creator_id: AccountId,
    pub app_id: Option<AccountId>,
    pub total_supply: u32,
    pub minted_count: u32,
    pub remaining: u32,
    pub price_near: U128,
    /// `None` = fixed price.
    pub start_price: Option<U128>,
    /// Live price after Dutch auction decay; equals `price_near` for fixed-price collections.
    pub current_price: U128,
    pub total_revenue: U128,
    pub creator_revenue: U128,
    pub marketplace_fees: U128,
    pub is_active: bool,
    pub is_sold_out: bool,
    pub cancelled: bool,
    pub created_at: u64,
    pub renewable: bool,
    pub revocation_mode: RevocationMode,
    pub max_redeems: Option<u32>,
    pub redeemed_count: u32,
    pub fully_redeemed_count: u32,
    pub burnable: bool,
    pub mint_mode: MintMode,
    pub max_per_wallet: Option<u32>,
    pub transferable: bool,
    pub paused: bool,
    pub banned: bool,
    /// Early-access price for allowlisted wallets; `None` = same as regular price.
    pub allowlist_price: Option<U128>,
}
