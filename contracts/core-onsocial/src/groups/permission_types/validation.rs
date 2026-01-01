use near_sdk::AccountId;

use crate::constants::{BPS_DENOMINATOR, MAX_VOTING_PERIOD, MIN_VOTING_PERIOD};
use crate::groups::config::GroupConfig;
use crate::groups::{kv_permissions, GroupStorage};
use crate::state::models::SocialPlatform;
use crate::{invalid_input, SocialError};

use super::group_update_type::GroupUpdateType;
use super::types::ProposalType;

impl ProposalType {
    pub fn validate(&self, platform: &SocialPlatform, group_id: &str, proposer: &AccountId) -> Result<(), SocialError> {
        // Check if group is member-driven
        let config = GroupStorage::get_group_config(platform, group_id)
            .ok_or_else(|| invalid_input!("Group not found"))?;

        let is_member_driven = GroupConfig::try_from_value(&config)?.member_driven;

        if !is_member_driven {
            return Err(invalid_input!("Group is not member-driven"));
        }

        // Validate proposer permissions (with special case for join requests)
        match self {
            Self::JoinRequest { requester, .. } => {
                // For join requests, the requester should be the proposer and should NOT be a member
                if proposer != requester {
                    return Err(invalid_input!(
                        "Only the requester can create their own join request proposal"
                    ));
                }
                if GroupStorage::is_member(platform, group_id, proposer) {
                    return Err(invalid_input!("User is already a member"));
                }
                if GroupStorage::is_blacklisted(platform, group_id, proposer) {
                    return Err(invalid_input!("You are blacklisted from this group"));
                }
            }
            _ => {
                // For all other proposal types, proposer must be a member
                if !GroupStorage::is_member(platform, group_id, proposer) {
                    return Err(crate::permission_denied!(
                        "create_proposal",
                        &format!("groups/{}", group_id)
                    ));
                }
                if GroupStorage::is_blacklisted(platform, group_id, proposer) {
                    return Err(crate::permission_denied!(
                        "create_proposal",
                        "Blacklisted members cannot create proposals"
                    ));
                }
            }
        }

        // Type-specific validation using typed enum fields directly (no JSON re-parsing)
        match self {
            Self::GroupUpdate { changes, .. } => {
                // Check if changes is null or empty
                if changes.is_null() || changes.as_object().is_none_or(|obj| obj.is_empty()) {
                    return Err(invalid_input!("Changes cannot be empty"));
                }

                // For metadata/permissions updates, also check the nested "changes" field.
                // Keep behavior unchanged for unknown update types (no extra early rejection).
                if let Some(update_type_str) = changes.get("update_type").and_then(|v| v.as_str()) {
                    if let Some(update_type) = GroupUpdateType::parse(update_type_str) {
                        match update_type {
                            GroupUpdateType::Metadata | GroupUpdateType::Permissions => {
                                let nested_changes = changes.get("changes");
                                if nested_changes.is_none_or(|c| {
                                    c.is_null() || c.as_object().is_none_or(|obj| obj.is_empty())
                                }) {
                                    return Err(invalid_input!("Changes cannot be empty"));
                                }
                            }
                            GroupUpdateType::Privacy => {
                                let group_config = GroupStorage::get_group_config(platform, group_id)
                                    .ok_or_else(|| invalid_input!("Group not found"))?;
                                let is_member_driven =
                                    GroupConfig::try_from_value(&group_config)?.member_driven;
                                let is_private = changes.get("is_private").and_then(|v| v.as_bool());

                                GroupStorage::assert_member_driven_private_invariant(
                                    is_member_driven,
                                    is_private,
                                )?;
                            }
                            _ => {}
                        }
                    }
                }
            }
            Self::PermissionChange { target_user, level, .. } => {
                if !GroupStorage::is_member(platform, group_id, target_user) {
                    return Err(invalid_input!("Target user must be a member"));
                }
                if !kv_permissions::is_valid_permission_level(*level, true) {
                    return Err(invalid_input!("Invalid permission level"));
                }
            }
            Self::PathPermissionGrant { path, level, .. } => {
                if !path.starts_with(&format!("groups/{}", group_id)) {
                    return Err(invalid_input!("Path must be within this group"));
                }
                if !kv_permissions::is_valid_permission_level(*level, false) {
                    return Err(invalid_input!("Invalid permission level"));
                }
            }
            Self::PathPermissionRevoke { path, .. } => {
                if !path.starts_with(&format!("groups/{}", group_id)) {
                    return Err(invalid_input!("Path must be within this group"));
                }
            }
            Self::MemberInvite { target_user, level, .. } => {
                if GroupStorage::is_member(platform, group_id, target_user) {
                    return Err(invalid_input!("User is already a member"));
                }
                if !kv_permissions::is_valid_permission_level(*level, true) {
                    return Err(invalid_input!("Invalid permission level"));
                }

                GroupStorage::assert_clean_member_level(
                    *level,
                    "Member invites cannot grant permissions; omit level or use 0",
                )?;
            }
            Self::JoinRequest { requested_permissions, .. } => {
                // Clean join semantics: join requests never grant a global role.
                // All joins start member-only (NONE); elevated roles must be granted explicitly after joining.
                GroupStorage::assert_clean_member_level(
                    *requested_permissions,
                    "Join requests cannot request permissions; omit requested_permissions or use 0",
                )?;
            }
            Self::VotingConfigChange { participation_quorum_bps, majority_threshold_bps, voting_period } => {
                if participation_quorum_bps.is_none()
                    && majority_threshold_bps.is_none()
                    && voting_period.is_none()
                {
                    return Err(invalid_input!(
                        "At least one voting config parameter must be specified"
                    ));
                }

                if let Some(quorum_bps) = participation_quorum_bps {
                    if *quorum_bps > BPS_DENOMINATOR {
                        return Err(invalid_input!(
                            "Participation quorum bps must be between 0 and 10000"
                        ));
                    }
                }

                if let Some(threshold_bps) = majority_threshold_bps {
                    if *threshold_bps > BPS_DENOMINATOR {
                        return Err(invalid_input!(
                            "Majority threshold bps must be between 0 and 10000"
                        ));
                    }
                }

                // Validate voting_period is reasonable (at least 1 hour, max 365 days)
                if let Some(period) = voting_period {
                    if !(MIN_VOTING_PERIOD..=MAX_VOTING_PERIOD).contains(period) {
                        return Err(invalid_input!(
                            "Voting period must be between 1 hour and 365 days"
                        ));
                    }
                }
            }
            Self::CustomProposal { title, description, .. } => {
                if title.trim().is_empty() || description.trim().is_empty() {
                    return Err(invalid_input!("Title and description required"));
                }
            }
        }

        Ok(())
    }
}
