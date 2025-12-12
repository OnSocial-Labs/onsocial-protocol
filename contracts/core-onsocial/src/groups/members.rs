// --- Group Members Module ---
// Member management, join requests, and blacklist operations

use near_sdk::{AccountId, env, serde_json::{self, Value}};
use crate::events::{EventBatch, EventBuilder, EventConfig};
use crate::state::models::SocialPlatform;
use crate::{invalid_input, permission_denied, SocialError};

impl crate::groups::core::GroupStorage {
    /// Add member to group with specific permissions (fully flexible permission-based)
    pub fn add_member(
        platform: &mut SocialPlatform,
        group_id: &str,
        member_id: &AccountId,
        granter_id: &AccountId,
        permission_flags: u8,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        Self::add_member_internal(platform, group_id, member_id, granter_id, permission_flags, event_config, false)
    }

    /// Add member to group with optional democratic bypass
    /// Used internally for proposal execution where permissions were already democratically approved
    pub fn add_member_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        member_id: &AccountId,
        granter_id: &AccountId,
        permission_flags: u8,
        event_config: &Option<EventConfig>,
        bypass_permissions: bool,
    ) -> Result<(), SocialError> {
        // Verify group exists and get config path (optimization: reuse path)
        let config_path = Self::group_config_path(group_id);
        if platform.storage_get(&config_path).is_none() {
            return Err(invalid_input!("Group does not exist"));
        }

        // Check if member already exists (prevents duplicate addition and permission escalation)
        let member_path = Self::group_member_path(group_id, member_id.as_str());
        if let Some(entry) = platform.get_entry(&member_path) {
            // Only fail if member data exists and is not soft deleted
            if matches!(entry.value, crate::state::models::DataValue::Value(_)) {
                return Err(invalid_input!("Member already exists in group"));
            }
        }

        // Check if granter is blacklisted (blacklist overrides all permissions)
        if Self::is_blacklisted(platform, group_id, granter_id) {
            return Err(permission_denied!("add_member", "You are blacklisted from this group"));
        }

        // Check if member being added is blacklisted (prevent re-adding blacklisted users)
        if Self::is_blacklisted(platform, group_id, member_id) {
            return Err(invalid_input!("Cannot add blacklisted user. Remove from blacklist first using unblacklist_group_member."));
        }

        // Allow self-join for public groups (user pays their own storage, no security risk)
        let is_self_join = member_id == granter_id;
        let is_public = !Self::is_private_group(platform, group_id);
        let is_new_member = platform.storage_get(&member_path).is_none();
        
        // Security: self-join in public groups can only grant WRITE permission
        // Higher permissions (MODERATE, MANAGE) must be granted by existing members
        if is_self_join && is_public && is_new_member {
            if permission_flags != crate::groups::kv_permissions::WRITE {
                return Err(invalid_input!("Self-join in public groups is limited to WRITE permission only"));
            }
        }
        
        let should_bypass = bypass_permissions || (is_self_join && is_public && is_new_member);

        // Verify granter has permission to grant these permissions (optimization: reuse path)
        if !should_bypass && !Self::can_grant_permissions(platform, group_id, granter_id, permission_flags) {
            return Err(permission_denied!("add_member", &config_path));
        }

        // Add member with permission metadata
        let member_data = Value::Object(serde_json::Map::from_iter([
            ("permission_flags".to_string(), Value::Number(permission_flags.into())),
            ("granted_by".to_string(), Value::String(granter_id.to_string())),
            ("joined_at".to_string(), Value::Number(env::block_timestamp().into())),
        ]));

        platform.storage_set(&member_path, &member_data)?;

        // Grant actual path-based permissions to the member on the GROUP ROOT path
        // This allows permissions to inherit to all sub-paths (posts, content, etc.)
        let group_root_path = format!("groups/{}", group_id);
        let group_owner_str = crate::groups::kv_permissions::extract_path_owner(platform, &config_path)
            .ok_or_else(|| invalid_input!("Group owner not found"))?;
        let group_owner = AccountId::try_from(group_owner_str.to_string())
            .map_err(|_| invalid_input!("Invalid group owner account ID"))?;
        
        // Grant permissions on group root path (allows member to write/moderate/manage group content)
        crate::groups::kv_permissions::grant_permissions(
            platform,
            &group_owner,
            member_id,
            &group_root_path,
            permission_flags,
            None, // No expiration
            None  // No event batch
        )?;

        // Update member count
        Self::increment_member_count(platform, group_id, event_config)?;

        // Emit event (optimized: avoid unnecessary clones and path recreation)
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "add_member", member_id.clone())
                .with_target(member_id)
                .with_path(&member_path)  // Use logical path for events
                .with_value(member_data)  // Move instead of clone
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Check if a user can grant specific permissions to another user (optimized)
    /// With hierarchical permissions:
    /// - Owner can grant any permissions
    /// - MANAGE users can grant WRITE or MODERATE (but not MANAGE - no self-propagation)
    /// - MODERATE users can grant WRITE only (prevents moderator self-propagation)
    pub fn can_grant_permissions(platform: &SocialPlatform, group_id: &str, granter_id: &AccountId, permission_flags: u8) -> bool {
        // Check if group is member-driven (pure democracy) - early return
        if Self::is_member_driven_group(platform, group_id) {
            // In member-driven groups, permission granting goes through proposals only
            // No direct permission granting allowed - must use democratic process
            return false;
        }

        // Group owner can grant any permissions (traditional groups only) - early return
        if Self::is_owner(platform, group_id, granter_id) {
            return true;
        }

        // Optimization: create path once and reuse
        let group_config_path = Self::group_config_path(group_id);

        // MANAGE users can grant WRITE or MODERATE permissions (limited delegation)
        // But CANNOT grant MANAGE permission (no self-propagation)
        if permission_flags == crate::groups::kv_permissions::MANAGE {
            // Only owner can grant MANAGE, so if we're here (not owner), deny
            return false;
        }
        
        // For WRITE or MODERATE, check if granter has MANAGE permission
        // Note: With hierarchical permissions, granting MODERATE gives MODERATE+WRITE automatically
        if permission_flags == crate::groups::kv_permissions::WRITE || permission_flags == crate::groups::kv_permissions::MODERATE {
            if let Some(group_owner) = crate::groups::kv_permissions::extract_path_owner(platform, &group_config_path) {
                if crate::groups::kv_permissions::can_manage(platform, &group_owner, granter_id.as_str(), &group_config_path) {
                    return true;
                }
            }
        }

        // MODERATE users can ONLY grant WRITE permission (prevents moderator self-propagation)
        // This ensures only MANAGE users can expand the moderation team
        if permission_flags == crate::groups::kv_permissions::WRITE {
            if let Some(group_owner) = crate::groups::kv_permissions::extract_path_owner(platform, &group_config_path) {
                if crate::groups::kv_permissions::can_moderate(platform, &group_owner, granter_id.as_str(), &group_config_path) {
                    return true;
                }
            }
        }

        // All other cases: user cannot grant permissions
        false
    }

    /// Remove member from group
    pub fn remove_member(
        platform: &mut SocialPlatform,
        group_id: &str,
        member_id: &AccountId,
        remover_id: &AccountId,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        Self::remove_member_internal(platform, group_id, member_id, remover_id, event_config, false)
    }

    pub fn remove_member_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        member_id: &AccountId,
        remover_id: &AccountId,
        event_config: &Option<EventConfig>,
        from_governance: bool,
    ) -> Result<(), SocialError> {
        let member_path = Self::group_member_path(group_id, member_id.as_str());

        if platform.storage_get(&member_path).is_none() {
            return Err(invalid_input!("Member not found"));
        }

        // Check permissions: owner can remove anyone, MANAGE_USERS can remove regular members, users can remove themselves
        let group_config_path = Self::group_config_path(group_id);
        let can_remove = if from_governance || member_id == remover_id {
            true // Governance-approved removals are always allowed, users can always remove themselves (leave group)
        } else {
            // Check if group is member-driven (pure democracy)
            if Self::is_member_driven_group(platform, group_id) {
                // In member-driven groups, member removal goes through proposals only
                // No direct removal allowed - must use democratic process
                false
            } else {
                // Traditional groups: owner can remove anyone, MANAGE_USERS can remove regular members
                if Self::is_owner(platform, group_id, remover_id) {
                    true // Owner can remove anyone
                } else {
                    // Get the group owner for permission check  
                    let group_owner = crate::groups::kv_permissions::extract_path_owner(platform, &group_config_path)
                        .ok_or_else(|| invalid_input!("Group owner not found"))?;
                    
                    if crate::groups::kv_permissions::can_manage(platform, &group_owner, remover_id.as_str(), &group_config_path) {
                        !Self::is_owner(platform, group_id, member_id) // MANAGE_USERS can't remove owner
                    } else {
                        false // No permission
                    }
                }
            }
        };

        if !can_remove {
            return Err(permission_denied!("remove_member", &format!("groups/{}/members/{}", group_id, member_id)));
        }

        // Prevent owner from leaving without transferring ownership first
        if Self::is_owner(platform, group_id, member_id) {
            return Err(invalid_input!("Owner cannot leave group. Transfer ownership to another member first using transfer_ownership operation."));
        }

        // NOTE: Permission cleanup when members leave is handled by the permission system.
        // The permission system automatically checks membership and revokes permissions
        // for users who are no longer group members. This provides automatic cleanup
        // while still allowing the UI to explicitly revoke permissions if needed.

        // Remove member using soft delete for audit trail and storage release
        if let Some(entry) = platform.get_entry(&member_path) {
            crate::storage::soft_delete_entry(platform, &member_path, entry)?;
        } else {
            return Err(crate::invalid_input!("Member entry not found"));
        }

        // Update member count
        Self::decrement_member_count(platform, group_id, event_config)?;

        // Emit event with actor info for app reconstruction
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let is_self_removal = member_id == remover_id;
            let remove_event_data = Value::Object(serde_json::Map::from_iter([
                ("removed_by".to_string(), Value::String(remover_id.to_string())),
                ("removed_at".to_string(), Value::Number(env::block_timestamp().into())),
                ("is_self_removal".to_string(), Value::Bool(is_self_removal)),
                ("from_governance".to_string(), Value::Bool(from_governance)),
            ]));
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "remove_member", member_id.clone())
                .with_target(member_id)
                .with_path(&format!("groups/{}/members/{}", group_id, member_id))
                .with_value(remove_event_data)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Check if user is a member of group (optimized)
    pub fn is_member(platform: &SocialPlatform, group_id: &str, member_id: &AccountId) -> bool {
        let member_path = Self::group_member_path(group_id, member_id.as_str());
        if let Some(entry) = platform.get_entry(&member_path) {
            // Check if entry is not soft deleted
            matches!(entry.value, crate::state::models::DataValue::Value(_))
        } else {
            false
        }
    }

    /// Check if user is the owner of group (optimized)
    pub fn is_owner(platform: &SocialPlatform, group_id: &str, user_id: &AccountId) -> bool {
        let config_path = Self::group_config_path(group_id);

        if let Some(config_data) = platform.storage_get(&config_path) {
            if let Some(owner) = config_data.get("owner").and_then(|o| o.as_str()) {
                return owner == user_id.as_str();
            }
        }

        false
    }

    /// Add to blacklist
    pub fn add_to_blacklist(
        platform: &mut SocialPlatform,
        group_id: &str,
        target_id: &AccountId,
        adder_id: &AccountId,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        Self::add_to_blacklist_internal(platform, group_id, target_id, adder_id, event_config, false)
    }

    pub fn add_to_blacklist_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        target_id: &AccountId,
        adder_id: &AccountId,
        event_config: &Option<EventConfig>,
        from_governance: bool,
    ) -> Result<(), SocialError> {
        // Check if group is member-driven (pure democracy)
        if !from_governance && Self::is_member_driven_group(platform, group_id) {
            // In member-driven groups, banning goes through proposals only
            // No direct banning allowed - must use democratic process
            return Err(permission_denied!("add_to_blacklist", &format!("groups/{}/blacklist/{}", group_id, target_id)));
        }

        // Prevent blacklisting the group owner
        if Self::is_owner(platform, group_id, target_id) {
            return Err(invalid_input!("Cannot blacklist group owner"));
        }

        // Skip permission checks if called from governance (democratic approval)
        if !from_governance {
            // Check if adder is blacklisted (blacklist overrides all permissions)
            if Self::is_blacklisted(platform, group_id, adder_id) {
                return Err(permission_denied!("add_to_blacklist", "You are blacklisted from this group"));
            }

            // Check permissions: only owner or admin can blacklist (traditional groups only)
            let group_config_path = Self::group_config_path(group_id);
            if !Self::is_owner(platform, group_id, adder_id) {
                // Get the group owner for permission check
                let group_owner = crate::groups::kv_permissions::extract_path_owner(platform, &group_config_path)
                    .ok_or_else(|| invalid_input!("Group owner not found"))?;
                
                if !crate::groups::kv_permissions::can_manage(platform, &group_owner, adder_id.as_str(), &group_config_path) {
                    return Err(permission_denied!("add_to_blacklist", &format!("groups/{}/blacklist/{}", group_id, target_id)));
                }
            }
        }

        let blacklist_path = format!("groups/{}/blacklist/{}", group_id, target_id);

        platform.storage_set(&blacklist_path, &Value::Bool(true))?;

        // COMPLETE BLACKLISTING: If user is currently a member, remove them from the group
        // Permission cleanup is handled automatically by the permission system which checks
        // membership status. When a user is removed from a group, their permissions are
        // automatically invalidated by the permission checking logic.
        if Self::is_member(platform, group_id, target_id) {
            // Use the same adder_id as remover_id since they have admin/manage permissions
            // Pass through from_governance flag to bypass permission checks when called from governance
            Self::remove_member_internal(platform, group_id, target_id, adder_id, event_config, from_governance)?;
        }

        // Emit event with actor info for app reconstruction
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let blacklist_event_data = Value::Object(serde_json::Map::from_iter([
                ("blacklisted".to_string(), Value::Bool(true)),
                ("added_by".to_string(), Value::String(adder_id.to_string())),
                ("added_at".to_string(), Value::Number(env::block_timestamp().into())),
                ("from_governance".to_string(), Value::Bool(from_governance)),
            ]));
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "add_to_blacklist", target_id.clone())
                .with_target(target_id)
                .with_path(&format!("groups/{}/blacklist/{}", group_id, target_id))
                .with_value(blacklist_event_data)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Remove from blacklist
    pub fn remove_from_blacklist(
        platform: &mut SocialPlatform,
        group_id: &str,
        target_id: &AccountId,
        remover_id: &AccountId,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        Self::remove_from_blacklist_internal(platform, group_id, target_id, remover_id, event_config, false)
    }

    pub fn remove_from_blacklist_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        target_id: &AccountId,
        remover_id: &AccountId,
        event_config: &Option<EventConfig>,
        from_governance: bool,
    ) -> Result<(), SocialError> {
        // Check if group is member-driven (pure democracy)
        if !from_governance && Self::is_member_driven_group(platform, group_id) {
            // In member-driven groups, unbanning goes through proposals only
            // No direct unbanning allowed - must use democratic process
            return Err(permission_denied!("remove_from_blacklist", &format!("groups/{}/blacklist/{}", group_id, target_id)));
        }

        // Skip permission checks if called from governance (democratic approval)
        if !from_governance {
            // Check permissions: only owner or admin can unblacklist (traditional groups only)
            let group_config_path = Self::group_config_path(group_id);
            if !Self::is_owner(platform, group_id, remover_id) {
                // Get the group owner for permission check  
                let group_owner = crate::groups::kv_permissions::extract_path_owner(platform, &group_config_path)
                    .ok_or_else(|| invalid_input!("Group owner not found"))?;
                
                if !crate::groups::kv_permissions::can_manage(platform, &group_owner, remover_id.as_str(), &group_config_path) {
                    return Err(permission_denied!("remove_from_blacklist", &format!("groups/{}/blacklist/{}", group_id, target_id)));
                }
            }
        }

        let blacklist_path = format!("groups/{}/blacklist/{}", group_id, target_id);

        // Remove from blacklist using soft delete for audit trail
        // Operation is idempotent - if not blacklisted, it's a no-op
        if let Some(entry) = platform.get_entry(&blacklist_path) {
            // Only soft delete if the entry is active (not already soft deleted)
            if matches!(entry.value, crate::state::models::DataValue::Value(_)) {
                crate::storage::soft_delete_entry(platform, &blacklist_path, entry)?;
            }
            // If already soft deleted, this is idempotent (no-op)
        }
        // If entry doesn't exist at all, unbanning is idempotent (no-op)

        // Emit event with actor info for app reconstruction
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let unblacklist_event_data = Value::Object(serde_json::Map::from_iter([
                ("blacklisted".to_string(), Value::Bool(false)),
                ("removed_by".to_string(), Value::String(remover_id.to_string())),
                ("removed_at".to_string(), Value::Number(env::block_timestamp().into())),
                ("from_governance".to_string(), Value::Bool(from_governance)),
            ]));
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "remove_from_blacklist", target_id.clone())
                .with_target(target_id)
                .with_path(&format!("groups/{}/blacklist/{}", group_id, target_id))
                .with_value(unblacklist_event_data)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Check if user is blacklisted
    pub fn is_blacklisted(platform: &SocialPlatform, group_id: &str, target_id: &AccountId) -> bool {
        let blacklist_path = format!("groups/{}/blacklist/{}", group_id, target_id);
        if let Some(entry) = platform.get_entry(&blacklist_path) {
            // Check if blacklist entry exists and is not soft deleted
            matches!(entry.value, crate::state::models::DataValue::Value(_))
        } else {
            false
        }
    }

    /// Request to join a group (for private groups)
    /// Now accepts desired permissions for unified permission access building
    pub fn request_join(
        platform: &mut SocialPlatform,
        group_id: &str,
        requester_id: &AccountId,
        requested_permissions: u8,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Validate requested permissions are valid flags
        if requested_permissions == 0 || requested_permissions > (crate::groups::kv_permissions::WRITE | crate::groups::kv_permissions::MODERATE | crate::groups::kv_permissions::MANAGE) {
            return Err(invalid_input!("Invalid permission flags requested"));
        }

        // Check if group exists
        let config_path = Self::group_config_path(group_id);

        if platform.storage_get(&config_path).is_none() {
            return Err(invalid_input!("Group does not exist"));
        }

        // Check if already a member
        if Self::is_member(platform, group_id, requester_id) {
            return Err(invalid_input!("Already a member of this group"));
        }

        // Check if blacklisted
        if Self::is_blacklisted(platform, group_id, requester_id) {
            return Err(invalid_input!("You are blacklisted from this group"));
        }

        // Check if a PENDING join request already exists
        // Allow resubmission if previous request was rejected/approved (history preserved)
        let request_path = format!("groups/{}/join_requests/{}", group_id, requester_id);

        if let Some(existing) = platform.storage_get(&request_path) {
            if let Some(status) = existing.get("status").and_then(|s| s.as_str()) {
                if status == "pending" {
                    return Err(invalid_input!("Join request already exists"));
                }
                // If status is "rejected" or "approved", allow overwriting with new request
            }
        }

        // Create join request with requested permissions
        let request_data = Value::Object(serde_json::Map::from_iter([
            ("status".to_string(), Value::String("pending".to_string())),
            ("requested_at".to_string(), Value::Number(env::block_timestamp().into())),
            ("requester_id".to_string(), Value::String(requester_id.to_string())),
            ("requested_permissions".to_string(), Value::Number(requested_permissions.into())),
        ]));

        platform.storage_set(&request_path, &request_data)?;

        // Update join request count
        Self::increment_join_request_count(platform, group_id, event_config)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "join_request_submitted", requester_id.clone())
                .with_target(requester_id)
                .with_path(&format!("groups/{}/join_requests/{}", group_id, requester_id))
                .with_value(request_data.clone())
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Approve a join request with specific permissions
    pub fn approve_join_request(
        platform: &mut SocialPlatform,
        group_id: &str,
        requester_id: &AccountId,
        approver_id: &AccountId,
        permission_flags: u8,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Check if group is member-driven (pure democracy)
        if Self::is_member_driven_group(platform, group_id) {
            // In member-driven groups, join requests are handled through automatic proposals
            // Manual approval is not allowed - must use democratic process
            return Err(invalid_input!("Member-driven groups handle join requests through proposals only"));
        }

        // Verify approver has permission to approve (must have MODERATE permission)
        let group_config_path = Self::group_config_path(group_id);
        let group_owner = crate::groups::kv_permissions::extract_path_owner(platform, &group_config_path)
            .ok_or_else(|| invalid_input!("Group owner not found"))?;
        
        if !crate::groups::kv_permissions::can_moderate(platform, &group_owner, approver_id.as_str(), &group_config_path) {
            return Err(permission_denied!("approve_join_request", &format!("groups/{}/join_requests/{}", group_id, requester_id)));
        }

        // Check if requester is blacklisted
        if Self::is_blacklisted(platform, group_id, requester_id) {
            return Err(invalid_input!("Cannot approve join request for blacklisted user"));
        }

        // Check if join request exists and is pending
        let request_path = format!("groups/{}/join_requests/{}", group_id, requester_id);

        let request_data = match platform.storage_get(&request_path) {
            Some(data) => data,
            None => return Err(invalid_input!("Join request not found")),
        };

        // Check if status is pending
        if let Some(status) = request_data.get("status").and_then(|s| s.as_str()) {
            if status != "pending" {
                return Err(invalid_input!("Join request is not pending"));
            }
        }

        // Verify approver can grant the requested permissions
        // Moderators can approve, but they can only grant permissions they themselves have
        if !Self::can_grant_permissions(platform, group_id, approver_id, permission_flags) {
            return Err(permission_denied!("approve_join_request", "Approver lacks permissions to grant requested permissions"));
        }

        // Add member to group with specified permissions
        // Use bypass_permissions since we already validated approver's permissions above
        Self::add_member_internal(platform, group_id, requester_id, approver_id, permission_flags, event_config, true)?;

        // Update join request status
        let mut updated_request = request_data.clone();
        if let Some(obj) = updated_request.as_object_mut() {
            obj.insert("status".to_string(), Value::String("approved".to_string()));
            obj.insert("approved_at".to_string(), Value::Number(env::block_timestamp().into()));
            obj.insert("approved_by".to_string(), Value::String(approver_id.to_string()));
            obj.insert("granted_permissions".to_string(), Value::Number(permission_flags.into()));
        }

        platform.storage_set(&request_path, &updated_request)?;

        // Update join request count
        Self::decrement_join_request_count(platform, group_id, event_config)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "join_request_approved", requester_id.clone())
                .with_target(requester_id)
                .with_path(&format!("groups/{}/join_requests/{}", group_id, requester_id))
                .with_value(updated_request.clone())
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Reject a join request
    pub fn reject_join_request(
        platform: &mut SocialPlatform,
        group_id: &str,
        requester_id: &AccountId,
        rejector_id: &AccountId,
        reason: Option<&str>,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Check if group is member-driven (pure democracy)
        if Self::is_member_driven_group(platform, group_id) {
            // In member-driven groups, join requests are handled through automatic proposals
            // Manual rejection is not allowed - must use democratic process
            return Err(invalid_input!("Member-driven groups handle join requests through proposals only"));
        }

        // Verify rejector has permission (must have MODERATE permission)
        let group_config_path = Self::group_config_path(group_id);
        let group_owner = crate::groups::kv_permissions::extract_path_owner(platform, &group_config_path)
            .ok_or_else(|| invalid_input!("Group owner not found"))?;
            
        if !crate::groups::kv_permissions::can_moderate(platform, &group_owner, rejector_id.as_str(), &group_config_path) {
            return Err(permission_denied!("reject_join_request", &format!("groups/{}/join_requests/{}", group_id, requester_id)));
        }

        // Check if join request exists and is pending
        let request_path = format!("groups/{}/join_requests/{}", group_id, requester_id);

        let request_data = match platform.storage_get(&request_path) {
            Some(data) => data,
            None => return Err(invalid_input!("Join request not found")),
        };

        // Check if status is pending
        if let Some(status) = request_data.get("status").and_then(|s| s.as_str()) {
            if status != "pending" {
                return Err(invalid_input!("Join request is not pending"));
            }
        }

        // Update join request status
        let mut updated_request = request_data.clone();
        if let Some(obj) = updated_request.as_object_mut() {
            obj.insert("status".to_string(), Value::String("rejected".to_string()));
            obj.insert("rejected_at".to_string(), Value::Number(env::block_timestamp().into()));
            obj.insert("rejected_by".to_string(), Value::String(rejector_id.to_string()));
            if let Some(r) = reason {
                obj.insert("reason".to_string(), Value::String(r.to_string()));
            }
        }

        platform.storage_set(&request_path, &updated_request)?;

        // Update join request count
        Self::decrement_join_request_count(platform, group_id, event_config)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "join_request_rejected", requester_id.clone())
                .with_target(requester_id)
                .with_path(&format!("groups/{}/join_requests/{}", group_id, requester_id))
                .with_value(updated_request.clone())
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }

    /// Cancel own join request
    pub fn cancel_join_request(
        platform: &mut SocialPlatform,
        group_id: &str,
        requester_id: &AccountId,
        event_config: &Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // Check if join request exists
        let request_path = format!("groups/{}/join_requests/{}", group_id, requester_id);

        if platform.storage_get(&request_path).is_none() {
            return Err(invalid_input!("Join request not found"));
        }

        // Remove join request
        platform.storage_set(&request_path, &Value::Null)?;

        // Update join request count
        Self::decrement_join_request_count(platform, group_id, event_config)?;

        // Emit event
        if event_config.as_ref().is_none_or(|c| c.emit) {
            let mut event_batch = EventBatch::new();
            EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "join_request_cancelled", requester_id.clone())
                .with_target(requester_id)
                .with_path(&format!("groups/{}/join_requests/{}", group_id, requester_id))
                .with_value(Value::Null)
                .emit(&mut event_batch);
            event_batch.emit(event_config)?;
        }

        Ok(())
    }
}