// --- Imports ---
use near_sdk::AccountId;

use crate::events::EventBatch;
use crate::state::models::SocialPlatform;
use crate::{SocialError};

// --- Impl ---
impl SocialPlatform {
    /// Set permission for a path (grant or revoke in one call)
    /// Automatically detects permission type:
    /// - Paths with "/" are treated as directory permissions
    /// - Account IDs (alice.near) are treated as account-level directory permissions
    /// - Other paths are treated as exact permissions
    ///   permission_flags = 0 means revoke, > 0 means grant
    pub fn set_permission(
        &mut self,
        grantee: AccountId,
        path: String,
        permission_flags: u8,
        expires_at: Option<u64>,
        caller: &AccountId,
        event_batch: Option<&mut EventBatch>,
    ) -> Result<(), SocialError> {
        // Validate contract is in Live status for write operations
        self.validate_state(false)?;

        // Extract path identifier for permission storage
        // For groups: returns group_id, for accounts: returns account_id
        let path_identifier = crate::groups::kv_permissions::extract_path_owner(self, &path)
            .unwrap_or_else(|| caller.as_str().to_string());

        // Check authorization based on path type
        let is_authorized = if path.starts_with("groups/") {
            // For group paths, check if caller is the actual group owner
            if let Some(group_id) = path.strip_prefix("groups/").and_then(|s| s.split('/').next()) {
                let config_path = format!("groups/{}/config", group_id);
                if let Some(config) = self.storage_get(&config_path) {
                    if let Some(owner) = config.get("owner").and_then(|o| o.as_str()) {
                        owner == caller.as_str()
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            // For account paths, caller must be the account owner
            path_identifier == caller.as_str()
        };

        let is_manage_delegation = path.starts_with("groups/") &&
            crate::groups::kv_permissions::can_manage(self, &path_identifier, caller.as_str(), &path) &&
            permission_flags != crate::groups::kv_permissions::MANAGE;

        if !is_authorized && !is_manage_delegation {
            return Err(crate::unauthorized!("set_permission", &format!("path_owner={}, caller={}", path_identifier, caller.as_str())));
        }

        // Smart path type detection (avoid borrow checker issues)
        let is_directory = path.contains('/') || AccountId::try_from(path.clone()).is_ok();

        if is_directory {
            if permission_flags == 0 {
                // Revoke directory permission
                crate::groups::kv_permissions::revoke_permissions(
                    self,
                    caller,
                    &grantee,
                    &path,
                    event_batch
                )?;
            } else {
                // Grant directory permission
                crate::groups::kv_permissions::grant_permissions(
                    self,
                    caller,
                    &grantee,
                    &path,
                    permission_flags,
                    expires_at,
                    event_batch
                )?;
            }
        } else {
            // Exact path permission
            if permission_flags == 0 {
                // Revoke permission
                crate::groups::kv_permissions::revoke_permissions(
                    self,
                    caller,
                    &grantee,
                    &path,
                    event_batch
                )?;
            } else {
                // Grant permission
                crate::groups::kv_permissions::grant_permissions(
                    self,
                    caller,
                    &grantee,
                    &path,
                    permission_flags,
                    expires_at,
                    event_batch
                )?;
            }
        }
        Ok(())
    }
}