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
        caller_id: &AccountId,
        is_private: bool,
    ) -> Result<(), SocialError> {
        let config_path = Self::group_config_path(group_id);

        if !Self::is_owner(platform, group_id, caller_id) {
            return Err(permission_denied!("set_group_privacy", &config_path));
        }

        let config_data = match platform.storage_get(&config_path) {
            Some(data) => data,
            None => return Err(invalid_input!("Group not found")),
        };

        let cfg = GroupConfig::try_from_value(&config_data)?;
        let current_privacy = cfg.is_private.unwrap_or(false);

        if current_privacy == is_private {
            return Err(invalid_input!(
                "Group privacy is already set to the requested value"
            ));
        }

        Self::assert_member_driven_private_invariant(cfg.member_driven, Some(is_private))?;

        let mut config_data = config_data;
        let obj = config_data.as_object_mut()
            .ok_or_else(|| invalid_input!("Group config must be a JSON object"))?;
        obj.insert("is_private".to_string(), Value::Bool(is_private));
        obj.insert(
            "privacy_changed_at".to_string(),
            Value::String(env::block_timestamp().to_string()),
        );
        obj.insert(
            "privacy_changed_by".to_string(),
            Value::String(caller_id.to_string()),
        );

        platform.storage_set(&config_path, &config_data)?;

        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "privacy_changed",
            caller_id.clone(),
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
