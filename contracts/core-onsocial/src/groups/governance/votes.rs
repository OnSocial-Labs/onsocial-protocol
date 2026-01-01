use near_sdk::{env, AccountId, serde_json::{self, json}};

use crate::groups::GroupStorage;
use crate::groups::permission_types::{ProposalType, VoteTally};
use crate::state::models::{DataValue, SocialPlatform};
use crate::{invalid_input, permission_denied, SocialError};

use super::events;
use super::proposals::GroupGovernance;
use super::status::ProposalStatus;

impl GroupGovernance {
    pub fn vote_on_proposal(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        voter: &AccountId,
        approve: bool,
    ) -> Result<(), SocialError> {
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
        let tally_path = format!("groups/{}/votes/{}", group_id, proposal_id);
        let vote_path = format!("groups/{}/votes/{}/{}", group_id, proposal_id, voter);
        let member_path = format!("groups/{}/members/{}", group_id, voter);

        let proposal_data = platform
            .storage_get(&proposal_path)
            .ok_or_else(|| invalid_input!("Proposal not found"))?;

        let mut tally: VoteTally = platform
            .storage_get(&tally_path)
            .and_then(|v| serde_json::from_value(v).ok())
            .ok_or_else(|| invalid_input!("Vote tally not found"))?;

        let member_entry = platform.get_entry(&member_path);
        let (is_member, member_info) = if let Some(entry) = &member_entry {
            let is_active = matches!(entry.value, DataValue::Value(_));
            let info = if is_active {
                if let DataValue::Value(data) = &entry.value {
                    serde_json::from_slice::<serde_json::Value>(data).ok()
                } else {
                    None
                }
            } else {
                None
            };
            (is_active, info)
        } else {
            (false, None)
        };
        let is_owner = GroupStorage::is_owner(platform, group_id, voter);
        if !is_member && !is_owner {
            return Err(permission_denied!(
                "vote",
                &format!("groups/{}/proposals/{}", group_id, proposal_id)
            ));
        }

        // Blacklisted users cannot vote.
        if GroupStorage::is_blacklisted(platform, group_id, voter) {
            return Err(permission_denied!(
                "vote",
                "Blacklisted members cannot vote on proposals"
            ));
        }

        // Voter must have been a member when the proposal was created.
        if !is_owner {
            if let Some(ref member_info) = member_info {
                let joined_at = member_info
                    .get("joined_at")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                if joined_at > tally.created_at.0 {
                    return Err(invalid_input!(
                        "Cannot vote: you joined the group after this proposal was created"
                    ));
                }
            }
        }

        let status = ProposalStatus::from_json_status(
            proposal_data.get("status").and_then(|v| v.as_str()),
        )?;

        if status != ProposalStatus::Active {
            return Err(invalid_input!("Proposal is not active"));
        }

        let previous_vote = platform
            .storage_get(&vote_path)
            .as_ref()
            .and_then(|v| v.get("approve"))
            .and_then(|v| v.as_bool());

        if previous_vote.is_some() {
            return Err(invalid_input!(
                "You have already voted on this proposal. Vote changes are not allowed."
            ));
        }

        // Use voting config stored with the proposal (prevents retroactive config changes).
        let voting_config = proposal_data
            .get("voting_config")
            .ok_or_else(|| invalid_input!("Proposal missing voting_config"))?;
        let participation_quorum_bps = voting_config
            .get("participation_quorum_bps")
            .and_then(Self::parse_u16_any)
            .ok_or_else(|| invalid_input!("Invalid participation_quorum_bps"))?;
        let majority_threshold_bps = voting_config
            .get("majority_threshold_bps")
            .and_then(Self::parse_u16_any)
            .ok_or_else(|| invalid_input!("Invalid majority_threshold_bps"))?;
        let voting_period = voting_config
            .get("voting_period")
            .and_then(Self::parse_u64_any)
            .ok_or_else(|| invalid_input!("Invalid voting_period"))?;

        if tally.is_expired(voting_period) {
            return Err(invalid_input!("Voting period has expired"));
        }

        tally.record_vote(approve, previous_vote);

        let vote_data = json!({
            "voter": voter,
            "approve": approve,
            "timestamp": env::block_timestamp().to_string()
        });

        platform.storage_set(&vote_path, &vote_data)?;
        let tally_value = json!(tally);
        platform.storage_set(&tally_path, &tally_value)?;

        let should_execute =
            tally.meets_thresholds(participation_quorum_bps, majority_threshold_bps);
        let should_reject =
            tally.is_defeat_inevitable(participation_quorum_bps, majority_threshold_bps);

        if should_execute {
            if let Some(proposal_type_val) = proposal_data.get("data") {
                let proposal_type = serde_json::from_value::<ProposalType>(proposal_type_val.clone())
                    .map_err(|_| invalid_input!("Failed to parse proposal type"))?;

                proposal_type.execute(platform, group_id, proposal_id, voter)?;
                Self::update_proposal_status(
                    platform,
                    group_id,
                    proposal_id,
                    ProposalStatus::Executed,
                )?;
            }
        } else if should_reject {
            Self::update_proposal_status(
                platform,
                group_id,
                proposal_id,
                ProposalStatus::Rejected,
            )?;
        }

        events::emit_vote_cast(
            voter,
            group_id,
            proposal_id,
            approve,
            &tally,
            should_execute,
            should_reject,
            &vote_path,
            vote_data,
            &tally_path,
            tally_value,
        )?;

        Ok(())
    }
}
