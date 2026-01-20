use near_sdk::{
    AccountId, env,
    serde_json::{Value, json},
};

use crate::SocialError;
use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;

impl crate::domain::groups::core::GroupStorage {
    pub fn update_group_stats(
        platform: &mut SocialPlatform,
        group_id: &str,
        stat_updates: &Value,
        actor: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let stats_path = Self::group_stats_path(group_id);

        let mut updated_stats = platform.storage_get(&stats_path).unwrap_or_else(|| {
            json!({
                "total_members": 0,
                "total_join_requests": 0,
                "created_at": env::block_timestamp().to_string(),
                "last_updated": env::block_timestamp().to_string()
            })
        });

        if let Some(updates_obj) = stat_updates.as_object() {
            if let Some(stats_obj) = updated_stats.as_object_mut() {
                for (key, value) in updates_obj {
                    stats_obj.insert(key.clone(), value.clone());
                }
                stats_obj.insert(
                    "last_updated".to_string(),
                    Value::String(env::block_timestamp().to_string()),
                );
            }
        }

        platform.storage_set(&stats_path, &updated_stats)?;

        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "stats_updated",
            actor.clone(),
        )
        .with_field("group_id", group_id)
        .with_path(&stats_path)
        .with_value(updated_stats.clone())
        .emit(event_batch);

        Ok(())
    }

    pub fn update_group_counter(
        platform: &mut SocialPlatform,
        group_id: &str,
        counter_type: &str,
        delta: i64,
        actor: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let current_stats = Self::get_group_stats(platform, group_id).unwrap_or_else(|| {
            json!({
                "total_members": 0,
                "total_join_requests": 0,
                "created_at": env::block_timestamp().to_string(),
                "last_updated": env::block_timestamp().to_string()
            })
        });

        let current_value = current_stats
            .get(counter_type)
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        let new_value = if delta >= 0 {
            let d = u64::try_from(delta).unwrap_or(u64::MAX);
            current_value.saturating_add(d)
        } else {
            let d = delta.unsigned_abs();
            current_value.saturating_sub(d)
        };

        let updates = json!({
            counter_type: new_value
        });

        Self::update_group_stats(platform, group_id, &updates, actor, event_batch)
    }

    pub fn increment_member_count(
        platform: &mut SocialPlatform,
        group_id: &str,
        actor: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        Self::update_group_counter(platform, group_id, "total_members", 1, actor, event_batch)
    }

    pub fn decrement_member_count(
        platform: &mut SocialPlatform,
        group_id: &str,
        actor: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        Self::update_group_counter(platform, group_id, "total_members", -1, actor, event_batch)
    }

    pub fn increment_join_request_count(
        platform: &mut SocialPlatform,
        group_id: &str,
        actor: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        Self::update_group_counter(
            platform,
            group_id,
            "total_join_requests",
            1,
            actor,
            event_batch,
        )
    }

    pub fn decrement_join_request_count(
        platform: &mut SocialPlatform,
        group_id: &str,
        actor: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        Self::update_group_counter(
            platform,
            group_id,
            "total_join_requests",
            -1,
            actor,
            event_batch,
        )
    }
}
