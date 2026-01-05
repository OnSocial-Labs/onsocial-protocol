use near_sdk::{AccountId, PublicKey};
use near_sdk::serde_json::Value;

use crate::{invalid_input, permission_denied, state::SocialPlatform, SocialError};
use crate::validation::Path;

/// Validates write permissions for cross-account operations.
/// - DataPath: Requires write permission (account-based or key-based).
/// - Reserved ops (permission/storage): Requires actor == target_account.
pub fn validate_cross_account_permissions_simple(
    platform: &SocialPlatform,
    data: &Value,
    target_account: &AccountId,
    actor_id: &AccountId,
    actor_pk: Option<&PublicKey>,
    require_key_for_group_paths: bool,
) -> Result<(), SocialError> {
    let data_obj = crate::protocol::set::operation::require_non_empty_object(data)?;

    for key in data_obj.keys() {
        use crate::protocol::set::operation::{classify_api_operation_key, ApiOperationKey};
        let kind = classify_api_operation_key(key.as_str())?;

        match kind {
            ApiOperationKey::DataPath(path) => {
                let path_obj = Path::new(target_account, path, platform)?;
                let full_path = path_obj.full_path();

                let is_group_path = crate::storage::utils::extract_group_id_from_path(full_path).is_some();

                let path_owner = crate::domain::groups::permissions::kv::extract_path_owner(platform, full_path)
                    .unwrap_or_else(|| target_account.as_str().to_string());

                let can_write = if is_group_path {
                    let account_ok = crate::domain::groups::permissions::kv::can_write(
                        platform,
                               &path_owner,
                               actor_id.as_str(),
                               full_path,
                    );
                    if !account_ok {
                        false
                    } else if require_key_for_group_paths {
                        let Some(pk) = actor_pk else {
                            return Err(invalid_input!("actor_pk required for group write"));
                        };
                        crate::domain::groups::permissions::kv::has_permissions_for_key(
                            platform,
                                   actor_id.as_str(),
                                   pk,
                                   full_path,
                                   crate::domain::groups::permissions::kv::types::WRITE,
                        )
                    } else {
                        true
                    }
                } else {
                    match actor_pk {
                        Some(pk) => crate::domain::groups::permissions::kv::has_permissions_or_key_for_actor(
                            platform,
                            &path_owner,
                            full_path,
                               crate::domain::groups::permissions::kv::types::WRITE,
                            actor_id.as_str(),
                            pk,
                        ),
                        None => crate::domain::groups::permissions::kv::can_write(
                            platform,
                            &path_owner,
                            actor_id.as_str(),
                            full_path,
                        ),
                    }
                };

                if !can_write {
                    return Err(permission_denied!("write", full_path));
                }
            }
            op @ (ApiOperationKey::PermissionGrant
            | ApiOperationKey::PermissionRevoke
            | ApiOperationKey::StorageDeposit
            | ApiOperationKey::StorageWithdraw
            | ApiOperationKey::StorageSharedPoolDeposit
            | ApiOperationKey::StoragePlatformPoolDeposit
            | ApiOperationKey::StorageGroupPoolDeposit
            | ApiOperationKey::StorageGroupSponsorQuotaSet
            | ApiOperationKey::StorageGroupSponsorDefaultSet
            | ApiOperationKey::StorageShareStorage
            | ApiOperationKey::StorageReturnSharedStorage) => {
                debug_assert!(op.requires_target_owner());

                let action = match op {
                    ApiOperationKey::PermissionGrant | ApiOperationKey::PermissionRevoke => "manage permissions",
                    _ => "manage storage",
                };

                if actor_id != target_account {
                    return Err(permission_denied!(action, target_account.as_str()));
                }
            }
        }
    }
    Ok(())
}
