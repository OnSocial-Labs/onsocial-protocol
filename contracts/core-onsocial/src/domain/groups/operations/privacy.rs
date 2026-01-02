use near_sdk::{
    env,
    serde_json::Value,
    AccountId,
};

use crate::events::{EventBatch, EventBuilder};
use crate::domain::groups::config::GroupConfig;
use crate::state::models::SocialPlatform;
use crate::{invalid_input, permission_denied, SocialError};

impl crate::domain::groups::core::GroupStorage {
    pub fn set_group_privacy(
        platform: &mut SocialPlatform,
        group_id: &str,
        owner_id: &AccountId,
        is_private: bool,
    ) -> Result<(), SocialError> {
        // Get config path using helper for consistency
        let config_path = Self::group_config_path(group_id);

        // Verify caller is the owner
        if !Self::is_owner(platform, group_id, owner_id) {
            return Err(permission_denied!("set_group_privacy", &config_path));
        }

        // Get current group config
        let config_data = match platform.storage_get(&config_path) {
            Some(data) => data,
            None => return Err(invalid_input!("Group not found")),
        };

        // Check if this is a member-driven group
        // Check if privacy is actually changing
        let current_privacy = GroupConfig::try_from_value(&config_data)?.is_private.unwrap_or(false);

        if current_privacy == is_private {
            return Err(invalid_input!(
                "Group privacy is already set to the requested value"
            ));
        }

        // Update privacy setting
        let mut config_data = config_data;
        if let Some(obj) = config_data.as_object_mut() {
            obj.insert("is_private".to_string(), Value::Bool(is_private));
            obj.insert(
                "privacy_changed_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            );
            obj.insert(
                "privacy_changed_by".to_string(),
                Value::String(owner_id.to_string()),
            );
        }

        Self::enforce_member_driven_groups_private(&mut config_data)?;

        // Save updated config
        platform.storage_set(&config_path, &config_data)?;

        // Emit event
        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "privacy_changed",
            owner_id.clone(),
        )
        .with_path(&config_path)
        .with_field("group_id", group_id)
        .with_field("is_private", is_private)
        .with_field("changed_at", env::block_timestamp().to_string())
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
