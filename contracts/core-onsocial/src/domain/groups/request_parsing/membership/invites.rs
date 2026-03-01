use near_sdk::AccountId;

use crate::SocialError;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    /// Add a member to a group.
    /// Members always join with level=NONE (0); elevated roles must be granted after joining.
    pub fn add_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::routing::route_group_operation(
            self,
            &group_id,
            |platform| {
                let proposal_type = crate::domain::groups::ProposalType::MemberInvite {
                    target_user: member_id.clone(),
                    message: Some("Community member invitation".to_string()),
                };

                crate::domain::groups::governance::GroupGovernance::create_proposal(
                    platform,
                    &group_id,
                    caller,
                    proposal_type,
                    None,
                    None,
                )?;
                Ok(())
            },
            |platform| {
                crate::domain::groups::core::GroupStorage::add_member(
                    platform, &group_id, &member_id, caller,
                )
            },
        )
    }
}
