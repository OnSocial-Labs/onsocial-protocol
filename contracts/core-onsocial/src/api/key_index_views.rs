use near_sdk::near;

use crate::state::key_index::KeyEntry;
use crate::{Contract, ContractExt};

#[near]
impl Contract {
    /// List keys matching a prefix with cursor-based pagination.
    /// Pass `with_values: true` to include stored values in the response.
    pub fn list_keys(
        &self,
        prefix: String,
        from_key: Option<String>,
        limit: Option<u32>,
        with_values: Option<bool>,
    ) -> Vec<KeyEntry> {
        self.platform.list_keys(
            &prefix,
            from_key.as_deref(),
            limit.unwrap_or(20).min(50),
            with_values.unwrap_or(false),
        )
    }

    pub fn count_keys(&self, prefix: String) -> u32 {
        self.platform.count_keys(&prefix)
    }
}
