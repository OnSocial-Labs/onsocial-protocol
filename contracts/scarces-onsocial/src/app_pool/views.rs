use crate::*;

#[near]
impl Contract {
    pub fn get_app_pool(&self, app_id: AccountId) -> Option<AppPool> {
        self.app_pools.get(&app_id).cloned()
    }

    pub fn get_app_user_usage(&self, account_id: AccountId, app_id: AccountId) -> u64 {
        let key = format!("{}:{}", account_id, app_id);
        self.app_user_usage.get(&key).copied().unwrap_or(0)
    }

    pub fn get_app_user_remaining(&self, account_id: AccountId, app_id: AccountId) -> u64 {
        let key = format!("{}:{}", account_id, app_id);
        let used = self.app_user_usage.get(&key).copied().unwrap_or(0);
        if let Some(pool) = self.app_pools.get(&app_id) {
            pool.max_user_bytes.saturating_sub(used)
        } else {
            0
        }
    }

    pub fn get_user_storage(&self, account_id: AccountId) -> UserStorageBalance {
        self.user_storage
            .get(&account_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn get_app_metadata(&self, app_id: AccountId) -> Option<Value> {
        self.app_pools
            .get(&app_id)
            .and_then(|pool| pool.metadata.as_ref())
            .and_then(|json_str| near_sdk::serde_json::from_str(json_str).ok())
    }

    pub fn get_app_count(&self) -> u32 {
        self.app_pool_ids.len()
    }

    pub fn get_all_app_ids(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<AccountId> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.app_pool_ids
            .iter()
            .skip(start)
            .take(limit)
            .cloned()
            .collect()
    }

    /// Resolution order: collection metadata → app metadata → contract base_uri.
    pub fn resolve_base_uri(&self, collection_id: String) -> Option<String> {
        if let Some(collection) = self.collections.get(&collection_id) {
            if let Some(uri) = Self::extract_base_uri(collection.metadata.as_deref()) {
                return Some(uri);
            }
            if let Some(ref app_id) = collection.app_id {
                if let Some(pool) = self.app_pools.get(app_id) {
                    if let Some(uri) = Self::extract_base_uri(pool.metadata.as_deref()) {
                        return Some(uri);
                    }
                }
            }
        }
        self.contract_metadata.base_uri.clone()
    }
}
