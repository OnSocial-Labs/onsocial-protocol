//! API operation classification for the Set action.

use near_sdk::serde_json::{Map, Value};

use crate::{invalid_input, SocialError};

/// Classifies the type of operation based on the key in the data object.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ApiOperationKey<'a> {
    // Storage operations
    StorageDeposit,
    StorageWithdraw,
    StorageSharedPoolDeposit,
    StoragePlatformPoolDeposit,
    StorageGroupPoolDeposit,
    StorageGroupSponsorQuotaSet,
    StorageGroupSponsorDefaultSet,
    StorageShareStorage,
    StorageReturnSharedStorage,

    // Permission operations
    PermissionGrant,
    PermissionRevoke,

    // Regular data path
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

/// Classify an API operation key from the data object.
#[inline]
pub(crate) fn classify_api_operation_key(key: &str) -> Result<ApiOperationKey<'_>, SocialError> {
    Ok(match key {
        // Contract-level operations are not supported via `set`.
        "manager" => return Err(invalid_input!("Use update_manager()")),
        "config" => return Err(invalid_input!("Use update_config()")),

        // Status transitions must be called via dedicated contract methods.
        "status/read_only" => return Err(invalid_input!("Status transitions must use enter_read_only()")),
        "status/live" => return Err(invalid_input!("Status transitions must use resume_live()")),
        "status/activate" => return Err(invalid_input!("Status transitions must use activate_contract()")),

        // Storage operations.
        "storage/deposit" => ApiOperationKey::StorageDeposit,
        "storage/withdraw" => ApiOperationKey::StorageWithdraw,
        "storage/shared_pool_deposit" => ApiOperationKey::StorageSharedPoolDeposit,
        "storage/platform_pool_deposit" => ApiOperationKey::StoragePlatformPoolDeposit,
        "storage/group_pool_deposit" => ApiOperationKey::StorageGroupPoolDeposit,
        "storage/group_sponsor_quota_set" => ApiOperationKey::StorageGroupSponsorQuotaSet,
        "storage/group_sponsor_default_set" => ApiOperationKey::StorageGroupSponsorDefaultSet,
        "storage/share_storage" => ApiOperationKey::StorageShareStorage,
        "storage/return_shared_storage" => ApiOperationKey::StorageReturnSharedStorage,

        // Permission operations.
        "permission/grant" => ApiOperationKey::PermissionGrant,
        "permission/revoke" => ApiOperationKey::PermissionRevoke,

        // Prevent arbitrary user data from being written under reserved namespaces.
        path if path.starts_with("storage/") => return Err(invalid_input!("Invalid operation key")),
        path if path.starts_with("permission/") => return Err(invalid_input!("Invalid operation key")),
        path if path.starts_with("status/") => return Err(invalid_input!("Invalid operation key")),

        // Regular data paths.
        path if path.contains('/') => ApiOperationKey::DataPath(path),

        _ => return Err(invalid_input!("Invalid operation key")),
    })
}

/// Common API invariant: the request payload must be a non-empty JSON object.
pub(crate) fn require_non_empty_object(value: &Value) -> Result<&Map<String, Value>, SocialError> {
    let obj = value
        .as_object()
        .ok_or_else(|| invalid_input!("Data must be a JSON object"))?;

    if obj.is_empty() {
        return Err(invalid_input!("Data object cannot be empty"));
    }

    Ok(obj)
}
