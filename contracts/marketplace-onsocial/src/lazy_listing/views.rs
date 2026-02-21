//! Read-only views for lazy listings.

use crate::*;

#[near]
impl Contract {
    pub fn get_lazy_listing(&self, listing_id: String) -> Option<LazyListingRecord> {
        self.lazy_listings.get(&listing_id).cloned()
    }

    pub fn get_lazy_listings_by_creator(
        &self,
        creator_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<(String, LazyListingRecord)> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.lazy_listings
            .iter()
            .filter(|(_, l)| l.creator_id == creator_id)
            .skip(start)
            .take(limit)
            .map(|(id, l)| (id.clone(), l.clone()))
            .collect()
    }

    pub fn get_lazy_listings_by_app(
        &self,
        app_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<(String, LazyListingRecord)> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.lazy_listings
            .iter()
            .filter(|(_, l)| l.app_id.as_ref() == Some(&app_id))
            .skip(start)
            .take(limit)
            .map(|(id, l)| (id.clone(), l.clone()))
            .collect()
    }

    pub fn get_lazy_listings_count(&self) -> u64 {
        self.lazy_listings.len() as u64
    }
}
