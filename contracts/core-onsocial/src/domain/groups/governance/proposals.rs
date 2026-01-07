use near_sdk::{env, AccountId, serde_json::json};

use crate::domain::groups::GroupStorage;
use crate::domain::groups::proposal_types::{ProposalType, VoteTally};
use crate::state::models::SocialPlatform;
use crate::{invalid_input, permission_denied, SocialError};

use super::events;
use super::status::ProposalStatus;

pub struct GroupGovernance;

impl GroupGovernance {
    /// Creates a proposal; proposer auto-votes YES if eligible.
    pub fn create_proposal(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposer: &AccountId,
        proposal_type: ProposalType,
        auto_vote: Option<bool>,
    ) -> Result<String, SocialError> {
        proposal_type.validate(platform, group_id, proposer)?;

        let locked_amount = crate::constants::PROPOSAL_EXECUTION_LOCK;
        platform.lock_storage_balance(proposer, locked_amount)?;

        let proposer_can_vote = GroupStorage::is_member(platform, group_id, proposer)
            || GroupStorage::is_owner(platform, group_id, proposer);
        let should_auto_vote = auto_vote.unwrap_or(true) && proposer_can_vote;
        let member_count = Self::get_member_count(platform, group_id)?;
        let (sequence_number, counter_path) = Self::get_and_increment_proposal_counter(platform, group_id)?;

        let seed = env::random_seed();
        let nonce = u32::from_le_bytes([seed[0], seed[1], seed[2], seed[3]]);
        let proposal_id = format!(
            "{}_{}_{}_{}_{}",
            group_id,
            sequence_number,
            env::block_height(),
            proposer,
            nonce
        );

        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
        let tally_path = format!("groups/{}/votes/{}", group_id, proposal_id);

        let voting_config = Self::get_voting_config(platform, group_id);

        let proposal_data = json!({
            "id": proposal_id.clone(),
            "sequence_number": sequence_number,
            "type": proposal_type.name(),
            "proposer": proposer,
            "target": proposal_type.target(proposer),
            "data": proposal_type,
            "created_at": env::block_timestamp().to_string(),
            "status": ProposalStatus::Active.as_str(),
            "voting_config": voting_config,
            "locked_deposit": locked_amount.to_string()
        });

        let mut tally = VoteTally::new(member_count);

        let mut auto_vote_data: Option<(String, near_sdk::serde_json::Value)> = None;

        if should_auto_vote {
            tally.record_vote(true, None);
            let proposer_vote_path =
                format!("groups/{}/votes/{}/{}", group_id, proposal_id, proposer);
            let proposer_vote_data = json!({
                "voter": proposer,
                "approve": true,
                "timestamp": env::block_timestamp().to_string()
            });

            platform.storage_set(&proposer_vote_path, &proposer_vote_data)?;
            auto_vote_data = Some((proposer_vote_path, proposer_vote_data));
        }

        platform.storage_set(&proposal_path, &proposal_data)?;
        let tally_value = json!(tally);
        platform.storage_set(&tally_path, &tally_value)?;

        let should_execute =
            tally.meets_thresholds(voting_config.participation_quorum_bps, voting_config.majority_threshold_bps);

        if should_execute {
            // Charge execution storage costs to proposer
            platform.set_execution_payer(proposer.clone());
            let exec_result = proposal_type.execute(platform, group_id, &proposal_id, proposer);
            platform.clear_execution_payer();
            exec_result?;

            Self::update_proposal_status(
                platform,
                group_id,
                &proposal_id,
                ProposalStatus::Executed,
            )?;
        }

        let created_at: u64 = proposal_data
            .get("created_at")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        events::emit_proposal_created(
            proposer,
            group_id,
            &proposal_id,
            sequence_number,
            proposal_data["type"].as_str().unwrap_or(""),
            proposal_data["target"].as_str().unwrap_or(""),
            should_auto_vote,
            created_at,
            voting_config.voting_period.0,
            member_count,
            voting_config.participation_quorum_bps,
            voting_config.majority_threshold_bps,
            locked_amount,
            proposal_data.clone(),
            &proposal_path,
            &tally_path,
            tally_value.clone(),
            &counter_path,
            sequence_number,
        )?;

        if let Some((vote_path, vote_value)) = auto_vote_data {
            events::emit_vote_cast(
                proposer,
                group_id,
                &proposal_id,
                true,
                &tally,
                should_execute,
                false,
                &vote_path,
                vote_value,
                &tally_path,
                tally_value,
            )?;
        }

        Ok(proposal_id)
    }

    /// Cancels a proposal. Only the proposer can cancel if no other votes exist.
    pub fn cancel_proposal(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
        let tally_path = format!("groups/{}/votes/{}", group_id, proposal_id);

        let proposal_data = platform
            .storage_get(&proposal_path)
            .ok_or_else(|| invalid_input!("Proposal not found"))?;

        let proposer = proposal_data
            .get("proposer")
            .and_then(|v| v.as_str())
            .ok_or_else(|| invalid_input!("Proposal missing proposer"))?;

        if proposer != caller.as_str() {
            return Err(permission_denied!(
                "cancel_proposal",
                "Only the proposer can cancel their proposal"
            ));
        }

        let status = ProposalStatus::from_json_status(
            proposal_data.get("status").and_then(|v| v.as_str()),
        )?;

        if status != ProposalStatus::Active {
            return Err(invalid_input!("Only active proposals can be cancelled"));
        }

        // Cancel allowed only if no votes besides proposer's auto-vote
        let tally_data = platform.storage_get(&tally_path);
        if let Some(tally_val) = tally_data {
            let total_votes = tally_val
                .get("total_votes")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            if total_votes > 1 {
                return Err(invalid_input!(
                    "Cannot cancel: other members have already voted"
                ));
            }
            if total_votes == 1 {
                let proposer_vote_path =
                    format!("groups/{}/votes/{}/{}", group_id, proposal_id, caller);
                if platform.storage_get(&proposer_vote_path).is_none() {
                    return Err(invalid_input!(
                        "Cannot cancel: another member has already voted"
                    ));
                }
            }
        }

        Self::update_proposal_status(
            platform,
            group_id,
            proposal_id,
            ProposalStatus::Cancelled,
        )?;

        Ok(())
    }

    fn get_member_count(platform: &SocialPlatform, group_id: &str) -> Result<u64, SocialError> {
        let stats = GroupStorage::get_group_stats(platform, group_id)
            .ok_or_else(|| invalid_input!("Group stats not found"))?;

        stats
            .get("total_members")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| invalid_input!("Member count not found in group stats"))
    }

    fn get_and_increment_proposal_counter(
        platform: &mut SocialPlatform,
        group_id: &str,
    ) -> Result<(u64, String), SocialError> {
        let counter_path = format!("groups/{}/proposal_counter", group_id);
        let current_counter = platform
            .storage_get(&counter_path)
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        let next_counter = current_counter.saturating_add(1);
        platform.storage_set(&counter_path, &json!(next_counter))?;

        Ok((next_counter, counter_path))
    }

    pub(super) fn update_proposal_status(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        status: ProposalStatus,
    ) -> Result<(), SocialError> {
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);

        let mut proposal_data = platform
            .storage_get(&proposal_path)
            .ok_or_else(|| invalid_input!("Proposal not found"))?;

        let proposer = proposal_data
            .get("proposer")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<AccountId>().ok());
        
        let locked_amount = proposal_data
            .get("locked_deposit")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<u128>().ok())
            .unwrap_or(crate::constants::PROPOSAL_EXECUTION_LOCK);

        // Unlock deposit on terminal state
        let unlocked_deposit = if status != ProposalStatus::Active {
            if let Some(ref proposer_id) = proposer {
                platform.unlock_storage_balance(proposer_id, locked_amount);
            }
            locked_amount
        } else {
            0
        };

        if let Some(obj) = proposal_data.as_object_mut() {
            obj.insert("status".to_string(), json!(status.as_str()));
            obj.insert(
                "updated_at".to_string(),
                json!(env::block_timestamp().to_string()),
            );
        }
        platform.storage_set(&proposal_path, &proposal_data)?;

        let tally_data = platform.storage_get(&format!("groups/{}/votes/{}", group_id, proposal_id));
        let (total_votes, yes_votes, locked_member_count) = if let Some(tally_val) = tally_data {
            let total = tally_val
                .get("total_votes")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let yes = tally_val
                .get("yes_votes")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let locked = tally_val
                .get("locked_member_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            (total, yes, locked)
        } else {
            (0, 0, 0)
        };

        let event_initiator = proposer.unwrap_or_else(env::predecessor_account_id);

        events::emit_proposal_status_updated(
            group_id,
            proposal_id,
            &event_initiator,
            status.as_str(),
            total_votes,
            yes_votes,
            locked_member_count,
            unlocked_deposit,
            &proposal_path,
            proposal_data.clone(),
        )?;

        Ok(())
    }
}
