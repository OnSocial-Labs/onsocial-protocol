use super::membership::{get_active_group_member_nonce, is_group_member};
use super::keys::{build_group_permission_key, build_permission_key};

use near_sdk::env;

use crate::state::models::SocialPlatform;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub(crate) enum PermissionLevel {
    None = 0,
    Write = 1,
    Moderate = 2,
    Manage = 3,
    FullAccess = 0xFF,
}

impl PermissionLevel {
    #[inline]
    pub(crate) fn from_stored(level: u8) -> Option<Self> {
        match level {
            NONE => Some(Self::None),
            WRITE => Some(Self::Write),
            MODERATE => Some(Self::Moderate),
            MANAGE => Some(Self::Manage),
            FULL_ACCESS => Some(Self::FullAccess),
            _ => None,
        }
    }

    #[inline]
    pub(crate) fn at_least(self, required_level: u8) -> bool {
        (self as u8) >= required_level
    }

    #[inline]
    pub(crate) fn as_u8(self) -> u8 {
        self as u8
    }
}

pub const NONE: u8 = 0;
pub const WRITE: u8 = 1;
pub const MODERATE: u8 = 2;
pub const MANAGE: u8 = 3;
pub const FULL_ACCESS: u8 = 0xFF;

pub fn is_valid_permission_level(level: u8, allow_none: bool) -> bool {
    if !allow_none && level == NONE {
        return false;
    }
    matches!(level, NONE | WRITE | MODERATE | MANAGE)
}

#[inline]
pub(crate) fn parse_permission_value(value: &str) -> Option<(PermissionLevel, u64)> {
    let (level_str, expires_str) = value.split_once(':')?;
    let level = level_str.parse::<u8>().ok()?;
    let level = PermissionLevel::from_stored(level)?;
    let expires_at = expires_str.parse::<u64>().ok()?;
    Some((level, expires_at))
}

#[inline]
pub fn normalize_group_path_owned(path: &str) -> Option<String> {
    let normalized = if path.starts_with("groups/") {
        path.to_string()
    } else if let Some(idx) = path.find("/groups/") {
        path[(idx + 1)..].to_string()
    } else {
        return None;
    };
    let after_prefix = normalized.strip_prefix("groups/")?;
    if after_prefix.is_empty() || after_prefix.starts_with('/') {
        return None;
    }
    Some(normalized)
}

pub(crate) fn get_parent_path(path: &str) -> Option<String> {
    if let Some(last_slash) = path.rfind('/') {
        if last_slash > 0 {
            Some(path[..last_slash].to_string())
        } else {
            None
        }
    } else {
        None
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum GroupPathKind {
    Root,
    Config,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct GroupPathInfo {
    pub group_id: String,
    /// Normalized group path starting at `groups/{group_id}`.
    pub normalized: String,
    pub kind: GroupPathKind,
}

#[inline]
pub(crate) fn consider_permission_key(
    platform: &SocialPlatform,
    key: &str,
    now: u64,
    max_level: &mut Option<PermissionLevel>,
) {
    let Some(value_str) = platform.storage_get_string(key) else {
        return;
    };

    let Some((level, expires_at)) = parse_permission_value(&value_str) else {
        return;
    };

    if expires_at == 0 || expires_at > now {
        *max_level = Some(max_level.map_or(level, |max| max.max(level)));
    }
}

pub(crate) fn group_permission_level(
    platform: &SocialPlatform,
    group_id: &str,
    grantee: &str,
    path: &str,
) -> Option<PermissionLevel> {
    let permission_nonce = get_active_group_member_nonce(platform, group_id, grantee)?;

    let now = env::block_timestamp();
    let mut max_level: Option<PermissionLevel> = None;
    let mut current_path = normalize_group_path_owned(path).unwrap_or_else(|| path.to_string());
    loop {
        let key = build_group_permission_key(group_id, grantee, &current_path, permission_nonce);
        consider_permission_key(platform, &key, now, &mut max_level);

        let key_with_slash = build_group_permission_key(
            group_id,
            grantee,
            &format!("{}/", current_path),
            permission_nonce,
        );
        consider_permission_key(platform, &key_with_slash, now, &mut max_level);

        if max_level == Some(PermissionLevel::FullAccess) {
            return max_level;
        }

        if super::eval::is_group_root_path(&current_path, group_id) {
            break;
        }

        current_path = get_parent_path(&current_path)?;
    }

    max_level
}

pub(crate) fn account_permission_level(
    platform: &SocialPlatform,
    account_id: &str,
    grantee: &str,
    path: &str,
) -> Option<PermissionLevel> {
    let now = env::block_timestamp();
    let mut max_level: Option<PermissionLevel> = None;
    let mut current_path = path.to_string();
    loop {
        let key = build_permission_key(account_id, grantee, &current_path);
        consider_permission_key(platform, &key, now, &mut max_level);

        let key_with_slash = build_permission_key(account_id, grantee, &format!("{}/", current_path));
        consider_permission_key(platform, &key_with_slash, now, &mut max_level);

        if max_level == Some(PermissionLevel::FullAccess) {
            return max_level;
        }

        current_path = match get_parent_path(&current_path) {
            Some(parent) => parent,
            None => break,
        };
    }

    max_level
}

pub(crate) fn is_group_owner(platform: &SocialPlatform, group_id: &str, actor_id: &str) -> bool {
    let config_path = format!("groups/{}/config", group_id);
    platform
        .storage_get(&config_path)
        .and_then(|c| {
            crate::domain::groups::config::GroupConfig::try_from_value(&c)
                .ok()
                .map(|cfg| cfg.owner.as_str() == actor_id)
        })
        .unwrap_or(false)
}

/// Key permissions for group paths require active membership; leaving a group invalidates key access.
pub(crate) fn key_permission_level(
    platform: &SocialPlatform,
    owner: &str,
    public_key: &near_sdk::PublicKey,
    path: &str,
) -> Option<PermissionLevel> {
    let group_id_opt = super::eval::extract_group_id_from_path(path);
    if let Some(group_id) = group_id_opt {
        if is_group_owner(platform, group_id, owner) {
            return Some(PermissionLevel::FullAccess);
        }
        if !is_group_member(platform, group_id, owner) {
            return None;
        }
    }

    let now = env::block_timestamp();
    let mut max_level: Option<PermissionLevel> = None;
    let mut current_path = path.to_string();
    loop {
        let key = super::key_permissions::build_key_permission_key(owner, public_key, &current_path);
        consider_permission_key(platform, &key, now, &mut max_level);

        let key_with_slash =
            super::key_permissions::build_key_permission_key(owner, public_key, &format!("{}/", current_path));
        consider_permission_key(platform, &key_with_slash, now, &mut max_level);

        if max_level == Some(PermissionLevel::FullAccess) {
            return max_level;
        }

        if let Some(group_id) = group_id_opt {
            if super::eval::is_group_root_path(&current_path, group_id) {
                break;
            }
        }

        current_path = match get_parent_path(&current_path) {
            Some(parent) => parent,
            None => break,
        };
    }

    max_level
}
