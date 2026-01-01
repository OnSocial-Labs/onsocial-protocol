use crate::state::models::SocialPlatform;
use near_sdk::{serde_json::Value, AccountId};

pub struct GroupStorage;

impl GroupStorage {
    #[inline]
    pub fn group_config_path(group_id: &str) -> String {
        format!("groups/{}/config", group_id)
    }

    #[inline]
    pub fn group_member_path(group_id: &str, member_id: &str) -> String {
        format!("groups/{}/members/{}", group_id, member_id)
    }

    #[inline]
    pub fn group_stats_path(group_id: &str) -> String {
        format!("groups/{}/stats", group_id)
    }

    #[inline]
    fn group_join_request_path(group_id: &str, requester_id: &AccountId) -> String {
        format!("groups/{}/join_requests/{}", group_id, requester_id.as_str())
    }

    #[inline]
    pub fn get_group_config(platform: &SocialPlatform, group_id: &str) -> Option<Value> {
        let config_path = Self::group_config_path(group_id);
        platform.storage_get(&config_path)
    }

    #[inline]
    pub fn get_member_data(
        platform: &SocialPlatform,
        group_id: &str,
        member_id: &AccountId,
    ) -> Option<Value> {
        let member_path = Self::group_member_path(group_id, member_id.as_str());
        platform.storage_get(&member_path)
    }

    #[inline]
    pub fn get_join_request(
        platform: &SocialPlatform,
        group_id: &str,
        requester_id: &AccountId,
    ) -> Option<Value> {
        let request_path = Self::group_join_request_path(group_id, requester_id);
        platform.storage_get(&request_path)
    }

    #[inline]
    pub fn get_group_stats(platform: &SocialPlatform, group_id: &str) -> Option<Value> {
        let stats_path = Self::group_stats_path(group_id);
        platform.storage_get(&stats_path)
    }
}