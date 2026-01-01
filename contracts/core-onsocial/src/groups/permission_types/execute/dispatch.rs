use near_sdk::AccountId;

use crate::state::models::SocialPlatform;
use crate::SocialError;

use super::helpers::{ExecutionContext, PathPermissionGrantData};
use super::super::types::ProposalType;

impl ProposalType {
    pub fn execute(
        &self,
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        executor: &AccountId,
    ) -> Result<(), SocialError> {
        match self {
            Self::GroupUpdate { update_type, changes } => Self::execute_group_update(
                platform,
                group_id,
                proposal_id,
                update_type,
                changes,
                executor,
            ),
            Self::PermissionChange { target_user, level, reason } => Self::execute_permission_change(
                platform,
                group_id,
                proposal_id,
                target_user,
                *level,
                reason.as_deref(),
                executor,
            ),
            Self::PathPermissionGrant { target_user, path, level, reason } => {
                let ctx = ExecutionContext { platform, group_id, executor };
                let data = PathPermissionGrantData { target_user, path, level: *level, reason };
                Self::execute_path_permission_grant(ctx, proposal_id, data)
            }
            Self::PathPermissionRevoke { target_user, path, reason } => Self::execute_path_permission_revoke(
                platform,
                group_id,
                proposal_id,
                target_user,
                path,
                reason,
                executor,
            ),
            Self::MemberInvite { target_user, message, .. } => Self::execute_member_invite(
                platform,
                group_id,
                proposal_id,
                target_user,
                message.as_deref(),
                executor,
            ),
            Self::VotingConfigChange { participation_quorum_bps, majority_threshold_bps, voting_period } => {
                Self::execute_voting_config_change(
                    platform,
                    group_id,
                    proposal_id,
                    *participation_quorum_bps,
                    *majority_threshold_bps,
                    *voting_period,
                    executor,
                )
            }
            Self::JoinRequest { requester, message, .. } => Self::execute_join_request(
                platform,
                group_id,
                proposal_id,
                requester,
                message.as_deref(),
                executor,
            ),
            Self::CustomProposal { title, description, custom_data } => Self::execute_custom_proposal(
                platform,
                group_id,
                proposal_id,
                title,
                description,
                custom_data,
                executor,
            ),
        }
    }
}
