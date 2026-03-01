use near_sdk::AccountId;
use near_sdk::serde_json::{Value, json};

use crate::SocialError;
use crate::protocol::Action;
use crate::state::execute::ExecuteContext;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    /// Dispatch action to appropriate handler.
    ///
    /// Returns raw values matching the action's natural return type:
    /// - Void operations return `null`
    /// - CreateGroup returns the group_id string
    /// - CreateProposal returns the proposal_id string
    pub(super) fn dispatch_action(
        &mut self,
        action: &Action,
        target_account: &AccountId,
        ctx: &mut ExecuteContext,
    ) -> Result<Value, SocialError> {
        match action {
            Action::Set { data } => {
                self.execute_action_set(target_account, data.clone(), ctx)?;
                Ok(Value::Null)
            }

            Action::CreateGroup { group_id, config } => {
                self.execute_action_create_group(group_id, config.clone(), ctx)?;
                Ok(json!(group_id))
            }

            Action::JoinGroup { group_id } => {
                self.execute_action_join_group(group_id, ctx)?;
                Ok(Value::Null)
            }

            Action::LeaveGroup { group_id } => {
                self.execute_action_leave_group(group_id, ctx)?;
                Ok(Value::Null)
            }

            Action::AddGroupMember {
                group_id,
                member_id,
            } => {
                self.execute_action_add_member(group_id, member_id, ctx)?;
                Ok(Value::Null)
            }

            Action::RemoveGroupMember {
                group_id,
                member_id,
            } => {
                self.execute_action_remove_member(group_id, member_id, ctx)?;
                Ok(Value::Null)
            }

            Action::ApproveJoinRequest {
                group_id,
                requester_id,
            } => {
                self.execute_action_approve_join(group_id, requester_id, ctx)?;
                Ok(Value::Null)
            }

            Action::RejectJoinRequest {
                group_id,
                requester_id,
                reason,
            } => {
                self.execute_action_reject_join(group_id, requester_id, reason.as_deref(), ctx)?;
                Ok(Value::Null)
            }

            Action::CancelJoinRequest { group_id } => {
                self.execute_action_cancel_join(group_id, ctx)?;
                Ok(Value::Null)
            }

            Action::BlacklistGroupMember {
                group_id,
                member_id,
            } => {
                self.execute_action_blacklist(group_id, member_id, ctx)?;
                Ok(Value::Null)
            }

            Action::UnblacklistGroupMember {
                group_id,
                member_id,
            } => {
                self.execute_action_unblacklist(group_id, member_id, ctx)?;
                Ok(Value::Null)
            }

            Action::TransferGroupOwnership {
                group_id,
                new_owner,
                remove_old_owner,
            } => {
                self.execute_action_transfer_ownership(
                    group_id,
                    new_owner,
                    *remove_old_owner,
                    ctx,
                )?;
                Ok(Value::Null)
            }

            Action::SetGroupPrivacy {
                group_id,
                is_private,
            } => {
                self.execute_action_set_privacy(group_id, *is_private, ctx)?;
                Ok(Value::Null)
            }

            Action::CreateProposal {
                group_id,
                proposal_type,
                changes,
                auto_vote,
                description,
            } => {
                let proposal_id = self.execute_action_create_proposal(
                    group_id,
                    proposal_type,
                    changes.clone(),
                    *auto_vote,
                    description.clone(),
                    ctx,
                )?;
                Ok(json!(proposal_id))
            }

            Action::VoteOnProposal {
                group_id,
                proposal_id,
                approve,
            } => {
                self.execute_action_vote(group_id, proposal_id, *approve, ctx)?;
                Ok(Value::Null)
            }

            Action::CancelProposal {
                group_id,
                proposal_id,
            } => {
                self.execute_action_cancel_proposal(group_id, proposal_id, ctx)?;
                Ok(Value::Null)
            }

            Action::SetPermission {
                grantee,
                path,
                level,
                expires_at,
            } => {
                self.execute_action_set_permission(grantee, path, *level, *expires_at, ctx)?;
                Ok(Value::Null)
            }

            Action::SetKeyPermission {
                public_key,
                path,
                level,
                expires_at,
            } => {
                self.execute_action_set_key_permission(public_key, path, *level, *expires_at, ctx)?;
                Ok(Value::Null)
            }
        }
    }
}
