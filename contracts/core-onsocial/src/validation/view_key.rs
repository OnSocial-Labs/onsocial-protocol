use near_sdk::AccountId;

pub fn resolve_view_key(key: &str, account_id: Option<&AccountId>) -> Option<String> {
    let key = key.trim();
    if key.is_empty() {
        return None;
    }

    let key = key.trim_start_matches('/');
    if key.is_empty() {
        return None;
    }

    if key.starts_with("groups/") {
        // Only accept well-formed group paths.
        // Examples: "groups/{group_id}/config", "groups/{group_id}/posts/1".
        let Some((group_id, rel)) = crate::storage::utils::parse_groups_path(key) else {
            return None;
        };
        if group_id.is_empty() || rel.is_empty() {
            return None;
        }
        return Some(key.to_string());
    }

    // If `account_id` is provided, treat `key` as relative to that account unless
    // it is already explicitly prefixed with the same account.
    if let Some(acct) = account_id {
        if let Some(first) = key.split('/').next() {
            if first == acct.as_str() {
                return Some(key.to_string());
            }
        }
        return Some(format!("{}/{}", acct, key));
    }

    // Full path like "alice.near/posts/1".
    if key.contains('/') {
        if let Some(first) = key.split('/').next() {
            if AccountId::try_from(first.to_string()).is_ok() {
                return Some(key.to_string());
            }
        }
    }

    None
}
