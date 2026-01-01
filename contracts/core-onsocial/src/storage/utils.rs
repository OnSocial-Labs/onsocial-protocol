#[inline(always)]
pub fn calculate_storage_balance_needed(bytes: u64) -> u128 {
    let byte_cost = near_sdk::env::storage_byte_cost().as_yoctonear();
    (bytes as u128).checked_mul(byte_cost).unwrap_or(u128::MAX)
}

#[inline(always)]
pub fn calculate_effective_bytes(used_bytes: u64, shared_allocation: u64) -> u64 {
    used_bytes.saturating_sub(shared_allocation)
}

#[inline(always)]
pub fn soft_delete_entry(
    platform: &mut crate::state::SocialPlatform,
    key: &str,
    entry: crate::state::models::DataEntry,
) -> Result<(), crate::errors::SocialError> {
    // Idempotent: if already deleted, don't rewrite.
    if matches!(entry.value, crate::state::models::DataValue::Deleted(_)) {
        return Ok(());
    }

    let mut updated_entry = entry;
    let deleted_at = near_sdk::env::block_height();

    // Tombstone with the block height at which the deletion occurred.
    updated_entry.value = crate::state::models::DataValue::Deleted(deleted_at);
    // Keep block_height consistent across all mutations (set/remove).
    updated_entry.block_height = deleted_at;
    platform.insert_entry(key, updated_entry)?;
    Ok(())
}

#[inline(always)]
pub fn parse_path(full_path: &str) -> Option<(&str, &str)> {
    full_path.find('/').map(|pos| {
        let owner = &full_path[..pos];
        let rel = &full_path[pos + 1..];
        (owner, rel)
    })
}

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

#[inline(always)]
pub fn extract_group_id_from_path(path: &str) -> Option<&str> {
    if let Some(groups_idx) = path.find("/groups/") {
        let after_groups = &path[(groups_idx + 8)..]; // Skip "/groups/"
        if let Some(slash_pos) = after_groups.find('/') {
            Some(&after_groups[..slash_pos])
        } else {
            Some(after_groups)
        }
    } else if let Some(rest) = path.strip_prefix("groups/") {
        if let Some(slash_pos) = rest.find('/') {
            Some(&rest[..slash_pos])
        } else {
            Some(rest)
        }
    } else {
        None
    }
}


