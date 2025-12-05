// --- External imports ---
use near_sdk::{env, AccountId, serde_json::Value};

// --- Internal imports ---
use crate::{
    errors::*, invalid_input, permission_denied,
    state::SocialPlatform, SocialError,
    groups::GroupStorage,
};

// --- Public API ---

// --- Account Validation ---

/// Simplified account ID validation - only basic NEAR protocol format check
#[inline(always)]
pub fn validate_account_id(
    account_id: &AccountId,
) -> Result<(), SocialError> {
    // Only validate NEAR account ID format - no complex caching needed
    if !env::is_valid_account_id(account_id.as_bytes()) {
        return Err(invalid_input!(ERR_INVALID_ACCOUNT_ID));
    }
    Ok(())
}

/// Simplified cross-account permissions validation for simple JSON API
pub fn validate_cross_account_permissions_simple(
    platform: &mut SocialPlatform,
    data: &Value,
    target_account: &AccountId,
    predecessor: &AccountId,  // Renamed for clarity - this is the caller
) -> Result<(), SocialError> {
    if let Some(data_obj) = data.as_object() {
        for (key, _value) in data_obj {
            match key.as_str() {
                // For data paths, check permissions on each path
                path if path.contains('/') => {
                    // SECURITY: Check if path starts with a different account (cross-account write attempt)
                    // E.g., if signer=alice.near, path="bob.near/profile/bio" should be rejected
                    if let Some(first_part) = path.split('/').next() {
                        // Check if first part looks like an AccountId (contains '.' and reasonable length)
                        if first_part.contains('.') && first_part.len() >= 2 {
                            // Try to parse as AccountId
                            if let Ok(path_account) = first_part.parse::<AccountId>() {
                                if &path_account != target_account {
                                    // CROSS-ACCOUNT WRITE ATTEMPT DETECTED
                                    // This is blocked by default - user cannot write to other accounts
                                    return Err(permission_denied!(
                                        "write to other account",
                                        format!("Cannot write to {}, you are {}", path_account, target_account)
                                    ));
                                }
                            }
                        }
                    }

                    let full_path = format!("{}/{}", target_account, path);

                    // SPECIAL HANDLING FOR GROUP PATHS:
                    // Group content is stored in user space (bob/groups/X/posts/1)
                    // But permissions are checked on group paths (groups/X/posts/)
                    let permission_check_path = if path.starts_with("groups/") {
                        // For group paths, check permission on the group path itself (without user prefix)
                        path.to_string()
                    } else {
                        // For regular paths, use full path with user prefix
                        full_path.clone()
                    };

                    // Extract the correct owner for permission checks (handles both account and group paths)
                    let path_owner = crate::groups::kv_permissions::extract_path_owner(platform, &permission_check_path)
                        .unwrap_or_else(|| target_account.as_str().to_string());

                    // Check permission using our new KV system
                    let can_write = crate::groups::kv_permissions::can_write(
                        platform,
                        &path_owner,
                        predecessor.as_str(),
                        &permission_check_path
                    );
                    
                    if !can_write {
                        return Err(permission_denied!("write", full_path));
                    }
                }
                // For permission operations, check if caller can manage permissions
                "permission/grant" | "permission/revoke" => {
                    // Permission operations require the caller to be the target account owner
                    // or have appropriate management permissions
                    if predecessor != target_account {
                        return Err(permission_denied!("manage permissions", target_account.as_str()));
                    }
                }
                // For storage operations, check storage permissions
                "storage/deposit" | "storage/withdraw" => {
                    // Storage operations require the caller to be the target account
                    if predecessor != target_account {
                        return Err(permission_denied!("manage storage", target_account.as_str()));
                    }
                }
                _ => {
                    // Unknown operation key - deny by default
                    return Err(invalid_input!("Unknown operation key for permission check"));
                }
            }
        }
    }
    Ok(())
}

// --- Validation Helpers ---

// --- Group Validation Helpers ---

/// Common validation for group operations
pub fn validate_group_operation(platform: &SocialPlatform, group_id: &str) -> Result<Value, SocialError> {
    // Validate contract is in Live status for write operations
    platform.validate_state(false)?;

    // Get and validate group config
    let config = crate::groups::core::GroupStorage::get_group_config(platform, group_id)
        .ok_or_else(|| invalid_input!(crate::errors::ERR_GROUP_NOT_FOUND))?;

    Ok(config)
}

/// Check if a group is member-driven
pub fn is_group_member_driven(config: &Value) -> bool {
    config.get("member_driven")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Route operation based on group type (member-driven vs traditional)
pub fn route_group_operation<F>(
    platform: &mut SocialPlatform,
    group_id: &str,
    caller: &AccountId,
    event_config: &Option<crate::events::EventConfig>,
    member_driven_action: F,
    traditional_action: impl FnOnce(&mut SocialPlatform) -> Result<(), SocialError>
) -> Result<(), SocialError>
where
    F: FnOnce(&mut SocialPlatform, &str, &AccountId, &Option<crate::events::EventConfig>) -> Result<(), SocialError>
{
    let config = validate_group_operation(platform, group_id)?;
    let is_member_driven = is_group_member_driven(&config);

    if is_member_driven {
        member_driven_action(platform, group_id, caller, event_config)
    } else {
        traditional_action(platform)
    }
}

/// Route operation with member-driven error handling
pub fn route_with_member_driven_error<F>(
    platform: &mut SocialPlatform,
    group_id: &str,
    _event_config: &Option<crate::events::EventConfig>,
    error_message: &str,
    traditional_action: F
) -> Result<(), SocialError>
where
    F: FnOnce(&mut SocialPlatform) -> Result<(), SocialError>
{
    let config = validate_group_operation(platform, group_id)?;
    let is_member_driven = is_group_member_driven(&config);

    if is_member_driven {
        return Err(invalid_input!(error_message));
    }

    traditional_action(platform)
}

/// Simplified JSON value validation - only basic structure checks
/// Removed complex depth validation and metadata validation for gas efficiency
#[inline(always)]
pub fn validate_json_value_simple(
    value: &Value,
    _platform: &SocialPlatform,
) -> Result<(), SocialError> {
    // Only basic validation - ensure it's valid JSON structure
    // Complex validation removed for blockchain efficiency
    match value {
        Value::Object(obj) => {
            // Basic object validation - ensure no null keys
            for key in obj.keys() {
                if key.is_empty() {
                    return Err(invalid_input!(ERR_INVALID_JSON_FORMAT));
                }
            }
        }
        Value::Array(_) | Value::String(_) | Value::Number(_) | Value::Bool(_) | Value::Null => {
            // These are fine
        }
    }
    Ok(())
}

// --- Proposal Validation ---

/// Validate a proposal for a member-driven group
pub fn validate_proposal(
    platform: &SocialPlatform,
    group_id: &str,
    proposer: &AccountId,
    proposal_type: &str,
    proposal_data: &Value,
) -> Result<(), SocialError> {
    // Check if group is member-driven
    let config = GroupStorage::get_group_config(platform, group_id)
        .ok_or_else(|| invalid_input!("Group not found"))?;

    let is_member_driven = config.get("member_driven")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !is_member_driven {
        return Err(invalid_input!("Group is not member-driven"));
    }

    // Validate proposer permissions (with special case for join requests)
    match proposal_type {
        "join_request" => {
            let requester: AccountId = proposal_data.get("requester")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Requester required for join request"))?
                .parse()
                .map_err(|_| invalid_input!("Invalid requester account ID"))?;

            // For join requests, the requester should be the proposer and should NOT be a member
            if proposer != &requester {
                return Err(invalid_input!("Only the requester can create their own join request proposal"));
            }
            if GroupStorage::is_member(platform, group_id, proposer) {
                return Err(invalid_input!("User is already a member"));
            }
            // Non-members can create join request proposals - this is the exception
        }
        _ => {
            // For all other proposal types, proposer must be a member
            if !GroupStorage::is_member(platform, group_id, proposer) {
                return Err(permission_denied!("create_proposal", &format!("groups/{}", group_id)));
            }
        }
    }

    // Type-specific validation
    match proposal_type {
        "group_update" => {
            let changes = proposal_data.get("changes")
                .ok_or_else(|| invalid_input!("Changes required for group update"))?;

            // Check if changes is null or empty
            if changes.is_null() || changes.as_object().is_none_or(|obj| obj.is_empty()) {
                return Err(invalid_input!("Changes cannot be empty"));
            }

            // For metadata/permissions updates, also check the nested "changes" field
            if let Some(update_type) = changes.get("update_type").and_then(|v| v.as_str()) {
                if matches!(update_type, "metadata" | "permissions") {
                    let nested_changes = changes.get("changes");
                    if nested_changes.is_none_or(|c| c.is_null() || c.as_object().is_none_or(|obj| obj.is_empty())) {
                        return Err(invalid_input!("Changes cannot be empty"));
                    }
                }
            }

            // For member-driven groups, allow members to propose various updates
            if is_member_driven {
                let update_type = changes.get("update_type").and_then(|v| v.as_str());
                match update_type {
                    Some("remove_member") | Some("ban") | Some("unban") | Some("privacy") | Some("transfer_ownership") => {
                        // For privacy changes in member-driven groups, ensure they cannot be set to public
                        if update_type == Some("privacy") {
                            if let Some(is_private) = changes.get("is_private").and_then(|v| v.as_bool()) {
                                if !is_private {
                                    return Err(invalid_input!("Member-driven groups cannot be set to public - they must remain private to maintain democratic control over membership"));
                                }
                            }
                        }
                    }
                    _ => {
                        // Other updates might need additional validation
                    }
                }
            }
        }
        "permission_change" => {
            let target_user_str = proposal_data.get("target_user")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Target user required"))?;
            let target_user: AccountId = target_user_str.parse().map_err(|_| invalid_input!("Invalid target account ID"))?;

            if !GroupStorage::is_member(platform, group_id, &target_user) {
                return Err(invalid_input!("Target user must be a member"));
            }
            // Validate permission flags are reasonable (not empty)
            let permission_flags = proposal_data.get("permission_flags")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| invalid_input!("Permission flags required"))?;
            if permission_flags == 0 {
                return Err(invalid_input!("Invalid permission flags"));
            }
        }
        "path_permission_grant" => {
            let target_user_str = proposal_data.get("target_user")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Target user required"))?;
            target_user_str.parse::<AccountId>().map_err(|_| invalid_input!("Invalid target account ID"))?;

            // Validate target user exists (doesn't need to be member for path permissions)
            if target_user_str.is_empty() {
                return Err(invalid_input!("Target user required"));
            }
            // Validate path is within this group
            let path = proposal_data.get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Path required"))?;
            if !path.starts_with(&format!("groups/{}", group_id)) {
                return Err(invalid_input!("Path must be within this group"));
            }
            // Validate permission flags
            let permission_flags = proposal_data.get("permission_flags")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| invalid_input!("Permission flags required"))?;
            if permission_flags == 0 {
                return Err(invalid_input!("Invalid permission flags"));
            }
        }
        "path_permission_revoke" => {
            let target_user_str = proposal_data.get("target_user")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Target user required"))?;
            target_user_str.parse::<AccountId>().map_err(|_| invalid_input!("Invalid target account ID"))?;

            // Validate target user exists
            if target_user_str.is_empty() {
                return Err(invalid_input!("Target user required"));
            }
            // Validate path is within this group
            let path = proposal_data.get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Path required"))?;
            if !path.starts_with(&format!("groups/{}", group_id)) {
                return Err(invalid_input!("Path must be within this group"));
            }
        }
        "member_invite" => {
            let target_user_str = proposal_data.get("target_user")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Target user required"))?;
            let target_user: AccountId = target_user_str.parse().map_err(|_| invalid_input!("Invalid target account ID"))?;

            if GroupStorage::is_member(platform, group_id, &target_user) {
                return Err(invalid_input!("User is already a member"));
            }
        }
        "join_request" => {
            let requester_str = proposal_data.get("requester")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Requester required"))?;
            let requester: AccountId = requester_str.parse().map_err(|_| invalid_input!("Invalid requester account ID"))?;

            // Validate requester is not already a member
            if GroupStorage::is_member(platform, group_id, &requester) {
                return Err(invalid_input!("User is already a member"));
            }
            // Validate requester is not blacklisted
            if GroupStorage::is_blacklisted(platform, group_id, &requester) {
                return Err(invalid_input!("You are blacklisted from this group"));
            }
            // Validate permissions are reasonable (not empty)
            let requested_permissions = proposal_data.get("requested_permissions")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| invalid_input!("Requested permissions required"))?;
            if requested_permissions == 0 {
                return Err(invalid_input!("Invalid permission flags"));
            }
            // Note: JoinRequest proposals are only created automatically for member-driven groups,
            // so we don't need additional validation here - the automatic creation handles it
        }
        "voting_config_change" => {
            let participation_quorum = proposal_data.get("participation_quorum").and_then(|v| v.as_f64());
            let majority_threshold = proposal_data.get("majority_threshold").and_then(|v| v.as_f64());
            let voting_period = proposal_data.get("voting_period").and_then(|v| v.as_u64());

            // Validate that at least one config value is being changed
            if participation_quorum.is_none() && majority_threshold.is_none() && voting_period.is_none() {
                return Err(invalid_input!("At least one voting config parameter must be specified"));
            }

            // Validate participation_quorum is in valid range (0.0 to 1.0)
            if let Some(quorum) = participation_quorum {
                if !(0.0..=1.0).contains(&quorum) {
                    return Err(invalid_input!("Participation quorum must be between 0.0 and 1.0"));
                }
            }

            // Validate majority_threshold is in valid range (0.0 to 1.0)
            if let Some(threshold) = majority_threshold {
                if !(0.0..=1.0).contains(&threshold) {
                    return Err(invalid_input!("Majority threshold must be between 0.0 and 1.0"));
                }
            }

            // Validate voting_period is reasonable (at least 1 hour, max 365 days)
            if let Some(period) = voting_period {
                const ONE_HOUR: u64 = 60 * 60 * 1_000_000_000; // 1 hour in nanoseconds
                const ONE_YEAR: u64 = 365 * 24 * 60 * 60 * 1_000_000_000; // 365 days in nanoseconds
                if !(ONE_HOUR..=ONE_YEAR).contains(&period) {
                    return Err(invalid_input!("Voting period must be between 1 hour and 365 days"));
                }
            }
        }
        "custom_proposal" => {
            let title = proposal_data.get("title")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Title required"))?;
            let description = proposal_data.get("description")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid_input!("Description required"))?;

            if title.trim().is_empty() || description.trim().is_empty() {
                return Err(invalid_input!("Title and description required"));
            }
        }
        _ => return Err(invalid_input!("Unknown proposal type")),
    }

    Ok(())
}