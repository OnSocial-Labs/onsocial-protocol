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
    /// Validates that configuration values are within acceptable ranges
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
                
                // SECURITY: Validate configuration values are within acceptable ranges
                // Clamp values to prevent manipulation or invalid configurations
                let safe_quorum = participation_quorum.clamp(0.0, 1.0);
                let safe_threshold = majority_threshold.clamp(0.0, 1.0);
                let safe_period = if voting_period == 0 { DEFAULT_VOTING_PERIOD } else { voting_period };
                
                return (safe_quorum, safe_threshold, safe_period);
            }
        }
        // Return defaults if no custom config found
        (VOTING_PARTICIPATION_QUORUM, VOTING_MAJORITY_THRESHOLD, DEFAULT_VOTING_PERIOD)
    }

    /// Create a new proposal (gas-optimized)
    /// 
    /// # Arguments
    /// * `auto_vote` - Whether proposer automatically votes YES. Default is true (None = true).
    ///                 Set to Some(false) for discussion-first proposals where proposer votes later.
    pub fn create_proposal(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposer: &AccountId,
        proposal_type: ProposalType,
        event_config: &Option<EventConfig>,
        auto_vote: Option<bool>,
    ) -> Result<String, SocialError> {
        // Validate proposal (includes membership check)
        proposal_type.validate(platform, group_id, proposer)?;

        // Determine if proposer should auto-vote YES (default: true)
        let should_auto_vote = auto_vote.unwrap_or(true);

        // Get member count for quorum (1 storage read)
        let member_count = Self::get_member_count(platform, group_id)?;

        // Get sequential proposal number for UI display (#1, #2, #3, etc.)
        let sequence_number = Self::get_and_increment_proposal_counter(platform, group_id)?;

        // Create proposal ID with sequence number and nonce to prevent collision
        // Format: {group_id}_{sequence}_{block_height}_{proposer}_{nonce}
        // Sequence number makes it easy to reference as "Proposal #5"
        let seed = env::random_seed();
        let nonce = u32::from_le_bytes([seed[0], seed[1], seed[2], seed[3]]);
        let proposal_id = format!("{}_{}_{}_{}_{}", group_id, sequence_number, env::block_height(), proposer, nonce);

        // Pre-compute storage keys
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
        let tally_path = format!("groups/{}/votes/{}", group_id, proposal_id);

        // Get voting configuration and store with proposal (prevents retroactive config changes)
        let (participation_quorum, majority_threshold, voting_period) = Self::get_voting_config(platform, group_id);

        // Create proposal data (single JSON creation)
        let proposal_data = json!({
            "id": proposal_id.clone(),
            "sequence_number": sequence_number,  // For UI: "Proposal #5"
            "type": proposal_type.name(),
            "proposer": proposer,
            "target": proposal_type.target(),
            "data": proposal_type,
            "created_at": env::block_timestamp(),
            "status": "active",
            "voting_config": {
                "participation_quorum": participation_quorum,
                "majority_threshold": majority_threshold,
                "voting_period": voting_period
            }
        });

        // Create vote tally (optionally with proposer's YES vote)
        let mut tally = VoteTally::new(member_count);
        
        // Conditionally record proposer's auto-vote
        if should_auto_vote {
            tally.record_vote(true, None); // Proposer auto-votes YES
            
            // Record proposer's vote in storage
            let proposer_vote_path = format!("groups/{}/votes/{}/{}", group_id, proposal_id, proposer);
            let proposer_vote_data = json!({
                "voter": proposer,
                "approve": true,
                "timestamp": env::block_timestamp()
            });
            platform.storage_set(&proposer_vote_path, &proposer_vote_data)?;
        }

        // Batch storage writes (2-3 writes depending on auto_vote)
        platform.storage_set(&proposal_path, &proposal_data)?;
        platform.storage_set(&tally_path, &json!(tally))?;

        // Check if proposal should execute immediately (config already fetched above)
        let should_execute = tally.meets_thresholds(participation_quorum, majority_threshold);

        if should_execute {
            // Execute proposal immediately (e.g., single-member groups)
            proposal_type.execute(platform, group_id, &proposal_id, proposer, event_config)?;
            Self::update_proposal_status(platform, group_id, &proposal_id, "executed", event_config)?;
        }

        // Conditional event emission
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            
            // Calculate expiration timestamp for indexers
            let expires_at = proposal_data.get("created_at")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
                .saturating_add(voting_period);
            
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "proposal_created", proposer.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", &*proposal_id)
                .with_field("sequence_number", sequence_number)
                .with_field("proposal_type", proposal_data["type"].as_str().unwrap_or(""))
                .with_field("proposer", proposer.as_str())
                .with_field("target", proposal_data["target"].as_str().unwrap_or(""))
                .with_field("auto_vote", should_auto_vote)
                .with_field("created_at", proposal_data["created_at"].as_u64().unwrap_or(0))
                .with_field("expires_at", expires_at)
                .with_field("locked_member_count", member_count)
                .with_field("participation_quorum", participation_quorum)
                .with_field("majority_threshold", majority_threshold)
                .with_field("voting_period", voting_period)
                .with_field("proposal_data", proposal_data["data"].clone())
                .emit(&mut event_batch);
            // Only emit vote event if proposer auto-voted
            if should_auto_vote {
                // Calculate participation and approval percentages
                let participation_pct = if member_count > 0 {
                    (tally.total_votes as f64 / member_count as f64) * 100.0
                } else { 0.0 };
                let approval_pct = if tally.total_votes > 0 {
                    (tally.yes_votes as f64 / tally.total_votes as f64) * 100.0
                } else { 0.0 };
                
                EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "vote_cast", proposer.clone())
                    .with_field("group_id", group_id)
                    .with_field("proposal_id", &*proposal_id)
                    .with_field("voter", proposer.as_str())
                    .with_field("approve", true)
                    .with_field("total_votes", tally.total_votes)
                    .with_field("yes_votes", tally.yes_votes)
                    .with_field("no_votes", tally.total_votes - tally.yes_votes)
                    .with_field("locked_member_count", member_count)
                    .with_field("participation_pct", participation_pct)
                    .with_field("approval_pct", approval_pct)
                    .with_field("should_execute", should_execute)
                    .with_field("should_reject", false)  // Auto-vote can't trigger immediate rejection
                    .with_field("voted_at", env::block_timestamp())
                    .emit(&mut event_batch);
            }
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

        // SECURITY: Explicit blacklist check - blacklisted users cannot vote even if still in member list
        if GroupStorage::is_blacklisted(platform, group_id, voter) {
            return Err(permission_denied!("vote", "Blacklisted members cannot vote on proposals"));
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
                    return Err(invalid_input!("Cannot vote: you joined the group after this proposal was created"));
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

        // Check for existing vote FIRST (cheaper check, better UX)
        let previous_vote = platform.storage_get(&vote_path)
            .as_ref()
            .and_then(|v| v.get("approve"))
            .and_then(|v| v.as_bool());

        // Prevent vote changes
        if previous_vote.is_some() {
            return Err(invalid_input!("You have already voted on this proposal. Vote changes are not allowed."));
        }

        // Get voting configuration FROM THE PROPOSAL (not current group config)
        // This prevents retroactive changes when voting config is updated mid-voting
        let voting_config = proposal_data.get("voting_config")
            .ok_or_else(|| invalid_input!("Proposal missing voting_config"))?;
        let participation_quorum = voting_config.get("participation_quorum")
            .and_then(|v| v.as_f64())
            .ok_or_else(|| invalid_input!("Invalid participation_quorum"))?;
        let majority_threshold = voting_config.get("majority_threshold")
            .and_then(|v| v.as_f64())
            .ok_or_else(|| invalid_input!("Invalid majority_threshold"))?;
        let voting_period = voting_config.get("voting_period")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| invalid_input!("Invalid voting_period"))?;

        // Check expiration AFTER duplicate vote check (involves arithmetic)
        if tally.is_expired(voting_period) {
            return Err(invalid_input!("Voting period has expired"));
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
            // We already verified status == "active" above, and NEAR transactions are atomic
            // (no concurrent access within a single call), so no need to re-check
            if let Some(proposal_type_val) = proposal_data.get("data") {
                let proposal_type = serde_json::from_value::<ProposalType>(proposal_type_val.clone())
                    .map_err(|_| invalid_input!("Failed to parse proposal type"))?;
                
                // Execute first, then update status
                // NEAR's atomic transactions ensure both succeed or both rollback
                proposal_type.execute(platform, group_id, proposal_id, voter, event_config)?;
                Self::update_proposal_status(platform, group_id, proposal_id, "executed", event_config)?;
            }
        } else if should_reject {
            // Early rejection: defeat is mathematically inevitable
            Self::update_proposal_status(platform, group_id, proposal_id, "rejected", event_config)?;
        }

        // Conditional event emission (only when events are enabled)
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            
            // Calculate participation and approval percentages for indexers
            let participation_pct = if tally.locked_member_count > 0 {
                (tally.total_votes as f64 / tally.locked_member_count as f64) * 100.0
            } else { 0.0 };
            let approval_pct = if tally.total_votes > 0 {
                (tally.yes_votes as f64 / tally.total_votes as f64) * 100.0
            } else { 0.0 };
            
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "vote_cast", voter.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", proposal_id)
                .with_field("voter", voter.as_str())
                .with_field("approve", approve)
                .with_field("total_votes", tally.total_votes)
                .with_field("yes_votes", tally.yes_votes)
                .with_field("no_votes", tally.total_votes - tally.yes_votes)
                .with_field("locked_member_count", tally.locked_member_count)
                .with_field("participation_pct", participation_pct)
                .with_field("approval_pct", approval_pct)
                .with_field("should_execute", should_execute)
                .with_field("should_reject", should_reject)
                .with_field("voted_at", env::block_timestamp())
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Get member count for a group
    /// Returns an error if group stats are missing (indicates corrupted group state)
    fn get_member_count(platform: &SocialPlatform, group_id: &str) -> Result<u64, SocialError> {
        // Get actual member count from group stats
        let stats = GroupStorage::get_group_stats(platform, group_id)
            .ok_or_else(|| invalid_input!("Group stats not found - group may be corrupted"))?;
        
        stats.get("total_members")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| invalid_input!("Member count not found in group stats"))
    }

    /// Get and increment proposal counter for a group
    /// Returns the next sequential proposal number (1, 2, 3, etc.)
    fn get_and_increment_proposal_counter(platform: &mut SocialPlatform, group_id: &str) -> Result<u64, SocialError> {
        let counter_path = format!("groups/{}/proposal_counter", group_id);
        let current_counter = platform.storage_get(&counter_path)
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        
        let next_counter = current_counter + 1;
        platform.storage_set(&counter_path, &json!(next_counter))?;
        
        Ok(next_counter)
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
                
                // Get final tally for indexers
                let tally_data = platform.storage_get(&format!("groups/{}/votes/{}", group_id, proposal_id));
                let (total_votes, yes_votes, locked_member_count) = if let Some(tally_val) = tally_data {
                    let total = tally_val.get("total_votes").and_then(|v| v.as_u64()).unwrap_or(0);
                    let yes = tally_val.get("yes_votes").and_then(|v| v.as_u64()).unwrap_or(0);
                    let locked = tally_val.get("locked_member_count").and_then(|v| v.as_u64()).unwrap_or(0);
                    (total, yes, locked)
                } else {
                    (0, 0, 0)
                };
                
                EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "proposal_status_updated", env::predecessor_account_id())
                    .with_field("group_id", group_id)
                    .with_field("proposal_id", proposal_id)
                    .with_field("status", status)
                    .with_field("final_total_votes", total_votes)
                    .with_field("final_yes_votes", yes_votes)
                    .with_field("final_no_votes", total_votes.saturating_sub(yes_votes))
                    .with_field("locked_member_count", locked_member_count)
                    .with_field("updated_at", env::block_timestamp())
                    .emit(&mut event_batch);
                event_batch.emit(event_config)?;
            }
        }

        Ok(())
    }
}