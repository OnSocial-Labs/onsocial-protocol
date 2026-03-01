use near_sdk::{
    AccountId,
    serde_json::{Value, json},
};

use crate::state::models::SocialPlatform;
use crate::{SocialError, invalid_input};

impl SocialPlatform {
    pub fn create_group(
        &mut self,
        group_id: String,
        config: Value,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;

        if !config.is_object() {
            return Err(invalid_input!("Config must be a JSON object"));
        }

        crate::domain::groups::core::GroupStorage::create_group(self, &group_id, caller, config)
    }

    pub fn remove_group_member(
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
                let proposal_type = crate::domain::groups::ProposalType::GroupUpdate {
                    update_type: "remove_member".to_string(),
                    changes: json!({
                        "target_user": member_id,
                        "action": "remove_member"
                    }),
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
                crate::domain::groups::core::GroupStorage::remove_member(
                    platform, &group_id, &member_id, caller,
                )
            },
        )
    }

    pub fn blacklist_group_member(
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
                let proposal_type = crate::domain::groups::ProposalType::GroupUpdate {
                    update_type: "ban".to_string(),
                    changes: json!({
                        "target_user": member_id,
                        "action": "ban"
                    }),
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
                crate::domain::groups::core::GroupStorage::add_to_blacklist(
                    platform, &group_id, &member_id, caller,
                )
            },
        )
    }

    pub fn unblacklist_group_member(
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
                let proposal_type = crate::domain::groups::ProposalType::GroupUpdate {
                    update_type: "unban".to_string(),
                    changes: json!({
                        "target_user": member_id,
                        "action": "unban"
                    }),
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
                crate::domain::groups::core::GroupStorage::remove_from_blacklist(
                    platform, &group_id, &member_id, caller,
                )
            },
        )
    }

    pub fn transfer_group_ownership(
        &mut self,
        group_id: String,
        new_owner: AccountId,
        remove_old_owner: Option<bool>,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::routing::route_group_operation(
            self,
            &group_id,
            |platform| {
                let proposal_type = crate::domain::groups::ProposalType::GroupUpdate {
                    update_type: "transfer_ownership".to_string(),
                    changes: json!({
                        "new_owner": new_owner,
                        "remove_old_owner": remove_old_owner.unwrap_or(true),
                        "action": "transfer_ownership"
                    }),
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
                crate::domain::groups::core::GroupStorage::transfer_ownership_with_removal(
                    platform,
                    &group_id,
                    &new_owner,
                    remove_old_owner,
                    caller,
                )
            },
        )
    }
}
