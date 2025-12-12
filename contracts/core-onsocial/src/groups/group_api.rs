// --- Group API Module ---
// Direct, efficient group operations for the social contract
//
// PURE DEMOCRACY SYSTEM:
// For member-driven groups (member_driven: true), all management actions
// are routed through the proposal/voting system instead of hierarchical permissions.
//
// Voting Rules (unchanged):
// - 25% participation quorum required
// - >50% majority threshold
// - 7 day voting period
// - One vote per member
// - No vote changes allowed
//
// Member-driven groups enable:
// - Democratic member management (add/remove members via proposals)
// - Community-driven moderation (ban/unban via proposals)
// - Collective ownership decisions (transfer ownership via proposals)
//
// Note: Privacy changes are not available for member-driven groups as they must always remain private
// to maintain democratic control over membership
//
// Traditional groups maintain hierarchical permissions for performance.

use near_sdk::{AccountId, serde_json::{Value, json}};
use crate::{EventConfig, SocialError, invalid_input};

use crate::state::models::SocialPlatform;
use crate::validation::validate_account_id;

/// Direct Group Operations Implementation
impl SocialPlatform {
    // --- Direct Group Operations (Simple & Efficient) ---

    /// Create a new group
    /// For member-driven groups, set member_driven: true in config
    /// Member-driven groups MUST be private to maintain democratic control
    /// Example: {"member_driven": true, "is_private": true}
    pub fn create_group(
        &mut self,
        group_id: String,
        mut config: Value,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        let event_config = None; // Default event config

        // Validate group_id format
        if group_id.is_empty() || group_id.len() > 64 {
            return Err(invalid_input!(crate::errors::ERR_GROUP_ID_TOO_SHORT));
        }
        if !group_id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
            return Err(invalid_input!(crate::errors::ERR_GROUP_ID_INVALID_CHARS));
        }

        // Validate config is a JSON object
        if !config.is_object() {
            return Err(invalid_input!(crate::errors::ERR_CONFIG_NOT_OBJECT));
        }

        // Validate caller is a valid NEAR account
        validate_account_id(caller)?;

        // Validate contract is in Live status for write operations
        self.validate_state(false)?;

        // Validate member_driven flag if present
        if let Some(is_member_driven) = config.get("member_driven").and_then(|v| v.as_bool()) {
            if is_member_driven {
                // For member-driven groups, ensure they start with proper democratic defaults
                // They MUST be private to maintain democratic control over membership
                if let Some(is_private) = config.get("is_private").and_then(|v| v.as_bool()) {
                    if !is_private {
                        return Err(invalid_input!("Member-driven groups must be private to maintain democratic control over membership"));
                    }
                } else {
                    // If not specified, force to private
                    if let Some(obj) = config.as_object_mut() {
                        obj.insert("is_private".to_string(), Value::Bool(true));
                    }
                }
            }
        }

        crate::groups::core::GroupStorage::create_group(
            self, &group_id, caller, &config, &event_config
        )
    }

    /// Join a group (unified for both public and private groups)
    ///
    /// For traditional groups:
    ///   - Public groups: Auto-approves with requested permissions
    ///   - Private groups: Creates join request with requested permissions for approval
    ///
    /// For member-driven groups:
    ///   - ALWAYS creates join request (even if marked as "public") - members vote on new joiners
    ///   - This ensures democratic control over membership regardless of privacy setting
    pub fn join_group(
        &mut self,
        group_id: String,
        requested_permissions: u8,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        let event_config = None; // Default event config

        crate::validation::route_group_operation(
            self,
            &group_id,
            caller,
            &event_config,
            // Member-driven action: create proposal
            |platform, group_id, caller, event_config| {
                                let proposal_type = crate::groups::ProposalType::JoinRequest {
                    requester: caller.clone(),
                    requested_permissions,
                    message: Some("Join request submitted for community approval".to_string()),
                };

                crate::groups::governance::GroupGovernance::create_proposal(
                    platform, group_id, caller, proposal_type, event_config, None
                )?;
                Ok(())
            },
            // Traditional action: use privacy-based logic
            |platform| {
                if crate::groups::core::GroupStorage::is_private_group(platform, &group_id) {
                    // Private group: create join request with requested permissions
                    crate::groups::core::GroupStorage::request_join(
                        platform, &group_id, caller, requested_permissions, &event_config
                    )
                } else {
                    // Public group: check blacklist first, then auto-approve with requested permissions
                    if crate::groups::core::GroupStorage::is_blacklisted(platform, &group_id, caller) {
                        return Err(invalid_input!("You are blacklisted from this group"));
                    }
                    crate::groups::core::GroupStorage::add_member(
                        platform, &group_id, caller, caller, requested_permissions, &event_config
                    )
                }
            }
        )
    }

    /// Leave a group (removes caller from group)
    pub fn leave_group(
        &mut self,
        group_id: String,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        let event_config = None; // Default event config

        // Validate contract is in Live status for write operations
        self.validate_state(false)?;

        crate::groups::core::GroupStorage::remove_member(
            self, &group_id, caller, caller, &event_config
        )
    }

    /// Add a member to a group with specific permissions
    pub fn add_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        permission_flags: u8,
        caller: &AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        crate::validation::route_group_operation(
            self,
            &group_id,
            caller,
            &event_config,
            // Member-driven action: create proposal
            |platform, group_id, caller, event_config| {
                let proposal_type = crate::groups::ProposalType::MemberInvite {
                    target_user: member_id.clone(),
                    permission_flags,
                    message: Some("Community member invitation".to_string()),
                };

                crate::groups::governance::GroupGovernance::create_proposal(
                    platform, group_id, caller, proposal_type, event_config, None
                )?;
                Ok(())
            },
            // Traditional action: direct permission-based action
            |platform| {
                crate::groups::core::GroupStorage::add_member(
                    platform, &group_id, &member_id, caller, permission_flags, &event_config
                )
            }
        )
    }

    /// Remove a member from a group (admin/moderator only)
    pub fn remove_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        caller: &AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        crate::validation::route_group_operation(
            self,
            &group_id,
            caller,
            &event_config,
            // Member-driven action: create proposal
            |platform, group_id, caller, event_config| {
                let proposal_type = crate::groups::ProposalType::GroupUpdate {
                    update_type: "remove_member".to_string(),
                    changes: serde_json::json!({
                        "target_user": member_id,
                        "action": "remove_member"
                    }),
                };

                crate::groups::governance::GroupGovernance::create_proposal(
                    platform, group_id, caller, proposal_type, event_config, None
                )?;
                Ok(())
            },
            // Traditional action: direct permission-based action
            |platform| {
                crate::groups::core::GroupStorage::remove_member(
                    platform, &group_id, &member_id, caller, &event_config
                )
            }
        )
    }

    /// Approve a join request with the originally requested permissions
    /// The permissions granted will be those requested by the user during join_group()
    pub fn approve_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        permission_flags: u8,
        caller: &AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        crate::validation::route_with_member_driven_error(
            self,
            &group_id,
            &event_config,
            crate::errors::ERR_MEMBER_DRIVEN_JOIN_REQUESTS,
            |platform| {
                crate::groups::core::GroupStorage::approve_join_request(
                    platform, &group_id, &requester_id, caller, permission_flags, &event_config
                )
            }
        )
    }

    /// Reject a join request (admin/moderator only)
    pub fn reject_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        caller: &AccountId,
        reason: Option<String>,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        crate::validation::route_with_member_driven_error(
            self,
            &group_id,
            &event_config,
            crate::errors::ERR_MEMBER_DRIVEN_JOIN_REQUESTS,
            |platform| {
                crate::groups::core::GroupStorage::reject_join_request(
                    platform, &group_id, &requester_id, caller, reason.as_deref(), &event_config
                )
            }
        )
    }

    /// Cancel your own join request
    pub fn cancel_join_request(
        &mut self,
        group_id: String,
        caller: &AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Validate contract is in Live status for write operations
        self.validate_state(false)?;

        crate::groups::core::GroupStorage::cancel_join_request(
            self, &group_id, caller, &event_config
        )
    }

    /// Add user to group blacklist (admin only)
    pub fn blacklist_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        caller: &AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        crate::validation::route_group_operation(
            self,
            &group_id,
            caller,
            &event_config,
            // Member-driven action: create proposal
            |platform, group_id, caller, event_config| {
                let proposal_type = crate::groups::ProposalType::GroupUpdate {
                    update_type: "ban".to_string(),
                    changes: serde_json::json!({
                        "target_user": member_id,
                        "action": "ban"
                    }),
                };

                crate::groups::governance::GroupGovernance::create_proposal(
                    platform, group_id, caller, proposal_type, event_config, None
                )?;
                Ok(())
            },
            // Traditional action: direct permission-based action
            |platform| {
                crate::groups::core::GroupStorage::add_to_blacklist(
                    platform, &group_id, &member_id, caller, &event_config
                )
            }
        )
    }

    /// Remove user from group blacklist (admin only)
    pub fn unblacklist_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        caller: &AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        crate::validation::route_group_operation(
            self,
            &group_id,
            caller,
            &event_config,
            // Member-driven action: create proposal
            |platform, group_id, caller, event_config| {
                let proposal_type = crate::groups::ProposalType::GroupUpdate {
                    update_type: "unban".to_string(),
                    changes: serde_json::json!({
                        "target_user": member_id,
                        "action": "unban"
                    }),
                };

                crate::groups::governance::GroupGovernance::create_proposal(
                    platform, group_id, caller, proposal_type, event_config, None
                )?;
                Ok(())
            },
            // Traditional action: direct permission-based action
            |platform| {
                crate::groups::core::GroupStorage::remove_from_blacklist(
                    platform, &group_id, &member_id, caller, &event_config
                )
            }
        )
    }

    /// Transfer group ownership (owner only)
    pub fn transfer_group_ownership(
        &mut self,
        group_id: String,
        new_owner: AccountId,
        remove_old_owner: Option<bool>,
        caller: &AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        crate::validation::route_group_operation(
            self,
            &group_id,
            caller,
            &event_config,
            // Member-driven action: create proposal
            |platform, group_id, caller, event_config| {
                let proposal_type = crate::groups::ProposalType::GroupUpdate {
                    update_type: "transfer_ownership".to_string(),
                    changes: serde_json::json!({
                        "new_owner": new_owner,
                        "remove_old_owner": remove_old_owner.unwrap_or(true),
                        "action": "transfer_ownership"
                    }),
                };

                crate::groups::governance::GroupGovernance::create_proposal(
                    platform, group_id, caller, proposal_type, event_config, None
                )?;
                Ok(())
            },
            // Traditional action: direct permission-based action
            |platform| {
                crate::groups::core::GroupStorage::transfer_ownership_with_removal(
                    platform, &group_id, &new_owner, remove_old_owner, &event_config
                )
            }
        )
    }

    /// Set group privacy (private/public) - owner only
    /// Note: Member-driven groups cannot change their privacy setting and must always remain private
    pub fn set_group_privacy(
        &mut self,
        group_id: String,
        is_private: bool,
        caller: &AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        crate::validation::route_with_member_driven_error(
            self,
            &group_id,
            &event_config,
            "Member-driven groups cannot change their privacy setting - they must always remain private to maintain democratic control over membership",
            |platform| {
                crate::groups::core::GroupStorage::set_group_privacy(
                    platform, &group_id, caller, is_private, &event_config
                )
            }
        )
    }

    // --- Group Governance (Proposals & Voting) ---

    /// Create a proposal for group changes
    /// 
    /// # Arguments
    /// * `auto_vote` - Whether proposer automatically votes YES. Default is true (None = true).
    ///                 Set to Some(false) for discussion-first proposals where proposer votes later.
    pub fn create_group_proposal(
        &mut self,
        group_id: String,
        proposal_type: String,
        changes: Value,
        caller: &AccountId,
        event_config: Option<EventConfig>,
        auto_vote: Option<bool>,
    ) -> Result<String, SocialError> {
        // Validate contract is in Live status for write operations
        self.validate_state(false)?;

        // Check if this is a member-driven group and prevent privacy changes
        if proposal_type == "group_update" {
            if let Some(update_type) = changes.get("update_type").and_then(|v| v.as_str()) {
                if update_type == "privacy" {
                    // Check if group is member-driven
                    let config = crate::validation::validate_group_operation(self, &group_id)?;
                    if crate::validation::is_group_member_driven(&config) {
                        return Err(invalid_input!("Member-driven groups cannot create privacy change proposals - they must always remain private"));
                    }
                }
            }
        }

        // Convert proposal_type string to enum
        let proposal_type_enum = match proposal_type.as_str() {
            "group_update" => {
                let update_type = changes.get("update_type")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("update_type required for group_update"))?;
                crate::groups::ProposalType::GroupUpdate {
                    update_type: update_type.to_string(),
                    changes: changes.clone(),
                }
            }
            "permission_change" => {
                let target_user = changes.get("target_user")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
                    .ok_or_else(|| invalid_input!("target_user required for permission_change"))?;
                let permission_flags = changes.get("permission_flags")
                    .and_then(|v| v.as_u64())
                    .and_then(|f| if f <= 255 { Some(f as u8) } else { None })
                    .ok_or_else(|| invalid_input!("permission_flags required for permission_change (0-255)"))?;
                let reason = changes.get("reason").and_then(|v| v.as_str());
                crate::groups::ProposalType::PermissionChange {
                    target_user,
                    permission_flags,
                    reason: reason.map(|s| s.to_string()),
                }
            }
            "member_invite" => {
                let target_user = changes.get("target_user")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
                    .ok_or_else(|| invalid_input!("target_user required for member_invite"))?;
                let permission_flags = changes.get("permission_flags")
                    .and_then(|v| v.as_u64())
                    .and_then(|f| if f <= 255 { Some(f as u8) } else { None })
                    .unwrap_or(3); // Default to READ | WRITE if not specified
                let message = changes.get("message").and_then(|v| v.as_str());
                crate::groups::ProposalType::MemberInvite {
                    target_user,
                    permission_flags,
                    message: message.map(|s| s.to_string()),
                }
            }
            "join_request" => {
                let requester = changes.get("requester")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
                    .ok_or_else(|| invalid_input!("requester required for join_request"))?;
                let requested_permissions = changes.get("requested_permissions")
                    .and_then(|v| v.as_u64())
                    .and_then(|f| if f <= 255 { Some(f as u8) } else { None })
                    .ok_or_else(|| invalid_input!("requested_permissions required for join_request (0-255)"))?;
                let message = changes.get("message").and_then(|v| v.as_str());
                crate::groups::ProposalType::JoinRequest {
                    requester,
                    requested_permissions,
                    message: message.map(|s| s.to_string()),
                }
            }
            "path_permission_grant" => {
                let target_user = changes.get("target_user")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
                    .ok_or_else(|| invalid_input!("target_user required for path_permission_grant"))?;
                let path = changes.get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("path required for path_permission_grant"))?;
                let permission_flags = changes.get("permission_flags")
                    .and_then(|v| v.as_u64())
                    .and_then(|f| if f <= 255 { Some(f as u8) } else { None })
                    .ok_or_else(|| invalid_input!("permission_flags required for path_permission_grant (0-255)"))?;
                let reason = changes.get("reason")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("reason required for path_permission_grant"))?;
                crate::groups::ProposalType::PathPermissionGrant {
                    target_user,
                    path: path.to_string(),
                    permission_flags,
                    reason: reason.to_string(),
                }
            }
            "path_permission_revoke" => {
                let target_user = changes.get("target_user")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse().ok())
                    .ok_or_else(|| invalid_input!("target_user required for path_permission_revoke"))?;
                let path = changes.get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("path required for path_permission_revoke"))?;
                let reason = changes.get("reason")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("reason required for path_permission_revoke"))?;
                crate::groups::ProposalType::PathPermissionRevoke {
                    target_user,
                    path: path.to_string(),
                    reason: reason.to_string(),
                }
            }
            "voting_config_change" => {
                let participation_quorum = changes.get("participation_quorum").and_then(|v| v.as_f64());
                let majority_threshold = changes.get("majority_threshold").and_then(|v| v.as_f64());
                let voting_period = changes.get("voting_period").and_then(|v| v.as_u64());
                crate::groups::ProposalType::VotingConfigChange {
                    participation_quorum,
                    majority_threshold,
                    voting_period,
                }
            }
            "custom_proposal" => {
                let title = changes.get("title")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("title required for custom_proposal"))?;
                let description = changes.get("description")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| invalid_input!("description required for custom_proposal"))?;
                let custom_data = changes.get("custom_data").cloned().unwrap_or(json!({}));
                crate::groups::ProposalType::CustomProposal {
                    title: title.to_string(),
                    description: description.to_string(),
                    custom_data,
                }
            }
            _ => return Err(invalid_input!("Unknown proposal type")),
        };

        crate::groups::governance::GroupGovernance::create_proposal(
            self, &group_id, caller, proposal_type_enum, &event_config, auto_vote
        )
    }

    /// Vote on a proposal
    pub fn vote_on_proposal(
        &mut self,
        group_id: String,
        proposal_id: String,
        approve: bool,
        caller: &AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Validate contract is in Live status for write operations
        self.validate_state(false)?;

        crate::groups::governance::GroupGovernance::vote_on_proposal(
            self, &group_id, &proposal_id, caller, approve, &event_config
        )
    }
}