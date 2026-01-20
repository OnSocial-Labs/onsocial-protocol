use near_sdk::{AccountId, PublicKey};

use crate::errors::SocialError;
use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;

use super::types::{NONE, PermissionGrant, is_valid_permission_level, key_permission_level};

pub(crate) fn build_key_permission_key(owner: &str, public_key: &PublicKey, path: &str) -> String {
    let key_str = String::from(public_key);
    let subpath = path.strip_prefix(&format!("{}/", owner)).unwrap_or(path);

    if subpath.is_empty() || subpath == owner {
        format!("{}/key_permissions/{}", owner, key_str)
    } else {
        format!("{}/key_permissions/{}/{}", owner, key_str, subpath)
    }
}

pub fn grant_permissions_to_key(
    platform: &mut SocialPlatform,
    owner: &AccountId,
    public_key: &PublicKey,
    grant: &PermissionGrant,
    event_batch: &mut EventBatch,
    attached_balance: Option<&mut u128>,
) -> Result<(), SocialError> {
    if !is_valid_permission_level(grant.level, false) {
        return Err(crate::invalid_input!("Invalid permission level"));
    }
    let key = build_key_permission_key(owner.as_str(), public_key, grant.path);
    let value = format!("{}:{}", grant.level, grant.expires_at.unwrap_or(0));
    platform.storage_write_string(&key, &value, attached_balance)?;

    let key_str = String::from(public_key);
    let expires_at_string = grant.expires_at.unwrap_or(0).to_string();

    EventBuilder::new(
        crate::constants::EVENT_TYPE_PERMISSION_UPDATE,
        "grant_key",
        owner.clone(),
    )
    .with_field("public_key", key_str)
    .with_path(grant.path)
    .with_field("level", grant.level)
    .with_field("expires_at", expires_at_string)
    .emit(event_batch);

    Ok(())
}

pub fn revoke_permissions_for_key(
    platform: &mut SocialPlatform,
    owner: &AccountId,
    public_key: &PublicKey,
    path: &str,
    event_batch: &mut EventBatch,
) -> Result<(), SocialError> {
    let key = build_key_permission_key(owner.as_str(), public_key, path);
    let mut deleted = false;

    if let Some(entry) = platform.get_entry(&key) {
        deleted = crate::storage::soft_delete_entry(platform, &key, entry)?;
    }

    let key_str = String::from(public_key);
    let expires_at_string = "0".to_string();

    EventBuilder::new(
        crate::constants::EVENT_TYPE_PERMISSION_UPDATE,
        "revoke_key",
        owner.clone(),
    )
    .with_field("public_key", key_str)
    .with_path(path)
    .with_value(near_sdk::serde_json::Value::Null)
    .with_field("level", NONE)
    .with_field("expires_at", expires_at_string)
    .with_field("deleted", deleted)
    .emit(event_batch);

    Ok(())
}

pub fn has_permissions_for_key(
    platform: &SocialPlatform,
    owner: &str,
    public_key: &PublicKey,
    path: &str,
    required_level: u8,
) -> bool {
    key_permission_level(platform, owner, public_key, path)
        .is_some_and(|level| level.at_least(required_level))
}

pub fn get_key_permissions(
    platform: &SocialPlatform,
    owner: &str,
    public_key: &PublicKey,
    path: &str,
) -> u8 {
    key_permission_level(platform, owner, public_key, path)
        .map(|l| l.as_u8())
        .unwrap_or(0)
}

/// Main authorization check for account or session-key callers.
pub fn has_permissions_or_key_for_actor(
    platform: &SocialPlatform,
    owner: &str,
    path: &str,
    required_level: u8,
    actor_id: &str,
    actor_pk: &PublicKey,
) -> bool {
    if super::eval::has_permissions(platform, owner, actor_id, path, required_level) {
        return true;
    }
    has_permissions_for_key(platform, owner, actor_pk, path, required_level)
}
