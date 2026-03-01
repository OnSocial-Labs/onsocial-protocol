use near_sdk::AccountId;
use near_sdk::serde_json::{Value, json};

use crate::state::models::SocialPlatform;
use crate::{SocialError, invalid_input};

use super::{membership, permissions};

impl SocialPlatform {
    pub fn create_group_proposal(
        &mut self,
        group_id: String,
        proposal_type: String,
        changes: Value,
        caller: &AccountId,
        auto_vote: Option<bool>,
        description: Option<String>,
    ) -> Result<String, SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        let proposal_type_enum = match proposal_type.as_str() {
            "group_update" => {
                let update_type = changes
                    .get("update_type")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("update_type required for group_update"))?;
                crate::domain::groups::ProposalType::GroupUpdate {
                    update_type: update_type.to_string(),
                    changes: changes.clone(),
                }
            }
            "permission_change" => permissions::parse_permission_change(&changes)?,
            "member_invite" => {
                membership::proposal_parsing::parse_member_invite_proposal(&changes)?
            }
            "join_request" => membership::proposal_parsing::parse_join_request_proposal(&changes)?,
            "path_permission_grant" => permissions::parse_path_permission_grant(&changes)?,
            "path_permission_revoke" => permissions::parse_path_permission_revoke(&changes)?,
            "voting_config_change" => {
                let parse_optional_u16_any = |key: &str| -> Result<Option<u16>, SocialError> {
                    let Some(value) = changes.get(key) else {
                        return Ok(None);
                    };
                    if value.is_null() {
                        return Ok(None);
                    }
                    if let Some(v) = value.as_u64().and_then(|v| u16::try_from(v).ok()) {
                        return Ok(Some(v));
                    }
                    if let Some(s) = value.as_str().and_then(|s| s.parse::<u16>().ok()) {
                        return Ok(Some(s));
                    }
                    Err(invalid_input!(format!("Invalid {key}")))
                };

                let participation_quorum_bps = parse_optional_u16_any("participation_quorum_bps")?;
                let majority_threshold_bps = parse_optional_u16_any("majority_threshold_bps")?;
                let voting_period = changes.get("voting_period").and_then(|v| {
                    v.as_u64()
                        .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
                });
                crate::domain::groups::ProposalType::VotingConfigChange {
                    participation_quorum_bps,
                    majority_threshold_bps,
                    voting_period,
                }
            }
            "custom_proposal" => {
                let title = changes
                    .get("title")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("title required for custom_proposal"))?;
                let description = changes
                    .get("description")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("description required for custom_proposal"))?;
                let custom_data = changes.get("custom_data").cloned().unwrap_or(json!({}));
                crate::domain::groups::ProposalType::CustomProposal {
                    title: title.to_string(),
                    description: description.to_string(),
                    custom_data,
                }
            }
            _ => return Err(invalid_input!("Unknown proposal type")),
        };

        crate::domain::groups::governance::GroupGovernance::create_proposal(
            self,
            &group_id,
            caller,
            proposal_type_enum,
            auto_vote,
            description,
        )
    }

    pub fn vote_on_proposal(
        &mut self,
        group_id: String,
        proposal_id: String,
        approve: bool,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::governance::GroupGovernance::vote_on_proposal(
            self,
            &group_id,
            &proposal_id,
            caller,
            approve,
        )
    }

    pub fn cancel_proposal(
        &mut self,
        group_id: String,
        proposal_id: String,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::governance::GroupGovernance::cancel_proposal(
            self,
            &group_id,
            &proposal_id,
            caller,
        )
    }
}
