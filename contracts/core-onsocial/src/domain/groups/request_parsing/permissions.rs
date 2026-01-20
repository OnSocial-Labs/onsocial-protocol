use near_sdk::serde_json::Value;

use crate::{SocialError, invalid_input};

pub(super) fn parse_permission_change(
    changes: &Value,
) -> Result<crate::domain::groups::ProposalType, SocialError> {
    let target_user_str = changes
        .get("target_user")
        .and_then(|v| v.as_str())
        .ok_or_else(|| invalid_input!("target_user required for permission_change"))?;
    let target_user = crate::validation::parse_account_id_str(
        target_user_str,
        invalid_input!("Invalid target_user account ID"),
    )?;
    let level = changes
        .get("level")
        .and_then(|v| v.as_u64())
        .and_then(|f| if f <= 255 { Some(f as u8) } else { None })
        .ok_or_else(|| invalid_input!("level required for permission_change (0-3)"))?;
    let reason = changes.get("reason").and_then(|v| v.as_str());

    Ok(crate::domain::groups::ProposalType::PermissionChange {
        target_user,
        level,
        reason: reason.map(|s| s.to_string()),
    })
}

pub(super) fn parse_path_permission_grant(
    changes: &Value,
) -> Result<crate::domain::groups::ProposalType, SocialError> {
    let target_user_str = changes
        .get("target_user")
        .and_then(|v| v.as_str())
        .ok_or_else(|| invalid_input!("target_user required for path_permission_grant"))?;
    let target_user = crate::validation::parse_account_id_str(
        target_user_str,
        invalid_input!("Invalid target_user account ID"),
    )?;
    let path = changes
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| invalid_input!("path required for path_permission_grant"))?;
    let level = changes
        .get("level")
        .and_then(|v| v.as_u64())
        .and_then(|f| if f <= 255 { Some(f as u8) } else { None })
        .ok_or_else(|| invalid_input!("level required for path_permission_grant (0-3)"))?;
    let reason = changes
        .get("reason")
        .and_then(|v| v.as_str())
        .ok_or_else(|| invalid_input!("reason required for path_permission_grant"))?;

    Ok(crate::domain::groups::ProposalType::PathPermissionGrant {
        target_user,
        path: path.to_string(),
        level,
        reason: reason.to_string(),
    })
}

pub(super) fn parse_path_permission_revoke(
    changes: &Value,
) -> Result<crate::domain::groups::ProposalType, SocialError> {
    let target_user_str = changes
        .get("target_user")
        .and_then(|v| v.as_str())
        .ok_or_else(|| invalid_input!("target_user required for path_permission_revoke"))?;
    let target_user = crate::validation::parse_account_id_str(
        target_user_str,
        invalid_input!("Invalid target_user account ID"),
    )?;
    let path = changes
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| invalid_input!("path required for path_permission_revoke"))?;
    let reason = changes
        .get("reason")
        .and_then(|v| v.as_str())
        .ok_or_else(|| invalid_input!("reason required for path_permission_revoke"))?;

    Ok(crate::domain::groups::ProposalType::PathPermissionRevoke {
        target_user,
        path: path.to_string(),
        reason: reason.to_string(),
    })
}
