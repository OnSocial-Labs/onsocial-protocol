use crate::*;

impl Contract {
    // Storage accounting invariant: flush deferred writes before measuring usage.
    pub(crate) fn flush_state(&mut self) {
        self.scarces_by_id.flush();
        self.scarces_per_owner.flush();
        self.sales.flush();
        self.by_owner_id.flush();
        self.by_scarce_contract_id.flush();
        self.collections.flush();
        self.collections_by_creator.flush();
        self.offers.flush();
        self.collection_offers.flush();
        self.lazy_listings.flush();
        self.app_pools.flush();
        self.app_pool_ids.flush();
        self.app_user_usage.flush();
        self.user_storage.flush();
        self.collection_mint_counts.flush();
        self.collection_allowlist.flush();
        self.approved_nft_contracts.flush();
    }

    // Persistence invariant: all storage snapshots used for charging/releasing must call this path.
    #[inline]
    pub(crate) fn storage_usage_flushed(&mut self) -> u64 {
        self.flush_state();
        env::storage_usage()
    }
}
