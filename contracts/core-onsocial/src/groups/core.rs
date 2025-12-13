// --- Group Storage ---
// KV-based group operations with simple key paths

use near_sdk::{AccountId, serde_json::Value};
use crate::state::models::SocialPlatform;

/// Group storage operations using KV with simple keys
pub struct GroupStorage;

impl GroupStorage {
    /// Helper function to create group config path (optimization: reduce string allocations)
    pub fn group_config_path(group_id: &str) -> String {
        format!("groups/{}/config", group_id)
    }

    /// Helper function to create member path (optimization: reduce string allocations)
    pub fn group_member_path(group_id: &str, member_id: &str) -> String {
        format!("groups/{}/members/{}", group_id, member_id)
    }

    /// Helper function to create stats path (optimization: reduce string allocations)
    pub fn group_stats_path(group_id: &str) -> String {
        format!("groups/{}/stats", group_id)
    }

    /// Check if a group is member-driven (pure democracy) - optimized to avoid clone
    pub fn is_member_driven_group(platform: &SocialPlatform, group_id: &str) -> bool {
        Self::get_group_config(platform, group_id)
            .and_then(|config| config.get("member_driven").cloned())
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    }
}

impl GroupStorage {
    /// Check if group requires approval for joining (private group) - optimized
    pub fn is_private_group(platform: &SocialPlatform, group_id: &str) -> bool {
        let config_path = Self::group_config_path(group_id);

        if let Some(config_data) = platform.storage_get(&config_path) {
            if let Some(is_private) = config_data.get("is_private").and_then(|v| v.as_bool()) {
                return is_private;
            }
        }

        false // Default to public (no approval required)
    }

    /// Get group config (optimized path creation)
    pub fn get_group_config(platform: &SocialPlatform, group_id: &str) -> Option<Value> {
        let config_path = Self::group_config_path(group_id);
        platform.storage_get(&config_path)
    }

    /// Get member data
    pub fn get_member_data(platform: &SocialPlatform, group_id: &str, member_id: &AccountId) -> Option<Value> {
        let member_path = Self::group_member_path(group_id, member_id.as_str());
        platform.storage_get(&member_path)
    }

    /// Get join request data
    pub fn get_join_request(platform: &SocialPlatform, group_id: &str, requester_id: &AccountId) -> Option<Value> {
        let request_path = format!("groups/{}/join_requests/{}", group_id, requester_id);
        platform.storage_get(&request_path)
    }

    /// Get group statistics (member counts, etc.)
    pub fn get_group_stats(platform: &SocialPlatform, group_id: &str) -> Option<Value> {
        let stats_path = Self::group_stats_path(group_id);
        platform.storage_get(&stats_path)
    }
}