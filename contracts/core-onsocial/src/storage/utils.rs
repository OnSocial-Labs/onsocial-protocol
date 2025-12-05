// --- Storage Utilities ---

/// Calculate the storage balance needed for a given number of bytes
#[inline(always)]
pub fn calculate_storage_balance_needed(bytes: u64) -> u128 {
    let byte_cost = near_sdk::env::storage_byte_cost().as_yoctonear();
    (bytes as u128).checked_mul(byte_cost).unwrap_or(u128::MAX)
}

/// Calculate effective bytes that need payment (total used minus shared allocation)
#[inline(always)]
pub fn calculate_effective_bytes(used_bytes: u64, shared_allocation: u64) -> u64 {
    used_bytes.saturating_sub(shared_allocation)
}

/// Validate that the depositor matches the account performing the operation
#[inline(always)]
pub fn validate_depositor(
    depositor: &near_sdk::AccountId,
    account_id: &near_sdk::AccountId,
    operation: &str,
) -> Result<(), crate::errors::SocialError> {
    if depositor != account_id {
        return Err(crate::errors::SocialError::Unauthorized(
            operation.to_string(),
            account_id.to_string(),
        ));
    }
    Ok(())
}

/// Validate withdrawal amount against available deposit
#[inline(always)]
pub fn validate_withdrawal_amount(
    withdraw_amount: u128,
    available_deposit: u128,
    operation: &str,
) -> Result<(), crate::errors::SocialError> {
    if withdraw_amount > available_deposit {
        return Err(crate::errors::SocialError::InsufficientStorage(
            operation.to_string(),
        ));
    }
    Ok(())
}

/// Soft delete an entry by marking it with deletion timestamp
/// Only stores block height, allowing storage tracker to detect and release freed bytes
#[inline(always)]
pub fn soft_delete_entry(
    platform: &mut crate::state::SocialPlatform,
    key: &str,
    entry: crate::state::models::DataEntry,
) -> Result<(), crate::errors::SocialError> {
    let mut updated_entry = entry;
    // Mark as deleted with block height, no size preservation
    // Storage tracker will automatically detect and release the freed bytes
    updated_entry.value = crate::state::models::DataValue::Deleted(near_sdk::env::block_height());
    platform.insert_entry(key, updated_entry)?;
    Ok(())
}

/// Parse a full path into owner and relative path components
#[inline(always)]
pub fn parse_path(full_path: &str) -> Option<(&str, &str)> {
    full_path.find('/').map(|pos| {
        let owner = &full_path[..pos];
        let rel = &full_path[pos + 1..];
        (owner, rel)
    })
}

/// Parse a groups path into group_id and relative path components
#[inline(always)]
pub fn parse_groups_path(full_path: &str) -> Option<(&str, &str)> {
    if let Some(stripped) = full_path.strip_prefix("groups/") {
        stripped.find('/').map(|pos| {
            let group_id = &stripped[..pos];
            let rel = &stripped[pos + 1..];
            (group_id, rel)
        })
    } else {
        None
    }
}


