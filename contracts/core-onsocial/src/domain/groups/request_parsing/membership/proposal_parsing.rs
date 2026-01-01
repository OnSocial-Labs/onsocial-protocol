use near_sdk::serde_json::Value;

use crate::{invalid_input, SocialError};

pub(crate) fn parse_member_invite_proposal(
    changes: &Value,
) -> Result<crate::domain::groups::ProposalType, SocialError> {
    let target_user_str = changes
        .get("target_user")
        .and_then(|v| v.as_str())
        .ok_or_else(|| invalid_input!("target_user required for member_invite"))?;
    let target_user = crate::validation::parse_account_id_str(
        target_user_str,
        invalid_input!("Invalid target_user account ID"),
    )?;
    let level = changes
        .get("level")
        .and_then(|v| v.as_u64())
        .and_then(|f| if f <= 255 { Some(f as u8) } else { None })
        .unwrap_or(crate::domain::groups::kv_permissions::NONE); // Default to NONE (member-only)
    let message = changes.get("message").and_then(|v| v.as_str());
    Ok(crate::domain::groups::ProposalType::MemberInvite {
        target_user,
        level,
        message: message.map(|s| s.to_string()),
    })
}

pub(crate) fn parse_join_request_proposal(
    changes: &Value,
) -> Result<crate::domain::groups::ProposalType, SocialError> {
    let requester_str = changes
        .get("requester")
        .and_then(|v| v.as_str())
        .ok_or_else(|| invalid_input!("requester required for join_request"))?;
    let requester = crate::validation::parse_account_id_str(
        requester_str,
        invalid_input!("Invalid requester account ID"),
    )?;
    let requested_permissions = changes
        .get("requested_permissions")
        .and_then(|v| v.as_u64())
        .and_then(|f| if f <= 255 { Some(f as u8) } else { None })
        .unwrap_or(crate::domain::groups::kv_permissions::NONE);
    let message = changes.get("message").and_then(|v| v.as_str());
    Ok(crate::domain::groups::ProposalType::JoinRequest {
        requester,
        requested_permissions,
        message: message.map(|s| s.to_string()),
    })
}
