use crate::errors::SocialError;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    /// Key format: `payer|group_id` (inverted from `group_sponsor_quota_key`)
    #[inline(always)]
    pub(super) fn group_usage_key(payer: &near_sdk::AccountId, group_id: &str) -> String {
        format!("{}|{}", payer.as_str(), group_id)
    }

    /// Key format: `group_id|payer` (inverted from `group_usage_key`)
    #[inline(always)]
    pub(crate) fn group_sponsor_quota_key(payer: &near_sdk::AccountId, group_id: &str) -> String {
        format!("{}|{}", group_id, payer.as_str())
    }

    /// Resolve full path to storage key. Returns `None` for invalid paths.
    pub(super) fn resolve_storage_key(&self, full_path: &str) -> Option<String> {
        if full_path.ends_with(crate::constants::SHARED_STORAGE_PATH_SUFFIX) {
            return Some(crate::storage::partitioning::make_key(
                "accounts", full_path, "",
            ));
        }

        if let Some((group_id, rel_path)) = crate::storage::utils::parse_groups_path(full_path) {
            Some(crate::storage::partitioning::make_key(
                "groups", group_id, rel_path,
            ))
        } else if let Some((account_id, rel_path)) = crate::storage::utils::parse_path(full_path) {
            Some(crate::storage::partitioning::make_key(
                "accounts", account_id, rel_path,
            ))
        } else {
            None
        }
    }

    /// Resolve which account pays for storage at the given path.
    pub(super) fn resolve_payer_account(
        &self,
        full_path: &str,
    ) -> Result<near_sdk::AccountId, SocialError> {
        if full_path.ends_with(crate::constants::SHARED_STORAGE_PATH_SUFFIX) {
            let owner = full_path.split('/').next().unwrap();
            return crate::validation::parse_account_id_str(
                owner,
                SocialError::InvalidInput("Invalid account ID".to_string()),
            );
        }

        // Group storage: use execution_payer if set (proposal execution), else predecessor
        if crate::storage::utils::parse_groups_path(full_path).is_some() {
            if let Some(ref payer) = self.execution_payer {
                return Ok(payer.clone());
            }
            return Ok(near_sdk::env::predecessor_account_id());
        }

        if let Some((account_id, _)) = crate::storage::utils::parse_path(full_path) {
            return crate::validation::parse_account_id_str(
                account_id,
                SocialError::InvalidInput("Invalid account ID".to_string()),
            );
        }

        Err(SocialError::InvalidInput("Invalid path format".to_string()))
    }
}
