// --- Permission Types Module ---
// Proposal types, vote tallying, and execution logic for governance

use near_sdk::{AccountId, env, serde_json::{self, json, Value}};
use crate::events::{EventBatch, EventBuilder, EventConfig};
use crate::state::models::SocialPlatform;
use crate::groups::GroupStorage;
use crate::groups::kv_permissions;
use crate::validation;
use crate::constants::*;
use crate::{invalid_input, SocialError};

/// Proposal types for governance
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub enum ProposalType {
    GroupUpdate { update_type: String, changes: Value },
    PermissionChange { target_user: AccountId, permission_flags: u8, reason: Option<String> },
    PathPermissionGrant { target_user: AccountId, path: String, permission_flags: u8, reason: String },
    PathPermissionRevoke { target_user: AccountId, path: String, reason: String },
    MemberInvite { target_user: AccountId, permission_flags: u8, message: Option<String> },
    JoinRequest { requester: AccountId, requested_permissions: u8, message: Option<String> },
    VotingConfigChange { participation_quorum: Option<f64>, majority_threshold: Option<f64>, voting_period: Option<u64> },
    CustomProposal { title: String, description: String, custom_data: Value },
}

/// Vote tally tracking for proposals
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct VoteTally {
    pub yes_votes: u64,
    pub total_votes: u64,
    pub created_at: u64,
    pub locked_member_count: u64,
}

/// Context for executing proposals
pub(crate) struct ExecutionContext<'a> {
    pub platform: &'a mut SocialPlatform,
    pub group_id: &'a str,
    pub executor: &'a AccountId,
    pub event_config: &'a Option<EventConfig>,
}

/// Data for path permission grant operations
pub(crate) struct PathPermissionGrantData<'a> {
    pub target_user: &'a AccountId,
    pub path: &'a str,
    pub permission_flags: u8,
    pub reason: &'a str,
}

impl VoteTally {
    pub fn new(member_count: u64) -> Self {
        Self {
            yes_votes: 0,
            total_votes: 0,
            created_at: env::block_timestamp(),
            locked_member_count: member_count,
        }
    }

    pub fn record_vote(&mut self, approve: bool, previous_vote: Option<bool>) {
        // Only allow voting if user hasn't voted before (no vote changes)
        if previous_vote.is_none() {
            if approve {
                self.yes_votes += 1;
            }
            self.total_votes += 1;
        }
        // If user has already voted, ignore the new vote (no changes allowed)
    }

    pub fn meets_thresholds(&self, participation_quorum: f64, majority_threshold: f64) -> bool {
        // Cannot meet thresholds with zero votes or zero members (corrupted state)
        if self.total_votes == 0 || self.locked_member_count == 0 {
            return false;
        }
        
        let participation = (self.total_votes as f64) / (self.locked_member_count as f64);
        let majority = (self.yes_votes as f64) / (self.total_votes as f64);

        participation >= participation_quorum && majority >= majority_threshold
    }

    pub fn is_expired(&self, voting_period: u64) -> bool {
        // Use saturating_add to prevent overflow
        // If overflow would occur, saturating_add returns u64::MAX
        let expiration_time = self.created_at.saturating_add(voting_period);
        env::block_timestamp() >= expiration_time
    }

    /// Check if proposal defeat is mathematically inevitable
    /// Returns true if even with all remaining members voting YES, the proposal cannot reach the majority threshold
    pub fn is_defeat_inevitable(&self, participation_quorum: f64, majority_threshold: f64) -> bool {
        // Cannot determine defeat if no members (corrupted state)
        if self.locked_member_count == 0 {
            return false;
        }
        
        let total_members = self.locked_member_count as f64;
        let votes_cast = self.total_votes as f64;
        let remaining_votes = total_members - votes_cast;
        
        // Calculate maximum possible YES votes if all remaining members vote YES
        let max_possible_yes = (self.yes_votes as f64) + remaining_votes;
        let max_possible_total = total_members; // All members vote
        
        // Calculate best-case scenario participation and majority
        let max_participation = max_possible_total / total_members; // Will be 1.0 (100%)
        let max_majority = max_possible_yes / max_possible_total;
        
        // Defeat is inevitable if even in the best case we can't meet thresholds
        // Note: We use < (not <=) because if max_majority == threshold, it could still pass
        max_participation >= participation_quorum && max_majority < majority_threshold
    }
}

impl ProposalType {
    pub fn name(&self) -> String {
        match self {
            Self::GroupUpdate { update_type, .. } => format!("group_update_{}", update_type),
            Self::PermissionChange { .. } => "permission_change".to_string(),
            Self::PathPermissionGrant { .. } => "path_permission_grant".to_string(),
            Self::PathPermissionRevoke { .. } => "path_permission_revoke".to_string(),
            Self::MemberInvite { .. } => "member_invite".to_string(),
            Self::JoinRequest { .. } => "join_request".to_string(),
            Self::VotingConfigChange { .. } => "voting_config_change".to_string(),
            Self::CustomProposal { .. } => "custom_proposal".to_string(),
        }
    }

    pub fn target(&self) -> AccountId {
        match self {
            Self::GroupUpdate { .. } => env::predecessor_account_id(), // Group updates target the proposer
            Self::PermissionChange { target_user, .. } => target_user.clone(),
            Self::PathPermissionGrant { target_user, .. } => target_user.clone(),
            Self::PathPermissionRevoke { target_user, .. } => target_user.clone(),
            Self::MemberInvite { target_user, .. } => target_user.clone(),
            Self::JoinRequest { requester, .. } => requester.clone(),
            Self::VotingConfigChange { .. } => env::predecessor_account_id(),
            Self::CustomProposal { .. } => env::predecessor_account_id(),
        }
    }

    pub fn validate(&self, platform: &SocialPlatform, group_id: &str, proposer: &AccountId) -> Result<(), SocialError> {
        let (proposal_type_str, proposal_data) = self.to_validation_data();
        validation::validate_proposal(platform, group_id, proposer, &proposal_type_str, &proposal_data)
    }

    /// Convert ProposalType to validation data format
    fn to_validation_data(&self) -> (String, Value) {
        match self {
            Self::GroupUpdate { update_type, changes } => (
                "group_update".to_string(),
                json!({
                    "update_type": update_type,
                    "changes": changes
                })
            ),
            Self::PermissionChange { target_user, permission_flags, reason } => (
                "permission_change".to_string(),
                json!({
                    "target_user": target_user,
                    "permission_flags": permission_flags,
                    "reason": reason
                })
            ),
            Self::PathPermissionGrant { target_user, path, permission_flags, reason } => (
                "path_permission_grant".to_string(),
                json!({
                    "target_user": target_user,
                    "path": path,
                    "permission_flags": permission_flags,
                    "reason": reason
                })
            ),
            Self::PathPermissionRevoke { target_user, path, reason } => (
                "path_permission_revoke".to_string(),
                json!({
                    "target_user": target_user,
                    "path": path,
                    "reason": reason
                })
            ),
            Self::MemberInvite { target_user, permission_flags, message } => (
                "member_invite".to_string(),
                json!({
                    "target_user": target_user,
                    "permission_flags": permission_flags,
                    "message": message
                })
            ),
            Self::JoinRequest { requester, requested_permissions, message } => (
                "join_request".to_string(),
                json!({
                    "requester": requester,
                    "requested_permissions": requested_permissions,
                    "message": message
                })
            ),
            Self::VotingConfigChange { participation_quorum, majority_threshold, voting_period } => (
                "voting_config_change".to_string(),
                json!({
                    "participation_quorum": participation_quorum,
                    "majority_threshold": majority_threshold,
                    "voting_period": voting_period
                })
            ),
            Self::CustomProposal { title, description, custom_data } => (
                "custom_proposal".to_string(),
                json!({
                    "title": title,
                    "description": description,
                    "custom_data": custom_data
                })
            ),
        }
    }

    pub fn execute(&self, platform: &mut SocialPlatform, group_id: &str, proposal_id: &str, executor: &AccountId, event_config: &Option<EventConfig>) -> Result<(), SocialError> {
        match self {
            Self::GroupUpdate { update_type, changes } => {
                Self::execute_group_update(platform, group_id, proposal_id, update_type, changes, executor, event_config)
            }
            Self::PermissionChange { target_user, permission_flags, reason } => {
                Self::execute_permission_change(platform, group_id, proposal_id, target_user, *permission_flags, reason.as_deref(), executor, event_config)
            }
            Self::PathPermissionGrant { target_user, path, permission_flags, reason } => {
                let ctx = ExecutionContext { platform, group_id, executor, event_config };
                let data = PathPermissionGrantData { target_user, path, permission_flags: *permission_flags, reason };
                Self::execute_path_permission_grant(ctx, proposal_id, data)
            }
            Self::PathPermissionRevoke { target_user, path, reason } => {
                Self::execute_path_permission_revoke(platform, group_id, proposal_id, target_user, path, reason, executor, event_config)
            }
            Self::MemberInvite { target_user, permission_flags, message } => {
                Self::execute_member_invite(platform, group_id, proposal_id, target_user, *permission_flags, message.as_deref(), executor, event_config)
            }
            Self::VotingConfigChange { participation_quorum, majority_threshold, voting_period } => {
                Self::execute_voting_config_change(platform, group_id, proposal_id, *participation_quorum, *majority_threshold, *voting_period, executor, event_config)
            }
            Self::JoinRequest { requester, requested_permissions, message } => {
                Self::execute_join_request(platform, group_id, proposal_id, requester, *requested_permissions, message.as_deref(), executor, event_config)
            }
            Self::CustomProposal { title, description, custom_data } => {
                Self::execute_custom_proposal(platform, group_id, proposal_id, title, description, custom_data, executor, event_config)
            }
        }
    }

    fn execute_group_update(platform: &mut SocialPlatform, group_id: &str, proposal_id: &str, update_type: &str, changes: &Value, executor: &AccountId, event_config: &Option<EventConfig>) -> Result<(), SocialError> {
        let config_key = GroupStorage::group_config_path(group_id);

        let mut config = platform.storage_get(&config_key)
            .ok_or_else(|| invalid_input!("Group config not found"))?;

        // Apply changes based on update type
        match update_type {
            "permissions" | "metadata" => {
                if let Some(config_obj) = config.as_object_mut() {
                    // Extract the nested "changes" field from the proposal data
                    let actual_changes = changes.get("changes").unwrap_or(changes);
                    
                    if let Some(changes_obj) = actual_changes.as_object() {
                        for (key, value) in changes_obj {
                            if !matches!(key.as_str(), "owner" | "update_type" | "changes") {
                                config_obj.insert(key.clone(), value.clone());
                            }
                        }
                        // If member_driven is being changed to true, automatically set is_private to true
                        if let (Some(member_driven_val), true) = (changes_obj.get("member_driven"), changes_obj.contains_key("member_driven")) {
                            if member_driven_val.as_bool() == Some(true) {
                                config_obj.insert("is_private".to_string(), Value::Bool(true));
                            }
                        }
                    }
                }
            }
            "remove_member" => {
                if let Some(target) = changes.get("target_user").and_then(|v| v.as_str()) {
                    let target_account = target.parse().map_err(|_| invalid_input!("Invalid account ID"))?;
                    GroupStorage::remove_member_internal(platform, group_id, &target_account, executor, event_config, true)?;
                }
            }
            "ban" => {
                if let Some(target) = changes.get("target_user").and_then(|v| v.as_str()) {
                    let target_account = target.parse().map_err(|_| invalid_input!("Invalid account ID"))?;
                    GroupStorage::add_to_blacklist_internal(platform, group_id, &target_account, executor, event_config, true)?;
                }
            }
            "unban" => {
                if let Some(target) = changes.get("target_user").and_then(|v| v.as_str()) {
                    let target_account = target.parse().map_err(|_| invalid_input!("Invalid account ID"))?;
                    GroupStorage::remove_from_blacklist_internal(platform, group_id, &target_account, executor, event_config, true)?;
                }
            }
            "privacy" => {
                if let Some(is_private) = changes.get("is_private").and_then(|v| v.as_bool()) {
                    // For member-driven groups, executor is any member (already validated)
                    // We need to pass a valid owner - let's use the current caller as they're executing the approved proposal
                    GroupStorage::set_group_privacy(platform, group_id, executor, is_private, event_config)?;
                }
            }
            "transfer_ownership" => {
                if let Some(new_owner) = changes.get("new_owner").and_then(|v| v.as_str()) {
                    let new_owner_account = new_owner.parse().map_err(|_| invalid_input!("Invalid account ID"))?;
                    // Get the current owner before transfer
                    let transfer_config = platform.storage_get(&config_key)
                        .ok_or_else(|| invalid_input!("Group config not found"))?;
                    let old_owner = transfer_config.get("owner")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| invalid_input!("Current owner not found"))?
                        .parse()
                        .map_err(|_| invalid_input!("Invalid current owner"))?;

                    // Transfer ownership (from governance, so bypass member-driven restriction)
                    // NOTE: This function saves the updated config internally
                    GroupStorage::transfer_ownership_internal(platform, group_id, &new_owner_account, true, event_config)?;

                    // Check if we should remove the old owner (consistent with direct transfers)
                    let remove_old_owner = changes.get("remove_old_owner")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true); // Default to true for clean leadership transitions (consistent behavior)

                    // Automatically remove the old owner from the group if requested
                    // This ensures clean leadership transitions and consistent behavior with direct transfers
                    if remove_old_owner && old_owner != new_owner_account {
                        GroupStorage::remove_member_internal(platform, group_id, &old_owner, executor, event_config, true)?;
                    }
                    
                    // Reload config after transfer_ownership_internal modified it
                    // This prevents the subsequent save from overwriting the ownership change
                    config = platform.storage_get(&config_key)
                        .ok_or_else(|| invalid_input!("Group config not found after ownership transfer"))?;
                }
            }
            _ => return Err(invalid_input!("Unknown update type")),
        }

        platform.storage_set(&config_key, &config)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "group_updated", executor.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", proposal_id)
                .with_field("update_type", update_type)
                .with_field("changes", changes.clone())
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    fn execute_permission_change(platform: &mut SocialPlatform, group_id: &str, proposal_id: &str, target_user: &AccountId, permission_flags: u8, reason: Option<&str>, executor: &AccountId, event_config: &Option<EventConfig>) -> Result<(), SocialError> {
        let member_key = GroupStorage::group_member_path(group_id, target_user.as_str());

        let mut member_data = json!({
            "permission_flags": permission_flags,
            "updated_at": env::block_timestamp(),
            "updated_by": executor
        });

        if let Some(reason) = reason {
            member_data["reason"] = json!(reason);
        }

        platform.storage_set(&member_key, &member_data)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "permission_changed", executor.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", proposal_id)
                .with_target(target_user)
                .with_field("permission_flags", permission_flags)
                .with_field("reason", reason)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    fn execute_member_invite(platform: &mut SocialPlatform, group_id: &str, proposal_id: &str, target_user: &AccountId, permission_flags: u8, message: Option<&str>, executor: &AccountId, event_config: &Option<EventConfig>) -> Result<(), SocialError> {
        GroupStorage::add_member_internal(platform, group_id, target_user, executor, permission_flags, event_config, true)?;

        // Emit additional invite event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "member_invited", executor.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", proposal_id)
                .with_target(target_user)
                .with_field("permission_flags", permission_flags)
                .with_field("message", message)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    fn execute_join_request(platform: &mut SocialPlatform, group_id: &str, proposal_id: &str, requester: &AccountId, requested_permissions: u8, message: Option<&str>, executor: &AccountId, event_config: &Option<EventConfig>) -> Result<(), SocialError> {
        // Add the member with the requested permissions
        GroupStorage::add_member_internal(platform, group_id, requester, executor, requested_permissions, event_config, true)?;

        // Emit join request approved event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "join_request_approved", executor.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", proposal_id)
                .with_field("requester", requester.as_str())
                .with_field("permission_flags", requested_permissions)
                .with_field("message", message)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    fn execute_voting_config_change(platform: &mut SocialPlatform, group_id: &str, proposal_id: &str, participation_quorum: Option<f64>, majority_threshold: Option<f64>, voting_period: Option<u64>, executor: &AccountId, event_config: &Option<EventConfig>) -> Result<(), SocialError> {
        let config_key = GroupStorage::group_config_path(group_id);

        let mut config = platform.storage_get(&config_key)
            .ok_or_else(|| invalid_input!("Group config not found"))?;

        // Get or create voting_config object
        let mut voting_config = config.get("voting_config")
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_else(serde_json::Map::new);

        // Update the specified parameters
        if let Some(quorum) = participation_quorum {
            voting_config.insert("participation_quorum".to_string(), json!(quorum));
        }
        if let Some(threshold) = majority_threshold {
            voting_config.insert("majority_threshold".to_string(), json!(threshold));
        }
        if let Some(period) = voting_period {
            voting_config.insert("voting_period".to_string(), json!(period));
        }

        // Update the config with new voting config
        if let Some(obj) = config.as_object_mut() {
            obj.insert("voting_config".to_string(), json!(voting_config));
            obj.insert("voting_config_updated_at".to_string(), json!(env::block_timestamp()));
            obj.insert("voting_config_updated_by".to_string(), json!(executor.to_string()));
        }

        platform.storage_set(&config_key, &config)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "voting_config_changed", executor.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", proposal_id)
                .with_field("participation_quorum", participation_quorum)
                .with_field("majority_threshold", majority_threshold)
                .with_field("voting_period", voting_period)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    fn execute_custom_proposal(platform: &mut SocialPlatform, group_id: &str, proposal_id: &str, title: &str, description: &str, custom_data: &Value, executor: &AccountId, event_config: &Option<EventConfig>) -> Result<(), SocialError> {
        // Cache block_height and timestamp for execution metadata
        let block_height = env::block_height();
        let timestamp = env::block_timestamp();
        
        // Professional governance pattern: Use proposal_id as primary key for direct traceability
        let execution_key = format!("groups/{}/executions/{}", group_id, proposal_id);

        let execution_data = json!({
            "proposal_id": proposal_id,
            "title": title,
            "description": description,
            "custom_data": custom_data,
            "executed_by": executor,
            "executed_at": timestamp,
            "block_height": block_height
        });

        platform.storage_set(&execution_key, &execution_data)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "custom_proposal_executed", executor.clone())
                .with_structured_data(execution_data)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    fn execute_path_permission_grant(ctx: ExecutionContext, proposal_id: &str, data: PathPermissionGrantData) -> Result<(), SocialError> {
        // Get the group owner (permissions are granted by the group owner, not the group_id)
        let config = GroupStorage::get_group_config(ctx.platform, ctx.group_id)
            .ok_or_else(|| invalid_input!("Group not found"))?;
        let group_owner_str = config.get("owner")
            .and_then(|o| o.as_str())
            .ok_or_else(|| invalid_input!("Group owner not found"))?;
        let group_owner: AccountId = group_owner_str.parse()
            .map_err(|_| invalid_input!("Invalid group owner account ID"))?;

        // Grant the path permission using the KV permissions system (with group owner as granter)
        kv_permissions::grant_permissions(ctx.platform, &group_owner, data.target_user, data.path, data.permission_flags, None, None)?;

        // Emit event
        if ctx.event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "path_permission_granted", ctx.executor.clone())
                .with_field("group_id", ctx.group_id)
                .with_field("proposal_id", proposal_id)
                .with_target(data.target_user)
                .with_path(data.path)
                .with_field("permission_flags", data.permission_flags)
                .with_field("reason", data.reason)
                .emit(&mut event_batch);
            event_batch.emit(ctx.event_config)?;
        }

        Ok(())
    }

    fn execute_path_permission_revoke(platform: &mut SocialPlatform, group_id: &str, proposal_id: &str, target_user: &AccountId, path: &str, reason: &str, executor: &AccountId, event_config: &Option<EventConfig>) -> Result<(), SocialError> {
        // Get the group owner (permissions are revoked by the group owner, not the group_id)
        let config = GroupStorage::get_group_config(platform, group_id)
            .ok_or_else(|| invalid_input!("Group not found"))?;
        let group_owner_str = config.get("owner")
            .and_then(|o| o.as_str())
            .ok_or_else(|| invalid_input!("Group owner not found"))?;
        let group_owner: AccountId = group_owner_str.parse()
            .map_err(|_| invalid_input!("Invalid group owner account ID"))?;

        // Revoke the path permission using the KV permissions system (with group owner as revoker)
        kv_permissions::revoke_permissions(platform, &group_owner, target_user, path, None)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "path_permission_revoked", executor.clone())
                .with_field("group_id", group_id)
                .with_field("proposal_id", proposal_id)
                .with_target(target_user)
                .with_path(path)
                .with_field("reason", reason)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }
}