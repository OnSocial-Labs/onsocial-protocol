use near_sdk::serde_json::Value;

use crate::domain::groups::config::GroupConfig;
use crate::{invalid_input, SocialError};
use crate::state::models::SocialPlatform;

/// Common validation for group operations.
pub fn validate_group_operation(
    platform: &SocialPlatform,
    group_id: &str,
) -> Result<Value, SocialError> {
    let config = crate::domain::groups::core::GroupStorage::get_group_config(platform, group_id)
        .ok_or_else(|| invalid_input!("Group not found"))?;

    Ok(config)
}

/// Check if a group is member-driven.
pub fn is_group_member_driven(config: &Value) -> bool {
    match GroupConfig::try_from_value(config) {
        Ok(cfg) => cfg.member_driven,
        Err(_) => false,
    }
}

pub fn route_group_operation<R>(
    platform: &mut SocialPlatform,
    group_id: &str,
    member_driven_action: impl FnOnce(&mut SocialPlatform) -> Result<R, SocialError>,
    traditional_action: impl FnOnce(&mut SocialPlatform) -> Result<R, SocialError>,
) -> Result<R, SocialError> {
    let config = validate_group_operation(platform, group_id)?;
    let is_member_driven = is_group_member_driven(&config);

    if is_member_driven {
        member_driven_action(platform)
    } else {
        traditional_action(platform)
    }
}
