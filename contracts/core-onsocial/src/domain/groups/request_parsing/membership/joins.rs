use near_sdk::AccountId;

use crate::SocialError;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    /// Join a group.
    ///
    /// Clean join semantics: joining never grants a global role. All joins start as
    /// member-only (`NONE`), while the contract grants default channel access separately.
    /// Additional roles/permissions must be granted explicitly after joining.
    pub fn join_group(&mut self, group_id: String, caller: &AccountId) -> Result<(), SocialError> {
        let requested_permissions = crate::domain::groups::permissions::kv::types::NONE;

        crate::domain::groups::routing::route_group_operation(
            self,
            &group_id,
            |platform| {
                let proposal_type = crate::domain::groups::ProposalType::JoinRequest {
                    requester: caller.clone(),
                    requested_permissions,
                    message: Some("Join request submitted for community approval".to_string()),
                };

                crate::domain::groups::governance::GroupGovernance::create_proposal(
                    platform,
                    &group_id,
                    caller,
                    proposal_type,
                    None,
                )?;
                Ok(())
            },
            |platform| {
                crate::domain::groups::core::GroupStorage::join_group_traditional(
                    platform,
                    &group_id,
                    caller,
                )
            },
        )
    }

    /// Leave a group (removes caller from group)
    pub fn leave_group(&mut self, group_id: String, caller: &AccountId) -> Result<(), SocialError> {
        crate::domain::groups::core::GroupStorage::remove_member(self, &group_id, caller, caller)
    }

    /// Approve a join request.
    pub fn approve_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        level: u8,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::domain::groups::core::GroupStorage::approve_join_request(
            self,
            &group_id,
            &requester_id,
            caller,
            level,
        )
    }

    /// Reject a join request.
    pub fn reject_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        caller: &AccountId,
        reason: Option<String>,
    ) -> Result<(), SocialError> {
        crate::domain::groups::core::GroupStorage::reject_join_request(
            self,
            &group_id,
            &requester_id,
            caller,
            reason.as_deref(),
        )
    }

    /// Cancel your own join request.
    pub fn cancel_join_request(
        &mut self,
        group_id: String,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::domain::groups::core::GroupStorage::cancel_join_request(self, &group_id, caller)
    }
}
