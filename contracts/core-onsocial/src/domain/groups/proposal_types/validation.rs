use near_sdk::AccountId;

use crate::constants::{BPS_DENOMINATOR, MAX_VOTING_PERIOD, MIN_VOTING_PERIOD};
use crate::domain::groups::config::GroupConfig;
use crate::domain::groups::GroupStorage;
use crate::domain::groups::permissions::kv as kv_permissions;
use crate::state::models::SocialPlatform;
use crate::{invalid_input, SocialError};

use super::group_update_type::GroupUpdateType;
use super::types::ProposalType;

impl ProposalType {
    pub fn validate(&self, platform: &SocialPlatform, group_id: &str, proposer: &AccountId) -> Result<(), SocialError> {
        let config = GroupStorage::get_group_config(platform, group_id)
            .ok_or_else(|| invalid_input!("Group not found"))?;

        let is_member_driven = GroupConfig::try_from_value(&config)?.member_driven;

        if !is_member_driven {
            return Err(invalid_input!("Group is not member-driven"));
        }

        match self {
            Self::JoinRequest { requester, .. } => {
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

        match self {
            Self::GroupUpdate { update_type, changes, .. } => {
                let parsed_update_type = GroupUpdateType::parse(update_type)
                    .ok_or_else(|| invalid_input!("Unknown update_type"))?;
                match parsed_update_type {
                    GroupUpdateType::Metadata | GroupUpdateType::Permissions => {
                        // Check the nested "changes" field for emptiness
                        let nested_changes = changes.get("changes").unwrap_or(changes);
                        if nested_changes.is_null() || nested_changes.as_object().is_none_or(|obj| obj.is_empty()) {
                            return Err(invalid_input!("Changes cannot be empty"));
                        }
                    }
                    GroupUpdateType::TransferOwnership => {
                        let new_owner_str = changes.get("new_owner")
                            .and_then(|v| v.as_str())
                            .ok_or_else(|| invalid_input!("new_owner is required"))?;
                        let new_owner_account = crate::validation::parse_account_id_str(
                            new_owner_str,
                            invalid_input!("Invalid new_owner account ID"),
                        )?;
                        if !GroupStorage::is_member(platform, group_id, &new_owner_account) {
                            return Err(invalid_input!("New owner must be a member of the group"));
                        }
                        if GroupStorage::is_blacklisted(platform, group_id, &new_owner_account) {
                            return Err(invalid_input!("Cannot transfer ownership to blacklisted member"));
                        }
                    }
                    GroupUpdateType::RemoveMember | GroupUpdateType::Ban | GroupUpdateType::Unban => {
                        let target_str = changes.get("target_user")
                            .and_then(|v| v.as_str())
                            .ok_or_else(|| invalid_input!("target_user is required"))?;
                        crate::validation::parse_account_id_str(
                            target_str,
                            invalid_input!("Invalid target_user account ID"),
                        )?;
                    }
                }
            }
            Self::PermissionChange { target_user, level, .. } => {
                if !GroupStorage::is_member(platform, group_id, target_user) {
                    return Err(invalid_input!("Target user must be a member"));
                }
                if !kv_permissions::types::is_valid_permission_level(*level, true) {
                    return Err(invalid_input!("Invalid permission level"));
                }
                if let Some(member_data) = GroupStorage::get_member_data(platform, group_id, target_user) {
                    let current_level = member_data.get("level").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                    if current_level == *level {
                        return Err(invalid_input!("Target user already has this permission level"));
                    }
                }
            }
            Self::PathPermissionGrant { path, level, .. } => {
                if !crate::validation::is_safe_path(path) {
                    return Err(invalid_input!("Invalid group path format"));
                }
                let normalized = kv_permissions::types::normalize_group_path_owned(path)
                    .ok_or_else(|| invalid_input!("Invalid group path format"))?;
                if !normalized.starts_with(&format!("groups/{}", group_id)) {
                    return Err(invalid_input!("Path must be within this group"));
                }
                if !kv_permissions::types::is_valid_permission_level(*level, false) {
                    return Err(invalid_input!("Invalid permission level"));
                }
            }
            Self::PathPermissionRevoke { path, .. } => {
                if !crate::validation::is_safe_path(path) {
                    return Err(invalid_input!("Invalid group path format"));
                }
                let normalized = kv_permissions::types::normalize_group_path_owned(path)
                    .ok_or_else(|| invalid_input!("Invalid group path format"))?;
                if !normalized.starts_with(&format!("groups/{}", group_id)) {
                    return Err(invalid_input!("Path must be within this group"));
                }
            }
            Self::MemberInvite { target_user, .. } => {
                if GroupStorage::is_member(platform, group_id, target_user) {
                    return Err(invalid_input!("User is already a member"));
                }
                if GroupStorage::is_blacklisted(platform, group_id, target_user) {
                    return Err(invalid_input!("Target user is blacklisted"));
                }
            }
            Self::JoinRequest { .. } => {}
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
                    if *quorum_bps < crate::constants::MIN_VOTING_PARTICIPATION_QUORUM_BPS
                        || *quorum_bps > BPS_DENOMINATOR
                    {
                        return Err(invalid_input!(
                            "Participation quorum bps must be between 100 and 10000"
                        ));
                    }
                }

                if let Some(threshold_bps) = majority_threshold_bps {
                    if *threshold_bps < crate::constants::MIN_VOTING_MAJORITY_THRESHOLD_BPS
                        || *threshold_bps > BPS_DENOMINATOR
                    {
                        return Err(invalid_input!(
                            "Majority threshold bps must be between 5001 and 10000"
                        ));
                    }
                }


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
