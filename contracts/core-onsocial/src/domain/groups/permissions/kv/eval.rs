use crate::state::models::SocialPlatform;

use super::types::{
    FULL_ACCESS, GroupPathInfo, GroupPathKind, MANAGE, MODERATE, WRITE, account_permission_level,
    group_permission_level, is_group_owner, normalize_group_path_owned,
};

#[inline]
pub(crate) fn is_group_root_path(path: &str, group_id: &str) -> bool {
    // Stop hierarchy walk at group root.
    path == format!("groups/{group_id}")
        || path == format!("groups/{group_id}/")
        || path.ends_with(&format!("/groups/{group_id}"))
        || path.ends_with(&format!("/groups/{group_id}/"))
}

pub(crate) fn extract_group_id_from_path(path: &str) -> Option<&str> {
    crate::storage::utils::extract_group_id_from_path(path)
}

pub fn extract_path_owner(platform: &SocialPlatform, path: &str) -> Option<String> {
    if let Some(group_id) = extract_group_id_from_path(path) {
        let config_path = format!("groups/{}/config", group_id);
        if platform.storage_get(&config_path).is_some() {
            return Some(group_id.to_string());
        }
        return None;
    }

    path.split('/').next().map(|s| s.to_string())
}

pub fn has_permissions(
    platform: &SocialPlatform,
    owner: &str,
    grantee: &str,
    path: &str,
    required_level: u8,
) -> bool {
    if let Some(group_id) = extract_group_id_from_path(path) {
        return has_group_permissions(platform, group_id, grantee, path, required_level);
    }

    has_account_permissions(platform, owner, grantee, path, required_level)
}

pub fn has_group_permissions(
    platform: &SocialPlatform,
    group_id: &str,
    grantee: &str,
    path: &str,
    required_level: u8,
) -> bool {
    if extract_group_id_from_path(path) != Some(group_id) {
        return false;
    }

    if is_group_owner(platform, group_id, grantee) {
        return true;
    }

    group_permission_level(platform, group_id, grantee, path)
        .is_some_and(|level| level.at_least(required_level))
}

pub fn has_account_permissions(
    platform: &SocialPlatform,
    account_id: &str,
    grantee: &str,
    path: &str,
    required_level: u8,
) -> bool {
    if extract_group_id_from_path(path).is_some() {
        return false;
    }

    if grantee == account_id {
        return true;
    }

    account_permission_level(platform, account_id, grantee, path)
        .is_some_and(|level| level.at_least(required_level))
}

pub fn get_user_permissions(
    platform: &SocialPlatform,
    owner: &str,
    grantee: &str,
    path: &str,
) -> u8 {
    if let Some(group_id) = extract_group_id_from_path(path) {
        return get_group_user_permissions(platform, group_id, grantee, path);
    }

    get_account_user_permissions(platform, owner, grantee, path)
}

pub fn get_group_user_permissions(
    platform: &SocialPlatform,
    group_id: &str,
    grantee: &str,
    path: &str,
) -> u8 {
    if extract_group_id_from_path(path) != Some(group_id) {
        return 0;
    }

    if is_group_owner(platform, group_id, grantee) {
        return FULL_ACCESS;
    }

    group_permission_level(platform, group_id, grantee, path)
        .map(|l| l.as_u8())
        .unwrap_or(0)
}

pub fn get_account_user_permissions(
    platform: &SocialPlatform,
    account_id: &str,
    grantee: &str,
    path: &str,
) -> u8 {
    if extract_group_id_from_path(path).is_some() {
        return 0;
    }

    if grantee == account_id {
        return FULL_ACCESS;
    }

    account_permission_level(platform, account_id, grantee, path)
        .map(|l| l.as_u8())
        .unwrap_or(0)
}

pub fn can_write(platform: &SocialPlatform, owner: &str, grantee: &str, path: &str) -> bool {
    has_permissions(platform, owner, grantee, path, WRITE)
}

pub fn can_moderate(platform: &SocialPlatform, owner: &str, grantee: &str, path: &str) -> bool {
    has_permissions(platform, owner, grantee, path, MODERATE)
}

pub fn can_manage(platform: &SocialPlatform, owner: &str, grantee: &str, path: &str) -> bool {
    has_permissions(platform, owner, grantee, path, MANAGE)
}

fn is_group_config_namespace(path: &str, group_id: &str) -> bool {
    let direct = format!("groups/{}/config", group_id);
    let direct_prefix = format!("{}/", direct);

    if path == direct || path == direct_prefix || path.starts_with(&direct_prefix) {
        return true;
    }

    let suffix = format!("/{}", direct);
    let Some(idx) = path.find(&suffix) else {
        return false;
    };

    if idx == 0 {
        return false;
    }

    let after = &path[(idx + 1)..];
    after == direct || after == direct_prefix || after.starts_with(&direct_prefix)
}

pub(crate) fn classify_group_path(path: &str) -> Option<GroupPathInfo> {
    let group_id = extract_group_id_from_path(path)?;

    let normalized = normalize_group_path_owned(path)?;

    let kind = if is_group_root_path(&normalized, group_id) {
        GroupPathKind::Root
    } else if is_group_config_namespace(&normalized, group_id) {
        GroupPathKind::Config
    } else {
        GroupPathKind::Other
    };

    Some(GroupPathInfo {
        group_id: group_id.to_string(),
        normalized,
        kind,
    })
}

/// Check if user has admin (MANAGE) permission on a group.
pub fn has_group_admin_permission(
    platform: &SocialPlatform,
    group_id: &str,
    user_id: &near_sdk::AccountId,
) -> bool {
    let group_config_path = format!("groups/{}/config", group_id);
    can_manage(platform, group_id, user_id.as_str(), &group_config_path)
}

/// Check if user has moderate permission on a group.
pub fn has_group_moderate_permission(
    platform: &SocialPlatform,
    group_id: &str,
    user_id: &near_sdk::AccountId,
) -> bool {
    let group_config_path = format!("groups/{}/config", group_id);
    can_moderate(platform, group_id, user_id.as_str(), &group_config_path)
}
