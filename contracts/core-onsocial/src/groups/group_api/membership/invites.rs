use near_sdk::AccountId;

use crate::SocialError;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    /// Add a member to a group.
    pub fn add_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        level: u8,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::groups::routing::route_group_operation(
            self,
            &group_id,
            |platform| {
                let proposal_type = crate::groups::ProposalType::MemberInvite {
                    target_user: member_id.clone(),
                    level,
                    message: Some("Community member invitation".to_string()),
                };

                crate::groups::governance::GroupGovernance::create_proposal(
                    platform,
                    &group_id,
                    caller,
                    proposal_type,
                    None,
                )?;
                Ok(())
            },
            |platform| {
                crate::groups::core::GroupStorage::add_member(
                    platform,
                    &group_id,
                    &member_id,
                    caller,
                    level,
                )
            },
        )
    }
}
