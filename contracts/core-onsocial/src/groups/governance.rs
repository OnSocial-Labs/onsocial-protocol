// --- Governance Module ---
// Clean governance system for member-driven groups using GroupStorage

use near_sdk::{AccountId, env, serde_json::{self, json}};
use crate::events::{EventBatch, EventBuilder, EventConfig};
use crate::state::models::SocialPlatform;
use crate::groups::GroupStorage;
use crate::groups::permission_types::{ProposalType, VoteTally};
use crate::constants::*;
use crate::{invalid_input, permission_denied, SocialError};

/// Clean governance system using KV operations
pub struct GroupGovernance;

impl GroupGovernance {
    /// Get voting configuration from group config or use defaults
    fn get_voting_config(platform: &SocialPlatform, group_id: &str) -> (f64, f64, u64) {
        let config_key = format!("groups/{}/config", group_id);
        if let Some(config) = platform.storage_get(&config_key) {
            if let Some(voting_config) = config.get("voting_config") {
                let participation_quorum = voting_config.get("participation_quorum")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(VOTING_PARTICIPATION_QUORUM);
                let majority_threshold = voting_config.get("majority_threshold")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(VOTING_MAJORITY_THRESHOLD);
                let voting_period = voting_config.get("voting_period")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(DEFAULT_VOTING_PERIOD);
                return (participation_quorum, majority_threshold, voting_period);
            }
        }
        // Return defaults if no custom config found
        (VOTING_PARTICIPATION_QUORUM, VOTING_MAJORITY_THRESHOLD, DEFAULT_VOTING_PERIOD)
    }

    /// Create a new proposal (gas-optimized)
    pub fn create_proposal(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposer: &AccountId,
        proposal_type: ProposalType,
        event_config: &Option<EventConfig>,
    ) -> Result<String, SocialError> {
        // Validate proposal (includes membership check)
        proposal_type.validate(platform, group_id, proposer)?;

        // Get member count for quorum (1 storage read)
        let member_count = Self::get_member_count(platform, group_id);

        // Create proposal ID (single timestamp call)
        let proposal_id = format!("{}_{}", env::block_timestamp(), proposer);

        // Pre-compute storage keys
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
        let tally_path = format!("groups/{}/votes/{}", group_id, proposal_id);

        // Create proposal data (single JSON creation)
        let proposal_data = json!({
            "id": proposal_id.clone(),
            "type": proposal_type.name(),
            "proposer": proposer,
            "target": proposal_type.target(),
            "data": proposal_type,
            "created_at": env::block_timestamp(),
            "status": "active"
        });

        // Create initial vote tally
        let tally = VoteTally::new(member_count);

        // Batch storage writes (2 writes total)
        platform.storage_set(&proposal_path, &proposal_data)?;
        platform.storage_set(&tally_path, &json!(tally))?;

        // Record proposer's YES vote automatically
        let proposer_vote_path = format!("groups/{}/votes/{}/{}", group_id, proposal_id, proposer);
        let proposer_vote_data = json!({
            "voter": proposer,
            "approve": true,
            "timestamp": env::block_timestamp()
        });
        platform.storage_set(&proposer_vote_path, &proposer_vote_data)?;

        // Update tally with proposer's vote
        let mut updated_tally = tally;
        updated_tally.record_vote(true, None); // Proposer votes YES
        platform.storage_set(&tally_path, &json!(updated_tally))?;

        // Get voting configuration and check if proposal should execute immediately
        let (participation_quorum, majority_threshold, _voting_period) = Self::get_voting_config(platform, group_id);
        let should_execute = updated_tally.meets_thresholds(participation_quorum, majority_threshold);

        if should_execute {
            // Execute proposal immediately (e.g., single-member groups)
            proposal_type.execute(platform, group_id, &proposal_id, proposer, event_config)?;
            Self::update_proposal_status(platform, group_id, &proposal_id, "executed", event_config)?;
        }

        // Conditional event emission
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "proposal_created", proposer.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", &*proposal_id)
                .with_field("proposal_type", proposal_data["type"].as_str().unwrap_or(""))
                .emit(&mut event_batch);
            // Also emit the proposer's vote
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "vote_cast", proposer.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", &*proposal_id)
                .with_field("approve", true)
                .with_field("total_votes", updated_tally.total_votes)
                .with_field("yes_votes", updated_tally.yes_votes)
                .with_field("should_execute", should_execute)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(proposal_id)
    }

    /// Cast a vote on a proposal (gas-optimized)
    pub fn vote_on_proposal(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        voter: &AccountId,
        approve: bool,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Pre-compute all storage keys to avoid repeated string formatting
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
        let tally_path = format!("groups/{}/votes/{}", group_id, proposal_id);
        let vote_path = format!("groups/{}/votes/{}/{}", group_id, proposal_id, voter);
        let member_path = format!("groups/{}/members/{}", group_id, voter);

        // Batch read all required data (3 storage reads total)
        let proposal_data = platform.storage_get(&proposal_path)
            .ok_or_else(|| invalid_input!("Proposal not found"))?;

        let mut tally: VoteTally = platform.storage_get(&tally_path)
            .and_then(|v| serde_json::from_value(v).ok())
            .ok_or_else(|| invalid_input!("Vote tally not found"))?;

        // Single membership/ownership check (1 storage read for membership, 1 for ownership if needed)
        let member_entry = platform.get_entry(&member_path);
        let (is_member, member_info) = if let Some(entry) = &member_entry {
            // Check if member entry exists and is not soft deleted
            let is_active = matches!(entry.value, crate::state::models::DataValue::Value(_));
            let info = if is_active {
                if let crate::state::models::DataValue::Value(data) = &entry.value {
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
            return Err(permission_denied!("vote", &format!("groups/{}/proposals/{}", group_id, proposal_id)));
        }

        // Security check: Verify voter was a member when proposal was created
        // This prevents vote manipulation by adding friendly voters mid-voting
        // Owner is exempt as they exist from group creation
        if !is_owner {
            if let Some(ref member_info) = member_info {
                let joined_at = member_info.get("joined_at")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                
                if joined_at > tally.created_at {
                    return Err(invalid_input!("Cannot vote on proposals created before you joined the group"));
                }
            }
        }

        // Validate proposal state
        let status = proposal_data.get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        if status != "active" {
            return Err(invalid_input!("Proposal is not active"));
        }

        // Get voting configuration for this group
        let (participation_quorum, majority_threshold, voting_period) = Self::get_voting_config(platform, group_id);

        // Check expiration
        if tally.is_expired(voting_period) {
            return Err(invalid_input!("Voting period has expired"));
        }

        // Check for existing vote (1 storage read)
        let previous_vote = platform.storage_get(&vote_path)
            .as_ref()
            .and_then(|v| v.get("approve"))
            .and_then(|v| v.as_bool());

        // Prevent vote changes
        if previous_vote.is_some() {
            return Err(invalid_input!("You have already voted on this proposal. Vote changes are not allowed."));
        }

        // Record vote (in-memory operation)
        tally.record_vote(approve, previous_vote);

        // Batch storage writes (2 writes total)
        let vote_data = json!({
            "voter": voter,
            "approve": approve,
            "timestamp": env::block_timestamp()
        });

        platform.storage_set(&vote_path, &vote_data)?;
        platform.storage_set(&tally_path, &json!(tally))?;

        // Check execution threshold (in-memory)
        let should_execute = tally.meets_thresholds(participation_quorum, majority_threshold);
        let should_reject = tally.is_defeat_inevitable(participation_quorum, majority_threshold);

        if should_execute {
            // Check if proposal is still active before executing (prevent double execution)
            let current_status = proposal_data.get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            if current_status == "active" {
                // Execute proposal (additional operations only when needed)
                if let Some(proposal_type_val) = proposal_data.get("data") {
                    if let Ok(proposal_type) = serde_json::from_value::<ProposalType>(proposal_type_val.clone()) {
                        proposal_type.execute(platform, group_id, proposal_id, voter, event_config)?;
                        Self::update_proposal_status(platform, group_id, proposal_id, "executed", event_config)?;
                    }
                }
            }
        } else if should_reject {
            // Early rejection: defeat is mathematically inevitable
            let current_status = proposal_data.get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            if current_status == "active" {
                // Mark proposal as rejected
                Self::update_proposal_status(platform, group_id, proposal_id, "rejected", event_config)?;
            }
        }

        // Conditional event emission (only when events are enabled)
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "vote_cast", voter.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", proposal_id)
                .with_field("approve", approve)
                .with_field("total_votes", tally.total_votes)
                .with_field("yes_votes", tally.yes_votes)
                .with_field("should_execute", should_execute)
                .with_field("should_reject", should_reject)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Get member count for a group
    fn get_member_count(platform: &SocialPlatform, group_id: &str) -> u64 {
        // Get actual member count from group stats
        if let Some(stats) = GroupStorage::get_group_stats(platform, group_id) {
            if let Some(total_members) = stats.get("total_members").and_then(|v| v.as_u64()) {
                return total_members;
            }
        }
        // Fallback to 0 if stats not found (shouldn't happen for active groups)
        0
    }

    /// Update proposal status
    fn update_proposal_status(platform: &mut SocialPlatform, group_id: &str, proposal_id: &str, status: &str, event_config: &Option<EventConfig>) -> Result<(), SocialError> {
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);

        if let Some(mut proposal_data) = platform.storage_get(&proposal_path) {
            if let Some(obj) = proposal_data.as_object_mut() {
                obj.insert("status".to_string(), json!(status));
                obj.insert("updated_at".to_string(), json!(env::block_timestamp()));
            }
            platform.storage_set(&proposal_path, &proposal_data)?;

            // Emit event for proposal status change
            if event_config.as_ref().is_none_or(|c| c.emit) {
                let mut event_batch = EventBatch::new();
                EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "proposal_status_updated", env::predecessor_account_id())
                    .with_field("group_id", group_id)
                    .with_field("proposal_id", proposal_id)
                    .with_field("status", status)
                    .emit(&mut event_batch);
                event_batch.emit(event_config)?;
            }
        }

        Ok(())
    }
}