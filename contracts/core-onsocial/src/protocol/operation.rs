//! API operation classification for the Set action.

use near_sdk::serde_json::{Map, Value};

use crate::{invalid_input, SocialError};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ApiOperationKey<'a> {
    StorageDeposit,
    StorageWithdraw,
    StorageSharedPoolDeposit,
    StoragePlatformPoolDeposit,
    StorageGroupPoolDeposit,
    StorageGroupSponsorQuotaSet,
    StorageGroupSponsorDefaultSet,
    StorageShareStorage,
    StorageReturnSharedStorage,

    PermissionGrant,
    PermissionRevoke,

    DataPath(&'a str),
}

impl ApiOperationKey<'_> {
    /// Returns true if this operation requires target_account == actor.
    #[inline]
    pub(crate) fn requires_target_owner(self) -> bool {
        matches!(
            self,
            Self::PermissionGrant
                | Self::PermissionRevoke
                | Self::StorageDeposit
                | Self::StorageWithdraw
                | Self::StorageSharedPoolDeposit
                | Self::StoragePlatformPoolDeposit
                | Self::StorageGroupPoolDeposit
                | Self::StorageGroupSponsorQuotaSet
                | Self::StorageGroupSponsorDefaultSet
                | Self::StorageShareStorage
                | Self::StorageReturnSharedStorage
        )
    }
}

#[inline]
pub(crate) fn classify_api_operation_key(key: &str) -> Result<ApiOperationKey<'_>, SocialError> {
    Ok(match key {
        "manager" => return Err(invalid_input!("Use update_manager()")),
        "config" => return Err(invalid_input!("Use update_config()")),

        "status/read_only" => return Err(invalid_input!("Status transitions must use enter_read_only()")),
        "status/live" => return Err(invalid_input!("Status transitions must use resume_live()")),
        "status/activate" => return Err(invalid_input!("Status transitions must use activate_contract()")),

        "storage/deposit" => ApiOperationKey::StorageDeposit,
        "storage/withdraw" => ApiOperationKey::StorageWithdraw,
        "storage/shared_pool_deposit" => ApiOperationKey::StorageSharedPoolDeposit,
        "storage/platform_pool_deposit" => ApiOperationKey::StoragePlatformPoolDeposit,
        "storage/group_pool_deposit" => ApiOperationKey::StorageGroupPoolDeposit,
        "storage/group_sponsor_quota_set" => ApiOperationKey::StorageGroupSponsorQuotaSet,
        "storage/group_sponsor_default_set" => ApiOperationKey::StorageGroupSponsorDefaultSet,
        "storage/share_storage" => ApiOperationKey::StorageShareStorage,
        "storage/return_shared_storage" => ApiOperationKey::StorageReturnSharedStorage,

        "permission/grant" => ApiOperationKey::PermissionGrant,
        "permission/revoke" => ApiOperationKey::PermissionRevoke,

        // Reject unknown keys under reserved namespaces.
        path if path.starts_with("storage/") => return Err(invalid_input!("Invalid operation key")),
        path if path.starts_with("permission/") => return Err(invalid_input!("Invalid operation key")),
        path if path.starts_with("status/") => return Err(invalid_input!("Invalid operation key")),

        path if path.contains('/') => ApiOperationKey::DataPath(path),

        _ => return Err(invalid_input!("Invalid operation key")),
    })
}

pub(crate) fn require_non_empty_object(value: &Value) -> Result<&Map<String, Value>, SocialError> {
    let obj = value
        .as_object()
        .ok_or_else(|| invalid_input!("Data must be a JSON object"))?;

    if obj.is_empty() {
        return Err(invalid_input!("Data object cannot be empty"));
    }

    Ok(obj)
}
