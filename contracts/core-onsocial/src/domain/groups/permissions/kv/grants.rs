use near_sdk::AccountId;

use crate::errors::SocialError;
use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;

use super::eval::extract_group_id_from_path;
use super::keys::{build_group_permission_key, build_permission_key};
use super::membership::{get_active_group_member_nonce, get_group_member_nonce, is_group_member};
use super::types::{NONE, PermissionGrant, is_valid_permission_level, normalize_group_path_owned};

pub fn grant_permissions(
    platform: &mut SocialPlatform,
    granter: &AccountId,
    grantee: &AccountId,
    grant: &PermissionGrant,
    event_batch: &mut EventBatch,
    attached_balance: Option<&mut u128>,
) -> Result<(), SocialError> {
    if !is_valid_permission_level(grant.level, false) {
        return Err(crate::invalid_input!("Invalid permission level"));
    }

    let mut permission_nonce_for_event: Option<u64> = None;

    let key = if let Some(group_id) = extract_group_id_from_path(grant.path) {
        // Group-scoped permissions are only meaningful for members.
        if !is_group_member(platform, group_id, grantee.as_str()) {
            return Err(crate::invalid_input!(
                "Cannot grant group permissions to non-member"
            ));
        }

        let nonce = get_group_member_nonce(platform, group_id, grantee.as_str())
            .ok_or_else(|| crate::invalid_input!("Member nonce missing"))?;
        if nonce == 0 {
            return Err(crate::invalid_input!("Member nonce invalid"));
        }
        permission_nonce_for_event = Some(nonce);
        let normalized =
            normalize_group_path_owned(grant.path).unwrap_or_else(|| grant.path.to_string());
        build_group_permission_key(group_id, grantee.as_str(), &normalized, nonce)
    } else {
        let path_identifier = super::eval::extract_path_owner(platform, grant.path)
            .unwrap_or_else(|| granter.as_str().to_string());
        build_permission_key(&path_identifier, grantee.as_str(), grant.path)
    };

    let value = format!("{}:{}", grant.level, grant.expires_at.unwrap_or(0));
    platform.storage_write_string(&key, &value, attached_balance)?;

    let expires_at_string = grant.expires_at.unwrap_or(0).to_string();

    let mut builder = EventBuilder::new(
        crate::constants::EVENT_TYPE_PERMISSION_UPDATE,
        "grant",
        granter.clone(),
    )
    .with_target(grantee)
    .with_path(grant.path)
    .with_field("level", grant.level)
    .with_field("expires_at", expires_at_string);
    if let Some(nonce) = permission_nonce_for_event {
        builder = builder.with_field("permission_nonce", nonce);
    }
    builder.emit(event_batch);

    Ok(())
}

pub fn revoke_permissions(
    platform: &mut SocialPlatform,
    revoker: &AccountId,
    grantee: &AccountId,
    path: &str,
    event_batch: &mut EventBatch,
) -> Result<(), SocialError> {
    let mut permission_nonce_for_event: Option<u64> = None;
    let expires_at_string = "0".to_string();
    let mut deleted = false;

    let key_opt = if let Some(group_id) = extract_group_id_from_path(path) {
        get_active_group_member_nonce(platform, group_id, grantee.as_str()).map(|nonce| {
            permission_nonce_for_event = Some(nonce);
            let normalized = normalize_group_path_owned(path).unwrap_or_else(|| path.to_string());
            build_group_permission_key(group_id, grantee.as_str(), &normalized, nonce)
        })
    } else {
        let path_identifier = super::eval::extract_path_owner(platform, path)
            .unwrap_or_else(|| revoker.as_str().to_string());
        Some(build_permission_key(
            &path_identifier,
            grantee.as_str(),
            path,
        ))
    };

    if let Some(key) = key_opt.as_deref() {
        if let Some(entry) = platform.get_entry(key) {
            deleted = crate::storage::soft_delete_entry(platform, key, entry)?;
        }
    }

    let mut builder = EventBuilder::new(
        crate::constants::EVENT_TYPE_PERMISSION_UPDATE,
        "revoke",
        revoker.clone(),
    )
    .with_target(grantee)
    .with_path(path)
    .with_value(near_sdk::serde_json::Value::Null)
    .with_field("level", NONE)
    .with_field("expires_at", expires_at_string)
    .with_field("deleted", deleted);
    if let Some(nonce) = permission_nonce_for_event {
        builder = builder.with_field("permission_nonce", nonce);
    }
    builder.emit(event_batch);

    Ok(())
}
