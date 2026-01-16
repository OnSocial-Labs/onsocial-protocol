use near_sdk::AccountId;

pub fn resolve_view_key(key: &str, account_id: Option<&AccountId>) -> Option<String> {
    let key = key.trim().trim_start_matches('/');
    if key.is_empty() {
        return None;
    }

    if key.starts_with("groups/") {
        let Some((group_id, rel)) = crate::storage::utils::parse_groups_path(key) else {
            return None;
        };
        if group_id.is_empty() || rel.is_empty() {
            return None;
        }
        return Some(key.to_string());
    }

    if let Some(acct) = account_id {
        if let Some(first) = key.split('/').next() {
            if first == acct.as_str() {
                return Some(key.to_string());
            }
        }
        return Some(format!("{}/{}", acct, key));
    }

    if key.contains('/') {
        if let Some(first) = key.split('/').next() {
            if AccountId::try_from(first.to_string()).is_ok() {
                return Some(key.to_string());
            }
        }
    }

    None
}
