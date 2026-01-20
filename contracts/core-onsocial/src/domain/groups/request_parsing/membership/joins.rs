use near_sdk::AccountId;

use crate::SocialError;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    /// New members join with permission level `NONE`; elevated roles must be granted separately.
    pub fn join_group(&mut self, group_id: String, caller: &AccountId) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::routing::route_group_operation(
            self,
            &group_id,
            |platform| {
                let proposal_type = crate::domain::groups::ProposalType::JoinRequest {
                    requester: caller.clone(),
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
                    platform, &group_id, caller,
                )
            },
        )
    }

    /// Self-exit is always permitted, even in member-driven groups.
    pub fn leave_group(&mut self, group_id: String, caller: &AccountId) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::core::GroupStorage::remove_member(self, &group_id, caller, caller)
    }

    /// Approved members join with level `NONE`.
    pub fn approve_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::core::GroupStorage::approve_join_request(
            self,
            &group_id,
            &requester_id,
            caller,
        )
    }

    pub fn reject_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        caller: &AccountId,
        reason: Option<String>,
    ) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::core::GroupStorage::reject_join_request(
            self,
            &group_id,
            &requester_id,
            caller,
            reason.as_deref(),
        )
    }

    pub fn cancel_join_request(
        &mut self,
        group_id: String,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::core::GroupStorage::cancel_join_request(self, &group_id, caller)
    }
}
