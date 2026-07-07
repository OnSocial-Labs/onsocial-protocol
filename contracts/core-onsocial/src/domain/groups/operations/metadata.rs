use near_sdk::{AccountId, env, serde_json::Value};

use crate::domain::groups::config::GroupConfig;
use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::{SocialError, invalid_input, permission_denied};

const RESERVED_METADATA_KEYS: &[&str] = &["owner", "update_type", "changes", "member_driven"];

impl crate::domain::groups::core::GroupStorage {
    pub fn update_group_metadata(
        platform: &mut SocialPlatform,
        group_id: &str,
        caller_id: &AccountId,
        changes: Value,
    ) -> Result<(), SocialError> {
        let config_path = Self::group_config_path(group_id);

        if !Self::is_owner(platform, group_id, caller_id) {
            return Err(permission_denied!("update_group_metadata", &config_path));
        }

        let config_data = platform
            .storage_get(&config_path)
            .ok_or_else(|| invalid_input!("Group not found"))?;

        let cfg = GroupConfig::try_from_value(&config_data)?;
        if cfg.member_driven {
            return Err(invalid_input!(
                "Member-driven groups must update metadata through proposals"
            ));
        }

        let changes_obj = changes
            .as_object()
            .ok_or_else(|| invalid_input!("Metadata changes must be a JSON object"))?;
        if changes_obj.is_empty() {
            return Err(invalid_input!("Metadata changes cannot be empty"));
        }

        let mut config_data = config_data;
        {
            let config_obj = config_data
                .as_object_mut()
                .ok_or_else(|| invalid_input!("Group config must be a JSON object"))?;

            for (key, value) in changes_obj {
                if RESERVED_METADATA_KEYS.contains(&key.as_str()) {
                    return Err(invalid_input!(format!(
                        "Cannot update reserved metadata field `{key}`"
                    )));
                }
                config_obj.insert(key.clone(), value.clone());
            }
        }

        let updated_cfg = GroupConfig::try_from_value(&config_data)?;
        Self::assert_member_driven_private_invariant(
            updated_cfg.member_driven,
            updated_cfg.is_private,
        )?;

        let config_obj = config_data
            .as_object_mut()
            .ok_or_else(|| invalid_input!("Group config must be a JSON object"))?;
        config_obj.insert(
            "metadata_updated_at".to_string(),
            Value::String(env::block_timestamp().to_string()),
        );
        config_obj.insert(
            "metadata_updated_by".to_string(),
            Value::String(caller_id.to_string()),
        );

        platform.storage_set(&config_path, &config_data)?;

        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "metadata_updated",
            caller_id.clone(),
        )
        .with_path(&config_path)
        .with_value(config_data.clone())
        .with_structured_data(config_data)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
