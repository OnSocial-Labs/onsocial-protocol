// --- Simplified Permission System ---
// Ultra-minimal on-chain storage, maximum off-chain flexibility
// Stores only: who has what permission flags for what paths
//
// KEY PRINCIPLES:
// 1. EVERYTHING IS READABLE BY DEFAULT (public blockchain transparency)
// 2. OWNERS ALWAYS HAVE FULL PERMISSIONS (no explicit grants needed)
// 3. Others need explicit permission grants from owners for write/modify actions
// 4. Role definitions and management handled entirely off-chain in UI
// 5. Contract provides only basic permission primitives

use near_sdk::{env, AccountId};
use crate::errors::SocialError;
use crate::state::models::SocialPlatform;
use crate::events::{EventBatch, EventBuilder};

/// Permission flags - compact 1-byte representation using bit flags
/// Note: READ permission removed - everything is readable by default on public blockchains
/// HIERARCHICAL DESIGN: MANAGE includes MODERATE+WRITE, MODERATE includes WRITE
pub const WRITE: u8 = 1 << 0;       // 0b00000001 = 1 (Create/edit content)
pub const MODERATE: u8 = 1 << 1;    // 0b00000010 = 2 (Approve joins, view requests) + WRITE
pub const MANAGE: u8 = 1 << 2;      // 0b00000100 = 4 (Remove members, blacklist users) + MODERATE + WRITE
pub const FULL_ACCESS: u8 = 0xFF;   // 0b11111111 = 255 (all permissions)

/// Build permission key using sharded path format
/// For group paths: groups/{group_id}/permissions/{grantee}/{subpath}
/// For account paths: {account_id}/permissions/{grantee}/{subpath}
/// This leverages the 67M slot sharding system and fixes ownership transfer
/// NOTE: For group paths, owner_or_group_id should be the group_id, not the account owner
fn build_permission_key(owner_or_group_id: &str, grantee: &str, path: &str) -> String {
    if path.starts_with("groups/") {
        // Extract group_id from path
        if let Some(group_id) = extract_group_id_from_path(path) {
            // Get subpath after "groups/{group_id}/"
            let prefix = format!("groups/{}/", group_id);
            let subpath = path.strip_prefix(&prefix).unwrap_or("");
            
            if subpath.is_empty() {
                // Root group permission
                format!("groups/{}/permissions/{}", group_id, grantee)
            } else {
                // Subpath permission
                format!("groups/{}/permissions/{}/{}", group_id, grantee, subpath)
            }
        } else {
            // Fallback for malformed group paths
            format!("{}/permissions/{}", path, grantee)
        }
    } else {
        // Account path: owner_or_group_id is the account_id
        if path.contains('/') {
            // Path with subpath
            let subpath = path.strip_prefix(&format!("{}/", owner_or_group_id))
                .unwrap_or(path);
            format!("{}/permissions/{}/{}", owner_or_group_id, grantee, subpath)
        } else {
            // Root account permission
            format!("{}/permissions/{}", owner_or_group_id, grantee)
        }
    }
}

/// Storage format: Sharded permission paths that leverage the 67M slot sharding system
/// - Group paths: groups/{group_id}/permissions/{grantee}/{subpath} -> {flags}:{expires_at}
/// - Account paths: {account_id}/permissions/{grantee}/{subpath} -> {flags}:{expires_at}
/// Example: groups/company/permissions/bob.near/posts -> 2:0 (MODERATE, includes WRITE hierarchically)
/// This format enables:
/// 1. Automatic sharding (no special cases)
/// 2. Ownership transfer without migration
/// 3. Co-location with group data for cache efficiency
/// 4. Soft delete for audit trail (multiple admins can grant/revoke, history preserved on-chain)
/// Note: READ permission removed - everything is readable by default
/// Note: Permission revocation uses soft delete to enable security audits and compliance
/// Grant permissions to a user for a specific path
/// Raw permission flags only - role definitions handled off-chain
/// 
/// Parameters:
/// - platform: Contract state
/// - granter: The AccountId granting the permission (for events/authorization context)
/// - grantee: Who is receiving the permission
/// - path: The path being granted (e.g., "groups/company/posts")
/// - flags: Permission bit flags
/// - expires_at: Optional expiration timestamp
/// - event_batch: Optional event batch for emission
///
/// Note: For group paths, the permission key uses group_id extracted from the path,
/// not the granter's account ID. This enables ownership transfer without migration.
pub fn grant_permissions(
    platform: &mut SocialPlatform,
    granter: &AccountId,
    grantee: &AccountId,
    path: &str,
    flags: u8,
    expires_at: Option<u64>,
    event_batch: Option<&mut EventBatch>
) -> Result<(), SocialError> {
    // For group paths, extract group_id; for account paths, use granter's account
    let path_identifier = extract_path_owner(platform, path)
        .unwrap_or_else(|| granter.as_str().to_string());
    
    let key = build_permission_key(&path_identifier, grantee.as_str(), path);
    let value = format!("{}:{}", flags, expires_at.unwrap_or(0));
    let _ = platform.storage_write_string(&key, &value);

    // Emit permission grant event (use granter for event author)
    if let Some(batch) = event_batch {
        EventBuilder::new(crate::constants::EVENT_TYPE_PERMISSION_UPDATE, "grant", granter.clone())
            .with_target(grantee)
            .with_path(path)
            .with_field("flags", flags)
            .with_field("expires_at", expires_at.unwrap_or(0))
            .emit(batch);
    } else {
        let mut batch = EventBatch::new();
        EventBuilder::new(crate::constants::EVENT_TYPE_PERMISSION_UPDATE, "grant", granter.clone())
            .with_target(grantee)
            .with_path(path)
            .with_field("flags", flags)
            .with_field("expires_at", expires_at.unwrap_or(0))
            .emit(&mut batch);
        let _ = batch.emit(&None);
    }

    Ok(())
}

/// Revoke all permissions for a user at a specific path
///
/// Uses soft delete to preserve audit trail since multiple admins can grant/revoke permissions.
/// This enables security audits ("who had MANAGE permission during the breach?") and
/// compliance requirements that may need historical access records on blockchain.
///
/// Parameters:
/// - platform: Contract state
/// - revoker: The AccountId revoking the permission (for events/authorization context)
/// - grantee: Who is losing the permission
/// - path: The path being revoked (e.g., "groups/company/posts")
/// - event_batch: Optional event batch for emission
///
/// Note: For group paths, the permission key uses group_id extracted from the path,
/// not the revoker's account ID. This enables ownership transfer without migration.
pub fn revoke_permissions(
    platform: &mut SocialPlatform,
    revoker: &AccountId,
    grantee: &AccountId,
    path: &str,
    event_batch: Option<&mut EventBatch>
) -> Result<(), SocialError> {
    // For group paths, extract group_id; for account paths, use revoker's account
    let path_identifier = extract_path_owner(platform, path)
        .unwrap_or_else(|| revoker.as_str().to_string());
    
    let key = build_permission_key(&path_identifier, grantee.as_str(), path);
    
    // Soft delete to preserve audit trail (multi-admin permission management needs history)
    if let Some(entry) = platform.get_entry(&key) {
        crate::storage::soft_delete_entry(platform, &key, entry)?;
    }

    // Emit permission revoke event (use revoker for event author)
    if let Some(batch) = event_batch {
        EventBuilder::new(crate::constants::EVENT_TYPE_PERMISSION_UPDATE, "revoke", revoker.clone())
            .with_target(grantee)
            .with_path(path)
            .emit(batch);
    } else {
        let mut batch = EventBatch::new();
        EventBuilder::new(crate::constants::EVENT_TYPE_PERMISSION_UPDATE, "revoke", revoker.clone())
            .with_target(grantee)
            .with_path(path)
            .emit(&mut batch);
        let _ = batch.emit(&None);
    }

    Ok(())
}

/// Hierarchical permission check - MANAGE includes MODERATE+WRITE, MODERATE includes WRITE
/// This provides intuitive role-based permissions where higher roles include lower capabilities
fn has_required_permissions(granted_flags: u8, required_flags: u8) -> bool {
    // Check each permission hierarchically
    let has_write = if required_flags & WRITE != 0 {
        // WRITE is satisfied by WRITE, MODERATE, or MANAGE
        granted_flags & (WRITE | MODERATE | MANAGE) != 0
    } else {
        true // Not requiring WRITE
    };
    
    let has_moderate = if required_flags & MODERATE != 0 {
        // MODERATE is satisfied by MODERATE or MANAGE (not just WRITE)
        granted_flags & (MODERATE | MANAGE) != 0
    } else {
        true // Not requiring MODERATE
    };
    
    let has_manage = if required_flags & MANAGE != 0 {
        // MANAGE is only satisfied by MANAGE itself
        granted_flags & MANAGE != 0
    } else {
        true // Not requiring MANAGE
    };
    
    has_write && has_moderate && has_manage
}

/// Check if user has specific permissions at a path
/// Returns true if user has required permissions using hierarchical checking:
/// - MANAGE (4) includes MODERATE + WRITE automatically
/// - MODERATE (2) includes WRITE automatically
/// - WRITE (1) is the base permission
/// OWNERS ALWAYS HAVE FULL PERMISSIONS - no explicit grant needed
/// PATH HIERARCHY: Checks specific path, then parent paths for broader permissions
///
/// Performance optimized: Checks ownership first for fastest common case
///
/// Parameters:
/// - platform: Contract state
/// - owner: For group paths, this is the group_id; for account paths, the account_id
/// - grantee: The user whose permissions are being checked
/// - path: The path to check permissions for
/// - required_flags: The permission flags needed (checked hierarchically)
pub fn has_permissions(
    platform: &SocialPlatform,
    owner: &str,
    grantee: &str,
    path: &str,
    required_flags: u8
) -> bool {
    // Determine if this is a group path (needs special permission handling)
    let is_group_path = path.contains("/groups/") || path.starts_with("groups/");
    
    // OPTIMIZATION: Check ownership FIRST (most common case, fewest storage reads)
    if !is_group_path {
        // Non-group paths: owner always has full permissions
        if grantee == owner {
            return true;
        }
    } else {
        // Group paths: check if grantee is the group owner (1 storage read)
        if let Some(group_id) = extract_group_id_from_path(path) {
            let config_path = format!("groups/{}/config", group_id);
            if let Some(config) = platform.storage_get(&config_path) {
                if let Some(group_owner) = config.get("owner").and_then(|o| o.as_str()) {
                    if grantee == group_owner {
                        return true; // Group owner has full permissions (fast path)
                    }
                }
            }
            
            // MEMBERSHIP CHECK: Only for non-owners, verify member status
            // Permissions are only valid if user is still a member
            let member_path = format!("groups/{}/members/{}", group_id, grantee);
            let is_member = if let Some(entry) = platform.get_entry(&member_path) {
                // Check if member entry exists and is not soft deleted
                matches!(entry.value, crate::state::models::DataValue::Value(_))
            } else {
                false
            };
            
            if !is_member {
                return false; // No permissions if not a member
            }
            
            // Member validation passed, continue to permission hierarchy check
        }
    }

    // Check permission hierarchy: specific path → parent → grandparent → etc.
    let mut current_path = path.to_string();
    loop {
        // Build sharded permission key
        let key = build_permission_key(owner, grantee, &current_path);
        
        if let Some(value_str) = platform.storage_get_string(&key) {
            if let Some((flags, expires_at)) = parse_permission_value(&value_str) {
                if (expires_at == 0 || expires_at > env::block_timestamp()) && has_required_permissions(flags, required_flags) {
                    return true;
                }
            }
        }

        // Also check with trailing slash (for directory permissions)
        let key_with_slash = build_permission_key(owner, grantee, &format!("{}/", current_path));
        
        if let Some(value_str) = platform.storage_get_string(&key_with_slash) {
            if let Some((flags, expires_at)) = parse_permission_value(&value_str) {
                if (expires_at == 0 || expires_at > env::block_timestamp()) && has_required_permissions(flags, required_flags) {
                    return true;
                }
            }
        }

        // Move to parent path - optimize string operations
        if let Some(parent) = get_parent_path(&current_path) {
            current_path = parent;
        } else {
            break; // No more parent paths to check
        }
    }

    // No permissions found in hierarchy
    false
}

/// Get raw permission flags for a user at a path (for UI inspection)
/// OWNERS ALWAYS RETURN FULL_ACCESS (255) - they have all permissions
/// PATH HIERARCHY: Returns the most specific permissions found in hierarchy
pub fn get_user_permissions(
    platform: &SocialPlatform,
    owner: &str,
    grantee: &str,
    path: &str
) -> u8 {
    // OWNERSHIP CHECK: If grantee is the owner, they have full permissions
    if grantee == owner {
        return FULL_ACCESS;
    }

    // Check permission hierarchy: specific path → parent → grandparent → etc.
    let mut current_path = path.to_string();
    loop {
        let key = build_permission_key(owner, grantee, &current_path);
        if let Some(value_str) = platform.storage_get_string(&key) {
            if let Some((flags, expires_at)) = parse_permission_value(&value_str) {
                if expires_at == 0 || expires_at > env::block_timestamp() {
                    return flags; // Return first valid permissions found (most specific)
                }
            }
        }

        // Move to parent path
        if let Some(parent) = get_parent_path(&current_path) {
            current_path = parent;
        } else {
            break; // No more parent paths to check
        }
    }

    0 // No permissions
}

/// Parse permission value: "flags:expires_at"
fn parse_permission_value(value: &str) -> Option<(u8, u64)> {
    let parts: Vec<&str> = value.split(':').collect();
    if parts.len() == 2 {
        if let (Ok(flags), Ok(expires)) = (
            parts[0].parse::<u8>(),
            parts[1].parse::<u64>()
        ) {
            return Some((flags, expires));
        }
    }
    None
}

/// Get the parent path of a given path
/// Examples: "groups/mygroup/events" → "groups/mygroup" → "groups" → None
/// Handles root-level paths correctly for proper permission inheritance
fn get_parent_path(path: &str) -> Option<String> {
    if let Some(last_slash) = path.rfind('/') {
        if last_slash > 0 {
            Some(path[..last_slash].to_string())
        } else {
            // Root level with single segment (like "groups") - no parent
            None
        }
    } else {
        // No slashes, single segment - no parent
        None
    }
}

// --- Convenience Functions for Common Checks ---
// These use the core functions above, can be called directly from contract

pub fn can_write(platform: &SocialPlatform, owner: &str, grantee: &str, path: &str) -> bool {
    has_permissions(platform, owner, grantee, path, WRITE)
}

pub fn can_moderate(platform: &SocialPlatform, owner: &str, grantee: &str, path: &str) -> bool {
    has_permissions(platform, owner, grantee, path, MODERATE)
}

pub fn can_manage(platform: &SocialPlatform, owner: &str, grantee: &str, path: &str) -> bool {
    has_permissions(platform, owner, grantee, path, MANAGE)
}

/// Extract the correct owner/authority for permission checks from a path
/// For account paths: returns the account ID from the path
/// For group paths: returns the group_id (NOT the owner) for permission lookups
/// This change enables ownership transfer without permission migration
pub fn extract_path_owner(platform: &SocialPlatform, path: &str) -> Option<String> {
    if path.starts_with("groups/") {
        // For group paths, return the group_id as the "owner" for permission keys
        // This allows permissions to survive ownership transfer since they're keyed by group_id
        let group_prefix = path.strip_prefix("groups/")?;
        let group_id = group_prefix.split('/').next()?;
        
        // Verify group exists
        let config_path = format!("groups/{}/config", group_id);
        if platform.storage_get(&config_path).is_some() {
            return Some(group_id.to_string());
        }
        None
    } else {
        // For account paths, extract owner from first segment
        path.split('/').next().map(|s| s.to_string())
    }
}

/// Extract group ID from a group path
/// Examples: 
/// - "groups/test_group/config" -> Some("test_group")
/// - "groups/admin_group/members/bob" -> Some("admin_group")
/// - "alice.near/groups/mygroup/posts/123" -> Some("mygroup")
fn extract_group_id_from_path(path: &str) -> Option<&str> {
    // Check for "/groups/" pattern (handles both "groups/" and "user.near/groups/")
    if let Some(groups_idx) = path.find("/groups/") {
        let after_groups = &path[groups_idx + 8..]; // Skip "/groups/"
        if let Some(slash_pos) = after_groups.find('/') {
            Some(&after_groups[..slash_pos])
        } else {
            Some(after_groups)
        }
    } else if let Some(rest) = path.strip_prefix("groups/") {
        // Handle paths starting with "groups/" directly
        if let Some(slash_pos) = rest.find('/') {
            Some(&rest[..slash_pos])
        } else {
            Some(rest)
        }
    } else {
        None
    }
}

// --- Unified Group Joining System ---
// Both public and private groups now use the same permission access building:
//
// UNIFIED WORKFLOW:
// 1. join_group(requested_permissions) - Single entry point for both group types
//    - Public groups (is_private: false): Auto-approve with WRITE permission only (security: prevents self-elevation)
//    - Private groups (is_private: true): Create join request with requested permissions
//
// 2. approve_join_request() - For private groups, uses originally requested permissions
//    - Approvers can still override permissions if needed
//
// PERMISSION BUILDING:
// Both group types use identical permission flags and hierarchical checking:
// - WRITE (1) - Create/edit content
// - MODERATE (2) - Approve joins, view requests (includes WRITE)
// - MANAGE (4) - Remove members, blacklist users (includes MODERATE + WRITE)
//
// Example: User requests MODERATE permission
// - Public group: Only WRITE granted (security: prevents self-elevation to moderator)
// - Private group: Request created with MODERATE, approver can grant it (includes WRITE automatically)